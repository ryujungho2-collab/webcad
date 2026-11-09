import type {CadDocument} from "./CadDocument";
import {validSpline} from "./Spline";
/** Follow known solid/profile containers, including captured Boolean operands. */
function scan(params:Record<string,unknown>,check:boolean,depth=0):boolean{
 if(depth>64)throw Error("Spline profile nesting exceeds its validation budget.");let found=false;
 if(check&&params.alignToPath!==undefined&&typeof params.alignToPath!=="boolean")throw Error("Invalid sweep orientation policy.");
 if(params.spine!==undefined&&!Array.isArray(params.spine)){const spine=params.spine as Record<string,unknown>;if(check&&(!spine||spine.kind!=="spline"||!validSpline(spine)))throw Error("Invalid exact spline sweep path.");}
 for(const profile of [params.profile,...Array.isArray(params.profiles)?params.profiles:[],...Array.isArray(params.regions)?params.regions:[]]){
  if(!profile||typeof profile!=="object")continue;const p=profile as Record<string,unknown>,segments=p.segments;
  if(Array.isArray(segments)&&segments.some(s=>s?.kind==="spline")){
   found=true;if(check&&(!Array.isArray(p.normal)||p.normal.length!==3||!p.normal.every(Number.isFinite)||Math.hypot(...p.normal)<1e-9||typeof p.id!=="string"||!p.id||segments.length!==1||!validSpline(segments[0])||typeof segments[0].topologyReference!=="string"||!segments[0].topologyReference||p.holes!==undefined&&(!Array.isArray(p.holes)||p.holes.length>10)))throw Error("Invalid exact spline profile.");
  }
  if(Array.isArray(p.holes))for(const hole of p.holes)found=scan({profile:hole},check,depth+1)||found;
 }
 const source=params.source as {params?:Record<string,unknown>}|undefined;if(source?.params)found=scan(source.params,check,depth+1)||found;
 if(Array.isArray(params.operands))for(const operand of params.operands)if(operand?.params)found=scan(operand.params,check,depth+1)||found;
 return found;
}
export function hasSplineProfiles(document:CadDocument){return Object.values(document.features).some(f=>scan(f.params,false));}
export function validFeatureSplineProfiles(params:Record<string,unknown>){try{scan(params,true);return true;}catch{return false;}}

/** Version gate for closed spline boundaries combined with holes or islands. */
export function hasSplineProfileHoles(document:CadDocument){
 const visit=(params:Record<string,unknown>,depth=0):boolean=>{
  if(depth>64)throw Error("Spline profile nesting exceeds its validation budget.");
  for(const profile of [params.profile,...Array.isArray(params.profiles)?params.profiles:[],...Array.isArray(params.regions)?params.regions:[]])if(profile&&Array.isArray(profile.holes)&&profile.holes.length&&scan({profile},false))return true;
  const source=params.source as {params?:Record<string,unknown>}|undefined;if(source?.params&&visit(source.params,depth+1))return true;
  return Array.isArray(params.operands)&&params.operands.some(o=>o?.params&&visit(o.params,depth+1));
 };return Object.values(document.features).some(f=>visit(f.params));
}

export function hasSplineSweepPaths(document:CadDocument){
 const visit=(p:Record<string,unknown>,depth=0):boolean=>{if(depth>64)throw Error("Sweep path nesting exceeds its validation budget.");if(p.spine!==undefined&&!Array.isArray(p.spine))return true;const source=p.source as {params?:Record<string,unknown>}|undefined;return !!(source?.params&&visit(source.params,depth+1)||Array.isArray(p.operands)&&p.operands.some(o=>o?.params&&visit(o.params,depth+1)));};return Object.values(document.features).some(f=>visit(f.params));
}

/** Editing policy is explicit: symmetric C1 and C2 curves can have identical poles. */
export function hasC2FitPolicy(document:CadDocument){
 const visit=(p:Record<string,unknown>,depth=0):boolean=>{if(depth>64)throw Error("C2 policy nesting exceeds its validation budget.");if(p.fitContinuity!==undefined||Array.isArray(p.segments)&&p.segments.some(s=>s?.fitContinuity!==undefined)||p.spine&&typeof p.spine==="object"&&!Array.isArray(p.spine)&&visit(p.spine as Record<string,unknown>,depth+1))return true;for(const profile of [p.profile,...Array.isArray(p.profiles)?p.profiles:[],...Array.isArray(p.regions)?p.regions:[]])if(profile&&typeof profile==="object"){if(visit(profile,depth+1))return true;const holes=(profile as Record<string,unknown>).holes;if(Array.isArray(holes)&&holes.some(h=>h&&visit(h,depth+1)))return true;}const source=p.source as {params?:Record<string,unknown>}|undefined;return !!(source?.params&&visit(source.params,depth+1)||Array.isArray(p.operands)&&p.operands.some(o=>o?.params&&visit(o.params,depth+1)));};return Object.values(document.features).some(f=>visit(f.params))||Object.values(document.blocks??{}).some(b=>b.members.some(m=>visit(m.params)));
}

export function hasSpatialCurvePolicy(document:CadDocument){
 const visit=(p:Record<string,unknown>,depth=0):boolean=>{if(depth>64)throw Error("Spatial policy nesting exceeds its validation budget.");if(p.fitSpace!==undefined||p.alignToPath!==undefined)return true;for(const key of ["profile","spine","source"]){const child=p[key] as Record<string,unknown>|undefined;if(child&&typeof child==="object"&&!Array.isArray(child)&&visit(child,depth+1))return true;}for(const key of ["segments","profiles","regions","holes","operands"])if(Array.isArray(p[key])&&(p[key] as Record<string,unknown>[]).some(child=>child&&visit(child,depth+1)))return true;const params=p.params as Record<string,unknown>|undefined;return !!params&&visit(params,depth+1);};return Object.values(document.features).some(f=>visit(f.params))||Object.values(document.blocks??{}).some(b=>b.members.some(m=>visit(m.params)));
}
