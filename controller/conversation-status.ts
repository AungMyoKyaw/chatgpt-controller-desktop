import { spawn } from "bun";
import { cliRunner, BrowserBridgeError, type Runner } from "./browser-chat.ts";
import { validateId } from "./conversation-control.ts";

export type ConversationStatusKind =
  "in_progress" | "completed" | "failed" | "unavailable";
export type ConversationStatus = {
  id: string;
  conversationPath: string;
  status: ConversationStatusKind;
  in_progress: boolean | null;
  source: "browser-ui" | "upstream-stream-status" | "local-operation";
  reason?: string;
  upstream_status?: string;
};

const DEFAULT_SESSION = "chatgpt-controller";
const SESSION_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const MAX_BROWSER_OUTPUT = 32768;

function validateSession(session: string): string {
  if (!SESSION_RE.test(session))
    throw new BrowserBridgeError("Invalid browser session", 400);
  return session;
}

function statusResult(
  id: string,
  status: ConversationStatusKind,
  source: ConversationStatus["source"],
  reason?: string,
  upstream_status?: string,
): ConversationStatus {
  return {
    id,
    conversationPath: "/c/" + id,
    status,
    in_progress:
      status === "in_progress"
        ? true
        : status === "completed" || status === "failed"
          ? false
          : null,
    source,
    ...(reason ? { reason } : {}),
    ...(upstream_status ? { upstream_status } : {}),
  };
}

export function interpretStreamStatus(
  conversationId: string,
  payload: unknown,
): ConversationStatus {
  const id = validateId(conversationId);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return statusResult(
      id,
      "unavailable",
      "upstream-stream-status",
      "invalid_upstream_response",
    );
  const raw = (payload as Record<string, unknown>).status;
  if (typeof raw !== "string")
    return statusResult(
      id,
      "unavailable",
      "upstream-stream-status",
      "missing_upstream_status",
    );
  const state = raw.toUpperCase();
  if (["COMPLETE", "COMPLETED", "FINISHED"].includes(state))
    return statusResult(
      id,
      "completed",
      "upstream-stream-status",
      undefined,
      raw,
    );
  if (
    [
      "IN_PROGRESS",
      "INPROGRESS",
      "RUNNING",
      "STREAMING",
      "IS_STREAMING",
      "ACTIVE",
      "PENDING",
      "PROCESSING",
      "QUEUED",
    ].includes(state)
  )
    return statusResult(
      id,
      "in_progress",
      "upstream-stream-status",
      undefined,
      raw,
    );
  if (
    [
      "FAILED",
      "ERROR",
      "ERRORED",
      "INTERRUPTED",
      "CANCELLED",
      "CANCELED",
      "ABORTED",
    ].includes(state)
  )
    return statusResult(id, "failed", "upstream-stream-status", undefined, raw);
  return statusResult(
    id,
    "unavailable",
    "upstream-stream-status",
    "unrecognized_upstream_status",
    raw.slice(0, 80),
  );
}

/** Read-only inspection of open ChatGPT tabs. Never modifies or navigates existing tabs. */
export function buildStatusScript(conversationId: string): string {
  const id = validateId(conversationId);
  return [
    "async (page) => {",
    "  const id = " + JSON.stringify(id) + ";",
    "  for (const tab of page.context().pages()) {",
    "    if (tab.isClosed()) continue;",
    "    const address = tab.url().split('?')[0].split('#')[0];",
    "    if (address !== 'https://chatgpt.com/c/' + id) continue;",
    "    const region = tab.getByRole('region', {name:'Conversation'});",
    "    if (await region.count() === 0) return {status:'not_loaded'};",
    "    if ((await region.innerText()).includes('Could not load this ChatGPT conversation'))",
    "      return {status:'not_loaded'};",
    "    if (await tab.getByRole('button', {name:'Stop', exact:true}).count() > 0)",
    "      return {status:'in_progress'};",
    "    const headings = await region.locator('h4').evaluateAll(nodes => nodes.map(h => (h.textContent || '').trim()).filter(t => t === 'You said:' || t === 'ChatGPT said:'));",
    "    if (headings.length && headings[headings.length - 1] === 'ChatGPT said:')",
    "      return {status:'completed'};",
    "    return {status:'not_loaded'};",
    "  }",
    "  return {status:'not_open'};",
    "}",
  ].join("\n");
}

type BrowserCommand = (args: string[], session: string) => Promise<string>;

async function runBrowserCommand(
  args: string[],
  session: string,
): Promise<string> {
  const subprocess = spawn(["playwright-cli", "-s=" + session, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const timer = setTimeout(() => subprocess.kill(), 25000);
  try {
    const [stdout, , code] = await Promise.all([
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
      subprocess.exited,
    ]);
    if (code !== 0)
      throw new BrowserBridgeError(
        "Playwright could not inspect upstream stream status",
        503,
      );
    return stdout.slice(0, MAX_BROWSER_OUTPUT);
  } finally {
    clearTimeout(timer);
  }
}

function parseEvalOutput(text: string): unknown {
  const marker = "### Result\n";
  const start = text.indexOf(marker);
  if (start < 0) throw new BrowserBridgeError("No browser status result", 502);
  const tail = text
    .slice(start + marker.length)
    .split("\n### ")[0]
    .trim();
  try {
    const body = JSON.parse(tail);
    if (typeof body !== "string") throw Error("Not JSON text");
    return JSON.parse(body);
  } catch {
    throw new BrowserBridgeError(
      "Upstream stream status returned invalid JSON",
      502,
    );
  }
}

/**
 * Navigate only a temporary, purpose-created tab to the first-party status endpoint.
 * Direct browser navigation uses the signed-in profile, without copying access tokens
 * or modifying any existing conversation tab.
 */
export async function fetchUpstreamStreamStatus(
  conversationId: string,
  session = DEFAULT_SESSION,
  browserCommand: BrowserCommand = runBrowserCommand,
): Promise<ConversationStatus> {
  const id = validateId(conversationId);
  validateSession(session);
  // Compatibility export: real calls also use the invisible-frame fast path.
  // The custom browserCommand branch exists only for legacy injected tests.
  if (browserCommand === runBrowserCommand)
    return (await fetchFastStreamStatuses([id], { session }))[0];
  const url =
    "https://chatgpt.com/backend-api/conversation/" + id + "/stream_status";
  let tabIndex: number | null = null;
  try {
    const opened = await browserCommand(["tab-new", url], session);
    const current = opened.match(/^- (\d+): \(current\).*$/m);
    if (!current || !opened.includes(url))
      throw new BrowserBridgeError(
        "Unable to identify temporary status tab",
        503,
      );
    tabIndex = Number(current[1]);
    const response = await browserCommand(
      ["eval", "() => document.body.innerText"],
      session,
    );
    return interpretStreamStatus(id, parseEvalOutput(response));
  } catch (error) {
    if (error instanceof BrowserBridgeError && error.status === 400)
      throw error;
    return statusResult(
      id,
      "unavailable",
      "upstream-stream-status",
      error instanceof BrowserBridgeError
        ? "upstream_request_failed"
        : "browser_status_unavailable",
    );
  } finally {
    if (tabIndex !== null) {
      await browserCommand(["tab-close", String(tabIndex)], session).catch(
        () => {},
      );
    }
  }
}

/** Hidden same-origin iframes let the existing signed-in page load first-party
 * stream status without switching tabs or exporting browser credentials.
 * One Playwright invocation checks up to 50 conversations with bounded concurrency.
 */
export function buildFastStatusScript(conversationIds: string[]): string {
  if (
    !Array.isArray(conversationIds) ||
    conversationIds.length < 1 ||
    conversationIds.length > 50
  )
    throw new BrowserBridgeError(
      "Status batch requires 1-50 conversation IDs",
      400,
    );
  const ids = [...new Set(conversationIds.map(validateId))];
  return [
    "async (page) => {",
    "  const ids = " + JSON.stringify(ids) + ";",
    "  const tabs = page.context().pages().filter(tab => !tab.isClosed());",
    "  const active = new Set();",
    "  for (const tab of tabs) {",
    "    const match = /^https:\\/\\/chatgpt\\.com\\/c\\/([0-9a-f-]{36})(?:[?#]|$)/i.exec(tab.url());",
    "    if (!match || !ids.includes(match[1].toLowerCase())) continue;",
    "    if (await tab.getByRole('button', {name:'Stop',exact:true}).count() > 0) active.add(match[1].toLowerCase());",
    "  }",
    "  const host = tabs.find(tab => /^https:\\/\\/chatgpt\\.com\\//.test(tab.url()) &&",
    "    !tab.url().startsWith('https://chatgpt.com/backend-api/') &&",
    "    !tab.url().startsWith('https://chatgpt.com/api/'));",
    "  if (!host) return {results:ids.map(id=>({id, ...(active.has(id) ? {status:'in_progress',source:'browser-ui'} : {error:'no_authenticated_chatgpt_page'})}))};",
    "  const remaining = ids.filter(id => !active.has(id));",
    "  const checked = await host.evaluate(async (targets) => {",
    "    const output = new Array(targets.length);",
    "    let index = 0;",
    "    const check = async (id) => {",
    "      const frame = document.createElement('iframe');",
    "      frame.setAttribute('aria-hidden','true');",
    "      frame.style.cssText = 'display:none!important;width:0;height:0;border:0;visibility:hidden;pointer-events:none';",
    "      try {",
    "        return await new Promise(resolve => {",
    "          let settled = false;",
    "          const finish = value => {if(settled)return;settled=true;clearTimeout(timer);resolve(value)};",
    "          const timer = setTimeout(()=>finish({error:'upstream_timeout'}),8500);",
    "          frame.onload = () => {",
    "            try {",
    "              const body = frame.contentDocument?.body?.innerText || '';",
    "              const payload = JSON.parse(body);",
    "              if (!payload || typeof payload !== 'object') throw Error('invalid_payload');",
    "              finish({payload});",
    "            } catch {finish({error:'invalid_upstream_response'})}",
    "          };",
    "          frame.onerror = () => finish({error:'upstream_load_failed'});",
    "          frame.src = '/backend-api/conversation/' + id + '/stream_status';",
    "          document.body.appendChild(frame);",
    "        });",
    "      } finally {frame.remove()}",
    "    };",
    "    await Promise.all(Array.from({length:Math.min(8,targets.length)}, async () => {",
    "      while(index < targets.length) {const at = index++; output[at] = await check(targets[at])}",
    "    }));",
    "    return output;",
    "  }, remaining);",
    "  const byId = new Map(remaining.map((id,i)=>[id,checked[i]]));",
    "  return {results:ids.map(id => active.has(id) ? {id,status:'in_progress',source:'browser-ui'} : {id,...byId.get(id)})};",
    "}",
  ].join("\n");
}

export async function fetchFastStreamStatuses(
  conversationIds: string[],
  options: { session?: string; runner?: Runner } = {},
): Promise<ConversationStatus[]> {
  const ids = [...new Set(conversationIds.map(validateId))];
  const session = validateSession(options.session || DEFAULT_SESSION);
  const code = buildFastStatusScript(ids);
  let result: unknown;
  try {
    result = JSON.parse(await (options.runner || cliRunner)(code, session));
  } catch {
    return ids.map((id) =>
      statusResult(
        id,
        "unavailable",
        "upstream-stream-status",
        "browser_status_unavailable",
      ),
    );
  }
  if (
    !result ||
    typeof result !== "object" ||
    !Array.isArray((result as Record<string, unknown>).results)
  )
    return ids.map((id) =>
      statusResult(
        id,
        "unavailable",
        "upstream-stream-status",
        "invalid_browser_result",
      ),
    );
  const records = (result as { results: unknown[] }).results;
  const mapped = new Map<string, ConversationStatus>();
  for (const item of records) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const data = item as Record<string, unknown>;
    if (typeof data.id !== "string" || !ids.includes(data.id)) continue;
    if (data.source === "browser-ui" && data.status === "in_progress") {
      mapped.set(data.id, statusResult(data.id, "in_progress", "browser-ui"));
    } else if (data.payload && typeof data.payload === "object") {
      mapped.set(data.id, interpretStreamStatus(data.id, data.payload));
    } else {
      mapped.set(
        data.id,
        statusResult(
          data.id,
          "unavailable",
          "upstream-stream-status",
          typeof data.error === "string"
            ? data.error.slice(0, 80)
            : "missing_upstream_result",
        ),
      );
    }
  }
  return ids.map(
    (id) =>
      mapped.get(id) ??
      statusResult(
        id,
        "unavailable",
        "upstream-stream-status",
        "missing_upstream_result",
      ),
  );
}

export type StatusOptions = {
  session?: string;
  runner?: Runner;
  upstream?: (id: string, session: string) => Promise<ConversationStatus>;
};

/** Live UI first, upstream stream status for any conversation not open in tabs. */
export async function getConversationStatus(
  conversationId: string,
  options: StatusOptions = {},
): Promise<ConversationStatus> {
  const id = validateId(conversationId);
  const session = validateSession(options.session || DEFAULT_SESSION);
  // Default production path: one hidden-iframe inspection, no new tabs.
  // Legacy runner/upstream overrides remain available for deterministic tests.
  if (!options.runner && !options.upstream)
    return (await fetchFastStreamStatuses([id], { session }))[0];
  let browserStatus: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(
      await (options.runner || cliRunner)(buildStatusScript(id), session),
    );
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      browserStatus = parsed as Record<string, unknown>;
  } catch {
    // Browser tab inspection can fail if the tab is busy; try upstream status.
  }
  if (browserStatus?.status === "in_progress")
    return statusResult(id, "in_progress", "browser-ui");
  // Consult upstream even for an idle tab: it is authoritative for a response
  // still running in a different window, browser, or device.
  const upstream = await (options.upstream
    ? options.upstream(id, session)
    : fetchUpstreamStreamStatus(id, session));
  if (upstream.status !== "unavailable") return upstream;
  if (browserStatus?.status === "completed")
    return statusResult(id, "completed", "browser-ui");
  return upstream;
}

export type AccountConversationPage = {
  conversations: Array<{ id: string; title: string }>;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  scope: "account-conversations";
};

function parseToolResult(stdout: string): unknown {
  const marker = "### Result\n";
  const start = stdout.indexOf(marker);
  if (start < 0) throw new BrowserBridgeError("Missing browser result", 502);
  const json = stdout
    .slice(start + marker.length)
    .split("\n### ")[0]
    .trim();
  try {
    return JSON.parse(json);
  } catch {
    throw new BrowserBridgeError("Invalid browser result", 502);
  }
}

export function buildAccountDiscoveryScript(
  limit: number,
  offset: number,
): string {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new BrowserBridgeError("Limit must be 1-50", 400);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000)
    throw new BrowserBridgeError("Offset must be 0-1000000", 400);
  return `async (page) => {
    // All work is performed in the Playwright APIRequestContext; this does
    // not open, navigate, or focus a browser tab.
    const request = page.context().request;
    const auth = await request.get("https://chatgpt.com/api/auth/session", {timeout:9000});
    if (!auth.ok()) return {error:"AUTH_SESSION_FAILED"};
    const session = await auth.json();
    if (typeof session.accessToken !== "string") return {error:"LOGIN_REQUIRED"};
    const api = await request.get("https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=${limit}&order=updated", {
      headers:{authorization:"Bearer " + session.accessToken},
      timeout:12000
    });
    if (api.status() === 401 || api.status() === 403) return {error:"LOGIN_REQUIRED"};
    if (!api.ok()) return {error:"UPSTREAM_UNAVAILABLE",status:api.status()};
    const j = await api.json();
    return {total:j.total,offset:${offset},limit:${limit},
      conversations:Array.isArray(j.items)?j.items.map(x=>({id:x.id,title:x.title})):null};
  }`;
}

/**
 * Enumerate the signed-in account's paginated conversation index. The short-lived
 * auth token is applied only as a header within the temporary Playwright tab,
 * and is never emitted to this API, to stdout, or to disk.
 */
export async function discoverAccountConversations(
  limit = 20,
  offset = 0,
  options: { session?: string; command?: BrowserCommand; runner?: Runner } = {},
): Promise<AccountConversationPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new BrowserBridgeError("Limit must be 1-50", 400);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000)
    throw new BrowserBridgeError("Offset must be 0-1000000", 400);
  const session = validateSession(options.session || DEFAULT_SESSION);
  // Production path never opens a tab. Legacy command injection is retained
  // only for existing isolated tests.
  if (!options.command) {
    let data: unknown;
    try {
      data = JSON.parse(
        await (options.runner || cliRunner)(
          buildAccountDiscoveryScript(limit, offset),
          session,
        ),
      );
    } catch {
      throw new BrowserBridgeError(
        "Account conversation listing unavailable",
        503,
      );
    }
    if (!data || typeof data !== "object")
      throw new BrowserBridgeError("Invalid account conversation listing", 502);
    const response = data as Record<string, unknown>;
    if (response.error === "LOGIN_REQUIRED")
      throw new BrowserBridgeError(
        "ChatGPT browser session requires login",
        401,
      );
    if (
      !Array.isArray(response.conversations) ||
      !Number.isInteger(response.total)
    )
      throw new BrowserBridgeError(
        "Account conversation listing unavailable",
        503,
      );
    const conversations = response.conversations
      .filter(
        (v: unknown): v is { id: string; title?: string } =>
          !!v && typeof v === "object" && typeof (v as any).id === "string",
      )
      .map((v) => ({
        id: validateId(v.id),
        title: String(v.title || "").slice(0, 200),
      }));
    return {
      conversations,
      total: Number(response.total),
      limit,
      offset,
      hasMore: offset + conversations.length < Number(response.total),
      scope: "account-conversations",
    };
  }
  const browser = options.command;
  let tabIndex: number | null = null;
  const authUrl = "https://chatgpt.com/api/auth/session";
  const apiUrl =
    "https://chatgpt.com/backend-api/conversations?offset=" +
    offset +
    "&limit=" +
    limit +
    "&order=updated";
  try {
    const opened = await browser(["tab-new", authUrl], session);
    const match = opened.match(/^- (\d+): \(current\).*$/m);
    if (!match || !opened.includes(authUrl))
      throw new BrowserBridgeError(
        "Unable to open authenticated status tab",
        503,
      );
    tabIndex = Number(match[1]);
    const authorized = parseToolResult(
      await browser(
        [
          "run-code",
          'async (page) => {const token=await page.evaluate(() => JSON.parse(document.body.innerText).accessToken); if(!token) return {authenticated:false}; await page.setExtraHTTPHeaders({authorization:"Bearer "+token}); return {authenticated:true};}',
        ],
        session,
      ),
    );
    if (!(
      authorized &&
      typeof authorized === "object" &&
      (authorized as any).authenticated === true
    ))
      throw new BrowserBridgeError(
        "ChatGPT browser session requires login",
        401,
      );
    // The CLI may time out after the navigation has already completed.
    await browser(["goto", apiUrl], session).catch(() => {});
    const result = parseToolResult(
      await browser(
        [
          "eval",
          '() => {if(!location.href.startsWith("https://chatgpt.com/backend-api/conversations?"))return {error:"not_loaded"};const j=JSON.parse(document.body.innerText);return {total:j.total,limit:j.limit,offset:j.offset,conversations:Array.isArray(j.items)?j.items.map(x=>({id:x.id,title:x.title})):null};}',
        ],
        session,
      ),
    );
    if (!result || typeof result !== "object")
      throw new BrowserBridgeError("Invalid account conversation list", 502);
    const data = result as Record<string, unknown>;
    if (!Array.isArray(data.conversations) || !Number.isInteger(data.total))
      throw new BrowserBridgeError(
        "Account conversation listing unavailable",
        503,
      );
    const conversations = data.conversations
      .filter(
        (v: unknown) =>
          v && typeof v === "object" && typeof (v as any).id === "string",
      )
      .map((v: { id: string; title: string }) => ({
        id: validateId(v.id),
        title: String(v.title || "").slice(0, 200),
      }));
    const total = Number(data.total);
    return {
      conversations,
      total,
      limit,
      offset,
      hasMore: offset + conversations.length < total,
      scope: "account-conversations",
    };
  } finally {
    if (tabIndex !== null)
      await browser(["tab-close", String(tabIndex)], session).catch(() => {});
  }
}

/** Enumerate only chats currently visible in open browser sidebars. */
export function buildDiscoverScript(limit: number): string {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new BrowserBridgeError("Limit must be 1-100", 400);
  return `async (page) => {
    const found = new Map();
    for (const tab of page.context().pages()) {
      if (tab.isClosed() || !tab.url().startsWith('https://chatgpt.com/')) continue;
      const entries = await tab.locator('a[href^="/c/"]').evaluateAll(links => links.map(a => ({
        id:(a.getAttribute('href')||'').split('/')[2],
        title:(a.textContent||'').trim().slice(0,200)
      })));
      for (const e of entries)
        if (/^[0-9a-f-]{36}$/i.test(e.id) && !found.has(e.id))
          found.set(e.id, e);
    }
    return {conversations:Array.from(found.values()).slice(0,${limit}),visibleCount:found.size,scope:'loaded-sidebar-only'};
  }`;
}
export async function discoverVisibleConversations(
  limit = 25,
  options: { session?: string; runner?: Runner } = {},
): Promise<{
  conversations: Array<{ id: string; title: string }>;
  visibleCount: number;
  scope: string;
}> {
  const script = buildDiscoverScript(limit);
  const session = validateSession(options.session || DEFAULT_SESSION);
  const parsed = JSON.parse(
    await (options.runner || cliRunner)(script, session),
  );
  if (!parsed || !Array.isArray(parsed.conversations))
    throw new BrowserBridgeError(
      "Failed to discover browser conversations",
      502,
    );
  return {
    conversations: parsed.conversations
      .filter(
        (v: unknown) =>
          v && typeof v === "object" && typeof (v as any).id === "string",
      )
      .map((v: { id: string; title: string }) => ({
        id: validateId(v.id),
        title: String(v.title || "").slice(0, 200),
      })),
    visibleCount: Number(parsed.visibleCount) || 0,
    scope: "loaded-sidebar-only",
  };
}
