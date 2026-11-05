import {inspectSweepSelection} from "../precision/sweepSelection";
import {inspectProfileSelection} from "../precision/profileSelection";
import {CAD_TOOLS,validateCadToolCalls,type CadToolCall} from "./cadToolContract";
import {createCadToolSession} from "./cadToolSession";
import type {CadModelingContext} from "./cadModelingTools";
import {documentVersion} from "../state/documentSession";

export type McpProposalStatus={proposalId:string;status:"validating"|"pending-review"|"applied"|"cancelled"|"rejected";summary?:string[];resultObjectIds?:string[];reason?:string};
export type CadMcpHost={context:()=>CadModelingContext;review:(calls:CadToolCall[],signal:AbortSignal)=>Promise<McpProposalStatus>;proposal:(id:string)=>McpProposalStatus;};
const fingerprint=(c:CadModelingContext)=>JSON.stringify([documentVersion(c.document),c.selectionIds,c.layerId,c.workPlane]);
/** Transport independent adapter. All reads/plans use the existing captured CAD tool session. */
export function createCadMcpRuntime(host:CadMcpHost){
 let proposing=false;
 const contexts=new Map<string,{session:ReturnType<typeof createCadToolSession>;expires:number}>();
 const tickets=new Map<string,{receipt:McpProposalStatus;nativeId?:string;controller:AbortController;timer:ReturnType<typeof setTimeout>;session?:ReturnType<typeof createCadToolSession>}>();
 return {async invoke(method:string,params:any,signal:AbortSignal):Promise<unknown>{
  signal.throwIfAborted();
  if(method==="context"){
   const c=host.context(),key=fingerprint(c),id=crypto.randomUUID();
   for(const [id,c]of contexts)if(c.expires<Date.now())contexts.delete(id);
   if(contexts.size>=8)contexts.delete(contexts.keys().next().value!);
   contexts.set(id,{session:createCadToolSession(c,{isCurrent:()=>fingerprint(host.context())===key}),expires:Date.now()+120000});
   const profile=inspectProfileSelection(c.document,c.selectionIds),sweep=inspectSweepSelection(c.document,c.selectionIds);
   return {contextId:id,version:documentVersion(c.document),selectionIds:c.selectionIds,...profile?{profile}:{},...sweep?{sweep}:{},workPlane:c.workPlane,layerId:c.layerId,units:"mm",expiresInSeconds:120,policy:"Read before proposing. Existing sources require UI selection. Writes only prepare native Review; only the user can Apply. No remote Apply, scripts or model execution."};
  }
  if(method==="proposal"){
   if(!params||typeof params.proposalId!=="string")throw Error("Specify the proposalId.");
   const ticket=tickets.get(params.proposalId);if(!ticket)return host.proposal(params.proposalId);
   if(ticket.receipt.status==="validating")try{ticket.session!.assertCurrent();}catch(error){ticket.controller.abort();ticket.receipt={proposalId:params.proposalId,status:"cancelled",reason:error instanceof Error?error.message:String(error)};}
   return structuredClone(ticket.nativeId?{...host.proposal(ticket.nativeId),proposalId:params.proposalId}:ticket.receipt);
  }
  const c=contexts.get(params?.contextId);if(!c||c.expires<Date.now())throw Error("Expired CAD context. Call cad.context again.");c.session.assertCurrent(signal);
  const calls=validateCadToolCalls(params.calls);
  if(method==="read"){
   if(calls.length!==1||!CAD_TOOLS[calls[0].name].readOnly)throw Error("MCP read requires one read-only CAD tool.");return c.session.read(calls[0],signal);
  }
  if(method!=="propose"||calls.some(c=>CAD_TOOLS[c.name].readOnly))throw Error("Proposals contain modeling tools only; separate reads.");
  // host.review invokes the ordinary native detached preview. It never publishes CAD.
  if(proposing)throw Error("Another MCP proposal is being validated.");
  if(params.waitForReview!==undefined&&typeof params.waitForReview!=="boolean")throw Error("waitForReview must be a boolean.");
  if(params.waitForReview===false){
   const id=crypto.randomUUID(),controller=new AbortController();
   if(tickets.size>=20){const oldest=[...tickets].find(([,t])=>t.receipt.status!=="validating");if(oldest)tickets.delete(oldest[0]);}
   const ticket={receipt:{proposalId:id,status:"validating" as const,summary:["Native preview is being validated. Poll cad.proposal; only pending-review can be applied in the editor."]} as McpProposalStatus,controller,timer:setTimeout(()=>{controller.abort();ticket.receipt={proposalId:id,status:"rejected",reason:"Native review exceeded its 180 second validation budget. No CAD was published."};},180000),session:c.session as ReturnType<typeof createCadToolSession>|undefined,nativeId:undefined as string|undefined};
   tickets.set(id,ticket);proposing=true;
   // Explicit deferred requests outlive this short RPC, never the enabled editor.
   void (async()=>{try{
    c.session.assertCurrent(controller.signal);const result=await host.review(calls,controller.signal);c.session.assertCurrent(controller.signal);
    if(tickets.get(id)===ticket){ticket.nativeId=result.proposalId;ticket.receipt={...result,proposalId:id};}
   }catch(error){if(tickets.get(id)===ticket&&ticket.receipt.status==="validating")ticket.receipt={proposalId:id,status:controller.signal.aborted?"cancelled":"rejected",reason:(error instanceof Error?error.message:String(error)).slice(0,1000)};}
   finally{clearTimeout(ticket.timer);ticket.session=undefined;proposing=false;}})();
   return structuredClone(ticket.receipt);
  }
  proposing=true;try{c.session.assertCurrent(signal);const result=await host.review(calls,signal);c.session.assertCurrent(signal);return result;}finally{proposing=false;}
 },dispose(){contexts.clear();for(const t of tickets.values()){clearTimeout(t.timer);t.controller.abort();}tickets.clear();}};
}
