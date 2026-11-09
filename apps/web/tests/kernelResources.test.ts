import {test,beforeEach,afterEach} from "node:test";
import assert from "node:assert/strict";
import {createBox,createCylinder,translate,projectShapes,estimateShapeBytes} from "@agent-webcad/cad-kernel";
import {projectionGroups} from "../../../packages/cad-kernel/src/operations/projectionPartition";
import {RetainedShapeCache} from "../src/cad/retainedShapeCache";
import {executeKernelOperation,clearRetainedShapes,retainedShapeStatistics} from "../src/cad/kernelRuntime";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {kernelResourceControl} from "../src/cad/kernelGeometryService";
import {separatedHlrFixture} from "./helpers/kernelP4Fixture";
beforeEach(async()=>{resetTestDocument();clearRetainedShapes();await executeKernelOperation('resources',{action:'configure',sourceBytes:64*1024*1024,slabBytes:64*1024*1024,sourceCount:128,slabCount:128});});
afterEach(async()=>{clearRetainedShapes();await executeKernelOperation('resources',{action:'configure',sourceBytes:64*1024*1024,slabBytes:64*1024*1024,sourceCount:128,slabCount:128});});
const params={kind:'box',width:20,depth:10,height:10},request={operands:[{params},{params:{...params,width:8},transform:{translation:[4,0,0]}}],normal:[0,-1,0],xAxis:[1,0,0]},projection=(p=request)=>executeKernelOperation('projection',p);
test('native handle LRU enforces byte and count caps, releases once and does not retain unknown/oversize entries',()=>{
 const deleted:number[]=[],c=new RetainedShapeCache<number>(100,3,v=>deleted.push(v));c.put('a',1,38);c.put('b',2,38);assert.equal(c.metrics().estimatedBytes,80);assert.equal(c.get('a'),1);c.put('c',3,38);assert.deepEqual(deleted,[2]);c.configure(100,1);assert.deepEqual(deleted,[2,1]);c.put('huge',4,101);c.put('unknown',5,undefined);assert.equal(c.metrics().entries,1);assert.equal(c.metrics().oversize,1);assert.equal(c.metrics().unknownEstimates,1);c.clear();c.clear();assert.deepEqual(deleted,[2,1,4,5,3]);assert.equal(c.metrics().estimatedBytes,0);assert.throws(()=>c.configure(NaN,1));
});
test('source byte eviction happens before count cap and regeneration matches exact global HLR',async()=>{
 const baseline=await projection();const bytes=retainedShapeStatistics().estimatedBytes;assert.ok(bytes>0);assert.equal(retainedShapeStatistics().unknownEstimates,0);
 await executeKernelOperation('resources',{action:'configure',sourceBytes:Math.floor(bytes*.6)});assert.ok(retainedShapeStatistics().evictions>0);assert.ok(retainedShapeStatistics().entries<128);assert.deepEqual(await projection(),baseline);
 await executeKernelOperation('resources',{action:'configure',sourceBytes:0});assert.equal(retainedShapeStatistics().entries,0);assert.deepEqual(await projection(),baseline);assert.equal(retainedShapeStatistics().entries,0);assert.ok(retainedShapeStatistics().oversize>0);assert.equal(retainedShapeStatistics().activeOperations,0);
});
test('slab and source budgets are separate; oversized slab still computes without retaining a handle',async()=>{
 const clipped={...request,clipping:{normal:[0,0,1],height:5,keep:'negative',depth:20}};const exact=await executeKernelOperation('projection',clipped);assert.ok(retainedShapeStatistics().slabs.estimatedBytes>0);
 const sourceBytes=retainedShapeStatistics().estimatedBytes;await executeKernelOperation('resources',{action:'configure',slabBytes:0});assert.equal(retainedShapeStatistics().slabs.entries,0);assert.equal(retainedShapeStatistics().estimatedBytes,sourceBytes);assert.deepEqual(await executeKernelOperation('projection',clipped),exact);assert.ok(retainedShapeStatistics().slabs.oversize>0);
});
test('explicit release preserves accounting history; source and slab regenerate after release',async()=>{
 const a=await projection(),old=retainedShapeStatistics();await executeKernelOperation('resources',{action:'clear'});const empty=retainedShapeStatistics();assert.equal(empty.estimatedBytes,0);assert.equal(empty.slabs.estimatedBytes,0);assert.ok(empty.releasedHandles>=old.entries);assert.deepEqual(await projection(),a);assert.ok(retainedShapeStatistics().builds>old.builds);
 await assert.rejects(executeKernelOperation('resources',{action:'configure',sourceCount:129}));await assert.rejects(executeKernelOperation('resources',{action:'configure',sourceBytes:-1}));
});
test('meshing detaches native triangulation from cache-owned source geometry',async()=>{
 await executeKernelOperation('inspect',{operand:{params:{kind:'torus',majorRadius:20,minorRadius:5}}});const before=retainedShapeStatistics().estimatedBytes;
 const mesh=await executeKernelOperation('solid',{kind:'torus',majorRadius:20,minorRadius:5});assert.ok(mesh.positions.length>100);assert.equal(retainedShapeStatistics().estimatedBytes,before);assert.equal(retainedShapeStatistics().builds,1);
 const shape=await createCylinder(3,10);try{assert.ok((await estimateShapeBytes(shape))!>0);}finally{shape.delete();}
});
test('failed builds and in-flight resource controls cannot publish cache entries or delete active task data',async()=>{
 await assert.rejects(executeKernelOperation('inspect',{operand:{params:{kind:'unknown'}}}));assert.equal(retainedShapeStatistics().entries,0);
 await assert.rejects(executeKernelOperation('inspect',{operand:{params,transform:{scale:[0,1,1]}}}));assert.equal(retainedShapeStatistics().activeOperations,0);
 const running=projection();await assert.rejects(executeKernelOperation('resources',{action:'clear'}),/idle serialized/);assert.ok((await running).length);assert.equal(retainedShapeStatistics().activeOperations,0);
});
test('disjoint groups preserve original indices and complete visible/hidden exact results',async()=>{
 const shapes:any[]=[];try{for(const x of [0,50,5,100]){const box=await createBox(10,10,10);try{shapes.push(await translate(box,x,0,0));}finally{box.delete();}}
  assert.deepEqual(await projectionGroups(shapes,[0,-1,0],[1,0,0]),[[0,2],[1],[3]]);
  const baseline=await projectShapes(shapes,[0,-1,0],[1,0,0],{partition:false});let profile:any;const optimized=await projectShapes(shapes,[0,-1,0],[1,0,0],{profile:p=>profile=p});assert.deepEqual(optimized,baseline);assert.equal(profile.groups,3);assert.equal(profile.largestGroup,2);assert.ok(baseline.some(c=>c.hidden));
 }finally{shapes.forEach(s=>s.delete());}
});
test('projected depth overlap, contact, tilted conics and uncertain bounds keep conservative grouping',async()=>{
 const shapes:any[]=[];try{const cylinder=await createCylinder(8,15);shapes.push(cylinder);shapes.push(await translate(cylinder,0,0,30));shapes.push(await translate(cylinder,16,0,0));
  assert.deepEqual(await projectionGroups(shapes,[0,0,1],[1,0,0]),[[0,1,2]]);const n:[number,number,number]=[0,Math.SQRT1_2,Math.SQRT1_2],x:[number,number,number]=[1,0,0];assert.deepEqual(await projectShapes(shapes,n,x),await projectShapes(shapes,n,x,{partition:false}));
  assert.deepEqual(await projectionGroups([shapes[0],null],[0,0,1],[1,0,0]),[[0,1]]);
 }finally{shapes.forEach(s=>s.delete());}
});
test('cold repeated groups reuse only immutable identical geometry and common translation within the current request',async()=>{
 const request={operands:separatedHlrFixture(),normal:[0,-1,0],xAxis:[1,0,0]},baseline=await executeKernelOperation('projection',{...request,hlrPartition:false});clearRetainedShapes();
 assert.deepEqual(await executeKernelOperation('projection',request),baseline);const profile=retainedShapeStatistics().lastHlr!;assert.equal(profile.groups,8);assert.equal(profile.computedGroups,2);assert.equal(profile.reusedGroups,6);
 const changed=structuredClone(request);changed.operands[2].transform!.rotation=[10,20,30];changed.operands[3].transform!.scale=[1.2,1,1];assert.deepEqual(await executeKernelOperation('projection',changed),await executeKernelOperation('projection',{...changed,hlrPartition:false}));
 const clipped={...request,clipping:{normal:[0,0,1],height:10,depth:30,keep:'negative'}};assert.deepEqual(await executeKernelOperation('projection',clipped),await executeKernelOperation('projection',{...clipped,hlrPartition:false}));await executeKernelOperation('projection',clipped);assert.equal(retainedShapeStatistics().lastHlr!.reusedGroups,0);
 const far=structuredClone(request);for(const o of far.operands)o.transform!.translation![0]+=1e8;assert.deepEqual(await executeKernelOperation('projection',far),await executeKernelOperation('projection',{...far,hlrPartition:false}));await executeKernelOperation('projection',far);assert.equal(retainedShapeStatistics().lastHlr!.reusedGroups,0,'large-coordinate uncertainty keeps the exact path');
});
test('cache release preserves document, Undo, locked/stale Review contracts and exact regenerated projection',async()=>{
 const apply=async(c:any)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);};await apply({type:'create-primitive',id:'source',primitive:'box',params:{width:20,depth:10,height:10}});await apply({type:'register-model-part',part:{id:'part',name:'part',objectId:'source'}});
 const command={type:'upsert-model-projection' as const,id:'p',name:'P',partIds:['part'],basis:'XY' as const,origin:[0,0] as [number,number],scale:1,layerId:'layer-default',includeHidden:true};await apply(command);const before=documentState();await kernelResourceControl({action:'clear',clearResults:true});assert.deepEqual(documentState(),before);
 const plan=await previewCadCommand({...command,origin:[20,0]});assert.ok(plan.result.ok);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(plan.planId)).ok);const changed=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),changed);
 const stale=await previewCadCommand({...command,origin:[30,0]});await apply({type:'rename-object',objectId:'source',name:'changed'});assert.equal((await applyCadPlan(stale.planId)).ok,false);await apply({type:'set-layer-locked',layerId:'layer-default',locked:true});const locked=documentState();assert.equal((await dispatchCadCommand({...command,origin:[40,0]})).ok,false);assert.deepEqual(documentState(),locked);assert.ok(cadDocument.objects.source);
});
