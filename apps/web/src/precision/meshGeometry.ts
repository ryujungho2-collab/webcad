import * as THREE from "three";
import {meshNormal,evaluateDocumentGeometryGraph,meshTriangles,evaluateMeshModifiers,type CadObject,type CadFeature,type EditableMesh,type MeshVector,type GeometryMeasurement} from "@agent-webcad/cad-document";
import {getObjectTransform} from "./objectTransform";

export function meshWorldPositions(object:CadObject,feature:CadFeature,mesh:EditableMesh):Map<string,MeshVector>{
  const t=getObjectTransform(object,feature), matrix=new THREE.Matrix4().compose(new THREE.Vector3(...t.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation.map(THREE.MathUtils.degToRad) as MeshVector)),new THREE.Vector3(...t.scale));
  return new Map(mesh.vertices.map(v=>[v.id,new THREE.Vector3(...v.position).applyMatrix4(matrix).toArray()]));
}
export function measureEditableMesh(object:CadObject,feature:CadFeature,document:import("@agent-webcad/cad-document").CadDocument):GeometryMeasurement{
  const mesh=feature.type==="geometry-nodes"?evaluateDocumentGeometryGraph(document,feature).output.mesh:evaluateMeshModifiers(feature.params.mesh as EditableMesh).mesh;const positions=meshWorldPositions(object,feature,mesh), box=new THREE.Box3().setFromPoints([...positions.values()].map(p=>new THREE.Vector3(...p)));
  const area=meshTriangles(mesh).reduce((sum,f)=>{const [a,b,c]=f.vertices.map(id=>positions.get(id)!);return sum+Math.hypot(...meshNormal(a,b,c))/2;},0);
  return {basis:"mesh",lengthUnit:"mm",area,bounds:{min:box.min.toArray(),max:box.max.toArray()},approximation:{reason:"Piecewise linear triangle surface; no BRep precision or self-intersection/solid-volume guarantee."}};
}
