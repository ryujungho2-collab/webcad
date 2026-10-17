/** Reproducible feasibility probe, not a replacement for native canvas acceptance. */
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {measureDocumentObject} from "../src/state/documentQuery";
import {undoDocument,redoDocument} from "../src/state/history";
import {modelSheetSvg,modelSheetDxf} from "../src/export/modelSheetExport";
import {documentState,resetTestDocument} from "../tests/helpers/documentHarness";

resetTestDocument();cadDocument.id="architecture-readiness-studio-48m2";
const timings:{command:string;ms:number}[]=[];
async function apply(c:CadCommand){const start=performance.now(),r=await dispatchCadCommand(c);timings.push({command:c.type,ms:Math.round(performance.now()-start)});assert.ok(r.ok,r.reason);return r;}
async function box(id:string,w:number,d:number,h:number,position:[number,number,number]){await apply({type:"create-box",id,width:w,depth:d,height:h});if(position.some(v=>v!==0))await apply({type:"move-object",objectId:id,translation:position});}
await box("outer",8000,6000,3000,[0,0,0]);await box("inner",7600,5600,3000,[200,200,0]);
await apply({type:"boolean-operation",operation:"cut",target:"outer",tool:"inner",id:"wall-ring"});
await box("entry-opening",1000,400,2100,[1000,-100,0]);await apply({type:"boolean-operation",operation:"cut",target:"wall-ring",tool:"entry-opening",id:"door-walls"});
await box("window-opening",1800,400,1200,[3200,5700,900]);await apply({type:"boolean-operation",operation:"cut",target:"door-walls",tool:"window-opening",id:"walls"});
await box("partition-source",150,5600,3000,[4000,200,0]);await box("internal-door",350,900,2100,[3900,1200,0]);await apply({type:"boolean-operation",operation:"cut",target:"partition-source",tool:"internal-door",id:"partition"});
await box("floor",8000,6000,150,[0,0,-150]);
for(const [id,name] of [["walls","External walls · entry + window"],["partition","Partition · internal door"],["floor","Floor slab"]])await apply({type:"register-model-part",part:{id:`${id}-part`,name,objectId:id}});
const expected=(8000*6000-7600*5600)*3000-1000*200*2100-1800*200*1200;
const volume=(await measureDocumentObject(cadDocument,"walls")).volume!;assert.ok(Math.abs(volume-expected)<.1);
const partIds=['walls-part','partition-part','floor-part'];
const section=(id:string,basis:'XY'|'XZ',height:number):CadCommand=>({type:'upsert-model-section',view:{id,name:id==='plan'?'Plan at1200':'Section A-A at Y3000',partIds,basis,height,origin:cadDocument.modelPresentation?.sections?.[id]?.origin??[0,0],scale:cadDocument.modelPresentation?.sections?.[id]?.scale??1,layerId:'layer-default'}});
await apply(section('plan','XY',1200));await apply(section('section','XZ',3000));
const beforeProjection=documentState(),projection=await dispatchCadCommand({type:'upsert-model-projection',id:'elevation',name:'South elevation',partIds,basis:'XZ',origin:[0,0],scale:1,layerId:'layer-default'});
assert.equal(projection.ok,false);assert.match(projection.reason!,/box\/cylinder/);assert.deepEqual(documentState(),beforeProjection);
await apply({type:'upsert-model-sheet',id:'a101',name:'48m2 feasibility · plan + section',artboardId:'a101-board',denominator:50,placements:{plan:[20,50],section:[220,50]},origin:[0,0],size:[420,297]});
await apply({type:'set-object-visible',objectId:'entry-opening',visible:true});
await apply({type:'update-primitive',objectId:'entry-opening',params:{width:1200,depth:400,height:2100}});
const afterEdit=documentState(),statusAfterEdit=Object.fromEntries(Object.entries(cadDocument.modelPresentation!.sections!).map(([id,v])=>[id,{status:v.status,reason:v.reason}]));
assert.equal(statusAfterEdit.plan.status,'unresolved');assert.throws(()=>modelSheetSvg('a101'),/unresolved|Rebind/);
assert.ok(undoDocument());assert.ok(redoDocument());assert.deepEqual(documentState(),afterEdit);
await apply(section('plan','XY',1200));await apply(section('section','XZ',3000));await apply({type:'set-object-visible',objectId:'entry-opening',visible:false});
const updated=(await measureDocumentObject(cadDocument,'walls')).volume!;assert.ok(Math.abs(updated-(expected-200*200*2100))<.1);
const file=serializeDocument(cadDocument);assert.deepEqual(deserializeDocument(file),cadDocument);
const target=resolve('../../output/projects/architecture-readiness');await mkdir(target,{recursive:true});
await writeFile(resolve(target,'studio-48m2.webcad.json'),file);await writeFile(resolve(target,'a101-plan-section.svg'),modelSheetSvg('a101'));const dxf=modelSheetDxf('a101');assert.equal(dxf.skipped,0);await writeFile(resolve(target,'a101-plan-section.dxf'),dxf.text);
const report={date:'2026-10-12',decision:'supplement canvas integration and implement general BRep elevation before full architecture acceptance',scope:'48m2 rectangular studio, 200mm walls, 3000mm height, entry, window, internal partition/door, slab; scripted public commands, not manual authoring',checks:{initialWallVolumeMm3:volume,independentWallVolumeMm3:expected,updatedWallVolumeMm3:updated,planEdges:Object.keys(cadDocument.modelPresentation!.sections!.plan.outputs).length,sectionEdges:Object.keys(cadDocument.modelPresentation!.sections!.section.outputs).length,projectionRejectedAtomically:projection.reason,statusAfterOpeningChange:statusAfterEdit,unresolvedExportBlocked:true,explicitRebind:true,undoRedo:true,serializationRoundtrip:true,dxfSkipped:dxf.skipped},timings,limits:['Plan/section only; no elevation, hidden-line or construction-document completeness.','No room/door/window BIM semantics; boolean solids and source references.','Opening edits require explicit section rebind with current geometric correspondence.','Timing is one local Node/OCCT sample; not browser latency or a performance benchmark.']};
await writeFile(resolve(target,'probe.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({target,checks:report.checks,commands:timings.length,maxCommandMs:Math.max(...timings.map(t=>t.ms))},null,2));
