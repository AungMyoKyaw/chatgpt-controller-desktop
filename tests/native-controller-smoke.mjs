import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(import.meta.dirname, "..");
const binary = path.join(root, "src-tauri/bin/controller");
if (!existsSync(binary)) throw Error("Build the Rust controller with bun run sidecar first");
const directory = mkdtempSync(path.join(tmpdir(), "chatgpt-rust-api-"));
const cli = path.join(directory, "playwright-cli");
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const key = "ab".repeat(32);
writeFileSync(cli, `#!/usr/bin/env node
const script=process.argv[4] || "";
let value;
const id="${ID}";
if (script.includes("const targetPath = ")) { if (script.includes("SLOW_CHAT_TEST")) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,800); value={reply:"Rust bridge reply",conversationPath:"/c/"+id}; }
else if (script.includes("const ids = ")) value={results:[{id,payload:{status:"COMPLETE"}}]};
else if (script.includes("backend-api/conversations?offset=")) value={total:1,offset:0,limit:20,conversations:[{id,title:"Fixture chat"}]};
else if (script.includes("num_turns=")) value={id,conversationPath:"/c/"+id,messages:[{role:"user",content:"Fixture"}]};
else if (script.includes("const action=")) value={id,conversationPath:"/c/"+id,opened:true};
else if (script.includes("is_archived")) value={id,archived:true};
else if (script.includes("is_visible")) value={id,deleted:true};
else if (script.includes("title:")) value={id,renamed:true};
else value={conversations:[],visibleCount:0,scope:"loaded-sidebar-only"};
console.log("### Result");
console.log(JSON.stringify(value));
`);
chmodSync(cli, 0o755);

const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
let log = "";
const proc = spawn(binary, [], {
  env: {
    ...process.env,
    PATH: directory + ":" + process.env.PATH,
    CHATGPT_BRIDGE_KEY: key,
    CHATGPT_BRIDGE_PORT: String(port),
    CHATGPT_BROWSER_SESSION: "chatgpt-controller-test",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
proc.stdout.on("data", (d) => { log += String(d); });
proc.stderr.on("data", (d) => { log += String(d); });
const base = `http://127.0.0.1:${port}`;
async function request(route, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (auth) headers["X-Bridge-Key"] = key;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(base + route, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const h = await request("/health", { auth: false });
      if (h.status === 200) { ready = true; break; }
    } catch { await delay(100); }
  }
  assert.ok(ready, "Rust controller failed startup: " + log);
  assert.equal((await request("/health", {auth:false})).json.busy, false);
  assert.equal((await request("/v1/conversations", {auth:false})).status, 401);
  assert.equal((await request("/v1/conversations?limit=-1")).status, 400);
  assert.equal((await request("/no-such-route")).status, 404);
  assert.equal((await request("/v1/chat", {method:"POST",body:{stream:true,prompt:"test"}})).status, 422);
  assert.equal((await request("/v1/chat", {method:"POST",body:{prompt:"test",model:"unavailable"}})).status, 422);
  assert.equal((await request("/v1/chat", {method:"POST",body:{prompt:"test",conversation_path:null}})).status, 400);
  const wrongType = await fetch(base + "/v1/chat", {method:"POST",headers:{"X-Bridge-Key":key,"Content-Type":"text/plain"},body:"{}"});
  assert.equal(wrongType.status, 415);
  assert.equal((await request("/v1/conversations/" + ID, {method:"DELETE",body:{confirm:false}})).status, 400);
  const listed = await request("/v1/conversations?limit=5");
  assert.equal(listed.status, 200, JSON.stringify(listed));
  assert.equal(listed.json.conversations[0].id, ID);
  const status = await request("/v1/conversations/" + ID + "/status");
  assert.equal(status.status, 200);
  assert.equal(status.json.status, "completed");
  const statuses = await request("/v1/conversations/statuses", {
    method:"POST", body:{ids:[ID,ID]},
  });
  assert.equal(statuses.status, 200);
  assert.equal(statuses.json.count, 1);
  assert.equal(statuses.json.summary.completed, 1);
  assert.equal(statuses.json.scope, "explicit-ids");
  const paginated = await request("/v1/conversations/statuses?limit=1&offset=0");
  assert.equal(paginated.status, 200);
  assert.equal(paginated.json.total, 1);
  assert.equal(paginated.json.count, 1);
  const read = await request("/v1/conversations/" + ID + "/messages");
  assert.equal(read.status, 200);
  assert.equal(read.json.messages[0].content, "Fixture");
  const opened = await request("/v1/conversations/" + ID + "/open", {method:"POST",body:{}});
  assert.equal(opened.status, 200);
  assert.equal(opened.json.opened, true);
  const renamed = await request("/v1/conversations/" + ID, {method:"PATCH",body:{title:"Renamed"}});
  assert.equal(renamed.status, 200);
  const archived = await request("/v1/conversations/" + ID + "/archive", {method:"POST",body:{}});
  assert.equal(archived.status, 200);
  const deleted = await request("/v1/conversations/" + ID, {method:"DELETE",body:{confirm:true}});
  assert.equal(deleted.status, 200);
  const chat = await request("/v1/chat", {method:"POST",body:{prompt:"Hello"}});
  assert.equal(chat.status, 200, JSON.stringify(chat));
  assert.equal(chat.json.reply, "Rust bridge reply");
  const compatible = await request("/v1/chat/completions", {method:"POST",body:{messages:[{role:"user",content:"Hi"}]}});
  assert.equal(compatible.status, 200);
  assert.equal(compatible.json.object, "chat.completion");
  const slow = request("/v1/chat", {method:"POST",body:{prompt:"SLOW_CHAT_TEST"}});
  await delay(140);
  assert.equal((await request("/health", {auth:false})).json.busy, true);
  const busyStatus = await request("/v1/conversations/" + ID + "/status");
  assert.equal(busyStatus.status, 200);
  assert.equal(busyStatus.json.status, "unavailable");
  assert.equal(busyStatus.json.reason, "browser_operation_busy");
  assert.equal((await request("/v1/chat", {method:"POST",body:{prompt:"Concurrent"}})).status, 429);
  assert.equal((await slow).status, 200);
  console.log("Native Rust localhost contract smoke tests passed (23 checks)");
} finally {
  proc.kill("SIGTERM");
  await delay(100);
  rmSync(directory, {recursive:true,force:true});
}
