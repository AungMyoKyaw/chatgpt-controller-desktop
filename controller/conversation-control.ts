#!/usr/bin/env bun
/** Controllable browser UI for locally signed-in ChatGPT. No session-token extraction. */
import {cliRunner,BrowserBridgeError,type Runner} from "./browser-chat.ts";

export type Action = "list"|"open"|"read"|"rename"|"archive"|"delete";
export type ControlRequest = {action:Action; id?:string; title?:string; confirm?:boolean; limit?:number};
export type ControlResult = Record<string,unknown>;
const UUID=/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function validateId(id:string):string {
  if (!UUID.test(id)) throw new BrowserBridgeError("Invalid conversation ID",400);
  return id.toLowerCase();
}
export function buildControlScript(request:ControlRequest):string {
  const id=request.id?validateId(request.id):null;
  const limit=Math.min(100,Math.max(1,request.limit??25));
  const title=request.title===undefined?null:JSON.stringify(request.title);
  return `async (page) => {
    const action=${JSON.stringify(request.action)};
    const id=${JSON.stringify(id)};
    const limit=${limit};
    if(await page.getByRole("button",{name:"Open profile menu"}).count()===0)
      return {error:"LOGIN_REQUIRED"};
    if(action==="list"){
      await page.goto("https://chatgpt.com/");
      await page.locator('a[href^="/c/"]').first().waitFor({state:"attached",timeout:10000}).catch(()=>{});
      const items=await page.locator('a[href^="/c/"]').evaluateAll(links=>links.map(a=>({
        id:(a.getAttribute("href")||"").slice(3),
        title:(a.textContent||"").trim().slice(0,250)
      })).filter(x=>/^[0-9a-f-]{36}$/i.test(x.id)));
      const unique=Array.from(new Map(items.map(x=>[x.id,x])).values());
      return {conversations:unique.slice(0,limit),visibleCount:unique.length,scope:"loaded-sidebar-only"};
    }
    await page.goto("https://chatgpt.com/c/"+id);
    await page.getByRole("region",{name:"Conversation"}).waitFor({state:"visible",timeout:12000}).catch(()=>{});
    const current=page.url().split("?")[0];
    if(current!=="https://chatgpt.com/c/"+id) return {error:"NOT_FOUND"};
    const region=page.getByRole("region",{name:"Conversation"});
    if ((await region.innerText()).includes("Could not load this ChatGPT conversation"))
      return {error:"UNAVAILABLE"};
    if(await region.getByText("You said:",{exact:true}).count()===0 && action!=="delete")
      return {error:"UNAVAILABLE"};
    const messages=async()=>await region.locator("h4").evaluateAll(headings=>headings
       .filter(h=>["You said:","ChatGPT said:"].includes((h.textContent||"").trim()))
       .map(h=>({
         role:h.textContent?.trim()==="You said:"?"user":"assistant",
         content:(h.parentElement?.innerText||"").replace(/^\\s*(You said:|ChatGPT said:)\\s*/,"").trim().slice(0,20000)
       })).filter(m=>m.content)).then(ms=>ms.slice(-limit));
    if(action==="open")return {id,conversationPath:"/c/"+id,opened:true};
    if(action==="read"){
      return {id,conversationPath:"/c/"+id,messages:await messages()};
    }
    const more=page.locator("main").getByRole("button",{name:"More",exact:true}).first();
    await more.waitFor({state:"visible",timeout:15000});
    await more.click();
    if(action==="rename"){
      await page.getByRole("menuitem",{name:"Rename",exact:true}).click();
      const dialog=page.getByRole("dialog");
      await dialog.getByRole("textbox").fill(${title||'""'});
      await dialog.getByRole("button",{name:"Save",exact:true}).click();
      return {id,renamed:true};
    }
    if(action==="archive"){
      await page.getByRole("menuitem",{name:"Archive",exact:true}).click();
      return {id,archived:true};
    }
    if(action==="delete"){
      await page.getByRole("menuitem",{name:"Delete",exact:true}).click();
      await page.getByRole("dialog").getByRole("button",{name:"Delete chat",exact:true}).click();
      return {id,deleted:true};
    }
    return {error:"UNKNOWN_ACTION"};
  }`;
}
export async function controlConversation(
  request:ControlRequest,
  options:{session?:string;runner?:Runner}={}
):Promise<ControlResult>{
  const allowed:Action[]=["list","open","read","rename","archive","delete"];
  if(!allowed.includes(request.action)) throw new BrowserBridgeError("Unknown action",400);
  if(request.action!=="list" && !request.id)throw new BrowserBridgeError("Conversation ID required",400);
  if(request.id)validateId(request.id);
  if(request.action==="delete"&&request.confirm!==true)
    throw new BrowserBridgeError("Deletion requires explicit confirmation",400);
  if(request.action==="rename" && (!request.title?.trim()||request.title.length>120))
    throw new BrowserBridgeError("Title must be 1-120 characters",400);
  if(request.limit!==undefined&&(!Number.isInteger(request.limit)||request.limit<1||request.limit>100))
    throw new BrowserBridgeError("Limit must be 1-100",400);
  const session=options.session||"chatgpt-research";
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(session))
    throw new BrowserBridgeError("Invalid browser session",400);
  let result:Record<string,unknown>;
  try{
    result=JSON.parse(await (options.runner||cliRunner)(buildControlScript(request),session));
  }catch(e){
    if(e instanceof BrowserBridgeError)throw e;
    throw new BrowserBridgeError("Invalid browser controller result");
  }
  if(!result||typeof result!=="object")throw new BrowserBridgeError("Invalid browser controller result");
  if(result.error==="LOGIN_REQUIRED")throw new BrowserBridgeError("Sign in to the browser session",401);
  if(result.error==="NOT_FOUND")throw new BrowserBridgeError("Conversation not found",404);
  if(result.error==="UNAVAILABLE")throw new BrowserBridgeError("Conversation unavailable; server rate limits or loading failures may be in effect",503);
  if(typeof result.error==="string")throw new BrowserBridgeError("Browser action failed");
  return result;
}
if(import.meta.main){
  const [action,arg,...more]=process.argv.slice(2);
  const id=arg;
  let request:ControlRequest;
  if(action==="list")request={action:"list",limit:Number(arg||25)};
  else if(action==="read"||action==="open"||action==="archive")request={action,id};
  else if(action==="rename")request={action:"rename",id,title:more.join(" ")};
  else if(action==="delete")request={action:"delete",id,confirm:more[0]==="--confirm"};
  else {console.error("Usage: list [limit] | open ID | read ID | rename ID TITLE | archive ID | delete ID --confirm");process.exit(2);}
  try{console.log(JSON.stringify(await controlConversation(request),null,2));}
  catch(e){console.error(e instanceof Error?e.message:"Conversation controller error");process.exitCode=1;}
}
