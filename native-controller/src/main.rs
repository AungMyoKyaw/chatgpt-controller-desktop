mod api;
mod browser;

use std::sync::Arc;
use std::time::Duration;

#[tokio::main]
async fn main() {
    let key = std::env::var("CHATGPT_BRIDGE_KEY").unwrap_or_default();
    if key.len() < 24 {
        eprintln!("Set CHATGPT_BRIDGE_KEY to a random secret of at least 24 characters.");
        std::process::exit(2);
    }
    let port: u16 = std::env::var("CHATGPT_BRIDGE_PORT")
        .unwrap_or_else(|_| "8791".into())
        .parse()
        .unwrap_or(0);
    if port < 1024 {
        eprintln!("Invalid port");
        std::process::exit(2);
    }
    let session =
        std::env::var("CHATGPT_BROWSER_SESSION").unwrap_or_else(|_| "chatgpt-controller".into());
    if session.is_empty()
        || session.len() > 81
        || !session
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphanumeric())
        || !session
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        eprintln!("Invalid browser session");
        std::process::exit(2);
    }
    if let Ok(pid) = std::env::var("CHATGPT_CONTROLLER_PARENT_PID") {
        if let Ok(pid) = pid.parse::<i32>() {
            if pid > 1 {
                tokio::spawn(async move {
                    loop {
                        tokio::time::sleep(Duration::from_millis(1500)).await;
                        let result = tokio::process::Command::new("/bin/kill")
                            .arg("-0")
                            .arg(pid.to_string())
                            .output()
                            .await;
                        if result.is_err() || !result.unwrap().status.success() {
                            std::process::exit(0);
                        }
                    }
                });
            }
        }
    }
    let address = format!("127.0.0.1:{port}");
    let listener = tokio::net::TcpListener::bind(&address)
        .await
        .unwrap_or_else(|e| {
            eprintln!("Cannot bind localhost listener: {e}");
            std::process::exit(2);
        });
    println!("Native Rust ChatGPT Controller listening on {address}");
    axum::serve(
        listener,
        api::router(Arc::new(api::Server::new(key, session))),
    )
    .await
    .unwrap();
}
