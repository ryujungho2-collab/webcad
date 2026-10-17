import test from "node:test";
import assert from "node:assert/strict";
import { CheckpointGate, projectStorage } from "../src/app/projectSession";
import { discoverWorkspace, initialWorkspace, parseWorkspace, readWorkspace, recoveryArchive, restoreWorkspace, writeWorkspace, WORKSPACE_KEY, WORKSPACE_BACKUP_KEY, WORKSPACE_DAMAGED_KEY } from "../src/app/projectWorkspaceStore";
import { writeRecoveryCheckpoint, DOCUMENT_CACHE_KEY } from "../src/state/documentRecovery";
import type { CadDocument } from "@agent-webcad/cad-document";

function memoryStorage() {
  const values = new Map<string,string>();
  return { values, get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key,value); }, removeItem: (key: string) => { values.delete(key); } };
}
const document: CadDocument = { id: "same-document", revision: 0, objects: {}, features: {}, sketches: {}, layers: {}, rootLayers: [], rootObjects: [] };

test("project list keeps a verified backup and offers explicit restoration without overwriting corrupt data", () => {
  const storage = memoryStorage(), first = initialWorkspace(); writeWorkspace(storage, first);
  const next = { ...first, projects: [...first.projects,{id:"b",title:"B",closed:false}],active:"b" };
  writeWorkspace(storage, next); assert.deepEqual(readWorkspace(storage).workspace, next);
  storage.setItem(WORKSPACE_KEY, "damaged");
  const result = readWorkspace(storage); assert.equal(result.blocked,true); assert.deepEqual(result.backup,first);
  assert.equal(storage.getItem(WORKSPACE_KEY),"damaged"); assert.throws(() => writeWorkspace(storage,next));
  restoreWorkspace(storage,result.backup!); assert.equal(readWorkspace(storage).blocked,false);
  assert.equal(JSON.parse(storage.getItem(WORKSPACE_DAMAGED_KEY)!).primary,"damaged");
});
test("quota failure preserves the previous list; a retry succeeds after storage becomes available", () => {
  const storage = memoryStorage(), first = initialWorkspace(); writeWorkspace(storage,first);
  const next = { ...first,active:"",projects:first.projects.map(p=>({...p,closed:true})) };
  const full = { ...storage,setItem:(key:string,value:string)=>{if(key===WORKSPACE_KEY)throw Error("Quota exceeded");storage.setItem(key,value);} };
  assert.throws(()=>writeWorkspace(full,next),/Quota/); assert.deepEqual(readWorkspace(storage).workspace,first);
  writeWorkspace(storage,next); assert.deepEqual(readWorkspace(storage).workspace,next);
});
test("failed explicit repair keeps damaged primary and valid backup, and preserves the first damaged archive", () => {
  const storage=memoryStorage();writeWorkspace(storage,initialWorkspace());storage.setItem(WORKSPACE_KEY,"broken");
  const full={...storage,setItem:(key:string,value:string)=>{if(key===WORKSPACE_KEY)throw Error("Quota exceeded");storage.setItem(key,value);}};
  assert.throws(()=>restoreWorkspace(full,initialWorkspace()),/Quota/);
  const archive=storage.getItem(WORKSPACE_DAMAGED_KEY);assert.equal(storage.getItem(WORKSPACE_KEY),"broken");assert.ok(readWorkspace(storage).backup);
  restoreWorkspace(storage,initialWorkspace());assert.equal(storage.getItem(WORKSPACE_DAMAGED_KEY),archive);
  storage.setItem(WORKSPACE_KEY,"second corruption");restoreWorkspace(storage,initialWorkspace());
  const all=JSON.parse(storage.getItem(WORKSPACE_DAMAGED_KEY)!);assert.equal(all.primary,"broken");assert.ok(all.copies.some((copy:{primary:string})=>copy.primary==="second corruption"));
});
test("damaged/missing lists can rescue independent namespaces and preserve unreadable projects in the raw archive", () => {
  const storage=memoryStorage();storage.setItem(WORKSPACE_KEY,"bad");storage.setItem(WORKSPACE_BACKUP_KEY,"also bad");
  writeRecoveryCheckpoint(projectStorage(storage,"a"),document);writeRecoveryCheckpoint(projectStorage(storage,"b"),document);
  projectStorage(storage,"c").setItem(DOCUMENT_CACHE_KEY,"unreadable");storage.setItem("unrelated-private-value","excluded");
  const rescued=discoverWorkspace(storage);assert.deepEqual(rescued.workspace.projects.map(p=>p.id),["a","b"]);assert.equal(rescued.failed,1);
  const archive=JSON.parse(recoveryArchive(storage));assert.equal(archive.entries[WORKSPACE_KEY],"bad");assert.equal(archive.entries["unrelated-private-value"],undefined);
  assert.equal(archive.entries[`agent-webcad-project:c:${DOCUMENT_CACHE_KEY}`],"unreadable");
  restoreWorkspace(storage,rescued.workspace);assert.equal(readWorkspace(storage).workspace.projects.length,2);
  assert.equal(projectStorage(storage,"c").getItem(DOCUMENT_CACHE_KEY),"unreadable");
});
test("manifest rejects duplicate identities, invalid names/types and oversized lists and normalizes stale UI metadata", () => {
  const base=initialWorkspace();for(const next of [null,{...base,active:5},{...base,projects:[...base.projects,...base.projects]},
    {...base,projects:[{id:5,title:"A",closed:false}]},{...base,projects:[{id:"a",title:" ",closed:false}]},
    {...base,projects:Array.from({length:201},(_,i)=>({id:`id-${i}`,title:"A",closed:false}))}])assert.throws(()=>parseWorkspace(JSON.stringify(next)));
  assert.deepEqual(parseWorkspace(JSON.stringify({...base,active:"missing",projects:[{...base.projects[0],modified:true}]})),base);
});
test("close gate accepts only the exact live session, request and deadline and blocks double close", () => {
  const gate=new CheckpointGate(),request=gate.begin("a","session-a","close",100);
  assert.equal(gate.matches(request,200),true);assert.throws(()=>gate.begin("b","session-b","close",200),/in progress/);
  for(const mismatch of [{...request,id:"b"},{...request,generation:"reloaded"},{...request,requestId:"old"}])assert.equal(gate.matches(mismatch,200),false);
  assert.equal(gate.matches(request,10100),false);
  gate.clear();const retry=gate.begin("a","session-a","close",11000);
  assert.equal(gate.matches(request,11001),false);assert.equal(gate.matches(retry,11001),true);
  gate.clear();const reopened=gate.begin("a","new-session","close",12000);
  assert.equal(gate.matches(retry,12001),false);assert.equal(gate.matches(reopened,12001),true);
});
