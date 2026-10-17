import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import type { CadBlock, CadDocument, CadFeature } from "@agent-webcad/cad-document";
import { validDraftingParams, refreshDrafting } from "../precision/draftingGeometry";
import { getObjectTransform } from "../precision/objectTransform";
import { WORK_PLANES, type Vec3, type WorkPlaneId } from "../precision/workPlane";

export function registerDraftingCommandHandlers(bus:CommandBus,document:CadDocument) {
  const editable=(id:string)=>{const object=document.objects[id],layer=object&&document.layers[object.layerId];return object?.visible&&layer?.visible&&!layer.locked?object:null;};
  const create=(id:string,layerId:string,params:Record<string,unknown>)=>{
    const layer=document.layers[layerId];if(!layer||layer.locked||!layer.visible||document.objects[id]||document.features[`feature-${id}`])return;
    document.objects[id]={id,name:String(params.kind),geometryId:`geometry-${id}`,visible:true,layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
    document.features[`feature-${id}`]={id:`feature-${id}`,type:"drafting",inputs:["hatch","face"].includes(String(params.kind))?[...(params.sourceObjectIds as string[])]:typeof params.sourceObjectId==="string"?[params.sourceObjectId]:[],output:id,params:structuredClone(params)};
    refreshDrafting(document);layer.objectIds.push(id);document.rootObjects.push(id);document.revision++;return id;
  };
  const containsBlock=(blockId:string,targetId:string,seen=new Set<string>()):boolean=>{
    if(blockId===targetId)return true;
    if(seen.has(blockId))return false;
    const block=document.blocks?.[blockId];if(!block)return false;
    const next=new Set(seen);next.add(blockId);
    return block.members.some(member=>member.type==="drafting"&&member.params.kind==="block"&&typeof member.params.blockId==="string"&&containsBlock(member.params.blockId,targetId,next));
  };
  const componentMembers=(objectIds:string[],base:Vec3,targetBlockId:string):{members:CadBlock["members"];plane:WorkPlaneId}|null=>{
    const members:CadBlock["members"]=[];
    let plane:WorkPlaneId|undefined;
    for(const id of objectIds){
      const object=editable(id),feature=Object.values(document.features).find(entry=>entry.output===id);
      if(!object||!feature||!(["drawing","drafting"] as string[]).includes(feature.type)||feature.params.sketchId||["hatch","face"].includes(String(feature.params.kind)))return null;
      const candidatePlane=String(feature.params.workPlane??"XY") as WorkPlaneId;
      if(!WORK_PLANES[candidatePlane]||plane&&candidatePlane!==plane)return null;
      if(feature.params.kind==="block"){
        const nestedId=String(feature.params.blockId??"");
        if(!document.blocks?.[nestedId]||containsBlock(nestedId,targetBlockId))return null;
      }
      plane=candidatePlane;
      const transform=getObjectTransform(object,feature);
      transform.translation=transform.translation.map((value,index)=>value-base[index]) as Vec3;
      const params=structuredClone(feature.params);delete params.sourceObjectId;
      members.push({type:feature.type as "drawing"|"drafting",objectId:id,params,transform,layerId:object.layerId});
    }
    if(!plane||Math.abs(base.reduce((sum,value,index)=>sum+value*WORK_PLANES[plane!].normal[index],0))>1e-6)return null;
    return {members,plane};
  };
  bus.registerHandler("set-layer-style",(command:CadCommand)=>{
    if(command.type!=="set-layer-style")return;
    const layer=document.layers[command.layerId];if(!layer||layer.locked||JSON.stringify(layer.style)===JSON.stringify(command.style))return;
    layer.style=structuredClone(command.style);document.revision++;
  });
  bus.registerHandler("create-drafting",(command:CadCommand)=>{
    if(command.type!=="create-drafting"||!validDraftingParams(command.params))return;
    return create(command.id??`draft-${crypto.randomUUID()}`,command.layerId??"layer-default",command.params);
  });
  bus.registerHandler("update-drafting",(command:CadCommand)=>{
    if(command.type!=="update-drafting"||!editable(command.objectId))return;
    const feature=Object.values(document.features).find(f=>f.output===command.objectId);
    if(feature?.type!=="drafting"||feature.params.kind==="block")return;
    const params={...feature.params,...command.params};
    if(!validDraftingParams(params)||params.kind!==feature.params.kind||JSON.stringify(params)===JSON.stringify(feature.params))return;
    feature.params=structuredClone(params);refreshDrafting(document);document.revision++;
  });
  bus.registerHandler("define-block",(command:CadCommand)=>{
    if(command.type!=="define-block"||document.blocks?.[command.id])return;
    const definition=componentMembers(command.objectIds,command.base,command.id);if(!definition)return;
    document.blocks??={};document.blocks[command.id]={id:command.id,name:command.name.trim(),workPlane:definition.plane,members:definition.members};document.revision++;
  });
  bus.registerHandler("update-block",(command:CadCommand)=>{
    if(command.type!=="update-block")return;
    const block=document.blocks?.[command.blockId];if(!block)return;
    const definition=command.objectIds?componentMembers(command.objectIds,command.base!,block.id):undefined;
    if(command.objectIds&&(!definition||definition.plane!==block.workPlane))return;
    const members=definition?.members??block.members;
    const next:CadBlock={...block,name:command.name===undefined?block.name:command.name.trim()||block.name,members};
    if(definition){
      const memberIds=new Set(members.map(member=>member.objectId??member.params.objectId??member.params.id).filter((id):id is string=>typeof id==="string"));
      const overrides=Object.fromEntries(Object.entries(block.overrides??{}).filter(([id])=>memberIds.has(id)));
      if(Object.keys(overrides).length)next.overrides=overrides;else delete next.overrides;
    }
    if(JSON.stringify(next)===JSON.stringify(block))return;
    document.blocks![block.id]=next;refreshDrafting(document);document.revision++;
  });
  bus.registerHandler("set-block-override",(command:CadCommand)=>{
    if(command.type!=="set-block-override")return;
    const block=document.blocks?.[command.blockId];if(!block)return;
    if(!block.members.some(member=>(member.objectId??member.params.objectId??member.params.id)===command.objectId))return;
    const overrides={...(block.overrides??{})};
    if(command.clear){delete overrides[command.objectId];}
    else{overrides[command.objectId]={objectId:command.objectId,...(command.vectorStyle?{vectorStyle:command.vectorStyle}:{})};}
    const next={...block,overrides:Object.keys(overrides).length?overrides:undefined};
    if(JSON.stringify(next)===JSON.stringify(block))return;
    document.blocks![block.id]=next;refreshDrafting(document);document.revision++;
  });
  bus.registerHandler("insert-block",(command:CadCommand)=>{
    if(command.type!=="insert-block")return;
    const block=document.blocks?.[command.blockId];if(!block)return;
    const normal=WORK_PLANES[block.workPlane].normal;if(Math.abs(command.position.reduce((sum,v,i)=>sum+v*normal[i],0))>1e-6)return;
    const id=create(command.id??`instance-${crypto.randomUUID()}`,command.layerId??"layer-default",{kind:"block",blockId:block.id,workPlane:block.workPlane});
    if(id){const transform=document.objects[id].transform!;transform.translation=[...command.position];if(command.scale)transform.scale=[...command.scale];transform.rotation=normal.map(v=>v*(command.angle??0)) as Vec3;return id;}
  });
}
