import {measureSolidDistance} from "../cad/kernelGeometryService";
import {getObjectTransform} from "../precision/objectTransform";
import {explodedDisplayOffset} from "../precision/modelPresentation";
import {featureContract,type CadDocument} from "@agent-webcad/cad-document";
import {distanceCurves,solveCurveDistance,type DistanceMode,type GeometryDistance} from "../precision/hoverDistanceGeometry";

export type HoverDistanceRequest={sourceId:string;targetId:string;mode:DistanceMode;scope:"object"|"layer";includeLocked:boolean;tolerance?:number;visibleObjectIds?:string[];epoch?:number;signal?:AbortSignal};
export type HoverDistanceResult=GeometryDistance&{documentId:string;revision:number;epoch:number;mode:DistanceMode;units:"mm";coordinateSystem:"world";scope:"object"|"layer";layerId?:string;includeLocked:boolean;excluded:{id:string;reason:string}[];cached:boolean;boundKind?:"kernel-tolerance";brep?:import("@agent-webcad/cad-kernel").BrepDistance};
/** One bounded read-only cache per viewport; epoch also invalidates Undo/project switches at equal revisions. */
export class HoverDistanceService{
 private cache=new Map<string,HoverDistanceResult>();private stamp="";private objects:CadDocument["objects"]|undefined;
 clear(){this.cache.clear();this.stamp="";this.objects=undefined;}
 async measure(d:CadDocument,r:HoverDistanceRequest):Promise<HoverDistanceResult>{
  r.signal?.throwIfAborted();const revision=d.revision,epoch=r.epoch??0,documentId=d.id,objects=d.objects,stamp=JSON.stringify([documentId,revision,epoch]);
  if(stamp!==this.stamp||this.objects!==objects){this.cache.clear();this.stamp=stamp;this.objects=objects;}
  const key=JSON.stringify([r.sourceId,r.targetId,r.mode,r.scope,r.includeLocked,r.tolerance??null,r.visibleObjectIds?.slice().sort()??null]),hit=this.cache.get(key);if(hit){this.cache.delete(key);this.cache.set(key,hit);return structuredClone({...hit,cached:true});}
  const allowed=r.visibleObjectIds?new Set(r.visibleObjectIds):undefined;
  const visible=(id:string)=>{const o=Object.hasOwn(d.objects,id)?d.objects[id]:undefined,l=o&&d.layers[o.layerId];return (!allowed||allowed.has(id))&&!!o?.visible&&!!l?.visible&&(r.includeLocked||!l.locked);};
  if(!visible(r.sourceId)||!visible(r.targetId))throw Error("Show the source/target and enable locked layers explicitly if needed.");
  if(r.sourceId===r.targetId)throw Error("Hover a different object from the reference.");
  const feature=(id:string)=>Object.values(d.features).find(f=>f.output===id),sourceFeature=feature(r.sourceId),sourceBrep=!!sourceFeature&&featureContract(sourceFeature).representation==="brep";
  if(sourceBrep&&r.mode!=="shortest")throw Error("BRep supports shortest 3D boundary distance only; projected/axis solid distance is unavailable.");
  const operand=(id:string)=>{const f=feature(id)!;if(explodedDisplayOffset(d,id).some(n=>n!==0)||d.modelPresentation?.clipping?.enabled)throw Error("Assemble the display and disable model clipping before BRep hover measurement.");return {params:structuredClone(f.params),transform:getObjectTransform(d.objects[id],f)};};
  const source=sourceBrep?undefined:distanceCurves(d,r.sourceId),sourceOperand=sourceBrep?operand(r.sourceId):undefined,layerId=d.objects[r.targetId].layerId,ids=r.scope==="object"?[r.targetId]:Object.keys(d.objects).filter(id=>id!==r.sourceId&&d.objects[id].layerId===layerId&&visible(id)).sort();
  if(sourceBrep&&ids.length>8)throw Error("BRep layer distance supports at most 8 eligible targets; use object scope.");
  if(ids.length>32)throw Error("Layer distance supports at most 32 eligible objects. Isolate a smaller layer or use object scope.");
  const excluded:HoverDistanceResult["excluded"]=[];let best:(GeometryDistance&{brep?:import("@agent-webcad/cad-kernel").BrepDistance})|undefined,lower=Infinity,evaluations=0,allAnalytic=true;
  for(const id of ids){r.signal?.throwIfAborted();const remaining=80000-evaluations;if(remaining<=0)throw Error("Layer evaluation budget exceeded; use object scope.");try{
   const targetFeature=feature(id),targetBrep=!!targetFeature&&featureContract(targetFeature).representation==="brep";
   if(sourceBrep!==targetBrep)throw Error("Mixed finite drawing/BRep distances are unsupported. Choose two solids or two drawings.");
   const brep=sourceBrep?await measureSolidDistance(sourceOperand!,operand(id),r.tolerance??1e-6,{signal:r.signal}):undefined;
   const candidate:GeometryDistance&{brep?:typeof brep}=brep?{distance:brep.boundaryDistance,lower:Math.max(0,brep.boundaryDistance-brep.tolerance),upper:brep.boundaryDistance+brep.tolerance,accuracy:"brep",tolerance:brep.tolerance,source:{objectId:r.sourceId,elementId:brep.source.elementId,point:brep.source.point},target:{objectId:id,elementId:brep.target.elementId,point:brep.target.point},evaluations:1,brep}:await solveCurveDistance(source!,distanceCurves(d,id),r.mode,r.tolerance??.001,r.signal,Math.min(20000,remaining));evaluations+=candidate.evaluations;lower=Math.min(lower,candidate.lower);allAnalytic&&=candidate.accuracy==="analytic";if(!best||candidate.upper<best.upper)best=candidate;
  }catch(e){if(r.signal?.aborted)throw e;if(remaining<20000&&e instanceof Error&&e.message.includes("budget"))throw Error("Layer evaluation budget exceeded; use object scope.");excluded.push({id,reason:e instanceof Error?e.message:String(e)});}}
  r.signal?.throwIfAborted();if(d.revision!==revision||d.id!==documentId||d.objects!==objects||this.stamp!==stamp)throw Error("Geometry changed; hover again to measure.");
  if(!best)throw Error(excluded[0]?.reason??"No supported visible target geometry.");
  const tolerance=r.tolerance??(sourceBrep?1e-6:.001),result:HoverDistanceResult={...best,lower,evaluations,accuracy:sourceBrep?"brep":allAnalytic?"analytic":best.upper-lower<=tolerance*1.01?"bounded":"approximate",...sourceBrep?{boundKind:"kernel-tolerance" as const}:{},documentId,revision,epoch,mode:r.mode,units:"mm",coordinateSystem:"world",scope:r.scope,...r.scope==="layer"?{layerId}:{},includeLocked:r.includeLocked,excluded,cached:false};
  if(this.cache.size>=64)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,structuredClone(result));return result;
 }
}
