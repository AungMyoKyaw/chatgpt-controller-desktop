use reqwest::{Client, Method, StatusCode};
use serde_json::{json, Value};
use std::{path::PathBuf, time::Duration};
use tauri::State;

struct RelayState {
    client: Client,
}

fn key_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or("Home directory is unavailable")?;
    Ok(PathBuf::from(home)
        .join(".config")
        .join("chatgpt-browser-controller")
        .join("bridge.key"))
}

fn valid_id(id: &str) -> bool {
    let parts: Vec<&str> = id.split('-').collect();
    parts.len() == 5
        && [8, 4, 4, 4, 12].into_iter().zip(parts).all(|(expected, part)| {
            part.len() == expected && part.bytes().all(|c| c.is_ascii_hexdigit())
        })
}

#[tauri::command]
async fn bridge_call(
    state: State<'_, RelayState>,
    operation: String,
    id: Option<String>,
    prompt: Option<String>,
    title: Option<String>,
    confirm: Option<bool>,
) -> Result<Value, String> {
    let root = "http://127.0.0.1:8791";
    let (method, endpoint, payload) = match operation.as_str() {
        "health" => (Method::GET, "/health".to_owned(), None),
        "list" => (Method::GET, "/v1/conversations?limit=80".to_owned(), None),
        "send" => {
            let content = prompt.unwrap_or_default();
            if content.trim().is_empty() || content.len() > 16000 {
                return Err("Enter a message (up to 16,000 characters).".into());
            }
            let conversation_path = match id.as_ref() {
                Some(chat_id) if valid_id(chat_id) =>
                    Some(format!("/c/{chat_id}")),
                Some(_) => return Err("Invalid conversation ID".into()),
                None => None
            };
            let body = match conversation_path {
                Some(path) => json!({ "prompt": content, "conversation_path": path }),
                None => json!({ "prompt": content }),
            };
            (Method::POST, "/v1/chat".to_owned(), Some(body))
        }
        "read" | "open" | "rename" | "archive" | "delete" => {
            let chat_id = id.ok_or("Conversation ID is required")?;
            if !valid_id(&chat_id) {
                return Err("Invalid conversation ID".into());
            }
            let path = format!("/v1/conversations/{chat_id}");
            match operation.as_str() {
                "read" => (Method::GET, format!("{path}/messages"), None),
                "open" => (Method::POST, format!("{path}/open"), Some(json!({}))),
                "rename" => {
                    let new_title = title.unwrap_or_default();
                    if new_title.trim().is_empty() || new_title.chars().count() > 120 {
                        return Err("Title must contain between 1 and 120 characters".into());
                    }
                    (Method::PATCH, path, Some(json!({"title":new_title})))
                }
                "archive" => (Method::POST, format!("{path}/archive"), Some(json!({}))),
                "delete" => {
                    if confirm != Some(true) {
                        return Err("Delete requires confirmation".into());
                    }
                    (Method::DELETE, path, Some(json!({"confirm":true})))
                }
                _ => unreachable!(),
            }
        }
        _ => return Err("Unknown bridge operation".into()),
    };

    let mut request = state.client.request(method, format!("{root}{endpoint}"));
    if operation != "health" {
        let secret = std::fs::read_to_string(key_path()?)
            .map_err(|_| "Local bridge key not found. Start the browser controller.".to_owned())?;
        let secret = secret.trim();
        if secret.len() < 24 {
            return Err("Local bridge key is invalid".into());
        }
        request = request.header("X-Bridge-Key", secret);
    }
    if let Some(body) = payload {
        request = request.json(&body);
    }
    let response = request.send().await.map_err(|e| {
        if e.is_connect() {
            "Local conversation controller is offline. Start it on port 8791.".to_owned()
        } else if e.is_timeout() {
            "The browser controller timed out. Check the signed-in Chrome window.".to_owned()
        } else {
            "Could not communicate with the local controller.".to_owned()
        }
    })?;
    let status = response.status();
    let data: Value = response.json().await.map_err(|_| "Controller returned an invalid response")?;
    if !status.is_success() {
        let message = data.get("error").and_then(Value::as_str).unwrap_or("Controller request failed");
        if status == StatusCode::TOO_MANY_REQUESTS {
            return Err(format!("Browser is busy or rate-limited. {message}"));
        }
        return Err(format!("{message} (HTTP {})", status.as_u16()));
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::valid_id;

    #[test]
    fn validates_uuids() {
        assert!(valid_id("12345678-1234-abcd-1234-123456789abc"));
        assert!(!valid_id("../foo"));
        assert!(!valid_id("123"));
        assert!(!valid_id("12345678-1234-1234-1234-123456789abz"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(6))
        .timeout(Duration::from_secs(150))
        .build()
        .expect("Could not construct local HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(RelayState { client })
        .invoke_handler(tauri::generate_handler![bridge_call])
        .run(tauri::generate_context!())
        .expect("error while running Relay");
}
