import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {deserializeDocument,serializeDocument} from '@agent-webcad/cad-document';
import {createDocumentCommandExecutor} from '../src/state/commandBus';
import {cadDocument} from '../src/state/cadDocument';
import {cadHistory} from '../src/state/history';
import {restoreTestDocument} from './helpers/documentHarness';
import {documentVersion,notifyDocumentChanged} from '../src/state/documentSession';
import {validateSearchProposal,candidateCommand,assertSearchConstraints,evaluatePlacementCandidates,boundedCandidateEvidence,validateCandidateComparison,previewSearchCandidate,runAssemblyCandidateSearch,type SearchResult} from '../src/copilot/assemblyCandidateSearch';
const file=new URL('../../../output/verification/assembly-b25/annotated-laptop.webcad.json',import.meta.url);
const load=async()=>deserializeDocument(await readFile(file,'utf8'));
const proposal=()=>({tool:'assembly.part.place' as const,objectId:'stand-support' as const,descendantPolicy:'preserve-descendant-world' as const,min:[-15,-15,-15],max:[15,15,15],offsets:[[-6,0,0],[0,6,0],[0,0,6]],rationale:'Bounded symmetric translation experiment; no measured success assumed.'});

test('finite search rejects no-op, duplicates, overflow, wrong policy and unknown evidence',()=>{
 validateSearchProposal(proposal());for(const mutate of [(p:any)=>p.offsets.push([0,0,0]),(p:any)=>p.offsets.push(p.offsets[0]),(p:any)=>p.offsets.push([16,0,0]),(p:any)=>p.offsets.push([15,15,15]),(p:any)=>p.offsets=Array(6).fill([1,0,0]),(p:any)=>p.descendantPolicy='move-subtree',(p:any)=>p.min[0]=-16]){const p=proposal();mutate(p);assert.throws(()=>validateSearchProposal(p));}
 const c:any={id:'c1',hardValid:true,complete:true,facts:['COMPLETE'],risks:[],offset:[0,0,1],motion:{rows:[{angle:0,pair:['stand-support','stand-plate'],baseStatus:'no-penetration',method:'aabb'}]}};
 assert.equal(boundedCandidateEvidence([c])[0].observations![0].measuredCommon,undefined);assert.ok(!JSON.stringify(boundedCandidateEvidence([c])).includes('measuredCommon'));
 assert.throws(()=>validateCandidateComparison({version:1,comparison:[{candidateId:'c1',reasons:['MEASURED_VOLUME_LOWER']}]},[c]));assert.throws(()=>validateCandidateComparison({version:1,comparison:[{candidateId:'c1',reasons:['COMPLETE']}]},[{...c,hardValid:false}]));assert.throws(()=>validateCandidateComparison({version:1,comparison:[{candidateId:'c1',reasons:['COMPLETE']}]},[{...c,complete:false}]));
});
test('hard constraints reject altered bearing, geometry, intent, target rotation and non-target poses',async()=>{
 const source=await load(),valid=structuredClone(source);await createDocumentCommandExecutor(valid)(candidateCommand(source,[-6,0,0]));assertSearchConstraints(source,valid);
 for(const mutate of [(d:any)=>d.assembly.joints.bearing.origin[0]+=1,(d:any)=>Object.values(d.features)[0].name='changed',(d:any)=>d.interferenceIntents={},(d:any)=>d.objects['stand-plate'].transform.translation[0]+=1,(d:any)=>d.objects['stand-support'].transform.rotation[0]+=1]){const d=structuredClone(valid);mutate(d);assert.throws(()=>assertSearchConstraints(source,d));}
});
test('independent known Z -10 regression retains missing Common, detects lost mount overlap and intent mismatch',async()=>{
 // This coordinate is a regression oracle only; never supplied to the local model.
 const d=await load(),p={...proposal(),offsets:[[0,0,-10],[0,0,6]]},before=serializeDocument(d),evaluation=await evaluatePlacementCandidates(d,p,{signal:new AbortController().signal,isCurrent:()=>true,regressionOnly:true}),candidate=evaluation.candidates[1];
 assert.ok(candidate.hardValid&&candidate.complete);assert.ok(candidate.facts.includes('CONTACT_LOSS_RISK'));assert.ok(candidate.facts.includes('INTENT_MEASUREMENT_MISMATCH'));assert.ok(candidate.risks.some(r=>r.includes('new-major-pair-penetration')));for(const row of candidate.motion!.rows.filter(r=>r.pair.includes('stand-support')&&r.pair.includes('stand-plate'))){assert.equal(row.baseStatus,'no-penetration');assert.equal(row.commonVolume,undefined);}assert.equal(serializeDocument(d),before);const dir=new URL('../../../output/verification/ai-agent-phase-1b2/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('C-regression.json',dir),JSON.stringify({role:'independent regression only; not supplied to LLM',...evaluation},null,2));
});
test('actual detached Native candidates preserve source; invalid/locked candidates are excluded with rollback',async()=>{
 const d=await load(),before=serializeDocument(d),controller=new AbortController(),evaluation=await evaluatePlacementCandidates(d,proposal(),{signal:controller.signal,isCurrent:()=>true});assert.equal(evaluation.candidates.length,4);assert.ok(evaluation.candidates.every(c=>c.hardValid&&c.complete));assert.equal(serializeDocument(d),before);assert.ok(evaluation.kernelCalls<=240);
 for(const c of evaluation.candidates.slice(0,2))for(const row of c.motion!.rows.filter(r=>r.pair.includes('stand-support')&&r.pair.includes('stand-plate')))assert.ok(Math.abs(row.commonVolume!-964.6170736148283)<1e-6);
 const locked=await load();locked.layers['layer-default'].locked=true;const snapshot=serializeDocument(locked),rejected=await evaluatePlacementCandidates(locked,proposal(),{signal:controller.signal,isCurrent:()=>true});assert.ok(rejected.candidates.slice(1).every(c=>!c.hardValid&&c.error));assert.equal(serializeDocument(locked),snapshot);
});
test('stale/cancelled searches and reviews cannot publish or change History; integrated budget remains bounded',async()=>{
 const original=structuredClone(cadDocument);try{restoreTestDocument(await load());cadHistory.clear();const before=serializeDocument(cadDocument),controller=new AbortController();controller.abort();assert.equal((await evaluatePlacementCandidates(cadDocument,proposal(),{signal:controller.signal,isCurrent:()=>true})).ranking.status,'INCOMPLETE');assert.equal((await evaluatePlacementCandidates(cadDocument,proposal(),{signal:new AbortController().signal,isCurrent:()=>false})).ranking.status,'INCOMPLETE');
 const exhausted=await evaluatePlacementCandidates(cadDocument,proposal(),{signal:new AbortController().signal,isCurrent:()=>true,remainingKernelCalls:0});assert.equal(exhausted.kernelCalls,0);assert.equal(exhausted.ranking.status,'INCOMPLETE');await writeFile(new URL('../../../output/verification/ai-agent-phase-1b2/budget-partial.json',import.meta.url),JSON.stringify({role:'forced zero-budget Native regression; not an AI run',...exhausted},null,2));assert.ok(exhausted.candidates.slice(1).every(c=>!c.complete));
 const r={version:documentVersion(),candidates:[]} as unknown as SearchResult;notifyDocumentChanged();await assert.rejects(previewSearchCandidate(r,'c1',new AbortController().signal),/Stale/);
 let requests=0;const pending=runAssemblyCandidateSearch({endpoint:'/api/copilot/plan',baseUrl:'http://localhost/',model:'qwen3-coder-32k:latest',signal:new AbortController().signal,isCurrent:()=>true,fetcher:async()=>{requests++;notifyDocumentChanged();return new Response(JSON.stringify({version:1,search:proposal()}),{headers:{'content-type':'application/json'}});}});assert.match((await pending).reason!,/Stale/);assert.equal(requests,1);assert.equal(serializeDocument(cadDocument),before);assert.equal(cadHistory.getPastLabels().length,0);
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
test('validation feedback stops identical rejected offsets even when rationale changes',async()=>{
 const original=structuredClone(cadDocument);try{restoreTestDocument(await load());cadHistory.clear();const before=serializeDocument(cadDocument);let requests=0;
 const calls=[{id:'a',name:'assembly.inspect',arguments:{}},{id:'b',name:'cad.inspect',arguments:{objectIds:['stand-support','stand-plate']}},{id:'m',name:'assembly.motion.inspect',arguments:{optionsJson:JSON.stringify({jointId:'bearing',start:0,end:180,step:90,partIds:['stand-base','stand-shaft','stand-turntable','stand-support','stand-plate','stand-lip'],exceptions:[],tolerance:1e-6})}}];
 const replay=await runAssemblyCandidateSearch({endpoint:'/api/copilot/plan',baseUrl:'http://localhost/',model:'unit-replay-no-real-model',signal:new AbortController().signal,isCurrent:()=>true,fetcher:async()=>{const index=requests++,value=index<3?{version:1,toolCalls:[calls[index]]}:{version:1,search:{...proposal(),offsets:[[0,0,0],[6,0,0]],rationale:'different wording '+index}};return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}});assert.match(replay.reason!,/no-op/);
 assert.equal(requests,5);assert.equal(serializeDocument(cadDocument),before);assert.equal(cadHistory.getPastLabels().length,0);
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
test('missing-axis proposal is rejected before candidate evaluation and receives one bounded model correction',async()=>{
 const original=structuredClone(cadDocument);try{restoreTestDocument(await load());cadHistory.clear();const before=serializeDocument(cadDocument),events:any[]=[];let requests=0;
 const calls=[{id:'a',name:'assembly.inspect',arguments:{}},{id:'b',name:'cad.inspect',arguments:{objectIds:['stand-support','stand-plate']}},{id:'m',name:'assembly.motion.inspect',arguments:{optionsJson:JSON.stringify({jointId:'bearing',start:0,end:180,step:90,partIds:['stand-base','stand-shaft','stand-turntable','stand-support','stand-plate','stand-lip'],exceptions:[],tolerance:1e-6})}}];
 const result=await runAssemblyCandidateSearch({endpoint:'/api/copilot/plan',baseUrl:'http://localhost/',model:'unit-replay-no-real-model',signal:new AbortController().signal,isCurrent:()=>true,onEvent:event=>events.push(event),fetcher:async(_url,init)=>{const index=requests++,body=JSON.parse(String(init?.body)),stage=body.search.stage;const value=index<3?{version:1,toolCalls:[calls[index]]}:index===3?{version:1,search:{...proposal(),offsets:[[-6,0,0],[6,0,0],[12,0,0]]}}:stage==='propose'?{version:1,search:proposal()}:stage==='refine'?{version:1,search:{...proposal(),offsets:[]}}:{version:1,comparison:body.search.nativeRanking.comparisonIds.map((candidateId:string)=>({candidateId,reasons:['NATIVE_ORDER']}))};return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});}});
 assert.equal(result.state,'finished',result.reason);assert.equal(requests,7);assert.equal(result.selectionSource,'model');assert.deepEqual(result.coverage,[true,true,true]);const rejected=events.findIndex(e=>e.actor==='native-proposal-rejection');assert.ok(rejected>=0&&events[rejected].error.includes('COVERAGE'));assert.ok(events.findIndex(e=>e.actor==='native-evaluator')>rejected);assert.equal(serializeDocument(cadDocument),before);assert.equal(cadHistory.getPastLabels().length,0);
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
