import {assertAssemblyPose,inspectAssemblyPlacement} from "../state/assemblyCommands";
import {validateAssembly} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import type {CadToolCall} from "./cadToolContract";
import type {CadModelingContext} from "./cadModelingTools";
export function readAssembly(c:CadModelingContext,call:CadToolCall){const intents=Object.values(c.document.interferenceIntents??{}),offset=Number(call.arguments.intentOffset??0),limit=Number(call.arguments.intentLimit??8);validateAssembly(c.document);assertAssemblyPose(c.document);return {valid:true,designIntents:{entries:structuredClone(intents.slice(offset,offset+limit)),total:intents.length,offset,nextOffset:offset+limit<intents.length?offset+limit:null},assembly:structuredClone(c.document.assembly??{version:1,grounded:[],joints:{}}),coordinates:"world XYZ Euler degrees; joint origin/axis in parent-local mm; angle absolute degrees / prismatic offset absolute mm from captured bind pose; coupling value = driver value * ratio + offset",limit:"tree joints, rigid unit-scale independent BRep/Mesh; no closed loops, physics or collision"};}
export function planAssembly(calls:CadToolCall[],c:CadModelingContext){
 if(!calls.some(x=>x.name.startsWith("assembly.")))return;if(calls.length!==1)throw Error("Review one assembly operation at a time.");const call=calls[0],a=call.arguments;let command:CadCommand;
 if(call.name==='assembly.part.place'){
  const id=String(a.objectId);if(!c.selectionIds.includes(id))throw Error('Select the Joint-owned target part.');
  command={type:'assembly-part-place',objectId:id,targetWorldPose:structuredClone(a.targetWorldPose) as any,descendantPolicy:a.descendantPolicy as any};
  const report=inspectAssemblyPlacement(c.document,command);
  if(!c.document.objects[id].visible||!c.document.layers[c.document.objects[id].layerId]?.visible)throw Error('Show the target part and layer.');
  return {command,ghosts:[],resultObjectIds:[id,...report.movedDescendants],summary:[JSON.stringify(report),...(report.requiresIntentReview?['REVIEW REQUIRED: World Joint anchors or existing design intent are affected. Reconfirm the original design intent before Apply.']:[])],toolSteps:[call.name]};
 }
 if(call.name==="assembly.joint.create")command={type:"assembly-joint-create",joint:JSON.parse(String(a.jointJson))};
 else if(call.name==="assembly.joint.update"){if((a.angle===undefined)===(a.offset===undefined))throw Error("Provide exactly one Joint angle or offset.");command=a.offset===undefined?{type:"assembly-joint-update",jointId:String(a.jointId),angle:Number(a.angle)}:{type:"assembly-joint-update",jointId:String(a.jointId),offset:Number(a.offset)};}
 else if(call.name==="assembly.joint.delete")command={type:"assembly-joint-delete",jointId:String(a.jointId)};
 else if(call.name==="assembly.joint.reparent")command={type:"assembly-joint-reparent",jointId:String(a.jointId),parentId:String(a.parentId),preserveWorld:a.preserveWorld as boolean};
 else if(call.name==="assembly.joint.edit")command={type:"assembly-joint-edit",jointId:String(a.jointId),edit:JSON.parse(String(a.editJson)),preserveWorld:a.preserveWorld as boolean};
 else if(call.name==="assembly.ground")command={type:"assembly-ground",objectId:String(a.objectId),grounded:Boolean(a.grounded)};
 else throw Error("Read-only assembly tool.");
 const ids=command.type==="assembly-joint-create"?[command.joint.parentId,command.joint.childId]:command.type==="assembly-ground"?[command.objectId]:command.type==="assembly-joint-reparent"?[c.document.assembly?.joints[command.jointId]?.childId,command.parentId]:[c.document.assembly?.joints[command.jointId]?.childId];
 if(ids.some(id=>!id||!c.selectionIds.includes(id)||!c.document.objects[id].visible||!c.document.layers[c.document.objects[id].layerId]?.visible||c.document.layers[c.document.objects[id].layerId].locked))throw Error("Select the visible unlocked Joint parts (child for update).");
 return {command,ghosts:[],resultObjectIds:ids as string[],summary:["Rigid Joint proposal. Native Preview / Apply required."],toolSteps:[call.name]};
}
