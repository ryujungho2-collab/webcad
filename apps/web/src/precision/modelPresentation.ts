import * as THREE from "three";
import type {CadDocument,CadModelProjection} from "@agent-webcad/cad-document";
import {getObjectTransform} from "./objectTransform";
import {WORK_PLANES,worldToPlane,type Vec3} from "./workPlane";

/** Display offsets never enter model TRS, measurement, source geometry or STEP. */
export function explodedDisplayOffset(document:CadDocument,objectId:string):Vec3{
 const p=document.modelPresentation,e=p?.activeExplosionId?p.explosions[p.activeExplosionId]:undefined,part=Object.values(p?.parts??{}).find(p=>p.objectId===objectId),offset=part&&e?.offsets[part.id];
 return offset&&document.objects[objectId]?offset.direction.map(v=>v*offset.distance*e!.amount) as Vec3:[0,0,0];
}
export function hasExplodedDisplay(document:CadDocument){return Object.values(document.modelPresentation?.parts??{}).some(part=>explodedDisplayOffset(document,part.objectId).some(value=>value!==0));}
export type ModelOutline={kind:"rectangle"|"circle";params:Record<string,unknown>;sourceEdges:string[]};
/** First exact outline adapter: principal-oriented box/cylinder. No sampled mesh hulls. */
export function projectModelPart(document:CadDocument,view:Pick<CadModelProjection,"basis"|"origin"|"scale">,partId:string):ModelOutline{
 const part=document.modelPresentation?.parts[partId],object=part&&document.objects[part.objectId],sources=object?Object.values(document.features).filter(f=>f.output===object.id):[],feature=sources.length===1?sources[0]:undefined;
 if(!part||!object||!feature)throw Error(`Missing part source: ${part?.name??partId}. Rebind this stable part explicitly.`);
 const kind=String(feature.params.kind??"box");
 if(feature.type!=="primitive"||!["box","cylinder"].includes(kind))throw Error(`${part.name}: outline adapter supports box/cylinder primitives; other BRep kinds need a new adapter.`);
 const t=getObjectTransform(object,feature),r=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...t.rotation.map(THREE.MathUtils.degToRad) as Vec3,"XYZ"));
 const axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)].map(a=>a.applyMatrix4(r));
 if(axes.some(a=>Math.max(Math.abs(a.x),Math.abs(a.y),Math.abs(a.z))<1-1e-8))throw Error(`${part.name}: use a principal-axis orientation for this exact outline pilot.`);
 const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...t.translation),new THREE.Quaternion().setFromRotationMatrix(r),new THREE.Vector3(...t.scale)),plane=WORK_PLANES[view.basis];
 const projected=(p:Vec3)=>{const uv=worldToPlane(new THREE.Vector3(...p).applyMatrix4(matrix).toArray() as Vec3,plane);return uv.map((v,i)=>view.origin[i]+v*view.scale) as [number,number];};
 const rectangle=(points:[number,number][],edges:string[]):ModelOutline=>{const lo=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],hi=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];return {kind:"rectangle",params:{workPlane:"XY",points:[[lo[0],lo[1],0],[hi[0],lo[1],0],[hi[0],hi[1],0],[lo[0],hi[1],0]],closed:true},sourceEdges:edges};};
 if(kind==="box"){
  const size=[Number(feature.params.width),Number(feature.params.depth),Number(feature.params.height)],corners=Array.from({length:8},(_,i)=>[i&1?size[0]:0,i&2?size[1]:0,i&4?size[2]:0] as Vec3),points=corners.map(projected),min=[0,1].map(i=>Math.min(...points.map(p=>p[i]))),max=[0,1].map(i=>Math.max(...points.map(p=>p[i]))),edges:string[]=[];
  for(let a=0;a<8;a++)for(const bit of [1,2,4]){const b=a^bit;if(b<=a)continue;const u=points[a],v=points[b];if(Math.hypot(u[0]-v[0],u[1]-v[1])<1e-9)continue;for(let axis=0;axis<2;axis++)if(Math.abs(u[axis]-v[axis])<1e-9){const side=Math.abs(u[axis]-min[axis])<1e-9?"min":Math.abs(u[axis]-max[axis])<1e-9?"max":null;if(side)edges.push(`${axis}:${side}:box-edge:${a}-${b}`);}}
  return rectangle(points,edges.sort());
 }
 if(Math.abs(t.scale[0]-t.scale[1])>1e-8)throw Error(`${part.name}: cylinder outline requires equal radial scale; an ellipse is outside this adapter.`);
 const radius=Number(feature.params.radius),height=Number(feature.params.height),axis=axes[2],normal=new THREE.Vector3(...plane.normal),cap=projected([0,0,0]);
 if(Math.abs(axis.dot(normal))>1-1e-8)return {kind:"circle",params:{workPlane:"XY",center:[...cap,0],radius:radius*t.scale[0]*view.scale},sourceEdges:["cylinder:cap-bottom","cylinder:cap-top"]};
 const end=projected([0,0,height]),u=axis.dot(new THREE.Vector3(...plane.xAxis)),v=axis.dot(new THREE.Vector3(...plane.yAxis)),rr=radius*t.scale[0]*view.scale;
 return rectangle([[cap[0]-v*rr,cap[1]+u*rr],[cap[0]+v*rr,cap[1]-u*rr],[end[0]-v*rr,end[1]+u*rr],[end[0]+v*rr,end[1]-u*rr]],[`cylinder:cap-bottom:${u},${v}`,`cylinder:cap-top:${u},${v}`,`cylinder:silhouette-left:${u},${v}`,`cylinder:silhouette-right:${u},${v}`]);
}

export function assertProjectionExport(document:CadDocument,ids?:string[]){for(const f of Object.values(document.features))if((f.params.modelNote||f.params.modelDrawingReference)&&f.params.referenceStatus!=="resolved"&&(!ids||ids.includes(f.output)))throw Error("An associated annotation is unresolved. Rebind it before export.");for(const view of [...Object.values(document.modelPresentation?.projections??{}),...Object.values(document.modelPresentation?.sections??{})])if(view.status!=="resolved"&&(!ids||[...Object.values(view.outputs),...Object.values("decorations" in view?view.decorations??{}:{})].some(e=>ids.includes(e.objectId))))throw Error(`${view.name}: ${view.reason??"unresolved model source"}. Rebind or remove the derived view before export.`);}
