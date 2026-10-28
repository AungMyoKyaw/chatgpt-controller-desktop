use serde_json::{Value, json};
use std::sync::OnceLock;
use std::time::Duration;
use tokio::process::Command;

pub type Result<T> = std::result::Result<T, (u16, String)>;
pub fn error(status: u16, message: impl Into<String>) -> (u16, String) {
    (status, message.into())
}

pub fn validate_id(id: &str) -> Result<String> {
    if id.len() != 36
        || !id.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
    {
        return Err(error(400, "Invalid conversation ID"));
    }
    Ok(id.to_ascii_lowercase())
}

pub fn template(name: &str, replacements: &[(&str, String)]) -> Result<String> {
    static SCRIPTS: OnceLock<Value> = OnceLock::new();
    let scripts = SCRIPTS.get_or_init(|| {
        serde_json::from_str(include_str!("../playwright-scripts.json"))
            .expect("Invalid packaged Playwright scripts")
    });
    let mut code = scripts
        .get(name)
        .and_then(Value::as_str)
        .ok_or_else(|| error(500, "Unknown browser script"))?
        .to_owned();
    for (key, value) in replacements {
        if !code.contains(key) {
            return Err(error(500, format!("Missing browser template slot {key}")));
        }
        code = code.replace(key, value);
    }
    if [
        "__ID__",
        "__TITLE__",
        "__PROMPT__",
        "__IDS__",
        "__LIMIT__",
        "__OFFSET__",
        "__PATH__",
    ]
    .iter()
    .any(|slot| code.contains(slot))
    {
        return Err(error(500, "Unfilled browser script parameter"));
    }
    Ok(code)
}

pub async fn run(code: &str, session: &str) -> Result<Value> {
    let output = tokio::time::timeout(
        Duration::from_secs(125),
        Command::new("playwright-cli")
            .arg(format!("-s={session}"))
            .arg("run-code")
            .arg(code)
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| error(504, "Playwright timed out"))?
    .map_err(|_| {
        error(
            503,
            "Playwright CLI is unavailable; install @playwright/cli",
        )
    })?;
    if !output.status.success() {
        return Err(error(
            502,
            "Playwright command failed. Check the persistent Chrome session.",
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let result = stdout
        .split_once("### Result\n")
        .map(|(_, rest)| rest)
        .and_then(|rest| rest.lines().next())
        .ok_or_else(|| error(502, "No structured browser result was returned"))?;
    serde_json::from_str(result).map_err(|_| error(502, "Browser returned invalid JSON"))
}
pub async fn execute(name: &str, replacements: &[(&str, String)], session: &str) -> Result<Value> {
    run(&template(name, replacements)?, session).await
}

pub fn make_status(
    id: &str,
    status: &str,
    source: &str,
    reason: Option<&str>,
    upstream: Option<&str>,
) -> Value {
    let in_progress: Value = match status {
        "in_progress" => json!(true),
        "completed" | "failed" => json!(false),
        _ => Value::Null,
    };
    let mut value = json!({
        "id":id,"conversationPath":format!("/c/{id}"),
        "status":status,"in_progress":in_progress,"source":source
    });
    if let Some(reason) = reason {
        value["reason"] = json!(reason);
    }
    if let Some(upstream) = upstream {
        value["upstream_status"] = json!(upstream);
    }
    value
}
pub fn interpret_status(id: &str, payload: &Value) -> Value {
    let Some(raw) = payload.get("status").and_then(Value::as_str) else {
        let reason = if payload.is_object() {
            "missing_upstream_status"
        } else {
            "invalid_upstream_response"
        };
        return make_status(
            id,
            "unavailable",
            "upstream-stream-status",
            Some(reason),
            None,
        );
    };
    let uppercase = raw.to_ascii_uppercase();
    let status = match uppercase.as_str() {
        "COMPLETE" | "COMPLETED" | "FINISHED" => "completed",
        "IN_PROGRESS" | "INPROGRESS" | "RUNNING" | "STREAMING" | "IS_STREAMING" | "ACTIVE"
        | "PENDING" | "PROCESSING" | "QUEUED" => "in_progress",
        "FAILED" | "ERROR" | "ERRORED" | "INTERRUPTED" | "CANCELLED" | "CANCELED" | "ABORTED" => {
            "failed"
        }
        _ => "unavailable",
    };
    make_status(
        id,
        status,
        "upstream-stream-status",
        if status == "unavailable" {
            Some("unrecognized_upstream_status")
        } else {
            None
        },
        Some(raw),
    )
}
pub async fn status_batch(ids: &[String], session: &str) -> Vec<Value> {
    let result = execute("statuses", &[("__IDS__", json!(ids).to_string())], session).await;
    ids.iter()
        .map(|id| {
            let record = result
                .as_ref()
                .ok()
                .and_then(|r| r.get("results"))
                .and_then(Value::as_array)
                .and_then(|items| {
                    items
                        .iter()
                        .find(|v| v.get("id").and_then(Value::as_str) == Some(id))
                });
            if let Some(record) = record {
                if record.get("source").and_then(Value::as_str) == Some("browser-ui")
                    && record.get("status").and_then(Value::as_str) == Some("in_progress")
                {
                    return make_status(id, "in_progress", "browser-ui", None, None);
                }
                if let Some(payload) = record.get("payload") {
                    return interpret_status(id, payload);
                }
                return make_status(
                    id,
                    "unavailable",
                    "upstream-stream-status",
                    Some(
                        record
                            .get("error")
                            .and_then(Value::as_str)
                            .unwrap_or("missing_upstream_result"),
                    ),
                    None,
                );
            }
            let reason = if result.is_err() {
                "browser_status_unavailable"
            } else {
                "missing_upstream_result"
            };
            make_status(
                id,
                "unavailable",
                "upstream-stream-status",
                Some(reason),
                None,
            )
        })
        .collect()
}
pub async fn discover(limit: usize, offset: usize, session: &str) -> Result<Value> {
    let v = execute(
        "discovery",
        &[
            ("__LIMIT__", limit.to_string()),
            ("__OFFSET__", offset.to_string()),
        ],
        session,
    )
    .await?;
    if v.get("error").and_then(Value::as_str) == Some("LOGIN_REQUIRED") {
        return Err(error(401, "ChatGPT browser session requires login"));
    }
    if !v.get("conversations").is_some_and(Value::is_array)
        || !v.get("total").is_some_and(Value::is_number)
    {
        return Err(error(503, "Account conversation listing unavailable"));
    }
    Ok(v)
}
pub async fn discover_visible(limit: usize, session: &str) -> Result<Value> {
    let v = execute("visible", &[("__LIMIT__", limit.to_string())], session).await?;
    if !v.get("conversations").is_some_and(Value::is_array) {
        return Err(error(502, "Failed to discover browser conversations"));
    }
    Ok(v)
}
pub async fn control(action: &str, id: &str, title: Option<&str>, session: &str) -> Result<Value> {
    let mut args = vec![("__ID__", id.to_owned())];
    if action == "rename" {
        let name = title.unwrap_or("");
        if name.trim().is_empty() || name.chars().count() > 120 {
            return Err(error(400, "Title must be 1-120 characters"));
        }
        args.push(("__TITLE__", json!(name).to_string()));
    }
    let name = match action {
        "read" => {
            args.push(("__LIMIT__", "100".to_owned()));
            "read"
        }
        "delete" => "remove",
        a => a,
    };
    let result = execute(name, &args, session).await?;
    match result.get("error").and_then(Value::as_str) {
        Some("LOGIN_REQUIRED") => Err(error(401, "Sign in to the browser session")),
        Some("NOT_FOUND") => Err(error(404, "Conversation not found")),
        Some("UNAVAILABLE") => Err(error(
            503,
            "Conversation unavailable; upstream rate limits or loading failures may be in effect",
        )),
        Some(_) => Err(error(502, "Browser action failed")),
        None => Ok(result),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    #[test]
    fn templates_reject_missing_arguments() {
        assert!(validate_id(ID).is_ok());
        assert!(validate_id("bad/../../").is_err());
        for name in [
            "chat",
            "read",
            "open",
            "rename",
            "archive",
            "remove",
            "statuses",
            "discovery",
            "visible",
        ] {
            assert!(
                template(name, &[]).is_err(),
                "{name} missing slots should fail"
            );
        }
        assert!(
            template(
                "read",
                &[("__ID__", ID.into()), ("__LIMIT__", "100".into())]
            )
            .unwrap()
            .contains(ID)
        );
        assert!(
            template("statuses", &[("__IDS__", json!([ID]).to_string())])
                .unwrap()
                .contains(ID)
        );
    }
    #[test]
    fn stream_status_mapping() {
        assert_eq!(
            interpret_status(ID, &json!({"status":"COMPLETE"}))["status"],
            "completed"
        );
        assert_eq!(
            interpret_status(ID, &json!({"status":"STREAMING"}))["status"],
            "in_progress"
        );
        assert_eq!(
            interpret_status(ID, &json!({"status":"FAILED"}))["status"],
            "failed"
        );
        assert_eq!(interpret_status(ID, &json!({}))["status"], "unavailable");
    }
}
