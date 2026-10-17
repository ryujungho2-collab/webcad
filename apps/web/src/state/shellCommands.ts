import type {CadDocument,CadFeature} from "@agent-webcad/cad-document";
import {featureContract} from "@agent-webcad/cad-document";
import type {CadCommand,CommandBus} from "@agent-webcad/cad-commands";
import {buildShellMesh,inspectSolid,meshPositionsBounds} from "../cad/kernelGeometryService";
import {getObjectTransform} from "../precision/objectTransform";
import {sourceMesh} from "./faceCutCommands";
import {exactFaceRange} from "./attachedWorkPlane";
import type {SerializedOperand} from "../cad/kernelProtocol";

export async function shellFaceStatus(source:CadFeature,keys:string[]):Promise<"resolved"|"missing"|"ambiguous">{
  const mesh=await sourceMesh(source);
  for(const key of keys){const match=exactFaceRange(mesh.faces,key);if(match.status!=="found")return match.status;}
  return "resolved";
}

export async function validateShell(params:Record<string,unknown>){
  const [mesh,before,after]=await Promise.all([buildShellMesh(params,true),inspectSolid(params.source as SerializedOperand),inspectSolid({params})]);
  const bounds=meshPositionsBounds(mesh.positions);
  if(!bounds||!mesh.indices.length||before.validity!=="valid"||after.validity!=="valid"||!after.volume||!before.volume||after.volume>=before.volume-Math.max(1e-6,before.volume*1e-8))throw Error("Shell must remove volume and leave a valid solid. Reduce thickness or change removed faces.");
  return {...params,bounds};
}

export async function shellParams(document:CadDocument,source:CadFeature,thickness:number,faceKeys:string[]){
  if(featureContract(source).representation!=="brep")throw Error("Shell source must be a solid.");
  const transform=getObjectTransform(document.objects[source.output],source);
  if(!transform.scale.every(value=>Math.abs(value-1)<1e-9))throw Error("Scaled Shell sources are unsupported.");
  const status=await shellFaceStatus(source,faceKeys);
  if(status!=="resolved")throw Error(`Shell removed face is ${status}. Rebind explicitly.`);
  return validateShell({kind:"shell",thickness,faceKeys:[...faceKeys],referenceStatus:"resolved",source:{params:structuredClone(source.params),transform:structuredClone(transform)}});
}

export function registerShellCommands(bus:CommandBus,document:CadDocument){
  for(const type of ["create-shell","update-shell"] as const)bus.registerHandler(type,async(command:CadCommand)=>{
    if(command.type!=="create-shell"&&command.type!=="update-shell")return;
    const editing=command.type==="update-shell"?Object.values(document.features).find(f=>f.output===command.objectId):undefined;
    if(command.type==="update-shell"&&editing?.type!=="shell")return {accepted:false,reason:"Choose a Shell result."};
    if(editing?.dependencyMode==="snapshot")return {accepted:false,reason:"This Shell is an independent copy. Create a new Shell from it to choose source faces."};
    const targetId=command.type==="create-shell"?command.targetId:editing!.inputs[0];
    const target=document.objects[targetId],source=Object.values(document.features).find(f=>f.output===targetId);
    const output=editing&&document.objects[editing.output];
    if(!target||!source||!document.layers[target.layerId]?.visible||document.layers[target.layerId].locked||output&&document.layers[output.layerId]?.locked||!editing&&!target.visible)return {accepted:false,reason:"Choose an unlocked solid source."};
    const id=editing?.output??(command.type==="create-shell"?command.id:undefined)??`shell-${crypto.randomUUID()}`,featureId=editing?.id??`feature-${id}`;
    if(!editing&&(document.objects[id]||document.features[featureId]))return {accepted:false,reason:"Shell output ID already exists."};
    if(editing&&editing.params.referenceStatus==="resolved"&&editing.params.thickness===command.thickness&&JSON.stringify(editing.params.faceKeys)===JSON.stringify(command.faceKeys))return {accepted:false,reason:"Shell parameters are unchanged."};
    try{
      const params=await shellParams(document,source,command.thickness,command.faceKeys);
      if(editing)editing.params=params;
      else{
        target.visible=false;
        document.objects[id]={id,geometryId:`geometry-${id}`,name:"Shell",visible:true,layerId:target.layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
        document.features[featureId]={id:featureId,type:"shell",dependencyMode:"live",inputs:[targetId],output:id,params};
        document.rootObjects.push(id);document.layers[target.layerId].objectIds.push(id);
      }
      document.revision++;return id;
    }catch(cause){return {accepted:false,reason:`Shell failed: ${cause instanceof Error?cause.message:String(cause)}`};}
  });
}
