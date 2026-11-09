import {Client} from "@modelcontextprotocol/client";
import {StdioClientTransport} from "@modelcontextprotocol/client/stdio";
import {resolve} from "node:path";

// Test-only fixture: a real MCP host process. No caller-supplied executable or path is run.
export function mcpBrowserClientFixture(pending){
 const clients=new Map();
 return {async middleware(req,res,next){
  if(!req.url?.startsWith("/__browser_mcp"))return next();
  const run=new URL(req.url,"http://localhost").searchParams.get("run");if(req.method!=="POST"||!pending.has(run)){res.writeHead(404);res.end();return;}
  try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error("MCP test request too large");chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));let value;
   if(body.action==="connect"){
    await clients.get(run)?.close();const env=body.configuration?.mcpServers?.agentwebcad?.env;
    if(env?.AGENT_WEBCAD_BRIDGE_URL!==`http://${req.headers.host}`||!/^[a-f0-9]{64}$/.test(env?.AGENT_WEBCAD_BRIDGE_TOKEN??""))throw Error("Invalid isolated MCP test pairing");
    const client=new Client({name:"agent-webcad-browser-test",version:"1"});clients.set(run,client);
    await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve("node_modules/tsx/dist/cli.mjs"),resolve("server/mcpStdio.ts")],env,stderr:"pipe"}));value={server:client.getServerVersion(),tools:await client.listTools()};
   }else if(body.action==="call"){const c=clients.get(run);if(!c)throw Error("Connect MCP test client first");value=await c.callTool({name:body.name,arguments:body.arguments??{}});}
   else if(body.action==="close"){await clients.get(run)?.close();clients.delete(run);value={closed:true};}
   else throw Error("Unknown MCP test action");
   res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify(value));
  }catch(e){res.writeHead(400,{"Content-Type":"application/json"});res.end(JSON.stringify({error:e.message}));}
 },async dispose(){await Promise.allSettled([...clients.values()].map(c=>c.close()));clients.clear();}};
}
