# Localhost API reference

API v1 runs at `http://127.0.0.1:8791`. It is a **browser-backed localhost interface**, not an official OpenAI endpoint.

Every operation except `GET /health` requires a locally generated `X-Bridge-Key`. The key lives at `~/.config/chatgpt-browser-controller/bridge.key`; do not publish it.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service health |
| GET | `/v1/conversations?limit=25` | List loaded sidebar conversations |
| GET | `/v1/conversations/{uuid}/messages` | Read accessible messages |
| GET | `/v1/conversations/{uuid}/status` | Inspect generation status |
| POST | `/v1/conversations/{uuid}/open` | Open a known thread |
| POST | `/v1/chat` | New prompt or known-thread follow-up |
| POST | `/v1/chat/completions` | Non-streaming JSON compatibility |
| PATCH | `/v1/conversations/{uuid}` | Rename with `{"title":"New title"}` |
| POST | `/v1/conversations/{uuid}/archive` | Archive with `{}` |
| DELETE | `/v1/conversations/{uuid}` | Delete with `{"confirm":true}` |

## Request examples

```bash
curl http://127.0.0.1:8791/v1/conversations \
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)"
```

New chat (sends a real prompt):

```bash
curl -X POST http://127.0.0.1:8791/v1/chat \
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)" \
  -H "Content-Type: application/json" \
  --data '{"prompt":"Explain Kubernetes networking."}'
```

The response contains `reply` and `conversation_path`. For a follow-up, repeat the call and include the exact `conversation_path` from the prior response.

## Conversation generation status

`GET /v1/conversations/{uuid}/status` returns a status such as:

```json
{
  "id": "12345678-1234-1234-1234-123456789abc",
  "conversationPath": "/c/12345678-1234-1234-1234-123456789abc",
  "status": "in_progress",
  "in_progress": true,
  "source": "browser-ui"
}
```

- **in_progress:** the connected browser shows an active generation signal or the local controller has a known active operation.
- **completed:** an open tab has a last assistant turn and no visible stop signal. It is an observation, not a service guarantee.
- **unknown:** not open, inconclusive, inaccessible or busy. Unknown never implies ready.

Status inspection reads **existing open tabs**, not automatically opened conversations.

## Error handling

| Code | Meaning |
| --- | --- |
| 400 | Invalid input or missing destructive-action confirmation |
| 401 | Invalid/missing controller key or browser login |
| 404 | Unknown route or conversation |
| 413 | Request too large |
| 415 | Missing required JSON media type |
| 422 | Unsupported streaming or model option |
| 429 | Another browser operation is in progress |
| 502 | Browser execution failure |
| 503 | Conversation temporarily unavailable |
| 504 | Operation timed out |

The controller serializes browser operations. A timeout does **not** prove a prompt was never submitted. Check the browser before retrying.

## Client code

The repository includes `controller/controller-client.ts` and a separate Tauri example at `samples/relay/`. The example's Rust backend keeps the local controller key out of its Svelte frontend.
