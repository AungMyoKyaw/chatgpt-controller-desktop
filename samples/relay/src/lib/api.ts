import { invoke } from "@tauri-apps/api/core";

export type Conversation = { id: string; title: string };
export type Message = { role: "user" | "assistant"; content: string };
export type ChatHistory = { id: string; messages: Message[]; conversationPath?: string };
export type ChatResponse = { reply: string; conversation_path: string | null; transport: string };
export type ConversationList = { conversations: Conversation[]; visibleCount: number; scope: string };
export type Health = { ok: boolean; transport: string; busy: boolean };
type Operation = "health" | "list" | "read" | "send" | "open" | "rename" | "archive" | "delete";

export function controller<T>(
  operation: Operation,
  payload: { id?: string; prompt?: string; title?: string; confirm?: boolean } = {}
): Promise<T> {
  return invoke<T>("bridge_call", { operation, ...payload });
}

export const bridge = {
  health: () => controller<Health>("health"),
  list: () => controller<ConversationList>("list"),
  read: (id: string) => controller<ChatHistory>("read", { id }),
  send: (prompt: string, id?: string) => controller<ChatResponse>("send", { prompt, id }),
  open: (id: string) => controller<{ opened: boolean }>("open", { id }),
  rename: (id: string, title: string) => controller<{ renamed: boolean }>("rename", { id, title }),
  archive: (id: string) => controller<{ archived: boolean }>("archive", { id }),
  delete: (id: string) => controller<{ deleted: boolean }>("delete", { id, confirm: true })
};

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Unexpected controller error. Check the signed-in Chrome window.";
}
