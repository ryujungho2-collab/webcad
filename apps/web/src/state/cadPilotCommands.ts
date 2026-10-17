import * as THREE from "three";
import type {CadDocument} from "@agent-webcad/cad-document";
import type {CadCommand,CommandBus} from "@agent-webcad/cad-commands";
import {resolveStoredWorkPlane} from "./attachedWorkPlane";
import {WORK_PLANES,type WorkPlane,type Vec3,planeToWorld} from "../precision/workPlane";
import {drawingModelOrigin} from "../precision/worldGeometry";
import {getObjectTransform} from "../precision/objectTransform";
import {createDrawingTopology} from "../precision/drawingTopology";

export async function resolvePilotPlane(document:CadDocument,id:string):Promise<WorkPlane>{
 if(id==="WCS")return WORK_PLANES.XY;
 const stored=document.workPlanes?.[id];if(!stored)throw Error("The active UCS is missing. Return to WCS or choose a saved work plane.");
 const resolved=await resolveStoredWorkPlane(document,stored);if(resolved.status!=="resolved")throw Error(`Active UCS: ${resolved.reason}`);
 return {id,...resolved.frame};
}
type Members=Extract<CadCommand,{type:"paste-drawing-snapshot"}>["members"];
export type DrawingClipboard={documentId:string;base:Vec3;members:Members};
let clipboard:DrawingClipboard|undefined;
export function readDrawingClipboard(){return clipboard?structuredClone(clipboard):undefined;}
export function copyDrawingClipboard(document:CadDocument,ids:string[],base:Vec3){
 if(!ids.length||ids.length>64||!base.every(Number.isFinite))throw Error("Choose 1–64 independent drawings and a finite world base point.");
 const members=[...new Set(ids)].map(id=>{
  const object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id);
  if(!object?.visible||!document.layers[object.layerId]?.visible||feature?.type!=="drawing"||feature.inputs.length||feature.params.modelProjection||feature.params.sketchId||feature.params.construction||feature.pattern||feature.construction||!["line","polyline","rectangle","circle","arc","point"].includes(String(feature.params.kind))||Object.values(document.parameterBindings??{}).some(b=>b.target.kind==="feature"&&b.target.objectId===id))throw Error(`${object?.name??id}: clipboard pilot supports independent finite drawings; sketch, construction, pattern, bound, solid and annotation owners need X4-A2.`);
  const params=structuredClone(feature.params);delete params.topology;
  return {name:object.name,layerId:object.layerId,params,transform:getObjectTransform(object,feature)};
 });
 clipboard={documentId:document.id,base:[...base],members};return readDrawingClipboard()!;
}
export function clipboardPasteCommand(document:CadDocument,target:Vec3):CadCommand{
 const copy=readDrawingClipboard();if(!copy)throw Error("Copy independent drawings with a base point first.");
 if(copy.documentId!==document.id)throw Error("Clipboard pilot is limited to the same document; copy again here.");
 return {type:"paste-drawing-snapshot",sourceDocumentId:copy.documentId,members:copy.members,delta:target.map((v,i)=>v-copy.base[i]) as Vec3};
}
export function registerCadPilotCommands(bus:CommandBus,document:CadDocument){
 bus.registerHandler("paste-drawing-snapshot",async command=>{
  if(command.type!=="paste-drawing-snapshot")return;
  if(command.sourceDocumentId!==document.id)throw Error("Clipboard pilot requires the source document.");
  for(const m of command.members){const layer=document.layers[m.layerId];if(!layer?.visible||layer.locked)throw Error(`Clipboard target layer ${m.layerId} is missing, hidden or locked.`);if(m.params.sketchId||m.params.facePlaneId)throw Error("Clipboard members must be independent drawings.");}
  const ids:string[]=[];
  for(const m of command.members){
   const id=`paste-${crypto.randomUUID()}`,params:Record<string,unknown>={...structuredClone(m.params),topology:createDrawingTopology(String(m.params.kind),m.params,id)};
   const result=await bus.dispatch({type:"create-drawing",id,drawing:String(params.kind) as "line",params,layerId:m.layerId});
   if(!document.objects[id]||!result)throw Error("Clipboard drawing parameters are unsupported.");
   document.objects[id].name=`${m.name} Copy`;document.objects[id].transform={...structuredClone(m.transform),translation:m.transform.translation.map((v,i)=>v+command.delta[i]) as Vec3};ids.push(id);
  }
  return {createdIds:ids};
 });
 bus.registerHandler("create-ucs-drawing",async command=>{
  if(command.type!=="create-ucs-drawing")return;
  const plane=await resolvePilotPlane(document,command.planeId),[a,b]=command.points;
  const params:Record<string,unknown>=command.drawing==="line"?{workPlane:"XY",points:[[...a,0],[...b,0]]}:{workPlane:"XY",center:[...a,0],radius:command.radius};
  const id=command.id??`ucs-${crypto.randomUUID()}`,result=await bus.dispatch({type:"create-drawing",id,drawing:command.drawing,params,layerId:command.layerId});if(!document.objects[id]||!result)throw Error("UCS drawing could not be created; check the layer and finite geometry.");
  const basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(...plane.xAxis),new THREE.Vector3(...plane.yAxis),new THREE.Vector3(...plane.normal)),e=new THREE.Euler().setFromRotationMatrix(basis,"XYZ"),origin=drawingModelOrigin({...params,kind:command.drawing}),world=planeToWorld([origin[0],origin[1]],plane);
  document.objects[id].transform={translation:world.map((v,i)=>v-origin[i]) as Vec3,rotation:[e.x,e.y,e.z].map(v=>THREE.MathUtils.radToDeg(v)||0) as Vec3,scale:[1,1,1]};return id;
 });
 bus.registerHandler("move-in-ucs",async command=>{
  if(command.type!=="move-in-ucs")return;
  const plane=await resolvePilotPlane(document,command.planeId),delta=command.delta.map((_,i)=>plane.xAxis[i]*command.delta[0]+plane.yAxis[i]*command.delta[1]+plane.normal[i]*command.delta[2]) as Vec3;
  const commands=command.objectIds.map(id=>{const object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id);if(!object||!feature||feature.params.modelProjection||feature.params.sketchId||feature.params.construction||feature.pattern||feature.construction)throw Error("Local Move pilot needs independent model objects; edit the owning sketch, pattern or construction separately.");const transform=getObjectTransform(object,feature);return {type:"move-object" as const,objectId:id,translation:transform.translation.map((v,i)=>v+delta[i]) as Vec3};});
  return bus.dispatch({type:"batch",label:"Move in active UCS",commands});
 });
}
