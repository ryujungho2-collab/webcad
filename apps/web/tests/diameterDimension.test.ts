import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, serializeDocument } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { planDiameterFromSelection } from "../src/state/dimensionCommands";
import { applyCadPlan, discardCadPlan, previewCadCommand } from "../src/state/documentPlans";
import { cadHistory, redoDocument, undoDocument } from "../src/state/history";
import { resolveDimension } from "../src/precision/dimensionGeometry";
import { encodeDxf } from "../src/interop/dxfWriter";
import { parseDxf } from "../src/interop/dxfParser";
import { resetTestDocument, documentState } from "./helpers/documentHarness";

beforeEach(resetTestDocument);
const feature = (id: string) => Object.values(cadDocument.features).find(f => f.output === id)!;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≈ ${b}`);
async function apply(command: CadCommand) { const r = await dispatchCadCommand(command); assert.ok(r.ok, r.reason); return r; }
async function circle() { await apply({type:"create-drawing",id:"source",drawing:"circle",params:{center:[0,0,0],radius:10,workPlane:"XY"}}); }
async function dimension() { const plan = planDiameterFromSelection(cadDocument,"source"); assert.ok(plan); await apply({...plan,id:"diameter"}); }

test("Diameter measures the full supporting circle with two rim arrows on each work plane", () => {
 for (const workPlane of ["XY","XZ","YZ"]) {
  const d = resolveDimension({kind:"diameter",center:[2,3],radius:7,angle:0,workPlane})!;
  assert.equal(d.value,14); assert.match(d.text,/Ø 14/); assert.equal(d.segments.length,5);
  const axis = workPlane === "YZ" ? 1 : 0;
  near(d.segments[0][0][axis],-5); near(d.segments[0][1][axis],19);
  near(d.segments[1][0][axis],9); near(d.segments[3][0][axis],-5);
 }
 for (const radius of [0,-1,Infinity,NaN]) {
  assert.equal(validateCommand({type:"create-dimension",dimension:"diameter",params:{center:[0,0],radius}}),false);
  assert.equal(resolveDimension({kind:"diameter",center:[0,0],radius}),null);
 }
});

test("Detached diameter review, source edits, v13 roundtrip and History retain identity and layout", async () => {
 await circle(); const before=documentState(),h=cadHistory.getPastLabels().length;
 const preview=await previewCadCommand({...planDiameterFromSelection(cadDocument,"source")!,id:"diameter"});
 assert.ok(preview.result.ok,preview.result.reason); assert.deepEqual(documentState(),before);
 assert.ok((await applyCadPlan(preview.planId)).ok); discardCadPlan(preview.planId);
 assert.equal(cadHistory.getPastLabels().length,h+1);
 await apply({type:"update-dimension",objectId:"diameter",params:{angle:90}});
 const preScale=documentState(); await apply({type:"scale-object",objectId:"source",scale:[2,2,1]});
 assert.equal(feature("diameter").params.angle,90); assert.equal(resolveDimension(feature("diameter").params)!.value,40);
 const after=documentState(); assert.ok(undoDocument()); assert.deepEqual(documentState(),preScale); assert.ok(redoDocument()); assert.deepEqual(documentState(),after);
 const saved=serializeDocument(cadDocument); assert.equal(JSON.parse(saved).version,13); assert.deepEqual(deserializeDocument(saved),cadDocument);
 const downlevel=JSON.parse(saved); downlevel.version=12; assert.throws(()=>deserializeDocument(JSON.stringify(downlevel)),/version 13/);
 const malformed=JSON.parse(saved); malformed.document.features[feature("diameter").id].params.radius=-5; assert.throws(()=>deserializeDocument(JSON.stringify(malformed)),/diameter annotation/);
 const output=parseDxf(encodeDxf(cadDocument).text); assert.ok(output.entities.some(e=>e.kind==="text"&&e.text.startsWith("Ø 40")));
});

test("Arc diameter survives explicit Trim/Join edge remapping and subsequent source scale", async () => {
 await circle(); await dimension(); await apply({type:"create-drawing",id:"cutter",drawing:"line",params:{workPlane:"XY",points:[[0,-20,0],[0,20,0]]}});
 const r=await apply({type:"trim-contour",objectId:"source",cutterIds:["cutter"],pickPoint:[10,0,0],referenceRoutes:[{dependentId:"diameter",sourceId:"source",resultIndices:[0],segmentIndex:0}]});
 const arc=r.createdIds[0]; assert.equal(resolveDimension(feature("diameter").params)!.value,20); assert.ok(feature("diameter").params.sourceSegmentId);
 await apply({type:"join-drawings",objectIds:[arc],id:"joined",bridges:[{fromId:arc,fromEnd:"end",toId:arc,toEnd:"start"}],referenceRoutes:[{dependentId:"diameter",sourceId:arc,resultIndices:[0],segmentIndex:0}]});
 assert.equal(feature("diameter").params.sourceObjectId,"joined"); assert.deepEqual(feature("diameter").inputs,["joined"]);
 await apply({type:"scale-object",objectId:"joined",scale:[3,3,1]}); near(resolveDimension(feature("diameter").params)!.value,60);
 assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});

test("Arc planning and locked/missing/stale diameter inputs fail without partial mutation", async () => {
 await apply({type:"create-drawing",id:"source",drawing:"arc",params:{workPlane:"XY",center:[10,20,0],radius:8,startAngle:0,endAngle:Math.PI/2}});
 const command={...planDiameterFromSelection(cadDocument,"source")!,id:"diameter"}; assert.equal(command.params.radius,8);
 const preview=await previewCadCommand(command); await apply({type:"rename-object",objectId:"source",name:"Changed"});
 let before=documentState(),h=cadHistory.getPastLabels(); assert.equal((await applyCadPlan(preview.planId)).ok,false); assert.deepEqual(documentState(),before); assert.deepEqual(cadHistory.getPastLabels(),h); discardCadPlan(preview.planId);
 await apply({type:"set-layer-locked",layerId:"layer-default",locked:true}); assert.equal(planDiameterFromSelection(cadDocument,"source"),null);
 before=documentState(); h=cadHistory.getPastLabels(); assert.equal((await dispatchCadCommand(command)).ok,false); assert.deepEqual(documentState(),before); assert.deepEqual(cadHistory.getPastLabels(),h);
 await apply({type:"set-layer-locked",layerId:"layer-default",locked:false}); before=documentState(); h=cadHistory.getPastLabels();
 assert.equal((await dispatchCadCommand({...command,params:{...command.params,sourceObjectId:"missing"}})).ok,false); assert.deepEqual(documentState(),before); assert.deepEqual(cadHistory.getPastLabels(),h);
 await dimension(); await apply({type:"delete-object",objectId:"source"}); assert.equal(feature("diameter").params.sourceObjectId,undefined); assert.equal(resolveDimension(feature("diameter").params)!.value,16);
 assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);
});
