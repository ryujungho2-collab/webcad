import * as THREE from "three";
import type {CadDocument,CadFeature,CadWorkPlaneFrame} from "@agent-webcad/cad-document";
import type {CadCommand,CommandBus} from "@agent-webcad/cad-commands";
import type {ExtrudeProfile} from "@agent-webcad/cad-kernel";
import type {SerializedOperand} from "../cad/kernelProtocol";
import {buildBooleanMesh,inspectSolid,meshPositionsBounds} from "../cad/kernelGeometryService";
import {getObjectTransform} from "../precision/objectTransform";
import {planeToWorld,worldToWorkPlane} from "../precision/workPlane";
import {exactFaceRange,resolveStoredWorkPlane} from "./attachedWorkPlane";
import {cutParamsFromProfile,sourceMesh} from "./faceCutCommands";

export type FaceHoleDefinition={planeId:string;targetId:string;center:[number,number];diameter:number;depth:number;through:boolean};
export type FaceHoleStatus="resolved"|"missing"|"ambiguous"|"non-planar"|"unsupported";

function matrixFor(document:CadDocument,id:string,feature:CadFeature){
  const placement=getObjectTransform(document.objects[id],feature);
  return new THREE.Matrix4().compose(new THREE.Vector3(...placement.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...placement.rotation.map(THREE.MathUtils.degToRad) as [number,number,number],"XYZ")),new THREE.Vector3(...placement.scale));
}

/** The whole circular opening must be on the selected planar face, not across an edge or existing void. */
async function circleOnFace(document:CadDocument,definition:FaceHoleDefinition,source:CadFeature,frame:CadWorkPlaneFrame):Promise<boolean>{
  const key=document.workPlanes?.[definition.planeId]?.source?.topologyId;
  if(!key)return false;
  const mesh=await sourceMesh(source),matched=exactFaceRange(mesh.faces,key);
  if(matched.status!=="found")return false;
  const matrix=matrixFor(document,definition.targetId,source),triangles:[number,number][][]=[];
  for(let triangle=matched.face.start;triangle<matched.face.start+matched.face.count;triangle++){
    const uv=[0,1,2].map(vertex=>{
      const index=mesh.indices[triangle*3+vertex],point=new THREE.Vector3(mesh.positions[index*3],mesh.positions[index*3+1],mesh.positions[index*3+2]).applyMatrix4(matrix);
      return worldToWorkPlane(point.toArray() as [number,number,number],{id:definition.planeId,...frame}).slice(0,2) as [number,number];
    });
    triangles.push(uv);
  }
  const contains=(point:[number,number])=>triangles.some(([a,b,c])=>{
    const cross=(u:[number,number],v:[number,number],w:[number,number])=>(v[0]-u[0])*(w[1]-u[1])-(v[1]-u[1])*(w[0]-u[0]);
    const area=cross(a,b,c);if(Math.abs(area)<1e-10)return false;
    const weights=[cross(point,b,c)/area,cross(a,point,c)/area,cross(a,b,point)/area];
    return weights.every(value=>value>=-1e-7&&value<=1+1e-7);
  });
  const radius=definition.diameter/2;
  if(!contains(definition.center))return false;
  const edges=new Map<string,{a:[number,number];b:[number,number];count:number}>();
  const pointKey=(point:[number,number])=>`${point[0].toFixed(6)},${point[1].toFixed(6)}`;
  for(const triangle of triangles)for(let i=0;i<3;i++){
    const a=triangle[i],b=triangle[(i+1)%3],key=[pointKey(a),pointKey(b)].sort().join("|");
    const entry=edges.get(key);if(entry)entry.count++;else edges.set(key,{a,b,count:1});
  }
  for(const edge of edges.values())if(edge.count===1){
    const dx=edge.b[0]-edge.a[0],dy=edge.b[1]-edge.a[1],length2=dx*dx+dy*dy;
    const t=length2?Math.max(0,Math.min(1,((definition.center[0]-edge.a[0])*dx+(definition.center[1]-edge.a[1])*dy)/length2)):0;
    if(Math.hypot(definition.center[0]-edge.a[0]-dx*t,definition.center[1]-edge.a[1]-dy*t)<=radius+1e-6)return false;
  }
  for(let i=0;i<64;i++){
    const angle=2*Math.PI*i/64;
    if(!contains([definition.center[0]+radius*Math.cos(angle),definition.center[1]+radius*Math.sin(angle)]))return false;
  }
  return true;
}

export async function faceHoleParams(document:CadDocument,definition:FaceHoleDefinition,source:CadFeature):Promise<Record<string,unknown>>{
  const plane=document.workPlanes?.[definition.planeId];
  if(!plane?.source||plane.source.objectId!==definition.targetId)throw Error("Hole work plane no longer belongs to its source solid.");
  const resolved=await resolveStoredWorkPlane(document,plane);
  if(resolved.status!=="resolved")throw Error(`Hole source face is ${resolved.status}. Rebind the work plane explicitly.`);
  if(!await circleOnFace(document,definition,source,resolved.frame))throw Error("Hole circle must lie entirely on the selected planar face.");
  const center=planeToWorld(definition.center,{id:plane.id,...resolved.frame}),profile:ExtrudeProfile={id:`hole:${definition.planeId}`,normal:[...resolved.frame.normal],segments:[{kind:"circle",topologyReference:"hole-wall",center,radius:definition.diameter/2,normal:[...resolved.frame.normal],xAxis:[...resolved.frame.xAxis]}]};
  const params=await cutParamsFromProfile(document,definition.targetId,source,resolved.frame,profile,definition.depth,definition.through);
  return {...params,faceHole:structuredClone(definition),faceHoleStatus:"resolved"};
}

export async function validateFaceHoleResult(params:Record<string,unknown>):Promise<Record<string,unknown>>{
  const operands=params.operands as SerializedOperand[];
  const [before,after,mesh]=await Promise.all([inspectSolid(operands[0]),inspectSolid({params}),buildBooleanMesh(params,true)]);
  if(before.volume===undefined||after.volume===undefined||after.validity==="invalid"||after.volume<=1e-9||after.volume>=before.volume-Math.max(1e-6,before.volume*1e-8))throw Error("Hole must remove a measurable volume and leave a valid solid.");
  const bounds=meshPositionsBounds(mesh.positions);if(!bounds||!mesh.indices.length)throw Error("Hole produced an empty solid.");
  return {...params,bounds};
}

export function registerFaceHoleCommands(bus:CommandBus,document:CadDocument){
  bus.registerHandler("create-face-hole",async(command:CadCommand)=>{
    if(command.type!=="create-face-hole")return;
    if(command.depth<=1e-6||command.diameter<=1e-6)return {accepted:false,reason:"Hole diameter and depth must exceed the modeling tolerance (0.000001 mm)."};
    const plane=document.workPlanes?.[command.planeId],targetId=plane?.source?.objectId;
    const target=targetId&&document.objects[targetId],source=targetId&&Object.values(document.features).find(feature=>feature.output===targetId);
    if(!plane?.source||!target||!source||!target.visible||!document.layers[target.layerId]?.visible||document.layers[target.layerId].locked)return {accepted:false,reason:"Choose a visible, unlocked solid with a planar face work plane."};
    const id=command.id??`hole-${crypto.randomUUID()}`,featureId=`feature-${id}`;
    if(document.objects[id]||document.features[featureId])return {accepted:false,reason:"Hole output ID already exists."};
    const definition:FaceHoleDefinition={planeId:plane.id,targetId:target.id,center:[...command.center],diameter:command.diameter,depth:command.depth,through:command.through===true};
    try{
      const params=await validateFaceHoleResult(await faceHoleParams(document,definition,source));
      target.visible=false;
      document.objects[id]={id,geometryId:`geometry-${id}`,name:"Hole",visible:true,layerId:target.layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
      document.features[featureId]={id:featureId,type:"boolean",dependencyMode:"live",inputs:[target.id],output:id,params};
      document.rootObjects.push(id);document.layers[target.layerId].objectIds.push(id);document.revision++;
      return id;
    }catch(cause){return {accepted:false,reason:`Hole failed: ${cause instanceof Error?cause.message:String(cause)}`};}
  });
  bus.registerHandler("update-face-hole",async(command:CadCommand)=>{
    if(command.type!=="update-face-hole")return;
    if(command.depth<=1e-6||command.diameter<=1e-6)return {accepted:false,reason:"Hole diameter and depth must exceed the modeling tolerance (0.000001 mm)."};
    const object=document.objects[command.objectId],feature=Object.values(document.features).find(entry=>entry.output===command.objectId),old=feature?.params.faceHole as FaceHoleDefinition|undefined;
    if(!object||!feature||feature.type!=="boolean"||!old||!document.layers[object.layerId]?.visible||document.layers[object.layerId].locked)return {accepted:false,reason:"Choose an unlocked Hole result."};
    const source=Object.values(document.features).find(entry=>entry.output===old.targetId);
    if(!source)return {accepted:false,reason:"Hole source solid is missing."};
    const definition:FaceHoleDefinition={...old,center:[...command.center],diameter:command.diameter,depth:command.depth,through:command.through===true};
    if(JSON.stringify(old)===JSON.stringify(definition))return {accepted:false,reason:"Hole parameters are unchanged."};
    try{feature.params=await validateFaceHoleResult(await faceHoleParams(document,definition,source));document.revision++;return object.id;}
    catch(cause){return {accepted:false,reason:`Hole edit failed: ${cause instanceof Error?cause.message:String(cause)}`};}
  });
}
