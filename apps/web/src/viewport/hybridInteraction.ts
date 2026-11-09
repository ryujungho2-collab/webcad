import * as THREE from "three";
import {cadDocument} from "../state/cadDocument";
import {hybridSource} from "../state/hybridReferences";
import {hybridView,updateHybridView,subscribeHybridView} from "../state/hybridSession";
import type {MeshVector} from "@agent-webcad/cad-document";
/** Render synchronization is checked before local-ray capture; kernel work stays in Review. */
export function attachHybridInteraction(canvas:HTMLCanvasElement,scene:THREE.Scene,camera:()=>THREE.Camera,roots:()=>Map<string,THREE.Object3D>,selected:()=>string|null){
  let ghost:THREE.Mesh|undefined,frame:THREE.AxesHelper|undefined;
  const clear=()=>{if(ghost){scene.remove(ghost);ghost.geometry.dispose();(ghost.material as THREE.Material).dispose();ghost=undefined;}if(frame){scene.remove(frame);frame.geometry.dispose();(frame.material as THREE.Material).dispose();frame=undefined;}};
  const display=()=>{clear();const s=hybridView();if(s.preview){const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(s.preview.data.positions,3));g.setIndex(new THREE.BufferAttribute(s.preview.data.indices,1));g.computeVertexNormals();ghost=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x6bdcc1,transparent:true,opacity:.65,side:THREE.DoubleSide}));if(s.preview.objectId){const root=roots().get(s.preview.objectId);if(root){root.updateMatrixWorld(true);ghost.matrixAutoUpdate=false;ghost.matrix.copy(root.matrixWorld);}}scene.add(ghost);}if(s.frame){frame=new THREE.AxesHelper(8);frame.matrixAutoUpdate=false;frame.matrix.makeBasis(new THREE.Vector3(...s.frame.xAxis),new THREE.Vector3(...s.frame.yAxis),new THREE.Vector3(...s.frame.normal));frame.matrix.setPosition(...s.frame.origin);scene.add(frame);}};
  const down=(e:PointerEvent)=>{const pick=hybridView().pick;if(!pick||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();try{
    if(selected()!==pick.objectId)throw Error("Selection changed. Pick again.");
    const root=roots().get(pick.objectId),source=hybridSource(cadDocument,pick.objectId);
    if(!root||!root.visible||root.userData.sculptControlMesh!==source.mesh||root.userData.sculptDocumentId!==cadDocument.id)throw Error("Viewport is updating. Wait for the rendered mesh and pick again.");
    root.updateMatrixWorld(true);camera().updateMatrixWorld(true);
    const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),camera());
    const hit=ray.intersectObjects([...roots().values()].filter(r=>r.visible),true).find(h=>(h.object as THREE.Mesh).isMesh&&!h.object.userData.meshHighlight&&h.object.userData.cadObjectId);
    if(!hit||hit.object.userData.cadObjectId!==pick.objectId)throw Error("Pick an unobscured surface of the selected mesh.");
    if(!root.matrixWorld.equals(source.matrix))throw Error("Source placement and rendered placement differ. Wait for viewport synchronization.");
    const local=ray.ray.clone().applyMatrix4(source.matrix.clone().invert());updateHybridView({});pick.accept(local.origin.toArray() as MeshVector,local.direction.toArray() as MeshVector,source.fingerprint);
  }catch(error){pick.error(error instanceof Error?error.message:String(error));}};
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape"&&hybridView().pick)updateHybridView({});};
  const unsubscribe=subscribeHybridView(display);canvas.addEventListener("pointerdown",down,true);window.addEventListener("keydown",key,true);
  return()=>{clear();unsubscribe();canvas.removeEventListener("pointerdown",down,true);window.removeEventListener("keydown",key,true);};
}
