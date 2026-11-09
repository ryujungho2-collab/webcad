import * as THREE from "three";
import {MeshSurfaceIndex,meshEdges,meshTriangles,meshContentSignature,validateEditableMesh,validHybridReference,type CadDocument,type CadWorkPlaneFrame,type HybridSurfaceReference,type EditableMesh,type MeshVector} from "@agent-webcad/cad-document";
import {getObjectTransform} from "../precision/objectTransform";

export const hybridSessionId=crypto.randomUUID();
export const hybridTopology=(mesh:EditableMesh)=>meshContentSignature({vertices:mesh.vertices.map(v=>v.id),faces:mesh.faces});
const lineage=(m:EditableMesh,count:number)=>meshContentSignature({base:m.provenance?.base??{vertices:m.vertices.map(v=>v.id),edges:meshEdges(m).map(e=>e.id),faces:m.faces.map(f=>f.id)},events:m.provenance?.events.slice(0,count)??[]});
export function hybridSource(document:CadDocument,id:string){
  const object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id),mesh=feature?.params.mesh;
  if(!object||feature?.type!=="mesh"||!validateEditableMesh(mesh))throw Error("Editable Mesh required. Explicitly Bake Geometry Nodes first.");
  if(mesh.modifiers?.some(m=>m.enabled&&m.level>0))throw Error("Bake evaluated modifiers before capturing a surface reference.");
  if(mesh.vertices.length>5000||mesh.faces.length>10000)throw Error("Hybrid surface budget: 5,000 vertices / 10,000 faces.");
  const placement=getObjectTransform(object,feature),matrix=new THREE.Matrix4().compose(new THREE.Vector3(...placement.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...placement.rotation.map(THREE.MathUtils.degToRad) as MeshVector,"XYZ")),new THREE.Vector3(...placement.scale));
  if(Math.abs(matrix.determinant())<1e-12)throw Error("Singular source placement.");
  return {object,feature,mesh,matrix,fingerprint:meshContentSignature({mesh:{vertices:mesh.vertices,faces:mesh.faces,derivation:mesh.derivation,modifiers:mesh.modifiers},placement})};
}
export type HybridResolution={status:"valid"|"updated";frame:CadWorkPlaneFrame;fingerprint:string}|{status:"invalid"|"unresolved";reason:string};
export function resolveHybridReference(document:CadDocument,reference:HybridSurfaceReference):HybridResolution {
  if(!validHybridReference(reference)||reference.documentId!==document.id)return {status:"invalid",reason:"Reference/document identity mismatch."};
  try{
    const s=hybridSource(document,reference.objectId),m=s.mesh;
    if(s.object.geometryId!==reference.geometryId)return {status:"invalid",reason:"Source geometry identity changed. Reselect the surface."};
    if(hybridTopology(m)!==reference.topologyFingerprint||meshContentSignature(m.derivation??null)!==reference.derivationFingerprint)return {status:"unresolved",reason:"Topology or derivation changed; no automatic remesh/bake remapping. Reselect the surface."};
    if((m.provenance?.events.length??0)<reference.provenanceRevision||lineage(m,reference.provenanceRevision)!==reference.lineageFingerprint)return {status:"unresolved",reason:"Provenance prefix is unavailable or replaced. Reselect the surface."};
    // IDs alone are insufficient: the same triangle must still belong to the saved polygon.
    if(!meshTriangles(m).some(t=>t.faceId===reference.faceId&&t.vertices.every((id,i)=>id===reference.triangle[i])))return {status:"unresolved",reason:"Saved triangulation changed. Reselect the surface."};
    const points=reference.triangle.map(id=>new THREE.Vector3(...m.vertices.find(v=>v.id===id)!.position).applyMatrix4(s.matrix));
    const x=points[1].clone().sub(points[0]),n=x.clone().cross(points[2].clone().sub(points[0]));
    if(n.length()<1e-10)return {status:"invalid",reason:"Referenced triangle became degenerate."};
    n.normalize();x.normalize();const y=n.clone().cross(x).normalize(),p=points.reduce((sum,v,i)=>sum.addScaledVector(v,reference.barycentric[i]),new THREE.Vector3());
    return {status:s.fingerprint===reference.fingerprint?"valid":"updated",fingerprint:s.fingerprint,frame:{origin:p.toArray(),xAxis:x.toArray(),yAxis:y.toArray(),normal:n.toArray()}};
  }catch(e){return {status:"unresolved",reason:e instanceof Error?e.message:String(e)};}
}
export function captureHybridReference(document:CadDocument,objectId:string,origin:MeshVector,direction:MeshVector,expectedFingerprint?:string):HybridSurfaceReference {
  const s=hybridSource(document,objectId),m=s.mesh,layer=document.layers[s.object.layerId];
  if(!s.object.visible||!layer?.visible||layer.locked)throw Error("Select a visible unlocked mesh surface.");
  if(expectedFingerprint!==undefined&&expectedFingerprint!==s.fingerprint)throw Error("Surface pick is stale. Pick again.");
  if(Math.hypot(...direction)<1e-12)throw Error("Nonzero local ray direction required.");
  const hit=new MeshSurfaceIndex(m).raycast(origin,direction);if(!hit)throw Error("Ray missed the selected mesh surface.");
  const point=new THREE.Vector3(...hit.point),vertices=new Map(m.vertices.map(v=>[v.id,new THREE.Vector3(...v.position)]));
  for(const t of meshTriangles(m).filter(t=>t.faceId===hit.faceId)){
    const triangle=new THREE.Triangle(...t.vertices.map(id=>vertices.get(id)!) as [THREE.Vector3,THREE.Vector3,THREE.Vector3]),b=triangle.getBarycoord(point,new THREE.Vector3());
    if(!b||Math.min(b.x,b.y,b.z)<-1e-8||triangle.closestPointToPoint(point,new THREE.Vector3()).distanceTo(point)>1e-7)continue;
    return {version:1,documentId:document.id,sessionId:hybridSessionId,objectId,geometryId:s.object.geometryId,representation:"editable-mesh",fingerprint:s.fingerprint,topologyFingerprint:hybridTopology(m),lineageFingerprint:lineage(m,m.provenance?.events.length??0),derivationFingerprint:meshContentSignature(m.derivation??null),provenanceRevision:m.provenance?.events.length??0,faceId:hit.faceId,triangle:[...t.vertices] as [string,string,string],barycentric:b.toArray(),point:hit.point,normal:hit.normal,datumEnabled:false};
  }
  throw Error("Surface triangle could not be resolved exactly.");
}
/** Recomputed status is authoritative; saved frames are last-valid review evidence. */
export function refreshHybridPlanes(document:CadDocument){
  for(const plane of Object.values(document.workPlanes??{}))if(plane.hybrid){const result=resolveHybridReference(document,plane.hybrid);if("frame" in result)Object.assign(plane,result.frame);}
}
export function assertHybridFeatureResolved(document:CadDocument,objectId:string,seen=new Set<string>()){
  if(seen.has(objectId))return;seen.add(objectId);const f=Object.values(document.features).find(f=>f.output===objectId);if(!f)return;
  const h=f.params.hybridDatum as {referenceId:string;fingerprint:string}|undefined;
  if(h){const r=document.workPlanes?.[h.referenceId]?.hybrid,result=r&&resolveHybridReference(document,r);if(!r?.datumEnabled||!result||!("frame" in result)||result.fingerprint!==h.fingerprint)throw Error("Hybrid datum is unresolved or stale. Reselect its source before using this BRep.");}
  for(const id of f.inputs)assertHybridFeatureResolved(document,id,seen);
}
