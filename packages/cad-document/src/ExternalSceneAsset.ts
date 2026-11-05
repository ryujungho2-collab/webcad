import type {CadDocument} from './CadDocument';

export const GLB_LIMITS = {fileBytes:8*1024*1024,jsonBytes:1024*1024,documentBytes:8*1024*1024,nodes:2048,decodedBytes:64*1024*1024,texturePixels:32*1024*1024,parseMs:20000};
export type ExternalSceneAsset={id:string;name:string;contentHash:string;byteLength:number;base64:string;source:{url:string;revision:string;author:string;license:string;licenseUrl:string;originalUrl:string;converter:string;coordinateConvention:'gltf'|'simready-model-rest'}};
export const SIMREADY_SOURCE:ExternalSceneAsset['source']={url:'https://huggingface.co/datasets/codepawl/simready-glb/resolve/e52172290393dde80e8d383861db94b8d0e92ec3/glb/arm_articulated_support_a01.glb',revision:'e52172290393dde80e8d383861db94b8d0e92ec3',author:'NVIDIA',converter:'codepawl',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',originalUrl:'https://huggingface.co/datasets/nvidia/simready-assets',coordinateConvention:'simready-model-rest'};
export const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
export const finiteVector=(v:unknown,n=3):v is number[]=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
const finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v);
export function decodeSceneBytes(asset:ExternalSceneAsset):Uint8Array<ArrayBuffer>{return Uint8Array.from(atob(asset.base64),c=>c.charCodeAt(0));}
export function encodeSceneBytes(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
export async function sceneHash(bytes:Uint8Array<ArrayBuffer>){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}

/** Bounded, self-contained GLB only. This is preflight, not certification of glTF or physics. */
export function parseGlb(bytes:Uint8Array){
 if(bytes.length<28||bytes.length>GLB_LIMITS.fileBytes)throw Error('GLB size must be 28 bytes–8 MiB.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==bytes.length)throw Error('Invalid GLB magic, version or declared length.');
 let json:any,bin:Uint8Array|undefined,offset=12;
 while(offset<bytes.length){
  if(offset+8>bytes.length)throw Error('Truncated GLB chunk.');
  const length=v.getUint32(offset,true),kind=v.getUint32(offset+4,true);offset+=8;
  if(length%4||offset+length>bytes.length)throw Error('Invalid GLB chunk length.');
  if(kind===0x4e4f534a){if(json||offset!==20||length>GLB_LIMITS.jsonBytes)throw Error('Invalid or oversized GLB JSON.');json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(offset,offset+length)));}
  else if(kind===0x004e4942){if(!json||bin)throw Error('Invalid GLB BIN chunk.');bin=bytes.subarray(offset,offset+length);}
  else throw Error('Unsupported GLB chunk.');
  offset+=length;
 }
 if(!record(json)||json.asset?.version!=='2.0'||!bin)throw Error('A self-contained glTF 2.0 GLB is required.');
 const walk=(x:any,depth=0)=>{if(depth>64)throw Error('GLB JSON nesting limit exceeded.');if(x&&typeof x==='object')for(const [k,y] of Object.entries(x)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Unsafe GLB property.');walk(y,depth+1);}};walk(json);
 for(const key of ['nodes','meshes','buffers','bufferViews','accessors','images','textures','materials','scenes'])if(json[key]!==undefined&&!Array.isArray(json[key]))throw Error(`Invalid GLB ${key}.`);
 const nodes:any[]=json.nodes??[],buffers:any[]=json.buffers??[],views:any[]=json.bufferViews??[];
 if(nodes.length>GLB_LIMITS.nodes||(json.meshes?.length??0)>2048||(json.accessors?.length??0)>20000||(json.images?.length??0)>64)throw Error('GLB element limit exceeded.');
 let decoded=0;
 for(const [i,b] of buffers.entries()){if(!record(b)||b.uri!==undefined||!integer(b.byteLength))throw Error('External buffers are not supported.');if(i===0&&b.byteLength>bin.length)throw Error('Truncated binary buffer.');if(i>0&&!b.extensions?.EXT_meshopt_compression?.fallback)throw Error('Unsupported buffer.');decoded+=b.byteLength;}
 const range=(buffer:any,start:any,length:any)=>integer(buffer)&&buffers[buffer]&&integer(start)&&integer(length)&&start+length<=buffers[buffer].byteLength;
 for(const b of views){if(!range(b.buffer,b.byteOffset??0,b.byteLength))throw Error('Invalid buffer view range.');const c=b.extensions?.EXT_meshopt_compression;if(c){if(!range(c.buffer,c.byteOffset??0,c.byteLength)||!integer(c.count)||!integer(c.byteStride)||c.byteStride<1||c.byteStride>256||c.count*c.byteStride!==b.byteLength)throw Error('Invalid Meshopt allocation.');decoded+=c.count*c.byteStride;}}
 for(const a of json.accessors??[]){const components=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16} as any)[a.type];if(!components||!integer(a.count)||a.count>4000000||![5120,5121,5122,5123,5125,5126].includes(a.componentType)||a.sparse)throw Error('Unsupported or oversized accessor.');decoded+=a.count*components*4;}
 if(decoded>GLB_LIMITS.decodedBytes)throw Error('GLB decoded geometry exceeds 64 MiB.');
 const parents=new Map<number,number>();
 nodes.forEach((n,i)=>{if(!record(n)||n.children!==undefined&&!Array.isArray(n.children)||n.name!==undefined&&(typeof n.name!=='string'||n.name.length>200))throw Error('Invalid GLB node.');for(const [k,l] of [['translation',3],['rotation',4],['scale',3],['matrix',16]] as const)if(n[k]!==undefined&&!finiteVector(n[k],l))throw Error(`Invalid node ${k}.`);for(const child of n.children??[]){if(!integer(child)||!nodes[child]||parents.has(child)||child===i)throw Error('Invalid node reference or multiple parents.');parents.set(child,i);}});
 nodes.forEach((_,i)=>{let next:number|undefined=i;const seen=new Set<number>();while(next!==undefined){if(seen.has(next))throw Error('GLB node cycle.');seen.add(next);if(seen.size>128)throw Error('GLB hierarchy too deep.');next=parents.get(next);}});
 for(const scene of json.scenes??[])if(!Array.isArray(scene.nodes)||new Set(scene.nodes).size!==scene.nodes.length||scene.nodes.some((n:any)=>!integer(n)||!nodes[n]||parents.has(n)))throw Error('Invalid scene roots.');
 // Read encoded dimensions before asking the browser to allocate decoded images.
 let pixels=0;const imageDimensions:{width:number;height:number}[]=[];
 for(const img of json.images??[]){const b=views[img.bufferView];if(img.uri!==undefined||img.mimeType!=='image/webp'||!b||b.buffer!==0)throw Error('MVP supports embedded WebP textures only.');const data=bin.subarray(b.byteOffset??0,(b.byteOffset??0)+b.byteLength);const text=(p:number,n:number)=>new TextDecoder().decode(data.subarray(p,p+n));if(data.length<30||text(0,4)!=='RIFF'||text(8,4)!=='WEBP')throw Error('Invalid WebP texture.');const d=new DataView(data.buffer,data.byteOffset,data.length),kind=text(12,4);let w=0,h=0;if(kind==='VP8X'){w=1+data[24]+data[25]*256+data[26]*65536;h=1+data[27]+data[28]*256+data[29]*65536;}else if(kind==='VP8 '){w=d.getUint16(26,true)&16383;h=d.getUint16(28,true)&16383;}else if(kind==='VP8L'){const bits=d.getUint32(21,true);w=1+(bits&16383);h=1+((bits>>>14)&16383);}if(!w||!h||w>4096||h>4096)throw Error('Unsupported WebP dimensions.');pixels+=w*h;imageDimensions.push({width:w,height:h});}
 if(pixels>GLB_LIMITS.texturePixels)throw Error('GLB textures exceed 32 megapixels.');
 const supported=['EXT_meshopt_compression','EXT_texture_webp','KHR_mesh_quantization','KHR_texture_transform'];
 if((json.extensionsRequired??[]).some((e:string)=>!supported.includes(e)))throw Error('Unsupported required glTF extension.');
 if(json.skins?.length||json.animations?.length||(json.meshes??[]).some((m:any)=>m.primitives?.some((p:any)=>p.targets)))throw Error('Skins, morph targets and animations are outside this static reference MVP.');
 return {json,decodedGeometryBudget:decoded,texturePixels:pixels,imageDimensions,parents};
}
export function validExternalSceneAsset(v:unknown):v is ExternalSceneAsset{
 if(!record(v)||typeof v.id!=='string'||!/^glb-[a-f0-9]{64}$/.test(v.id)||typeof v.contentHash!=='string'||v.id!==`glb-${v.contentHash}`||typeof v.name!=='string'||v.name.length>200||!integer(v.byteLength)||v.byteLength>GLB_LIMITS.fileBytes||typeof v.base64!=='string'||v.base64.length!==4*Math.ceil(v.byteLength/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(v.base64)||!record(v.source))return false;
 if(!['url','revision','author','license','licenseUrl','originalUrl','converter'].every(k=>typeof v.source[k]==='string'&&v.source[k].length<=2048)||!['gltf','simready-model-rest'].includes(v.source.coordinateConvention))return false;
 try{const bytes=decodeSceneBytes(v as ExternalSceneAsset);if(bytes.length!==v.byteLength)return false;parseGlb(bytes);return true;}catch{return false;}
}
export function validateExternalScenes(doc:CadDocument){
 if(doc.externalSceneAssets!==undefined&&!record(doc.externalSceneAssets))throw Error('Invalid external scene assets.');
 let total=0;
 for(const [id,a] of Object.entries(doc.externalSceneAssets??{})){if(id!==a.id||!validExternalSceneAsset(a))throw Error('Invalid embedded GLB asset.');total+=a.byteLength;}
 if(total>GLB_LIMITS.documentBytes)throw Error('Document GLB limit is 8 MiB.');
 for(const f of Object.values(doc.features))if(f.type==='external-scene'&&!doc.externalSceneAssets?.[String(f.params.assetId)])throw Error('Missing external GLB asset reference.');
}

export type MetadataValue={state:'absent'|'valid'|'invalid';value?:unknown};
const field=(value:unknown,valid:(v:any)=>boolean):MetadataValue=>value===undefined?{state:'absent'}:{state:valid(value)?'valid':'invalid',value};
export function inspectGlbMetadata(json:any){
 const nodes:any[]=json.nodes??[],root=json.extensions?.KHR_physics_rigid_bodies;
 const materials=(Array.isArray(root?.physicsMaterials)?root.physicsMaterials:[]).map((m:any)=>({raw:m,validation:field(m,x=>record(x)&&['staticFriction','dynamicFriction','restitution'].every(k=>finite(x[k])&&x[k]>=0)&&(x.restitution<=1))}));
 const parts=nodes.map((n,index)=>{const p=n.extensions?.KHR_physics_rigid_bodies,e=n.extras??{},motion=p?.motion;return {index,name:n.name??`Node ${index}`,mesh:n.mesh,children:n.children??[],rigidBody:field(motion,x=>record(x)),mass:field(record(motion)&&Object.hasOwn(motion,'mass')?motion.mass:e.mass,x=>finite(x)&&x>0),density:field(e.density,x=>finite(x)&&x>0),inertia:field(motion?.inertiaDiagonal,x=>finiteVector(x)&&x.every(v=>v>=0)&&x.every((v,i)=>v<=x[(i+1)%3]+x[(i+2)%3]+1e-6)),centerOfMass:field(motion?.centerOfMass,finiteVector),inertiaOrientation:field(motion?.inertiaOrientation,x=>finiteVector(x,4)&&Math.abs(Math.hypot(...x)-1)<1e-4),physicsMaterial:field(p?.collider?.physicsMaterial,x=>Number.isInteger(x)&&!!materials[x]),extension:p,extras:e};});
 const joints=nodes.flatMap((n,child)=>(Array.isArray(n.extras?.joints)?n.extras.joints:[]).map((raw:any,index:number)=>({child,index,raw,type:typeof raw?.type==='string'?raw.type:'unknown',axis:field(raw?.axis,x=>finiteVector(x)&&Math.abs(Math.hypot(...x)-1)<1e-4),origin:field(raw?.pivot,finiteVector)})));
 const extensionJoints=nodes.flatMap((n,index)=>n.extensions?.KHR_physics_rigid_bodies?.joint?[{node:index,...n.extensions.KHR_physics_rigid_bodies.joint}]:[]);
 return {parts,joints,materials,extensionJoints,rawExtension:root,extensionJointDefinitions:Array.isArray(root?.physicsJoints)?root.physicsJoints:[],warning:'Metadata presence and numeric validity do not establish physical accuracy.'};
}
export function externalSceneSummary(asset:ExternalSceneAsset){const {json}=parseGlb(decodeSceneBytes(asset)),m=inspectGlbMetadata(json),jointKinds=[...new Set(m.joints.map(j=>j.type))];return {name:asset.name,source:asset.source,byteLength:asset.byteLength,nodeCount:m.parts.length,meshNodeCount:m.parts.filter(p=>p.mesh!==undefined).length,rigidBodyCount:m.parts.filter(p=>p.rigidBody.state!=='absent').length,jointCount:m.joints.length,extensionJointCount:m.extensionJoints.length,jointTypes:Object.fromEntries(jointKinds.slice(0,16).map(type=>[type.slice(0,80),m.joints.filter(j=>j.type===type).length])),jointTypesTruncated:jointKinds.length>16,properties:Object.fromEntries(['mass','inertia','density','physicsMaterial'].map(k=>[k,Object.fromEntries(['absent','valid','invalid'].map(s=>[s,m.parts.filter(p=>(p as any)[k].state===s).length]))])),physicsMaterials:m.materials.length,physicsUnits:{mass:'kg',density:'kg/m³',inertia:'kg·m²',origin:'source metres Y-up'},cadConversion:false,assemblyApply:false,assemblyPreview:'Fixed/Revolute only; graph and rest frames require validation',warning:m.warning};}
