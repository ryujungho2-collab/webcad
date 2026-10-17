import * as THREE from "three";
import type {CadDocument,ComponentContent,ContentVec,ComponentDefinition,ArchitecturalSlab} from "@agent-webcad/cad-document";
import {wallFootprint,type WallFrame} from "./architectureWall";
import {getObjectTransform} from "./objectTransform";
import {getObjectWorldBounds} from "./worldBounds";

/** Pure slot layout. Source geometry stays a snapshot; only the host is live. */
export function contentPlacement(d:CadDocument,c:ComponentContent){
 const def=d.componentLibrary?.[c.overrideDefinitionId??c.definitionId];if(!def)throw Error("Missing component content. Restore or replace its definition.");
 const s=c.slot;let origin:ContentVec,size:ContentVec,rotationZ:number,parent=new THREE.Matrix4();
 if(s.kind==="opening"){
  const host=d.objects[s.hostId],f=Object.values(d.features).find(f=>f.output===s.hostId),wall=f?.params.architecturalWall as import("@agent-webcad/cad-document").ArchitectureWall|undefined,o=wall?.openings.find(o=>o.id===s.openingId);
  if(!host||!f||!wall||!o||def.domain!=="model")throw Error("Opening content needs an existing wall opening and model definition.");
  if(wall.height<0)throw Error("Opening content currently requires an upward wall; detach or use an explicit space slot.");
  const frame=wallFootprint(d,wall).frame;if(!frame)throw Error("Opening host has no supported rectangular frame.");
  origin=[frame.start[0]+frame.u[0]*(o.along-o.width/2)-frame.v[0]*frame.thickness/2,frame.start[1]+frame.u[1]*(o.along-o.width/2)-frame.v[1]*frame.thickness/2,wall.baseLevel+o.sill];size=[o.width,frame.thickness,o.height];if(o.side==="right"){origin[0]+=frame.u[0]*o.width+frame.v[0]*frame.thickness;origin[1]+=frame.u[1]*o.width+frame.v[1]*frame.thickness;}rotationZ=THREE.MathUtils.radToDeg(Math.atan2(frame.u[1],frame.u[0]))+(o.side==="right"?180:0);
  const t=getObjectTransform(host,f);if(!t.scale.every(x=>x===1))throw Error("Opening host must have unit scale.");parent.compose(new THREE.Vector3(...t.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation.map(THREE.MathUtils.degToRad) as ContentVec)),new THREE.Vector3(1,1,1));
 }else{if(def.domain!==s.domain)throw Error("Model and presentation slots cannot share content definitions.");({origin,size,rotationZ}=s);}
 const planar=def.domain==="presentation",axes=planar?[0,1]:[0,1,2],available=size.map((x,i)=>x-2*s.padding[i]) as ContentVec;
 if(axes.some(i=>available[i]<=1e-6||available[i]<s.minimum[i]-1e-6))throw Error("Slot padding/minimum leaves insufficient content space.");
 const ratios=axes.map(i=>available[i]/def.size[i]),uniform=Math.min(...ratios),scale:ContentVec=planar?[1,1,1]:[1,1,1];
 for(const i of axes)scale[i]=s.fit==="contain"?uniform:s.fit==="fill"?available[i]/def.size[i]:1;
 if(s.fit==="none"&&axes.some(i=>def.size[i]>available[i]+1e-6))throw Error("Natural content does not fit. Enlarge the slot or choose contain/fill.");
 // Nonuniform circular 2D shapes would need an ellipse representation.
 if(planar&&s.fit==="fill"&&Math.abs(scale[0]-scale[1])>1e-9&&def.type==="drawing"&&!["line","rectangle","polyline"].includes(String(def.params.kind)))throw Error("Use contain for curved drawing content; fill would change its exact curve representation.");
 const offset=available.map((x,i)=>s.padding[i]+(x-def.size[i]*scale[i])/2-def.min[i]*scale[i]) as ContentVec;if(planar)offset[2]=-def.min[2];
 const frame=new THREE.Matrix4().compose(new THREE.Vector3(...origin),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,THREE.MathUtils.degToRad(rotationZ))),new THREE.Vector3(1,1,1));
 const matrix=parent.multiply(frame).multiply(new THREE.Matrix4().compose(new THREE.Vector3(...offset),new THREE.Quaternion(),new THREE.Vector3(...scale))),position=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();matrix.decompose(position,q,sc);const e=new THREE.Euler().setFromQuaternion(q);
 return {definition:def,transform:{translation:position.toArray() as ContentVec,rotation:[e.x,e.y,e.z].map(v=>Math.abs(v)<1e-12?0:THREE.MathUtils.radToDeg(v)) as ContentVec,scale:sc.toArray() as ContentVec},available};
}
export function slabGeometry(d:CadDocument,s:ArchitecturalSlab){const p=wallFootprint(d,{mode:"footprint",sourceObjectIds:s.sourceObjectIds,height:s.kind==="floor"?-s.thickness:s.thickness,thickness:s.thickness,baseLevel:s.level,openings:[]}).params;delete p.architecturalWall;return {...p,architecturalSlab:structuredClone(s)};}

/** World AABB gaps are a conservative layout aid, never an exact BRep distance. */
export function contentClearances(d:CadDocument,id:string){const bounds=getObjectWorldBounds(d,id);if(!bounds)return [];return d.rootObjects.filter(other=>other!==id&&d.objects[other]?.visible&&d.layers[d.objects[other].layerId]?.visible).flatMap(other=>{const b=getObjectWorldBounds(d,other);if(!b)return [];const gaps=b.min.map((n,i)=>Math.max(0,n-bounds.max[i],bounds.min[i]-b.max[i]));return [{objectId:other,name:d.objects[other].name,gap:Math.hypot(...gaps),overlap:gaps.every(x=>x===0)}];}).sort((a,b)=>a.gap-b.gap).slice(0,12);}

export function openingClearanceWarnings(d:CadDocument,id:string){
 const b=getObjectWorldBounds(d,id);if(!b)return [];const objectBox=new THREE.Box3(new THREE.Vector3(...b.min),new THREE.Vector3(...b.max)),messages:string[]=[];
 for(const f of Object.values(d.features)){const w=f.params.architecturalWall as import("@agent-webcad/cad-document").ArchitectureWall|undefined,o=d.objects[f.output];if(!w||!o?.visible||!d.layers[o.layerId]?.visible||w.height<=0)continue;const frame=wallFootprint(d,w).frame;if(!frame)continue;const t=getObjectTransform(o,f),matrix=new THREE.Matrix4().compose(new THREE.Vector3(...t.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation.map(THREE.MathUtils.degToRad) as ContentVec)),new THREE.Vector3(...t.scale));
  for(const door of w.openings.filter(o=>o.kind==="door")){if((Object.values(d.features).find(f=>f.output===id)?.params.componentContent as ComponentContent|undefined)?.slot.kind==="opening")continue;const side=door.side==="left"?1:-1,points:THREE.Vector3[]=[];for(const x of [door.along-door.width/2,door.along+door.width/2])for(const y of [side*frame.thickness/2,side*(frame.thickness/2+door.width)])for(const z of [w.baseLevel,w.baseLevel+door.height])points.push(new THREE.Vector3(frame.start[0]+frame.u[0]*x+frame.v[0]*y,frame.start[1]+frame.u[1]*x+frame.v[1]*y,z).applyMatrix4(matrix));if(objectBox.intersectsBox(new THREE.Box3().setFromPoints(points)))messages.push(`Door ${door.id}: content overlaps conservative ${door.width} mm approach/swing box. Review placement.`);}
 }return messages;
}


