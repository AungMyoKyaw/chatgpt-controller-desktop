import { test, expect } from "bun:test";
import {
  buildStatusScript,
  getConversationStatus,
  interpretStreamStatus,
  fetchUpstreamStreamStatus,
  buildDiscoverScript,
} from "./conversation-status.ts";
import { createHandler } from "./bridge-server.ts";

const id = "12345678-1234-1234-1234-123456789abc";
const other = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const secret = "test-key-is-longer-than-twenty-four";
const completed = {
  id,
  conversationPath: "/c/" + id,
  status: "completed" as const,
  in_progress: false,
  source: "upstream-stream-status" as const,
  upstream_status: "COMPLETE",
};

function req(path: string, method = "GET", body?: unknown) {
  return new Request("http://127.0.0.1:8791" + path, {
    method,
    headers: {
      "X-Bridge-Key": secret,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("tab checker never navigates conversations", () => {
  const script = buildStatusScript(id);
  expect(script).toContain("page.context().pages()");
  expect(script).toContain("not_open");
  expect(script).not.toContain(".goto(");
  expect(buildDiscoverScript(5)).toContain("loaded-sidebar-only");
  expect(() => buildDiscoverScript(101)).toThrow();
});

test("upstream status mapping handles completed, active, failed, unavailable", () => {
  const cases = [
    ["COMPLETE", "completed", false],
    ["IN_PROGRESS", "in_progress", true],
    ["STREAMING", "in_progress", true],
    ["ERROR", "failed", false],
    ["INTERRUPTED", "failed", false],
    ["nonsense", "unavailable", null],
  ] as const;
  for (const [upstream, expected, progress] of cases) {
    const result = interpretStreamStatus(id, { status: upstream });
    expect(result.status).toBe(expected);
    expect(result.in_progress).toBe(progress);
    expect(result.upstream_status).toBe(upstream);
  }
  expect(interpretStreamStatus(id, {}).status).toBe("unavailable");
});

test("closed conversation receives upstream status rather than unknown", async () => {
  let fetched = false;
  const s = await getConversationStatus(id, {
    runner: async () => JSON.stringify({ status: "not_open" }),
    upstream: async () => {
      fetched = true;
      return completed;
    },
  });
  expect(fetched).toBe(true);
  expect(s.status).toBe("completed");
  expect(s.source).toBe("upstream-stream-status");
});

test("upstream wins stale idle UI; live stop button wins immediately", async () => {
  const s = await getConversationStatus(id, {
    runner: async () => JSON.stringify({ status: "completed" }),
    upstream: async () => ({
      ...completed,
      status: "in_progress",
      in_progress: true,
    }),
  });
  expect(s.status).toBe("in_progress");
  const active = await getConversationStatus(id, {
    runner: async () => JSON.stringify({ status: "in_progress" }),
    upstream: async () => {
      throw Error("must not fetch");
    },
  });
  expect(active.status).toBe("in_progress");
  expect(active.source).toBe("browser-ui");
});

test("temporary upstream tab is closed after reading status", async () => {
  const calls: string[][] = [];
  const result = await fetchUpstreamStreamStatus(
    id,
    "chatgpt-controller",
    async (args) => {
      calls.push(args);
      if (args[0] === "tab-new") return "- 2: (current) [](" + args[1] + ")";
      if (args[0] === "eval")
        return '### Result\n"{\\"status\\":\\"COMPLETE\\"}"\n### Ran Playwright code\n';
      return "closed";
    },
  );
  expect(result.status).toBe("completed");
  expect(calls.map((x) => x[0])).toEqual(["tab-new", "eval", "tab-close"]);
  expect(calls[2][1]).toBe("2");
});

test("authenticated single and multi-ID routes", async () => {
  const seen: string[] = [];
  const handler = createHandler({
    key: secret,
    status: async (value) => {
      seen.push(value);
      return { ...completed, id: value, conversationPath: "/c/" + value };
    },
  });
  const single = await handler(req("/v1/conversations/" + id + "/status"));
  expect(single.status).toBe(200);
  expect((await single.json()).status).toBe("completed");
  const batch = await handler(
    req("/v1/conversations/statuses", "POST", { ids: [id, other, id] }),
  );
  expect(batch.status).toBe(200);
  const data = await batch.json();
  expect(data.scope).toBe("explicit-ids");
  expect(data.count).toBe(2);
  expect(data.summary.completed).toBe(2);
  expect(seen).toEqual([id, id, other]);
  expect(
    (await handler(req("/v1/conversations/statuses", "POST", { ids: [] })))
      .status,
  ).toBe(400);
});

test("sidebar batch explicitly reports incomplete coverage", async () => {
  const handler = createHandler({
    key: secret,
    discover: async () => ({
      conversations: [{ id, title: "Test" }],
      total: 2,
      limit: 10,
      offset: 0,
      hasMore: true,
      scope: "account-conversations",
    }),
    status: async () => completed,
  });
  const response = await handler(req("/v1/conversations/statuses?limit=10"));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.scope).toBe("account-conversations");
  expect(result.count).toBe(1);
  expect(result.hasMore).toBe(true);
  expect(result.total).toBe(2);
  expect(
    (await handler(req("/v1/conversations/statuses?limit=100"))).status,
  ).toBe(400);
});
