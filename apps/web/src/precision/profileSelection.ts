import type {CadDocument} from "@agent-webcad/cad-document";
import {extractSketchLoops,type SketchLoop} from "./sketchProfiles";
import {profileRegionMeasurement} from "./profileRegions";
/** Shared human/MCP read of native region classification; never an edit grant. */
export function inspectProfileSelection(document:CadDocument,ids:string[]){
 const features=new Map(Object.values(document.features).map(f=>[f.output,f]));
 if(!ids.length||ids.some(id=>{const f=features.get(id);return !f||f.type!=="drawing"&&f.params.kind!=="face";}))return;
 try{
  if(ids.length>10)throw Error("Select at most 10 profile sources.");
  const result=extractSketchLoops(document,ids);if(!result.ok)throw Error(result.reason);
  const regions=result.loops.map((loop,index)=>{const holeObjectIds=(loop.holes??[]).map(h=>[...(h as SketchLoop).sourceObjectIds]),holeSources=new Set(holeObjectIds.flat());return {index,outerObjectIds:loop.sourceObjectIds.filter(id=>!holeSources.has(id)),holeObjectIds,...profileRegionMeasurement(loop,loop.workPlane)};});
  return {ok:true as const,plane:result.loops[0].workPlane,regions,regionCount:regions.length,holeCount:regions.reduce((n,r)=>n+r.holeObjectIds.length,0),areaMm2:regions.reduce((n,r)=>n+r.area,0),perimeterMm:regions.reduce((n,r)=>n+r.length,0),coordinates:"World profile mm; source IDs are explicit. Native Review validates solids."};
 }catch(error){return {ok:false as const,reason:error instanceof Error?error.message:String(error)};}
}
