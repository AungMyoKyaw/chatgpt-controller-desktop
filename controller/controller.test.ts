import {test,expect} from "bun:test";
import {createHandler} from "./bridge-server.ts";
import {controlConversation} from "./conversation-control.ts";
import type {ControlRequest} from "./conversation-control.ts";

const id="12345678-1234-1234-1234-123456789abc";
const secret="test-key-is-longer-than-twenty-four";
const url="http://127.0.0.1:8791";
function req(path:string,method="GET",body?:unknown,key=secret){
 const headers:Record<string,string>={"x-bridge-key":key};
 if(body!==undefined)headers["content-type"]="application/json";
 return new Request(url+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
}
test("list and read route to the browser controller",async()=>{
 const calls:ControlRequest[]=[];
 const handle=createHandler({key:secret,control:async request=>{calls.push(request);return {ok:true};}});
 expect((await handle(req("/v1/conversations?limit=5"))).status).toBe(200);
 expect((await handle(req("/v1/conversations/"+id+"/messages"))).status).toBe(200);
 expect(calls).toEqual([{action:"list",limit:5},{action:"read",id}]);
});
test("rename and archive are routed by conversation ID",async()=>{
 const calls:ControlRequest[]=[];
 const handle=createHandler({key:secret,control:async request=>{calls.push(request);return {ok:true};}});
 expect((await handle(req("/v1/conversations/"+id,"PATCH",{title:"Research test"}))).status).toBe(200);
 expect((await handle(req("/v1/conversations/"+id+"/archive","POST",{}))).status).toBe(200);
 expect(calls).toEqual([{action:"rename",id,title:"Research test"},{action:"archive",id}]);
});
test("deletion requires confirmation and valid auth",async()=>{
 let called=0;
 const handle=createHandler({key:secret,control:async()=>{called++;return {deleted:true};}});
 expect((await handle(req("/v1/conversations/"+id,"DELETE",{}))).status).toBe(400);
 expect((await handle(req("/v1/conversations/"+id,"DELETE",{confirm:true},"bad"))).status).toBe(401);
 expect(called).toBe(0);
 expect((await handle(req("/v1/conversations/"+id,"DELETE",{confirm:true}))).status).toBe(200);
 expect(called).toBe(1);
});
test("does not require network access to test parsing",async()=>{
 const r=await controlConversation({action:"list",limit:10},{runner:async()=>JSON.stringify({conversations:[],scope:"loaded-sidebar-only"})});
 expect(r).toHaveProperty("conversations");
});
test("HTTP and browser controller reject invalid routes and IDs",async()=>{
 const handle=createHandler({key:secret,control:async()=>({ok:true})});
 expect((await handle(req("/v1/conversations/not-an-id/messages"))).status).toBe(404);
 expect((await handle(req("/v1/conversations?limit=200"))).status).toBe(400);
 expect(controlConversation({action:"read",id:"not-an-id"})).rejects.toMatchObject({status:400});
});
