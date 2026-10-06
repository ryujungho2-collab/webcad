import * as THREE from "three";
import type { CadDocument, CadRasterAsset } from "@agent-webcad/cad-document";
import { createImageSceneObject, updateImageSceneCrop } from "../src/viewport/imageRenderer";
import { renderArtboardPngInWorker } from "../src/export/artboardPngRenderer";
import { installBrowserChecks } from "./helpers/browserChecks";
import { imageTextureResourceStats } from "../src/viewport/imageTextureResources";

const button = document.querySelector<HTMLButtonElement>("#run")!, output = document.querySelector<HTMLElement>("#result")!;
const delay = () => new Promise(resolve => setTimeout(resolve, 10));
function maps(group: THREE.Object3D) { const found: THREE.Texture[] = []; group.traverse(child => { const map = (child as THREE.Mesh).material as THREE.MeshBasicMaterial; if(map?.map)found.push(map.map); }); return found; }
function dispose(group: THREE.Object3D) { group.traverse(child => { const mesh = child as THREE.Mesh; mesh.geometry?.dispose(); const material = mesh.material as THREE.MeshBasicMaterial; material?.map?.dispose(); material?.dispose(); }); }
const percentile = (values: number[], p: number) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
button.onclick = async () => {
 const checks: string[] = [], metrics: unknown[] = [];
 const check=(ok:boolean,message:string)=>{if(!ok)throw new Error(message);checks.push(`PASS ${message}`);};
 try {
  for(const size of [128,2048,4000]) {
   const canvas=document.createElement("canvas");canvas.width=canvas.height=size;
   const ctx=canvas.getContext("2d")!;ctx.fillStyle="#ff0000";ctx.fillRect(0,0,size/2,size);ctx.fillStyle="#0000ff";ctx.fillRect(size/2,0,size/2,size);
   const dataUrl=canvas.toDataURL("image/png"),asset:CadRasterAsset={id:"asset-fixture",name:"fixture.png",mimeType:"image/png",width:size,height:size,byteLength:atob(dataUrl.split(",")[1]).length,dataUrl,contentHash:"fixture"};
   const doc={id:"resource-fixture",revision:0,features:{},objects:{},layers:{},rootLayers:[],rootObjects:[],rasterAssets:{[asset.id]:asset}} as CadDocument;
   for(const id of ["a","b"])doc.features[id]={id,type:"image",output:id,params:{kind:"image",assetId:asset.id,workPlane:"XY",width:60,height:60,crop:{x:0,y:0,width:1,height:1}}} as CadDocument["features"][string];
   const before=JSON.stringify(doc),renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(256,256);document.body.append(renderer.domElement);
   const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-100,100,100,-100,.1,100);camera.position.z=10;
   const start=performance.now(),a=createImageSceneObject("a",doc)!,b=createImageSceneObject("b",doc)!;a.position.x=-40;b.position.x=40;scene.add(a,b);
   const textures=[...maps(a),...maps(b)];
   while(textures.some(texture=>!texture.image?.complete||!texture.image?.naturalWidth)) {if(performance.now()-start>15000)throw new Error("Image decode timed out");await delay();}
   renderer.render(scene,camera);renderer.getContext().finish();const coldMs=performance.now()-start;
   const versions=textures.map(texture=>texture.version),samples:number[]=[];
   for(let i=0;i<9;i++){const start=performance.now();updateImageSceneCrop(a,{x:(i%2)*.5,y:0,width:.5,height:1});updateImageSceneCrop(b,{x:0,y:0,width:1,height:1},"rect",.8);renderer.render(scene,camera);renderer.getContext().finish();samples.push(performance.now()-start);}
   const uploadVersionChanges=textures.reduce((sum,texture,i)=>sum+texture.version-versions[i],0),gpuTextures=renderer.info.memory.textures;
   check(gpuTextures===1&&textures[0]!==textures[1]&&textures[0].source===textures[1].source,`${size}px duplicate placements share one GPU source with independent UV state`);
   check(uploadVersionChanges===0,`${size}px crop/opacity changes never re-upload source pixels`);
   updateImageSceneCrop(a,{x:0,y:0,width:.5,height:1});updateImageSceneCrop(b,{x:.5,y:0,width:.5,height:1});renderer.render(scene,camera);renderer.getContext().finish();
   const pixel=(x:number)=>{const p=new Uint8Array(4);renderer.getContext().readPixels(x,128,1,1,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,p);return p;};
   check(pixel(76)[0]>240&&pixel(76)[2]<10&&pixel(180)[2]>240&&pixel(180)[0]<10,`${size}px placements keep independent crops and render exact source colors`);
   check(JSON.stringify(doc)===before,`${size}px preview never changes document source`);
   const alternateCanvas=document.createElement("canvas");alternateCanvas.width=alternateCanvas.height=16;
   const alternateContext=alternateCanvas.getContext("2d")!;alternateContext.fillStyle="#00ff00";alternateContext.fillRect(0,0,16,16);
   const alternate={...asset,id:"asset-alternate",dataUrl:alternateCanvas.toDataURL("image/png"),width:16,height:16};
   updateImageSceneCrop(a,{x:0,y:0,width:1,height:1},"rect",1,false,{brightness:0,contrast:0,saturation:0},alternate);
   const alternateMap=maps(a)[0];while(!alternateMap.image?.complete||!alternateMap.image?.naturalWidth)await delay();
   renderer.render(scene,camera);renderer.getContext().finish();
   check(pixel(76)[1]>240&&pixel(76)[0]<10&&pixel(180)[2]>240,`${size}px source preview renders replacement pixels without changing the shared placement`);
   updateImageSceneCrop(a,{x:0,y:0,width:.5,height:1},"rect",1,false,{brightness:0,contrast:0,saturation:0},asset);
   renderer.render(scene,camera);renderer.getContext().finish();
   check(pixel(76)[0]>240&&imageTextureResourceStats().sources===1&&imageTextureResourceStats().placements===2,`${size}px source preview cancel restores the original pixels and releases replacement lease`);
   dispose(a);scene.remove(a);renderer.render(scene,camera);check(pixel(180)[2]>240,`${size}px surviving placement remains usable after first release`);
   dispose(b);scene.remove(b);renderer.render(scene,camera);check(renderer.info.memory.textures===0&&renderer.info.memory.geometries===0,`${size}px final release returns WebGL textures/geometries to zero`);
   check(imageTextureResourceStats().sources===0&&imageTextureResourceStats().placements===0,`${size}px last release removes the decoded source cache`);
   const cancelled=createImageSceneObject("a",doc)!;dispose(cancelled);await delay();check(imageTextureResourceStats().sources===0,`${size}px release during load cannot resurrect a stale source`);
   const reopened=createImageSceneObject("a",doc)!;const reopenedMap=maps(reopened)[0];while(!reopenedMap.image?.complete||!reopenedMap.image?.naturalWidth)await delay();scene.add(reopened);renderer.render(scene,camera);check(renderer.info.memory.textures===1,`${size}px reopening after release creates a usable fresh source`);dispose(reopened);scene.remove(reopened);
   metrics.push({size,sourceBytes:asset.byteLength,placements:2,coldMs,editP50:percentile(samples,.5),editP95:percentile(samples,.95),samples,gpuTextures,uploadVersionChanges,estimatedTextureRgbaBytes:gpuTextures*size*size*4});
   renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();canvas.width=canvas.height=0;
  }
  const signal=new AbortController();const pending=renderArtboardPngInWorker('<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="4000"/>',4000,4000,signal.signal);signal.abort();
  try{await pending;throw new Error("Cancel unexpectedly rendered");}catch(error){check(error instanceof DOMException&&error.name==="AbortError","PNG export cancellation rejects without a partial output");}
  (globalThis as typeof globalThis&{cadTestMetrics?:unknown}).cadTestMetrics={fixtures:metrics,measurement:"WebGL render + gl.finish in SwiftShader; 9 warm edits per size; estimated RGBA excludes mipmaps, actual heap/VRAM not measured"};
  output.textContent=checks.join("\n")+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(error){output.textContent=checks.join("\n")+`\nFAIL: ${error instanceof Error?error.stack:error}`;}
};
installBrowserChecks(button,output);
