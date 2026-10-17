import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {planDxfImport} from "../src/interop/dxfImport";
import {encodeDxf} from "../src/interop/dxfWriter";
import {parseDxf} from "../src/interop/dxfParser";
import {worldDraftingGeometry} from "../src/precision/draftingGeometry";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
beforeEach(resetTestDocument);
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<2e-5,`${a} ≈ ${b}`);
const feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const world=(id:string)=>worldDraftingGeometry(cadDocument,cadDocument.objects[id],feature(id));
const fixture=(entities:(string|number)[],blocks:(string|number)[]=[])=>[0,"SECTION",2,"HEADER",9,"$INSUNITS",70,5,0,"ENDSEC",0,"SECTION",2,"BLOCKS",...blocks,0,"ENDSEC",0,"SECTION",2,"ENTITIES",...entities,0,"ENDSEC",0,"EOF"].join("\n")+"\n";
async function load(text:string,tag:string){const p=planDxfImport(text,new Map(),tag);assert.ok(p.ok,p.ok?"":p.reason);assert.deepEqual(p.stats.skipped,[]);const r=await dispatchCadCommand(p.command);assert.ok(r.ok,r.reason);return cadDocument.rootObjects.filter(id=>cadDocument.objects[id].visible).at(-1)!;}
function same(a:ReturnType<typeof world>,b:ReturnType<typeof world>){assert.equal(a.lines.length,b.lines.length);assert.equal(a.texts.length,b.texts.length);a.lines.forEach((line,i)=>line.points.forEach((p,j)=>p.forEach((v,k)=>near(v,b.lines[i].points[j][k]))));a.texts.forEach((text,i)=>{assert.equal(text.text,b.texts[i].text);assert.equal(text.align,b.texts[i].align);near(text.height,b.texts[i].height);text.point.forEach((v,k)=>near(v,b.texts[i].point[k]));text.axes!.forEach((axis,j)=>axis.forEach((v,k)=>near(v,b.texts[i].axes![j][k])));});}
for(const normal of [[0,0,-1],[0,1,0],[1,2,3]])test(`TEXT OCS ${normal}: baseline/center, units, elevation and axes roundtrip`,async()=>{
 for(const center of [false,true]){resetTestDocument();const id=await load(fixture([0,"TEXT",1,"Label",40,2,10,2,20,3,30,7,50,35,...(center?[72,1,11,4,21,5,31,8]:[]),210,normal[0],220,normal[1],230,normal[2]]),"first"),a=world(id),out=encodeDxf(cadDocument,[id]);assert.equal(out.skipped,0);assert.deepEqual(out.warnings,[]);assert.equal(parseDxf(out.text).entities[0].kind,"text");const next=await load(out.text,"again");same(a,world(next));near(a.texts[0].height,20);}
});
const nested=fixture([0,"INSERT",2,"Parent",10,2,20,3,30,7,41,-2,42,3,43,4,50,37,210,1,220,2,230,3],[
 0,"BLOCK",2,"Parent",10,1,20,2,30,3,0,"INSERT",2,"Child",10,4,20,5,30,6,50,27,210,0,220,1,230,0,0,"ENDBLK",
 0,"BLOCK",2,"Child",10,1,20,2,30,3,0,"LINE",10,1,20,2,30,3,11,2,21,4,31,6,0,"TEXT",1,"Nested",40,1,10,1,20,2,30,3,230,-1,0,"ENDBLK",
]);
test("forward nested INSERT definitions preserve signed scales, off-plane bases, text and world geometry",async()=>{
 const id=await load(nested,"nested"),a=world(id);assert.equal(Object.keys(cadDocument.blocks!).length,2);assert.equal(a.lines.length,1);assert.equal(a.texts.length,1);
 // Independent AAA axes and nested base/scale/angle arithmetic.
 const r=37*Math.PI/180,c=Math.cos(r),sn=Math.sin(r),ocs=[20+100*c-120*sn,30+100*sn+120*c,70+80],x=[-2/Math.sqrt(5),1/Math.sqrt(5),0],y=[-3/Math.sqrt(70),-6/Math.sqrt(70),5/Math.sqrt(70)],n=[1/Math.sqrt(14),2/Math.sqrt(14),3/Math.sqrt(14)];
 a.lines[0].points[0].forEach((v,k)=>near(v,ocs[0]*x[k]+ocs[1]*y[k]+ocs[2]*n[k]));
 const out=encodeDxf(cadDocument,[id]);assert.equal(out.skipped,0);assert.deepEqual(out.warnings,[]);assert.equal(Object.keys(parseDxf(out.text).blocks).length,2);const next=await load(out.text,"again");same(a,world(next));
});
test("nested OCS Review is detached, stale-safe, one Undo and portable",async()=>{
 const p=planDxfImport(nested,new Map(),"review");assert.ok(p.ok);const before=documentState(),history=cadHistory.getPastLabels().length,r=await previewCadCommand(p.command);assert.ok(r.result.ok,r.result.reason);assert.deepEqual(documentState(),before);assert.equal(cadHistory.getPastLabels().length,history);assert.ok((await applyCadPlan(r.planId)).ok);discardCadPlan(r.planId);const after=documentState();assert.equal(cadHistory.getPastLabels().length,history+1);assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
 const stale=await previewCadCommand({type:"rename-object",objectId:"dxf-review-0",name:"Reviewed"});await dispatchCadCommand({type:"rename-object",objectId:"dxf-review-0",name:"Newer"});const current=documentState();assert.equal((await applyCadPlan(stale.planId)).ok,false);assert.deepEqual(documentState(),current);discardCadPlan(stale.planId);
});
test("missing and cyclic nested definitions are named exclusions with no dangling INSERT",()=>{
 for(const child of ["Parent","Missing"]){const p=planDxfImport(nested.replace('2\nChild\n10\n4',`2\n${child}\n10\n4`),new Map(),"bad");assert.equal(p.ok,false);assert.ok(p.stats.skipped.some(s=>/cyclic|Missing/.test(s)));}
});
test("nonuniform standalone TEXT and unsupported INSERT arrays/attributes produce explicit losses",async()=>{
 const id=await load(fixture([0,"TEXT",1,"Label",40,2]),"text");await dispatchCadCommand({type:"scale-object",objectId:id,scale:[2,1,1]});const out=encodeDxf(cadDocument,[id]);assert.equal(out.skipped,1);assert.match(out.warnings[0],/uniform/);
 for(const codes of [[70,2],[71,2],[66,1],[41,0]]){const p=parseDxf(fixture([0,"INSERT",2,"Missing",...codes]));assert.equal(p.entities.length,0);assert.match(p.warnings[0],/semantics/);}
});

test("DXF scope deduplicates object IDs that alias imported layer result IDs",async()=>{
 const id=await load(nested,"duplicates"),out=encodeDxf(cadDocument,[id,id]);assert.equal(out.entities,1);assert.equal(parseDxf(out.text).entities.length,1);
});
