use chatgpt_controller_native::browser::{self, WebkitJob};
use serde_json::{Value, json};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::mpsc;
use uuid::Uuid;

const LABEL: &str = "chatgpt-session";
const HOME: &str = "https://chatgpt.com/";

static INSTALL_LOCK: Mutex<()> = Mutex::new(());

pub fn install(app: &AppHandle) -> Result<(), String> {
    let _guard = INSTALL_LOCK
        .lock()
        .map_err(|_| "WebKit initializer failed")?;
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(
        app,
        LABEL,
        WebviewUrl::External(HOME.parse().map_err(|e| format!("{e}"))?),
    )
    .title("ChatGPT Sign In")
    .inner_size(1060.0, 780.0)
    .visible(std::env::var("CHATGPT_CONTROLLER_TEST_AUTOSTART").as_deref() == Ok("1"))
    .build()
    .map_err(|e| format!("Cannot create ChatGPT WebKit session: {e}"))?;

    let (sender, mut receiver) = mpsc::unbounded_channel::<WebkitJob>();
    if !browser::install_webkit_executor(sender) {
        return Err("WebKit executor was already registered".to_owned());
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(job) = receiver.recv().await {
            let handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let result = execute(&handle, &job).await;
                let _ = job.reply.send(result);
            });
        }
    });
    Ok(())
}

pub fn show_login(app: &AppHandle) -> Result<String, String> {
    install(app)?;
    let window = app
        .get_webview_window(LABEL)
        .ok_or("Embedded ChatGPT window is unavailable")?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok("Embedded ChatGPT WebKit opened. Sign in directly on chatgpt.com.".to_owned())
}

pub fn browser_open(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL).is_some()
}

pub async fn authenticated(app: &AppHandle) -> bool {
    let Some(window) = app.get_webview_window(LABEL) else {
        return false;
    };
    let Ok(url) = window.url() else {
        return false;
    };
    if url.host_str() != Some("chatgpt.com") {
        return false;
    }
    let js = r#"window.location.hostname === 'chatgpt.com' && !!document.querySelector('button[aria-label="Open profile menu"]')"#;
    let Ok(raw) = evaluate(&window, js).await else {
        return false;
    };
    raw.trim() == "true" || serde_json::from_str::<Value>(&raw).ok() == Some(json!(true))
}

async fn evaluate(window: &WebviewWindow, js: &str) -> Result<String, String> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    window
        .eval_with_callback(js, move |value| {
            let _ = tx.send(value);
        })
        .map_err(|e| format!("WebKit evaluation failed: {e}"))?;
    tokio::time::timeout(Duration::from_secs(5), rx.recv())
        .await
        .map_err(|_| "WebKit callback timeout".to_owned())?
        .ok_or_else(|| "WebKit callback closed".to_owned())
}

// The browser executes on chatgpt.com; its session tokens never leave that page.
// This module does not enable remote-origin Tauri IPC permissions.
async fn execute(app: &AppHandle, job: &WebkitJob) -> browser::Result<Value> {
    let window = app
        .get_webview_window(LABEL)
        .ok_or_else(|| browser::error(503, "ChatGPT WebKit window unavailable"))?;
    if let Some(path) = &job.target_path {
        if !path.starts_with('/') || path.starts_with("//") {
            return Err(browser::error(400, "Invalid conversation path"));
        }
        let url = format!("https://chatgpt.com{path}");
        let target = url
            .parse()
            .map_err(|_| browser::error(400, "Invalid URL"))?;
        if window
            .url()
            .ok()
            .map(|url| url.to_string().trim_end_matches('/').to_owned())
            != Some(url.trim_end_matches('/').to_owned())
        {
            window
                .navigate(target)
                .map_err(|_| browser::error(503, "WebKit navigation failed"))?;
            let started = Instant::now();
            while started.elapsed() < Duration::from_secs(20) {
                tokio::time::sleep(Duration::from_millis(150)).await;
                if window.url().ok().is_some_and(|u| u.path() == path) {
                    break;
                }
            }
            // The document may have navigated, but the chat composer must still render.
            tokio::time::sleep(Duration::from_millis(450)).await;
        }
    }
    let url = window
        .url()
        .map_err(|_| browser::error(503, "WebKit URL unavailable"))?;
    if url.host_str() != Some("chatgpt.com") || url.scheme() != "https" {
        return Err(browser::error(
            401,
            "Sign in using the ChatGPT WebKit window",
        ));
    }

    let ready = evaluate(&window, "document.readyState")
        .await
        .map_err(|_| {
            browser::error(
                503,
                "ChatGPT WebKit is not executing JavaScript; open the sign-in window",
            )
        })?;
    if ready.contains("loading") {
        return Err(browser::error(503, "ChatGPT WebKit page is loading"));
    }
    let id = Uuid::new_v4().simple().to_string();
    let key = serde_json::to_string(&id).unwrap();
    let js = format!(
        "(function(){{window.__ccJobResults=window.__ccJobResults||Object.create(null);Promise.resolve().then(()=>({})()).then(value=>{{window.__ccJobResults[{}]={{ok:true,result:value}}}},e=>{{window.__ccJobResults[{}]={{ok:false,error:String(e)}}}})}})();",
        job.javascript, key, key
    );
    window
        .eval(&js)
        .map_err(|e| browser::error(502, format!("WebKit script failed: {e}")))?;
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(117) {
        let probe = format!(
            "JSON.stringify(window.__ccJobResults && window.__ccJobResults[{key}] || null)"
        );
        if let Ok(raw) = evaluate(&window, &probe).await {
            if let Some(record) = parse_callback(&raw) {
                let _ = window.eval(format!("delete window.__ccJobResults[{key}]"));
                if record.get("ok").and_then(Value::as_bool) == Some(true) {
                    return Ok(record.get("result").cloned().unwrap_or(Value::Null));
                }
                let reason = record
                    .get("error")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
                    .unwrap_or_else(|| {
                        let keys = record
                            .as_object()
                            .map(|v| v.keys().map(String::as_str).collect::<Vec<_>>())
                            .unwrap_or_default();
                        format!(
                            "WebKit {} returned unexpected callback fields: {keys:?}",
                            job.operation
                        )
                    });
                return Err(browser::error(502, reason));
            }
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
    Err(browser::error(504, "Embedded WebKit script timed out"))
}

fn parse_callback(raw: &str) -> Option<Value> {
    let mut parsed: Value = serde_json::from_str(raw).ok()?;
    // WebKit and the Tauri runtime may serialize the JSON result multiple
    // times. Unwrap bounded nested JSON strings, rejecting unknown shapes.
    for _ in 0..4 {
        match parsed {
            Value::Null => return None,
            Value::String(ref s) => parsed = serde_json::from_str(s).ok()?,
            value @ Value::Object(_) => return Some(value),
            _ => return None,
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn callback_decoding() {
        assert!(parse_callback("null").is_none());
        assert_eq!(
            parse_callback(r#"{"ok":true,"result":42}"#).unwrap()["result"],
            42
        );
        let encoded_once = serde_json::to_string(r#"{"ok":true,"result":42}"#).unwrap();
        let encoded_twice = serde_json::to_string(&encoded_once).unwrap();
        assert_eq!(parse_callback(&encoded_once).unwrap()["result"], 42);
        assert_eq!(parse_callback(&encoded_twice).unwrap()["result"], 42);
    }
}
