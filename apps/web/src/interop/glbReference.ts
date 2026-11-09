import * as THREE from 'three';

import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import {GLB_LIMITS,parseGlb,sceneHash,encodeSceneBytes,decodeSceneBytes,type ExternalSceneAsset} from '@agent-webcad/cad-document';



export const GLB_QUALITIES=['Original','Balanced','Low Memory'] as const;
export type GlbQuality=typeof GLB_QUALITIES[number];
let quality:GlbQuality='Original';
export const glbDisplayQuality=()=>quality;
export function setGlbDisplayQuality(q:GlbQuality){if(!GLB_QUALITIES.includes(q))throw Error('Invalid quality');quality=q;version++;listeners.forEach(f=>f());}
export type GlbStatus={state:'loading'|'ready'|'error'|'cancelled'|'disposed';quality?:GlbQuality;reuse?:string;meshoptMs?:number;textureDecodeTaskMs?:number;importToDrawMs?:number;textureResizeMs?:number;uploadSubmitMs?:number;importTimings?:{downloadMs:number;validationMs:number;decodeMs:number;totalMs:number};message:string;parseMs?:number;geometryBytes?:number;textureBytes?:number;meshes?:number;triangles?:number;renderer?:{geometries:number;textures:number};firstFrameMs?:number};

const statuses=new Map<string,GlbStatus>(),listeners=new Set<()=>void>(),activeLoads=new Map<string,number>();let version=0,loadSequence=0;

export const subscribeGlbStatus=(f:()=>void)=>{listeners.add(f);return ()=>{listeners.delete(f);};};

export const glbStatusVersion=()=>version;

export const glbStatus=(id:string)=>statuses.get(id);

function status(id:string,value:GlbStatus,token?:number){if(token!==undefined&&activeLoads.get(id)!==token)return;statuses.set(id,value);if(statuses.size>64){const old=statuses.keys().next().value!;statuses.delete(old);activeLoads.delete(old);}version++;listeners.forEach(f=>f());}

export function highlightGlbPart(objectId:string,nodeIndex:number|null){window.dispatchEvent(new CustomEvent('webcad-glb-part',{detail:{objectId,nodeIndex}}));}



export async function prepareGlbAsset(input:File|string,source:ExternalSceneAsset['source'],signal:AbortSignal,onProgress:(text:string)=>void,handoff?:{key:string;isCurrent:()=>boolean;subscribe:(f:()=>void)=>()=>void}){
 const start=performance.now();let downloaded=start,validated=start;

 const abort=new AbortController(),cancel=()=>abort.abort(signal.reason);signal.addEventListener('abort',cancel,{once:true});

 const timer=setTimeout(()=>abort.abort(new Error('GLB download timed out after 60 seconds.')),60000);

 try{

  signal.throwIfAborted();onProgress('Reading GLB…');let bytes:Uint8Array<ArrayBuffer>;

  if(typeof input!=='string'){if(input.size>GLB_LIMITS.fileBytes)throw Error('GLB exceeds 8 MiB.');bytes=new Uint8Array(await input.arrayBuffer());}

  else {const response=await fetch(input,{signal:abort.signal});if(!response.ok)throw Error(`GLB download failed: HTTP ${response.status} ${response.statusText}`);const total=Number(response.headers.get('content-length'))||0;if(total>GLB_LIMITS.fileBytes)throw Error('GLB exceeds 8 MiB.');const reader=response.body?.getReader();if(!reader)throw Error('GLB response has no body.');let count=0;const chunks:Uint8Array[]=[];try{while(true){const {value,done}=await reader.read();if(done)break;count+=value.length;if(count>GLB_LIMITS.fileBytes)throw Error('GLB exceeds 8 MiB.');chunks.push(value);onProgress(`Downloading ${(count/1048576).toFixed(2)}${total?` / ${(total/1048576).toFixed(2)}`:''} MiB`);}}finally{await reader.cancel();reader.releaseLock();}bytes=new Uint8Array(count);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}}

  downloaded=performance.now();abort.signal.throwIfAborted();onProgress('Checking GLB and source checksum…');parseGlb(bytes);const hash=await sceneHash(bytes);abort.signal.throwIfAborted();

  const asset:ExternalSceneAsset={id:`glb-${hash}`,name:typeof input==='string'?decodeURIComponent(new URL(input,location.href).pathname.split('/').pop()!):input.name,byteLength:bytes.length,contentHash:hash,base64:encodeSceneBytes(bytes),source};

  // Validate actual decoder/texture support before publishing a document command.

  validated=performance.now();onProgress('Parsing geometry and WebP textures…');const root=await decodeGlbReference(asset,'import-preview',abort.signal,quality);if(abort.signal.aborted){disposeRawGlb(root,false);abort.signal.throwIfAborted();}root.userData.importStartedAt=start;root.userData.importTimings={downloadMs:downloaded-start,validationMs:validated-downloaded,decodeMs:performance.now()-validated,totalMs:performance.now()-start};if(handoff)stageHandoff(handoff,root,asset,quality);else disposeRawGlb(root);return asset;

 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}

}



/** Owns all resources of a single parse, including shared textures and ImageBitmaps. */

function disposeRawGlb(root:THREE.Object3D,report=true){

 if(root.userData.glbDisposed)return;root.userData.glbDisposed=true;if(root.userData.glbTracked){decodedResources--;root.userData.glbTracked=false;}

 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),images=new Set<any>();

 for(const texture of root.userData.glbDependencyTextures??[])textures.add(texture);

 for(const entry of [root,...root.userData.glbDependencyRoots??[]])entry.traverse((n:THREE.Object3D)=>{const mesh=n as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);for(const m of (Array.isArray(mesh.material)?mesh.material:[mesh.material]))if(m){materials.add(m);for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}});

 for(const t of textures){if(t.source?.data)images.add(t.source.data);t.dispose();}for(const img of images)img.close?.();for(const m of materials)m.dispose();for(const g of geometries)g.dispose();

 root.userData.glbDependencyRoots=[];root.userData.glbDependencyTextures=[];

 const id=root.userData.cadObjectId;if(id&&report)status(id,{...statuses.get(id),state:'disposed',message:'Geometry, materials, textures and decoded images released.'},root.userData.glbLoadToken);

}



async function decodeGlbReference(asset:ExternalSceneAsset,objectId:string,signal:AbortSignal,display:GlbQuality='Original'):Promise<THREE.Group>{
 parses++;let resizeMs=0,meshoptMs=0,textureDecodeTaskMs=0;

 const started=performance.now(),token=++loadSequence;signal.throwIfAborted();activeLoads.set(objectId,token);status(objectId,{state:'loading',message:'Checking source and parsing GLB…'},token);

 try{

  const bytes=decodeSceneBytes(asset),preflight=parseGlb(bytes);

  if(await sceneHash(bytes)!==asset.contentHash)throw Error('GLB source checksum mismatch.');signal.throwIfAborted();

  const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('blob:'))throw Error('External GLB resource requests are disabled.');return url;});

  const measuredDecoder=Object.create(MeshoptDecoder);const originalDecode=MeshoptDecoder.decodeGltfBufferAsync;measuredDecoder.decodeGltfBufferAsync=(...args:any[])=>{const t=performance.now();return (originalDecode as any)(...args).finally(()=>{meshoptMs+=performance.now()-t;});};
  const loader=new GLTFLoader(manager).setMeshoptDecoder(measuredDecoder);
  loader.register(parser=>{const original=parser.loadTextureImage.bind(parser);parser.loadTextureImage=(i,s,bitmapLoader)=>{const measured=Object.create(bitmapLoader);measured.load=(url:string,onLoad:(x:ImageBitmap)=>void,progress:any,error:any)=>{const t=performance.now();(bitmapLoader as any).load(url,(bitmap:ImageBitmap)=>{textureDecodeTaskMs+=performance.now()-t;onLoad(bitmap);},progress,error);};return original(i,s,measured);};return {name:'WEBCAD_decode_measurement'};});

  // Track dependencies even when a later dependency fails, so decoded bitmaps

  // from a rejected/cancelled parse do not have to wait for garbage collection.

  let abandoned=false;

  const pendingRoots=new Set<THREE.Object3D>(),pendingTextures=new Set<THREE.Texture>(),released=new Set<object>();

  const releaseTexture=(t:THREE.Texture)=>{if(released.has(t))return;released.add(t);t.dispose();const image=t.source?.data;if(image&&!released.has(image)){released.add(image);image.close?.();}};

  const releaseRoot=(root:THREE.Object3D)=>root.traverse(n=>{const mesh=n as THREE.Mesh;if(mesh.geometry&&!released.has(mesh.geometry)){released.add(mesh.geometry);mesh.geometry.dispose();}for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material&&!released.has(material)){released.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)releaseTexture(value);material.dispose();}});

  const abandon=()=>{abandoned=true;pendingRoots.forEach(releaseRoot);pendingTextures.forEach(releaseTexture);pendingRoots.clear();pendingTextures.clear();};

  loader.register(parser=>({name:'WEBCAD_resource_ownership',beforeRoot:()=>{

   for(let i=0;i<(preflight.json.textures?.length??0);i++)void parser.getDependency('texture',i).then((t:THREE.Texture|null)=>{if(t){if(abandoned)releaseTexture(t);else pendingTextures.add(t);}},()=>{});

   for(let i=0;i<(preflight.json.meshes?.length??0);i++)void parser.getDependency('mesh',i).then((root:THREE.Object3D)=>{if(abandoned)releaseRoot(root);else pendingRoots.add(root);},()=>{});

   return Promise.resolve();

  }}));

  // Optional metadata-only draft extension, deliberately not interpreted as simulation.

  loader.register(()=>({name:'KHR_physics_rigid_bodies'}));

  status(objectId,{state:'loading',message:'Parsing geometry and WebP textures…'},token);signal.throwIfAborted();

  return await new Promise<THREE.Group>((resolve,reject)=>{

   let settled=false;const clean=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};

   const fail=(error:unknown)=>{if(settled)return;settled=true;clean();abandon();reject(error);};

   const abort=()=>fail(signal.reason??new DOMException('GLB loading cancelled.','AbortError'));

   const timer=setTimeout(()=>fail(new Error('GLB parse exceeded 20 seconds.')),GLB_LIMITS.parseMs);

   signal.addEventListener('abort',abort,{once:true});

   loader.parse(bytes.buffer,'',async gltf=>{

    const root=new THREE.Group();root.userData.externalGlb=true;root.userData.cadObjectId=objectId;root.userData.glbLoadToken=token;

    // glTF metres Y-up -> CAD millimetres Z-up. Native glTF nodes stay untouched.

    const basis=new THREE.Group();basis.name='glTF metres Y-up → CAD mm Z-up';basis.rotation.x=Math.PI/2;basis.scale.setScalar(1000);basis.add(gltf.scene);root.add(basis);

    if(settled||signal.aborted){releaseRoot(root);return;}

    try{

     const resizeStart=performance.now(),images=new Map<any,ImageBitmap>();
     try{if(display!=='Original'){const max=display==='Balanced'?512:256;const textures=new Set<THREE.Texture>(pendingTextures);gltf.scene.traverse(n=>{const mesh=n as THREE.Mesh;for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m)for(const t of Object.values(m))if(t instanceof THREE.Texture)textures.add(t);});for(const t of textures){const image=t.source?.data;if(image?.width&&Math.max(image.width,image.height)>max&&!images.has(image)){const scale=max/Math.max(image.width,image.height);images.set(image,await createImageBitmap(image,{resizeWidth:Math.round(image.width*scale),resizeHeight:Math.round(image.height*scale),resizeQuality:'high'}));}}for(const t of textures){const small=images.get(t.source?.data);if(small){t.source.data=small;t.needsUpdate=true;}}images.forEach((_,original)=>original.close());}}catch(error){images.forEach(image=>image.close());throw error;}
     resizeMs=performance.now()-resizeStart;if(signal.aborted){disposeRawGlb(root,false);fail(signal.reason);return;}
     const originals=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>();let meshes=0,triangles=0,geometryBytes=0;

     gltf.scene.traverse(n=>{const association=gltf.parser.associations.get(n);if(association?.nodes!==undefined)n.userData.glbNodeIndex=association.nodes;n.userData.cadObjectId=objectId;const mesh=n as THREE.Mesh;if(!mesh.isMesh)return;meshes++;geometries.add(mesh.geometry);triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position?.count??0)/3;const clone=(m:THREE.Material)=>{originals.add(m);const c=m.clone() as THREE.MeshStandardMaterial;c.userData.baseColor=c.color?.getHex();return c;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);});

     for(const m of originals)m.dispose();

     const arrays=new Set<ArrayBufferLike>();for(const g of geometries){for(const a of Object.values(g.attributes)){const array=(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute?(a as THREE.InterleavedBufferAttribute).data.array:a.array;if(!arrays.has(array.buffer)){arrays.add(array.buffer);geometryBytes+=array.buffer.byteLength;}}if(g.index&&!arrays.has(g.index.array.buffer)){arrays.add(g.index.array.buffer);geometryBytes+=g.index.array.buffer.byteLength;}}

     const pixels=display==='Original'?preflight.texturePixels:preflight.imageDimensions.reduce((sum,d)=>{const scale=Math.min(1,(display==='Balanced'?512:256)/Math.max(d.width,d.height));return sum+Math.round(d.width*scale)*Math.round(d.height*scale);},0);
     const metrics:GlbStatus={quality:display,meshoptMs,textureDecodeTaskMs,textureResizeMs:resizeMs,state:'ready',message:'External visual reference · Y-up m → Z-up mm',parseMs:performance.now()-started,geometryBytes,textureBytes:Math.ceil(pixels*4*4/3),meshes,triangles};

     let pendingFrame=false,firstFrameMs:number|undefined,lastMemory='';root.traverse(n=>{if((n as THREE.Mesh).isMesh)n.onAfterRender=renderer=>{if(pendingFrame)return;pendingFrame=true;firstFrameMs??=performance.now()-started;requestAnimationFrame(()=>{pendingFrame=false;if(root.userData.glbDisposed)return;const memory={...renderer.info.memory},key=JSON.stringify(memory);if(key!==lastMemory){lastMemory=key;status(objectId,{...metrics,firstFrameMs,renderer:memory},token);}});};});

     root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);if(bounds.isEmpty()||[...bounds.min.toArray(),...bounds.max.toArray()].some(n=>!Number.isFinite(n)||Math.abs(n)>1e9))throw Error('GLB has empty, non-finite or out-of-range visual bounds.');root.userData.glbDependencyRoots=[...pendingRoots];root.userData.glbDependencyTextures=[...pendingTextures];pendingRoots.clear();pendingTextures.clear();root.userData.glbTracked=true;decodedResources++;settled=true;clean();status(objectId,metrics,token);resolve(root);

    }catch(e){disposeRawGlb(root);fail(e);}

   },fail);

  });

 }catch(error){status(objectId,{state:signal.aborted?'cancelled':'error',message:error instanceof Error?error.message:String(error)},token);throw error;}

}



// Runtime render ownership only. No Three.js objects enter documents or snapshots.

type Shared={root:THREE.Group;asset:ExternalSceneAsset;quality:GlbQuality;refs:number;scope?:Map<string,Shared>};

export type GlbResourceScope=Map<string,Shared>;

export const createGlbResourceScope=():GlbResourceScope=>new Map();

const owners=new WeakMap<THREE.Object3D,Shared>(),privateMaterials=new WeakMap<THREE.Object3D,Set<THREE.Material>>();

const pending=new Map<string,{root:THREE.Group;asset:ExternalSceneAsset;quality:GlbQuality;cancel:()=>void;valid:()=>boolean}>();

let parses=0,handoffHits=0,sharedHits=0,livePlacements=0,decodedResources=0;

export const glbResourceMetrics=()=>({parses,handoffHits,sharedHits,livePlacements,pendingHandoffs:pending.size,decodedResources});

export function cancelGlbHandoff(key:string){pending.get(key)?.cancel();}

function stageHandoff(h:{key:string;isCurrent:()=>boolean;subscribe:(f:()=>void)=>()=>void},root:THREE.Group,asset:ExternalSceneAsset,q:GlbQuality){

 for(const item of pending.values())item.cancel();let unsubscribe=()=>{};const timer=setTimeout(()=>cancelGlbHandoff(h.key),10000);

 const entry={root,asset,quality:q,valid:h.isCurrent,cancel:()=>{if(pending.get(h.key)!==entry)return;pending.delete(h.key);clearTimeout(timer);unsubscribe();disposeRawGlb(entry.root,false);}};pending.set(h.key,entry);unsubscribe=h.subscribe(()=>{if(!h.isCurrent())entry.cancel();});if(!h.isCurrent())entry.cancel();

}

function clonePlacement(shared:Shared){

 const root=new THREE.Group();root.userData={externalGlb:true};const materials=new Set<THREE.Material>();

 for(const child of shared.root.children)root.add(child.clone(true));

 root.traverse(n=>{const mesh=n as THREE.Mesh;if(!mesh.isMesh)return;const copy=(m:THREE.Material)=>{const c=m.clone() as THREE.MeshStandardMaterial;c.color?.set(c.userData.baseColor??c.color);materials.add(c);return c;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);});privateMaterials.set(root,materials);return root;

}

export function glbReferenceMatches(root:THREE.Object3D,asset:ExternalSceneAsset){const shared=owners.get(root);return !!shared&&shared.asset.base64===asset.base64&&shared.asset.byteLength===asset.byteLength&&shared.asset.contentHash===asset.contentHash;}
export function disposeGlbReference(root:THREE.Object3D,report=true){

 if(root.userData.glbLeaseReleased)return;const shared=owners.get(root);if(!shared){disposeRawGlb(root,report);return;}owners.delete(root);livePlacements--;root.userData.glbLeaseReleased=true;

 for(const material of privateMaterials.get(root)??[])material.dispose();privateMaterials.delete(root);shared.refs--;

 if(shared.refs===0){shared.scope?.delete(shared.asset.contentHash);disposeRawGlb(shared.root,false);}

 if(report)status(root.userData.cadObjectId,{...glbStatus(root.userData.cadObjectId),state:'disposed',message:shared.refs?'Placement released; other placements retain shared resources.':'Last placement released; geometry/textures/bitmaps disposed.'},root.userData.glbLoadToken);

}

export async function loadGlbReference(asset:ExternalSceneAsset,objectId:string,signal:AbortSignal,options:{scope?:GlbResourceScope;handoffKey?:string;quality?:GlbQuality}={}):Promise<THREE.Group>{

 const start=performance.now(),q=options.quality??'Original';signal.throwIfAborted();let shared=options.scope?.get(asset.contentHash),root:THREE.Group,reuse='decoded';

 if(shared&&(shared.quality!==q||shared.asset.base64!==asset.base64||shared.asset.contentHash!==asset.contentHash||shared.asset.byteLength!==asset.byteLength)){status(objectId,{state:'error',message:'GLB resource identity or display quality mismatch.'});throw Error('GLB resource identity or display quality mismatch.');}

 if(shared){sharedHits++;reuse='shared';root=clonePlacement(shared);}

 else{

  const h=options.handoffKey?pending.get(options.handoffKey):undefined;

  if(h&&h.valid()&&h.quality===q&&h.asset.base64===asset.base64&&h.asset.contentHash===asset.contentHash){root=h.root;const saved=h.root;h.root=new THREE.Group();h.cancel();root=saved;handoffHits++;reuse='handoff';}

  else{h?.cancel();root=await decodeGlbReference(asset,objectId,signal,q);}

  if(signal.aborted){disposeRawGlb(root,false);signal.throwIfAborted();}

  shared={root,asset,quality:q,refs:0,scope:options.scope};options.scope?.set(asset.contentHash,shared);

 }

 shared.refs++;owners.set(root,shared);livePlacements++;root.userData.cadObjectId=objectId;root.userData.glbLeaseReleased=false;

 root.traverse(n=>{n.userData.cadObjectId=objectId;});const token=++loadSequence;activeLoads.set(objectId,token);root.userData.glbLoadToken=token;

 const metrics:GlbStatus={...(glbStatus(reuse==='handoff'?'import-preview':objectId)??{}),state:'ready',message:'External visual reference · Y-up m → Z-up mm',quality:q,reuse,importTimings:shared.root.userData.importTimings};

 if(reuse==='shared'){Object.assign(metrics,shared.root.userData.glbStats??{});metrics.reuse=reuse;metrics.quality=q;}

 root.userData.glbStats=metrics;let uploaded=false,queued=false,first:number|undefined,last='';

 root.traverse(n=>{if(!(n as THREE.Mesh).isMesh)return;n.onBeforeRender=renderer=>{if(uploaded)return;uploaded=true;const t=performance.now(),textures=new Set<THREE.Texture>();root.traverse(o=>{const m=o as THREE.Mesh;for(const mat of Array.isArray(m.material)?m.material:[m.material])if(mat)for(const texture of Object.values(mat))if(texture instanceof THREE.Texture)textures.add(texture);});textures.forEach(t=>renderer.initTexture(t));metrics.uploadSubmitMs=performance.now()-t;};n.onAfterRender=renderer=>{if(root.userData.glbLeaseReleased||queued)return;first??=performance.now()-start;if(shared!.root.userData.importStartedAt)metrics.importToDrawMs??=performance.now()-shared!.root.userData.importStartedAt;queued=true;requestAnimationFrame(()=>{queued=false;if(root.userData.glbLeaseReleased)return;const memory={...renderer.info.memory},key=JSON.stringify(memory);if(last!==key){last=key;status(objectId,{...metrics,firstFrameMs:first,renderer:memory},token);}});};});

 status(objectId,metrics,token);return root;

}

