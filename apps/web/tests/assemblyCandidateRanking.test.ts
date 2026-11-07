import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deserializeDocument} from '@agent-webcad/cad-document';
import {rankNativeCandidates} from '../src/copilot/assemblyCandidateRanking';
import {axisCoverage,SEARCH_PART_IDS} from '../src/copilot/assemblySearchPolicy';
import {validateSearchProposal,validateCandidateComparison,type Candidate} from '../src/copilot/assemblyCandidateSearch';
const dir=new URL('../../../output/verification/ai-agent-phase-1b2/',import.meta.url),load=async(name:string)=>JSON.parse(await readFile(name==='B-oracle.json'?new URL('./fixtures/assembly/candidate-synthetic-oracle.json',import.meta.url):new URL(name,dir),'utf8'));
const source=async()=>deserializeDocument(await readFile(new URL('../assembly-b25/annotated-laptop.webcad.json',dir),'utf8'));

test('real Test A: XYZ, six complete parts, fixed/moving pairs and Native rank are authoritative',async()=>{
 const record=await load('A.json'),d=await source(),candidates:Candidate[]=structuredClone(record.result.candidates),rank=rankNativeCandidates(d,candidates);
 assert.equal(record.mock,false);assert.ok(record.modelCalls.length<=8);assert.deepEqual(axisCoverage(record.result.proposal.offsets),[true,true,true]);assert.ok(candidates.length<=6);assert.ok(candidates.every(c=>c.motion!.rows.length===45&&SEARCH_PART_IDS.every(id=>c.motion!.request.partIds.includes(id))));assert.ok(candidates[0].motion!.rows.some(r=>r.pair.includes('stand-shaft')&&r.relativeMotion==='motion-dependent'));
 assert.equal(rank.status,'NO_PROVEN_IMPROVEMENT');assert.deepEqual(rank.recommendedIds,[]);assert.equal(rank.preferred,'baseline');assert.equal(rank.message,'검사한 후보 범위에서 개선안이 확인되지 않았습니다.');
 const unchanged=rank.order.map(id=>rank.assessments.find(a=>a.id===id)!).filter(a=>a.target==='unchanged');assert.ok(unchanged.every((a,i)=>!i||candidates.find(c=>c.id===unchanged[i-1].id)!.movement<=candidates.find(c=>c.id===a.id)!.movement));
 const unsafe=candidates.find(c=>c.facts.includes('TARGET_NOT_DETECTED'))!;assert.ok(unsafe.facts.includes('OTHER_PAIR_WORSE'));assert.ok(unsafe.risks.some(r=>r.includes('stand-shaft')));assert.ok(!rank.recommendedIds.includes(unsafe.id));assert.deepEqual(record.result.comparison.map((c:any)=>c.candidateId),rank.comparisonIds);
 assert.throws(()=>validateCandidateComparison({version:1,comparison:[...record.result.comparison].reverse()},candidates,rank),/order/);
 for(const call of record.modelCalls){const data=JSON.parse(call.request.messages[1].content);assert.ok(!data.bounds.finiteTranslationLattice.some((o:number[])=>JSON.stringify(o)==='[0,0,-10]'));assert.equal(data.oracle,undefined);}
});
test('real synthetic oracle and model success are separated; equal clearance favors smaller movement',async()=>{
 const oracle=await load('B-oracle.json'),record=await load('B.json');assert.equal(oracle.ranking.status,'IMPROVED_WITH_REVIEW');assert.equal(record.result.ranking.status,'IMPROVED_WITH_REVIEW');assert.equal(record.mock,false);assert.ok(record.modelCalls.length<=8);
 const rec=record.result.ranking.recommendedIds.map((id:string)=>record.result.candidates.find((c:any)=>c.id===id));assert.ok(rec.length>=2);assert.equal(rec[0].movement,6);assert.equal(rec[1].movement,12);for(const c of rec){assert.ok(!c.facts.includes('OTHER_PAIR_WORSE'));assert.ok(!c.facts.includes('CONTACT_LOSS_RISK'));for(const row of c.motion.rows.filter((r:any)=>r.pair.includes('stand-support')&&r.pair.includes('stand-plate'))){assert.equal(row.baseStatus,'no-penetration');assert.equal(row.commonVolume,undefined);}}
 assert.deepEqual(record.result.comparison.map((c:any)=>c.candidateId),record.result.ranking.comparisonIds);assert.equal(record.applyCalls,0);assert.equal(record.documentUnchanged,true);
});
test('existing penetration growth, tolerance and unsupported results cannot become recommendations',async()=>{
 const record=await load('A.json'),d=await source(),original:Candidate[]=structuredClone(record.result.candidates),baseline=original[0],chosen=original[1];
 for(const c of [baseline,chosen])for(const row of c.motion!.rows.filter(r=>r.pair.includes('stand-base')&&r.pair.includes('stand-shaft'))){row.baseStatus='penetration';row.commonVolume=c===baseline?10:10.01;row.volumeTolerance=.001;}
 let rank=rankNativeCandidates(d,[baseline,chosen]);assert.ok(rank.assessments[0].otherWorse);assert.ok(chosen.facts.includes('OTHER_PAIR_WORSE'));
 for(const row of chosen.motion!.rows.filter(r=>r.pair.includes('stand-base')&&r.pair.includes('stand-shaft')))row.commonVolume=10.00001;
 rank=rankNativeCandidates(d,[baseline,chosen]);assert.equal(rank.assessments[0].otherWorse,false);
 chosen.motion!.rows[0].baseStatus='unsupported';rank=rankNativeCandidates(d,[baseline,chosen]);assert.equal(rank.status,'INCOMPLETE');assert.deepEqual(rank.recommendedIds,[]);
});
test('sub-tolerance differences between reductions cannot outrank a shorter movement; preservation is mandatory',async()=>{
 const record=await load('A.json'),d=await source(),baseline:Candidate=structuredClone(record.result.candidates[0]),long:Candidate=structuredClone(record.result.candidates[1]),short:Candidate=structuredClone(record.result.candidates[5]);
 // Tabular ranking regression only; these edited rows are not CAD measurements or AI evidence.
 for(const c of [long,short])for(const row of c.motion!.rows.filter(r=>r.pair.includes('stand-support')&&r.pair.includes('stand-plate'))){row.commonVolume=c===long?600:600.000001;row.volumeTolerance=.01;}
 let rank=rankNativeCandidates(d,[baseline,long,short]);assert.equal(rank.order[0],short.id);short.placement!.preservation.nonTargetPoses=false;rank=rankNativeCandidates(d,[baseline,long,short]);assert.equal(rank.status,'INCOMPLETE');assert.ok(!rank.recommendedIds.includes(short.id));
});
test('finite lattice and missing-axis proposals are rejected before native candidate generation',async()=>{
 const record=await load('A.json'),p=record.result.proposal;validateSearchProposal(p);
 assert.throws(()=>validateSearchProposal({...p,offsets:[[-6,0,0],[6,0,0],[12,0,0]]}),/COVERAGE/);assert.throws(()=>validateSearchProposal({...p,offsets:[[6,0,0],[0,6,0],[0,0,-10]]}),/lattice/);assert.throws(()=>validateSearchProposal({...p,objectId:'stand-plate'}));
});
