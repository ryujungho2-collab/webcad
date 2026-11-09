import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {deserializeDocument,serializeDocument} from '@agent-webcad/cad-document';
import {cadDocument} from '../src/state/cadDocument';
import {dispatchCadCommand} from '../src/state/dispatchCadCommand';
import {cadHistory,undoDocument,redoDocument} from '../src/state/history';
import {restoreTestDocument,documentState} from '../tests/helpers/documentHarness';
import {createCadToolSession} from '../src/copilot/cadToolSession';
import type {CoordinationReport,CoordinationRequest} from '../src/copilot/coordinationReview';
import {exportGlbBytes} from '../src/export/glbExport';
const sourceDir=resolve('../../output/projects/three-storey-house/r1'),dir=resolve('../../output/projects/three-storey-house/coordination');await mkdir(dir,{recursive:true});
const native=await readFile(resolve(sourceDir,'house.webcad.json'),'utf8'),sha=(s:string)=>createHash('sha256').update(s).digest('hex');restoreTestDocument(deserializeDocument(native));cadHistory.clear();
const parts: {id:string;level:string;kind:string}[]=JSON.parse(await readFile(resolve(sourceDir,'parts.json'),'utf8'));
const requirements:CoordinationRequest={pairs:[
 {objectIds:['F1-island-top','F1-counter'],minimumClearanceMm:1200,purpose:'Kitchen aisle: verify the generator’s stated 1200 mm design target, not a code threshold'},
 {objectIds:['F1-west','F1-north'],minimumClearanceMm:0,purpose:'Wall junction overlap remains unresolved'},
 {objectIds:['F2-table-leg0','F2-furniture-6000'],minimumClearanceMm:0,purpose:'Regression: previously repaired bed/desk penetration'},
 ...parts.filter(p=>p.level==='F1'&&p.kind==='wall').map(p=>({objectIds:['F1-island-top',p.id] as [string,string],minimumClearanceMm:0,purpose:'Check revised island worktop against each F1 wall'})),
 ],viewIds:['A101','A102','A103','A201','A202']};
async function inspect(){const session=createCadToolSession({document:cadDocument,selectionIds:[],layerId:'layer-default',workPlane:'XY'}),r=await session.read({id:'review',name:'cad.coordinationReview',arguments:requirements});assert.ok(r.ok,r.error);return r.result as CoordinationReport;}
const before=documentState(),baseline=await inspect();assert.deepEqual(documentState(),before);assert.equal(cadHistory.past.length,0);assert.equal(baseline.pairs[0].status,'fail');assert.ok(Math.abs(baseline.pairs[0].distanceMm!-1120)<1e-5);assert.equal(baseline.pairs[1].status,'fail');
await writeFile(resolve(dir,'r1-review.json'),JSON.stringify({nativeSha256:sha(native),...baseline},null,2));console.log('R1: stated 1200 mm kitchen aisle is actually 1120 mm; wall overlap retained.');
const repair=await dispatchCadCommand({type:'batch',commands:['F1-island-body-source','F1-island-top-source'].map(objectId=>({type:'move-object' as const,objectId,translation:[0,80,0] as [number,number,number]}))});assert.ok(repair.ok,repair.reason);assert.equal(cadHistory.past.length,1);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
const repaired=await inspect();assert.equal(repaired.pairs[0].status,'pass');assert.ok(Math.abs(repaired.pairs[0].distanceMm!-1200)<1e-5);assert.equal(repaired.pairs[1].status,'fail');assert.ok(repaired.pairs.slice(2).every(p=>p.status==='pass'),JSON.stringify(repaired.pairs));
const finalNative=serializeDocument(cadDocument);assert.deepEqual(documentState(deserializeDocument(finalNative)),documentState());await writeFile(resolve(dir,'house.webcad.json'),finalNative);await writeFile(resolve(dir,'house.glb'),await exportGlbBytes(parts.map(p=>p.id)));await writeFile(resolve(dir,'requirements.json'),JSON.stringify(requirements,null,2));await writeFile(resolve(dir,'repaired-review.json'),JSON.stringify({nativeSha256:sha(finalNative),...repaired},null,2));
console.log(JSON.stringify({pairs:repaired.pairs.length,measured:repaired.coverage.measuredPairs,failures:repaired.pairs.filter(p=>p.status==='fail').map(p=>p.objectIds),drawingUnknown:repaired.drawings.filter(p=>p.status==='unknown').length,drawingFailures:repaired.drawings.filter(p=>p.status==='fail').map(p=>({view:p.viewId,code:p.code})),undoRedo:'one native batch',reopen:'preserved',dir},null,2));
