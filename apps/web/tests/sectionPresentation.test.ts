import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {serializeDocument,deserializeDocument,type SectionPresentation} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import {sectionHatch} from "../src/precision/sectionHatch";
import type {SectionDrawing} from "../src/precision/modelSection";
import {modelSheetScene,modelSheetSvg,modelSheetDxf} from "../src/export/modelSheetExport";
import {modelDrawingStyle,layerStyle} from "../src/precision/layerStyle";
beforeEach(resetTestDocument);
const style:SectionPresentation={background:true,keep:"negative",depth:20,hatch:true,spacing:2,angle:45,cutWeight:.5,backgroundWeight:.18,hatchWeight:.13,label:true};
const apply=async(c:CadCommand)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;};
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!,view=()=>cadDocument.modelPresentation!.sections!.plan;
const command=(patch:Record<string,unknown>={}):CadCommand=>({type:'upsert-model-section',view:{id:'plan',name:'Ground plan',basis:'XY',height:4,partIds:['walls','slab','low'],origin:[20,30],scale:1,layerId:'drawings',presentation:{...style},...patch}});
async function model(){for(const [id,width,depth,height] of [['outer',24,20,8],['inner',16,12,8],['slab',24,20,2],['low',2,4,1]] as const)await apply({type:'create-box',id,width,depth,height});await apply({type:'move-object',objectId:'inner',translation:[4,4,0]});await apply({type:'move-object',objectId:'slab',translation:[0,0,-2]});await apply({type:'move-object',objectId:'low',translation:[8,6,0]});await apply({type:'boolean-operation',id:'walls',operation:'cut',target:'outer',tool:'inner'});for(const id of ['walls','slab','low'])await apply({type:'register-model-part',part:{id,name:id,objectId:id}});await apply({type:'create-layer',id:'drawings',name:'Drawings'});}
const line=(id:string,a:number[],b:number[]):SectionDrawing=>({kind:'line',sourceKey:id,partId:'part',params:{points:[a,b]}});
test('analytic hatch keeps polygon/circular holes empty and handles a closed arc/diameter without sampling',()=>{
 const ring=(lo:number,hi:number)=>[[lo,lo],[hi,lo],[hi,hi],[lo,hi]].map((a,i,p)=>line(`${lo}:${i}`,a,p[(i+1)%4]));const r=sectionHatch([...ring(0,20),...ring(5,15)],[0,0],2,0);assert.deepEqual(r.warnings,[]);assert.ok(r.lines.length);assert.ok(r.lines.every(g=>{const [a,b]=g.points;return a[1]<=5||a[1]>=15||b[0]<=5||a[0]>=15;}));
 const circles=[10,4].map(radius=>({kind:'circle' as const,sourceKey:String(radius),partId:'part',params:{center:[0,0,0],radius}})),c=sectionHatch(circles,[0,0],2,0);assert.deepEqual(c.warnings,[]);assert.deepEqual(c.lines.filter(g=>g.points[0][1]===0).map(g=>g.points.map(p=>Math.round(p[0]))),[[-10,-4],[4,10]]);
 const mixed=sectionHatch([{kind:'arc',sourceKey:'arc',partId:'part',params:{center:[0,0,0],radius:10,startAngle:0,endAngle:Math.PI}},line('diameter',[-10,0],[10,0])],[0,0],2,0);assert.deepEqual(mixed.warnings,[]);assert.ok(mixed.lines.every(g=>g.points[0][1]>=0&&g.points[0][0]**2+g.points[0][1]**2<100.000001));
});
test('open, branch and self-crossing boundaries warn and never invent filled material',()=>{
 for(const group of [[line('open',[0,0],[10,0])],[line('a',[0,0],[10,0]),line('b',[0,0],[10,0])],[[0,0],[10,10],[0,10],[10,0]].map((p,i,a)=>line(String(i),p,a[(i+1)%4]))]){const r=sectionHatch(group,[0,0],2,45);assert.equal(r.lines.length,0);assert.ok(r.warnings.length);}
});
test('real retained-background geometry, cuts, paper hatch and labels share detached Apply/Undo and sheet outputs',async()=>{
 await model();const before=documentState(),source=structuredClone(cadDocument.objects.walls),r=await previewCadCommand(command());assert.ok(r.result.ok,r.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(r.planId)).ok);assert.deepEqual(cadDocument.objects.walls,source);assert.ok(Object.values(view().decorations!).some(e=>e.role==='background'&&feature(e.objectId).params.sourcePartId==='low'));assert.ok(Object.values(view().decorations!).some(e=>e.role==='hatch'));assert.ok(Object.values(view().decorations!).some(e=>e.role==='label'));assert.deepEqual(view().presentationWarnings,[]);
 const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
 await apply({type:'upsert-model-sheet',id:'sheet',name:'Architecture',artboardId:'board',denominator:1,placements:{plan:[30,40]},origin:[0,0],size:[210,297]});const scene=modelSheetScene('sheet');for(const role of ['background','hatch','label'])assert.ok(Object.values(view().decorations!).filter(e=>e.role===role).every(e=>scene.items.some(i=>(i.type==='polyline'?i.polyline.objectId:i.type==='text'?i.text.objectId:'')===e.objectId)));assert.match(modelSheetSvg('sheet'),/Ground plan/);assert.match(modelSheetSvg('sheet'),/stroke-width="0.5"/);assert.equal(modelSheetDxf('sheet').skipped,0);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
test('paper scale changes preserve cut references and physical spacing/weights; locked and stale previews reject',async()=>{
 await model();await apply(command());const cuts=structuredClone(view().outputs),depth=cadHistory.past.length;await apply({type:'upsert-model-sheet',id:'sheet',name:'Architecture',artboardId:'board',denominator:2,placements:{plan:[30,40]},origin:[0,0],size:[210,297]});assert.deepEqual(view().outputs,cuts);assert.equal(view().presentation!.spacing,2);const hatch=Object.values(view().decorations!).find(e=>e.role==='hatch')!;assert.equal(modelDrawingStyle(feature(hatch.objectId).params,layerStyle(cadDocument.layers.drawings)).lineWeight,.13);
 const stale=await previewCadCommand(command({origin:[30,40],scale:.5}));await apply({type:'rename-object',objectId:'walls',name:'Changed'});assert.equal((await applyCadPlan(stale.planId)).ok,false);await apply({type:'set-layer-locked',layerId:'drawings',locked:true});const state=documentState(),past=cadHistory.past.length,result=await dispatchCadCommand({type:'update-primitive',objectId:'low',params:{width:3,depth:4,height:1}});assert.equal(result.ok,false);assert.deepEqual(documentState(),state);assert.equal(cadHistory.past.length,past);assert.ok(past>depth);
});
test('depth/retained side omits below-cut objects; disabling expression retires auxiliaries; schema34 protects ownership',async()=>{
 await model();await apply(command({presentation:{...style,depth:1}}));assert.equal(Object.values(view().decorations!).some(e=>e.role==='background'&&feature(e.objectId).params.sourcePartId==='low'),false);await apply(command());const data=JSON.parse(serializeDocument(cadDocument));assert.equal(data.version,34);data.version=33;assert.throws(()=>deserializeDocument(JSON.stringify(data)),/version 34/);data.version=34;const e=Object.values(data.document.modelPresentation.sections.plan.decorations)[0] as any;e.role='label';assert.throws(()=>deserializeDocument(JSON.stringify(data)),/ownership/);
 const ids=Object.values(view().decorations!).map(e=>e.objectId);await apply(command({presentation:undefined}));assert.equal(view().decorations,undefined);assert.ok(ids.every(id=>!cadDocument.objects[id]));assert.equal(JSON.parse(serializeDocument(cadDocument)).version,25);
});
test('source loss hides all expression outputs; auxiliary edits are owned and cannot be directly moved',async()=>{
 await model();await apply(command());const e=Object.values(view().decorations!)[0];const state=documentState();assert.equal((await dispatchCadCommand({type:'move-object',objectId:e.objectId,translation:[1,0,0]})).ok,false);assert.deepEqual(documentState(),state);await apply({type:'set-object-visible',objectId:'outer',visible:true});await apply({type:'set-object-visible',objectId:'inner',visible:true});await apply({type:'update-primitive',objectId:'outer',params:{width:24,depth:20,height:2}});await apply({type:'update-primitive',objectId:'inner',params:{width:16,depth:12,height:2}});assert.equal(view().status,'unresolved');assert.ok(Object.values(view().decorations!).every(e=>!cadDocument.objects[e.objectId].visible));
});
