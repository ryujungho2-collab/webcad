import {serveStdio} from "@modelcontextprotocol/server/stdio";
import {createCadMcpServer,createCadMcpForward} from "./cadMcpServer";
try{
 const forward=createCadMcpForward(process.env.AGENT_WEBCAD_BRIDGE_URL??"",process.env.AGENT_WEBCAD_BRIDGE_TOKEN??"");
 serveStdio(()=>createCadMcpServer(forward));
}catch{console.error("Enable CAD MCP in the editor and use its generated client configuration.");process.exitCode=1;}
