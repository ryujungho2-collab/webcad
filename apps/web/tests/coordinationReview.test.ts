import test from 'node:test';
import assert from 'node:assert/strict';
import {Client,InMemoryTransport} from '@modelcontextprotocol/client';
import {createCadMcpServer} from '../server/cadMcpServer';
import {createCadMcpRuntime} from '../src/copilot/cadMcpRuntime';
import {createCadToolSession} from '../src/copilot/cadToolSession';
import {inspectCoordination,reviewDrawingReadiness,validateCoordinationRequest,type CoordinationRequest,type CoordinationReport} from '../src/copilot/coordinationReview';
import {taskToolScope} from '../src/copilot/copilotTaskScope';
import {cadDocument} from '../src/state/cadDocument';
import {dispatchCadCommand} from '../src/state/dispatchCadCommand';
import {cadHistory,undoDocument,redoDocument} from '../src/state/history';
import {resetTestDocument,documentState} from './helpers/documentHarness';
import {preflightFixture} from './helpers/preflightFixture';
const run=async(c:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);};
const request=(min=10):CoordinationRequest=>({pairs:[{objectIds:['a','b'],minimumClearanceMm:min,purpose:'maintenance gap'}],viewIds:[]});
const context=()=>({document:cadDocument,selectionIds:[],layerId:'layer-default',workPlane:'XY' as const});
async function boxes(){await run({type:'create-box',id:'a',width:100,depth:100,height:100});await run({type:'create-box',id:'b',width:100,depth:100,height:100});await run({type:'move-object',objectId:'b',translation:[105,0,0]});}
test.beforeEach(resetTestDocument);
test('a nonintersecting 5 mm gap fails a 10 mm requirement; edit, Undo and Redo recheck exact geometry',async()=>{
 await boxes();const before=documentState(),depth=cadHistory.past.length,r=await inspectCoordination(cadDocument,request());assert.equal(r.pairs[0].status,'fail');assert.equal(r.pairs[0].distanceMm,5);assert.equal(r.pairs[0].commonVolumeMm3,0);assert.equal(r.decision,'issues-found');assert.deepEqual(documentState(),before);assert.equal(cadHistory.past.length,depth);
 await run({type:'move-object',objectId:'b',translation:[110,0,0]});assert.equal((await inspectCoordination(cadDocument,request())).pairs[0].status,'pass');assert.ok(undoDocument());assert.equal((await inspectCoordination(cadDocument,request())).pairs[0].status,'fail');assert.ok(redoDocument());const repaired=await inspectCoordination(cadDocument,request());assert.equal(repaired.pairs[0].status,'pass');assert.equal(repaired.decision,'incomplete');assert.ok(repaired.unverified.length);
});
test('contained bodies fail even with a positive boundary gap; intent cannot hide overlap',async()=>{
 await run({type:'create-box',id:'a',width:100,depth:100,height:100});await run({type:'create-box',id:'b',width:10,depth:10,height:10});await run({type:'move-object',objectId:'b',translation:[20,20,20]});await run({type:'assembly-pair-intent',pair:['a','b'],intent:'intentional-overlap',note:'test only'});
 const r=await inspectCoordination(cadDocument,request(0));assert.equal(r.pairs[0].status,'fail');assert.ok(r.pairs[0].distanceMm!>0);assert.ok(Math.abs(r.pairs[0].commonVolumeMm3!-1000)<1e-6);assert.ok(r.pairs[0].intent);
});
test('missing, unsupported and timed out measurements stay unknown, not passed',async()=>{
 await boxes();delete cadDocument.objects.b;let r=await inspectCoordination(cadDocument,request());assert.equal(r.pairs[0].status,'unknown');assert.equal(r.coverage.measuredPairs,0);assert.equal(r.coverage.unknownPairs,1);
 r=await inspectCoordination(cadDocument,{pairs:[],viewIds:[]});assert.equal(r.decision,'incomplete');
 resetTestDocument();await boxes();r=await inspectCoordination(cadDocument,request(),{measure:async()=>{throw Error('Kernel classification failed');}});assert.equal(r.pairs[0].status,'unknown');assert.match(r.pairs[0].message,/classification failed/);
 r=await inspectCoordination(cadDocument,request(),{totalMs:5,measure:async(_a,_b,_t,o)=>{await new Promise<void>((_,reject)=>o!.signal!.addEventListener('abort',()=>reject(Error('abort')),{once:true}));throw Error('unreachable');}});assert.equal(r.pairs[0].status,'unknown');assert.match(r.pairs[0].message,/timed out/);
 const abort=new AbortController();abort.abort();await assert.rejects(inspectCoordination(cadDocument,request(),{signal:abort.signal}));
});
test('invalid scopes and duplicate unordered pairs reject instead of truncating',()=>{
 assert.throws(()=>validateCoordinationRequest({...request(),pairs:[request().pairs[0],{...request().pairs[0],objectIds:['b','a']}]}),/Duplicate/);
 assert.throws(()=>validateCoordinationRequest(request(-1)));assert.throws(()=>validateCoordinationRequest(request(NaN)));assert.throws(()=>validateCoordinationRequest({...request(),pairs:Array(25).fill(request().pairs[0])}));
 assert.throws(()=>validateCoordinationRequest({...request(),pairs:[{...request().pairs[0],purpose:' '}]}));
 assert.ok(taskToolScope('주택 실무 검토').names.includes('cad.coordinationReview'));
});
test('drawing inventory catches absent dimensions, stale sources and missing geometry/sheets',async()=>{
 await preflightFixture();let rows=reviewDrawingReadiness(cadDocument,['view','missing']);assert.equal(rows.find(r=>r.code==='associated-dimensions'&&r.viewId==='view')!.status,'unknown');assert.equal(rows.find(r=>r.code==='sheet-placement')!.status,'pass');assert.equal(rows.find(r=>r.code==='missing-view')!.status,'fail');
 const view=cadDocument.modelPresentation!.projections.view;view.status='unresolved';delete cadDocument.objects[Object.values(view.outputs)[0].objectId];delete cadDocument.artboards!.paper;
 rows=reviewDrawingReadiness(cadDocument,['view']);for(const code of ['drawing-source','drawing-output','sheet-placement'])assert.equal(rows.find(r=>r.code===code)!.status,'fail');
});
test('tool session rejects an outdated inspection and preserves document and history',async()=>{
 await boxes();const session=createCadToolSession(context()),before=documentState(),depth=cadHistory.past.length,read=await session.read({id:'review',name:'cad.coordinationReview',arguments:request()});assert.equal(read.ok,true);assert.equal((read.result as CoordinationReport).pairs[0].status,'fail');assert.deepEqual(documentState(),before);assert.equal(cadHistory.past.length,depth);
 await run({type:'move-object',objectId:'b',translation:[110,0,0]});await assert.rejects(session.read({id:'old',name:'cad.coordinationReview',arguments:request()}),/context changed/);
});
test('associated dimension creation satisfies inventory only; hidden/stale annotations remain failures',async()=>{
 await preflightFixture();const source=Object.values(cadDocument.modelPresentation!.projections.view.outputs)[0].objectId,f=Object.values(cadDocument.features).find(f=>f.output===source)!;
 await run({type:'upsert-model-dimension',id:'dim',sourceObjectId:source,segmentId:(f.params.topology as {segments:{id:string}[]}).segments[0].id,dimension:'linear',offset:5,angle:0,orientation:'aligned',height:3.5,layerId:'layer-default'});
 let row=reviewDrawingReadiness(cadDocument,['view']).find(r=>r.code==='associated-dimensions')!;assert.equal(row.status,'pass');assert.match(row.message,/does not prove/);
 await run({type:'set-layer-visible',layerId:'layer-default',visible:false});row=reviewDrawingReadiness(cadDocument,['view']).find(r=>r.code==='associated-dimensions')!;assert.equal(row.status,'fail');assert.deepEqual(row.objectIds,['dim']);assert.ok(undoDocument());assert.equal(reviewDrawingReadiness(cadDocument,['view']).find(r=>r.code==='associated-dimensions')!.status,'pass');
});
test('context mutation during asynchronous measurement rejects the entire report',async()=>{
 await boxes();await assert.rejects(inspectCoordination(cadDocument,request(),{measure:async()=>{cadDocument.revision++;throw Error('fixture yielded during measurement');}}),/context changed/);
 await run({type:'create-drawing',id:'line',drawing:'line',params:{workPlane:'XY',points:[[0,0,0],[10,0,0]]}});
 const r=await inspectCoordination(cadDocument,{pairs:[{objectIds:['a','line'],minimumClearanceMm:0,purpose:'unsupported source'}],viewIds:[]});assert.equal(r.pairs[0].status,'unknown');assert.match(r.pairs[0].message,/Unsupported/);
});
test('official MCP SDK calls the same native review with raw measurements and no mutation',async()=>{
 await boxes();const before=documentState(),runtime=createCadMcpRuntime({context,review:async()=>{throw Error('Read-only test');},proposal:()=>{throw Error('No proposal');}}),server=createCadMcpServer(async(method,params,signal)=>{try{return {ok:true,value:await runtime.invoke(method,params,signal)};}catch(e){return {ok:false,error:String(e)};}}),client=new Client({name:'coordination-review',version:'1'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{await server.connect(a);await client.connect(b);assert.equal((await client.listTools()).tools.find(t=>t.name==='cad.coordinationReview')?.annotations?.readOnlyHint,true);const c:any=(await client.callTool({name:'cad.context',arguments:{}})).structuredContent;const out=await client.callTool({name:'cad.coordinationReview',arguments:{_context:c.result.contextId,...request()}});assert.ok(!out.isError,JSON.stringify(out));const read:any=out.structuredContent;assert.equal(read.result.result.pairs[0].distanceMm,5);assert.equal(read.result.result.pairs[0].status,'fail');assert.deepEqual(documentState(),before);}finally{await client.close();await server.close();runtime.dispose();}
});
