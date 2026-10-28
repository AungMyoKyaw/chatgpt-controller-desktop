import { test, expect } from "bun:test";
import { buildChatScript } from "./chat-script.ts";
import { sendChat } from "./browser-chat.ts";

const path = "/c/12345678-1234-1234-1234-123456789abc";

function fakeBrowser(initialUrl: string) {
  let currentUrl = initialUrl;
  let navigations = 0;
  let sent = false;
  let stopChecks = 0;
  const composer = {
    waitFor: async () => {},
    fill: async () => {},
    press: async () => {
      sent = true;
    },
  };
  const headings = {
    count: async () => (sent ? 2 : 1),
    last: () => ({
      locator: () => ({
        innerText: async () => "ChatGPT said: CTRL_SPEED_TEST_OK",
      }),
    }),
  };
  const tab: any = {
    isClosed: () => false,
    url: () => currentUrl,
    context: () => ({ pages: () => [tab] }),
    goto: async (value: string) => {
      navigations++;
      currentUrl = value;
    },
    getByRole: (role: string, options: { name: string }) => {
      if (role === "button" && options.name === "Stop")
        return { count: async () => (++stopChecks === 1 ? 1 : 0) };
      if (role === "button" && options.name === "Open profile menu")
        return { count: async () => 1 };
      if (role === "textbox") return composer;
      if (role === "region")
        return {
          innerText: async () => "You said: hello",
          getByText: () => ({ count: async () => 1 }),
        };
      throw Error("Unexpected role: " + role);
    },
    getByText: () => headings,
    waitForTimeout: async () => {},
  };
  return {
    tab,
    get navigations() {
      return navigations;
    },
  };
}

test("chat send skips navigation for a tab already showing the target conversation", async () => {
  const fake = fakeBrowser("https://chatgpt.com" + path);
  const code = buildChatScript("Reply exactly CTRL_SPEED_TEST_OK", false, path);
  expect(code).toContain("sawStop && stable>=2");
  expect(code).toContain("tab.waitForTimeout(200)");
  const fn = new Function("return (" + code + ")")() as (
    page: any,
  ) => Promise<any>;
  const result = await fn(fake.tab);
  expect(result).toEqual({
    reply: "CTRL_SPEED_TEST_OK",
    conversationPath: path,
  });
  expect(fake.navigations).toBe(0);
});

test("a different requested conversation is navigated only once", async () => {
  const fake = fakeBrowser("https://chatgpt.com/");
  const code = buildChatScript("Reply exactly CTRL_SPEED_TEST_OK", false, path);
  const fn = new Function("return (" + code + ")")() as (
    page: any,
  ) => Promise<any>;
  const result = await fn(fake.tab);
  expect(result.conversationPath).toBe(path);
  expect(fake.navigations).toBe(1);
});

test("sendChat validates input and preserves browser runner contract", async () => {
  await expect(sendChat({ prompt: "" })).rejects.toMatchObject({ status: 400 });
  let calls = 0;
  const response = await sendChat(
    { prompt: "Hello", newChat: true },
    {
      session: "chatgpt-controller",
      runner: async (script) => {
        calls++;
        expect(script).toContain("const targetPath = null");
        return JSON.stringify({ reply: "ACK", conversationPath: path });
      },
    },
  );
  expect(calls).toBe(1);
  expect(response).toEqual({ reply: "ACK", conversationPath: path });
});
