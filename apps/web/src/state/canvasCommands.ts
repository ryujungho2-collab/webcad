import type {CadCommand,CommandBus} from "@agent-webcad/cad-commands";
import {canvasLockReason,canvasTargetKey,legacyCanvasHierarchy,validateCanvasHierarchy,type CadDocument,type CadCanvas} from "@agent-webcad/cad-document";
export function isCanvasOnlyCommand(command:CadCommand):boolean{return ["upsert-canvas","delete-canvas","organize-canvases"].includes(command.type)||command.type==="batch"&&command.commands.length>0&&command.commands.every(isCanvasOnlyCommand);}
function assertMembershipEdits(document:CadDocument,old:CadCanvas|undefined,next:CadCanvas|undefined){
 const a=old?.members??[],b=next?.members??[];
 for(const member of [...a,...b])if(member.kind==="canvas"&&member.relation==="own"){
  const same=a.some(m=>m.relation==="own"&&canvasTargetKey(m)===canvasTargetKey(member))&&b.some(m=>m.relation==="own"&&canvasTargetKey(m)===canvasTargetKey(member));
  const reason=!same&&canvasLockReason(document,member.id);if(reason)throw Error(reason);
 }
}
export function registerCanvasCommands(bus:CommandBus,document:CadDocument){
 bus.registerHandler("upsert-canvas",command=>{
  if(command.type!=="upsert-canvas")return;
  const next=structuredClone(command.canvas),old=document.canvases?.[next.id],reason=canvasLockReason(document,next.id);
  const unlocking=old?.locked&&next.locked===false&&JSON.stringify({...old,locked:false})===JSON.stringify(next);
  if(reason&&(!unlocking||Object.values(document.canvases??{}).some(c=>c.members.some(m=>m.kind==="canvas"&&m.relation==="own"&&m.id===next.id)&&canvasLockReason(document,c.id))))throw Error(reason);
  if(JSON.stringify(old)===JSON.stringify(next))return {accepted:false,reason:"Canvas is unchanged."};
  assertMembershipEdits(document,old,next);
  const nodes={...document.canvases,[next.id]:next};validateCanvasHierarchy({...document,canvases:nodes});document.canvases=nodes;document.revision++;return next.id;
 });
 bus.registerHandler("delete-canvas",command=>{
  if(command.type!=="delete-canvas")return;
  const old=document.canvases?.[command.canvasId];if(!old)return {accepted:false,reason:"Canvas no longer exists."};
  const reason=canvasLockReason(document,old.id);if(reason)throw Error(reason);
  assertMembershipEdits(document,old,undefined);
  const nodes=structuredClone(document.canvases!);delete nodes[old.id];
  for(const c of Object.values(nodes))if(c.members.some(m=>m.kind==="canvas"&&m.id===old.id)){const locked=canvasLockReason(document,c.id);if(locked)throw Error(locked);c.members=c.members.filter(m=>m.kind!=="canvas"||m.id!==old.id);}
  validateCanvasHierarchy({...document,canvases:nodes});if(Object.keys(nodes).length)document.canvases=nodes;else delete document.canvases;document.revision++;
 });
 bus.registerHandler("organize-canvases",command=>{
  if(command.type!=="organize-canvases")return;
  if(Object.keys(document.canvases??{}).length)return {accepted:false,reason:"Canvas hierarchy already exists. Edit its members instead."};
  document.canvases=legacyCanvasHierarchy(document);document.revision++;
 });
}
