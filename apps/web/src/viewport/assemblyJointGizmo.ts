import * as THREE from "three";
import type {AssemblyJoint,CadDocument,CadObjectTransform} from "@agent-webcad/cad-document";
import {assemblyMatrix} from "../state/assemblyCommands";
import {getObjectTransform} from "../precision/objectTransform";
/** Visual-only overlay: never registered as a CAD pick root or transform control. */
export function createAssemblyJointGizmo(d:CadDocument,j:AssemblyJoint,poses?:Record<string,CadObjectTransform>){
 const pose=(id:string)=>poses?.[id]??getObjectTransform(d.objects[id],Object.values(d.features).find(f=>f.output===id));
 const parent=assemblyMatrix(pose(j.parentId)),origin=new THREE.Vector3(...j.origin).applyMatrix4(parent),axis=new THREE.Vector3(...j.axis).transformDirection(parent);
 const g=new THREE.Group();g.name="assembly-joint-gizmo";g.userData={jointId:j.id,origin:origin.toArray(),axis:axis.toArray(),parentId:j.parentId,childId:j.childId,angle:j.angle};
 const sphere=new THREE.Mesh(new THREE.SphereGeometry(2,12,8),new THREE.MeshBasicMaterial({color:0xffdc7a,depthTest:false}));sphere.position.copy(origin);g.add(sphere);
 const ownedArrow=(dir:THREE.Vector3,at:THREE.Vector3,length:number,color:number,head:number,width:number)=>{const a=new THREE.ArrowHelper(dir,at,length,color,head,width);a.line.geometry=a.line.geometry.clone();a.cone.geometry=a.cone.geometry.clone();return a;};
 const arrow=ownedArrow(axis,origin,45,0xffdc7a,8,4);g.add(arrow);
 const link=(a:THREE.Vector3,b:THREE.Vector3,color:number)=>g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color,depthTest:false})));
 link(new THREE.Vector3().setFromMatrixPosition(parent),origin,0x64b6ff);link(origin,new THREE.Vector3(...pose(j.childId).translation),0xff8d64);
 if(j.type==="revolute"){const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis),pts=Array.from({length:33},(_,i)=>{const a=i/32*Math.PI*1.5;return new THREE.Vector3(Math.cos(a)*15,Math.sin(a)*15,0).applyQuaternion(q).add(origin);});g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x8cf0b7,depthTest:false})));g.add(ownedArrow(new THREE.Vector3(1,0,0).applyQuaternion(q),pts.at(-1)!,7,0x8cf0b7,4,2));}
 if(j.type==="revolute"){
  // Current-angle needle and limit range, measured from the same reference direction as the arc above.
  const ref=new THREE.Vector3(1,0,0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),axis)),at=(deg:number,r:number)=>ref.clone().applyAxisAngle(axis,THREE.MathUtils.degToRad(deg)).multiplyScalar(r).add(origin);
  const needle=new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin,at(j.angle,22)]),new THREE.LineBasicMaterial({color:0xff9ad2}));needle.name="assembly-joint-angle-needle";g.add(needle);
  const lo=j.min,hi=j.max;if(lo!==undefined&&hi!==undefined&&hi>lo&&hi-lo<=720){const n=48,range=new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({length:n+1},(_,i)=>at(lo+(hi-lo)*i/n,19))),new THREE.LineBasicMaterial({color:0x6f8fff}));range.name="assembly-joint-limit-range";g.add(range);}
 }
 g.traverse(o=>{o.renderOrder=30;const m=(o as THREE.Mesh).material;if(m)for(const material of Array.isArray(m)?m:[m]){material.depthTest=false;material.depthWrite=false;}});return g;
}
export function disposeAssemblyJointGizmo(g:THREE.Group){g.traverse(o=>{const r=o as THREE.Mesh;r.geometry?.dispose();const m=r.material;if(m)for(const material of Array.isArray(m)?m:[m])material.dispose();});}
