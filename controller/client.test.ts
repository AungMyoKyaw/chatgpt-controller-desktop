import { test, expect } from "bun:test";
import { ChatGPTControllerClient } from "./controller-client.ts";
const sampleId = "12345678-1234-1234-1234-123456789abc";
test("typed client targets exact conversation routes", async () => {
  const seen: { method: string; path: string; body: string }[] = [];
  const fakeFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const u = new URL(String(input));
    seen.push({
      method: init?.method || "GET",
      path: u.pathname,
      body: String(init?.body || ""),
    });
    return Response.json({
      conversations: [],
      reply: "ACK",
      conversation_path: "/c/" + sampleId,
    });
  };
  const client = new ChatGPTControllerClient(
    "local-secret",
    "http://127.0.0.1:8791",
    fakeFetch as typeof fetch,
  );
  await client.list(3);
  await client.read(sampleId);
  await client.status(sampleId);
  await client.statuses([sampleId]);
  await client.statuses(undefined, 5);
  await client.send("Hello", sampleId);
  await client.rename(sampleId, "My scratch chat");
  expect(seen.map((x) => x.method)).toEqual([
    "GET",
    "GET",
    "GET",
    "POST",
    "GET",
    "POST",
    "PATCH",
  ]);
  expect(seen[1].path).toBe("/v1/conversations/" + sampleId + "/messages");
  expect(seen[2].path).toBe("/v1/conversations/" + sampleId + "/status");
  expect(seen[3].path).toBe("/v1/conversations/statuses");
  expect(seen[4].path).toBe("/v1/conversations/statuses");
  expect(seen[5].body).toContain("/c/" + sampleId);
});
test("typed client restricts URLs and delete confirmation", async () => {
  expect(
    () => new ChatGPTControllerClient("secret", "http://example.com"),
  ).toThrow();
  const client = new ChatGPTControllerClient("test-local-secret");
  expect(client.delete(sampleId, false)).rejects.toThrow();
  expect(client.read("unexpected-id")).rejects.toThrow();
});
