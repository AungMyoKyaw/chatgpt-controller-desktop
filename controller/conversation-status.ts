import { cliRunner, BrowserBridgeError, type Runner } from "./browser-chat.ts";
import { validateId } from "./conversation-control.ts";

export type ConversationStatus = {
  id: string;
  conversationPath: string;
  status: "in_progress" | "completed" | "unknown";
  in_progress: boolean | null;
  source: "browser-ui" | "local-operation";
  reason?: string;
};

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
    "    if (await region.count() === 0) return {status:'unknown', reason:'conversation_not_loaded'};",
    "    if ((await region.innerText()).includes('Could not load this ChatGPT conversation'))",
    "      return {status:'unknown', reason:'conversation_unavailable'};",
    "    if (await tab.getByRole('button', {name:'Stop', exact:true}).count() > 0)",
    "      return {status:'in_progress'};",
    "    const headings = await region.locator('h4').evaluateAll(nodes => nodes.map(h => (h.textContent || '').trim()).filter(t => t === 'You said:' || t === 'ChatGPT said:'));",
    "    if (headings.length && headings[headings.length - 1] === 'ChatGPT said:')",
    "      return {status:'completed'};",
    "    return {status:'unknown', reason:'no_completion_signal'};",
    "  }",
    "  return {status:'unknown', reason:'conversation_not_open'};",
    "}",
  ].join("\n");
}

/** Read-only: inspect open ChatGPT tabs, never navigate or interrupt generation. */
export async function getConversationStatus(
  conversationId: string,
  options: { session?: string; runner?: Runner } = {},
): Promise<ConversationStatus> {
  const id = validateId(conversationId);
  const session = options.session || "chatgpt-controller";
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(session))
    throw new BrowserBridgeError("Invalid browser session", 400);
  let result: unknown;
  try {
    result = JSON.parse(
      await (options.runner || cliRunner)(buildStatusScript(id), session),
    );
  } catch (error) {
    if (error instanceof BrowserBridgeError) throw error;
    throw new BrowserBridgeError("Invalid browser status result");
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new BrowserBridgeError("Invalid browser status result");
  const data = result as Record<string, unknown>;
  if (!["in_progress", "completed", "unknown"].includes(String(data.status)))
    throw new BrowserBridgeError("Unsupported browser status value");
  const status = data.status as ConversationStatus["status"];
  return {
    id,
    conversationPath: "/c/" + id,
    status,
    in_progress: status === "unknown" ? null : status === "in_progress",
    source: "browser-ui",
    ...(status === "unknown" && typeof data.reason === "string"
      ? { reason: data.reason.slice(0, 80) }
      : {}),
  };
}
