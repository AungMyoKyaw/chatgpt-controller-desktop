#!/usr/bin/env bun
/**
 * Local ChatGPT browser bridge. Uses the signed-in, headed Playwright browser.
 * It does NOT copy, export, or replay ChatGPT bearer tokens or session cookies.
 * The site itself uses its internal APIs as usual.
 */
import { spawn } from "bun";

export type BrowserChatRequest = { prompt: string; newChat?: boolean; conversationPath?: string };
export type BrowserChatResponse = { reply: string; conversationPath: string | null };
export type Runner = (code: string, session: string) => Promise<string>;

export class BrowserBridgeError extends Error {
  constructor(message: string, public readonly status: number = 502) { super(message); }
}
const DEFAULT_SESSION = "chatgpt-research";
const DEFAULT_TIMEOUT_MS = 125_000;

function scriptForChat(prompt: string, newChat: boolean, conversationPath?: string): string {
  return `async (page) => {
    if (await page.getByRole("button", {name:"Open profile menu"}).count() === 0)
      return {error:"LOGIN_REQUIRED"};
    if (${JSON.stringify(conversationPath || null)}) await page.goto("https://chatgpt.com" + ${JSON.stringify(conversationPath || null)});
    else if (${newChat}) await page.goto("https://chatgpt.com/");
    const composer = page.getByRole("textbox", {name:/Ask ChatGPT|Chat with ChatGPT/});
    await composer.waitFor({state:"visible", timeout:15000});
    if (${JSON.stringify(conversationPath || null)}) {
      const region=page.getByRole("region",{name:"Conversation"});
      if ((await region.innerText()).includes("Could not load this ChatGPT conversation") ||
          await region.getByText("You said:",{exact:true}).count()===0)
        return {error:"UNAVAILABLE"};
    }
    const before = await page.getByText("ChatGPT said:", {exact:true}).count();
    await composer.fill(${JSON.stringify(prompt)});
    await composer.press("Enter");
    const startedAt = Date.now();
    let found = false;
    let previous = "", stable = 0;
    while (Date.now() - startedAt < 110000) {
      const headings = page.getByText("ChatGPT said:", {exact:true});
      if (await headings.count() > before) found = true;
      if (found) {
        const message = (await headings.last().locator("xpath=..").innerText())
          .replace(/^ChatGPT said:\\s*/,"").trim();
        if (message && message === previous) stable++; else stable=0;
        previous=message;
        // Wait for stable visible text; old regenerate controls may remain visible.
        if (message && stable >= 8) {
          const path=page.url().replace(/^https:\\/\\/chatgpt\\.com/, "");
          return {reply:message,conversationPath:/^\\/c\\/[A-Za-z0-9-]+/.test(path)?path:null};
        }
      }
      await page.waitForTimeout(500);
    }
    return {error:found?"RESPONSE_TIMEOUT":"NO_RESPONSE"};
  }`;
}
export async function cliRunner(code: string, session: string): Promise<string> {
  const subprocess = spawn(["playwright-cli", `-s=${session}`, "run-code", code], {
    stdout: "pipe", stderr: "pipe",
    env: { ...process.env }
  });
  const timer = setTimeout(() => subprocess.kill(), DEFAULT_TIMEOUT_MS);
  try {
    const stdout = await new Response(subprocess.stdout).text();
    // Consume stderr but intentionally do NOT echo it; CLI errors may contain page/user content.
    await new Response(subprocess.stderr).text();
    const code = await subprocess.exited;
    if (code !== 0) throw new BrowserBridgeError("Playwright command failed. Check the persistent Chrome session.");
    const marker = "### Result\n";
    const start=stdout.indexOf(marker);
    if(start<0)throw new BrowserBridgeError("No structured browser result was returned");
    const line=stdout.slice(start+marker.length).split("\n")[0];
    return line;
  } finally { clearTimeout(timer); }
}

export async function sendChat(
  request: BrowserChatRequest,
  options: {session?:string; runner?:Runner} = {}
): Promise<BrowserChatResponse> {
  if(typeof request.prompt !== "string" || !request.prompt.trim()) throw new BrowserBridgeError("Prompt must be nonempty",400);
  if(request.prompt.length > 16000) throw new BrowserBridgeError("Prompt too long (maximum 16,000 characters)",413);
  const session=options.session||DEFAULT_SESSION;
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(session))throw new BrowserBridgeError("Invalid browser session",400);
  if (request.conversationPath && !/^\/c\/[0-9a-fA-F-]{36}$/.test(request.conversationPath))
    throw new BrowserBridgeError("Invalid conversation path",400);
  const code=scriptForChat(request.prompt,request.newChat!==false,request.conversationPath);
  let payload: unknown;
  try { payload=JSON.parse(await (options.runner||cliRunner)(code,session)); }
  catch(e) { if(e instanceof BrowserBridgeError)throw e; throw new BrowserBridgeError("Browser returned an invalid result"); }
  if(typeof payload!=="object" || payload===null)throw new BrowserBridgeError("Unexpected browser response");
  const result=payload as Record<string,unknown>;
  if(result.error==="LOGIN_REQUIRED")throw new BrowserBridgeError("Log in to the Chrome profile manually",401);
  if(result.error==="NO_RESPONSE"||result.error==="RESPONSE_TIMEOUT")throw new BrowserBridgeError("ChatGPT did not finish responding",504);
  if(result.error==="UNAVAILABLE")throw new BrowserBridgeError("Conversation unavailable; possible upstream rate limit",503);
  if(typeof result.reply!=="string")throw new BrowserBridgeError("No ChatGPT reply in browser result");
  return {reply:result.reply,conversationPath:typeof result.conversationPath==="string"?result.conversationPath:null};
}
if(import.meta.main){
  const [command,...words] = process.argv.slice(2);
  if(!["send","continue"].includes(command)){
    console.error("Usage: bun src/browser-chat.ts send <prompt> (or continue <prompt>)");
    process.exit(2);
  }
  const prompt=words.join(" ").trim() || (await Bun.stdin.text()).trim();
  try {console.log(JSON.stringify(await sendChat({prompt,newChat:command==="send"}),null,2));}
  catch(e) {console.error(e instanceof Error?e.message:"Unknown bridge error");process.exitCode=1;}
}
