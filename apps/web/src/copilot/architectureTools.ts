import {featureContract,type ArchitectureWall,type CadDocument,type ArchitecturalSlab,type WallOpening} from "@agent-webcad/cad-document";
import {validateCommand,type CadCommand} from "@agent-webcad/cad-commands";
import {wallFootprint} from "../precision/architectureWall";
import {getObjectTransform} from "../precision/objectTransform";
import type {CadToolCall} from "./cadToolContract";
import type {CopilotPlan} from "./copilotPlan";
import type {WorkPlaneId} from "../precision/workPlane";

const names=new Set(["wall.create","wall.opening","wall.update","slab.create","drawing.section","drawing.refresh"]);
const featureFor=(d:CadDocument,id:string)=>Object.values(d.features).find(f=>f.output===id);
export function readArchitecture(d:CadDocument,ids:string[]){
 return ids.map(objectId=>{const object=d.objects[objectId],feature=featureFor(d,objectId);if(!object||!feature)throw Error(`Missing architectural source: ${objectId}`);
  const partIds=Object.values(d.modelPresentation?.parts??{}).filter(p=>p.objectId===objectId).map(p=>p.id);
  const views=[...Object.values(d.modelPresentation?.sections??{}),...Object.values(d.modelPresentation?.projections??{})].filter(v=>v.partIds.some(id=>partIds.includes(id)));
  const wall=feature.params.architecturalWall as ArchitectureWall|undefined,slab=feature.params.architecturalSlab as ArchitecturalSlab|undefined;
  return {objectId,name:object.name,wall:wall?structuredClone(wall):undefined,slab:slab?structuredClone(slab):undefined,sourceFrame:wall?wallFootprint(d,wall).frame:undefined,transform:getObjectTransform(object,feature),coordinates:"Wall source frame before host transform; along measures opening center from source start. World lengths mm.",drawings:views.map(v=>({id:v.id,name:v.name,basis:v.basis,status:v.status,reason:v.reason})),limits:"Opening geometry is real; no door-leaf swing, room adjacency, accessibility or egress certification."};
 });
}

/** Bind existing architectural commands to the same selected-source and detached Review contract. */
export function planArchitectureTools(calls:CadToolCall[],context:{document:CadDocument;selectionIds:string[];layerId:string;workPlane:WorkPlaneId}):CopilotPlan|undefined{
 if(!calls.some(c=>names.has(c.name)))return;
 if(calls.some(c=>!names.has(c.name)&&c.name!=="curve.polyline"))throw Error("Architectural proposals use wall/slab/section tools and explicit XY polyline profiles only. Apply other geometry or annotations as a separate review.");
 const {document:d,layerId}=context,layer=d.layers[layerId];if(!layer?.visible||layer.locked)throw Error("Choose a visible unlocked output layer.");
 const commands:Exclude<CadCommand,{type:"batch"}>[]=[],outputs=new Set<string>(),created=new Set<string>(),profiles=new Set<string>(),summary:string[]=[];
 const occupied=new Set([...Object.keys(d.objects),...Object.keys(d.features),...Object.keys(d.sketches??{}),...Object.keys(d.workPlanes??{}),...Object.keys(d.modelPresentation?.parts??{}),...Object.keys(d.modelPresentation?.sections??{}),...Object.keys(d.modelPresentation?.projections??{})]);
 const reserve=(id:string)=>{if([id,`feature-${id}`].some(k=>occupied.has(k)))throw Error(`Architectural output ${id} already exists.`);occupied.add(id);occupied.add(`feature-${id}`);};
 const selected=(id:string,wall=false)=>{const o=d.objects[id],f=featureFor(d,id),l=o&&d.layers[o.layerId];if(!context.selectionIds.includes(id)||!o?.visible||!f||!l?.visible||l.locked||!d.rootObjects.includes(id)||f.pattern||f.construction)throw Error(`Select a visible unlocked independent ${wall?"native wall":"source"}: ${id}. A read is not an edit grant.`);if(wall&&!f.params.architecturalWall)throw Error("Select a native wall; an ordinary box is not a wall host.");return f;};
 const partByObject=new Map(Object.values(d.modelPresentation?.parts??{}).map(p=>[p.objectId,p.id]));
 const refresh=(ids:string[])=>{
  const parts=new Set(ids.flatMap(id=>partByObject.has(id)?[partByObject.get(id)!]:[]));let count=0;
  for(const v of Object.values(d.modelPresentation?.sections??{}))if(v.partIds.some(p=>parts.has(p))){const {status:_,reason:__,outputs:___,decorations:____,presentationWarnings:_____,...view}=v;commands.push({type:"upsert-model-section",view});count++;}
  for(const v of Object.values(d.modelPresentation?.projections??{}))if(v.partIds.some(p=>parts.has(p))){const {status:_,reason:__,outputs:___,...view}=v;commands.push({type:"upsert-model-projection",...view});count++;}
  return count;
 };
 for(const call of calls){const a=call.arguments;
  if(call.name==="curve.polyline"){
   if(a.plane!=="XY"||a.closed!==true||(a.points as number[][]).length<3||(a.points as number[][]).some(p=>p[2]!==0))throw Error("Architectural slab profiles must be closed XY polylines at source Z=0.");const id=a.id as string;reserve(id);commands.push({type:"create-drawing",id,drawing:"polyline",layerId,params:{workPlane:"XY",points:a.points,closed:true}});profiles.add(id);outputs.add(id);summary.push(`Editable slab boundary ${id}; source coordinates XY mm.`);
  }else if(call.name==="wall.create"){
   if(context.workPlane!=="XY")throw Error("Native wall centerlines require the XY work plane; baseLevel is world Z.");
   const id=a.id as string,axis=`${id}_axis`,start=a.start as number[],end=a.end as number[];reserve(id);reserve(axis);
   if(Math.hypot(end[0]-start[0],end[1]-start[1])<1e-6)throw Error("Wall centerline needs distinct endpoints.");
   commands.push({type:"create-drawing",id:axis,drawing:"line",layerId,params:{workPlane:"XY",points:[[...start,0],[...end,0]]}},{type:"create-wall",id,layerId,definition:{mode:"centerline",sourceObjectIds:[axis],height:a.height as number,thickness:a.thickness as number,baseLevel:a.baseLevel as number,...a.startMiter!==undefined?{startMiter:a.startMiter as number}:{},...a.endMiter!==undefined?{endMiter:a.endMiter as number}:{},openings:a.openings as WallOpening[]}},{type:"set-object-visible",objectId:axis,visible:false},{type:"rename-object",objectId:id,name:`벽 (${start.join(",")} → ${end.join(",")})`});
   created.add(id);outputs.add(id);summary.push(`Native XY wall ${id}: ${a.thickness} mm thick, ${a.height} mm high at Z ${a.baseLevel}; ${(a.openings as unknown[]).length} hosted openings. Explicit miter ends when supplied; no inferred junction graph.`);
  }else if(call.name==="wall.opening"||call.name==="wall.update"){
   const id=a.objectId as string;selected(id,true);if(call.name==="wall.opening")commands.push({type:"upsert-wall-opening",objectId:id,opening:a.opening as WallOpening});
   else commands.push({type:"update-wall",objectId:id,height:a.height as number,thickness:a.thickness as number,baseLevel:a.baseLevel as number,...a.startMiter!==undefined?{startMiter:a.startMiter as number}:{},...a.endMiter!==undefined?{endMiter:a.endMiter as number}:{},...a.start?{start:a.start as [number,number]}:{},...a.end?{end:a.end as [number,number]}:{}});
   const count=a.refreshDrawings?refresh([id]):0;outputs.add(id);summary.push(call.name==="wall.opening"?`Hosted ${(a.opening as WallOpening).kind} ${(a.opening as WallOpening).id}: center ${(a.opening as WallOpening).along}, width ${(a.opening as WallOpening).width}, height ${(a.opening as WallOpening).height}, side ${(a.opening as WallOpening).side}, sill ${(a.opening as WallOpening).sill} mm.`:`Retain wall ${id} and opening IDs; height ${a.height}, thickness ${a.thickness}, base Z ${a.baseLevel} mm.`);summary.push(a.refreshDrawings?`Explicitly rebuild ${count} related drawings in this same Undo; unresolved/locked output is never silently accepted.`:"Drawing correspondence is checked by native regeneration; ambiguous references remain unresolved until explicit rebind.");
  }else if(call.name==="slab.create"){
   if(context.workPlane!=="XY")throw Error("Native floor/ceiling profiles require XY.");const ids=a.profileObjectIds as string[];if(new Set(ids).size!==ids.length)throw Error("Slab source IDs must be unique.");for(const id of ids){if(profiles.has(id))continue;const f=selected(id);if(!["drawing","drafting"].includes(f.type))throw Error("Select actual XY boundary curves, not a solid or independent room label.");}
   const id=a.id as string;reserve(id);commands.push({type:"create-architectural-slab",id,layerId,definition:{kind:a.kind as "floor"|"ceiling",sourceObjectIds:ids,level:a.level as number,thickness:a.thickness as number}});for(const source of ids){outputs.delete(source);if(profiles.has(source))commands.push({type:"set-object-visible",objectId:source,visible:false});}created.add(id);outputs.add(id);summary.push(`Linked ${a.kind} ${id}: level ${a.level}, thickness ${a.thickness} mm. Source profiles and holes remain linked; native validation decides valid regions.`);
  }else if(call.name==="drawing.section"){
   const id=a.id as string;if(a.replaceExisting){const prior=d.modelPresentation?.sections?.[id];if(!prior)throw Error("Explicit section replacement requires that existing section ID.");const priorLayer=d.layers[prior.layerId];if(!priorLayer?.visible||priorLayer.locked)throw Error("The existing section output layer must be visible and unlocked.");}else reserve(id);const ids=a.objectIds as string[];if(new Set(ids).size!==ids.length)throw Error("Section source IDs must be unique.");const partIds=ids.map(objectId=>{if(!created.has(objectId)){const f=selected(objectId);if(featureContract(f).representation!=="brep")throw Error("A BRep section requires actual solid sources.");}let partId=partByObject.get(objectId);if(!partId){partId=`part_${objectId}`;reserve(partId);commands.push({type:"register-model-part",part:{id:partId,name:d.objects[objectId]?.name??objectId,objectId}});partByObject.set(objectId,partId);}return partId;});
   commands.push({type:"upsert-model-section",view:{id,name:a.name as string,partIds,basis:a.basis as WorkPlaneId,height:a.height as number,origin:a.origin as [number,number],scale:a.scale as number,layerId}});summary.push(`Associated ${a.basis} BRep cut ${id} at world ${a.basis==="XY"?"Z":a.basis==="XZ"?"Y":"X"}=${a.height} mm, scale ${a.scale}. Output derives from the actual solids; not a hand-drawn section.`);
  }else{
   const ids=a.objectIds as string[];for(const id of ids){const f=selected(id);if(featureContract(f).representation!=="brep")throw Error("Refresh requires selected solid sources.");}const count=refresh(ids);if(!count)throw Error("No associated drawing belongs to the selected sources.");summary.push(`Explicitly rebind ${count} associated drawings for the selected sources. A failed correspondence or locked dependent blocks the whole operation.`);
  }
 }
 const command:CadCommand={type:"batch",label:"Copilot: native architectural workflow",commands};if(!validateCommand(command))throw Error("Invalid native architectural proposal.");
 return {command,summary:summary.slice(0,20),ghosts:[],resultObjectIds:[...outputs],toolSteps:calls.map(c=>c.name)};
}
