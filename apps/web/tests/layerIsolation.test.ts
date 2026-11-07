import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { serializeDocument } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { documentSessionIdentity, documentVersion } from "../src/state/documentSession";
import { openDocumentFile, newDocument } from "../src/state/documentFile";
import { createViewportIsolation, reconcileViewportIsolation, isolatedViewportObjectIds } from "../src/state/viewportIsolation";
import { selectAllIds } from "../src/state/selection";
import { collectExportDrawings } from "../src/export/exportModel";
import { resetTestDocument } from "./helpers/documentHarness";

const apply = async (command: CadCommand) => { const result = await dispatchCadCommand(command); assert.ok(result.ok, result.reason); };
const line = (id: string, layerId: string): CadCommand => ({type:"create-drawing", id, layerId, drawing:"line", params:{workPlane:"XY", points:[[0,0,0],[10,0,0]]}});
const isolate = (ids: string[]) => createViewportIsolation(cadDocument, "layers", ids, documentSessionIdentity());
const members = (state: ReturnType<typeof isolate>) => isolatedViewportObjectIds(cadDocument, reconcileViewportIsolation(cadDocument, state, documentSessionIdentity()));
beforeEach(async () => {
  resetTestDocument();
  for (const id of ["a", "b", "hidden", "locked"]) await apply({type:"create-layer", id, name:id});
  for (const [id, layer] of [["a1","a"],["a2","a"],["b1","b"],["h1","hidden"],["l1","locked"]]) await apply(line(id,layer));
  await apply({type:"set-layer-visible",layerId:"hidden",visible:false});
  await apply({type:"set-layer-locked",layerId:"locked",locked:true});
});

test("layer filter deduplicates membership and leaves document, revision, History and export unchanged", () => {
  const before=serializeDocument(cadDocument), version=documentVersion(), history=cadHistory.getStateToken(), exported=collectExportDrawings("XY");
  const state=isolate(["a1","a2","b1","missing"]);
  assert.deepEqual(state?.ids,["a","b"]);
  assert.deepEqual(members(state),["a1","a2","b1"]);
  assert.equal(serializeDocument(cadDocument),before);
  assert.deepEqual(documentVersion(),version);
  assert.equal(cadHistory.getStateToken(),history);
  assert.deepEqual(collectExportDrawings("XY"),exported);
  assert.equal(members(null),null);
  assert.equal(isolate([]),null); assert.equal(isolate(["missing"]),null);
});

test("membership never overrides hidden objects, hidden layers or locks", async () => {
  await apply({type:"set-object-visible",objectId:"a2",visible:false});
  const state=isolate(["a1","h1","l1"]), allowed=new Set(members(state));
  assert.deepEqual(selectAllIds(cadDocument).filter(id=>allowed.has(id)),["a1"]);
  assert.equal(cadDocument.layers.hidden.visible,false);
  assert.equal(cadDocument.layers.locked.locked,true);
  assert.equal(cadDocument.objects.a2.visible,false);
});

test("new objects and layer moves update membership, new layers do not join the filter", async () => {
  const state=isolate(["a1"]);
  await apply(line("new-a","a")); await apply(line("new-b","b"));
  await apply({type:"create-layer",id:"new-layer"}); await apply(line("new-layer-line","new-layer"));
  await apply({type:"move-object-to-layer",objectId:"b1",layerId:"a"});
  await apply({type:"move-object-to-layer",objectId:"a2",layerId:"b"});
  assert.deepEqual(members(state)?.sort(),["a1","b1","new-a"]);
});

test("deleted target layers are pruned, no layers are recreated, last deletion exits", async () => {
  let state=isolate(["a1","b1"]);
  await apply({type:"delete-layer",layerId:"a"});
  state=reconcileViewportIsolation(cadDocument,state,documentSessionIdentity());
  assert.deepEqual(state?.ids,["b"]);assert.equal(cadDocument.layers.a,undefined);
  await apply({type:"delete-layer",layerId:"b"});
  assert.equal(reconcileViewportIsolation(cadDocument,state,documentSessionIdentity()),null);
});

test("ordinary edits and Undo/Redo preserve the view session and explicit visibility edits", async () => {
  const state=isolate(["a1"]), identity=documentSessionIdentity();
  await apply({type:"set-layer-visible",layerId:"a",visible:false});
  assert.equal(reconcileViewportIsolation(cadDocument,state,identity),state);
  undoDocument();assert.equal(cadDocument.layers.a.visible,true);
  redoDocument();assert.equal(cadDocument.layers.a.visible,false);
  assert.equal(documentSessionIdentity(),identity);
  assert.equal(members(null),null);assert.equal(cadDocument.layers.a.visible,false);
});

test("same-ID native reopen and new document invalidate isolation; serialized file has no view filter", async () => {
  const state=isolate(["a1"]), saved=serializeDocument(cadDocument), oldSession=documentSessionIdentity();
  assert.equal(saved.includes('"isolation"'),false);
  await openDocumentFile(new File([saved],"layer.webcad.json"));
  assert.equal(cadDocument.id,"test-document");assert.notEqual(documentSessionIdentity(),oldSession);
  assert.equal(reconcileViewportIsolation(cadDocument,state,documentSessionIdentity()),null);
  assert.equal(cadDocument.layers.hidden.visible,false);assert.equal(cadDocument.layers.locked.locked,true);
  const reopened=isolate(["a1"]);newDocument();
  assert.equal(reconcileViewportIsolation(cadDocument,reopened,documentSessionIdentity()),null);
});

test("object mode preserves exact selected members while layer mode includes siblings", () => {
  const object=createViewportIsolation(cadDocument,"objects",["a1"],documentSessionIdentity());
  assert.deepEqual(members(object),["a1"]);
  assert.deepEqual(members(isolate(["a1"])),["a1","a2"]);
});
