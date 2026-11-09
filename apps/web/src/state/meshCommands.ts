import {evaluateMeshAsync} from "../cad/geometryEvaluationClient";
import {appendMeshProvenance} from "@agent-webcad/cad-document";
import {createPolygonMesh,upgradePolygonMesh,applyPolygonMeshOperation,evaluateMeshModifiers} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {createMeshCube, extrudeMeshFace, meshElementIds, transformMesh, validateEditableMesh, type CadDocument, type EditableMesh} from "@agent-webcad/cad-document";

export function documentMesh(document: CadDocument, objectId: string): EditableMesh | undefined {
  const feature=Object.values(document.features).find(f=>f.output===objectId);
  return feature?.type==="mesh" && validateEditableMesh(feature.params.mesh) ? feature.params.mesh : undefined;
}
export function registerMeshCommands(bus: CommandBus, document: CadDocument,task:import("./cooperativeTask").CooperativeTask={}) {
  const editable=(id:string)=>{
    const object=document.objects[id], layer=object&&document.layers[object.layerId];
    const feature=Object.values(document.features).find(f=>f.output===id);
    if(!object?.visible||!layer?.visible||layer.locked||feature?.type!=="mesh"||!validateEditableMesh(feature.params.mesh))throw Error("Select an editable mesh on an unlocked, visible layer.");
    return {feature,mesh:feature.params.mesh};
  };
  const create:Parameters<CommandBus["registerHandler"]>[1]=command=>{
    if(command.type!=="create-mesh"&&command.type!=="create-polygon-mesh")return;
    const id=command.id??`mesh-${crypto.randomUUID()}`, featureId=`feature-${id}`, layerId=command.layerId??"layer-default", layer=document.layers[layerId];
    if(!layer?.visible||layer.locked||document.objects[id]||document.features[featureId])throw Error("Mesh ID must be unique and its layer visible and unlocked.");
    document.objects[id]={id,geometryId:`geometry-${id}`,name:"Editable mesh",visible:true,layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
    document.features[featureId]={id:featureId,type:"mesh",inputs:[],dependencyMode:"snapshot",output:id,params:{kind:"editable-mesh",mesh:command.type==="create-polygon-mesh"?createPolygonMesh(command.size,command.shape,command.sides):createMeshCube(command.size)}};
    document.rootObjects.push(id);layer.objectIds.push(id);document.revision++;return {accepted:true,createdIds:[id]};
  };
  bus.registerHandler("create-mesh",create);
  bus.registerHandler("create-polygon-mesh",create);
  for(const type of ["upgrade-mesh","edit-polygon-mesh","set-mesh-modifiers"] as const)bus.registerHandler(type,async command=>{
    if(command.type!=="upgrade-mesh"&&command.type!=="edit-polygon-mesh"&&command.type!=="set-mesh-modifiers")return;
    const {feature,mesh}=editable(command.objectId);
    if(command.type==="set-mesh-modifiers"&&mesh.version!==2)throw Error("Upgrade to Polygon before adding modifiers.");
    const next=command.type==="upgrade-mesh"?upgradePolygonMesh(mesh):command.type==="edit-polygon-mesh"?applyPolygonMeshOperation(mesh,command.operation,`p${crypto.randomUUID()}`):{...structuredClone(mesh),modifiers:structuredClone(command.modifiers)};
    await evaluateMeshAsync(next,{signal:task.signal},true);feature.params.mesh=next;document.revision++;return {accepted:true,createdIds:[]};
  });
  bus.registerHandler("select-mesh-elements",command=>{
    if(command.type!=="select-mesh-elements")return;
    const {feature,mesh}=editable(command.objectId), available=new Set(meshElementIds(mesh,command.mode));
    if(!command.elementIds.every(id=>available.has(id)))throw Error("Mesh selection contains missing topology references.");
    feature.params.mesh={...mesh,edit:{enabled:command.enabled,mode:command.mode,ids:[...command.elementIds]}};
    document.revision++;return {accepted:true,createdIds:[]};
  });
  bus.registerHandler("transform-mesh-elements",async command=>{
    if(command.type!=="transform-mesh-elements")return;
    const {feature,mesh}=editable(command.objectId);
    const next=transformMesh(mesh,command.mode,command.elementIds,command.operation,command.value,command.pivot);if(mesh.version===2){appendMeshProvenance(mesh,next);await evaluateMeshAsync(next,{signal:task.signal},true);}feature.params.mesh=next;
    document.revision++;return {accepted:true,createdIds:[]};
  });
  bus.registerHandler("extrude-mesh-face",command=>{
    if(command.type!=="extrude-mesh-face")return;
    const {feature,mesh}=editable(command.objectId);
    feature.params.mesh=extrudeMeshFace(mesh,command.faceId,command.distance,`e${crypto.randomUUID()}`);
    document.revision++;return {accepted:true,createdIds:[]};
  });
}
