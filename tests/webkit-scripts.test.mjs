import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";

const source=JSON.parse(readFileSync(path.join(import.meta.dirname,"../native-controller/webkit-scripts.json"),"utf8"));
const required=["chat","read","open","rename","archive","remove","statuses","discovery","visible","native_auth","diagnostics"];

test("All native WebKit templates parse without Playwright",()=>{
  assert.deepEqual(Object.keys(source).sort(), required.sort());
  for(const [name,s] of Object.entries(source)) {
    assert.doesNotThrow(()=>new Function("return ("+s+")"),name);
    assert.doesNotMatch(s, /playwright-cli|page.context\(\)/, name);
  }
});

function response(data,status=200) {
  return {ok:status>=200&&status<300,status,json:async()=>data};
}
async function execute(name,replacements,fetch,environment={}) {
  let js=source[name];
  for(const [key,value] of Object.entries(replacements))js=js.replaceAll(key,value);
  const fn=runInNewContext("("+js+")",{fetch,document:{querySelector:()=>null,querySelectorAll:()=>[],...(environment.document||{})},location:{pathname:"/",...(environment.location||{})},console,setTimeout,clearTimeout,AbortController});
  return fn();
}
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const session=()=>response({accessToken:"test-session-access-token"});

test("Native browser context discovery preserves API shape",async()=>{
  const calls=[];
  const fetch=async(url,options)=>{calls.push([url,options]);return url.includes("auth/session")?session():response({total:1,items:[{id,title:"Test Chat"}]})};
  const value=await execute("discovery",{"__LIMIT__":"25","__OFFSET__":"0"},fetch);
  assert.deepEqual(JSON.parse(JSON.stringify(value)),{total:1,offset:0,limit:25,conversations:[{id,title:"Test Chat"}]});
  assert.equal(calls.length,1);
  assert.equal(calls[0][1].credentials,"include");
  assert.equal(calls[0][1].headers.authorization,undefined);
});

test("Native browser message read follows conversation branch",async()=>{
  const fetch=async(url)=>url.includes("auth/session")?session():response({
    current_node:"n2",
    mapping:{
      n1:{parent:null,message:{author:{role:"user"},content:{parts:["Question"]}}},
      n2:{parent:"n1",message:{author:{role:"assistant"},content:{parts:["Answer"]}}}
    }
  });
  const value=await execute("read",{"__ID__":id,"__LIMIT__":"100"},fetch);
  assert.equal(value.id,id);
  assert.deepEqual(JSON.parse(JSON.stringify(value.messages)),[{role:"user",content:"Question"},{role:"assistant",content:"Answer"}]);
});

test("Archived mutation uses the requested ID and is one PATCH",async()=>{
  const calls=[];
  const fetch=async(url,options)=>{if(!url.includes("auth/session"))calls.push({url,options});return url.includes("auth/session")?session():response({})};
  const result=await execute("archive",{"__ID__":id},fetch);
  assert.equal(result.archived,true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.method,"PATCH");
  assert.deepEqual(JSON.parse(calls[0].options.body),{is_archived:true});
});

test("Auth expiry produces LOGIN_REQUIRED",async()=>{
  const result=await execute("discovery",{"__LIMIT__":"20","__OFFSET__":"0"},async()=>response({},401));
  assert.equal(result.error,"LOGIN_REQUIRED");
});

test("status fetch recognizes active upstream state",async()=>{
  const result=await execute("statuses",{"__IDS__":JSON.stringify([id])},async(url)=>{
    if(url.includes("stream_status"))return response({status:"IN_PROGRESS"});
    throw Error("unexpected request");
  });
  assert.equal(result.results[0].payload.status,"IN_PROGRESS");
});
test("status fallback requires an explicit completed assistant turn",async()=>{
  const fetch=async(url)=>url.includes("stream_status")?response({},404):response({
    current_node:"reply",mapping:{reply:{message:{author:{role:"assistant"},status:{status:"finished_successfully"},end_turn:true}}}
  });
  const result=await execute("statuses",{"__IDS__":JSON.stringify([id])},fetch);
  assert.equal(result.results[0].payload.status,"COMPLETE");
});
test("missing completion evidence never reports completed",async()=>{
  const fetch=async(url)=>url.includes("stream_status")?response({},404):response({
    current_node:"user",mapping:{user:{message:{author:{role:"user"},content:{parts:["Hello"]}}}}
  });
  const result=await execute("statuses",{"__IDS__":JSON.stringify([id])},fetch);
  assert.equal(result.results[0].error,"insufficient_completion_evidence");
});

test("conversation detail requests check both supported URL shapes",()=>{
  assert.ok(source.read.includes("/backend-api/conversation/"));
  assert.ok(source.read.includes("/backend-api/conversations/"));
  assert.ok(source.statuses.includes("/backend-api/conversation/"));
  assert.ok(source.statuses.includes("/backend-api/conversations/"));
});

test("read retries alternate detail endpoint when primary returns 404",async()=>{
  const calls=[];
  const fetch=async(url)=>{
    calls.push(url);
    if(url.includes("auth/session"))return session();
    if(url.includes("/backend-api/conversations/"))return response({current_node:"reply",
      mapping:{reply:{message:{author:{role:"assistant"},content:{parts:["Reply"]}}}}});
    return response({},404);
  };
  const result=await execute("read",{"__ID__":id,"__LIMIT__":"10"},fetch);
  assert.equal(result.messages[0].content,"Reply");
  assert.ok(calls.some(url=>url.includes("/backend-api/conversation/")));
  assert.ok(calls.some(url=>url.includes("/backend-api/conversations/")));
});
test("read uses visible conversation when upstream returns 404",async()=>{
  const element={getAttribute:()=> "assistant",innerText:"Visible reply"};
  const result=await execute("read",{"__ID__":id,"__LIMIT__":"10"},
    async url=>url.includes("auth/session")?response({}):response({},404),
    {location:{pathname:"/c/"+id},document:{querySelectorAll:()=>[element]}});
  assert.equal(result.source,"browser-ui");
  assert.equal(result.messages[0].content,"Visible reply");
});

test("nonexistent IDs cannot be declared completed by upstream stream status",async()=>{
  const output=await execute("statuses",{"__IDS__":JSON.stringify([id])},async url=>{
    return url.includes("stream_status")?response({status:"COMPLETE"}):response({},404);
  });
  assert.equal(output.results[0].error,"unverified_terminal_status");
  assert.equal(output.results[0].payload,undefined);
});
test("visible assistant message validates a completed live chat",async()=>{
  const output=await execute("statuses",{"__IDS__":JSON.stringify([id])},
    async url=>url.includes("stream_status")?response({status:"COMPLETE"}):response({},404),
    {location:{pathname:"/c/"+id},document:{querySelector:(selector)=>selector.includes("data-message-author-role")?{}:null}});
  assert.equal(output.results[0].payload.status,"COMPLETE");
});

test("active conversation message read is immediate with no upstream fetch",async()=>{
  const elements=[
    {getAttribute:()=> "user",innerText:"Reply with exactly CONTROLLER_READY."},
    {getAttribute:()=> "assistant",innerText:"CONTROLLER_READY"}
  ];
  let fetchCount=0;
  const result=await execute("read",{"__ID__":id,"__LIMIT__":"10"},
    async()=>{fetchCount++;throw Error("Network must not be called for visible conversation")},
    {location:{pathname:"/c/"+id},document:{querySelectorAll:()=>elements}});
  assert.equal(result.messages.length,2);
  assert.equal(result.messages[1].content,"CONTROLLER_READY");
  assert.equal(fetchCount,0);
});

test("open operation waits for actual conversation content",async()=>{
  const el={getAttribute:()=>"user",innerText:"Existing prompt"};
  const result=await execute("open",{"__ID__":id},async()=>response({}),
    {location:{pathname:"/c/"+id},document:{body:{innerText:"Existing prompt"},querySelectorAll:()=>[el]}});
  assert.equal(result.opened,true);
  assert.equal(result.conversationPath,"/c/"+id);
});
test("open rejects a conversation unavailable error instead of false success",async()=>{
  const result=await execute("open",{"__ID__":id},async()=>response({}),
    {location:{pathname:"/c/"+id},document:{body:{innerText:"Could not load this ChatGPT conversation"},querySelectorAll:()=>[]}});
  assert.equal(result.error,"NOT_FOUND");
  assert.notEqual(result.opened,true);
});
