import { test, expect } from "bun:test";
import { discoverAccountConversations } from "./conversation-status.ts";

const id = "12345678-1234-1234-1234-123456789abc";
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
