import {featureContract,type SolidFinish} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {getObjectTransform} from "../precision/objectTransform";
import {validateCommand} from "@agent-webcad/cad-commands";
import type {CadToolCall} from "./cadToolContract";
import type {CadModelingContext} from "./cadModelingTools";
import type {CopilotPlan} from "./copilotPlan";
/** Compose presentation commands after the same native geometry proposal, never a second publisher. */
export function planSceneTools(calls:CadToolCall[],context:CadModelingContext,geometry?:CopilotPlan):CopilotPlan{
 const d=context.document,commands:Exclude<CadCommand,{type:"batch"}>[]=geometry?(geometry.command.type==="batch"?[...geometry.command.commands] as Exclude<CadCommand,{type:"batch"}>[]:[geometry.command as Exclude<CadCommand,{type:"batch"}>]):[],layers=new Map(Object.values(d.layers).map(l=>[l.id,{visible:l.visible,locked:l.locked}]));
 const created=new Set(commands.flatMap(c=>"id"in c&&typeof c.id==="string"?[c.id]:[])),solidOutputs=new Set(commands.flatMap(c=>["boolean-operation","create-face-hole","create-edge-fillet","create-edge-chamfer","create-shell","create-primitive","create-extrude","create-wall","create-architectural-slab","create-boolean","create-loft","create-sweep","create-revolve"].includes(c.type)&&"id"in c&&typeof c.id==="string"?[c.id]:[]));
 const featuresByOutput=new Map(Object.values(d.features).map(f=>[f.output,f]));
 const states=new Map(Object.values(d.objects).map(o=>[o.id,{name:o.name,layerId:o.layerId,visible:o.visible,translation:getObjectTransform(o,featuresByOutput.get(o.id)).translation}]));
 for(const c of commands){if("id"in c&&typeof c.id==="string"&&created.has(c.id)){const base=c.type==="create-primitive"?c.primitive:c.type==="create-architectural-slab"?(c.definition.kind==="floor"?"floor":"ceiling"):c.type==="create-drawing"?c.drawing:c.type.replace("create-","");states.set(c.id,{name:base[0].toUpperCase()+base.slice(1),layerId:"layerId"in c&&typeof c.layerId==="string"?c.layerId:context.layerId,visible:true,translation:[0,0,0] as [number,number,number]});}if(c.type==="move-object"&&states.has(c.objectId))states.get(c.objectId)!.translation=c.translation;if(c.type==="set-object-visible"&&states.has(c.objectId))states.get(c.objectId)!.visible=c.visible;if(c.type==="rename-object"&&states.has(c.objectId))states.get(c.objectId)!.name=c.name;}
 const changed=new Set<string>(),summary=[...geometry?.summary??[]];
 for(const call of calls){const a=call.arguments;
  if(call.name==="scene.layer"){
   const id=a.id as string;if(layers.has(id)||created.has(id)||d.objects[id]||d.features[id])throw Error("Scene layer ID is already in use.");layers.set(id,{visible:true,locked:false});commands.push({type:"create-layer",id,name:a.name as string},{type:"set-layer-style",layerId:id,style:{color:a.color as string,lineType:"continuous",lineWeight:.25}});summary.push(`Create layer ${a.name} (${id}); active layer stays unchanged.`);
  }else{
   const objects=a.objects as {objectId:string;name?:string;delta?:[number,number,number]}[],layer=layers.get(a.layerId as string);if(!layer?.visible||layer.locked)throw Error("Presentation output layer must be visible and unlocked.");if(new Set(objects.map(o=>o.objectId)).size!==objects.length)throw Error("Scene object IDs must be unique.");
   for(const item of objects){const id=item.objectId,o=d.objects[id],f=featuresByOutput.get(id),l=o&&d.layers[o.layerId];
    if(!created.has(id)&&(!context.selectionIds.includes(id)||!o?.visible||!l?.visible||l.locked||!f||!d.rootObjects.includes(id)||f.pattern||f.construction))throw Error(`Select a visible unlocked independent object: ${id}. Presentation does not grant selection.`);
    if(a.finish&&!solidOutputs.has(id)&&(!f||featureContract(f).representation!=="brep"))throw Error("3D finishes require actual solid outputs.");
    const state=states.get(id)!;if(item.delta?.some(v=>v!==0)){if(f&&(f.params.modelSection||f.params.modelProjection||f.params.sketchId))throw Error("Move the owning sketch or drawing view, not one derived output.");const translation=state.translation.map((v,i)=>v+item.delta![i]) as [number,number,number];commands.push({type:"move-object",objectId:id,translation});state.translation=translation;}if(item.name&&state.name!==item.name){commands.push({type:"rename-object",objectId:id,name:item.name});state.name=item.name;}if(state.layerId!==a.layerId){commands.push({type:"move-object-to-layer",objectId:id,layerId:a.layerId as string});state.layerId=a.layerId as string;}if(a.finish)commands.push({type:"set-solid-finish",objectId:id,finish:a.finish as SolidFinish});if(state.visible!==a.visible){commands.push({type:"set-object-visible",objectId:id,visible:a.visible as boolean});state.visible=a.visible as boolean;}changed.add(id);
   }
   summary.push(`Organize ${objects.length} explicit objects on ${a.layerId}; visible ${a.visible}${a.finish?`; material ${(a.finish as SolidFinish).name}`:""}. Native placement is explicit; geometry definitions and ownership remain intact.`);
  }
 }
 const command:CadCommand={type:"batch",label:"Copilot: geometry and presentation",commands};if(!commands.length||!validateCommand(command))throw Error("Invalid scene presentation proposal.");
 return {...geometry,command,summary:summary.slice(0,20),ghosts:geometry?.ghosts??[],resultObjectIds:geometry?.resultObjectIds??[...changed],toolSteps:[...geometry?.toolSteps??[],...calls.map(c=>c.name)]};
}
