import {validateCommand,type CadCommand} from "@agent-webcad/cad-commands";
import {resolveHybridReference,hybridSource,hybridTopology} from "../state/hybridReferences";
import {canConvertBrep} from "../state/hybridCommands";
import type {CadToolCall} from "./cadToolContract";
import type {CadModelingContext} from "./cadModelingTools";
import type {CopilotPlan} from "./copilotPlan";
export function readHybridTools(context:CadModelingContext,call:CadToolCall){
  const document=context.document;
  if(call.name==="hybrid.reference.validate"){const p=document.workPlanes?.[String(call.arguments.referenceId)];if(!p?.hybrid)throw Error("Hybrid reference not found.");return {reference:p.hybrid,resolution:resolveHybridReference(document,p.hybrid)};}
  const id=String(call.arguments.objectId),feature=Object.values(document.features).find(f=>f.output===id);if(!feature)throw Error("Object not found.");
  return {objectId:id,convertible:canConvertBrep(feature),conversion:feature.params.hybridConversion??null,conversionMapCurrent:feature.params.hybridConversion?hybridTopology(feature.params.mesh as import("@agent-webcad/cad-document").EditableMesh)===(feature.params.hybridConversion as {resultTopologyFingerprint:string}).resultTopologyFingerprint:null,datum:feature.params.hybridDatum??null,source:feature.type==="mesh"?{fingerprint:hybridSource(document,id).fingerprint,coordinates:"object-local mm; origin/direction ray"}:null,references:Object.values(document.workPlanes??{}).filter(p=>p.hybrid?.objectId===id).map(p=>({id:p.id,reference:p.hybrid,resolution:resolveHybridReference(document,p.hybrid!)})),policy:"Topology/derivation changes require explicit reselection. Procedural outputs require Bake. Planar boxes/hybrid prisms only for BRep conversion."};
}
export function planHybridTools(calls:CadToolCall[],context:CadModelingContext):CopilotPlan|undefined{
  if(!calls.some(c=>c.name.startsWith("hybrid.")))return;if(calls.length!==1)throw Error("Review one Hybrid operation per proposal.");
  const call=calls[0],a=call.arguments;let command:CadCommand;
  if(call.name==="hybrid.reference.create"){const ray=JSON.parse(String(a.rayJson));command={type:"hybrid-reference",objectId:String(a.objectId),referenceId:String(a.referenceId),origin:ray.origin,direction:ray.direction,expectedFingerprint:a.expectedFingerprint as string|undefined};}
  else if(call.name==="hybrid.datum.create")command={type:"hybrid-datum",referenceId:String(a.referenceId),width:Number(a.width),depth:Number(a.depth),height:Number(a.height),id:(a.id as string|undefined)??`hybrid-${crypto.randomUUID()}`};
  else if(call.name==="hybrid.brep.toMesh")command={type:"hybrid-to-mesh",objectId:String(a.objectId),id:(a.id as string|undefined)??`converted-${crypto.randomUUID()}`};
  else throw Error("Read-only Hybrid tool cannot modify geometry.");
  const sourceId="objectId" in command?command.objectId:context.document.workPlanes?.[command.referenceId]?.hybrid?.objectId;
  const object=sourceId&&context.document.objects[sourceId],layer=object&&context.document.layers[object.layerId];
  if(!sourceId||!context.selectionIds.includes(sourceId)||!object||!object.visible||!layer||!layer.visible||layer.locked)throw Error("Select the visible unlocked source object first.");
  if(!validateCommand(command))throw Error("Invalid Hybrid command.");
  return {command,ghosts:[],resultObjectIds:["id" in command&&command.id?command.id:sourceId],summary:["Mesh material-point reference; no nearest-face substitution.","OpenCascade rectangular extrusion / planar-only conversion. Native Review/Apply required."],toolSteps:[call.name]};
}
