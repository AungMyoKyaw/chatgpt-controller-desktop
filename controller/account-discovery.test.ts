import { test, expect } from "bun:test";
import {
  buildAccountDiscoveryScript,
  discoverAccountConversations,
} from "./conversation-status.ts";

const id = "12345678-1234-1234-1234-123456789abc";
test("production account discovery does not navigate or focus tabs", async () => {
  const script = buildAccountDiscoveryScript(3, 6);
  expect(script).toContain("page.context().request");
  expect(script).not.toContain("tab-new");
  expect(script).not.toContain(".goto(");
  let calls = 0;
  const result = await discoverAccountConversations(3, 6, {
    runner: async (code) => {
      calls++;
      expect(code).toContain("offset=6&limit=3");
      return JSON.stringify({
        total: 10,
        conversations: [{ id, title: "Example" }],
      });
    },
  });
  expect(result.scope).toBe("account-conversations");
  expect(result.total).toBe(10);
  expect(result.offset).toBe(6);
  expect(calls).toBe(1);
});

test("account-wide discovery pages and closes its temporary auth tab", async () => {
  const actions: string[] = [];
  const result = await discoverAccountConversations(5, 10, {
    command: async (args) => {
      actions.push(args[0]);
      if (args[0] === "tab-new") return "- 3: (current) [](" + args[1] + ")";
      if (args[0] === "run-code") return '### Result\n{"authenticated":true}\n';
      if (args[0] === "eval")
        return (
          "### Result\n" +
          JSON.stringify({
            total: 16,
            limit: 5,
            offset: 10,
            conversations: [{ id, title: "Example" }],
          }) +
          "\n"
        );
      return "";
    },
  });
  expect(result.scope).toBe("account-conversations");
  expect(result.offset).toBe(10);
  expect(result.total).toBe(16);
  expect(result.hasMore).toBe(true);
  expect(result.conversations).toEqual([{ id, title: "Example" }]);
  expect(actions).toEqual(["tab-new", "run-code", "goto", "eval", "tab-close"]);
});

test("account discovery rejects invalid paging inputs", async () => {
  await expect(discoverAccountConversations(51)).rejects.toMatchObject({
    status: 400,
  });
  await expect(discoverAccountConversations(10, -1)).rejects.toMatchObject({
    status: 400,
  });
});

test("unauthenticated discovery closes the temporary tab", async () => {
  const actions: string[] = [];
  await expect(
    discoverAccountConversations(2, 0, {
      command: async (args) => {
        actions.push(args[0]);
        if (args[0] === "tab-new") return "- 1: (current) [](" + args[1] + ")";
        if (args[0] === "run-code")
          return '### Result\n{"authenticated":false}\n';
        return "";
      },
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect(actions).toEqual(["tab-new", "run-code", "tab-close"]);
});
