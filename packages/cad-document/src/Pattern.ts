import type { CadDocument } from "./CadDocument";

type Point=[number,number];
export type CadPatternSpec=({kind:"linear";columns:number;rows:number;spacing:Point}|{kind:"radial";count:number;center:Point;angle:number}|{kind:"mirror";axisStart:Point;axisEnd:Point})&{workPlane:"XY"|"XZ"|"YZ"};
export type CadPatternInstance={id:string;sourceObjectIds:string[];sourceId:string;index:number;spec:CadPatternSpec;layerId:string};
export const MAX_PATTERN_OUTPUTS=256;
const point=(value:unknown):value is Point=>Array.isArray(value)&&value.length===2&&value.every(v=>typeof v==="number"&&Number.isFinite(v));
const integer=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=1&&Number(v)<=128;
export function patternSlots(spec:CadPatternSpec){return spec.kind==="mirror"?2:spec.kind==="radial"?spec.count:spec.columns*spec.rows;}
export function validPatternSpec(value:unknown):value is CadPatternSpec{
  if(typeof value!=="object"||!value)return false;
  const p=value as CadPatternSpec;if(!["XY","XZ","YZ"].includes(p.workPlane))return false;
  if(p.kind==="mirror")return point(p.axisStart)&&point(p.axisEnd)&&Math.hypot(p.axisEnd[0]-p.axisStart[0],p.axisEnd[1]-p.axisStart[1])>1e-6;
  if(p.kind==="radial")return integer(p.count)&&p.count>=2&&point(p.center)&&typeof p.angle==="number"&&Number.isFinite(p.angle)&&Math.abs(p.angle)>1e-6&&Math.abs(p.angle)*(p.count-1)<360-1e-6;
  return p.kind==="linear"&&integer(p.columns)&&integer(p.rows)&&p.columns*p.rows>=2&&p.columns*p.rows<=128&&point(p.spacing)&&(p.columns===1||Math.abs(p.spacing[0])>1e-6)&&(p.rows===1||Math.abs(p.spacing[1])>1e-6);
}
/** Generated drawings retain their real representation and a live recipe.
 * A complete group is required; missing members must never silently reappear. */
export function validatePatternGroups(document:CadDocument){
  const features=new Map(Object.values(document.features).map(f=>[f.output,f]));
  const groups=new Map<string,{signature:string;members:Set<string>;recipe:CadPatternInstance}>();
  for(const feature of Object.values(document.features)){
    const p=feature.pattern;if(p===undefined)continue;
    if(!p||typeof p!=="object"||typeof p.id!=="string"||!p.id.trim()||typeof p.layerId!=="string"||typeof p.sourceId!=="string"||!document.objects[feature.output])throw new Error(`Invalid pattern instance: ${feature.output}`);
    const transform=document.objects[feature.output].transform;
    if(!transform||!transform.translation.every(v=>v===0)||!transform.rotation.every(v=>v===0)||!transform.scale.every(v=>v===1)||feature.params.sketchId!==undefined)throw new Error(`Pattern instances must retain their evaluated placement: ${feature.output}`);
    if(feature.type!=="drawing"||!p.id||!Array.isArray(p.sourceObjectIds)||!p.sourceObjectIds.length||p.sourceObjectIds.length>32||new Set(p.sourceObjectIds).size!==p.sourceObjectIds.length||!p.sourceObjectIds.every(id=>typeof id==="string"&&document.objects[id])||!p.sourceObjectIds.includes(p.sourceId)||!validPatternSpec(p.spec)||!document.layers[p.layerId]||feature.dependencyMode!=="live"||feature.inputs.length!==1||feature.inputs[0]!==p.sourceId||!Number.isInteger(p.index)||p.index<1||p.index>=patternSlots(p.spec)||p.sourceObjectIds.length*(patternSlots(p.spec)-1)>MAX_PATTERN_OUTPUTS)throw new Error(`Invalid pattern instance: ${feature.output}`);
    const signature=JSON.stringify([p.sourceObjectIds,p.spec,p.layerId]);
    let group=groups.get(p.id);if(!group){group={signature,members:new Set(),recipe:p};groups.set(p.id,group);}
    const member=JSON.stringify([p.sourceId,p.index]);
    if(group.signature!==signature||group.members.has(member))throw new Error(`Inconsistent pattern: ${p.id}`);
    group.members.add(member);
    if(!p.sourceObjectIds.every(id=>features.get(id)?.type==="drawing"))throw new Error(`Missing drawing source for pattern: ${p.id}`);
    if((feature.params.workPlane??"XY")!==p.spec.workPlane||p.sourceObjectIds.some(id=>(features.get(id)!.params.workPlane??"XY")!==p.spec.workPlane))throw new Error(`Inconsistent pattern work plane: ${p.id}`);
  }
  for(const [id,group] of groups)if(group.members.size!==group.recipe.sourceObjectIds.length*(patternSlots(group.recipe.spec)-1))throw new Error(`Incomplete pattern: ${id}. Edit or delete the whole pattern.`);
  const done=new Set<string>(),visiting=new Set<string>();
  const visit=(id:string)=>{if(done.has(id))return;if(visiting.has(id))throw new Error(`Cyclic pattern dependency: ${id}`);visiting.add(id);const f=features.get(id);if(f?.pattern)visit(f.pattern.sourceId);visiting.delete(id);done.add(id);};
  for(const f of features.values())if(f.pattern)visit(f.output);
}
