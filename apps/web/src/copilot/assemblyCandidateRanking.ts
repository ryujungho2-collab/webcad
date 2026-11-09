import type {CadDocument} from '@agent-webcad/cad-document';
import type {Candidate} from './assemblyCandidateSearch';
import {SEARCH_PART_IDS} from './assemblySearchPolicy';
export type DesignStatus='IMPROVED_WITH_REVIEW'|'NO_PROVEN_IMPROVEMENT'|'INCOMPLETE';
export type CandidateAssessment={id:string;eligible:boolean;target:'cleared'|'reduced'|'unchanged'|'worse'|'unknown';measuredReduction?:number;otherWorse:boolean;contactLoss:boolean;anchorChanges:number;intentReview:boolean;comparisonTolerance:number;changes:{angle:number;pair:string[];kind:string;before?:number;after?:number;tolerance:number;method:string;relativeMotion?:string}[]};
export type NativeRanking={status:DesignStatus;preferred:'baseline'|'review-candidates';recommendedIds:string[];comparisonIds:string[];order:string[];assessments:CandidateAssessment[];message:string};
const pairKey=(pair:readonly string[])=>JSON.stringify([...pair].sort());
const targetPair=(pair:string[])=>pair.includes('stand-support')&&pair.includes('stand-plate');
const known=(c?:Candidate)=>!!c&&c.hardValid&&c.complete&&c.motion?.state==='finished'&&c.motion.rows.length===45&&c.motion.request.partIds.length===6&&SEARCH_PART_IDS.every(id=>c.motion!.request.partIds.includes(id))&&c.motion.rows.every(r=>!['unknown','unsupported'].includes(r.baseStatus))&&(c.id==='c0'||!!(c.placement?.preservation.geometry&&c.placement.preservation.relationsAndAngles&&c.placement.preservation.nonTargetPoses));
/** Rank measured facts only. AABB clearance stays qualitative; it is never a numeric Common=0. */
export function rankNativeCandidates(source:CadDocument,candidates:Candidate[]):NativeRanking{
 const baseline=candidates[0],assessments:CandidateAssessment[]=[];
 for(const c of candidates.slice(1)){
  const a:CandidateAssessment={id:c.id,eligible:!!(known(baseline)&&known(c)),target:'unknown',otherWorse:false,contactLoss:false,anchorChanges:c.placement?.anchors.filter(x=>x.changed).length??0,intentReview:!!c.placement?.requiresIntentReview,comparisonTolerance:1e-6,changes:[]};
  // Recompute comparative facts, including after appending a second batch.
  c.facts=c.facts.filter(f=>['COMPLETE','UNKNOWN','ANCHOR_CHANGED','INTENT_REVIEW'].includes(f));c.risks=c.risks.filter(r=>['world-anchor-change','design-intent-reconfirmation','unknown/unsupported/incomplete','hard-constraint-rejected','incomplete-evaluation','baseline-incomplete'].includes(r));
  let reduced=0,cleared=0,worse=0,targetCount=0;const gains:number[]=[];
  for(const row of c.motion?.rows??[]){
   const old=baseline?.motion?.rows.find(r=>r.angle===row.angle&&pairKey(r.pair)===pairKey(row.pair));if(!old){a.eligible=false;continue;}
   const target=targetPair(row.pair),tol=Math.max(1e-6,old.volumeTolerance??0,row.volumeTolerance??0),intent=source.interferenceIntents?.[pairKey(row.pair)]?.intent;
   a.comparisonTolerance=Math.max(a.comparisonTolerance,tol);
   const numeric=old.commonVolume!==undefined&&row.commonVolume!==undefined,delta=numeric?old.commonVolume!-row.commonVolume!:undefined;
   const grows=row.baseStatus==='penetration'&&(old.baseStatus!=='penetration'||delta!==undefined&&delta < -tol);
   const clears=old.baseStatus==='penetration'&&row.baseStatus==='no-penetration';
   if(target){targetCount++;if(grows)worse++;if(clears)cleared++;else if(delta!==undefined&&delta>tol)reduced++;if(delta!==undefined)gains.push(delta);}
   if(!target&&grows){a.otherWorse=true;c.facts.push('OTHER_PAIR_WORSE');c.risks.push((old.baseStatus==='penetration'?'worsened':'new')+'-major-pair-penetration:'+row.pair.join('/'));a.changes.push({angle:row.angle,pair:row.pair,kind:'OTHER_PAIR_WORSE',before:old.commonVolume,after:row.commonVolume,tolerance:tol,method:row.method,relativeMotion:row.relativeMotion});}
   // Removing explicitly forbidden target overlap is a goal, not evidence of a mount to preserve.
   const mount=old.baseStatus==='penetration'&&(!target||intent!=='forbidden-interference');
   if((old.baseStatus==='contact'&&row.baseStatus==='no-penetration')||(mount&&['contact','no-penetration'].includes(row.baseStatus))){a.contactLoss=true;c.facts.push('CONTACT_LOSS_RISK');c.risks.push('original-contact-or-mount-overlap-lost:'+row.pair.join('/'));a.changes.push({angle:row.angle,pair:row.pair,kind:'CONTACT_LOSS_RISK',before:old.commonVolume,after:row.commonVolume,tolerance:tol,method:row.method,relativeMotion:row.relativeMotion});}
   if((intent==='intentional-overlap'&&['contact','no-penetration'].includes(row.baseStatus))||(intent==='intended-contact'&&['penetration','no-penetration'].includes(row.baseStatus))||(intent==='forbidden-interference'&&row.baseStatus==='penetration')){c.facts.push('INTENT_MEASUREMENT_MISMATCH');c.risks.push('intent-measurement-mismatch:'+row.pair.join('/'));}
  }
  if(a.eligible&&targetCount===3){a.target=worse?'worse':cleared===3?'cleared':reduced+cleared>0?'reduced':'unchanged';if(gains.length===3)a.measuredReduction=Math.min(...gains);}
  else a.eligible=false;
  if(a.target==='cleared')c.facts.push('TARGET_NOT_DETECTED');if(a.target==='reduced')c.facts.push('MEASURED_VOLUME_LOWER');if(a.target==='unchanged')c.facts.push('NO_MEASURED_REDUCTION');
  c.facts=[...new Set(c.facts)];c.risks=[...new Set(c.risks)];assessments.push(a);
 }
 const tier={cleared:0,reduced:1,unchanged:2,worse:3,unknown:4},byId=(id:string)=>candidates.find(c=>c.id===id)!;
 const ordered=assessments.filter(a=>a.eligible).sort((a,b)=>tier[a.target]-tier[b.target]||Number(a.otherWorse)-Number(b.otherWorse)||Number(a.contactLoss)-Number(b.contactLoss)||((a.target==='reduced'&&b.target==='reduced')?Math.abs((b.measuredReduction??0)-(a.measuredReduction??0))>Math.max(a.comparisonTolerance,b.comparisonTolerance)?(b.measuredReduction??0)-(a.measuredReduction??0):0:0)||byId(a.id).movement-byId(b.id).movement||a.anchorChanges-b.anchorChanges||Number(a.intentReview)-Number(b.intentReview)||a.id.localeCompare(b.id));
 const incomplete=!known(baseline)||candidates.some(c=>c.risks.includes('incomplete-evaluation')||c.error&&!c.risks.includes('hard-constraint-rejected')||c.hardValid&&!c.complete)||assessments.some(a=>!a.eligible&&byId(a.id).hardValid);
 const improved=ordered.filter(a=>['cleared','reduced'].includes(a.target)&&!a.otherWorse&&!a.contactLoss);
 const status:DesignStatus=incomplete?'INCOMPLETE':improved.length?'IMPROVED_WITH_REVIEW':'NO_PROVEN_IMPROVEMENT';
 const recommendations=status==='IMPROVED_WITH_REVIEW'?improved.slice(0,3).map(a=>a.id):[];
 return {status,preferred:recommendations.length?'review-candidates':'baseline',recommendedIds:recommendations,comparisonIds:(recommendations.length?recommendations:ordered.slice(0,3).map(a=>a.id)),order:ordered.map(a=>a.id),assessments,message:status==='NO_PROVEN_IMPROVEMENT'?'검사한 후보 범위에서 개선안이 확인되지 않았습니다.':status==='INCOMPLETE'?'검사가 불완전하여 우열을 판정할 수 없습니다. 원본을 유지합니다.':'검사 범위에서 개선됐지만 체결 적합성 및 설계 의도 승인이 남아 있습니다.'};
}
