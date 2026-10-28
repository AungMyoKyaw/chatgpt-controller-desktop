#!/usr/bin/env bun
/**
 * Local ChatGPT browser bridge. Uses the signed-in, headed Playwright browser.
 * It does NOT copy, export, or replay ChatGPT bearer tokens or session cookies.
 * The site itself uses its internal APIs as usual.
 */
import { spawn } from "bun";

export type BrowserChatRequest = {
  prompt: string;
  newChat?: boolean;
  conversationPath?: string;
};
export type BrowserChatResponse = {
  reply: string;
  conversationPath: string | null;
};
export type Runner = (code: string, session: string) => Promise<string>;

export class BrowserBridgeError extends Error {
  constructor(
    message: string,
    public readonly status: number = 502,
  ) {
    super(message);
  }
}
const DEFAULT_SESSION = "chatgpt-research";
const DEFAULT_TIMEOUT_MS = 125_000;

export { buildChatScript } from "./chat-script.ts";
import { buildChatScript } from "./chat-script.ts";

export async function cliRunner(
  code: string,
  session: string,
): Promise<string> {
  const subprocess = spawn(
    ["playwright-cli", `-s=${session}`, "run-code", code],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    },
  );
  const timer = setTimeout(() => subprocess.kill(), DEFAULT_TIMEOUT_MS);
  try {
    // Drain stdout/stderr concurrently: a full stderr pipe must not stall the
    // child while the parent is waiting for stdout to complete.
    const [stdout, , code] = await Promise.all([
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
      subprocess.exited,
    ]);
    if (code !== 0)
      throw new BrowserBridgeError(
        "Playwright command failed. Check the persistent Chrome session.",
      );
    const marker = "### Result\n";
    const start = stdout.indexOf(marker);
    if (start < 0)
      throw new BrowserBridgeError("No structured browser result was returned");
    const line = stdout.slice(start + marker.length).split("\n")[0];
    return line;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendChat(
  request: BrowserChatRequest,
  options: { session?: string; runner?: Runner } = {},
): Promise<BrowserChatResponse> {
  if (typeof request.prompt !== "string" || !request.prompt.trim())
    throw new BrowserBridgeError("Prompt must be nonempty", 400);
  if (request.prompt.length > 16000)
    throw new BrowserBridgeError(
      "Prompt too long (maximum 16,000 characters)",
      413,
    );
  const session = options.session || DEFAULT_SESSION;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(session))
    throw new BrowserBridgeError("Invalid browser session", 400);
  if (
    request.conversationPath &&
    !/^\/c\/[0-9a-fA-F-]{36}$/.test(request.conversationPath)
  )
    throw new BrowserBridgeError("Invalid conversation path", 400);
  const code = buildChatScript(
    request.prompt,
    request.newChat !== false,
    request.conversationPath,
  );
  let payload: unknown;
  try {
    payload = JSON.parse(await (options.runner || cliRunner)(code, session));
  } catch (e) {
    if (e instanceof BrowserBridgeError) throw e;
    throw new BrowserBridgeError("Browser returned an invalid result");
  }
  if (typeof payload !== "object" || payload === null)
    throw new BrowserBridgeError("Unexpected browser response");
  const result = payload as Record<string, unknown>;
  if (result.error === "LOGIN_REQUIRED")
    throw new BrowserBridgeError("Log in to the Chrome profile manually", 401);
  if (result.error === "NO_RESPONSE" || result.error === "RESPONSE_TIMEOUT")
    throw new BrowserBridgeError("ChatGPT did not finish responding", 504);
  if (result.error === "UNAVAILABLE")
    throw new BrowserBridgeError(
      "Conversation unavailable; possible upstream rate limit",
      503,
    );
  if (typeof result.reply !== "string")
    throw new BrowserBridgeError("No ChatGPT reply in browser result");
  return {
    reply: result.reply,
    conversationPath:
      typeof result.conversationPath === "string"
        ? result.conversationPath
        : null,
  };
}
if (import.meta.main) {
  const [command, ...words] = process.argv.slice(2);
  if (!["send", "continue"].includes(command)) {
    console.error(
      "Usage: bun src/browser-chat.ts send <prompt> (or continue <prompt>)",
    );
    process.exit(2);
  }
  const prompt = words.join(" ").trim() || (await Bun.stdin.text()).trim();
  try {
    console.log(
      JSON.stringify(
        await sendChat({ prompt, newChat: command === "send" }),
        null,
        2,
      ),
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : "Unknown bridge error");
    process.exitCode = 1;
  }
}
