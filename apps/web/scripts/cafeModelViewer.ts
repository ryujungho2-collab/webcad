import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";

declare const CAFE_GLB_BASE64:string;
const host=document.querySelector<HTMLElement>("#viewport")!,status=document.querySelector<HTMLElement>("#status")!;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor("#e6e2da");renderer.localClippingEnabled=true;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,1,.01,400),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.1;controls.maxDistance=110;
scene.add(new THREE.HemisphereLight("#fff6e4","#8e9691",2.1));
const key=new THREE.DirectionalLight("#fff0d1",3);key.position.set(-12,25,12);scene.add(key);const fill=new THREE.DirectionalLight("#dae9ff",1.3);fill.position.set(25,15,-18);scene.add(fill);
const stage=new THREE.Mesh(new THREE.PlaneGeometry(160,160),new THREE.MeshStandardMaterial({color:"#d9d5cc",roughness:1}));stage.rotation.x=-Math.PI/2;stage.position.y=-.27;scene.add(stage);
const clip=new THREE.Plane(new THREE.Vector3(0,-1,0),20),meshes:THREE.Mesh[]=[],partNodes:THREE.Object3D[]=[];
let floor="all",edges=false,cutaway=true,roof=false,ceiling=false,separate=false,model:THREE.Object3D;
const label=(id:string)=>document.getElementById(id)!;
const fit=(eye:number[],target:number[])=>{camera.position.fromArray(eye);controls.target.fromArray(target);camera.updateProjectionMatrix();controls.update();};
const overview=()=>fit([26,23,22],[7.5,separate?5:2.5,-7.5]);
function visibility(){
 for(const node of partNodes){const layer=String(node.userData.layerId??""),role=layer.split("-").at(-1),upper=layer.includes("-2f-")||role==="roof";node.visible=(floor==="all"||(floor==="1f"?!upper:upper))&&(!["roof"].includes(role??"")||roof)&&(!(role==="ceiling")||ceiling)&&(!(role==="facade")||!cutaway);node.position.z=node.userData.originalZ+(upper&&separate?4500:0);}
 for(const mesh of meshes){for(const child of mesh.children)if(child.userData.cadEdge)child.visible=edges;}
 label("model-count").textContent=`${partNodes.filter(p=>p.visible).length.toLocaleString()} / ${partNodes.length.toLocaleString()} parts`;
}
function selectedView(value:string){floor=value==="1f"||value==="2f"?value:"all";separate=value==="separate";roof=false;label("roof-toggle").querySelector<HTMLInputElement>("input")!.checked=false;clip.constant=20;
 (label("section-height") as HTMLInputElement).value="20000";label("height-value").textContent="단면 해제";
 if(value==="1f")fit([22,18,17],[7.5,0,-7.5]);else if(value==="2f")fit([22,22,17],[7.5,3.9,-7.5]);else overview();visibility();
 for(const button of document.querySelectorAll<HTMLButtonElement>("[data-floor]"))button.classList.toggle("active",button.dataset.floor===value);
}
for(const button of document.querySelectorAll<HTMLButtonElement>("[data-floor]"))button.onclick=()=>selectedView(button.dataset.floor!);
for(const [id,set]of [["edges-toggle",(v:boolean)=>edges=v],["cutaway-toggle",(v:boolean)=>cutaway=v],["roof-toggle",(v:boolean)=>roof=v],["ceiling-toggle",(v:boolean)=>ceiling=v]] as const){label(id).querySelector<HTMLInputElement>("input")!.onchange=e=>{set((e.target as HTMLInputElement).checked);visibility();};}
label("section-height").oninput=e=>{const mm=Number((e.target as HTMLInputElement).value);clip.constant=mm/1000;label("height-value").textContent=mm===20000?"단면 해제":`수평 절단 +${mm.toLocaleString()} mm`;};
label("reset").onclick=()=>selectedView("all");
label("interior-1f").onclick=()=>{selectedView("all");fit([13.8,1.65,-.7],[8.8,1.4,-9.3]);};
label("interior-2f").onclick=()=>{selectedView("all");fit([13.6,5.55,-1.2],[7,5.5,-10]);};
label("capture").onclick=()=>{renderer.render(scene,camera);const a=document.createElement("a");a.href=renderer.domElement.toDataURL("image/png");a.download="common-ground-3d.png";a.click();};
const resize=()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(host);
const raw=atob(CAFE_GLB_BASE64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
new GLTFLoader().parse(bytes.buffer,"",gltf=>{
 model=gltf.scene;scene.add(model);
 const edgeGeometry=new Map<THREE.BufferGeometry,THREE.EdgesGeometry>();
 model.traverse(node=>{if(node.userData.cadObjectId){node.userData.originalZ=node.position.z;partNodes.push(node);}if(node instanceof THREE.Mesh){meshes.push(node);const material=node.material as THREE.MeshStandardMaterial;material.clippingPlanes=[clip];let geometry=edgeGeometry.get(node.geometry);if(!geometry){geometry=new THREE.EdgesGeometry(node.geometry,25);edgeGeometry.set(node.geometry,geometry);}const edge=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:"#474c49",transparent:true,opacity:.4,clippingPlanes:[clip]}));edge.userData.cadEdge=true;edge.visible=edges;node.add(edge);}});
 visibility();overview();status.textContent="R0 평면 기반 · mm · 2 floors / 100 seats";document.documentElement.dataset.modelReady="true";
},error=>{status.textContent=`모델을 열지 못했습니다: ${error}`;});
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),selection=new THREE.BoxHelper(new THREE.Object3D(),"#d78a3d");selection.visible=false;scene.add(selection);
let start:[number,number]=[0,0];renderer.domElement.addEventListener("pointerdown",e=>{start=[e.clientX,e.clientY];});
renderer.domElement.addEventListener("pointerup",e=>{if(Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(meshes).find(h=>{let n:THREE.Object3D|null=h.object;while(n){if(!n.visible)return false;n=n.parent;}return h.point.y<=clip.constant;});if(!hit){selection.visible=false;label("selected-part").textContent="부재를 클릭하면 원본 CAD ID를 확인합니다.";return;}let object=hit.object;while(!object.userData.cadObjectId&&object.parent)object=object.parent;selection.setFromObject(object);selection.visible=true;label("selected-part").textContent=`${object.name}\n${object.userData.cadObjectId}`;});
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}animate();
// Read-only bridge for reproducible browser verification and captures.
(globalThis as any).cafeViewer={setView:selectedView,overview,getModel:()=>model,getMeshCount:()=>meshes.length,getVisibleCount:()=>partNodes.filter(n=>n.visible).length,capture:()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL("image/png");}};
