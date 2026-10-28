import { test, expect } from "bun:test";
import {
  buildFastReadScript,
  buildFastMutationScript,
  buildControlScript,
} from "./conversation-control.ts";

const id = "12345678-1234-1234-1234-123456789abc";

test("read uses API request context without browser navigation", () => {
  const script = buildFastReadScript(id, 20);
  expect(script).toContain("page.context().request");
  expect(script).toContain("/backend-api/conversations/");
  expect(script).toContain("json.messages");
  expect(script).not.toContain(".goto(");
  expect(script).not.toContain("tab-new");
  expect(() => buildFastReadScript("unsafe", 10)).toThrow();
  expect(() => buildFastReadScript(id, 101)).toThrow();
});

test("opening an already-loaded chat avoids redundant navigation", () => {
  const script = buildControlScript({ action: "open", id });
  expect(script).toContain("alreadyOpen:true");
  expect(script).toContain("tab.url().split");
  expect(script).toContain("if (page.url().split");
});

test("rename, archive and delete use authenticated PATCH without browser navigation", () => {
  const mutations = [
    [
      { action: "rename" as const, id, title: "A test title" },
      '"title":"A test title"',
    ],
    [{ action: "archive" as const, id }, '"is_archived":true'],
    [{ action: "delete" as const, id, confirm: true }, '"is_visible":false'],
  ] as const;
  for (const [req, body] of mutations) {
    const script = buildFastMutationScript({ ...req });
    expect(script).toContain("/backend-api/conversation/");
    expect(script).toContain("ctx.patch");
    expect(script).toContain(body);
    expect(script).not.toContain(".goto(");
    expect(script).not.toContain("tab-new");
    expect(script).not.toContain("bringToFront");
  }
  expect(() => buildFastMutationScript({ action: "delete", id })).toThrow();
  expect(() =>
    buildFastMutationScript({ action: "rename", id, title: "" }),
  ).toThrow();
  expect(() =>
    buildFastMutationScript({ action: "archive", id: "unsafe" }),
  ).toThrow();
});
