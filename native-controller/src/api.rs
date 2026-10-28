use crate::browser::{self, Result as BridgeResult};
use axum::{
    Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::any,
};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use subtle::ConstantTimeEq;

pub struct Server {
    key: String,
    session: String,
    busy: AtomicBool,
    active_chat: Mutex<Option<String>>,
    discovery_cache: Mutex<HashMap<(usize, usize), (Instant, Value)>>,
}
impl Server {
    pub fn new(key: String, session: String) -> Self {
        Self {
            key,
            session,
            busy: AtomicBool::new(false),
            active_chat: Mutex::new(None),
            discovery_cache: Mutex::new(HashMap::new()),
        }
    }
}
struct BusyGuard(Arc<Server>);
impl Drop for BusyGuard {
    fn drop(&mut self) {
        *self.0.active_chat.lock().unwrap() = None;
        self.0.busy.store(false, Ordering::SeqCst);
    }
}
pub fn router(state: Arc<Server>) -> Router {
    Router::new()
        .fallback(any(handle))
        .layer(DefaultBodyLimit::max(72_000))
        .with_state(state)
}

fn reply(status: u16, value: Value) -> Response {
    let status = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    (
        status,
        [
            ("cache-control", "no-store"),
            ("x-content-type-options", "nosniff"),
            ("content-type", "application/json"),
        ],
        value.to_string(),
    )
        .into_response()
}
fn output(result: BridgeResult<Value>) -> Response {
    match result {
        Ok(value) => reply(200, value),
        Err((status, reason)) => reply(status, json!({"error":reason})),
    }
}
fn number(query: &str, key: &str, default: usize, max: usize, min: usize) -> BridgeResult<usize> {
    let raw = query
        .split('&')
        .filter_map(|item| item.split_once('='))
        .find(|(k, _)| *k == key)
        .map(|(_, v)| v)
        .filter(|v| !v.is_empty())
        .unwrap_or("");
    if raw.is_empty() {
        return Ok(default);
    }
    let value = raw
        .parse::<usize>()
        .map_err(|_| browser::error(400, format!("{} must be {}-{}", title(key), min, max)))?;
    if value < min || value > max {
        return Err(browser::error(
            400,
            format!("{} must be {}-{}", title(key), min, max),
        ));
    }
    Ok(value)
}
fn title(s: &str) -> String {
    let mut it = s.chars();
    it.next()
        .map(|c| c.to_ascii_uppercase().to_string() + it.as_str())
        .unwrap_or_default()
}
fn request_body(headers: &HeaderMap, bytes: &Bytes) -> BridgeResult<Value> {
    if !headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            let value = v.to_ascii_lowercase();
            value == "application/json" || value.starts_with("application/json;")
        })
    {
        return Err(browser::error(415, "Use application/json"));
    }
    if bytes.len() > 72_000 {
        return Err(browser::error(413, "Request is too large"));
    }
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| browser::error(400, "Invalid JSON"))?;
    if !value.is_object() {
        return Err(browser::error(400, "Invalid JSON"));
    }
    Ok(value)
}
fn parse_ids(data: &Value) -> BridgeResult<Vec<String>> {
    let array = data
        .get("ids")
        .and_then(Value::as_array)
        .ok_or_else(|| browser::error(400, "ids must contain 1-50 conversation IDs"))?;
    if array.is_empty() || array.len() > 50 {
        return Err(browser::error(
            400,
            "ids must contain 1-50 conversation IDs",
        ));
    }
    let mut seen = HashSet::new();
    let mut ids = vec![];
    for value in array {
        let id = browser::validate_id(
            value
                .as_str()
                .ok_or_else(|| browser::error(400, "Invalid conversation ID"))?,
        )?;
        if seen.insert(id.clone()) {
            ids.push(id);
        }
    }
    Ok(ids)
}
fn conversations(value: &Value, limit: usize) -> Vec<Value> {
    value
        .get("conversations")
        .and_then(Value::as_array)
        .map(|array| {
            array
                .iter()
                .filter_map(|v| {
                    let id = browser::validate_id(v.get("id")?.as_str()?).ok()?;
                    let title = v
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .chars()
                        .take(200)
                        .collect::<String>();
                    Some(json!({"id":id,"title":title}))
                })
                .take(limit)
                .collect()
        })
        .unwrap_or_default()
}
async fn discovery(state: &Arc<Server>, limit: usize, offset: usize) -> BridgeResult<Value> {
    let key = (limit, offset);
    let cached = state
        .discovery_cache
        .lock()
        .unwrap()
        .get(&key)
        .filter(|(at, _)| at.elapsed() < Duration::from_secs(60))
        .map(|(_, v)| v.clone());
    if let Some(value) = cached {
        return Ok(value);
    }
    let value = browser::discover(limit, offset, &state.session).await?;
    state
        .discovery_cache
        .lock()
        .unwrap()
        .insert(key, (Instant::now(), value.clone()));
    Ok(value)
}
async fn list(state: &Arc<Server>, limit: usize) -> BridgeResult<Value> {
    let result: BridgeResult<Value> = async {
        let first = discovery(state, limit.min(50), 0).await?;
        let mut items = conversations(&first, limit);
        let total = first.get("total").and_then(Value::as_u64).unwrap_or(0);
        if limit > 50 && (items.len() as u64) < total {
            let second = discovery(state, limit - 50, 50).await?;
            items.extend(conversations(&second, limit - 50));
        }
        Ok(
            json!({"conversations":items,"visibleCount":items.len(),"total":total,
            "scope":"account-conversations"}),
        )
    }
    .await;
    match result {
        Ok(value) => Ok(value),
        Err(_) => {
            let visible = browser::discover_visible(limit, &state.session).await?;
            let items = conversations(&visible, limit);
            Ok(json!({"conversations":items,
                "visibleCount":visible.get("visibleCount").and_then(Value::as_u64).unwrap_or(0),
                "scope":"loaded-sidebar-only"}))
        }
    }
}
fn statuses_json(
    statuses: Vec<Value>,
    scope: &str,
    total: Option<u64>,
    offset: usize,
    has_more: Option<bool>,
    visible: Option<u64>,
) -> Value {
    let summary = |status: &str| {
        statuses
            .iter()
            .filter(|item| item.get("status").and_then(Value::as_str) == Some(status))
            .count()
    };
    let mut value = json!({"count":statuses.len(),"statuses":statuses,"scope":scope,
        "summary":{"in_progress":summary("in_progress"),"completed":summary("completed"),
        "failed":summary("failed"),"unavailable":summary("unavailable")}});
    if let Some(total) = total {
        value["total"] = json!(total);
        value["offset"] = json!(offset);
        value["hasMore"] = json!(has_more.unwrap_or(false));
    }
    if let Some(visible) = visible {
        value["visibleCount"] = json!(visible);
    }
    value
}
fn busy_status(id: &str, active: Option<&str>) -> Value {
    let current = active == Some(id);
    browser::make_status(
        id,
        if current {
            "in_progress"
        } else {
            "unavailable"
        },
        "local-operation",
        if current {
            None
        } else {
            Some("browser_operation_busy")
        },
        None,
    )
}
fn status_route(method: &Method, path: &str) -> Option<BridgeResult<(String, Option<String>)>> {
    let tail = path.strip_prefix("/v1/conversations/")?;
    if tail == "statuses" {
        return None;
    }
    let mut segments = tail.split('/');
    let id = segments.next()?;
    let suffix = segments.next();
    if segments.next().is_some() {
        return None;
    }
    let action = match (method.as_str(), suffix) {
        ("GET", Some("status")) => "status",
        ("GET", None | Some("messages")) => "read",
        ("POST", Some("open")) => "open",
        ("POST", Some("archive")) => "archive",
        ("PATCH", None) => "rename",
        ("DELETE", None) => "delete",
        _ => return None,
    };
    Some(browser::validate_id(id).map(|id| (action.to_owned(), Some(id))))
}
async fn status_pages(
    state: &Arc<Server>,
    ids: Option<Vec<String>>,
    limit: usize,
    offset: usize,
    already_busy: bool,
) -> BridgeResult<Value> {
    let (ids, scope, total, has_more, visible) = if let Some(ids) = ids {
        (ids, "explicit-ids".to_owned(), None, None, None)
    } else {
        if already_busy {
            let cached = state
                .discovery_cache
                .lock()
                .unwrap()
                .get(&(limit, offset))
                .filter(|(at, _)| at.elapsed() < Duration::from_secs(60))
                .map(|(_, v)| v.clone())
                .ok_or_else(|| {
                    browser::error(
                        503,
                        "Account discovery unavailable while a chat operation is running",
                    )
                })?;
            (
                conversations(&cached, limit)
                    .iter()
                    .filter_map(|v| v["id"].as_str().map(String::from))
                    .collect(),
                "account-conversations".to_owned(),
                cached["total"].as_u64(),
                Some(
                    offset
                        + cached["conversations"]
                            .as_array()
                            .map(Vec::len)
                            .unwrap_or(0)
                        < cached["total"].as_u64().unwrap_or(0) as usize,
                ),
                None,
            )
        } else {
            match discovery(state, limit, offset).await {
                Ok(data) => {
                    let items = conversations(&data, limit);
                    let total = data["total"].as_u64();
                    let has_more = total.map(|n| offset + items.len() < n as usize);
                    (
                        items
                            .iter()
                            .filter_map(|v| v["id"].as_str().map(String::from))
                            .collect(),
                        "account-conversations".to_owned(),
                        total,
                        has_more,
                        None,
                    )
                }
                Err(e) => {
                    if offset > 0 {
                        return Err(e);
                    }
                    let data = browser::discover_visible(limit, &state.session).await?;
                    let items = conversations(&data, limit);
                    (
                        items
                            .iter()
                            .filter_map(|v| v["id"].as_str().map(String::from))
                            .collect(),
                        "loaded-sidebar-only".to_owned(),
                        None,
                        None,
                        data["visibleCount"].as_u64(),
                    )
                }
            }
        }
    };
    let statuses = if already_busy {
        let active = state.active_chat.lock().unwrap().clone();
        ids.iter()
            .map(|id| busy_status(id, active.as_deref()))
            .collect()
    } else if ids.is_empty() {
        Vec::new()
    } else {
        browser::status_batch(&ids, &state.session).await
    };
    Ok(statuses_json(
        statuses, &scope, total, offset, has_more, visible,
    ))
}
fn route(path: &str, method: &Method) -> bool {
    path == "/health" && method == Method::GET
        || path == "/v1/chat" && method == Method::POST
        || path == "/v1/chat/completions" && method == Method::POST
        || path == "/v1/conversations" && method == Method::GET
        || path == "/v1/conversations/statuses"
            && (*method == Method::GET || *method == Method::POST)
        || status_route(method, path).is_some()
}

async fn handle(
    State(state): State<Arc<Server>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    bytes: Bytes,
) -> Response {
    // Strictly loopback; never trust an HTTP Host header that points off-machine.
    if !headers
        .get("host")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| {
            v == "localhost"
                || v.starts_with("localhost:")
                || v == "127.0.0.1"
                || v.starts_with("127.0.0.1:")
        })
    {
        return reply(403, json!({"error":"Loopback only"}));
    }
    let path = uri.path();
    if method == Method::GET && path == "/health" {
        return reply(
            200,
            json!({"ok":true,"transport":"authenticated-browser-ui","busy":state.busy.load(Ordering::SeqCst)}),
        );
    }
    let incoming = headers
        .get("x-bridge-key")
        .map(|v| v.as_bytes())
        .unwrap_or_default();
    if state.key.as_bytes().ct_eq(incoming).unwrap_u8() != 1 {
        return reply(401, json!({"error":"Unauthorized"}));
    }
    if !route(path, &method) {
        return reply(404, json!({"error":"Not found"}));
    }
    let query = uri.query().unwrap_or("");
    let already_busy = state.busy.load(Ordering::SeqCst);
    if let Some(Err(err)) = status_route(&method, path) {
        return output(Err(err));
    }
    if let Some(Ok((action, Some(id)))) = status_route(&method, path) {
        if action == "status" {
            if already_busy {
                let active = state.active_chat.lock().unwrap().clone();
                return output(Ok(busy_status(&id, active.as_deref())));
            }
            return output(Ok(browser::status_batch(&[id], &state.session)
                .await
                .remove(0)));
        }
    }
    if already_busy && path == "/v1/conversations/statuses" {
        let result = async {
            if method == Method::POST {
                let data = request_body(&headers, &bytes)?;
                status_pages(&state, Some(parse_ids(&data)?), 50, 0, true).await
            } else {
                let limit = number(query, "limit", 20, 50, 1)?;
                let offset = number(query, "offset", 0, 1_000_000, 0)?;
                status_pages(&state, None, limit, offset, true).await
            }
        }
        .await;
        return output(result);
    }
    if state
        .busy
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return reply(
            429,
            json!({"error":"Another browser operation is in progress"}),
        );
    }
    let _guard = BusyGuard(state.clone());
    output(process(&state, &method, path, query, &headers, &bytes).await)
}
async fn process(
    state: &Arc<Server>,
    method: &Method,
    path: &str,
    query: &str,
    headers: &HeaderMap,
    bytes: &Bytes,
) -> BridgeResult<Value> {
    if method == Method::GET && path == "/v1/conversations" {
        return list(state, number(query, "limit", 25, 100, 1)?).await;
    }
    if path == "/v1/conversations/statuses" {
        if method == Method::POST {
            return status_pages(
                state,
                Some(parse_ids(&request_body(headers, bytes)?)?),
                50,
                0,
                false,
            )
            .await;
        }
        return status_pages(
            state,
            None,
            number(query, "limit", 20, 50, 1)?,
            number(query, "offset", 0, 1_000_000, 0)?,
            false,
        )
        .await;
    }
    let data = if method == Method::GET {
        json!({})
    } else {
        request_body(headers, bytes)?
    };
    if path == "/v1/chat" || path == "/v1/chat/completions" {
        if data.get("stream").and_then(Value::as_bool) == Some(true) {
            return Err(browser::error(
                422,
                "True token-by-token streaming is not implemented; use stream:false",
            ));
        }
        if data
            .get("model")
            .and_then(Value::as_str)
            .is_some_and(|m| m != "chatgpt-web")
        {
            return Err(browser::error(422, "Only chatgpt-web is supported"));
        }
        let prompt = data
            .get("prompt")
            .and_then(Value::as_str)
            .or_else(|| {
                data.get("messages")
                    .and_then(Value::as_array)
                    .and_then(|ms| ms.last())
                    .filter(|m| m["role"] == "user")
                    .and_then(|m| m["content"].as_str())
            })
            .ok_or_else(|| browser::error(400, "Expected prompt or final user message"))?;
        if prompt.trim().is_empty() {
            return Err(browser::error(400, "Prompt must be nonempty"));
        }
        if prompt.chars().count() > 16_000 {
            return Err(browser::error(
                413,
                "Prompt too long (maximum 16,000 characters)",
            ));
        }
        let target = data.get("conversation_path");
        let path_str = match target {
            None => None,
            Some(v) => {
                let path = v
                    .as_str()
                    .ok_or_else(|| browser::error(400, "Invalid conversation_path"))?;
                let id = path
                    .strip_prefix("/c/")
                    .ok_or_else(|| browser::error(400, "Invalid conversation_path"))?;
                Some(format!("/c/{}", browser::validate_id(id)?))
            }
        };
        *state.active_chat.lock().unwrap() = path_str.as_ref().map(|p| p[3..].to_owned());
        let result = browser::execute(
            "chat",
            &[
                ("__PATH__", json!(path_str).to_string()),
                ("__PROMPT__", json!(prompt).to_string()),
            ],
            &state.session,
        )
        .await?;
        match result.get("error").and_then(Value::as_str) {
            Some("LOGIN_REQUIRED") => {
                return Err(browser::error(401, "Log in to the Chrome profile manually"));
            }
            Some("NO_RESPONSE" | "RESPONSE_TIMEOUT") => {
                return Err(browser::error(504, "ChatGPT did not finish responding"));
            }
            Some("UNAVAILABLE") => {
                return Err(browser::error(
                    503,
                    "Conversation unavailable; possible upstream rate limit",
                ));
            }
            Some(_) => return Err(browser::error(502, "Browser operation failed")),
            None => {}
        }
        let reply = result
            .get("reply")
            .and_then(Value::as_str)
            .ok_or_else(|| browser::error(502, "No ChatGPT reply in browser result"))?;
        let conversation_path = result
            .get("conversationPath")
            .cloned()
            .unwrap_or(Value::Null);
        if path == "/v1/chat" {
            return Ok(
                json!({"reply":reply,"conversation_path":conversation_path,"transport":"authenticated-browser-ui"}),
            );
        }
        let created = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        return Ok(
            json!({"id":format!("chatcmpl-local-{}",uuid::Uuid::new_v4()),
            "object":"chat.completion","created":created,"model":"chatgpt-web",
            "choices":[{"index":0,"message":{"role":"assistant","content":reply},"finish_reason":"stop"}],
            "conversation_path":conversation_path,"transport":"authenticated-browser-ui"}),
        );
    }
    let (action, Some(id)) = status_route(method, path).expect("Known route")? else {
        return Err(browser::error(404, "Not found"));
    };
    if action == "delete" && data.get("confirm").and_then(Value::as_bool) != Some(true) {
        return Err(browser::error(400, "Delete requires confirm:true"));
    }
    if action == "rename" && data.get("title").and_then(Value::as_str).is_none() {
        return Err(browser::error(400, "Expected title string"));
    }
    browser::control(
        &action,
        &id,
        data.get("title").and_then(Value::as_str),
        &state.session,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    #[test]
    fn validation_and_route_coverage() {
        let method = Method::GET;
        assert!(route(&format!("/v1/conversations/{ID}/status"), &method));
        assert!(route("/v1/conversations/statuses", &method));
        assert!(!route("/unknown", &method));
        assert_eq!(number("limit=50", "limit", 20, 50, 1).unwrap(), 50);
        assert!(number("limit=-1", "limit", 20, 50, 1).is_err());
        assert!(parse_ids(&json!({"ids":[ID,ID]})).is_ok());
        assert_eq!(parse_ids(&json!({"ids":[ID,ID]})).unwrap().len(), 1);
        assert!(parse_ids(&json!({"ids":["bad"]})).is_err());
    }
}
