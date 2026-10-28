import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { buildChatScript } from "../controller/chat-script.ts";
import { buildControlScript, buildFastReadScript, buildFastMutationScript } from "../controller/conversation-control.ts";
import { buildFastStatusScript, buildAccountDiscoveryScript, buildDiscoverScript } from "../controller/conversation-status.ts";

const script = JSON.parse(readFileSync("native-controller/playwright-scripts.json", "utf8"));
const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id = "abcdefab-1234-4321-9876-abcdefabcdef";
const other = "12345678-1234-4321-9876-abcdefabcdef";
function build(name, args) {
  let value = script[name];
  for (const [name, replacement] of Object.entries(args)) value = value.replaceAll(name, replacement);
  expect(value).not.toMatch(/__(?:ID|IDS|PATH|PROMPT|TITLE|LIMIT|OFFSET)__/);
  return value;
}
test("Rust scripts exactly match the production chat builder, including user input escaping", () => {
  const prompt = 'A "quoted" line\n\u{1f642} and $(echo unsafe)';
  const path = "/c/" + id;
  expect(build("chat", {"__PROMPT__": JSON.stringify(prompt), "__PATH__": JSON.stringify(path)}))
    .toBe(buildChatScript(prompt,true,path));
  expect(build("chat", {"__PROMPT__": JSON.stringify(prompt), "__PATH__": "null"}))
    .toBe(buildChatScript(prompt,true,undefined));
});
test("Rust scripts exactly match read, mutation, and open operations", () => {
  expect(build("read", {"__ID__":id, "__LIMIT__":"100"})).toBe(buildFastReadScript(id,100));
  expect(build("open", {"__ID__":id})).toBe(buildControlScript({action:"open",id}));
  expect(build("archive", {"__ID__":id})).toBe(buildFastMutationScript({action:"archive",id}));
  expect(build("remove", {"__ID__":id})).toBe(buildFastMutationScript({action:"delete",id,confirm:true}));
  const title='Hello "quoted" \n Ünicode';
  expect(build("rename", {"__ID__":id,"__TITLE__":JSON.stringify(title)}))
    .toBe(buildFastMutationScript({action:"rename",id,title}));
});
test("Rust scripts exactly match batch statuses and account discovery", () => {
  expect(build("statuses", {"__IDS__":JSON.stringify([id,other])}))
    .toBe(buildFastStatusScript([id,other]));
  expect(build("discovery", {"__LIMIT__":"23","__OFFSET__":"5"}))
    .toBe(buildAccountDiscoveryScript(23,5));
  expect(build("visible", {"__LIMIT__":"23"})).toBe(buildDiscoverScript(23));
});
