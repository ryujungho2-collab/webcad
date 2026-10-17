import type {CadDocument} from "./CadDocument";
import type {CadFeature} from "./Feature";
export type ContentVec=[number,number,number];
export type SolidFinish={name:string;color:string;roughness:number;metalness:number;opacity:number};
export type ContentSlot={kind:"space";origin:ContentVec;size:ContentVec;rotationZ:number;domain:"model"|"presentation";padding:ContentVec;minimum:ContentVec;fit:"contain"|"fill"|"none"}|{kind:"opening";hostId:string;openingId:string;padding:ContentVec;minimum:ContentVec;fit:"contain"|"fill"|"none"};
export type ComponentContent={definitionId:string;overrideDefinitionId?:string;materialOverride?:SolidFinish;slot:ContentSlot};
export type ComponentDefinition={id:string;name:string;domain:"model"|"presentation";type:CadFeature["type"];params:Record<string,unknown>;min:ContentVec;size:ContentVec};
export type ArchitecturalSlab={kind:"floor"|"ceiling";sourceObjectIds:string[];level:number;thickness:number};
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export const contentId=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=200&&!["__proto__","constructor","prototype"].includes(v);
const number=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<=1e9;
const vec=(v:unknown):v is ContentVec=>Array.isArray(v)&&v.length===3&&v.every(number);
export const validSolidFinish=(v:unknown):v is SolidFinish=>record(v)&&typeof v.name==="string"&&v.name.length<=200&&/^#[0-9a-f]{6}$/i.test(v.color)&&[v.roughness,v.metalness,v.opacity].every(x=>number(x)&&x>=0&&x<=1);
export function validContentSlot(v:unknown):v is ContentSlot{return record(v)&&["contain","fill","none"].includes(v.fit)&&vec(v.padding)&&v.padding.every(x=>x>=0)&&vec(v.minimum)&&v.minimum.every(x=>x>=0)&&(v.kind==="opening"?contentId(v.hostId)&&contentId(v.openingId):v.kind==="space"&&["model","presentation"].includes(v.domain)&&vec(v.origin)&&vec(v.size)&&v.size.every((x,i)=>i===2&&v.domain==="presentation"?x===0:x>0)&&(v.domain!=="presentation"||v.padding[2]===0&&v.minimum[2]===0)&&number(v.rotationZ));}
export const validComponentContent=(v:unknown):v is ComponentContent=>record(v)&&contentId(v.definitionId)&&(v.overrideDefinitionId===undefined||contentId(v.overrideDefinitionId))&&(v.materialOverride===undefined||validSolidFinish(v.materialOverride))&&validContentSlot(v.slot);
export const validArchitecturalSlab=(v:unknown):v is ArchitecturalSlab=>record(v)&&["floor","ceiling"].includes(v.kind)&&Array.isArray(v.sourceObjectIds)&&v.sourceObjectIds.length>0&&v.sourceObjectIds.length<=2000&&v.sourceObjectIds.every(contentId)&&new Set(v.sourceObjectIds).size===v.sourceObjectIds.length&&number(v.level)&&number(v.thickness)&&v.thickness>1e-6;
export function validateArchitectureContent(d:CadDocument){
 const fail=(s:string):never=>{throw Error(`Invalid architectural content: ${s}`);};
 if(d.componentLibrary!==undefined&&(!record(d.componentLibrary)||Object.keys(d.componentLibrary).length>500))fail("library size");
 for(const [id,v] of Object.entries(d.componentLibrary??{})){
  if(!record(v)||id!==v.id||!contentId(id)||typeof v.name!=="string"||!v.name.trim()||v.name.length>200||!["model","presentation"].includes(v.domain)||!vec(v.min)||!vec(v.size)||!v.size.every((x,i)=>x>1e-6||i===2&&v.domain==="presentation"&&x===0)||!record(v.params)||v.params.componentContent||v.params.architecturalWall||v.params.architecturalSlab)fail(`definition ${id}`);
  const model=["primitive","extrude","boolean","fillet","chamfer","revolve","sweep","loft","shell"].includes(v.type);
  if(v.domain==="model"?!model:!(["drawing","drafting","image"].includes(v.type)&&v.params.workPlane==="XY"&&v.params.kind!=="block"&&(v.type!=="drafting"||v.params.kind==="text")))fail(`definition domain ${id}`);
  if(v.type==="image"&&!d.rasterAssets?.[String(v.params.assetId)])fail(`missing image asset ${id}`);
 }
 const outputs=new Map(Object.values(d.features).map(f=>[f.output,f]));
 for(const f of Object.values(d.features)){
  if(f.params.solidFinish!==undefined&&!validSolidFinish(f.params.solidFinish))fail(`finish ${f.output}`);
  if(f.params.architecturalSlab!==undefined){const s=f.params.architecturalSlab;if(!validArchitecturalSlab(s)||f.type!=="extrude"||f.dependencyMode!=="live"||JSON.stringify(f.inputs)!==JSON.stringify(s.sourceObjectIds)||s.sourceObjectIds.some(id=>!d.objects[id]||!["drawing","drafting"].includes(outputs.get(id)?.type??"")))fail(`slab ${f.output}`);}
  if(f.params.componentContent!==undefined){const c=f.params.componentContent;if(!validComponentContent(c))throw Error(`Invalid component instance ${f.output}`);const def=d.componentLibrary?.[c.overrideDefinitionId??c.definitionId];if(!d.componentLibrary?.[c.definitionId]||!def||f.type!==def.type)throw Error(`Missing component definition ${f.output}`);if(c.slot.kind==="opening"){const host=outputs.get(c.slot.hostId),w=host?.params.architecturalWall as import("./ArchitectureWall").ArchitectureWall|undefined;if(def.domain!=="model"||!w?.openings.some(o=>o.id===(c.slot as Extract<ContentSlot,{kind:"opening"}>).openingId)||JSON.stringify(f.inputs)!==JSON.stringify([c.slot.hostId]))fail(`opening host ${f.output}`);}else if(def.domain!==c.slot.domain||f.inputs.length)fail(`slot domain ${f.output}`);if(f.dependencyMode!=="live")fail(`instance mode ${f.output}`);}
 }
}




