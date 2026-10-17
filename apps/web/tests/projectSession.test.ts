import test from "node:test";
import assert from "node:assert/strict";
import { projectStorage } from "../src/app/projectSession";
import { readRecoveryCheckpoint, writeRecoveryCheckpoint, DOCUMENT_CACHE_KEY } from "../src/state/documentRecovery";
import type { CadDocument } from "@agent-webcad/cad-document";

test("project checkpoints, backups and removal cannot touch another project's identical keys", () => {
  const values = new Map<string,string>();
  const storage = { getItem: (key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>{values.set(key,value);}, removeItem:(key:string)=>{values.delete(key);} };
  const a=projectStorage(storage,"a"), b=projectStorage(storage,"b"), legacy=projectStorage(storage,"legacy");
  const doc:CadDocument={id:"same-document-id",revision:0,objects:{},features:{},sketches:{},layers:{},rootLayers:[],rootObjects:[]};
  writeRecoveryCheckpoint(a,doc);writeRecoveryCheckpoint(b,{...doc,id:"B"});writeRecoveryCheckpoint(legacy,{...doc,id:"legacy"});
  writeRecoveryCheckpoint(a,{...doc,id:"A edited"});
  assert.equal(readRecoveryCheckpoint(a)?.document.id,"A edited");
  assert.equal(readRecoveryCheckpoint(b)?.document.id,"B");
  a.setItem(DOCUMENT_CACHE_KEY,"broken");
  assert.equal(readRecoveryCheckpoint(a)?.document.id,"same-document-id");
  assert.equal(readRecoveryCheckpoint(a)?.recovered,true);
  a.removeItem(DOCUMENT_CACHE_KEY);
  assert.equal(readRecoveryCheckpoint(b)?.document.id,"B");
  assert.equal(readRecoveryCheckpoint(legacy)?.document.id,"legacy");
  a.setItem("asset-same","A");b.setItem("asset-same","B");a.removeItem("asset-same");
  assert.equal(b.getItem("asset-same"),"B");
});
