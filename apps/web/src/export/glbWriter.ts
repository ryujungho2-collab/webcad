import * as THREE from "three";
import type {CadObjectTransform,SolidFinish} from "@agent-webcad/cad-document";
import type {MeshData} from "../cad/kernelProtocol";

export type GlbPart={id:string;name:string;layerId:string;geometryKey:string;mesh:MeshData;transform:CadObjectTransform;finish:SolidFinish};
/** glTF 2.0: reusable indexed geometry, PBR finishes, stable part IDs, mm/Z-up → m/Y-up. */
export function encodeGlb(parts:GlbPart[]):Uint8Array{
 if(!parts.length)throw Error("GLB export needs at least one visible solid.");
 const chunks:Uint8Array[]=[],views:any[]=[],accessors:any[]=[],meshes:any[]=[],materials:any[]=[],nodes:any[]=[{name:"CAD millimetres / Z up",rotation:[-Math.SQRT1_2,0,0,Math.SQRT1_2],scale:[.001,.001,.001],children:[]}];
 const geometry=new Map<string,{position:number;normal:number;indices:number}>(),meshIds=new Map<string,number>(),materialIds=new Map<string,number>();let byteLength=0;
 const append=(data:Float32Array|Uint32Array,type:string,target:number,min?:number[],max?:number[])=>{
  const bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength),view=views.length;views.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length,target});chunks.push(bytes);byteLength+=bytes.length;
  if(byteLength>256*1024*1024)throw Error("GLB geometry exceeds 256 MiB.");
  const id=accessors.length;accessors.push({bufferView:view,componentType:data instanceof Uint32Array?5125:5126,count:data.length/(type==="VEC3"?3:1),type,...min?{min,max}:{}});return id;
 };
 for(const part of parts){
  let g=geometry.get(part.geometryKey);
  if(!g){const {positions,normals,indices}=part.mesh;if(!positions.length||positions.length%3||normals.length!==positions.length||indices.length%3||!indices.length)throw Error("Invalid GLB mesh arrays.");
   const pos=Float32Array.from(positions),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<pos.length;i++){const v=pos[i];if(!Number.isFinite(v)||!Number.isFinite(normals[i]))throw Error("Non-finite GLB vertex.");min[i%3]=Math.min(min[i%3],v);max[i%3]=Math.max(max[i%3],v);}if(indices.some(i=>i>=positions.length/3))throw Error("Invalid GLB mesh index.");
   g={position:append(pos,"VEC3",34962,min,max),normal:append(normals,"VEC3",34962),indices:append(indices,"SCALAR",34963)};geometry.set(part.geometryKey,g);
  }
  const materialKey=JSON.stringify(part.finish);let material=materialIds.get(materialKey);
  if(material===undefined){const f=part.finish,c=new THREE.Color(f.color);material=materials.length;materials.push({name:f.name,pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,f.opacity],metallicFactor:f.metalness,roughnessFactor:f.roughness},alphaMode:f.opacity<1?"BLEND":"OPAQUE",doubleSided:true,...f.name==="Opal diffuser"?{emissiveFactor:[.7,.55,.3]}:{}});materialIds.set(materialKey,material);}
  const key=JSON.stringify([part.geometryKey,material]);let mesh=meshIds.get(key);
  if(mesh===undefined){mesh=meshes.length;meshes.push({primitives:[{attributes:{POSITION:g.position,NORMAL:g.normal},indices:g.indices,material}]});meshIds.set(key,mesh);}
  const t=part.transform;if(![...t.translation,...t.rotation,...t.scale].every(Number.isFinite)||t.scale.some(v=>v===0))throw Error("Invalid GLB part transform.");
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation.map(THREE.MathUtils.degToRad) as [number,number,number]));
  nodes[0].children.push(nodes.length);nodes.push({name:part.name,mesh,translation:t.translation,rotation:q.toArray(),scale:t.scale,extras:{cadObjectId:part.id,layerId:part.layerId}});
 }
 const doc={asset:{version:"2.0",generator:"Agent WebCAD / exact CAD tessellation"},scene:0,scenes:[{name:"Assembled CAD model",nodes:[0]}],nodes,meshes,materials,accessors,bufferViews:views,buffers:[{byteLength}],extras:{sourceUnits:"mm",sourceUp:"Z",units:"m",up:"Y",placement:"assembled; display clipping and explosions are not baked"}};
 const json=new TextEncoder().encode(JSON.stringify(doc)),jsonLength=Math.ceil(json.length/4)*4,total=12+8+jsonLength+8+byteLength,result=new Uint8Array(total),dv=new DataView(result.buffer);
 dv.setUint32(0,0x46546c67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);dv.setUint32(12,jsonLength,true);dv.setUint32(16,0x4e4f534a,true);result.fill(32,20,20+jsonLength);result.set(json,20);dv.setUint32(20+jsonLength,byteLength,true);dv.setUint32(24+jsonLength,0x004e4942,true);let offset=28+jsonLength;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
