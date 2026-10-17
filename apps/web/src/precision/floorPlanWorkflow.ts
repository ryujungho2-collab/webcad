import type { CadDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { getWorldDrawingGeometry, type WorldProfileSegment } from "./worldGeometry";
import { extractSketchLoops, type SketchLoop } from "./sketchProfiles";
import { WORK_PLANES,worldToPlane, type Vec3 } from "./workPlane";
import {angleOnSweep} from "./snapEngine";

export type FloorIssue = { kind: "gap"|"duplicate"|"branch"|"nonplanar"|"unsupported"|"intersection"; message:string; objectIds:string[]; point?:Vec3; distanceMm?:number };
export type FloorAnalysis = { issues:FloorIssue[]; loops:SketchLoop[]; bridges:[Vec3,Vec3][]; sourceIds:string[] };
const distance=(a:Vec3,b:Vec3)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const same=(a:Vec3,b:Vec3)=>distance(a,b)<=1e-6;
type Edge=WorldProfileSegment & {objectId:string};

/** Conservative reachability: hidden/locked/live references remain roots, names never imply deletion. */
export function floorPurgeCandidates(document:CadDocument) {
  const strings=(value:unknown,result=new Set<string>())=>{
    const todo=[value];while(todo.length){const v=todo.pop();if(typeof v==="string")result.add(v);else if(v&&typeof v==="object")for(const [key,item] of Object.entries(v)){result.add(key);todo.push(item);}}
    return result;
  };
  const {blocks={},layers:_,rootLayers:__,...rest}=document, refs=strings(rest),used=new Set<string>();
  const visit=(id:string)=>{if(used.has(id)||!blocks[id])return;used.add(id);for(const ref of strings(blocks[id].members))if(blocks[ref])visit(ref);};
  for(const ref of refs)if(blocks[ref])visit(ref);
  for(const id of used)strings(blocks[id],refs);
  return {
    blockIds:Object.keys(blocks).filter(id=>!used.has(id)),
    layerIds:Object.values(document.layers).filter(layer=>layer.id!=="layer-default"&&!layer.locked&&!layer.objectIds.length&&!refs.has(layer.id)).map(l=>l.id),
  };
}

/** Bounded diagnostic pass; originals and exact arcs are never flattened or rewritten. */
export function analyzeFloorSelection(document:CadDocument,objectIds:readonly string[],toleranceMm:number,repair=false):FloorAnalysis {
  if(!Number.isFinite(toleranceMm)||toleranceMm<0||toleranceMm>10)throw Error("Repair tolerance must be between 0 and 10 mm.");
  const sourceIds=[...new Set(objectIds)],issues:FloorIssue[]=[],edges:Edge[]=[],bridges:[Vec3,Vec3][]=[];
  if(!sourceIds.length)throw Error("Select visible line/arc drawings, including any hole boundaries.");
  if(sourceIds.length>2000)throw Error("Diagnose at most 2,000 drawings per selection.");
  let plane:string|undefined,elevation:number|undefined;
  for(const id of sourceIds){
    const object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id),layer=object&&document.layers[object.layerId];
    const world=object&&feature?.type==="drawing"?getWorldDrawingGeometry(object,feature):null;
    if(!object?.visible||!layer?.visible||!world||feature?.params.construction){issues.push({kind:"unsupported",message:"Select visible finite drawings; blocks must be explicitly exploded first.",objectIds:[id]});continue;}
    const point=world.points?.[0]??world.center;
    if(!world.planeAligned||!world.uniformScale||plane&&world.workPlane!==plane||!point){issues.push({kind:"nonplanar",message:"Drawings must share a supported principal plane and uniform placement.",objectIds:[id],point});continue;}
    plane=world.workPlane;const normal=WORK_PLANES[world.workPlane].normal,points=[...(world.points??[]),...(world.center?[world.center]:[])];
    elevation??=point.reduce((sum,v,i)=>sum+v*normal[i],0);
    if(points.some(p=>Math.abs(p.reduce((sum,v,i)=>sum+v*normal[i],0)-elevation!)>1e-6)){issues.push({kind:"nonplanar",message:"Z/plane deviation is not repaired by flattening.",objectIds:[id],point});continue;}
    if(world.kind==="circle")continue;
    if(world.kind==="arc"&&world.center&&world.radius&&world.startAngle!==undefined&&world.endAngle!==undefined&&world.points?.length)edges.push({kind:"arc",objectId:id,topologyReference:"curve:0",start:world.points[0],end:world.points.at(-1)!,center:world.center,radius:world.radius,startAngle:world.startAngle,endAngle:world.endAngle});
    else if(world.profileSegments?.length)edges.push(...world.profileSegments.map(edge=>({...edge,objectId:id})));
    else issues.push({kind:"unsupported",message:"Make face currently accepts exact lines and circular arcs, not ellipse/spline.",objectIds:[id],point});
  }
  if(edges.length>2000)throw Error("Diagnose at most 2,000 exact edges per selection.");
  const nodes:{point:Vec3;edges:Edge[]}[]=[];
  for(const edge of edges)for(const p of [edge.start,edge.end]){let node=nodes.find(n=>same(n.point,p));if(!node){node={point:p,edges:[]};nodes.push(node);}node.edges.push(edge);}
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
    const a=edges[i],b=edges[j],equalEnds=same(a.start,b.start)&&same(a.end,b.end)||same(a.start,b.end)&&same(a.end,b.start);
    const midA=(a.startAngle!+a.endAngle!)/2,midB=(b.startAngle!+b.endAngle!)/2;
    const sameArc=a.kind==="arc"&&b.kind==="arc"&&a.center&&b.center&&same(a.center,b.center)&&Math.abs(a.radius!-b.radius!)<1e-6&&Math.abs(Math.abs(a.endAngle!-a.startAngle!)-Math.abs(b.endAngle!-b.startAngle!))<1e-8&&Math.hypot(Math.cos(midA)-Math.cos(midB),Math.sin(midA)-Math.sin(midB))<1e-8;
    if(a.kind===b.kind&&equalEnds&&(a.kind==="line"||sameArc))issues.push({kind:"duplicate",message:"Duplicate boundaries: explicitly remove the unwanted copy before Make face.",objectIds:[a.objectId,b.objectId],point:a.start});
    // T junctions in straight interiors are not safe endpoint repairs.
    for(const [line,other] of [[a,b],[b,a]])if(line.kind==="line")for(const p of [other.start,other.end]){
      const delta=line.end.map((v,k)=>v-line.start[k]),length2=delta.reduce((s,v)=>s+v*v,0),t=p.reduce((s,v,k)=>s+(v-line.start[k])*delta[k],0)/length2;
      if(t>1e-8&&t<1-1e-8&&distance(p,line.start.map((v,k)=>v+t*delta[k]) as Vec3)<=1e-6)issues.push({kind:"branch",message:"T junction on an edge interior. Split/trim explicitly.",objectIds:[line.objectId,other.objectId],point:p});
    }
    for(const [arc,other] of [[a,b],[b,a]])if(arc.kind==="arc"&&arc.center&&plane)for(const p of [other.start,other.end]){
      const center=worldToPlane(arc.center,WORK_PLANES[plane as keyof typeof WORK_PLANES]),q=worldToPlane(p,WORK_PLANES[plane as keyof typeof WORK_PLANES]);
      if(!same(p,arc.start)&&!same(p,arc.end)&&Math.abs(distance(p,arc.center)-arc.radius!)<=1e-6&&angleOnSweep(Math.atan2(q[1]-center[1],q[0]-center[0]),arc.startAngle!,arc.endAngle!))issues.push({kind:"branch",message:"T junction on an arc interior. Split/trim explicitly.",objectIds:[arc.objectId,other.objectId],point:p});
    }
  }
  for(const node of nodes.filter(n=>n.edges.length>2))issues.push({kind:"branch",message:"More than two edges meet at a vertex.",objectIds:[...new Set(node.edges.map(e=>e.objectId))],point:node.point});
  const dangling=nodes.filter(n=>n.edges.length===1),paired=new Set<object>();
  for(const node of dangling){
    if(paired.has(node))continue;
    const nearby=dangling.filter(n=>n!==node&&!paired.has(n)&&distance(n.point,node.point)<=toleranceMm);
    const other=nearby[0],mutual=other&&dangling.filter(n=>n!==other&&!paired.has(n)&&distance(n.point,other.point)<=toleranceMm);
    if(repair&&nearby.length===1&&mutual?.length===1){bridges.push([node.point,other.point]);paired.add(node);paired.add(other);}
    else {const nearest=dangling.filter(n=>n!==node).sort((a,b)=>distance(a.point,node.point)-distance(b.point,node.point))[0];issues.push({kind:"gap",message:nearby.length>1?"Ambiguous gap: choose/split the intended boundary.":"Open endpoint. Review tolerance to propose an explicit bridge.",objectIds:node.edges.map(e=>e.objectId),point:node.point,distanceMm:nearest?distance(node.point,nearest.point):undefined});}
  }
  const proposal=structuredClone(document),ids=[...sourceIds];
  for(const [i,points] of bridges.entries()){
    const id=`floor-diagnostic-bridge-${i}`;ids.push(id);
    proposal.objects[id]={id,name:id,geometryId:id,visible:true,layerId:"layer-default",transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
    proposal.features[id]={id,type:"drawing",inputs:[],output:id,params:{kind:"line",points,workPlane:plane??"XY"}};
  }
  const result=extractSketchLoops(proposal,ids,{forRegeneration:true});
  if(!result.ok&&!issues.length)issues.push({kind:"intersection",message:result.reason,objectIds:sourceIds,point:edges[0]?.start});
  return {issues,loops:issues.length||!result.ok?[]:result.loops,bridges,sourceIds};
}

export type FloorTaskIntent={requestId:string;documentId:string;revision:number;kind:"purge"|"make-face";targetIds:string[];toleranceMm:number;repair:boolean;layerId:string};
export function planFloorTask(document:CadDocument,intent:FloorTaskIntent):{command:CadCommand;analysis?:FloorAnalysis;summary:string[]} {
  if(document.id!==intent.documentId||document.revision!==intent.revision)throw Error("Document changed. Review this task again.");
  if(intent.kind==="purge"){
    const candidates=floorPurgeCandidates(document);
    if(!candidates.blockIds.length&&!candidates.layerIds.length)throw Error("No unused definitions or empty unreferenced layers to purge.");
    return {command:{type:"purge-unused",...candidates},summary:[...candidates.blockIds.map(id=>`Unused definition: ${document.blocks![id].name} (${id})`),...candidates.layerIds.map(id=>`Empty layer: ${document.layers[id].name} (${id})`)]};
  }
  const analysis=analyzeFloorSelection(document,intent.targetIds,intent.toleranceMm,intent.repair);
  if(analysis.issues.length)throw Error(analysis.issues.map(i=>i.message).join(" "));
  const commands:Exclude<CadCommand,{type:"batch"}>[]=[],sources=[...intent.targetIds];
  for(const [i,points] of analysis.bridges.entries()){const id=`floor-bridge-${intent.requestId}-${i}`;sources.push(id);commands.push({type:"create-drawing",id,drawing:"line",params:{points,workPlane:analysis.loops[0].workPlane},layerId:intent.layerId});}
  commands.push({type:"create-drafting",id:`floor-face-${intent.requestId}`,params:{kind:"face",sourceObjectIds:sources,workPlane:analysis.loops[0].workPlane},layerId:intent.layerId});
  return {command:{type:"batch",label:"Make floor-plan face",commands},analysis,summary:[`${analysis.loops.length} regions, ${analysis.loops.reduce((s,l)=>s+(l.holes?.length??0),0)} holes`,...analysis.bridges.map(([a,b])=>`Add bridge ${distance(a,b).toFixed(6)} mm; original edges unchanged`)]};
}
