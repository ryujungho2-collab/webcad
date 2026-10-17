import * as THREE from "three";
/** Buffer allocation estimate; textures include base RGBA and mip overhead. */
export function gpuPayloadBytes(roots:Iterable<THREE.Object3D>) {
  const buffers=new Set<ArrayBufferLike>(),textures=new Set<THREE.Texture>();let bytes=0;
  for(const root of roots)root.traverse(child=>{
    const mesh=child as THREE.Mesh;
    if(mesh.geometry){const attributes=[...Object.values(mesh.geometry.attributes),mesh.geometry.index].filter(Boolean);for(const attribute of attributes){const array=(attribute as THREE.BufferAttribute).array;if(array&&!buffers.has(array.buffer)){buffers.add(array.buffer);bytes+=array.buffer.byteLength;}}}
    for(const material of mesh.material?Array.isArray(mesh.material)?mesh.material:[mesh.material]:[])for(const value of Object.values(material))if(value instanceof THREE.Texture&&!textures.has(value)){textures.add(value);const image=value.image as {width?:number;height?:number}|undefined;bytes+=(image?.width??0)*(image?.height??0)*4*(value.generateMipmaps?4/3:1);}
  });return Math.ceil(bytes);
}
