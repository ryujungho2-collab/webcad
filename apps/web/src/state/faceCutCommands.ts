import * as THREE from "three";
import type { CadDocument, CadFeature, Sketch } from "@agent-webcad/cad-document";
import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import type { SerializedOperand } from "../cad/kernelProtocol";
import type { ExtrudeProfile } from "@agent-webcad/cad-kernel";
import type { CadWorkPlaneFrame } from "@agent-webcad/cad-document";
import { buildBooleanMesh, buildChamferMesh, buildExtrudeMesh, buildFilletMesh, buildLoftMesh, buildShellMesh, buildPrimitiveMesh, buildRevolveMesh, buildSweepMesh, inspectSolid, meshPositionsBounds } from "../cad/kernelGeometryService";
import { faceSketchExtrusionProfile } from "../precision/faceSketchProfile";
import { getObjectTransform } from "../precision/objectTransform";
import { resolveStoredWorkPlane } from "./attachedWorkPlane";

export type FaceCutDefinition={sketchId:string;targetId:string;distance:number;through:boolean};
const solidKinds=new Set(["primitive","extrude","boolean","fillet","chamfer","revolve","sweep","loft","shell"]);

export function sourceMesh(feature:CadFeature){
  const p=feature.params;
  return feature.type==="shell"?buildShellMesh(p):feature.type==="boolean"?buildBooleanMesh(p):feature.type==="extrude"?buildExtrudeMesh(p):feature.type==="fillet"?buildFilletMesh(p):feature.type==="chamfer"?buildChamferMesh(p):feature.type==="revolve"?buildRevolveMesh(p):feature.type==="sweep"?buildSweepMesh(p):feature.type==="loft"?buildLoftMesh(p):buildPrimitiveMesh(p);
}

/** Resolve tool travel in world space. Positive user depth travels toward the source body's centre. */
export async function faceCutParams(document:CadDocument,definition:FaceCutDefinition,source:CadFeature):Promise<Record<string,unknown>>{
  const sketch:Sketch|undefined=document.sketches?.[definition.sketchId],profile=sketch&&faceSketchExtrusionProfile(sketch);
  if(!sketch?.faceFrame||!profile)throw Error("Face sketch is unresolved or needs exactly one closed profile.");
  const params=await cutParamsFromProfile(document,definition.targetId,source,sketch.faceFrame,profile.profile,definition.distance,definition.through);
  return {...params,faceCut:structuredClone(definition)};
}

/** Exact source operand and transient extrusion; shared by profile cuts and cylindrical holes. */
export async function cutParamsFromProfile(document:CadDocument,targetId:string,source:CadFeature,frame:CadWorkPlaneFrame,profile:ExtrudeProfile,depth:number,through:boolean):Promise<Record<string,unknown>>{
  const object=document.objects[targetId];
  if(!object||!solidKinds.has(source.type))throw Error("Cut target must be a solid.");
  const transform=getObjectTransform(object,source);
  if(!transform.scale.every(value=>Math.abs(value-1)<=1e-9))throw Error("Scaled source solids are not supported for face cuts.");
  const operand:SerializedOperand={params:structuredClone(source.params),transform:structuredClone(transform)};
  const mesh=await sourceMesh(source);
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number,number,number],"XYZ")),new THREE.Vector3(...transform.scale));
  const origin=new THREE.Vector3(...frame.origin),normal=new THREE.Vector3(...frame.normal);
  const points:THREE.Vector3[]=[];
  for(let i=0;i<mesh.positions.length;i+=3)points.push(new THREE.Vector3(mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]).applyMatrix4(matrix));
  if(!points.length)throw Error("Cut target has no geometry.");
  const centre=points.reduce((sum,point)=>sum.add(point),new THREE.Vector3()).multiplyScalar(1/points.length);
  const dot=centre.clone().sub(origin).dot(normal);
  if(Math.abs(dot)<1e-7)throw Error("Cut direction is ambiguous for this face; choose another source face.");
  const inward=dot>0?1:-1,direction=inward*Math.sign(depth);
  const travel=points.map(point=>point.clone().sub(origin).dot(normal)*direction);
  const extent=Math.max(...travel),span=Math.max(...travel)-Math.min(...travel);
  const distance=direction*(through?Math.max(extent+Math.max(1,span*.01),Math.abs(depth)):Math.abs(depth));
  return {operation:"cut",operands:[operand,{params:{kind:"extrude",profile,distance},transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}]};
}

export function registerFaceCutCommands(bus:CommandBus,document:CadDocument){
  bus.registerHandler("create-face-cut",async(command:CadCommand)=>{
    if(command.type!=="create-face-cut")return;
    const sketch=document.sketches?.[command.sketchId],plane=sketch?.facePlaneId?document.workPlanes?.[sketch.facePlaneId]:undefined;
    const target=document.objects[command.targetId],source=Object.values(document.features).find(feature=>feature.output===command.targetId);
    if(!sketch||!plane?.source||plane.source.objectId!==command.targetId||!target||!source||!solidKinds.has(source.type))return {accepted:false,reason:"Choose a face sketch attached to the solid being cut."};
    if(!document.layers[target.layerId]?.visible||document.layers[target.layerId].locked||!document.layers[sketch.layerId]?.visible||document.layers[sketch.layerId].locked)return {accepted:false,reason:"Source and sketch layers must be visible and unlocked."};
    const resolved=await resolveStoredWorkPlane(document,plane);
    if(resolved.status!=="resolved"||sketch.faceStatus!=="resolved"||JSON.stringify(resolved.frame)!==JSON.stringify(sketch.faceFrame))return {accepted:false,reason:"The source face has changed. Resolve or rebind its work plane first."};
    const id=command.id??`face-cut-${crypto.randomUUID()}`,featureId=`feature-${id}`;
    if(document.objects[id]||document.features[featureId])return {accepted:false,reason:"Output ID already exists."};
    const definition:FaceCutDefinition={sketchId:sketch.id,targetId:target.id,distance:command.distance,through:command.through===true};
    try{
      const profile=faceSketchExtrusionProfile(sketch);
      if(!profile)throw Error("Face sketch needs exactly one closed, non-construction profile.");
      const params=await faceCutParams(document,definition,source);
      const [before,after,mesh]=await Promise.all([inspectSolid((params.operands as SerializedOperand[])[0]),inspectSolid({params}),buildBooleanMesh(params,true)]);
      if(before.volume===undefined||after.volume===undefined||after.validity==="invalid"||after.volume<=1e-9||after.volume>=before.volume-Math.max(1e-6,before.volume*1e-8))throw Error("Cut must remove a measurable volume and leave a valid solid. Check profile, depth and direction.");
      const bounds=meshPositionsBounds(mesh.positions);
      if(!bounds||!mesh.indices.length)throw Error("Cut produced an empty solid.");
      params.bounds=bounds;
      // Keep the hidden source in the tree so a lost face can be exposed and rebound.
      target.visible=false;
      document.objects[id]={id,geometryId:`geometry-${id}`,name:"Face cut",visible:true,layerId:target.layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
      document.features[featureId]={id:featureId,type:"boolean",dependencyMode:"live",inputs:[target.id,...profile.sourceObjectIds],output:id,params};
      document.rootObjects.push(id);document.layers[target.layerId].objectIds.push(id);document.revision++;
      return id;
    }catch(cause){return {accepted:false,reason:`Face cut failed: ${cause instanceof Error?cause.message:String(cause)}`};}
  });
}
