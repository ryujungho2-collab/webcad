import {randomBytes,randomUUID} from "node:crypto";
import type {IncomingMessage,ServerResponse} from "node:http";
import type {Plugin} from "vite";
import {resolve} from "node:path";

const MAX_BYTES=65536,TTL=60000;
type Job={id:string;method:string;params:unknown};
type Pending={resolve:(v:unknown)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};
type Connection={ui:string;agent:string;seen:number;queue:Job[];pending:Map<string,Pending>;wake?:()=>void};
const secret=()=>randomBytes(32).toString("hex");
export function createCadMcpBroker(){
 const connections=new Map<string,Connection>();
 const close=(c:Connection)=>{connections.delete(c.agent);c.wake?.();for(const p of c.pending.values()){clearTimeout(p.timer);p.reject(Error("CAD bridge disconnected."));}c.pending.clear();};
 const cleanup=setInterval(()=>{for(const c of connections.values())if(Date.now()-c.seen>TTL)close(c);},10000);cleanup.unref();
 async function handler(req:IncomingMessage,res:ServerResponse,next:()=>void){
  const path=req.url?.split("?")[0];if(!path?.startsWith("/api/mcp/"))return next();
  const reply=(code:number,v:unknown)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(v));}};
  try{
   const host=new URL(`http://${req.headers.host}`),remote=req.socket.remoteAddress;
   if(!["127.0.0.1","localhost","[::1]"].includes(host.hostname)||!remote||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return reply(403,{error:"MCP bridge is loopback only."});
   if(req.method!=="POST")return reply(405,{error:"POST required."});
   const isAgent=path==="/api/mcp/call";
   if(isAgent?!!req.headers.origin:req.headers.origin!==host.origin)return reply(403,{error:"Invalid bridge origin."});
   if(req.headers["sec-fetch-site"]==="cross-site"||req.headers["content-type"]?.split(";")[0]!=="application/json")return reply(403,{error:"Same-origin JSON bridge required."});
   let size=0;const chunks:Buffer[]=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BYTES)return reply(413,{error:"Bridge message exceeds 64 KiB."});chunks.push(chunk);}
   let body:any;try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return reply(400,{error:"Invalid bridge JSON."});}
   if(!body||typeof body!=="object"||Array.isArray(body))return reply(400,{error:"Invalid bridge body."});
   if(path==="/api/mcp/register"){
    if(connections.size>=16)return reply(429,{error:"Too many enabled CAD editors."});
    const c:Connection={ui:secret(),agent:secret(),seen:Date.now(),queue:[],pending:new Map()};connections.set(c.agent,c);
    return reply(200,{uiToken:c.ui,configuration:{mcpServers:{agentwebcad:{command:process.execPath,args:[resolve("node_modules/tsx/dist/cli.mjs"),resolve("server/mcpStdio.ts")],env:{AGENT_WEBCAD_BRIDGE_URL:host.origin,AGENT_WEBCAD_BRIDGE_TOKEN:c.agent}}}}});
   }
   const token=req.headers.authorization?.replace(/^Bearer /,"");const c=isAgent?connections.get(token??""):[...connections.values()].find(c=>c.ui===token);
   if(!c||Date.now()-c.seen>TTL){if(c)close(c);return reply(401,{error:"CAD bridge is disabled or expired. Enable it in the editor."});}
   if(!isAgent)c.seen=Date.now();
   if(path==="/api/mcp/close"){close(c);return reply(200,{ok:true});}
   if(path==="/api/mcp/poll"){
    if(c.wake)return reply(409,{error:"Editor already has a poll."});
    if(!c.queue.length)await new Promise<void>(done=>{let finished=false;const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);c.wake=undefined;done();};const timer=setTimeout(finish,15000);c.wake=finish;res.once("close",finish);});
    if(!connections.has(c.agent))return reply(401,{error:"CAD bridge disconnected."});return reply(200,{jobs:c.queue.splice(0,8)});
   }
   if(path==="/api/mcp/result"){
    const p=c.pending.get(body.id);if(!p)return reply(409,{error:"Expired or cancelled bridge call."});
    c.pending.delete(body.id);clearTimeout(p.timer);p.resolve(body.result);return reply(200,{ok:true});
   }
   if(path!=="/api/mcp/call")return reply(404,{error:"Unknown bridge route."});
   if(!["context","read","propose","proposal"].includes(body.method))return reply(400,{error:"Unknown bridge operation. No remote Apply or script execution."});
   if(c.pending.size>=8)return reply(429,{error:"CAD bridge is busy. At most eight in-flight calls."});
   const id=randomUUID();
   const result=await new Promise<unknown>((resolve,reject)=>{
    const cancel=(reason:string)=>{if(!c.pending.delete(id))return;c.queue=c.queue.filter(j=>j.id!==id);c.queue.push({id,method:"cancel",params:null});c.wake?.();clearTimeout(timer);reject(Error(reason));};
    const timer=setTimeout(()=>cancel("CAD bridge call timed out."),60000);
    c.pending.set(id,{resolve,reject,timer});c.queue.push({id,method:body.method,params:body.params});c.wake?.();
    res.once("close",()=>{if(!res.writableEnded)cancel("MCP client cancelled the call.");});
   });
   reply(200,result);
  }catch(e){reply(400,{error:e instanceof Error?e.message:"CAD bridge failed."});}
 }
 return {handler,dispose(){clearInterval(cleanup);for(const c of [...connections.values()])close(c);}};
}
export function cadMcpPlugin():Plugin{
 const install=(server:any)=>{const broker=createCadMcpBroker();server.middlewares.use((req:IncomingMessage,res:ServerResponse,next:()=>void)=>{void broker.handler(req,res,next);});server.httpServer?.once("close",()=>broker.dispose());};
 return {name:"agent-webcad-mcp-bridge",configureServer:install,configurePreviewServer:install};
}
