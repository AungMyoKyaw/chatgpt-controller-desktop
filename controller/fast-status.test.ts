import { test, expect } from "bun:test";
import { createHandler } from "./bridge-server.ts";
import {
  buildFastStatusScript,
  fetchFastStreamStatuses,
} from "./conversation-status.ts";

const one = "12345678-1234-1234-1234-123456789abc";
const two = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const three = "99999999-8888-7777-6666-555555555555";
const secret = "test-secret-with-at-least-24-characters";

function req(path: string, method = "GET", body?: unknown): Request {
  return new Request("http://127.0.0.1:8791" + path, {
    method,
    headers: {
      "X-Bridge-Key": secret,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("fast script uses temporary invisible iframes without opening tabs", () => {
  const script = buildFastStatusScript([one, two]);
  expect(script).toContain("document.createElement('iframe')");
  expect(script).toContain("display:none!important");
  expect(script).toContain("Math.min(8,targets.length)");
  expect(script).toContain("frame.remove()");
  expect(script).toContain("context().pages()");
  expect(script).not.toContain("tab-new");
  expect(script).not.toContain(".goto(");
  expect(script).not.toContain("accessToken");
  expect(() => buildFastStatusScript([])).toThrow();
  expect(() => buildFastStatusScript(["not-a-uuid"])).toThrow();
  expect(() => buildFastStatusScript(Array(51).fill(one))).toThrow();
});

test("fast batch maps upstream states and preserves order", async () => {
  let calls = 0;
  const statuses = await fetchFastStreamStatuses([one, two, three], {
    runner: async (script, session) => {
      calls++;
      expect(session).toBe("chatgpt-controller");
      expect(script).toContain(one);
      return JSON.stringify({
        results: [
          { id: one, payload: { status: "COMPLETE" } },
          { id: two, payload: { status: "IS_STREAMING" } },
          { id: three, error: "upstream_timeout" },
        ],
      });
    },
  });
  expect(calls).toBe(1);
  expect(statuses.map((s) => s.status)).toEqual([
    "completed",
    "in_progress",
    "unavailable",
  ]);
  expect(statuses.map((s) => s.in_progress)).toEqual([false, true, null]);
  expect(statuses[1].upstream_status).toBe("IS_STREAMING");
  expect(statuses[2].reason).toBe("upstream_timeout");
});

test("visible stop button wins over upstream while preserving batch results", async () => {
  const statuses = await fetchFastStreamStatuses([one, two], {
    runner: async () =>
      JSON.stringify({
        results: [
          { id: one, status: "in_progress", source: "browser-ui" },
          { id: two, payload: { status: "COMPLETE" } },
        ],
      }),
  });
  expect(statuses[0]).toMatchObject({
    status: "in_progress",
    source: "browser-ui",
  });
  expect(statuses[1]).toMatchObject({
    status: "completed",
    source: "upstream-stream-status",
  });
});

test("invalid or unavailable browser results never pretend completed", async () => {
  const a = await fetchFastStreamStatuses([one], {
    runner: async () => "broken",
  });
  const b = await fetchFastStreamStatuses([one], {
    runner: async () => JSON.stringify({ results: [] }),
  });
  expect(a[0].status).toBe("unavailable");
  expect(b[0].status).toBe("unavailable");
  await expect(
    fetchFastStreamStatuses([one], { session: "unsafe/../session" }),
  ).rejects.toMatchObject({ status: 400 });
});

test("batch polling during in-flight chat returns known active state without starting browser work", async () => {
  let release!: () => void;
  let started!: () => void;
  const sent = new Promise<void>((resolve) => (started = resolve));
  const pending = new Promise<void>((resolve) => (release = resolve));
  const handler = createHandler({
    key: secret,
    send: async () => {
      started();
      await pending;
      return { reply: "ready", conversationPath: "/c/" + one };
    },
    batchStatus: async () => {
      throw Error("must not enter browser while busy");
    },
  });
  const sending = handler(
    req("/v1/chat", "POST", { prompt: "Test", conversation_path: "/c/" + one }),
  );
  await sent;
  try {
    const response = await handler(
      req("/v1/conversations/statuses", "POST", { ids: [one, two] }),
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.summary.in_progress).toBe(1);
    expect(data.summary.unavailable).toBe(1);
    expect(data.statuses[0]).toMatchObject({
      id: one,
      status: "in_progress",
      source: "local-operation",
    });
    expect(data.statuses[1]).toMatchObject({
      id: two,
      status: "unavailable",
      reason: "browser_operation_busy",
    });
  } finally {
    release();
  }
  expect((await sending).status).toBe(200);
});

test("bulk API uses one browser call and caches discovered IDs but not statuses", async () => {
  let discovered = 0;
  let checks = 0;
  const handler = createHandler({
    key: secret,
    discover: async () => {
      discovered++;
      return {
        conversations: [
          { id: one, title: "One" },
          { id: two, title: "Two" },
        ],
        total: 2,
        limit: 2,
        offset: 0,
        hasMore: false,
        scope: "account-conversations",
      };
    },
    batchStatus: async (ids) => {
      checks++;
      return ids.map((id) => ({
        id,
        conversationPath: "/c/" + id,
        status: checks === 1 ? "in_progress" : "completed",
        in_progress: checks === 1,
        source: "upstream-stream-status",
      }));
    },
  });
  const first = await (
    await handler(req("/v1/conversations/statuses?limit=2"))
  ).json();
  const second = await (
    await handler(req("/v1/conversations/statuses?limit=2"))
  ).json();
  expect(first.summary.in_progress).toBe(2);
  expect(second.summary.completed).toBe(2);
  expect(discovered).toBe(1);
  expect(checks).toBe(2);
});
