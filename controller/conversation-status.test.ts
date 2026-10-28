import { test, expect } from "bun:test";
import { createHandler } from "./bridge-server.ts";
import {
  buildStatusScript,
  getConversationStatus,
} from "./conversation-status.ts";

const id = "12345678-1234-1234-1234-123456789abc";
const secret = "test-key-is-longer-than-twenty-four";
const url = "http://127.0.0.1:8791";
function request(
  path: string,
  method = "GET",
  body?: unknown,
  key = secret,
): Request {
  return new Request(url + path, {
    method,
    headers: {
      "X-Bridge-Key": key,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("status checker inspects only already-open tabs, never navigates", () => {
  const script = buildStatusScript(id);
  expect(script).toContain("page.context().pages()");
  expect(script).toContain("name:'Stop', exact:true");
  expect(script).toContain("conversation_not_open");
  expect(script).not.toContain(".goto(");
  expect(() => buildStatusScript("nope")).toThrow();
});

test("status checker recognizes in-progress, completed, and unknown", async () => {
  for (const [raw, expected] of [
    [{ status: "in_progress" }, true],
    [{ status: "completed" }, false],
    [{ status: "unknown", reason: "conversation_not_open" }, null],
  ] as const) {
    const result = await getConversationStatus(id, {
      runner: async () => JSON.stringify(raw),
    });
    expect(result.status).toBe(raw.status);
    expect(result.in_progress).toBe(expected);
    expect(result.conversationPath).toBe("/c/" + id);
    expect(result.source).toBe("browser-ui");
  }
});

test("status checker rejects invalid browser state", async () => {
  await expect(
    getConversationStatus(id, { runner: async () => '{"status":"done"}' }),
  ).rejects.toMatchObject({ status: 502 });
  await expect(
    getConversationStatus(id, { runner: async () => "broken" }),
  ).rejects.toMatchObject({ status: 502 });
  await expect(
    getConversationStatus(id, {
      session: "../malicious",
      runner: async () => "",
    }),
  ).rejects.toMatchObject({ status: 400 });
});

test("authenticated status route reads browser state while idle", async () => {
  const requests: string[] = [];
  const handler = createHandler({
    key: secret,
    status: async (conversationId) => {
      requests.push(conversationId);
      return {
        id: conversationId,
        conversationPath: "/c/" + conversationId,
        status: "completed",
        in_progress: false,
        source: "browser-ui",
      };
    },
  });
  const result = await handler(request("/v1/conversations/" + id + "/status"));
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({
    status: "completed",
    in_progress: false,
  });
  expect(requests).toEqual([id]);
  expect(
    (
      await handler(
        request(
          "/v1/conversations/" + id + "/status",
          "GET",
          undefined,
          "wrong",
        ),
      )
    ).status,
  ).toBe(401);
  expect(
    (await handler(request("/v1/conversations/not-a-uuid/status"))).status,
  ).toBe(404);
  expect(
    (await handler(request("/v1/conversations/" + id + "/status", "POST", {})))
      .status,
  ).toBe(404);
});

test("status polling remains responsive during an in-flight chat", async () => {
  let resolveStarted!: () => void;
  let resolveChat!: () => void;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    resolveChat = resolve;
  });
  const handler = createHandler({
    key: secret,
    send: async () => {
      resolveStarted();
      await waiting;
      return { reply: "ready", conversationPath: "/c/" + id };
    },
    status: async (conversationId) => ({
      id: conversationId,
      conversationPath: "/c/" + conversationId,
      status: "completed",
      in_progress: false,
      source: "browser-ui",
    }),
  });
  const inFlight = handler(
    request("/v1/chat", "POST", {
      prompt: "test",
      conversation_path: "/c/" + id,
    }),
  );
  await started;
  try {
    const statusResult = await handler(
      request("/v1/conversations/" + id + "/status"),
    );
    expect(statusResult.status).toBe(200);
    expect(await statusResult.json()).toMatchObject({
      status: "in_progress",
      in_progress: true,
      source: "local-operation",
    });
    const otherId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const other = await handler(
      request("/v1/conversations/" + otherId + "/status"),
    );
    expect(await other.json()).toMatchObject({
      status: "unknown",
      in_progress: null,
      reason: "browser_operation_busy",
    });
    expect((await handler(request("/v1/conversations?limit=5"))).status).toBe(
      429,
    );
  } finally {
    resolveChat();
  }
  expect((await inFlight).status).toBe(200);
  const after = await handler(request("/v1/conversations/" + id + "/status"));
  expect(await after.json()).toMatchObject({
    status: "completed",
    in_progress: false,
  });
});
