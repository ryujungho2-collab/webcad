import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { deserializeDocument, identityCoordinates, MAX_FIXTURE_BYTES, serializeDocument, validateExchangeFixture, type CadDocument } from "@agent-webcad/cad-document";
import { encodeFixture, planFixtureImport, decodeFixture } from "../src/interop/fixtureAdapter";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, applyCadPlan, discardCadPlan } from "../src/state/documentPlans";
import { newDocument, openDocumentFile } from "../src/state/documentFile";
import { readRecoveryCheckpoint, writeRecoveryCheckpoint } from "../src/state/documentRecovery";
import { getWorldDrawingGeometry } from "../src/precision/worldGeometry";
import { documentState, resetTestDocument } from "./helpers/documentHarness";
import { exchangeFixture } from "./helpers/exchangeFixture";
beforeEach(resetTestDocument);
const plan = (fixture=exchangeFixture()) => planFixtureImport(JSON.stringify(fixture),"layer-default");
async function importFixture(fixture=exchangeFixture()) { const p=plan(fixture),r=await dispatchCadCommand(p.command); assert.ok(r.ok,r.reason);return p; }
const world = (doc:CadDocument,id:string) => getWorldDrawingGeometry(doc.objects[id],Object.values(doc.features).find(f=>f.output===id)!)!;
test("strict offline envelope rejects bad versions, numbers, geometry, identities, paths and references without mutations",()=>{
  const snapshot=JSON.stringify(cadDocument);
  const mutations:((v:any)=>void)[]=[v=>v.version=2,v=>v.adapter="ifc",v=>v.documentId="__proto__",v=>v.entities.push(v.entities[0]),v=>v.entities[0].points[0]=[null,0,0],v=>v.coordinates.axes[2]=[0,0,-1],v=>v.coordinates.unit="feet",v=>v.entities[1].points[2]=[3,1,0],v=>v.entities[0].assetIds=["missing"],v=>v.assets.push({id:"bad",url:"https://example.com/image"}),v=>v.entities[0].script="run()",v=>v.losses.push({code:"bad",message:"bad",sourceId:"missing"})];
  for(const mutate of mutations){const v=exchangeFixture();mutate(v);assert.throws(()=>planFixtureImport(JSON.stringify(v),"layer-default"));}
  assert.throws(()=>decodeFixture(" ".repeat(MAX_FIXTURE_BYTES+1)),/2 MiB/);
  const infinite=exchangeFixture(); infinite.entities[0].kind === "line" && (infinite.entities[0].points[0][0]=Infinity);assert.throws(()=>validateExchangeFixture(infinite));
  assert.equal(JSON.stringify(cadDocument),snapshot);assert.equal(cadHistory.getPastLabels().length,0);
});
test("detached mm/basis mapping previews exact geometry and commits one reversible receipt transaction",async()=>{
  const before=documentState(),p=plan(),preview=await previewCadCommand(p.command);
  assert.ok(preview.result.ok,preview.result.reason); assert.deepEqual(documentState(),before);
  assert.equal(preview.impact?.find(i=>i.kind==="Exchange source receipts")?.created,1);
  assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);
  const receipt=cadDocument.exchangeImports![p.receipt.id];assert.deepEqual(receipt,p.receipt);
  const line=world(cadDocument,receipt.mappings[0].objectId);for(const [i,expected] of [[2540,5080,76.2],[2540,5130.8,76.2]].entries())for(let axis=0;axis<3;axis++)assert.ok(Math.abs(line.points![i][axis]-expected[axis])<1e-8);
  assert.equal(cadHistory.getPastLabels().length,1);assert.equal(cadDocument.rootObjects.length,2);
  const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
});
test("all declared units and non-XY basis normalize without flattening; arbitrary planes are excluded",async()=>{
  for(const [unit,factor] of [["mm",1],["cm",10],["m",1000],["inch",25.4]] as const){resetTestDocument();const fixture=exchangeFixture();fixture.coordinates={unit,origin:[1,2,3],axes:[[1,0,0],[0,0,1],[0,-1,0]]};const p=await importFixture(fixture);const line=world(cadDocument,p.receipt.mappings[0].objectId);assert.deepEqual(line.points,[[factor,2*factor,3*factor],[3*factor,2*factor,3*factor]]);}
  const fixture=exchangeFixture();fixture.coordinates=identityCoordinates();fixture.entities.push({kind:"line",sourceId:"oblique",points:[[0,0,0],[1,2,3]]});const p=plan(fixture);assert.equal(p.stats.created,2);assert.ok(p.receipt.losses.some(l=>l.code==="unsupported-plane"));
});
test("unsupported and asset-dependent entities are excluded with retained manifest and explicit losses",async()=>{
  const fixture=exchangeFixture();fixture.assets=[{id:"texture",mediaType:"image/png",byteLength:100,sha256:"a".repeat(64)}];fixture.entities[1].assetIds=["texture"];fixture.entities.push({kind:"unsupported",sourceId:"wall",reason:"IFC wall has no fixture representation."});fixture.losses=[{code:"source-warning",message:"Source wall tessellation omitted.",sourceId:"wall"}];
  const p=await importFixture(fixture);assert.equal(p.stats.created,1);assert.equal(p.receipt.assets[0].sha256,"a".repeat(64));assert.equal(p.receipt.losses.length,4);assert.equal(cadDocument.rootObjects.length,1);
  const exported=decodeFixture(encodeFixture(cadDocument).text);assert.equal(exported.assets.length,1);assert.ok(exported.losses.some(l=>l.message.includes("bytes")));
  fixture.entities[0].assetIds=["texture"];assert.throws(()=>plan(fixture),/No supported/);
});
test("repeated import uses fresh WebCAD IDs while retaining the stable source identity tuple",async()=>{
  const first=await importFixture(),original=documentState(),second=await importFixture();assert.equal(cadDocument.rootObjects.length,4);
  assert.notEqual(first.receipt.id,second.receipt.id);assert.notEqual(first.receipt.mappings[0].objectId,second.receipt.mappings[0].objectId);
  assert.deepEqual(first.receipt.mappings[0].provenance,second.receipt.mappings[0].provenance);
  for(const [id,obj] of Object.entries(original.objects))assert.deepEqual(cadDocument.objects[id],obj);
  assert.ok(undoDocument());assert.deepEqual(documentState(),original);
});
test("stale, locked and partial-failure imports are atomic including receipts, views and History",async()=>{
  const p=plan(),preview=await previewCadCommand(p.command);await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:true});let before=documentState(),labels=cadHistory.getPastLabels();assert.equal((await applyCadPlan(preview.planId)).ok,false);discardCadPlan(preview.planId);assert.deepEqual(documentState(),before);
  const locked=await dispatchCadCommand(plan().command);assert.equal(locked.ok,false);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),labels);
  await dispatchCadCommand({type:"set-layer-locked",layerId:"layer-default",locked:false});const bad=plan();bad.receipt.mappings[1].objectId="missing";before=documentState();labels=cadHistory.getPastLabels();const failed=await dispatchCadCommand(bad.command);assert.equal(failed.ok,false);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),labels);assert.equal(cadDocument.exchangeImports,undefined);
});
test("v16 portable files, recovery, old-version gates and File New/Open preserve or remove provenance",async()=>{
  const old=serializeDocument(cadDocument);const p=await importFixture(),saved=documentState(),text=serializeDocument(cadDocument);assert.equal(JSON.parse(text).version,16);assert.deepEqual(deserializeDocument(text),cadDocument);
  const entries=new Map<string,string>(),storage={getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>{entries.set(key,value);}};writeRecoveryCheckpoint(storage,cadDocument);assert.deepEqual(readRecoveryCheckpoint(storage)!.document,cadDocument);
  for(let version=1;version<16;version++){const file=JSON.parse(text);file.version=version;assert.throws(()=>deserializeDocument(JSON.stringify(file)),/version 16/);assert.equal(deserializeDocument(JSON.stringify({...JSON.parse(old),version})).exchangeImports,undefined);}
  newDocument();assert.equal(cadDocument.exchangeImports,undefined);await openDocumentFile(new File([text],"fixture.webcad.json"));assert.deepEqual(documentState(),saved);
  const invalid=JSON.parse(text);invalid.document.exchangeImports[p.receipt.id].mappings[0].provenance.objectId="__proto__";await assert.rejects(openDocumentFile(new File([JSON.stringify(invalid)],"bad.json")),/exchange/);assert.deepEqual(documentState(),saved);
  await openDocumentFile(new File([old],"old.json"));assert.equal(cadDocument.exchangeImports,undefined);
});
test("import-edit-export-reimport retains exact world geometry and original provenance using canonical mm",async()=>{
  const imported=await importFixture(),ids=imported.receipt.mappings.map(m=>m.objectId);
  const moved=await dispatchCadCommand({type:"move-object",objectId:ids[0],translation:[10,-20,5]});assert.ok(moved.ok,moved.reason);
  const before=documentState(),labels=cadHistory.getPastLabels(),exported=encodeFixture(cadDocument),fixture=decodeFixture(exported.text);assert.equal(exported.entities,2);assert.deepEqual(fixture.coordinates,identityCoordinates());assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),labels);
  const p=await importFixture(fixture);for(let i=0;i<2;i++){assert.deepEqual(p.receipt.mappings[i].provenance,imported.receipt.mappings[i].provenance);const a=world(cadDocument,ids[i]).points!,b=world(cadDocument,p.receipt.mappings[i].objectId).points!;assert.deepEqual(b,a);}
});
test("deleted source mappings stay historical and solid geometry reports explicit exclusions",async()=>{
  const p=await importFixture(),id=p.receipt.mappings[0].objectId;await dispatchCadCommand({type:"delete-object",objectId:id});assert.ok(cadDocument.exchangeImports![p.receipt.id].mappings.some(m=>m.objectId===id));assert.doesNotThrow(()=>deserializeDocument(serializeDocument(cadDocument)));
  await dispatchCadCommand({type:"create-box",id:"box",width:10,height:10,depth:10});const exported=decodeFixture(encodeFixture(cadDocument).text);assert.ok(exported.losses.some(l=>l.code==="deleted-source-object"));assert.ok(exported.entities.some(e=>e.kind==="unsupported"&&e.sourceId==="box"));
  assert.equal(exported.entities.filter(e=>e.kind!=="unsupported").length,1);
});
test("exact rotated rectangles export, while sheared or hidden rectangles are explicitly excluded",async()=>{
  const fixture=exchangeFixture();fixture.coordinates=identityCoordinates();fixture.entities[1]={kind:"rectangle",sourceId:"diamond",points:[[0,0,0],[1,1,0],[0,2,0],[-1,1,0]]};
  const p=await importFixture(fixture),id=p.receipt.mappings[1].objectId;assert.equal(encodeFixture(cadDocument).entities,2);
  assert.ok((await dispatchCadCommand({type:"scale-object",objectId:id,scale:[2,1,1]})).ok);
  let exported=decodeFixture(encodeFixture(cadDocument).text);assert.ok(exported.entities.some(e=>e.sourceId===id&&e.kind==="unsupported"));assert.ok(exported.losses.some(l=>l.message.includes("exact fixture subset")));
  assert.ok(undoDocument());await dispatchCadCommand({type:"set-object-visible",objectId:id,visible:false});exported=decodeFixture(encodeFixture(cadDocument).text);assert.ok(exported.losses.some(l=>l.message.includes("Hidden geometry")));
});
test("detached input aliases cannot alter a reviewed plan; selected export omits unrelated source manifests",async()=>{
  const p=plan(),preview=await previewCadCommand(p.command);p.receipt.documentId="mutated";assert.ok((await applyCadPlan(preview.planId)).ok);discardCadPlan(preview.planId);assert.equal(Object.values(cadDocument.exchangeImports!)[0].documentId,"source-survey");
  const fixture=exchangeFixture();fixture.assets=[{id:"foreign",mediaType:"image/png",byteLength:1,sha256:"b".repeat(64)}];await importFixture(fixture);
  const first=Object.values(cadDocument.exchangeImports!)[0],exported=decodeFixture(encodeFixture(cadDocument,[first.mappings[0].objectId]).text);assert.equal(exported.entities.length,1);assert.equal(exported.assets.length,0);
});
