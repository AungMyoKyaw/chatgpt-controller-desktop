/** Typed TypeScript client for the authenticated localhost ChatGPT browser controller. */
export type ConversationSummary={id:string;title:string};
export type ConversationMessage={role:"user"|"assistant";content:string};
export type ConversationPage={conversations:ConversationSummary[];visibleCount:number;scope:string};
export type ChatResult={reply:string;conversation_path:string|null;transport:string};
export class ChatGPTControllerClient {
  readonly baseUrl:string;
  constructor(
    private readonly key:string,
    baseUrl="http://127.0.0.1:8791",
    private readonly transport:typeof fetch=fetch
  ){
    if(!key)throw Error("Local bridge key is required");
    const url=new URL(baseUrl);
    if(url.protocol!=="http:"||!["localhost","127.0.0.1"].includes(url.hostname))
      throw Error("Only localhost bridge addresses are allowed");
    this.baseUrl=url.origin;
  }
  private async call<T>(path:string,method="GET",body?:unknown):Promise<T>{
    const response=await this.transport(this.baseUrl+path,{
      method,headers:{
        "X-Bridge-Key":this.key,
        ...(body===undefined?{}:{"Content-Type":"application/json"})
      },
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
      redirect:"error",
      signal:AbortSignal.timeout(130000)
    });
    let value:unknown;
    try{value=await response.json();}catch{throw Error("Local bridge returned invalid JSON");}
    if(!response.ok){
      const message=value&&typeof value==="object"&&"error" in value?String(value.error):"Local bridge operation failed";
      throw Error(message+" (HTTP "+response.status+")");
    }
    return value as T;
  }
  async list(limit=25):Promise<ConversationPage>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw Error("Limit must be 1-100");
    return this.call<ConversationPage>("/v1/conversations?limit="+limit);
  }
  async read(id:string):Promise<{id:string;messages:ConversationMessage[]}>{
    return this.call("/v1/conversations/"+this.encodeId(id)+"/messages");
  }
  async open(id:string):Promise<unknown>{
    return this.call("/v1/conversations/"+this.encodeId(id)+"/open","POST",{});
  }
  async send(prompt:string,conversationId?:string):Promise<ChatResult>{
    return this.call("/v1/chat","POST",{
      prompt,...(conversationId?{conversation_path:"/c/"+this.encodeId(conversationId)}:{})
    });
  }
  async rename(id:string,title:string):Promise<unknown>{
    return this.call("/v1/conversations/"+this.encodeId(id),"PATCH",{title});
  }
  async archive(id:string):Promise<unknown>{
    return this.call("/v1/conversations/"+this.encodeId(id)+"/archive","POST",{});
  }
  async delete(id:string,confirm:boolean):Promise<unknown>{
    if(!confirm)throw Error("Deletion must be explicitly confirmed");
    return this.call("/v1/conversations/"+this.encodeId(id),"DELETE",{confirm:true});
  }
  private encodeId(id:string):string{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw Error("Invalid conversation ID");
    return id.toLowerCase();
  }
}
