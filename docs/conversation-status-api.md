# Conversation status monitoring API

The desktop controller exposes three authenticated endpoints:

| Method | Route                                          | Coverage                                                                            |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/v1/conversations/{id}/status`                | Any valid conversation ID, including conversations not open in a browser tab        |
| POST   | `/v1/conversations/statuses`                   | Up to 50 supplied IDs per request (send multiple batches to cover more)             |
| GET    | `/v1/conversations/statuses?limit=20&offset=0` | Paginated account-wide discovery and status checks, with a browser-sidebar fallback |

All routes require `X-Bridge-Key` and listen only on localhost. GET pages through the signed-in account index: increase `offset` by `count` while `hasMore` is true. If account discovery fails, an offset-0 request falls back to the loaded sidebar and returns `scope: loaded-sidebar-only`. Archived or otherwise unlisted conversations can still be checked with POST when their IDs are known.

## Examples

```bash
KEY="$(cat ~/.config/chatgpt-browser-controller/bridge.key)"
BASE="http://127.0.0.1:8791"

curl -sS -H "X-Bridge-Key: $KEY" \
  "$BASE/v1/conversations/12345678-1234-1234-1234-123456789abc/status"

curl -sS -H "X-Bridge-Key: $KEY" \
  "$BASE/v1/conversations/statuses?limit=20&offset=0"

curl -sS -X POST -H "X-Bridge-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids":["12345678-1234-1234-1234-123456789abc","aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]}' \
  "$BASE/v1/conversations/statuses"
```

A confirmed backend status:

```json
{
  "id": "12345678-1234-1234-1234-123456789abc",
  "conversationPath": "/c/12345678-1234-1234-1234-123456789abc",
  "status": "completed",
  "in_progress": false,
  "source": "upstream-stream-status",
  "upstream_status": "COMPLETE"
}
```

Batch responses contain `statuses`, `count`, `scope`, and a four-category `summary`. Account discovery also returns `offset`, `hasMore`, and an upstream-reported `total` (which may be a lower bound while more pages exist); the sidebar fallback returns `visibleCount`.

## Status semantics

- `in_progress`: A visible conversation has an active Stop button, the controller is executing a chat request for that ID, or the upstream stream-status endpoint reports an active state.
- `completed`: The upstream reports a completed **stream**, or the browser has a completed assistant turn and upstream status could not be read. This is not proof of a successful final answer or that all delegated work finished.
- `failed`: Upstream explicitly reports an error, cancellation, or interruption.
- `unavailable`: An upstream request failed, the response was not recognized, or another operation blocked inspection. The controller does not invent a definitive state from missing evidence. Check `reason` and `upstream_status` where supplied.

`conversation_not_open` is no longer a final status. **Status checks use hidden, same-origin iframes inside an already authenticated ChatGPT page** to read `https://chatgpt.com/backend-api/conversation/{id}/stream_status`. No tabs are opened, navigated, or foregrounded for status polling; temporary iframes are removed automatically. Browser credentials are never exported to the local controller or saved to disk. A running ChatGPT page must exist in the signed-in Playwright session. If none is available, the response is `unavailable` with reason `no_authenticated_chatgpt_page`. Account **discovery** now uses the signed-in Playwright request context directly: no new tab, no navigation, no foreground switch. Successful discovery pages are cached for 60 seconds, while status readings are always fresh.

List, message-read, rename, archive, and delete routes also use authenticated request-context calls without tab navigation. The explicit open and chat-send routes retain their browser UI interactions. A maximum of 50 IDs per batch avoids unbounded browser automation. Batch status checks perform a **single Playwright operation** and load up to eight invisible status iframes concurrently, rather than opening a browser tab for each ID. A live local benchmark checked four conversations in approximately 1.54 seconds; this is not a guaranteed latency. Prefer polling a small active subset frequently; request paginated account discovery less often.

## TypeScript client

```ts
import { ChatGPTControllerClient } from "./controller/controller-client.ts";

const client = new ChatGPTControllerClient(process.env.CHATGPT_BRIDGE_KEY!);
const one = await client.status("12345678-1234-1234-1234-123456789abc");
const selected = await client.statuses([
  "12345678-1234-1234-1234-123456789abc",
  "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
]);
const firstPage = await client.statuses(undefined, 20, 0);
const nextPage = await client.statuses(undefined, 20, 20);
```

ChatGPT's `/backend-api/` paths are private site implementation details and may change. Their stream-status response should be treated as evidence of the parent's stream state, not as an infallible account-wide job monitor.
