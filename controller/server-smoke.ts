#!/usr/bin/env bun
/** Verifies real loopback HTTP transport with an injected browser-controller stub. */
import {createHandler} from "./bridge-server.ts";
const key=crypto.randomUUID()+crypto.randomUUID();
const id="12345678-1234-1234-1234-123456789abc";
const service=Bun.serve({
 hostname:"127.0.0.1",port:0,
 fetch:createHandler({
   key,
   control:async req=>req.action==="list"
     ? {conversations:[{id,title:"Test conversation"}],visibleCount:1,scope:"loaded-sidebar-only"}
     : {id,ok:true},
   send:async()=>({reply:"HTTP_OK",conversationPath:"/c/"+id})
 })
});
try{
 const base="http://127.0.0.1:"+service.port;
 const health=await fetch(base+"/health");
 const denied=await fetch(base+"/v1/conversations");
 const allowed=await fetch(base+"/v1/conversations?limit=2",{headers:{"x-bridge-key":key}});
 const chat=await fetch(base+"/v1/chat",{
  method:"POST",headers:{"x-bridge-key":key,"content-type":"application/json"},
  body:JSON.stringify({prompt:"Smoke test"})
 });
 const parsed=await chat.json() as {reply?:string};
 const list=await allowed.json() as {conversations?:unknown[]};
 const result={health:health.status,unauthorized:denied.status,
   list:allowed.status,listCount:list.conversations?.length,
   chat:chat.status,chatReply:parsed.reply};
 console.log(JSON.stringify(result));
 if(result.health!==200||result.unauthorized!==401||
    result.list!==200||result.listCount!==1||result.chat!==200||
    result.chatReply!=="HTTP_OK")process.exitCode=1;
}finally{service.stop(true);}
