import {meshContentSignature,validateEditableMesh,upgradePolygonMesh,type CadDocument,type EditableMesh,type sculptMesh,type remeshMesh} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {geometryEvaluationClient,evaluateGraphAsync,evaluateMeshAsync} from "../cad/geometryEvaluationClient";
import type {CooperativeTask} from "./cooperativeTask";
export function sculptSourceSignature(document:CadDocument,objectId:string,seen=new Set<string>()):string|undefined{
 if(seen.has(objectId)||seen.size>64)throw Error("Cyclic or excessive bake source dependencies.");const f=Object.values(document.features).find(f=>f.output===objectId);if(!f)return undefined;const next=new Set(seen);next.add(objectId);const mesh=f.params.mesh as EditableMesh|undefined;
 return meshContentSignature({transform:document.objects[objectId]?.transform,source:f.type==="geometry-nodes"?{graph:f.params.graph,inputs:f.inputs.map(id=>[id,sculptSourceSignature(document,id,next)])}:mesh?{vertices:mesh.vertices,faces:mesh.faces,modifiers:mesh.modifiers}:null});
}
export function registerSculptCommands(bus:CommandBus,document:CadDocument,task:CooperativeTask={}){
 for(const type of ["sculpt-stroke","remesh-mesh","bake-mesh"] as const)bus.registerHandler(type,async command=>{
  if(command.type!=="sculpt-stroke"&&command.type!=="remesh-mesh"&&command.type!=="bake-mesh")return;
  const object=document.objects[command.objectId],layer=object&&document.layers[object.layerId],feature=Object.values(document.features).find(f=>f.output===command.objectId);
  if(!object?.visible||!layer?.visible||layer.locked||!feature||!["mesh","geometry-nodes"].includes(feature.type))throw Error("Select a visible unlocked editable mesh or procedural object.");
  if(command.type!=="bake-mesh"&&(feature.type!=="mesh"||!validateEditableMesh(feature.params.mesh)))throw Error("Bake procedural geometry explicitly before sculpting or remeshing.");
  if(command.type==="sculpt-stroke"){const result=await geometryEvaluationClient.evaluate({kind:"sculpt",mesh:feature.params.mesh as EditableMesh,stroke:command.stroke},{signal:task.signal}) as ReturnType<typeof sculptMesh>;feature.params.mesh=result.mesh;document.revision++;return {accepted:true,createdIds:[]};}
  const id=command.id??`mesh-${crypto.randomUUID()}`,fid=`feature-${id}`;if(document.objects[id]||document.features[fid])throw Error("Result object ID must be unique.");let mesh:EditableMesh;
  const sourceSignature=sculptSourceSignature(document,command.objectId)!;
  if(command.type==="bake-mesh"){
   mesh=feature.type==="geometry-nodes"?(await evaluateGraphAsync(document,feature,{signal:task.signal})).output.mesh:(await evaluateMeshAsync(feature.params.mesh as EditableMesh,{signal:task.signal},true)).mesh;
   mesh=mesh.version===1?upgradePolygonMesh(mesh):structuredClone(mesh);delete mesh.modifiers;mesh.edit={enabled:false,mode:"face",ids:[]};mesh.derivation={kind:"bake",sourceObjectId:command.objectId,sourceSignature,sourceRevision:document.revision};
  }else{const result=await geometryEvaluationClient.evaluate({kind:"remesh",mesh:feature.params.mesh as EditableMesh,options:command.options,token:`r${crypto.randomUUID()}`},{signal:task.signal}) as ReturnType<typeof remeshMesh>;mesh=result.mesh;mesh.derivation={kind:command.options.method,sourceObjectId:command.objectId,sourceSignature,sourceRevision:document.revision,report:result.report};}
  if(!validateEditableMesh(mesh))throw Error("Derived mesh validation failed.");
  document.objects[id]={...structuredClone(object),id,geometryId:`geometry-${id}`,name:`${object.name} · ${command.type==="bake-mesh"?"Baked":"Remesh"}`};
  document.features[fid]={id:fid,type:"mesh",output:id,inputs:[],dependencyMode:"snapshot",params:{kind:"editable-mesh",mesh}};document.rootObjects.push(id);layer.objectIds.push(id);document.revision++;return {accepted:true,createdIds:[id]};
 });
}
