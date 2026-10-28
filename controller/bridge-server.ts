#!/usr/bin/env bun
/**
 * Authenticated local conversation controller for the signed-in ChatGPT browser UI.
 * This does not expose or replay browser auth headers, cookies or session tokens.
 */
import { timingSafeEqual } from "node:crypto";
import {
  BrowserBridgeError,
  sendChat,
  type BrowserChatRequest,
} from "./browser-chat.ts";
import {
  controlConversation,
  validateId,
  type ControlRequest,
} from "./conversation-control.ts";
type Inbound = {
  prompt?: string;
  conversation_path?: string;
  messages?: Array<{ role: string; content: unknown }>;
  model?: string;
  stream?: boolean;
  title?: string;
  confirm?: boolean;
};
export type HandlerDeps = {
  send?: typeof sendChat;
  control?: typeof controlConversation;
  key: string;
  session?: string;
};
function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
function equalSecret(expected: string, received: string): boolean {
  const a = Buffer.from(expected),
    b = Buffer.from(received);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
function userPrompt(payload: Inbound): string {
  if (typeof payload.prompt === "string") return payload.prompt;
  const last = payload.messages?.at(-1);
  if (last?.role === "user" && typeof last.content === "string")
    return last.content;
  throw new BrowserBridgeError("Expected prompt or final user message", 400);
}
function validPath(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\/c\/[0-9a-fA-F-]{36}$/.test(value))
    throw new BrowserBridgeError("Invalid conversation_path", 400);
  validateId(value.slice(3));
  return value;
}
async function getBody(req: Request): Promise<Inbound> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")
  )
    throw new BrowserBridgeError("Use application/json", 415);
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 72000) throw new BrowserBridgeError("Request is too large", 413);
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    throw new BrowserBridgeError("Unreadable request", 400);
  }
  if (raw.length > 72000)
    throw new BrowserBridgeError("Request is too large", 413);
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj))
      throw Error("Invalid object");
    return obj as Inbound;
  } catch {
    throw new BrowserBridgeError("Invalid JSON", 400);
  }
}
const uuid =
  "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})";
const conversationRoute = new RegExp(
  "^/v1/conversations/" + uuid + "(?:/(messages|open|archive))?$",
);
type Route =
  | { type: "chat"; standard: boolean }
  | { type: "list"; limit: number }
  | { type: "control"; action: ControlRequest["action"]; id: string }
  | null;
function matchRoute(
  method: string,
  path: string,
  params: URLSearchParams,
): Route {
  if (method === "POST" && path === "/v1/chat")
    return { type: "chat", standard: false };
  if (method === "POST" && path === "/v1/chat/completions")
    return { type: "chat", standard: true };
  if (method === "GET" && path === "/v1/conversations") {
    const raw = params.get("limit") || "25",
      limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BrowserBridgeError("Limit must be 1-100", 400);
    return { type: "list", limit };
  }
  const m = conversationRoute.exec(path);
  if (!m) return null;
  const [, id, suffix] = m;
  if (method === "GET" && (suffix === undefined || suffix === "messages"))
    return { type: "control", action: "read", id };
  if (method === "POST" && suffix === "open")
    return { type: "control", action: "open", id };
  if (method === "POST" && suffix === "archive")
    return { type: "control", action: "archive", id };
  if (method === "PATCH" && suffix === undefined)
    return { type: "control", action: "rename", id };
  if (method === "DELETE" && suffix === undefined)
    return { type: "control", action: "delete", id };
  return null;
}

export function createHandler(deps: HandlerDeps) {
  let busy = false;
  return async (req: Request): Promise<Response> => {
    const u = new URL(req.url);
    if (!["127.0.0.1", "localhost"].includes(u.hostname))
      return json({ error: "Loopback only" }, 403);
    if (req.method === "GET" && u.pathname === "/health")
      return json({ ok: true, transport: "authenticated-browser-ui", busy });
    if (!equalSecret(deps.key, req.headers.get("x-bridge-key") || ""))
      return json({ error: "Unauthorized" }, 401);
    let route: Route;
    try {
      route = matchRoute(req.method, u.pathname, u.searchParams);
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "Invalid route" },
        400,
      );
    }
    if (!route) return json({ error: "Not found" }, 404);
    if (busy)
      return json({ error: "Another browser operation is in progress" }, 429);
    busy = true;
    try {
      let data: Inbound = {};
      if (req.method !== "GET") {
        try {
          data = await getBody(req);
        } catch (e) {
          return json(
            { error: e instanceof Error ? e.message : "Invalid request" },
            e instanceof BrowserBridgeError ? e.status : 400,
          );
        }
      }
      let input: ControlRequest | BrowserChatRequest;
      try {
        if (route.type === "chat") {
          if (data.stream)
            throw new BrowserBridgeError(
              "True token-by-token streaming is not implemented; use stream:false",
              422,
            );
          if (data.model && data.model !== "chatgpt-web")
            throw new BrowserBridgeError("Only chatgpt-web is supported", 422);
          const path = validPath(data.conversation_path);
          input = {
            prompt: userPrompt(data),
            conversationPath: path,
            newChat: !path,
          };
        } else if (route.type === "list") {
          input = { action: "list", limit: route.limit };
        } else {
          const action = route.action,
            id = validateId(route.id);
          if (action === "rename") {
            if (typeof data.title !== "string")
              throw new BrowserBridgeError("Expected title string", 400);
            input = { action, id, title: data.title };
          } else if (action === "delete") {
            if (data.confirm !== true)
              throw new BrowserBridgeError("Delete requires confirm:true", 400);
            input = { action, id, confirm: true };
          } else input = { action, id };
        }
      } catch (e) {
        return json(
          { error: e instanceof Error ? e.message : "Invalid input" },
          e instanceof BrowserBridgeError ? e.status : 400,
        );
      }
      try {
        if (route.type === "chat") {
          const result = await (deps.send || sendChat)(
            input as BrowserChatRequest,
            { session: deps.session },
          );
          if (!route.standard)
            return json({
              reply: result.reply,
              conversation_path: result.conversationPath,
              transport: "authenticated-browser-ui",
            });
          return json({
            id: "chatcmpl-local-" + crypto.randomUUID(),
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: "chatgpt-web",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: result.reply },
                finish_reason: "stop",
              },
            ],
            conversation_path: result.conversationPath,
            transport: "authenticated-browser-ui",
          });
        }
        const result = await (deps.control || controlConversation)(
          input as ControlRequest,
          { session: deps.session },
        );
        return json(result);
      } catch (e) {
        return json(
          {
            error:
              e instanceof BrowserBridgeError
                ? e.message
                : "Browser operation failed",
          },
          e instanceof BrowserBridgeError ? e.status : 502,
        );
      }
    } finally {
      busy = false;
    }
  };
}

if (import.meta.main) {
  // Exit when the owning desktop process disappears. Standalone launches are unaffected.
  const parentPid = Number(process.env.CHATGPT_CONTROLLER_PARENT_PID || 0);
  if (Number.isInteger(parentPid) && parentPid > 1) {
    const verifyParent = () => {
      try {
        process.kill(parentPid, 0);
      } catch {
        process.exit(0);
      }
    };
    verifyParent();
    setInterval(verifyParent, 1500).unref();
  }
  const key = process.env.CHATGPT_BRIDGE_KEY;
  if (!key || key.length < 24) {
    console.error(
      "Set CHATGPT_BRIDGE_KEY to a random secret of at least 24 characters.",
    );
    process.exit(2);
  }
  const port = Number(process.env.CHATGPT_BRIDGE_PORT || "8791");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error("Invalid port");
    process.exit(2);
  }
  Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: createHandler({
      key,
      session: process.env.CHATGPT_BROWSER_SESSION || "chatgpt-research",
    }),
  });
  console.log(
    `Conversation bridge listening on http://127.0.0.1:${port} (local key required)`,
  );
}
