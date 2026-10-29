import { invoke } from "@tauri-apps/api/core";
export type ControllerStatus = {
  apiOnline: boolean;
  apiBusy: boolean;
  ownedProcess: boolean;
  browserOpen: boolean;
  browserAuthenticated: boolean;
  embeddedBrowserAvailable: boolean;
  apiUrl: string;
  keyAvailable: boolean;
  note: string;
};
export const status = () => invoke<ControllerStatus>("get_status");
export const launchBrowser = () => invoke<string>("launch_login");
export const startApi = () => invoke<string>("start_api");
export const stopApi = () => invoke<string>("stop_api");
export const getKey = () => invoke<string>("export_key");
export const probe = () =>
  invoke<{ ok: boolean; visibleConversations: number; scope: string }>(
    "api_probe",
  );
export const testChat = (prompt: string) =>
  invoke<{ reply: string; conversation_path: string | null }>("api_chat", {
    prompt,
  });
export const messageOf = (e: unknown) =>
  typeof e === "string"
    ? e
    : e instanceof Error
      ? e.message
      : "Unexpected controller error.";
