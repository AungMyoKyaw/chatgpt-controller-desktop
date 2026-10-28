import { buildChatScript } from "../controller/chat-script.ts";
import { buildControlScript, buildFastReadScript, buildFastMutationScript } from "../controller/conversation-control.ts";
import { buildFastStatusScript, buildAccountDiscoveryScript, buildDiscoverScript } from "../controller/conversation-status.ts";
import { writeFileSync, mkdirSync } from "node:fs";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const limit = 37, offset = 54321;
function exactly(source: string, from: string, to: string): string {
  if (!source.includes(from)) throw new Error("Missing template marker: " + from);
  return source.replaceAll(from, to);
}
let chat = buildChatScript("__PROMPT__", true, "/c/" + id);
chat = exactly(chat, JSON.stringify("/c/" + id), "__PATH__");
chat = exactly(chat, JSON.stringify("__PROMPT__"), "__PROMPT__");

let read = buildFastReadScript(id, limit);
read = exactly(read, id, "__ID__");
read = exactly(read, "num_turns=" + limit, "num_turns=__LIMIT__");
read = exactly(read, "slice(-" + limit + ")", "slice(-__LIMIT__)");
let open = exactly(buildControlScript({action:"open",id}), id, "__ID__");
let rename = exactly(buildFastMutationScript({action:"rename",id,title:"__TITLE__"}), id, "__ID__");
rename = exactly(rename, JSON.stringify("__TITLE__"), "__TITLE__");
let archive = exactly(buildFastMutationScript({action:"archive",id}), id, "__ID__");
let remove = exactly(buildFastMutationScript({action:"delete",id,confirm:true}), id, "__ID__");
let statuses = buildFastStatusScript([id]);
statuses = exactly(statuses, JSON.stringify([id]), "__IDS__");
let discovery = buildAccountDiscoveryScript(limit,offset);
discovery = exactly(discovery, String(offset), "__OFFSET__");
discovery = exactly(discovery, String(limit), "__LIMIT__");
let visible = exactly(buildDiscoverScript(limit), String(limit), "__LIMIT__");
const templates = { chat, read, open, rename, archive, remove, statuses, discovery, visible };
for (const [name, template] of Object.entries(templates)) {
  if (!template.startsWith("async (page) => {")) throw new Error("Invalid Playwright script: "+name);
  if (template.includes(id)) throw new Error("Leaking fixture ID in "+name);
}
mkdirSync("native-controller", {recursive:true});
writeFileSync("native-controller/playwright-scripts.json", JSON.stringify(templates, null, 2)+"\n");
console.log(Object.fromEntries(Object.entries(templates).map(([k,v])=>[k,v.length])));
