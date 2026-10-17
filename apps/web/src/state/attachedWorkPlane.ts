import * as THREE from "three";
import type { CadDocument, CadWorkPlane, CadWorkPlaneFaceSource, CadWorkPlaneFrame } from "@agent-webcad/cad-document";
import { featureContract } from "@agent-webcad/cad-document";
import { buildBooleanMesh, buildChamferMesh, buildExtrudeMesh, buildFilletMesh, buildLoftMesh, buildShellMesh, buildPrimitiveMesh, buildRevolveMesh, buildSweepMesh, type MeshData } from "../cad/kernelGeometryService";
import { getObjectTransform } from "../precision/objectTransform";

export type WorkPlaneResolution={status:"resolved";frame:CadWorkPlaneFrame}|{status:"missing"|"ambiguous"|"non-planar"|"unsupported";reason:string};
export function exactFaceRange(faces:NonNullable<MeshData["faces"]>|undefined,key:string):{status:"found";face:NonNullable<MeshData["faces"]>[number]}|{status:"missing"|"ambiguous"} {
  const matches=faces?.filter(face=>face.key===key)??[];
  return matches.length===1?{status:"found",face:matches[0]}:{status:matches.length?"ambiguous":"missing"};
}

function frameOnFace(mesh:MeshData,face:{start:number;count:number},transform:THREE.Matrix4):CadWorkPlaneFrame|null {
  const points:THREE.Vector3[]=[],seen=new Set<number>();
  const local=(index:number)=>new THREE.Vector3(mesh.positions[index*3],mesh.positions[index*3+1],mesh.positions[index*3+2]);
  const from=(index:number)=>local(index).applyMatrix4(transform);
  let normal:THREE.Vector3|null=null,localNormal:THREE.Vector3|null=null;
  for(let triangle=face.start;triangle<face.start+face.count;triangle++){
    const indices=[mesh.indices[triangle*3],mesh.indices[triangle*3+1],mesh.indices[triangle*3+2]];
    for(const index of indices)if(!seen.has(index)){seen.add(index);points.push(from(index));}
    if(!normal){const a=from(indices[0]),b=from(indices[1]),c=from(indices[2]),cross=b.sub(a).cross(c.sub(a));if(cross.length()>1e-10){normal=cross.normalize();const localA=local(indices[0]),localB=local(indices[1]),localC=local(indices[2]);localNormal=localB.sub(localA).cross(localC.sub(localA)).normalize();}}
  }
  if(!normal||!localNormal||points.length<3)return null;
  const center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);
  const radius=Math.max(...points.map(p=>p.distanceTo(center)));
  if(points.some(p=>Math.abs(p.clone().sub(center).dot(normal!))>Math.max(1e-5,radius*1e-8)))return null;
  const reference=Math.abs(localNormal.x)<.9?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
  const localX=reference.addScaledVector(localNormal,-reference.dot(localNormal)).normalize();
  const x=localX.transformDirection(transform).addScaledVector(normal,-localX.dot(normal)).normalize(),y=new THREE.Vector3().crossVectors(normal,x).normalize();
  return {origin:center.toArray() as [number,number,number],xAxis:x.toArray() as [number,number,number],yAxis:y.toArray() as [number,number,number],normal:normal.toArray() as [number,number,number]};
}

export async function resolveFaceWorkPlane(document:CadDocument,source:CadWorkPlaneFaceSource):Promise<WorkPlaneResolution> {
  const object=document.objects[source.objectId],feature=Object.values(document.features).find(entry=>entry.output===source.objectId);
  if(!object||!feature)return {status:"missing",reason:"The referenced solid no longer exists. Select a face and rebind explicitly."};
  if(featureContract(feature).representation!=="brep")return {status:"unsupported",reason:"The referenced object is not a BRep solid."};
  const mesh=feature.type==="shell"?await buildShellMesh(feature.params):feature.type==="boolean"?await buildBooleanMesh(feature.params):feature.type==="extrude"?await buildExtrudeMesh(feature.params):feature.type==="fillet"?await buildFilletMesh(feature.params):feature.type==="chamfer"?await buildChamferMesh(feature.params):feature.type==="revolve"?await buildRevolveMesh(feature.params):feature.type==="sweep"?await buildSweepMesh(feature.params):feature.type==="loft"?await buildLoftMesh(feature.params):await buildPrimitiveMesh(feature.params);
  const matched=exactFaceRange(mesh.faces,source.topologyId);
  if(matched.status!=="found")return matched.status==="missing"
    ?{status:"missing",reason:"The saved face key is absent after regeneration. Select the intended face and rebind explicitly."}
    :{status:"ambiguous",reason:"Multiple faces share the saved identity. Select a unique face; no automatic nearest-face substitution is allowed."};
  const placement=getObjectTransform(object,feature),rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(...placement.rotation.map(THREE.MathUtils.degToRad) as [number,number,number],"XYZ"));
  const transform=new THREE.Matrix4().compose(new THREE.Vector3(...placement.translation),rotation,new THREE.Vector3(...placement.scale));
  const frame=frameOnFace(mesh,matched.face,transform);
  return frame?{status:"resolved",frame}:{status:"non-planar",reason:"The selected face is not planar."};
}

export async function resolveStoredWorkPlane(document:CadDocument,plane:CadWorkPlane):Promise<WorkPlaneResolution> {
  return plane.source?resolveFaceWorkPlane(document,plane.source):{status:"resolved",frame:plane};
}
