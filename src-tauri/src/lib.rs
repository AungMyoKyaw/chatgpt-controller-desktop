use rand::RngCore;
use reqwest::Client;
use serde::Serialize;
use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State};

const API_URL: &str = "http://127.0.0.1:8791";
const BROWSER_SESSION: &str = "chatgpt-controller";
struct ControllerState {
    child: Mutex<Option<Child>>,
    http: Client,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    api_online: bool,
    api_busy: bool,
    owned_process: bool,
    browser_open: bool,
    browser_authenticated: bool,
    playwright_installed: bool,
    api_url: &'static str,
    key_available: bool,
    note: String,
}
fn home() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or("HOME is unavailable".into())
}
fn config_dir() -> Result<PathBuf, String> {
    Ok(home()?.join(".config/chatgpt-browser-controller"))
}
fn key_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("bridge.key"))
}
fn browser_profile() -> Result<PathBuf, String> {
    Ok(home()?.join(".playwright-cli/chatgpt-controller-profile"))
}
fn ensure_key() -> Result<String, String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Cannot create local key directory: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    let file = key_path()?;
    if !file.exists() {
        let mut bytes = [0u8; 32];
        rand::rng().fill_bytes(&mut bytes);
        let key: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            let mut writer = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(&file)
                .map_err(|e| format!("Cannot create controller key: {e}"))?;
            writer
                .write_all(key.as_bytes())
                .map_err(|e| e.to_string())?;
        }
        #[cfg(not(unix))]
        {
            fs::write(&file, &key).map_err(|e| e.to_string())?;
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&file, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    let value = fs::read_to_string(&file).map_err(|e| e.to_string())?;
    let trimmed = value.trim().to_owned();
    if trimmed.len() < 32 || !trimmed.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Local controller key is invalid".into());
    }
    Ok(trimmed)
}
fn cli_path() -> Option<PathBuf> {
    let home = home().ok()?;
    let candidates = [
        home.join(".bun/bin/playwright-cli"),
        home.join(".local/bin/playwright-cli"),
        home.join(".local/share/mise/shims/playwright-cli"),
        PathBuf::from("/opt/homebrew/bin/playwright-cli"),
        PathBuf::from("/usr/local/bin/playwright-cli"),
    ];
    candidates.into_iter().find(|p| p.is_file()).or_else(|| {
        std::env::var_os("PATH").and_then(|p| {
            std::env::split_paths(&p)
                .map(|d| d.join("playwright-cli"))
                .find(|f| f.is_file())
        })
    })
}
fn expanded_path() -> String {
    let mut dirs = vec![];
    if let Ok(h) = home() {
        for p in [".bun/bin", ".local/bin", ".local/share/mise/shims"] {
            dirs.push(h.join(p).display().to_string());
        }
    }
    dirs.push("/opt/homebrew/bin".into());
    dirs.push("/usr/local/bin".into());
    dirs.push("/usr/bin".into());
    dirs.push("/bin".into());
    dirs.push(std::env::var("PATH").unwrap_or_default());
    dirs.join(":")
}
fn cli_output(args: &[&str]) -> Result<String, String> {
    let cli = cli_path().ok_or(
        "Playwright CLI is not installed. Install it and restart the controller.".to_owned(),
    )?;
    let result = Command::new(cli)
        .args(args)
        .env("PATH", expanded_path())
        .output()
        .map_err(|_| "Could not launch Playwright CLI".to_owned())?;
    if !result.status.success() {
        return Err(
            "Playwright CLI could not complete the operation; check the browser window.".into(),
        );
    }
    Ok(String::from_utf8_lossy(&result.stdout).to_string())
}
fn browser_state() -> (bool, bool) {
    // One lightweight background session check. Do not snapshot the full page
    // (which is expensive and can accidentally inspect user content).
    let code = r#"async(page)=>{try{
      const r=await page.context().request.get("https://chatgpt.com/api/auth/session",{timeout:5000});
      if(!r.ok())return {authenticated:false};
      const session=await r.json();
      return {authenticated:typeof session.accessToken==="string"};
    }catch{return {authenticated:false}}}"#;
    let result = match cli_output(&[&format!("-s={BROWSER_SESSION}"), "run-code", code]) {
        Ok(s) => s,
        Err(_) => return (false, false),
    };
    let parsed = result
        .split("### Result\n")
        .nth(1)
        .and_then(|tail| tail.lines().next())
        .and_then(|line| serde_json::from_str::<Value>(line).ok());
    let authenticated = parsed
        .as_ref()
        .and_then(|value| value.get("authenticated"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    (true, authenticated)
}
async fn health(client: &Client) -> Option<Value> {
    let response = client.get(format!("{API_URL}/health")).send().await.ok()?;
    if response.status().is_success() {
        response.json::<Value>().await.ok()
    } else {
        None
    }
}
fn owned_running(state: &ControllerState) -> bool {
    let mut guard = match state.child.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    match guard.as_mut() {
        Some(child) => match child.try_wait() {
            Ok(None) => true,
            _ => {
                *guard = None;
                false
            }
        },
        None => false,
    }
}
#[tauri::command]
async fn get_status(state: State<'_, ControllerState>) -> Result<Status, String> {
    let api = health(&state.http).await;
    let busy = api
        .as_ref()
        .and_then(|v| v.get("busy"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let running = owned_running(&state);
    let (browser_open, browser_authenticated) = tauri::async_runtime::spawn_blocking(browser_state)
        .await
        .unwrap_or((false, false));
    Ok(Status {
        api_online: api.is_some(),
        api_busy: busy,
        owned_process: running,
        browser_open,
        browser_authenticated,
        playwright_installed: cli_path().is_some(),
        api_url: API_URL,
        key_available: key_path()?.is_file(),
        note: if api.is_some() && !running {
            "An existing local API server is available. It was not started by this app.".into()
        } else {
            "".into()
        },
    })
}
#[tauri::command]
async fn launch_login() -> Result<String, String> {
    let profile = browser_profile()?;
    fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
    let existing = tauri::async_runtime::spawn_blocking(|| {
        cli_output(&["list"])
            .unwrap_or_default()
            .contains(&format!("- {BROWSER_SESSION}:"))
    })
    .await
    .unwrap_or(false);
    if existing {
        return Ok("Your dedicated Chrome browser is already open. Complete sign-in there.".into());
    }
    let output = tauri::async_runtime::spawn_blocking(move || {
        let profile_arg = format!("--profile={}", profile.display());
        cli_output(&[
            &format!("-s={BROWSER_SESSION}"),
            "open",
            "https://chatgpt.com",
            "--browser=chrome",
            "--headed",
            "--persistent",
            &profile_arg,
        ])
    })
    .await
    .map_err(|_| "Browser launch could not complete".to_owned())??;
    let _ = output; // Never forward a browser snapshot or potentially sensitive page contents to frontend.
    Ok("Dedicated Chrome opened. Sign in directly in that browser window.".into())
}
fn find_sidecar(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .resolve("bin/controller", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    if path.is_file() {
        return Ok(path);
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin/controller");
    if dev.is_file() {
        return Ok(dev);
    }
    Err("Bundled controller executable is missing; rebuild the app.".into())
}
#[tauri::command]
async fn start_api(
    app: tauri::AppHandle,
    state: State<'_, ControllerState>,
) -> Result<String, String> {
    if health(&state.http).await.is_some() {
        return Ok(
            "Local API is already running on port 8791. The app will use the existing server."
                .into(),
        );
    }
    let key = ensure_key()?;
    let binary = find_sidecar(&app)?;
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "Process manager is unavailable")?;
    if let Some(child) = guard.as_mut() {
        if child.try_wait().ok().flatten().is_none() {
            return Ok("Controller startup is already in progress.".into());
        }
    }
    let log_path = config_dir()?.join("controller.log");
    let output = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;
    let child = Command::new(binary)
        .env("PATH", expanded_path())
        .env("CHATGPT_BRIDGE_KEY", key)
        .env("CHATGPT_BROWSER_SESSION", BROWSER_SESSION)
        .env("CHATGPT_BRIDGE_PORT", "8791")
        .env(
            "CHATGPT_CONTROLLER_PARENT_PID",
            std::process::id().to_string(),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::from(output))
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Failed to start bundled local controller".to_owned())?;
    *guard = Some(child);
    Ok("Controller process launched. Check connection status shortly.".into())
}
#[tauri::command]
fn stop_api(state: State<'_, ControllerState>) -> Result<String, String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "Process manager unavailable")?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok("Controller stopped. Browser remains open and signed in.".into())
    } else {
        Err("This app did not start the active controller. External processes will not be terminated.".into())
    }
}
#[tauri::command]
fn export_key() -> Result<String, String> {
    ensure_key()
}
#[tauri::command]
async fn api_probe(state: State<'_, ControllerState>) -> Result<Value, String> {
    let key = ensure_key()?;
    let response = state
        .http
        .get(format!("{API_URL}/v1/conversations?limit=5"))
        .header("X-Bridge-Key", key)
        .send()
        .await
        .map_err(|_| "Controller is offline; start it first.".to_owned())?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|_| "Unexpected controller response".to_owned())?;
    if !status.is_success() {
        return Err(format!(
            "HTTP {}: {}",
            status.as_u16(),
            body.get("error")
                .and_then(Value::as_str)
                .unwrap_or("Controller API error")
        ));
    }
    Ok(json!({
        "ok":true,
        "visibleConversations":body.get("conversations").and_then(Value::as_array).map(|a|a.len()).unwrap_or(0),
        "scope":"loaded-sidebar-only"
    }))
}
#[tauri::command]
async fn api_chat(state: State<'_, ControllerState>, prompt: String) -> Result<Value, String> {
    if prompt.trim().is_empty() || prompt.len() > 12000 {
        return Err("Prompt must contain 1-12,000 characters".into());
    }
    let key = ensure_key()?;
    let response = state
        .http
        .post(format!("{API_URL}/v1/chat"))
        .header("X-Bridge-Key", key)
        .json(&json!({"prompt":prompt}))
        .send()
        .await
        .map_err(|_| "Controller did not respond".to_owned())?;
    let status = response.status();
    let body = response
        .json::<Value>()
        .await
        .map_err(|_| "Invalid controller response".to_owned())?;
    if !status.is_success() {
        return Err(format!(
            "HTTP {}: {}",
            status.as_u16(),
            body.get("error")
                .and_then(Value::as_str)
                .unwrap_or("Chat request failed")
        ));
    }
    Ok(body)
}
pub fn run() {
    let client = Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(140))
        .build()
        .expect("Failed to initialize HTTP client");
    tauri::Builder::default()
        .manage(ControllerState {
            child: Mutex::new(None),
            http: client,
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            launch_login,
            start_api,
            stop_api,
            export_key,
            api_probe,
            api_chat
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<ControllerState>() {
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Failed to build ChatGPT Controller")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ControllerState>() {
                    if let Ok(mut guard) = state.child.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn names_and_paths() {
        assert_eq!(API_URL, "http://127.0.0.1:8791");
        assert_eq!(BROWSER_SESSION, "chatgpt-controller");
    }
    #[test]
    fn has_supported_browser_profile() {
        assert!(
            browser_profile()
                .unwrap()
                .to_string_lossy()
                .contains("chatgpt-controller-profile")
        );
    }
}
