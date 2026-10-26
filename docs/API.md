# ChatGPT Controller — localhost HTTP API v1

A private, browser-backed API. It is **not** the official OpenAI API, and it never exports ChatGPT cookies or bearer tokens.

Endpoint: `http://127.0.0.1:8791`. Every operation except `GET /health` requires `X-Bridge-Key: <locally generated controller key>`.

The key is saved on the user's Mac at `~/.config/chatgpt-browser-controller/bridge.key`. Reveal/copy it in the **API access** page of the controller app.

| Method | Path | Operation |
|---|---|---|
| GET | `/health` | Service status |
| GET | `/v1/conversations?limit=25` | Loaded sidebar conversations |
| GET | `/v1/conversations/{uuid}/messages` | Read existing chat messages |
| POST | `/v1/conversations/{uuid}/open` | Open known conversation |
| POST | `/v1/chat` | New chat or follow-up |
| POST | `/v1/chat/completions` | Non-streaming JSON compatibility |
| PATCH | `/v1/conversations/{uuid}` | Rename with `{"title":"New title"}` |
| POST | `/v1/conversations/{uuid}/archive` | Archive with `{}` |
| DELETE | `/v1/conversations/{uuid}` | Delete with `{"confirm":true}` |

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

The API serves **one browser operation at a time**, remains bound to loopback, and respects upstream rate limits. A timeout does not prove a message was not submitted. Inspect Chrome before retrying.

## Client reference

`controller/controller-client.ts` is a typed TypeScript caller. `samples/relay` is a complete macOS chat client (Tauri + Svelte + Rust) demonstrating the interface. Its Rust backend reads the local controller key and performs localhost requests without passing that key into Svelte.
