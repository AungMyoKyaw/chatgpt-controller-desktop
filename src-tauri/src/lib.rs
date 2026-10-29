use chatgpt_controller_native::api;
use rand::RngCore;
use reqwest::Client;
use serde::Serialize;
use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, State};

mod webkit;

const API_URL: &str = "http://127.0.0.1:8791";
const BROWSER_SESSION: &str = "chatgpt-controller";
struct ControllerState {
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
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
    embedded_browser_available: bool,
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
async fn health(client: &Client) -> Option<Value> {
    let response = client.get(format!("{API_URL}/health")).send().await.ok()?;
    if response.status().is_success() {
        response.json::<Value>().await.ok()
    } else {
        None
    }
}
fn owned_running(state: &ControllerState) -> bool {
    state
        .task
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|task| !task.is_finished()))
        .unwrap_or(false)
}

#[tauri::command]
async fn get_status(
    app: tauri::AppHandle,
    state: State<'_, ControllerState>,
) -> Result<Status, String> {
    let api = health(&state.http).await;
    let busy = api
        .as_ref()
        .and_then(|v| v.get("busy"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let running = owned_running(&state);
    let browser_open = webkit::browser_open(&app);
    let browser_authenticated = webkit::authenticated(&app).await;
    Ok(Status {
        api_online: api.is_some(),
        api_busy: busy,
        owned_process: running,
        browser_open,
        browser_authenticated,
        embedded_browser_available: browser_open,
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
async fn launch_login(app: tauri::AppHandle) -> Result<String, String> {
    webkit::show_login(&app)
}

#[tauri::command]
async fn start_api(
    app: tauri::AppHandle,
    state: State<'_, ControllerState>,
) -> Result<String, String> {
    if health(&state.http).await.is_some() {
        return Ok("Local API is already running on port 8791.".into());
    }
    webkit::install(&app)?;
    let key = ensure_key()?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8791")
        .await
        .map_err(|e| format!("Cannot bind localhost controller: {e}"))?;
    let mut guard = state
        .task
        .lock()
        .map_err(|_| "Controller manager unavailable")?;
    if guard.as_ref().is_some_and(|t| !t.is_finished()) {
        return Ok("Native controller startup is already in progress.".into());
    }
    let router = api::router(Arc::new(api::Server::new(key, BROWSER_SESSION.to_owned())));
    *guard = Some(tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, router).await {
            eprintln!("Local controller stopped: {err}");
        }
    }));
    Ok("Embedded Rust controller started. No Chrome or Playwright process required.".into())
}

#[tauri::command]
fn stop_api(state: State<'_, ControllerState>) -> Result<String, String> {
    let mut guard = state
        .task
        .lock()
        .map_err(|_| "Controller manager unavailable")?;
    if let Some(task) = guard.take() {
        task.abort();
        Ok("Embedded Rust controller stopped. ChatGPT session remains available.".into())
    } else {
        Err("This application did not start the active localhost controller.".into())
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
        .setup(|app| {
            if std::env::var("CHATGPT_CONTROLLER_TEST_AUTOSTART").as_deref() == Ok("1") {
                webkit::install(app.handle()).map_err(std::io::Error::other)?;
                let key = ensure_key().map_err(std::io::Error::other)?;
                let state = app.state::<ControllerState>();
                let task = tauri::async_runtime::handle().inner().spawn(async move {
                    match tokio::net::TcpListener::bind("127.0.0.1:8791").await {
                        Ok(listener) => {
                            let router = api::router(Arc::new(api::Server::new(
                                key,
                                BROWSER_SESSION.to_owned(),
                            )));
                            if let Err(error) = axum::serve(listener, router).await {
                                eprintln!("Controller stopped: {error}");
                            }
                        }
                        Err(error) => eprintln!("Controller binding failed: {error}"),
                    }
                });
                *state
                    .task
                    .lock()
                    .map_err(|_| std::io::Error::other("Controller state unavailable"))? =
                    Some(task);
            }
            Ok(())
        })
        .manage(ControllerState {
            task: Mutex::new(None),
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
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "chatgpt-session" {
                    api.prevent_close();
                    let _ = window.hide();
                } else if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("Failed to build ChatGPT Controller")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<ControllerState>() {
                    if let Ok(mut guard) = state.task.lock() {
                        if let Some(task) = guard.take() {
                            task.abort();
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
}
