import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";
import {deserializeDocument} from "@agent-webcad/cad-document";
import {evaluateAssembly,assertAssemblyPose,assemblyMatrix} from "../src/state/assemblyCommands";

const d=deserializeDocument(document.getElementById("pavilion-data")!.textContent!),host=document.getElementById("scene")!;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor("#eeece5");renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;host.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(37,1,10,100000);camera.up.set(0,0,1);camera.position.set(10700,-12100,7900);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(2850,2100,1450);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.48;controls.minDistance=4000;controls.maxDistance=30000;controls.update();
scene.add(new THREE.HemisphereLight("#fff9e9","#868d87",2.5));
const sun=new THREE.DirectionalLight("#fff5df",3.5);sun.position.set(-2000,-4000,10000);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-6500;sun.shadow.camera.right=6500;sun.shadow.camera.top=6500;sun.shadow.camera.bottom=-6500;sun.shadow.camera.far=25000;sun.shadow.normalBias=3;sun.target.position.set(3000,2000,0);scene.add(sun,sun.target);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200000,200000),new THREE.MeshStandardMaterial({color:"#d8d8ca",roughness:1}));ground.position.set(3000,2100,-182);ground.receiveShadow=true;scene.add(ground);
const meshes=new Map<string,THREE.Mesh>();
for(const [id,o]of Object.entries(d.objects)){
 const p=d.features["f-"+id].params,layer=d.layers[o.layerId],glass=o.layerId==="glass";
 const geometry=new THREE.BoxGeometry(Number(p.width),Number(p.depth),Number(p.height));geometry.translate(Number(p.width)/2,Number(p.depth)/2,Number(p.height)/2);
 const material=new THREE.MeshStandardMaterial({color:layer.style!.color,roughness:glass?.12:o.layerId==="steel"?.35:.7,metalness:o.layerId==="steel"?.4:0,transparent:glass,opacity:glass?.32:1,depthWrite:!glass});
 const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=!glass;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;
 const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:glass?"#527c7a":"#353e39",transparent:true,opacity:glass?.6:.22}));mesh.add(edges);scene.add(mesh);meshes.set(id,mesh);
}
let playing=false,start=performance.now(),current=0;
const slider=document.getElementById("drive") as HTMLInputElement;
function setPose(value:number){
 if(!Number.isFinite(value)||value<0||value>75)throw Error("Driver must be within 0..75 degrees.");
 current=value;d.assembly!.joints["louver-drive-1"].angle=value;evaluateAssembly(d,undefined,true);assertAssemblyPose(d);
 for(const [id,mesh]of meshes){mesh.matrix.copy(assemblyMatrix(d.objects[id].transform!));mesh.matrixWorldNeedsUpdate=true;}
 slider.value=String(value);document.getElementById("pose-label")!.textContent=value<.01?"CLOSED":value>74.99?"OPEN":"IN MOTION";
 document.getElementById("percent")!.textContent=Math.round(value/75*100)+"%";
 document.getElementById("louver-value")!.textContent=value.toFixed(1)+"°";
 document.getElementById("door-value")!.textContent=Math.abs(d.assembly!.joints["slide-left"].offset!).toFixed(0)+" mm";
 document.getElementById("roof-value")!.textContent=d.assembly!.joints["roof-lift-0"].angle.toFixed(1)+"°";
 document.querySelectorAll<HTMLButtonElement>("[data-pose]").forEach(b=>b.classList.toggle("active",Math.abs(Number(b.dataset.pose)-value)<.01));renderer.render(scene,camera);
}
slider.oninput=()=>{playing=false;document.getElementById("play")!.textContent="Play motion";setPose(Number(slider.value));};
document.querySelectorAll<HTMLButtonElement>("[data-pose]").forEach(b=>b.onclick=()=>{playing=false;document.getElementById("play")!.textContent="Play motion";setPose(Number(b.dataset.pose));});
document.getElementById("play")!.onclick=()=>{playing=!playing;start=performance.now()-Math.acos(1-current/37.5)*6000/Math.PI;document.getElementById("play")!.textContent=playing?"Pause motion":"Play motion";};
document.getElementById("reset-view")!.onclick=()=>{camera.position.set(10700,-12100,7900);controls.target.set(2850,2100,1450);controls.update();};
function resize(){renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(host);resize();setPose(37.5);
function frame(t:number){requestAnimationFrame(frame);if(playing)setPose((1-Math.cos((t-start)*Math.PI/6000))*37.5);controls.update();renderer.render(scene,camera);}requestAnimationFrame(frame);
// Read-only state and deterministic driver bridge for the automated screenshot verifier.
(globalThis as any).pavilion={setPose:(value:number)=>{playing=false;setPose(value);},state:()=>({driver:current,parts:meshes.size,joints:structuredClone(d.assembly!.joints),poses:Object.fromEntries(Object.entries(d.objects).map(([id,o])=>[id,structuredClone(o.transform)]))}),capture:()=>{renderer.render(scene,camera);return renderer.domElement.toDataURL("image/png");}};
document.documentElement.dataset.ready="true";
