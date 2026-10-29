//! Best-effort native HTTP transport. Requests use only a token obtained via
//! the user's authenticated, embedded WebKit session. If the website requires
//! browser-only authentication, read operations fall back to WebKit rather than
//! attempting to defeat upstream protections.
use reqwest::{Client, StatusCode};
use serde_json::{Value, json};
use std::{
    sync::OnceLock,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

static CLIENT: OnceLock<Client> = OnceLock::new();
static TOKEN: OnceLock<Mutex<Option<(String, Instant)>>> = OnceLock::new();
static DISABLED_UNTIL: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();

fn client() -> &'static Client {
    CLIENT.get_or_init(|| {
        Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(4))
            .build()
            .expect("Cannot build native HTTP client")
    })
}

fn cache() -> &'static Mutex<Option<(String, Instant)>> {
    TOKEN.get_or_init(|| Mutex::new(None))
}
fn disabled() -> &'static Mutex<Option<Instant>> {
    DISABLED_UNTIL.get_or_init(|| Mutex::new(None))
}
fn arg<'a>(args: &'a [(&str, String)], name: &str) -> Option<&'a str> {
    args.iter()
        .find(|(k, _)| *k == name)
        .map(|(_, v)| v.as_str())
}
async fn token() -> Option<String> {
    {
        let guard = cache().lock().await;
        if let Some((v, at)) = &*guard {
            if at.elapsed() < Duration::from_secs(30) {
                return Some(v.clone());
            }
        }
    }
    // Internal transport reply only. Never expose this token to localhost API clients.
    let value = crate::browser::native_access_token().await.ok()?;
    let token = value.get("accessToken")?.as_str()?.to_owned();
    if token.len() < 20 {
        return None;
    }
    *cache().lock().await = Some((token.clone(), Instant::now()));
    Some(token)
}
async fn invalidate() {
    *cache().lock().await = None;
    *disabled().lock().await = Some(Instant::now() + Duration::from_secs(60));
}
fn body_error(status: StatusCode) -> Value {
    if status == StatusCode::NOT_FOUND {
        json!({"error":"NOT_FOUND"})
    } else if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        json!({"error":"LOGIN_REQUIRED"})
    } else {
        json!({"error":"UNAVAILABLE","status":status.as_u16()})
    }
}

pub async fn try_native(name: &str, args: &[(&str, String)]) -> Option<Value> {
    // Native HTTP is experimental: website session challenges can cause slow or
    // inconsistent requests. The confirmed same-origin WebKit path is default.
    if std::env::var("CHATGPT_CONTROLLER_ENABLE_NATIVE_HTTP").as_deref() != Ok("1") {
        return None;
    }
    if !matches!(name, "read" | "discovery" | "rename" | "archive" | "remove") {
        return None;
    }
    if disabled()
        .lock()
        .await
        .is_some_and(|until| Instant::now() < until)
    {
        return None;
    }
    let token = token().await?;
    let base = "https://chatgpt.com/backend-api";
    let (method, url, body) = match name {
        "discovery" => {
            let limit = arg(args, "__LIMIT__")?.parse::<usize>().ok()?.clamp(1, 100);
            let offset = arg(args, "__OFFSET__")?.parse::<usize>().ok()?;
            (
                "GET",
                format!("{base}/conversations?offset={offset}&limit={limit}&order=updated"),
                None,
            )
        }
        "read" => {
            let id = crate::browser::validate_id(arg(args, "__ID__")?).ok()?;
            let limit = arg(args, "__LIMIT__")?.parse::<usize>().ok()?.clamp(1, 100);
            (
                "GET",
                format!("{base}/conversation/{id}?num_turns={limit}&include_has_versions=true"),
                None,
            )
        }
        "rename" | "archive" | "remove" => {
            let id = crate::browser::validate_id(arg(args, "__ID__")?).ok()?;
            let body = match name {
                "rename" => {
                    json!({"title":serde_json::from_str::<String>(arg(args,"__TITLE__")?).ok()?})
                }
                "archive" => json!({"is_archived":true}),
                _ => json!({"is_visible":false}),
            };
            ("PATCH", format!("{base}/conversation/{id}"), Some(body))
        }
        _ => return None,
    };
    let mut request = client()
        .request(method.parse().ok()?, url)
        .header("authorization", format!("Bearer {token}"))
        .header("accept", "application/json");
    if let Some(body) = body {
        request = request.json(&body)
    }
    let response = match request.send().await {
        Ok(r) => r,
        Err(_) => {
            *disabled().lock().await = Some(Instant::now() + Duration::from_secs(120));
            return if method == "GET" {
                None
            } else {
                Some(json!({"error":"UNAVAILABLE","reason":"native_network_uncertain"}))
            };
        }
    };
    let status = response.status();
    if status == StatusCode::FORBIDDEN || status == StatusCode::UNAUTHORIZED {
        invalidate().await;
        return None;
    }
    if !status.is_success() {
        return Some(body_error(status));
    }
    if method == "PATCH" {
        let id = arg(args, "__ID__")?;
        return Some(match name {
            "rename" => json!({"id":id,"renamed":true}),
            "archive" => json!({"id":id,"archived":true}),
            _ => json!({"id":id,"deleted":true}),
        });
    }
    let data: Value = match response.json().await {
        Ok(x) => x,
        Err(_) => return None,
    };
    if name == "discovery" {
        let limit = arg(args, "__LIMIT__")?.parse::<usize>().ok()?;
        let offset = arg(args, "__OFFSET__")?.parse::<usize>().ok()?;
        return Some(
            json!({"total":data.get("total")?,"limit":limit,"offset":offset,
            "conversations":data.get("items")?.as_array()?.iter().map(|v|
                json!({"id":v.get("id"),"title":v.get("title")})).collect::<Vec<_>>()}),
        );
    }
    let id = arg(args, "__ID__")?;
    let limit = arg(args, "__LIMIT__")?.parse::<usize>().ok()?;
    let mapping = data.get("mapping")?.as_object()?;
    let mut nodes = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut cursor = data.get("current_node").and_then(Value::as_str);
    while let Some(key) = cursor {
        if !seen.insert(key.to_owned()) {
            break;
        }
        let Some(node) = mapping.get(key) else { break };
        nodes.push(node);
        cursor = node.get("parent").and_then(Value::as_str);
    }
    if let Some(messages) = data.get("messages").and_then(Value::as_array) {
        nodes = messages.iter().collect();
    } else if nodes.is_empty() {
        nodes = mapping.values().rev().collect();
    } else {
        nodes.reverse()
    }
    let messages: Vec<Value> = nodes
        .into_iter()
        .filter_map(|node| {
            let m = node.get("message").unwrap_or(node);
            let role = m.pointer("/author/role")?.as_str()?;
            if role != "user" && role != "assistant" {
                return None;
            }
            let text = m
                .pointer("/content/parts")?
                .as_array()?
                .iter()
                .filter_map(|p| p.as_str().or_else(|| p.get("text").and_then(Value::as_str)))
                .collect::<Vec<_>>()
                .join("\n");
            let content = text.trim().chars().take(20_000).collect::<String>();
            if content.is_empty() {
                None
            } else {
                Some(json!({"role":role,"content":content}))
            }
        })
        .collect();
    let messages = messages
        .into_iter()
        .rev()
        .take(limit)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>();
    Some(json!({"id":id,"conversationPath":format!("/c/{id}"),"messages":messages}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn error_mapping() {
        assert_eq!(body_error(StatusCode::NOT_FOUND)["error"], "NOT_FOUND");
        assert_eq!(body_error(StatusCode::TOO_MANY_REQUESTS)["status"], 429);
    }
}
