import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deserializeDocument,serializeDocument,type CadDocument} from '@agent-webcad/cad-document';
import {assemblyMatrix,jointMotion,assertAssemblyPose,inspectAssemblyPlacement} from '../src/state/assemblyCommands';
import {createDocumentCommandExecutor} from '../src/state/commandBus';
import {cadDocument} from '../src/state/cadDocument';
import {restoreTestDocument} from './helpers/documentHarness';
import {cadHistory,undoDocument,redoDocument} from '../src/state/history';
import {dispatchCadCommand} from '../src/state/dispatchCadCommand';
import {previewCadCommand,acknowledgeAssemblyPlacementIntent,getCadPlanFrameDocument,discardCadPlan,applyCadPlan} from '../src/state/documentPlans';
import {createCadToolSession} from '../src/copilot/cadToolSession';
import {inspectAssemblyMotion} from '../src/state/assemblyMotion';
const source=new URL('../../../output/verification/assembly-b25/annotated-laptop.webcad.json',import.meta.url);
const load=async()=>deserializeDocument(await readFile(source,'utf8'));
const matrix=(d:CadDocument,id:string)=>assemblyMatrix(d.objects[id].transform!).elements;
const near=(a:number[],b:number[])=>assert.ok(a.every((v,i)=>Math.abs(v-b[i])<1e-7),JSON.stringify({a,b}));
const placement=(d:CadDocument,id='stand-support',policy:'move-subtree'|'preserve-descendant-world'='preserve-descendant-world')=>({type:'assembly-part-place' as const,objectId:id,targetWorldPose:{...structuredClone(d.objects[id].transform!),translation:d.objects[id].transform!.translation.map((v,i)=>v+[12,-4,8][i]) as [number,number,number],rotation:[9,12,33] as [number,number,number]},descendantPolicy:policy});

test('Fixed and nonzero Revolute targets: explicit subtree/preserved descendants, inverse(P*A) rest and rigid multilevel tree',async()=>{
 for(const target of ['stand-support','stand-turntable','stand-lip'])for(const angle of [0,90,180])for(const policy of ['move-subtree','preserve-descendant-world'] as const){
  const d=await load();await createDocumentCommandExecutor(d)({type:'assembly-joint-update',jointId:'bearing',angle});const before=structuredClone(d),c=placement(d,target,policy),j=Object.values(d.assembly!.joints).find(j=>j.childId===target)!,expected=assemblyMatrix(d.objects[j.parentId].transform!).multiply(jointMotion(j)).invert().multiply(assemblyMatrix(c.targetWorldPose));
  await createDocumentCommandExecutor(d)(c);assertAssemblyPose(d);near(matrix(d,target),assemblyMatrix(c.targetWorldPose).elements);near(assemblyMatrix(d.assembly!.joints[j.id].rest).elements,expected.elements);
  for(const id of ['stand-plate','stand-lip'])if(id!==target){if(target==='stand-lip'||policy==='preserve-descendant-world')near(matrix(d,id),matrix(before,id));else assert.notDeepEqual(matrix(d,id),matrix(before,id));}
  assert.equal(JSON.stringify(d.features),JSON.stringify(before.features));assert.equal(JSON.stringify(d.interferenceIntents),JSON.stringify(before.interferenceIntents));
  for(const id of Object.keys(d.assembly!.joints)){const {rest:_,...a}=d.assembly!.joints[id],{rest:__,...b}=before.assembly!.joints[id];assert.deepEqual(a,b);}
 }
});
test('invalid payloads, grounded/no-op/scaled/cyclic/locked/inconsistent frames roll back through public transactions',async()=>{
 const original=structuredClone(cadDocument);try{for(const modify of [()=>{cadDocument.layers['layer-default'].locked=true;},()=>{cadDocument.assembly!.joints.support.rest.scale=[2,1,1];},()=>{cadDocument.assembly!.joints.bearing.parentId='stand-lip';}]){
  restoreTestDocument(await load());cadHistory.clear();modify();const c=placement(cadDocument),before=serializeDocument(cadDocument);const r=await dispatchCadCommand(c);{assert.equal(r.ok,false);assert.equal(serializeDocument(cadDocument),before);assert.equal(cadHistory.getPastLabels().length,0);}
 }
 for(const policy of ['move-subtree','preserve-descendant-world'] as const){restoreTestDocument(await load());cadHistory.clear();cadDocument.layers.locked={id:'locked',name:'Locked plate',visible:true,locked:true,objectIds:['stand-plate']};cadDocument.rootLayers.push('locked');cadDocument.layers['layer-default'].objectIds=cadDocument.layers['layer-default'].objectIds.filter(id=>id!=='stand-plate');cadDocument.objects['stand-plate'].layerId='locked';const before=serializeDocument(cadDocument);assert.equal((await dispatchCadCommand(placement(cadDocument,'stand-support',policy))).ok,false);assert.equal(serializeDocument(cadDocument),before);}
 for(const mutate of [(c:any)=>c.objectId='stand-base',(c:any)=>c.objectId='missing',(c:any)=>c.descendantPolicy=undefined,(c:any)=>c.targetWorldPose.scale=[2,1,1],(c:any)=>c.targetWorldPose.rotation=[NaN,0,0],(c:any)=>c.targetWorldPose.shear=[1,0,0],(c:any)=>c.targetWorldPose=structuredClone(cadDocument.objects['stand-support'].transform)]){restoreTestDocument(await load());cadHistory.clear();const c=placement(cadDocument),before=serializeDocument(cadDocument);mutate(c);try{assert.equal((await dispatchCadCommand(c)).ok,false);}catch(e){assert.match(String(e),/Invalid CAD command/);}assert.equal(serializeDocument(cadDocument),before);assert.equal(cadHistory.getPastLabels().length,0);}
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
test('preserve descendants recaptures a nonzero outgoing Revolute motion as well as its multilevel subtree',async()=>{
 const d=await load(),run=createDocumentCommandExecutor(d);
 await run({type:'assembly-joint-delete',jointId:'plate'});
 await run({type:'assembly-joint-create',joint:{id:'plate',type:'revolute',parentId:'stand-support',childId:'stand-plate',origin:[3,4,5],axis:[1,0,0],angle:0}});
 await run({type:'assembly-joint-update',jointId:'plate',angle:35});const before=structuredClone(d);
 await run(placement(d));for(const id of ['stand-plate','stand-lip'])near(matrix(before,id),matrix(d,id));assert.equal(d.assembly!.joints.plate.angle,35);assertAssemblyPose(d);
});
test('Native Preview/Cancel/stale Apply/history/reload and MCP ToolSession produce the identical placement command',async()=>{
 const original=structuredClone(cadDocument);try{restoreTestDocument(await load());cadHistory.clear();const c=placement(cadDocument),before=serializeDocument(cadDocument),p=await previewCadCommand(c);assert.equal(p.result.ok,true,p.result.reason);assert.equal(serializeDocument(cadDocument),before);assert.equal(cadHistory.getPastLabels().length,0);discardCadPlan(p.planId);
 const session=createCadToolSession({document:cadDocument,selectionIds:['stand-support'],layerId:'layer-default',workPlane:'XY'}),tool=await session.plan([{id:'place',name:'assembly.part.place',arguments:{objectId:c.objectId,targetWorldPose:c.targetWorldPose,descendantPolicy:c.descendantPolicy}}]);assert.deepEqual(tool.command,c);
 const ui=await previewCadCommand(c),mcp=await previewCadCommand(tool.command);assert.deepEqual(getCadPlanFrameDocument(ui.planId),getCadPlanFrameDocument(mcp.planId));discardCadPlan(mcp.planId);assert.equal((await applyCadPlan(ui.planId)).ok,false);acknowledgeAssemblyPlacementIntent(ui.planId,true);assert.equal((await applyCadPlan(ui.planId)).ok,true);const after=structuredClone(cadDocument);assert.equal(cadHistory.getPastLabels().length,1);await undoDocument();near(matrix(cadDocument,'stand-support'),matrix(JSON.parse(before).document,'stand-support'));await redoDocument();near(matrix(cadDocument,'stand-support'),matrix(after,'stand-support'));assertAssemblyPose(deserializeDocument(serializeDocument(cadDocument)));
 await assert.rejects(previewCadCommand({type:'batch',commands:[c]}),/Invalid CAD command/);
 const stale=await previewCadCommand(placement(cadDocument));await dispatchCadCommand({type:'rename-object',objectId:'stand-support',name:'renamed'});assert.equal((await applyCadPlan(stale.planId)).ok,false);discardCadPlan(stale.planId);
 }finally{restoreTestDocument(original);cadHistory.clear();}
});
test('real v63 laptop: fixed support placement preserves plate, bearing and geometry at 0/90/180; interference measured separately',async()=>{
 const raw=await readFile(source,'utf8'),d=deserializeDocument(raw),before=structuredClone(d),c=placement(d);c.targetWorldPose={...structuredClone(d.objects['stand-support'].transform!),translation:[25,6,16]};
 const report=inspectAssemblyPlacement(d,c);await createDocumentCommandExecutor(d)(c);near(matrix(d,'stand-plate'),matrix(before,'stand-plate'));assert.deepEqual(d.assembly!.joints.bearing,before.assembly!.joints.bearing);assert.deepEqual(d.features,before.features);assert.deepEqual(d.interferenceIntents,before.interferenceIntents);
 const request={jointId:'bearing',start:0,end:180,step:90,partIds:['stand-support','stand-plate'],exceptions:[] as [string,string][],tolerance:1e-6};const baseline=await inspectAssemblyMotion(before,request),next=await inspectAssemblyMotion(d,request);
 for(const angle of [0,90,180]){const a=structuredClone(before),b=structuredClone(d);await createDocumentCommandExecutor(a)({type:'assembly-joint-update',jointId:'bearing',angle});await createDocumentCommandExecutor(b)({type:'assembly-joint-update',jointId:'bearing',angle});near(matrix(a,'stand-plate'),matrix(b,'stand-plate'));assertAssemblyPose(b);}
 const dir=new URL('../../../output/verification/assembly-placement/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('laptop-report.json',dir),JSON.stringify({command:c,report,baseline,next,geometryUnchanged:true,originalHash:createHash('sha256').update(raw).digest('hex'),originalUnchanged:await readFile(source,'utf8')===raw},null,2));await writeFile(new URL('laptop-candidate.webcad.json',dir),serializeDocument(d));
 assert.ok(Math.abs(baseline.rows[0].commonVolume!-964.6170736148283)<1e-6);
});
