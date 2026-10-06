import assert from "node:assert/strict";
import { test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { parseDxf } from "../src/interop/dxfParser";
import { planDxfImport } from "../src/interop/dxfImport";
import { encodeDxf } from "../src/interop/dxfWriter";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan } from "../src/state/documentPlans";
import { profileSegments } from "../src/precision/profileGeometry";
import { exactDrawingContour, contourLength } from "../src/features/drawing-editing/geometry/contourEditing";
import { resetTestDocument, documentState } from "./helpers/documentHarness";
import { curvedDxfFixture } from "./helpers/dxfFixture";

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} should equal ${b}`);
async function importCurve(text:string){const plan=planDxfImport(text,new Map(),"curve");assert.ok(plan.ok,plan.ok?"":plan.reason);assert.equal((await dispatchCadCommand(plan.command)).ok,true);return cadDocument.rootObjects[0];}

test("Sparse per-vertex DXF bulges retain their outgoing edge, signs, units and final closed arc",()=>{
 const text="0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nShape\n90\n3\n70\n1\n10\n0\n20\n0\n10\n10\n20\n0\n42\n1\n10\n10\n20\n10\n42\n-0.5\n0\nENDSEC\n0\nEOF\n";
 const entity=parseDxf(text).entities[0];assert.equal(entity.kind,"polyline");if(entity.kind!=="polyline")return;
 assert.deepEqual(entity.bulges,[0,1,-.5]);
 const segments=profileSegments("polyline",{...entity,workPlane:"XY"});assert.equal(segments[0].kind,"line");near(segments[1].radius!,5);near(segments[1].center![0],10);near(segments[1].center![1],5);assert.ok(segments[2].sweep!<0);
 const inch=parseDxf(curvedDxfFixture(1)).entities[0];assert.equal(inch.kind,"polyline");if(inch.kind==="polyline"){near(inch.points[1][0],50.8);assert.deepEqual(inch.bulges,[1,0]);}
});

test("2D R12 POLYLINE elevation and repeated closed sentinel preserve the analytic arc",()=>{
 const text="0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n8\nShape\n70\n1\n30\n7\n0\nVERTEX\n10\n0\n20\n0\n42\n-1\n0\nVERTEX\n10\n2\n20\n0\n0\nVERTEX\n10\n0\n20\n0\n0\nSEQEND\n0\nENDSEC\n0\nEOF\n";
 const parsed=parseDxf(text);assert.deepEqual(parsed.warnings,[]);const entity=parsed.entities[0];assert.equal(entity.kind,"polyline");if(entity.kind==="polyline"){assert.deepEqual(entity.points,[[0,0,7],[2,0,7]]);assert.deepEqual(entity.bulges,[-1,0]);}
});

test("Malformed vertices and unsupported DXF width/OCS/mesh meanings are explicitly excluded",()=>{
 const original=curvedDxfFixture();
 for(const text of [original.replace("90\n2","90\n3"),original.replace("20\n0\n42","42"),original.replace("42\n1","42\nNaN"),original.replace("10\n2","10\n "),original.replace("70\n1","70\n1\n43\n5"),original.replace("70\n1","70\n1\n210\n1"),original.replace("10\n2","10\n0"),original.replace("70\n1","70\n16")]){
  const parsed=parseDxf(text);assert.equal(parsed.entities.length,0);assert.equal(parsed.warnings.length,1);assert.match(parsed.warnings[0],/skipped/);
 }
 const mesh="0\nSECTION\n2\nENTITIES\n0\nPOLYLINE\n70\n64\n0\nVERTEX\n10\n0\n20\n0\n0\nVERTEX\n10\n2\n20\n0\n0\nSEQEND\n0\nENDSEC\n";assert.match(parseDxf(mesh).warnings[0],/mesh/);
});

test("Curve import, Explode/Join, DXF roundtrip, portable save and one-step history preserve radius and length",async()=>{
 resetTestDocument();const before=documentState(),planned=planDxfImport(curvedDxfFixture(1),new Map(),"curve");assert.ok(planned.ok);
 const preview=await previewCadCommand(planned.command);assert.equal(preview.result.ok,true);assert.deepEqual(documentState(),before);assert.equal((await applyCadPlan(preview.planId)).ok,true);assert.equal(cadHistory.getPastLabels().length,1);
 const id=cadDocument.rootObjects[0],feature=Object.values(cadDocument.features).find(f=>f.output===id)!;
 const path=exactDrawingContour(cadDocument.objects[id],feature);near(path.segments[0].radius!,25.4);near(contourLength(path),25.4*Math.PI+50.8);
 const result=await dispatchCadCommand({type:"explode-drawings",objectIds:[id]});assert.equal(result.ok,true,result.reason);
 const joined=await dispatchCadCommand({type:"join-drawings",objectIds:result.createdIds,id:"rejoined"});assert.equal(joined.ok,true,joined.reason);
 const exported=encodeDxf(cadDocument,["rejoined"]);assert.equal(exported.skipped,0);assert.match(exported.text,/LWPOLYLINE/);assert.match(exported.text,/42\n-?1\n/);
 const entity=parseDxf(exported.text).entities[0];assert.equal(entity.kind,"polyline");if(entity.kind==="polyline"){const arcs=profileSegments("polyline",{...entity,workPlane:"XY"}).filter(s=>s.kind==="arc");assert.equal(arcs.length,1);near(arcs[0].radius!,25.4);}
 assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);const after=documentState();assert.ok(undoDocument());assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});

test("DXF uses transformed analytic control vertices and signed bulge after rotation/reflection",async()=>{
 resetTestDocument();const id=await importCurve(curvedDxfFixture());
 assert.equal((await dispatchCadCommand({type:"batch",commands:[{type:"move-object",objectId:id,translation:[100,30,0]},{type:"rotate-object",objectId:id,rotation:[0,0,90]},{type:"scale-object",objectId:id,scale:[2,2,1]}]})).ok,true);
 assert.equal((await dispatchCadCommand({type:"create-pattern",id:"reflection",sourceObjectIds:[id],spec:{kind:"mirror",workPlane:"XY",axisStart:[0,29.5],axisEnd:[1,29.5]}})).ok,true);
 const exported=encodeDxf(cadDocument,[`reflection:${id}:1`]),entity=parseDxf(exported.text).entities[0];assert.equal(entity.kind,"polyline");if(entity.kind!=="polyline")return;
 assert.equal(entity.points.length,2);near(entity.points[0][0],100);near(entity.points[0][1],31.5);near(entity.points[1][1],27.5);near(entity.bulges![0],-1);
 const arc=profileSegments("polyline",{...entity,workPlane:"XY"})[0];near(arc.radius!,2);near(arc.center![0],100);near(arc.center![1],29.5);
});

test("Unsupported curved transforms are reported instead of flattening; locked import rejects the entire batch",async()=>{
 resetTestDocument();const id=await importCurve(curvedDxfFixture());
 assert.equal((await dispatchCadCommand({type:"scale-object",objectId:id,scale:[2,1,1]})).ok,true);
 const before=documentState(),exported=encodeDxf(cadDocument,[id]);assert.equal(exported.entities,0);assert.equal(exported.skipped,1);assert.match(exported.warnings[0],/uniform/);assert.deepEqual(documentState(),before);
 const layer=cadDocument.objects[id].layerId;await dispatchCadCommand({type:"set-layer-locked",layerId:layer,locked:true});
 const planned=planDxfImport(curvedDxfFixture(),new Map([["Profile",layer]]),"locked");assert.ok(planned.ok);const locked=documentState(),history=cadHistory.getPastLabels();assert.equal((await dispatchCadCommand(planned.command)).ok,false);assert.deepEqual(documentState(),locked);assert.deepEqual(cadHistory.getPastLabels(),history);
});

test("Selected DXF output ignores unrelated component definitions but rejects a required unsupported member",async()=>{
 resetTestDocument();const id=await importCurve(curvedDxfFixture());
 cadDocument.blocks={unsupported:{id:"unsupported",name:"Unrelated ellipse transform",workPlane:"XY",members:[{type:"drawing",layerId:cadDocument.objects[id].layerId,params:{kind:"circle",workPlane:"XY",center:[0,0,0],radius:5},transform:{translation:[0,0,0],rotation:[0,0,0],scale:[2,1,1]}}]}};
 const before=documentState(),output=encodeDxf(cadDocument,[id]);assert.equal(output.skipped,0);assert.equal(parseDxf(output.text).entities.length,1);assert.deepEqual(documentState(),before);
 assert.equal((await dispatchCadCommand({type:"insert-block",id:"instance",blockId:"unsupported",position:[0,0,0]})).ok,true);
 const required=documentState();assert.throws(()=>encodeDxf(cadDocument,["instance"]),/Cannot export component/);assert.deepEqual(documentState(),required);
});
