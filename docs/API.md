# ChatGPT Controller — localhost HTTP API v1

A private, browser-backed API. It is **not** the official OpenAI API, and it never exports ChatGPT cookies or bearer tokens.

Endpoint: `http://127.0.0.1:8791`. Every operation except `GET /health` requires `X-Bridge-Key: <locally generated controller key>`.

The key is saved on the user's Mac at `~/.config/chatgpt-browser-controller/bridge.key`. Reveal/copy it in the **API access** page of the controller app.

| Method | Path                                           | Operation                                                    |
| ------ | ---------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/health`                                      | Service status                                               |
| GET    | `/v1/conversations?limit=25`                   | Background account conversation listing (sidebar fallback)   |
| GET    | `/v1/conversations/{uuid}/status`              | Check one conversation status without tab navigation         |
| GET    | `/v1/conversations/statuses?limit=20&offset=0` | Paginated account-wide status monitoring                     |
| POST   | `/v1/conversations/statuses`                   | Batch status check for 1–50 IDs; body `{"ids":["uuid",...]}` |
| GET    | `/v1/conversations/{uuid}/messages`            | Read existing chat messages                                  |
| POST   | `/v1/conversations/{uuid}/open`                | Open known conversation                                      |
| POST   | `/v1/chat`                                     | New chat or follow-up                                        |
| POST   | `/v1/chat/completions`                         | Non-streaming JSON compatibility                             |
| PATCH  | `/v1/conversations/{uuid}`                     | Rename with `{"title":"New title"}`                          |
| POST   | `/v1/conversations/{uuid}/archive`             | Archive with `{}`                                            |
| DELETE | `/v1/conversations/{uuid}`                     | Delete with `{"confirm":true}`                               |

## Test from your Mac

```bash
curl http://127.0.0.1:8791/v1/conversations \
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)"
```

New chat:

```bash
curl http://127.0.0.1:8791/v1/chat \
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)" \
  -H "Content-Type: application/json" \
  --data '{"prompt":"Explain Kubernetes networking."}'
```

The response includes `reply` and `conversation_path`. To send a follow-up, send another request with `{"prompt":"Continue","conversation_path":"/c/<uuid>"}`.

## Expected errors

400 invalid payload or missing confirmation; 401 missing/wrong controller key or browser login; 404 unknown endpoint or conversation; 413 oversized request; 415 missing JSON media type; 422 unsupported streaming/model; 429 concurrent browser operation; 502 browser error; 503 conversation temporarily unavailable; 504 response timeout.

The API serializes UI-changing browser operations and remains bound to loopback. Status checks use hidden same-origin iframes; account discovery and list/read/rename/archive/delete use first-party authenticated request-context calls, without opening or activating tabs. The explicit `open` request and UI chat sending still use browser automation, but now reuse an already loaded matching conversation without re-navigation. Chat sending checks the Stop control and returns after the response ends instead of waiting for an arbitrary four-second period of unchanged text; upstream generation time cannot be accelerated by this controller. Status batching accepts up to 50 IDs and checks up to eight concurrently; account pages are cached for 60 seconds. During a controller-owned in-progress chat, monitoring known IDs returns the known local state without opening additional tabs; other IDs may be `unavailable` rather than guessed. ChatGPT private endpoints may change and upstream rate limits apply. A timeout does not prove a message was not submitted. Inspect Chrome before retrying.

For paging examples and status semantics, see [conversation-status-api.md](conversation-status-api.md).

## Client reference

`controller/controller-client.ts` is a typed TypeScript caller. `samples/relay` is a complete macOS chat client (Tauri + Svelte + Rust) demonstrating the interface. Its Rust backend reads the local controller key and performs localhost requests without passing that key into Svelte.
