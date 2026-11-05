import {meshEdges,buildMeshTopology,evaluateMeshModifiers,type MeshModifier,type MeshSelectionMode,type MeshVector} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {validateCommand} from "@agent-webcad/cad-commands";
import {documentMesh} from "../state/meshCommands";
import {CAD_TOOLS,type CadToolCall} from "./cadToolContract";
import type {CadModelingContext} from "./cadModelingTools";
import type {CopilotPlan} from "./copilotPlan";

export function inspectMesh(document:CadModelingContext["document"],objectId:string,mode:MeshSelectionMode,offset=0,limit=50){
  if(!Number.isInteger(offset)||!Number.isInteger(limit))throw Error("Mesh page offset and limit must be integers.");
  const mesh=documentMesh(document,objectId);if(!mesh)throw Error("Object is not an editable mesh.");
  const elements=mode==="vertex"?mesh.vertices:mode==="face"?mesh.faces:meshEdges(mesh);
  return structuredClone({objectId,representation:"polygon-mesh",version:mesh.version,modifiers:(mesh.modifiers??[]).map(m=>({...m,creaseEdges:m.creaseEdges.slice(offset,offset+limit),totalCreaseEdges:m.creaseEdges.length})),topology:{boundaryEdges:buildMeshTopology(mesh).boundary.length,diagnostics:buildMeshTopology(mesh).diagnostics},coordinates:"object-local mm",mode,offset,total:elements.length,nextOffset:offset+limit<elements.length?offset+limit:null,elements:elements.slice(offset,offset+limit),edit:{...mesh.edit,ids:mesh.edit.ids.slice(0,100),totalSelected:mesh.edit.ids.length,selectionTruncated:mesh.edit.ids.length>100},lastTopologyChange:mesh.lastTopologyChange,topologyChange:mesh.topologyChange?{operation:mesh.topologyChange.operation,mapping:Object.fromEntries(Object.entries(mesh.topologyChange[mode==="vertex"?"vertices":mode==="edge"?"edges":"faces"]).slice(offset,offset+limit)),mappingTotal:Object.keys(mesh.topologyChange[mode==="vertex"?"vertices":mode==="edge"?"edges":"faces"]).length,implicitUnchanged:"identity",deletedMeaning:"empty mapping is explicit reference loss"}:undefined,validation:{structural:"valid",selfIntersection:"not-checked",solidVolume:"not-certified"}});
}
export function planMeshTools(calls:CadToolCall[],context:CadModelingContext):CopilotPlan|undefined{
  if(!calls.some(c=>c.name.startsWith("mesh.")))return;
  if(calls.some(c=>!c.name.startsWith("mesh.")))throw Error("Keep mesh operations in a separate reviewed proposal.");
  const commands:Exclude<CadCommand,{type:"batch"}>[]=[],created=new Set<string>(),resultIds=new Set<string>();
  for(const call of calls){const a=call.arguments;let command:Exclude<CadCommand,{type:"batch"}>;
    if(call.name==="mesh.create"||call.name==="mesh.createPolygon"){
      const id=a.id as string;if(context.document.objects[id]||created.has(id))throw Error("Mesh ID is already in use.");
      command=call.name==="mesh.create"?{type:"create-mesh",id,size:a.size as number,layerId:context.layerId}:{type:"create-polygon-mesh",id,size:a.size as number,layerId:context.layerId,shape:a.shape as "cube"|"ngon",sides:a.sides as number|undefined};created.add(id);resultIds.add(id);
    }else{
      const id=a.objectId as string,o=context.document.objects[id],layer=o&&context.document.layers[o.layerId];
      if(!created.has(id)&&(!context.selectionIds.includes(id)||!o?.visible||!layer?.visible||layer.locked||!documentMesh(context.document,id)))throw Error("Select the visible unlocked editable mesh before proposing an edit. A read is not an edit grant.");
      resultIds.add(id);
      if(call.name==="mesh.transform")command={type:"transform-mesh-elements",objectId:id,mode:a.mode as MeshSelectionMode,elementIds:a.elementIds as string[],operation:a.operation as "move"|"scale",value:a.value as MeshVector,...a.pivot?{pivot:a.pivot as MeshVector}:{}};
      else if(call.name==="mesh.extrude")command={type:"extrude-mesh-face",objectId:id,faceId:a.faceId as string,distance:a.distance as number};
      else if(call.name==="mesh.upgrade")command={type:"upgrade-mesh",objectId:id};
      else if(call.name==="mesh.modifiers")command={type:"set-mesh-modifiers",objectId:id,modifiers:a.modifiers as MeshModifier[]};
      else if(call.name==="mesh.extrudeRegion"||call.name==="mesh.inset"||call.name==="mesh.insetRegion")command={type:"edit-polygon-mesh",objectId:id,operation:{kind:call.name==="mesh.inset"?"inset":call.name==="mesh.insetRegion"?"inset-region":"extrude",faceIds:a.faceIds as string[],distance:a.distance as number}};
      else if(call.name==="mesh.bevelEdges")command={type:"edit-polygon-mesh",objectId:id,operation:{kind:"bevel-edges",edgeIds:a.edgeIds as string[],distance:a.distance as number}};
      else if(call.name==="mesh.bevel")command={type:"edit-polygon-mesh",objectId:id,operation:{kind:"bevel",edgeId:a.edgeId as string,distance:a.distance as number}};
      else if(call.name==="mesh.bridge")command={type:"edit-polygon-mesh",objectId:id,operation:{kind:"bridge",edgeIds:a.edgeIds as string[],offset:a.offset as number,resample:a.resample as boolean|undefined}};
      else if(call.name==="mesh.loopCut")command={type:"edit-polygon-mesh",objectId:id,operation:{kind:"loop-cut",edgeId:a.edgeId as string,factor:a.factor as number}};
      else if(call.name==="mesh.merge")command={type:"edit-polygon-mesh",objectId:id,operation:{kind:"merge",vertexIds:a.vertexIds as [string,string]}};
      else if(call.name==="mesh.dissolve")command={type:"edit-polygon-mesh",objectId:id,operation:{kind:"dissolve",edgeId:a.edgeId as string}};
      else if(call.name==="mesh.delete")command={type:"edit-polygon-mesh",objectId:id,operation:{kind:"delete",mode:a.mode as MeshSelectionMode,elementIds:a.elementIds as string[]}};
      else throw Error("Mesh inspection is a separate read tool.");
    }
    if(!validateCommand(command))throw Error("Invalid mesh command arguments.");commands.push(command);
  }
  return {command:commands.length===1?commands[0]:{type:"batch",label:"Mesh editing",commands},ghosts:[],resultObjectIds:[...resultIds],summary:["편집용 제어 메시를 변경합니다. 좌표와 변형은 객체 로컬 좌표 기준입니다.","BRep 변환은 수행하지 않습니다. 위상·퇴화 검증을 통과해야 적용되며, 자기 교차 여부는 검사하지 않습니다."],toolSteps:calls.map(c=>CAD_TOOLS[c.name].label)};
}

export function inspectMeshEvaluation(document:CadModelingContext["document"],objectId:string,mode:MeshSelectionMode,offset=0,limit=50){
 if(!Number.isInteger(offset)||!Number.isInteger(limit))throw Error("Mesh page offset and limit must be integers.");
 const source=documentMesh(document,objectId);if(!source)throw Error("Object is not an editable mesh.");const result=evaluateMeshModifiers(source),mesh=result.mesh;
 const all=mode==="vertex"?mesh.vertices:mode==="face"?mesh.faces:meshEdges(mesh),elements=all.slice(offset,offset+limit);
 return {objectId,derived:true,editable:false,coordinates:"object-local mm",mode,offset,total:all.length,nextOffset:offset+limit<all.length?offset+limit:null,elements:elements.map(e=>({...e,source:mode==="vertex"?result.vertexStencils[e.id]:mode==="face"?result.faceSources[e.id]:result.edgeSources[e.id]}))};
}
