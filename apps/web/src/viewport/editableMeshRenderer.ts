import * as THREE from "three";
import {meshEdges,meshTriangles,evaluateMeshModifiers,meshEvaluationSignature, type EditableMesh} from "@agent-webcad/cad-document";

/** Editable control topology and evaluated rendering are separate; triangles carry explicit source face IDs. */
export function createEditableMeshSceneObject(objectId:string, mesh:EditableMesh):THREE.Group {
  const evaluated=evaluateMeshModifiers(mesh).mesh, triangles=meshTriangles(evaluated), renderPositions=new Map(evaluated.vertices.map(v=>[v.id,v.position]));
  const modified=mesh.edit.enabled&&!!mesh.modifiers?.some(m=>m.enabled&&m.level>0);
  const root=new THREE.Group(), positions=new Map(mesh.vertices.map(v=>[v.id,v.position]));
  root.userData.cadObjectId=objectId;root.userData.editableMesh=true;
  root.userData.meshSourceSignature=meshEvaluationSignature(mesh);
  const buffer=new THREE.BufferGeometry();
  buffer.setAttribute("position",new THREE.Float32BufferAttribute(triangles.flatMap(f=>f.vertices.flatMap(id=>renderPositions.get(id)!)),3));buffer.computeVertexNormals();
  const surface=new THREE.Mesh(buffer,new THREE.MeshStandardMaterial({color:0x92a8be,roughness:.75,metalness:.05,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
  surface.userData.cadObjectId=objectId;surface.userData.meshSurface=!modified;surface.userData.meshTriangleFaceIds=triangles.map(t=>t.faceId);root.add(surface);
  if(modified){const cageTriangles=meshTriangles(mesh),geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(cageTriangles.flatMap(f=>f.vertices.flatMap(id=>positions.get(id)!)),3));const cage=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false,colorWrite:false}));cage.userData={cadObjectId:objectId,meshSurface:true,meshHighlight:true,meshTriangleFaceIds:cageTriangles.map(t=>t.faceId)};root.add(cage); }
  const edges=meshEdges(mesh), edgeBuffer=new THREE.BufferGeometry();edgeBuffer.setAttribute("position",new THREE.Float32BufferAttribute(edges.flatMap(e=>e.vertices.flatMap(id=>positions.get(id)!)),3));
  const wire=new THREE.LineSegments(edgeBuffer,new THREE.LineBasicMaterial({color:0x26394e}));wire.userData.cadObjectId=objectId;root.add(wire);
  if(mesh.edit.enabled){
    const selected=new Set(mesh.edit.ids), highlight=new THREE.Group();highlight.userData.meshHighlight=true;
    if(mesh.edit.mode==="vertex"){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(mesh.vertices.flatMap(v=>v.position),3));
      geometry.setAttribute("color",new THREE.Float32BufferAttribute(mesh.vertices.flatMap(v=>new THREE.Color(selected.has(v.id)?0xff9c20:0xe8f1ff).toArray()),3));
      highlight.add(new THREE.Points(geometry,new THREE.PointsMaterial({size:9,sizeAttenuation:false,vertexColors:true,depthTest:true})));
    }else if(mesh.edit.mode==="edge"){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(edges.filter(e=>selected.has(e.id)).flatMap(e=>e.vertices.flatMap(id=>positions.get(id)!)),3));
      highlight.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xff9c20,depthTest:false})));
    }else{
      const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(meshTriangles(mesh).filter(f=>selected.has(f.faceId)).flatMap(f=>f.vertices.flatMap(id=>positions.get(id)!)),3));
      highlight.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xff9c20,side:THREE.DoubleSide,transparent:true,opacity:.6,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})));
    }
    highlight.traverse(child=>{child.userData.meshHighlight=true;child.userData.cadObjectId=objectId;child.raycast=()=>{};child.renderOrder=4;});root.add(highlight);
  }
  return root;
}

/** Select only elements incident to the frontmost hit triangle; no picking through geometry. */
export function pickEditableMeshElement(mesh:EditableMesh, root:THREE.Object3D, hit:THREE.Intersection, camera:THREE.Camera, pointer:{x:number;y:number}, viewport:{width:number;height:number}):string|null {
  if(root.userData.meshSourceSignature!==meshEvaluationSignature(mesh))return null;
  const id=hit.object.userData.meshTriangleFaceIds?.[hit.faceIndex??-1];const face=mesh.faces.find(f=>f.id===id);if(!face)return null;
  if(mesh.edit.mode==="face")return face.id;
  const vertexMap=new Map(mesh.vertices.map(v=>[v.id,v.position]));
  const project=(id:string)=>{const p=new THREE.Vector3(...vertexMap.get(id)!).applyMatrix4(root.matrixWorld).project(camera);return new THREE.Vector2((p.x+1)*viewport.width/2,(1-p.y)*viewport.height/2);};
  const p=new THREE.Vector2(pointer.x,pointer.y);let nearest:string|null=null, distance=14;
  if(mesh.edit.mode==="vertex")for(const id of face.vertices){const d=project(id).distanceTo(p);if(d<distance){distance=d;nearest=id;}}
  if(mesh.edit.mode==="edge")for(const edge of meshEdges(mesh).filter(e=>e.faceIds.includes(face.id))){const a=project(edge.vertices[0]),b=project(edge.vertices[1]),ab=b.clone().sub(a);const t=THREE.MathUtils.clamp(p.clone().sub(a).dot(ab)/Math.max(ab.lengthSq(),1e-12),0,1);const d=a.addScaledVector(ab,t).distanceTo(p);if(d<distance){distance=d;nearest=edge.id;}}
  return nearest;
}
