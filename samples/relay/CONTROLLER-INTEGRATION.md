# Relay: ChatGPT Controller sample client

Relay is deliberately a **separate app** demonstrating the local controller API. It is not part of the ChatGPT Controller desktop executable.

Prerequisites: Start the ChatGPT Controller app, open its dedicated Chrome profile, sign in, and start the API service. Then from this folder:

```sh
bun install
bun run tauri dev
```

Relay's Rust backend reads `~/.config/chatgpt-browser-controller/bridge.key` and calls `http://127.0.0.1:8791`. No browser session tokens are imported.

Core usage: create a conversation with `POST /v1/chat`, save the returned `conversation_path`, continue with another `POST /v1/chat` containing that path, and load or manage history via `/v1/conversations`.

See the parent project's `docs/API.md` for the full request contract.
