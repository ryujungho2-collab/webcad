import {getObjectTransform} from "../precision/objectTransform";
import {canvasLockReason,canvasTarget,canvasTargetKey,defaultCanvasFlex,solveCanvasFlex,type CadDocument,type CanvasMember,type FlexNode,type FlexBox,type CanvasFlexItem} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {getObjectWorldBounds} from "../precision/worldBounds";
import {WORK_PLANES,worldToPlane,planeToWorld} from "../precision/workPlane";
import {workspaceSectionBounds} from "../precision/workspaceSection";
type Bounds={origin:[number,number];size:[number,number]};
export type CanvasFlexReport={canvasId:string;boxes:{key:string;name:string;kind:string;origin:[number,number];size:[number,number];absolute:boolean}[];overflow:{key:string;axis:"x"|"y";excess:number}[];movedIds:string[];commands:Exclude<CadCommand,{type:"batch"}>[]};
function bounds(d:CadDocument,m:CanvasMember,fallbackPlane:"XY"|"XZ"|"YZ"="XY"):Bounds{
 if(m.kind==="canvas")return d.canvases![m.id];
 if(m.kind==="artboard")return d.artboards![m.id];
 if(m.kind==="workspace-section")return workspaceSectionBounds(d,d.workspaceSections![m.id]);
 const t=canvasTarget(d,m)!;
 if(t.artboardIds.length){const b=d.artboards![t.artboardIds[0]];return {origin:[...b.origin],size:[...b.size]};}
 const boxes=t.objectIds.map(id=>getObjectWorldBounds(d,id)).filter(b=>!!b);
 if(!boxes.length)throw Error(`Cannot measure layout bounds for ${t.name}.`);
 const plane=WORK_PLANES[t.workPlane??fallbackPlane],points=boxes.flatMap(b=>[b.min[0],b.max[0]].flatMap(x=>[b.min[1],b.max[1]].flatMap(y=>[b.min[2],b.max[2]].map(z=>worldToPlane([x,y,z],plane)))));
 const x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1]));return {origin:[x,y],size:[Math.max(.001,Math.max(...points.map(p=>p[0]))-x),Math.max(.001,Math.max(...points.map(p=>p[1]))-y)]};
}
export function planCanvasFlex(d:CadDocument,canvasId:string,allowModelMoves=false):CanvasFlexReport{
 const root=d.canvases?.[canvasId];if(!root?.layout)throw Error("Enable Flex on this canvas first.");
 const locked=canvasLockReason(d,canvasId);if(locked)throw Error(locked);
 const members=new Map<string,{member:CanvasMember;bounds:Bounds;owner:string}>();
 const build=(id:string):FlexNode=>{const c=d.canvases![id];return {key:`canvas:${id}`,natural:[...c.size],layout:c.layout??defaultCanvasFlex(),items:c.members.map(m=>{
  const key=`${id}/${canvasTargetKey(m)}`,b=bounds(d,m,c.workPlane),movable=m.relation==="own"&&["canvas","artboard","workspace-section"].includes(m.kind),style:CanvasFlexItem=m.layout??{position:movable&&c.layout?"flow":"absolute"};members.set(key,{member:m,bounds:b,owner:id});
  return {key,natural:[...b.size],style:{...style,offset:style.offset??[b.origin[0]-c.origin[0],b.origin[1]-c.origin[1]]},...m.kind==="canvas"&&m.relation==="own"?{child:build(m.id)}:{}};
 })};};
 const report=solveCanvasFlex(build(canvasId)),result:CanvasFlexReport={canvasId,boxes:[],overflow:report.overflow,movedIds:[],commands:[]};
 const changes=new Map<string,{origin:[number,number];size:[number,number]}>(),boardMoves=new Map<string,[number,number]>();
 function visit(box:FlexBox,origin:[number,number],nodeId?:string){
  const absolute:[number,number]=[origin[0]+box.origin[0],origin[1]+box.origin[1]],record=members.get(box.key),c=nodeId?d.canvases![nodeId]:undefined;
  result.boxes.push({key:box.key,name:c?.name??(record?canvasTarget(d,record.member)!.name:box.key),kind:c?"canvas":record!.member.kind,origin:absolute,size:[...box.size],absolute:box.absolute});
  if(c){changes.set(c.id,{origin:absolute,size:[...box.size]});for(const child of box.children){const r=members.get(child.key)!;visit(child,absolute,r.member.kind==="canvas"&&r.member.relation==="own"?r.member.id:undefined);}return;}
  const {member:m,bounds:b,owner}=record!,delta:[number,number]=[absolute[0]-b.origin[0],absolute[1]-b.origin[1]],moved=delta.some(n=>Math.abs(n)>1e-7);
  const t=canvasTarget(d,m)!,container=d.canvases![owner];
  if(!box.absolute&&(t.units!==container.units||t.workPlane&&t.workPlane!==container.workPlane))throw Error(`${t.name}: flow requires matching units and work plane; keep this reference absolute.`);
  if(!box.absolute&&b.size.some((n,i)=>n>box.size[i]+1e-6))throw Error(`${t.name}: source exceeds its layout box. Increase the minimum size; CAD dimensions and crop are not resized by Flex.`);
  if(box.absolute){const parentBox=changes.get(owner)??container;for(const axis of [0,1]){const excess=Math.max(parentBox.origin[axis]-absolute[axis],absolute[axis]+b.size[axis]-parentBox.origin[axis]-parentBox.size[axis]);if(excess>1e-6&&!result.overflow.some(o=>o.key===box.key&&o.axis===(axis===0?"x":"y")))result.overflow.push({key:box.key,axis:axis===0?"x":"y",excess});}}
  if(!moved)return;
  if(m.relation!=="own")throw Error(`${t.name}: references are pinned to their source. Create an owned presentation frame before arranging it.`);
  if(m.kind==="object"){
   if(!allowModelMoves)throw Error(`${t.name}: enable explicit model translation to move original CAD objects. Model dimensions are never resized.`);
   const v=planeToWorld(delta,WORK_PLANES[container.workPlane]);result.commands.push({type:"move-object",objectId:m.id,translation:getObjectTransform(d.objects[m.id],Object.values(d.features).find(f=>f.output===m.id)).translation.map((n,i)=>n+v[i]) as [number,number,number]});
  }else if(m.kind==="artboard"){
   const board=d.artboards![m.id];if(!board.visible)throw Error(`Show frame ${board.name} before arranging it.`);
   result.commands.push({type:"update-artboard",artboardId:m.id,origin:absolute});boardMoves.set(m.id,delta);
  }else if(m.kind==="workspace-section"){
   const section=d.workspaceSections![m.id];result.commands.push({type:"upsert-workspace-section",section:{...section,origin:[section.origin[0]+delta[0],section.origin[1]+delta[1]]}});for(const id of section.frameIds)boardMoves.set(id,delta);
  }else throw Error(`${t.name}: use the owning sheet/scene/view placement tool; Flex cannot move this source directly.`);
  result.movedIds.push(canvasTargetKey(m));
 }
 visit(report.root,[...root.origin],canvasId);
 const flowKeys=new Set(result.boxes.filter(b=>!b.absolute).map(b=>b.key));
 const overflow=report.overflow.find(o=>flowKeys.has(o.key));if(overflow)throw Error(`Flex overflow: ${overflow.key} exceeds ${overflow.axis} by ${overflow.excess.toFixed(3)} mm. Increase the canvas, enable wrap, or correct min/max.`);
 for(const link of Object.values(d.frameLinks??{})){const a=boardMoves.get(link.fromId)??[0,0],b=boardMoves.get(link.toId)??[0,0];if(a.some((n,i)=>Math.abs(n-b[i])>1e-7))throw Error("Connected frames must move as one work area. Use the connected layout tool or group the complete connection tree.");}
 for(const [id,next] of changes){const old=d.canvases![id];if(JSON.stringify([old.origin,old.size])===JSON.stringify([next.origin,next.size]))continue;const reason=canvasLockReason(d,id);if(reason)throw Error(reason);result.commands.push({type:"upsert-canvas",canvas:{...old,...next}});result.movedIds.push(`canvas:${id}`);}
 return result;
}
