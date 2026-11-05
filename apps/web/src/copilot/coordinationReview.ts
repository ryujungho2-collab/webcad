import {featureContract, interferencePairKey, type CadDocument} from '@agent-webcad/cad-document';
import {measureSolidDistance} from '../cad/kernelGeometryService';
import {getObjectTransform} from '../precision/objectTransform';
import {documentVersion} from '../state/documentSession';
import {cadModelReferenceIssue} from './cadModelingTools';

export type ClearanceRequirement={objectIds:[string,string];minimumClearanceMm:number;purpose:string};
export type CoordinationRequest={pairs:ClearanceRequirement[];viewIds:string[]};
export type ReviewFinding={id:string;status:'pass'|'fail'|'unknown';code:string;objectIds:string[];viewId?:string;message:string;action:string};
export type ClearanceFinding=ReviewFinding&{requirement:ClearanceRequirement;distanceMm?:number;commonVolumeMm3?:number;volumeToleranceMm3?:number;relationship?:string;intent?:unknown};
export type CoordinationReport={version:ReturnType<typeof documentVersion>;capturedAt:string;decision:'issues-found'|'incomplete';request:CoordinationRequest;pairs:ClearanceFinding[];drawings:ReviewFinding[];coverage:{requestedPairs:number;measuredPairs:number;unknownPairs:number;requestedViews:number;totalViews:number;visibleSolids:number;scopedSolids:number};unverified:string[]};
const TOLERANCE=1e-6;
export function validateCoordinationRequest(r:CoordinationRequest){
 if(!r||!Array.isArray(r.pairs)||r.pairs.length>24||!Array.isArray(r.viewIds)||r.viewIds.length>32||new Set(r.viewIds).size!==r.viewIds.length||r.viewIds.some(id=>typeof id!=='string'||!id||id.length>200))throw Error('Specify at most 24 pairs and 32 unique drawing IDs.');
 const keys=new Set<string>();for(const p of r.pairs){if(!p||!Array.isArray(p.objectIds)||p.objectIds.length!==2||p.objectIds[0]===p.objectIds[1]||p.objectIds.some(id=>typeof id!=='string'||!id||id.length>200)||!Number.isFinite(p.minimumClearanceMm)||p.minimumClearanceMm<0||p.minimumClearanceMm>1e6||typeof p.purpose!=='string'||!p.purpose.trim()||p.purpose.length>200)throw Error('Each pair needs two distinct IDs, an explicit nonnegative clearance in mm and a review purpose.');const key=interferencePairKey(p.objectIds);if(keys.has(key))throw Error('Duplicate review pair.');keys.add(key);}
}

/** Inventory checks, not a claim that present annotations are sufficient construction dimensions. */
export function reviewDrawingReadiness(d:CadDocument,viewIds:string[]):ReviewFinding[]{
 const findings:ReviewFinding[]=[],p=d.modelPresentation,features=Object.values(d.features);
 const add=(viewId:string,code:string,status:ReviewFinding['status'],message:string,action:string,objectIds:string[]=[])=>findings.push({id:JSON.stringify([viewId,code,objectIds]),viewId,code,status,message,action,objectIds});
 for(const id of viewIds){const v=p?.sections?.[id]??p?.projections[id];if(!v){add(id,'missing-view','fail','Requested drawing is missing.','Restore or explicitly replace the required drawing.');continue;}
  const missing=v.partIds.filter(partId=>!p?.parts[partId]||!d.objects[p.parts[partId].objectId]);
  add(id,'drawing-source',missing.length||v.status!=='resolved'?'fail':'pass',missing.length?`Missing source parts: ${missing.join(', ')}`:v.status!=='resolved'?(v.reason??'Drawing is stale.'):'Drawing source references are resolved.','Repair sources and refresh this drawing.',missing.flatMap(key=>p?.parts[key]?[p.parts[key].objectId]:[]));
  const outputs=Object.values(v.outputs),absent=outputs.filter(o=>!d.objects[o.objectId]);
  add(id,'drawing-output',!outputs.length?'unknown':absent.length?'fail':'pass',!outputs.length?'Drawing has no generated cut/projection geometry.':absent.length?'Generated drawing geometry is missing.':'Generated drawing objects exist.','Check cut location and regenerate missing output.',absent.map(o=>o.objectId));
  const dimensions=features.filter(f=>f.type==='dimension'&&(f.params.modelDrawingReference as {viewId?:string}|undefined)?.viewId===id);
  const current=dimensions.filter(f=>f.params.referenceStatus==='resolved'&&d.objects[f.output]?.visible&&d.layers[d.objects[f.output].layerId]?.visible);
  add(id,'associated-dimensions',!dimensions.length?'unknown':current.length!==dimensions.length?'fail':'pass',`${current.length} visible resolved associated dimensions / ${dimensions.length} associated dimensions. Presence does not prove dimensional completeness; static annotations are not counted.`,'Add and review associated overall, opening, level and detail dimensions appropriate to this drawing.',dimensions.filter(f=>!current.includes(f)).map(f=>f.output));
  const sheets=Object.values(p?.sheets??{}).filter(s=>Object.hasOwn(s.placements,id));
  const usable=sheets.filter(s=>d.artboards?.[s.artboardId]?.visible&&Number.isFinite(s.denominator)&&s.denominator>0&&Math.abs(v.scale-1/s.denominator)<1e-8&&d.objects[s.titleId]);
  add(id,'sheet-placement',!sheets.length?'unknown':usable.length!==sheets.length?'fail':'pass',!sheets.length?'No native model-sheet placement for this drawing.':usable.length!==sheets.length?'Sheet board, title or drawing scale needs repair.':'Native sheet placement, title and scale are present.','Place the view on a native model sheet, then run Output preflight.');
 }
 return findings;
}

/** Exact static BRep pairs. Explicit requirements and unchecked scope travel with every result. */
export async function inspectCoordination(d:CadDocument,request:CoordinationRequest,options:{signal?:AbortSignal;assertCurrent?:()=>void;measure?:typeof measureSolidDistance;totalMs?:number}={}):Promise<CoordinationReport>{
 validateCoordinationRequest(request);const source=d,version=documentVersion(source),current=()=>{options.signal?.throwIfAborted();options.assertCurrent?.();if(JSON.stringify(documentVersion(source))!==JSON.stringify(version))throw Error('The CAD context changed. Recheck coordination.');};current();d=structuredClone(d);const r=structuredClone(request),features=new Map(Object.values(d.features).map(f=>[f.output,f])),measure=options.measure??measureSolidDistance;
 const report:CoordinationReport={version:documentVersion(d),capturedAt:new Date().toISOString(),decision:'incomplete',request:r,pairs:[],drawings:reviewDrawingReadiness(d,r.viewIds),coverage:{requestedPairs:r.pairs.length,measuredPairs:0,unknownPairs:0,requestedViews:r.viewIds.length,totalViews:Object.keys(d.modelPresentation?.sections??{}).length+Object.keys(d.modelPresentation?.projections??{}).length,visibleSolids:Object.values(d.objects).filter(o=>o.visible&&d.layers[o.layerId]?.visible&&features.has(o.id)&&featureContract(features.get(o.id)!).representation==='brep').length,scopedSolids:new Set(r.pairs.flatMap(p=>p.objectIds)).size},unverified:[
  'Only explicitly requested static pairs and drawing IDs were inspected; no whole-model or continuous-motion clearance claim.',
  'Minimum distances are project inputs, not statutory thresholds. Usable routes, door sweeps and stair headroom require dedicated envelopes/routes.',
  'Construction dimensions, wall/window/floor junctions, fasteners, tolerances, waterproofing, drainage, thermal continuity and maintenance access need detail review.',
  'Structural, MEP, fire/accessibility, site/code requirements, professional sign-off and aesthetic quality are not verified.',
  'Recheck after edits or reopening; this report is evidence for the captured document version, not an issuance approval.'
 ]};
 const start=performance.now(),budget=Math.min(30000,Math.max(1,options.totalMs??30000));
 for(const requirement of r.pairs){current();
  const row:ClearanceFinding={id:interferencePairKey(requirement.objectIds),code:'clearance',status:'unknown',objectIds:[...requirement.objectIds],requirement,message:'Not measured.',action:'Inspect the named parts, revise their source geometry or the documented requirement, then recheck.',intent:structuredClone(d.interferenceIntents?.[interferencePairKey(requirement.objectIds)])};report.pairs.push(row);
  if(performance.now()-start>=budget){row.message='Review time budget exhausted; pair remains unchecked.';continue;}
  const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});const deadline=setTimeout(abort,Math.min(8000,budget-(performance.now()-start)));
  try{
   const operands=requirement.objectIds.map(id=>{const o=d.objects[id],f=features.get(id);if(!o||!f)throw Error(`Missing object ${id}.`);if(featureContract(f).representation!=='brep')throw Error(`Unsupported solid representation: ${id}.`);const issue=cadModelReferenceIssue(d,id,features);if(issue)throw Error(issue);const transform=getObjectTransform(o,f);if(transform.scale.some(s=>Math.abs(s-1)>1e-8))throw Error(`Non-unit scale is unsupported: ${id}.`);return {params:f.params,transform};});
   const m=await measure(operands[0],operands[1],TOLERANCE,{signal:controller.signal});controller.signal.throwIfAborted();
   row.distanceMm=m.boundaryDistance;row.commonVolumeMm3=m.commonVolume;row.volumeToleranceMm3=m.volumeTolerance;row.relationship=m.relationship;
   if(m.classificationError||m.relationship==='indeterminate'||!Number.isFinite(m.commonVolume)||!Number.isFinite(m.boundaryDistance)||!Number.isFinite(m.volumeTolerance))throw Error(m.classificationError??'Indeterminate BRep relationship.');
   report.coverage.measuredPairs++;
   // Containment can have a positive boundary distance: Common volume takes precedence.
   const penetration=m.commonVolume!>m.volumeTolerance,short=m.boundaryDistance+TOLERANCE<requirement.minimumClearanceMm;
   row.status=penetration||short?'fail':'pass';row.message=penetration?`Solid overlap ${m.commonVolume} mm³ exceeds volume tolerance ${m.volumeTolerance} mm³.`:`Boundary gap ${m.boundaryDistance} mm; required ≥ ${requirement.minimumClearanceMm} mm.`;
   if(row.intent)row.message+=' Existing design intent is retained for review; it does not suppress the measured result.';
  }catch(e){row.status='unknown';row.message=(controller.signal.aborted?'Measurement timed out or was cancelled.':e instanceof Error?e.message:String(e)).slice(0,600);}
  finally{clearTimeout(deadline);options.signal?.removeEventListener('abort',abort);}
  current();
 }
 report.coverage.unknownPairs=report.pairs.filter(p=>p.status==='unknown').length;
 report.decision=[...report.pairs,...report.drawings].some(p=>p.status==='fail')?'issues-found':'incomplete';
 current();return report;
}
