import {SEARCH_LATTICE,SEARCH_PART_IDS,axisCoverage} from './assemblySearchPolicy';
import {rankNativeCandidates,type NativeRanking} from './assemblyCandidateRanking';
import {type CadDocument,type CadObjectTransform} from '@agent-webcad/cad-document';
import type {CadCommand} from '@agent-webcad/cad-commands';
import {createCadToolSession,type CadToolReadResult} from './cadToolSession';
import {copilotRequest,requestCopilotResponse} from './copilotConnection';
import {modelReadEvidence} from './copilotTaskScope';
import {validateCadToolCalls} from './cadToolContract';
import {prepareCadCommand} from '../state/dispatchCadCommand';
import {inspectAssemblyMotion,motionPose,type MotionReport} from '../state/assemblyMotion';
import {inspectAssemblyPlacement,assemblyMatrix,assertAssemblyPose} from '../state/assemblyCommands';
import {documentVersion} from '../state/documentSession';
import {inspectSolid,measureSolidDistance,projectKernelMetrics} from '../cad/kernelGeometryService';
import {cadDocument} from '../state/cadDocument';
import {previewCadCommand,discardCadPlan} from '../state/documentPlans';

export const SEARCH_BUDGET={candidates:6,modelCalls:8,kernelCalls:240,totalMs:120000,inputBytes:8*1024*1024,min:[-15,-15,-15],max:[15,15,15],maxTranslation:20} as const;
export const SEARCH_TARGET='stand-support',SEARCH_PAIR=['stand-support','stand-plate'],SEARCH_PARTS=SEARCH_PART_IDS;
export type SearchProposal={tool:'assembly.part.place';objectId:'stand-support';descendantPolicy:'preserve-descendant-world';min:number[];max:number[];offsets:number[][];rationale:string};
export type Candidate={id:string;offset:number[];movement:number;pose:CadObjectTransform;command?:Extract<CadCommand,{type:'assembly-part-place'}>;hardValid:boolean;complete:boolean;error?:string;motion?:MotionReport;placement?:ReturnType<typeof inspectAssemblyPlacement>;risks:string[];facts:string[];elapsedMs:number};
export type SearchResult={version:ReturnType<typeof documentVersion>;proposal:SearchProposal;candidates:Candidate[];comparison:{candidateId:string;reasons:string[]}[];reads:{actor:'model';call:unknown;result:CadToolReadResult}[];runs:any[];events:any[];kernelCalls:number;elapsedMs:number;sourceUnchanged:boolean;state:'finished'|'partial';reason?:string;ranking:NativeRanking;coverage:boolean[];selectionSource:'model';warning:string};
const vector=(v:any)=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const sameMatrix=(a:CadObjectTransform,b:CadObjectTransform)=>assemblyMatrix(a).elements.every((v,i)=>Math.abs(v-assemblyMatrix(b).elements[i])<1e-7);
export function validateSearchProposal(p:any,policy:{coverage?:boolean;lattice?:boolean}={coverage:true,lattice:true}):asserts p is SearchProposal{
 if(!p||p.tool!=='assembly.part.place'||p.objectId!==SEARCH_TARGET||p.descendantPolicy!=='preserve-descendant-world'||!vector(p.min)||!vector(p.max)||!Array.isArray(p.offsets)||p.offsets.length<1||p.offsets.length>5||typeof p.rationale!=='string'||p.rationale.length>700)throw Error('Invalid bounded placement search proposal.');
 if(p.min.some((n:number,i:number)=>n<SEARCH_BUDGET.min[i]||n>0)||p.max.some((n:number,i:number)=>n>SEARCH_BUDGET.max[i]||n<0))throw Error('Search envelope exceeds native limits.');
 const seen=new Set<string>();for(const o of p.offsets){if(!vector(o)||o.some((n:number,i:number)=>n<p.min[i]||n>p.max[i])||Math.hypot(...o)>SEARCH_BUDGET.maxTranslation||Math.hypot(...o)<1e-7||seen.has(JSON.stringify(o)))throw Error('Duplicate/no-op/out-of-bounds candidate offset.');seen.add(JSON.stringify(o));if(policy.lattice!==false&&!SEARCH_LATTICE.some(v=>JSON.stringify(v)===JSON.stringify(o)))throw Error('Candidate outside finite lattice.');}
 if(policy.coverage!==false&&!axisCoverage(p.offsets).every(Boolean))throw Error('COVERAGE_REQUIRED: include X, Y and Z at least once.');
}
export function candidateCommand(source:CadDocument,offset:number[]){
 if(!vector(offset)||offset.some((n,i)=>n<SEARCH_BUDGET.min[i]||n>SEARCH_BUDGET.max[i])||Math.hypot(...offset)>SEARCH_BUDGET.maxTranslation)throw Error('Candidate outside predeclared translation envelope.');
 const t=source.objects[SEARCH_TARGET]?.transform;if(!t)throw Error('Pilot requires the selected support with an explicit world pose.');
 return {type:'assembly-part-place' as const,objectId:SEARCH_TARGET,descendantPolicy:'preserve-descendant-world' as const,targetWorldPose:{translation:t.translation.map((n,i)=>n+offset[i]) as [number,number,number],rotation:[...t.rotation] as [number,number,number],scale:[1,1,1] as [number,number,number]}};
}
/** Hard constraints compare actual detached documents, never model confidence. */
export function assertSearchConstraints(source:CadDocument,proposed:CadDocument){
 assertAssemblyPose(source);assertAssemblyPose(proposed);
 if(JSON.stringify(source.features)!==JSON.stringify(proposed.features)||JSON.stringify(source.interferenceIntents)!==JSON.stringify(proposed.interferenceIntents))throw Error('Hard constraint: geometry/dimensions/intent changed.');
 if(JSON.stringify(source.assembly?.joints.bearing)!==JSON.stringify(proposed.assembly?.joints.bearing))throw Error('Hard constraint: bearing origin/axis/angle/Rest changed.');
 if(JSON.stringify(Object.keys(source.objects).sort())!==JSON.stringify(Object.keys(proposed.objects).sort()))throw Error('Hard constraint: object identities changed.');
 for(const id of Object.keys(source.objects))if(id!==SEARCH_TARGET&&!sameMatrix(source.objects[id].transform??{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},proposed.objects[id].transform??{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}))throw Error('Hard constraint: non-target world pose changed: '+id);
 const a=source.objects[SEARCH_TARGET].transform!,b=proposed.objects[SEARCH_TARGET].transform!;
 if(!sameMatrix({...a,translation:[0,0,0]},{...b,translation:[0,0,0]}))throw Error('Hard constraint: support rotation/scale changed.');
 const joints=source.assembly!.joints;if(JSON.stringify(Object.keys(joints).sort())!==JSON.stringify(Object.keys(proposed.assembly!.joints).sort()))throw Error('Hard constraint: Joint graph changed.');
 for(const [id,j] of Object.entries(joints)){const n=proposed.assembly!.joints[id],{rest:_,...x}=j,{rest:__,...y}=n;if(JSON.stringify(x)!==JSON.stringify(y))throw Error('Hard constraint: Joint relation or state changed.');if(j.childId!==SEARCH_TARGET&&j.parentId!==SEARCH_TARGET&&JSON.stringify(j.rest)!==JSON.stringify(n.rest))throw Error('Hard constraint: unspecified Rest changed.');}
 for(const angle of [0,90,180]){const request={jointId:'bearing',start:0,end:180,step:90,partIds:SEARCH_PAIR,exceptions:[] as [string,string][],tolerance:1e-6},a=motionPose(source,request,angle),b=motionPose(proposed,request,angle);for(const id of Object.keys(source.objects))if(id!==SEARCH_TARGET&&!sameMatrix(a.objects[id].transform!,b.objects[id].transform!))throw Error('Hard constraint: non-target moved at a sampled angle.');}
}
export async function evaluatePlacementCandidates(source:CadDocument,proposal:SearchProposal,options:{signal:AbortSignal;isCurrent:()=>boolean;remainingKernelCalls?:number;totalMs?:number;onEvent?:(event:any)=>void;existing?:Candidate[];regressionOnly?:boolean}){
 validateSearchProposal(proposal,options.regressionOnly?{coverage:false,lattice:false}:undefined);const start=performance.now(),before=JSON.stringify(source),snapshot=structuredClone(source),candidates:Candidate[]=structuredClone(options.existing??[]);let calls=0;
 if(before.length*2>SEARCH_BUDGET.inputBytes)throw Error('Search document exceeds input budget.');
 const check=()=>{options.signal.throwIfAborted();if(!options.isCurrent())throw Error('Stale search context.');if(performance.now()-start>Math.min(options.totalMs??SEARCH_BUDGET.totalMs,SEARCH_BUDGET.totalMs))throw Error('Integrated search deadline exceeded.');};
 const max=Math.min(options.remainingKernelCalls??SEARCH_BUDGET.kernelCalls,SEARCH_BUDGET.kernelCalls);
 const count=()=>{check();if(calls>=max)throw Error('Integrated search kernel budget exhausted.');calls++;};
 const dependencies={inspect:((...args:any[])=>{count();return (inspectSolid as any)(...args);}) as typeof inspectSolid,distance:((...args:any[])=>{count();return (measureSolidDistance as any)(...args);}) as typeof measureSolidDistance,metrics:projectKernelMetrics};
 for(const [index,offset] of [[0,0,0],...proposal.offsets].entries()){
  if(index<(options.existing?.length??0))continue;
  const at=performance.now(),command=index?candidateCommand(snapshot,offset):undefined,pose=command?.targetWorldPose??structuredClone(snapshot.objects[SEARCH_TARGET].transform!);const c:Candidate={id:`c${index}`,offset,movement:Math.hypot(...offset),pose,command,hardValid:false,complete:false,risks:[],facts:[],elapsedMs:0};candidates.push(c);
  try{check();if(command&&calls+Object.keys(snapshot.objects).length>max)throw Error('Insufficient integrated budget for native command validation.');const prepStart=projectKernelMetrics().submittedTasks;const prepared=command?await prepareCadCommand(snapshot,command,{signal:options.signal}):undefined;calls+=projectKernelMetrics().submittedTasks-prepStart;check();if(calls>max)throw Error('Integrated search kernel budget exhausted.');if(prepared&&!prepared.result.ok)throw Error(prepared.result.reason);const doc=prepared?.proposed??snapshot;assertSearchConstraints(snapshot,doc);c.hardValid=true;if(command)c.placement=inspectAssemblyPlacement(snapshot,command);
   c.motion=await inspectAssemblyMotion(doc,{jointId:'bearing',start:0,end:180,step:90,partIds:SEARCH_PARTS,exceptions:[],tolerance:1e-6},{signal:options.signal,isCurrent:options.isCurrent,dependencies,totalMs:Math.max(1,Math.min(30000,(options.totalMs??SEARCH_BUDGET.totalMs)-(performance.now()-start)))});check();c.complete=c.motion.state==='finished'&&c.motion.samplingFinished&&c.motion.rows.every(r=>!['unknown','unsupported'].includes(r.baseStatus));c.facts.push(c.complete?'COMPLETE':'UNKNOWN');if(!c.complete)c.risks.push('unknown/unsupported/incomplete');if(c.placement?.anchors.some(a=>a.changed)){c.risks.push('world-anchor-change');c.facts.push('ANCHOR_CHANGED');}if(c.placement?.requiresIntentReview){c.risks.push('design-intent-reconfirmation');c.facts.push('INTENT_REVIEW');}
  }catch(error){c.error=String(error);if(options.signal.aborted||!options.isCurrent()||/budget|deadline|Insufficient|kernel/i.test(c.error))c.risks.push('incomplete-evaluation');else if(!c.hardValid)c.risks.push('hard-constraint-rejected');else c.risks.push('incomplete-evaluation');}
  c.elapsedMs=performance.now()-at;options.onEvent?.({actor:'native-evaluator',candidateId:c.id,kernelCalls:calls,elapsedMs:c.elapsedMs,error:c.error,hardValid:c.hardValid,complete:c.complete});
  if(options.signal.aborted||!options.isCurrent())break;
 }
 const ranking=rankNativeCandidates(snapshot,candidates);
 if(JSON.stringify(source)!==before)throw Error('Search mutated its source.');return {candidates,ranking,kernelCalls:calls,elapsedMs:performance.now()-start};
}
export function boundedCandidateEvidence(candidates:Candidate[]){return candidates.map(c=>({id:c.id,offset:c.offset,movement:c.movement,hardValid:c.hardValid,complete:c.complete,facts:c.facts,risks:c.risks,error:c.error,observations:c.motion?.rows.filter(r=>SEARCH_PAIR.every(id=>r.pair.includes(id))).map(r=>({angle:r.angle,pair:r.pair,status:r.baseStatus,method:r.method,...r.commonVolume===undefined?{}:{measuredCommon:r.commonVolume},...r.distance===undefined?{}:{distance:r.distance}}))}));}
export function validateCandidateComparison(value:any,candidates:Candidate[],ranking?:NativeRanking){
 if(value?.version!==1||!Array.isArray(value.comparison)||value.comparison.length<0||value.comparison.length>3)throw Error('Invalid bounded comparison.');if(ranking&&JSON.stringify(value.comparison.map((x:any)=>x.candidateId))!==JSON.stringify(ranking.comparisonIds))throw Error('Native order cannot be changed by model.');const seen=new Set<string>();
 for(const item of value.comparison){const c=candidates.find(c=>c.id===item.candidateId);if(!c||c.id==='c0'||!c.hardValid||!c.complete||seen.has(c.id)||!Array.isArray(item.reasons)||!item.reasons.length||item.reasons.some((reason:string)=>!['NO_PROVEN_SUPERIORITY','NATIVE_ORDER','USER_DECISION_REQUIRED'].includes(reason)&&!c.facts.includes(reason)))throw Error('Comparison cites an invalid candidate or an unmeasured finding.');seen.add(c.id);}return value.comparison as {candidateId:string;reasons:string[]}[];
}
/** Existing Gateway and captured ToolSession, with separate proposal/evaluation/comparison stages. */
export async function runAssemblyCandidateSearch(options:{endpoint:string;baseUrl:string;model:string;signal:AbortSignal;isCurrent:()=>boolean;fetcher?:typeof fetch;onEvent?:(event:any)=>void}):Promise<SearchResult>{
 const start=performance.now(),version=documentVersion(),source=structuredClone(cadDocument),before=JSON.stringify(cadDocument),controller=new AbortController(),relay=()=>controller.abort(options.signal.reason),deadline=setTimeout(()=>controller.abort(Error('Integrated search deadline exceeded.')),SEARCH_BUDGET.totalMs);options.signal.addEventListener('abort',relay,{once:true});
 const reads:SearchResult['reads']=[],runs:any[]=[],events:any[]=[],seen=new Set<string>(),seenReads=new Set<string>();let modelCalls=0,readCalls=0,readKernel=0,nativeKernel=0,candidates:Candidate[]=[],comparison:SearchResult['comparison']=[];
 let proposal:SearchProposal={tool:'assembly.part.place',objectId:SEARCH_TARGET,descendantPolicy:'preserve-descendant-world',min:[-15,-15,-15],max:[15,15,15],offsets:[],rationale:''};
 const check=()=>{options.signal.throwIfAborted();controller.signal.throwIfAborted();if(!options.isCurrent()||JSON.stringify(documentVersion())!==JSON.stringify(version)||JSON.stringify(cadDocument)!==before)throw Error('Stale search context.');};
 const emit=(e:any)=>{events.push(e);options.onEvent?.(e);};
 const result=(reason?:string):SearchResult=>{const ranking=rankNativeCandidates(source,candidates);if(reason){ranking.status='INCOMPLETE';ranking.preferred='baseline';ranking.recommendedIds=[];ranking.message='검사가 불완전하여 우열을 판정할 수 없습니다. 원본을 유지합니다.';}return {version,proposal,candidates,comparison,reads,runs,events,kernelCalls:nativeKernel+readKernel,elapsedMs:performance.now()-start,sourceUnchanged:JSON.stringify(cadDocument)===before,state:ranking.status==='INCOMPLETE'?'partial':'finished',reason,ranking,coverage:axisCoverage(proposal.offsets),selectionSource:'model',warning:'Discrete samples only. No automatic Apply or manufacturing/fastening certification.'};};
 try{
  check();assertAssemblyPose(source);if(SEARCH_PARTS.some(id=>!source.objects[id])||!source.assembly?.joints.bearing||before.length*2>SEARCH_BUDGET.inputBytes)throw Error('Unsupported pilot document or input budget.');
  const session=createCadToolSession({document:cadDocument,selectionIds:[SEARCH_TARGET],layerId:source.objects[SEARCH_TARGET].layerId,workPlane:'XY'},{isCurrent:()=>options.isCurrent()&&JSON.stringify(documentVersion())===JSON.stringify(version)});
  const request=copilotRequest('회전축과 받침판의 위치·크기, 부품 치수는 유지하면서 지지대 위치를 조절하여 받침판과의 관통을 줄여줘. 가능한 수정안들을 비교해 줘.',source,[SEARCH_TARGET],'XY',source.objects[SEARCH_TARGET].layerId,options.model);
  const ask=async(stage:string,extra:any)=>{check();if(++modelCalls>SEARCH_BUDGET.modelCalls)throw Error('Search model-call budget exceeded.');const toolResults=reads.map(r=>modelReadEvidence(r.result,source.interferenceIntents,SEARCH_TARGET));const value:any=await requestCopilotResponse(options.endpoint,{...request,task:'assembly-search',search:{stage,bounds:SEARCH_BUDGET,targetId:SEARCH_TARGET,...extra},toolResults},{...options,signal:controller.signal,timeoutMs:Math.max(1,SEARCH_BUDGET.totalMs-(performance.now()-start))});check();runs.push(value.run);emit({actor:'model',stage,response:value});return value;};
  let feedback:string[]=[],rejected=new Set<string>();
  const validate=(p:any,stage:'initial'|'refine')=>{validateSearchProposal(p);if(stage==='initial'&&p.offsets.length!==3)throw Error('Initial proposal requires exactly three offsets covering X/Y/Z.');check();for(const offset of p.offsets)inspectAssemblyPlacement(source,candidateCommand(source,offset));};
  while(!proposal.offsets.length){const value=await ask('propose',{feedback});if(value.toolCalls){const calls=validateCadToolCalls(value.toolCalls);if(calls.length!==1||++readCalls>6)throw Error('Search read budget exceeded.');for(const call of calls){if(!['cad.inspect','assembly.inspect','assembly.motion.inspect'].includes(call.name)||seen.has(call.id))throw Error('Unsupported/duplicate search read.');const key=JSON.stringify([call.name,call.arguments]);if(seenReads.has(key))throw Error('Repeated search read stopped.');seen.add(call.id);seenReads.add(key);
    if(call.name==='cad.inspect'&&(call.arguments.objectIds as string[]).some(id=>!SEARCH_PARTS.includes(id)))throw Error('Read outside search scope.');
    if(call.name==='assembly.motion.inspect'){const r=JSON.parse(String(call.arguments.optionsJson));if(r.jointId!=='bearing'||r.start!==0||r.end!==180||r.step!==90||r.partIds?.length!==6||!SEARCH_PARTS.every(id=>r.partIds.includes(id))||r.exceptions?.length!==0||r.tolerance!==1e-6)throw Error('Motion read must inspect all six supplied parts.');}
    const read=await session.read(call,controller.signal);readKernel+=read.name==='assembly.motion.inspect'&&read.ok?(read.result as MotionReport).stats.kernelCalls:0;reads.push({actor:'model',call,result:read});emit({actor:'model-read',call,result:read});}
   continue;}
   try{const successful=reads.filter(r=>r.result.ok);if(!successful.some(r=>r.result.name==='assembly.inspect')||!successful.some(r=>r.result.name==='assembly.motion.inspect')||!successful.some(r=>r.result.name==='cad.inspect'&&SEARCH_PAIR.every(id=>(r.result.result as any[]).some(p=>p.id===id))))throw Error('READ_REQUIRED: inspect Assembly, both target parts and baseline Motion.');validate(value.search,'initial');proposal=value.search;}catch(error){const p=value.search,key=JSON.stringify(p?.offsets?.map((o:unknown)=>JSON.stringify(o)).sort());if(rejected.has(key)||feedback.length>=2)throw error;rejected.add(key);feedback.push(String(error));emit({actor:'native-proposal-rejection',error:String(error),offsets:p?.offsets});}
  }
  const evaluate=async()=>{check();const e=await evaluatePlacementCandidates(source,proposal,{signal:controller.signal,isCurrent:options.isCurrent,existing:candidates,remainingKernelCalls:SEARCH_BUDGET.kernelCalls-readKernel-nativeKernel,totalMs:SEARCH_BUDGET.totalMs-(performance.now()-start),onEvent:emit});candidates=e.candidates;nativeKernel+=e.kernelCalls;return e.ranking;};
  let ranking=await evaluate();
  // Allocate the remaining two slots only after the initial native results exist.
  if(ranking.status!=='INCOMPLETE'){
   for(let attempt=0;attempt<2;attempt++){const value=await ask('refine',{existingOffsets:proposal.offsets,nativeResults:boundedCandidateEvidence(candidates),nativeRanking:boundedRanking(ranking),feedback});try{const extra=value.search;if(!Array.isArray(extra?.offsets)||extra.offsets.length>2)throw Error('At most two refinement offsets.');const combined={...extra,offsets:[...proposal.offsets,...extra.offsets]};validate(combined,'refine');proposal=combined;break;}catch(error){feedback.push(String(error));emit({actor:'native-proposal-rejection',stage:'refine',error:String(error)});if(attempt===1)throw error;}}
   if(proposal.offsets.length>3)ranking=await evaluate();
  }
  if(ranking.status!=='INCOMPLETE')for(let attempt=0;attempt<2;attempt++){const value=await ask('compare',{nativeResults:boundedCandidateEvidence(candidates),nativeRanking:boundedRanking(ranking),feedback});try{comparison=validateCandidateComparison(value,candidates,ranking);break;}catch(error){feedback.push(String(error));emit({actor:'native-comparison-rejection',error:String(error)});if(attempt===1)throw error;}}
  check();return result();
 }catch(error){emit({actor:'search-incomplete',error:String(error)});return result(String(error));}
 finally{clearTimeout(deadline);options.signal.removeEventListener('abort',relay);controller.abort();}
}
export function boundedRanking(r:NativeRanking){return {...r,assessments:r.assessments.map(({changes,...a})=>({...a,changeCount:changes.length}))};}
/** Always re-evaluate on the latest authoring document before creating the selected native Preview. */
export async function previewSearchCandidate(result:SearchResult,id:string,signal:AbortSignal){
 if(result.ranking?.status==='INCOMPLETE')throw Error('Incomplete search cannot create an applicable Preview.');
 if(JSON.stringify(documentVersion())!==JSON.stringify(result.version))throw Error('Stale candidate search; run it again.');const c=result.candidates.find(c=>c.id===id);if(!c?.command||!c.hardValid||!c.complete)throw Error('Candidate is not eligible for native Review.');
 const source=structuredClone(cadDocument),version=JSON.stringify(documentVersion());
 if(JSON.stringify(candidateCommand(source,c.offset))!==JSON.stringify(c.command))throw Error('Candidate command does not match its bounded translation/policy.');
 // Revalidate the selected command and hard constraints; perform a fresh bounded native Motion run.
 const prepared=await prepareCadCommand(source,c.command,{signal});if(!prepared.result.ok)throw Error(prepared.result.reason);assertSearchConstraints(source,prepared.proposed);
 if(JSON.stringify(documentVersion())!==version)throw Error('Stale candidate revalidation.');
 const motion=await inspectAssemblyMotion(prepared.proposed,{jointId:'bearing',start:0,end:180,step:90,partIds:SEARCH_PARTS,exceptions:[],tolerance:1e-6},{signal,isCurrent:()=>JSON.stringify(documentVersion())===version});if(motion.state!=='finished'||!motion.samplingFinished||motion.rows.some(r=>['unknown','unsupported'].includes(r.baseStatus)))throw Error('Selected candidate revalidation incomplete.');signal.throwIfAborted();if(JSON.stringify(documentVersion())!==version)throw Error('Stale candidate revalidation.');
 const preview=await previewCadCommand(c.command,{signal});if(JSON.stringify(documentVersion())!==version){discardCadPlan(preview.planId);throw Error('Stale native Preview.');}if(!preview.result.ok){discardCadPlan(preview.planId);throw Error(preview.result.reason);}return {preview,motion,sourceFingerprint:JSON.stringify(source)};
}
