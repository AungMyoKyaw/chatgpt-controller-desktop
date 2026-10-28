#!/usr/bin/env bun
/** Controllable browser UI for locally signed-in ChatGPT. No session-token extraction. */
import { cliRunner, BrowserBridgeError, type Runner } from "./browser-chat.ts";

export type Action = "list" | "open" | "read" | "rename" | "archive" | "delete";
export type ControlRequest = {
  action: Action;
  id?: string;
  title?: string;
  confirm?: boolean;
  limit?: number;
};
export type ControlResult = Record<string, unknown>;
const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function validateId(id: string): string {
  if (!UUID.test(id))
    throw new BrowserBridgeError("Invalid conversation ID", 400);
  return id.toLowerCase();
}
export function buildControlScript(request: ControlRequest): string {
  const id = request.id ? validateId(request.id) : null;
  const limit = Math.min(100, Math.max(1, request.limit ?? 25));
  const title =
    request.title === undefined ? null : JSON.stringify(request.title);
  return `async (page) => {
    const action=${JSON.stringify(request.action)};
    const id=${JSON.stringify(id)};
    const limit=${limit};
    if(await page.getByRole("button",{name:"Open profile menu"}).count()===0)
      return {error:"LOGIN_REQUIRED"};
    if(action==="list"){
      await page.goto("https://chatgpt.com/");
      await page.locator('a[href^="/c/"]').first().waitFor({state:"attached",timeout:10000}).catch(()=>{});
      const items=await page.locator('a[href^="/c/"]').evaluateAll(links=>links.map(a=>({
        id:(a.getAttribute("href")||"").slice(3),
        title:(a.textContent||"").trim().slice(0,250)
      })).filter(x=>/^[0-9a-f-]{36}$/i.test(x.id)));
      const unique=Array.from(new Map(items.map(x=>[x.id,x])).values());
      return {conversations:unique.slice(0,limit),visibleCount:unique.length,scope:"loaded-sidebar-only"};
    }
    const target="https://chatgpt.com/c/"+id;
    // Opening an already-open conversation must not reload or foreground it.
    if (action==="open" && page.context().pages().some(tab=>
      !tab.isClosed() && tab.url().split("?")[0].split("#")[0]===target))
      return {id,conversationPath:"/c/"+id,opened:true,alreadyOpen:true};
    if (page.url().split("?")[0].split("#")[0]!==target) await page.goto(target);
    await page.getByRole("region",{name:"Conversation"}).waitFor({state:"visible",timeout:12000}).catch(()=>{});
    const current=page.url().split("?")[0];
    if(current!=="https://chatgpt.com/c/"+id) return {error:"NOT_FOUND"};
    const region=page.getByRole("region",{name:"Conversation"});
    if ((await region.innerText()).includes("Could not load this ChatGPT conversation"))
      return {error:"UNAVAILABLE"};
    if(await region.getByText("You said:",{exact:true}).count()===0 && action!=="delete")
      return {error:"UNAVAILABLE"};
    const messages=async()=>await region.locator("h4").evaluateAll(headings=>headings
       .filter(h=>["You said:","ChatGPT said:"].includes((h.textContent||"").trim()))
       .map(h=>({
         role:h.textContent?.trim()==="You said:"?"user":"assistant",
         content:(h.parentElement?.innerText||"").replace(/^\\s*(You said:|ChatGPT said:)\\s*/,"").trim().slice(0,20000)
       })).filter(m=>m.content)).then(ms=>ms.slice(-limit));
    if(action==="open")return {id,conversationPath:"/c/"+id,opened:true};
    if(action==="read"){
      return {id,conversationPath:"/c/"+id,messages:await messages()};
    }
    const more=page.locator("main").getByRole("button",{name:"More",exact:true}).first();
    await more.waitFor({state:"visible",timeout:15000});
    await more.click();
    if(action==="rename"){
      await page.getByRole("menuitem",{name:"Rename",exact:true}).click();
      const dialog=page.getByRole("dialog");
      await dialog.getByRole("textbox").fill(${title || '""'});
      await dialog.getByRole("button",{name:"Save",exact:true}).click();
      return {id,renamed:true};
    }
    if(action==="archive"){
      await page.getByRole("menuitem",{name:"Archive",exact:true}).click();
      return {id,archived:true};
    }
    if(action==="delete"){
      await page.getByRole("menuitem",{name:"Delete",exact:true}).click();
      await page.getByRole("dialog").getByRole("button",{name:"Delete chat",exact:true}).click();
      return {id,deleted:true};
    }
    return {error:"UNKNOWN_ACTION"};
  }`;
}
export function buildFastReadScript(
  conversationId: string,
  limit: number,
): string {
  const id = validateId(conversationId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new BrowserBridgeError("Limit must be 1-100", 400);
  return `async (page) => {
    // Read-only API calls from Playwright's request context. No tab navigation.
    const request=page.context().request;
    const auth=await request.get("https://chatgpt.com/api/auth/session",{timeout:9000});
    if (!auth.ok()) return {error:"LOGIN_REQUIRED"};
    const session=await auth.json();
    if (typeof session.accessToken!=="string")return {error:"LOGIN_REQUIRED"};
    const response=await request.get("https://chatgpt.com/backend-api/conversations/${id}?num_turns=${limit}&include_has_versions=true", {
      headers:{authorization:"Bearer "+session.accessToken}, timeout:12000
    });
    if (response.status()===404) return {error:"NOT_FOUND"};
    if (response.status()===401||response.status()===403) return {error:"LOGIN_REQUIRED"};
    if (!response.ok()) return {error:"UNAVAILABLE"};
    const json=await response.json();
    const mapping=json.mapping||{};
    const nodes=[];
    const visited=new Set();
    let node=json.current_node;
    while (typeof node==="string" && mapping[node] && !visited.has(node)) {
      visited.add(node);
      nodes.push(mapping[node]);
      node=mapping[node].parent;
    }
    if (Array.isArray(json.messages)) nodes.splice(0,nodes.length,...json.messages);
    else if (!nodes.length) nodes.push(...Object.values(mapping).reverse());
    else nodes.reverse();
    const messages=nodes.map(n=>{
      const m=n?.message || n;
      const role=m?.author?.role;
      if (role!=="user"&&role!=="assistant") return null;
      const pieces=Array.isArray(m.content?.parts)?m.content.parts:[];
      const content=pieces.map(part=>typeof part==="string"?part:
        typeof part?.text==="string"?part.text:"").filter(Boolean).join("\\n").trim().slice(0,20000);
      return content?{role,content}:null;
    }).filter(Boolean).slice(-${limit});
    return {id:"${id}",conversationPath:"/c/${id}",messages};
  }`;
}

export function buildFastMutationScript(request: ControlRequest): string {
  if (!request.id)
    throw new BrowserBridgeError("Conversation ID required", 400);
  const id = validateId(request.id);
  const action = request.action;
  if (!["rename", "archive", "delete"].includes(action))
    throw new BrowserBridgeError("Unsupported mutation", 400);
  if (action === "delete" && request.confirm !== true)
    throw new BrowserBridgeError(
      "Deletion requires explicit confirmation",
      400,
    );
  if (
    action === "rename" &&
    (!request.title?.trim() || request.title.length > 120)
  )
    throw new BrowserBridgeError("Title must be 1-120 characters", 400);
  const payload =
    action === "rename"
      ? { title: request.title }
      : action === "archive"
        ? { is_archived: true }
        : { is_visible: false };
  return `async (page) => {
    // First-party authenticated request. Never navigate or focus a tab.
    const ctx=page.context().request;
    const auth=await ctx.get("https://chatgpt.com/api/auth/session",{timeout:9000});
    if (!auth.ok())return {error:"LOGIN_REQUIRED"};
    const session=await auth.json();
    if(typeof session.accessToken!=="string")return {error:"LOGIN_REQUIRED"};
    const r=await ctx.patch("https://chatgpt.com/backend-api/conversation/${id}",{
      headers:{authorization:"Bearer "+session.accessToken,"Content-Type":"application/json"},
      data:${JSON.stringify(payload)}, timeout:12000
    });
    if(r.status()===404)return {error:"NOT_FOUND"};
    if(r.status()===401||r.status()===403)return {error:"LOGIN_REQUIRED"};
    if(!r.ok())return {error:"UNAVAILABLE",status:r.status()};
    return {id:"${id}",${JSON.stringify(action === "rename" ? "renamed" : action === "archive" ? "archived" : "deleted")}:true};
  }`;
}

export async function controlConversation(
  request: ControlRequest,
  options: { session?: string; runner?: Runner } = {},
): Promise<ControlResult> {
  const allowed: Action[] = [
    "list",
    "open",
    "read",
    "rename",
    "archive",
    "delete",
  ];
  if (!allowed.includes(request.action))
    throw new BrowserBridgeError("Unknown action", 400);
  if (request.action !== "list" && !request.id)
    throw new BrowserBridgeError("Conversation ID required", 400);
  if (request.id) validateId(request.id);
  if (request.action === "delete" && request.confirm !== true)
    throw new BrowserBridgeError(
      "Deletion requires explicit confirmation",
      400,
    );
  if (
    request.action === "rename" &&
    (!request.title?.trim() || request.title.length > 120)
  )
    throw new BrowserBridgeError("Title must be 1-120 characters", 400);
  if (
    request.limit !== undefined &&
    (!Number.isInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 100)
  )
    throw new BrowserBridgeError("Limit must be 1-100", 400);
  const session = options.session || "chatgpt-research";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(session))
    throw new BrowserBridgeError("Invalid browser session", 400);
  // Read-only listing never navigates the visible browser. The signed-in
  // Playwright APIRequestContext performs account-index calls offscreen.
  if (request.action === "list" && !options.runner) {
    const { discoverAccountConversations, discoverVisibleConversations } =
      await import("./conversation-status.ts");
    const limit = request.limit ?? 25;
    try {
      const first = await discoverAccountConversations(Math.min(limit, 50), 0, {
        session,
      });
      const conversations = [...first.conversations];
      if (limit > 50 && first.hasMore) {
        const second = await discoverAccountConversations(limit - 50, 50, {
          session,
        });
        conversations.push(...second.conversations);
      }
      return {
        conversations,
        visibleCount: conversations.length,
        total: first.total,
        scope: "account-conversations",
      };
    } catch {
      const fallback = await discoverVisibleConversations(limit, { session });
      return { ...fallback, scope: "loaded-sidebar-only" };
    }
  }
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(
      await (options.runner || cliRunner)(
        !options.runner && request.action === "read"
          ? buildFastReadScript(request.id!, request.limit ?? 100)
          : !options.runner &&
              ["rename", "archive", "delete"].includes(request.action)
            ? buildFastMutationScript(request)
            : buildControlScript(request),
        session,
      ),
    );
  } catch (e) {
    if (e instanceof BrowserBridgeError) throw e;
    throw new BrowserBridgeError("Invalid browser controller result");
  }
  if (!result || typeof result !== "object")
    throw new BrowserBridgeError("Invalid browser controller result");
  if (result.error === "LOGIN_REQUIRED")
    throw new BrowserBridgeError("Sign in to the browser session", 401);
  if (result.error === "NOT_FOUND")
    throw new BrowserBridgeError("Conversation not found", 404);
  if (result.error === "UNAVAILABLE")
    throw new BrowserBridgeError(
      "Conversation unavailable; server rate limits or loading failures may be in effect",
      503,
    );
  if (typeof result.error === "string")
    throw new BrowserBridgeError("Browser action failed");
  return result;
}
if (import.meta.main) {
  const [action, arg, ...more] = process.argv.slice(2);
  const id = arg;
  let request: ControlRequest;
  if (action === "list") request = { action: "list", limit: Number(arg || 25) };
  else if (action === "read" || action === "open" || action === "archive")
    request = { action, id };
  else if (action === "rename")
    request = { action: "rename", id, title: more.join(" ") };
  else if (action === "delete")
    request = { action: "delete", id, confirm: more[0] === "--confirm" };
  else {
    console.error(
      "Usage: list [limit] | open ID | read ID | rename ID TITLE | archive ID | delete ID --confirm",
    );
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(await controlConversation(request), null, 2));
  } catch (e) {
    console.error(
      e instanceof Error ? e.message : "Conversation controller error",
    );
    process.exitCode = 1;
  }
}
