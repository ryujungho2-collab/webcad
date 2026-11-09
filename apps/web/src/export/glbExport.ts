import type {CadDocument,SolidFinish} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {getObjectTransform} from "../precision/objectTransform";
import {EXPORTABLE_SOLID_TYPES,assertResolvedFaceSource,meshForFeature} from "./exportModel";
import {encodeGlb,type GlbPart} from "./glbWriter";

export async function collectGlbParts(document:CadDocument=cadDocument,objectIds?:string[],onProgress?:(done:number,total:number)=>void):Promise<GlbPart[]>{
 // Capture before awaiting the worker so one export cannot mix two document revisions.
 const d=structuredClone(document),features=new Map(Object.values(d.features).map(f=>[f.output,f])),ids=objectIds?.length?[...new Set(objectIds)]:d.rootObjects;
 const selected=ids.filter(id=>{const o=d.objects[id],f=features.get(id);return o?.visible&&d.layers[o.layerId]?.visible!==false&&f&&EXPORTABLE_SOLID_TYPES.includes(f.type);});
 const geometries=new Map<string,GlbPart["mesh"]>(),parts:GlbPart[]=[];
 for(const id of selected){const o=d.objects[id],f=features.get(id)!;assertResolvedFaceSource(f,d);
  const params=structuredClone(f.params);delete params.solidFinish;const geometryKey=JSON.stringify([f.type,params]);let mesh=geometries.get(geometryKey);if(!mesh){mesh=await meshForFeature({...f,params});geometries.set(geometryKey,mesh);}
  const finish=f.params.solidFinish as SolidFinish|undefined;
  parts.push({id,name:o.name,layerId:o.layerId,geometryKey,mesh,transform:getObjectTransform(o,f),finish:finish??{name:"CAD default",color:d.layers[o.layerId]?.style?.color??"#c6ccd3",roughness:.65,metalness:.1,opacity:1}});onProgress?.(parts.length,selected.length);
 }
 return parts;
}
export async function exportGlbBytes(objectIds?:string[],document:CadDocument=cadDocument){return encodeGlb(await collectGlbParts(document,objectIds));}
