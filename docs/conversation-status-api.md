# Conversation generation status API

## Endpoint

`GET /v1/conversations/{id}/status`

Requires the same `X-Bridge-Key` header as other controller endpoints. Accepts a UUID conversation ID. Returns HTTP 200 with a status object.

```bash
curl -sS \
  -H "X-Bridge-Key: $(cat ~/.config/chatgpt-browser-controller/bridge.key)" \
  http://127.0.0.1:8791/v1/conversations/YOUR-CONVERSATION-UUID/status
```

Example response while ChatGPT is generating:

```json
{
  "id": "12345678-1234-1234-1234-123456789abc",
  "conversationPath": "/c/12345678-1234-1234-1234-123456789abc",
  "status": "in_progress",
  "in_progress": true,
  "source": "browser-ui"
}
```

## Semantics

- `in_progress` / `true`: The conversation has a visible **Stop** button in an open Playwright-controlled ChatGPT tab, or an existing controller-initiated chat call is still running for this known conversation ID.
- `completed` / `false`: An open tab has a last assistant turn and **no Stop button**. This reflects the state observed in that tab, not an upstream API completion guarantee.
- `unknown` / `null`: The conversation is not open in the connected browser session, has no conclusive completion signal, could not load, or another browser operation prevents inspection. A `reason` field explains the uncertainty when available.

`source` is `browser-ui` when an already-open browser tab is inspected and `local-operation` when the bridge reports the state of its own in-flight request.

Status polling does not open, reload, navigate, or stop any conversation. Authentication is required, but no ChatGPT session tokens or cookies are exported. It does not enumerate generating conversations in other browsers or sessions.

The local bridge returns status polling responses during an in-flight chat request instead of HTTP 429. For the same conversation ID it reports `in_progress`; for other IDs it reports `unknown` until browser access becomes available.

## Typed client

```ts
import { ChatGPTControllerClient } from "./controller/controller-client.ts";

const client = new ChatGPTControllerClient(process.env.CHATGPT_BRIDGE_KEY!);
const result = await client.status("12345678-1234-1234-1234-123456789abc");
console.log(result.status);
```

Poll every 1–2 seconds when needed. Do not treat `unknown` as `completed`.
