import test from "node:test";
import assert from "node:assert/strict";
import { deserializeDocument, type CadDocument, type CadRasterAsset } from "@agent-webcad/cad-document";
import { cleanProjectAssets, deleteClosedProject, inspectProjectStorage, portableProject, projectStorageKeys, unusedProjectAssetKeys } from "../src/app/projectManagerStore";
import { recoverStorageTransactions, type StorageJournal, type StorageUndo } from "../src/app/projectStorageTransactions";
import { projectStorage } from "../src/app/projectSession";
import { WORKSPACE_KEY, WORKSPACE_BACKUP_KEY, writeWorkspace, type Workspace } from "../src/app/projectWorkspaceStore";
import { DOCUMENT_CACHE_KEY, DOCUMENT_BACKUP_KEY, DOCUMENT_RASTER_ASSET_PREFIX, readRecoveryCheckpoint, writeRecoveryCheckpoint } from "../src/state/documentRecovery";

function storage(){const values=new Map<string,string>();return {values,get length(){return values.size;},clear:()=>values.clear(),key:(i:number)=>[...values.keys()][i]??null,
  getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};}
function journal(){const values=new Map<string,StorageUndo>();return {values,list:async()=>[...values.values()],put:async(value:StorageUndo)=>{values.set(value.id,structuredClone(value));},remove:async(id:string)=>{values.delete(id);}};}
const area=(value:ReturnType<typeof storage>)=>value as Storage;
const doc=(asset?:CadRasterAsset):CadDocument=>({id:"same-cad-id",revision:0,objects:{},features:{},sketches:{},layers:{},rootLayers:[],rootObjects:[],...(asset?{rasterAssets:{[asset.id]:asset}}:{})});
const image=(hash:string,name:string):CadRasterAsset=>({id:`asset-${hash.repeat(64)}`,contentHash:hash.repeat(64),name,mimeType:"image/png",width:1,height:1,byteLength:1,dataUrl:"data:image/png;base64,AA=="});
function fixture(){const s=storage(),j=journal(),w:Workspace={version:1,active:"b",projects:[{id:"a",title:"한국 도면 A",closed:true},{id:"b",title:"B",closed:false},{id:"legacy",title:"Old",closed:true}]};
  writeWorkspace(s,w);writeRecoveryCheckpoint(projectStorage(s,"a"),doc(image("a","A source")));writeRecoveryCheckpoint(projectStorage(s,"b"),doc(image("a","B source")));writeRecoveryCheckpoint(projectStorage(s,"legacy"),doc());return {s,j,w};}

test("inventory accounts for project, legacy and unlisted bytes without crossing prefix boundaries",()=>{
  const {s,w}=fixture();projectStorage(s,"ab").setItem(DOCUMENT_CACHE_KEY,"orphan");s.setItem("unrelated","retained");
  const inventory=inspectProjectStorage(area(s),w);assert.equal(inventory.rows.length,4);assert.equal(inventory.rows.find(r=>r.id==="ab")!.unlisted,true);
  assert.equal(inventory.rows.find(r=>r.id==="a")!.assetCount,1);assert.ok(inventory.areaBytes>inventory.projectBytes);assert.ok(projectStorageKeys(area(s),"a").every(k=>k.startsWith("agent-webcad-project:a:")));
});
test("portable export is self-contained and retains the selected project's source with an identical internal ID",()=>{
  const {s}=fixture(),a=portableProject(area(s),"a","한국:도면/1"),b=portableProject(area(s),"b","B");
  assert.equal(a.name,"한국_도면_1.webcad.json");assert.equal(deserializeDocument(a.text).rasterAssets![image("a","a").id].name,"A source");
  assert.equal(deserializeDocument(b.text).rasterAssets![image("a","a").id].name,"B source");
  writeRecoveryCheckpoint(projectStorage(s,"a"),{...doc(image("a","A source")),revision:1});projectStorage(s,"a").setItem(DOCUMENT_CACHE_KEY,"damaged");
  assert.equal(portableProject(area(s),"a","A").recovered,true);
});
test("permanent deletion removes only the closed target and filters its entry from primary and backup",async()=>{
  const {s,j,w}=fixture();const b=[...s.values].filter(([k])=>k.startsWith("agent-webcad-project:b:")),legacy=s.getItem(DOCUMENT_CACHE_KEY);
  const next=await deleteClosedProject(area(s),w,"a",j);assert.equal(next.projects.some(p=>p.id==="a"),false);assert.equal(projectStorageKeys(area(s),"a").length,0);
  assert.deepEqual([...s.values].filter(([k])=>k.startsWith("agent-webcad-project:b:")),b);assert.equal(s.getItem(DOCUMENT_CACHE_KEY),legacy);
  assert.equal(JSON.parse(s.getItem(WORKSPACE_BACKUP_KEY)!).projects.some((p:{id:string})=>p.id==="a"),false);assert.equal(j.values.size,0);
});
test("open projects and stale list reviews cannot delete data or write a recovery journal",async()=>{
  const {s,j,w}=fixture(),before=[...s.values];await assert.rejects(deleteClosedProject(area(s),w,"b",j),/Close this project/);
  assert.deepEqual([...s.values],before);assert.equal(j.values.size,0);
  writeWorkspace(s,{...w,projects:w.projects.map(p=>p.id==="a"?{...p,title:"Changed by another window"}:p)});await assert.rejects(deleteClosedProject(area(s),w,"a",j),/list changed/);assert.ok(readRecoveryCheckpoint(projectStorage(s,"a")));
});
test("partial removal and manifest write failures roll back exact checkpoints, image sources and both lists",async()=>{
  for(const fail of ["remove","write"]){
    const {s,j,w}=fixture(),before=new Map(s.values);let fired=false;
    const broken={...s,setItem:(key:string,value:string)=>{if(fail==="write"&&key===WORKSPACE_KEY&&!fired){fired=true;throw Error("Quota fixture");}s.setItem(key,value);},
      removeItem:(key:string)=>{if(fail==="remove"&&key.includes(DOCUMENT_CACHE_KEY)&&!fired){fired=true;throw Error("Remove fixture");}s.removeItem(key);}} as Storage;
    await assert.rejects(deleteClosedProject(broken,w,"a",j),/fixture/);assert.deepEqual(new Map(s.values),before);assert.equal(j.values.size,0);
    assert.equal(readRecoveryCheckpoint(projectStorage(s,"a"))!.document.rasterAssets![image("a","a").id].name,"A source");
  }
});
test("a journal failure before mutation keeps all storage data unchanged",async()=>{
  const {s,w}=fixture(),before=new Map(s.values),j:StorageJournal={list:async()=>[],put:async()=>{throw Error("Journal full");},remove:async()=>{}};
  await assert.rejects(deleteClosedProject(area(s),w,"a",j),/Journal full/);assert.deepEqual(new Map(s.values),before);
});
test("interrupted deletion rolls back before editor load; committed deletion never restores a project",async()=>{
  const {s,j,w}=fixture(),owned=projectStorageKeys(area(s),"a"),before=Object.fromEntries([WORKSPACE_KEY,WORKSPACE_BACKUP_KEY,...owned].map(k=>[k,s.getItem(k)]));
  const next={...w,projects:w.projects.filter(p=>p.id!=="a")},after={...Object.fromEntries(owned.map(k=>[k,null])),[WORKSPACE_KEY]:JSON.stringify(next),[WORKSPACE_BACKUP_KEY]:JSON.stringify(next)};
  await j.put({id:"interrupted",target:"a",committed:false,before,after});s.setItem(WORKSPACE_KEY,after[WORKSPACE_KEY]);s.removeItem(owned[0]);
  assert.equal(await recoverStorageTransactions(area(s),j),1);for(const [k,v]of Object.entries(before))assert.equal(s.getItem(k),v);
  await j.put({id:"committed",target:"a",committed:true,before,after});for(const k of owned)s.removeItem(k);s.setItem(WORKSPACE_KEY,after[WORKSPACE_KEY]);
  assert.equal(await recoverStorageTransactions(area(s),j),0);assert.equal(projectStorageKeys(area(s),"a").length,0);
});
test("image cleanup retains every source in either valid checkpoint and refuses damaged recovery copies",async()=>{
  const {s,j,w}=fixture(),a=projectStorage(s,"a"),old=image("a","old"),current=image("b","current"),unused=image("c","unused");
  writeRecoveryCheckpoint(a,doc(current));a.setItem(DOCUMENT_RASTER_ASSET_PREFIX+unused.id,JSON.stringify(unused));
  assert.equal(unusedProjectAssetKeys(area(s),w,"a").length,1);assert.equal(await cleanProjectAssets(area(s),w,"a",j),1);
  assert.ok(a.getItem(DOCUMENT_RASTER_ASSET_PREFIX+old.id));assert.ok(a.getItem(DOCUMENT_RASTER_ASSET_PREFIX+current.id));
  assert.equal(a.getItem(DOCUMENT_RASTER_ASSET_PREFIX+unused.id),null);assert.ok(projectStorage(s,"b").getItem(DOCUMENT_RASTER_ASSET_PREFIX+old.id));
  a.setItem(DOCUMENT_BACKUP_KEY,"unreadable");await assert.rejects(cleanProjectAssets(area(s),w,"a",j));
});
test("an asynchronous stale preparation preserves another window's updates and newly written source keys",async()=>{
  const {s,j,w}=fixture(),original=j.put;let changed=false;
  j.put=async value=>{await original(value);if(!changed){changed=true;projectStorage(s,"a").setItem("new-source","new");}};
  await assert.rejects(deleteClosedProject(area(s),w,"a",j),/storage changed/);assert.equal(projectStorage(s,"a").getItem("new-source"),"new");assert.ok(readRecoveryCheckpoint(projectStorage(s,"a")));assert.equal(j.values.size,0);
});
test("200 projects at the localStorage limit can free a slot without allocating duplicate local backups",async()=>{
  const s=storage(),j=journal(),w:Workspace={version:1,active:"",projects:Array.from({length:200},(_,i)=>({id:`p-${i}`,title:`Project ${i}`,closed:true}))};
  writeWorkspace(s,w);writeRecoveryCheckpoint(projectStorage(s,"p-0"),doc());const used=()=>[...s.values].reduce((n,[k,v])=>n+k.length+v.length,0),limit=used();
  const full={...s,setItem:(key:string,value:string)=>{const size=used()-(s.getItem(key)?.length??0)+(s.getItem(key)===null?key.length:0)+value.length;if(size>limit)throw Error("Quota exceeded");s.setItem(key,value);}} as Storage;
  const next=await deleteClosedProject(full,w,"p-0",j);assert.equal(next.projects.length,199);assert.ok(used()<limit);
});
test("recovery journal refuses to overwrite storage changed outside the interrupted operation",async()=>{
  const {s,j}=fixture();await j.put({id:"stale",target:"a",committed:false,before:{[WORKSPACE_KEY]:s.getItem(WORKSPACE_KEY)},after:{[WORKSPACE_KEY]:"planned"}});
  s.setItem(WORKSPACE_KEY,"external new list");await assert.rejects(recoverStorageTransactions(area(s),j),/outside this operation/);assert.equal(s.getItem(WORKSPACE_KEY),"external new list");assert.equal(j.values.size,1);
});
test("a second interruption during rollback can resume even after original keys were temporarily removed",async()=>{
  const {s,j}=fixture(),before={[WORKSPACE_KEY]:s.getItem(WORKSPACE_KEY),[DOCUMENT_CACHE_KEY]:s.getItem(DOCUMENT_CACHE_KEY)},after={[WORKSPACE_KEY]:"planned",[DOCUMENT_CACHE_KEY]:null};
  await j.put({id:"rollback-interruption",target:"legacy",committed:false,rollingBack:true,before,after});s.removeItem(WORKSPACE_KEY);s.removeItem(DOCUMENT_CACHE_KEY);
  assert.equal(await recoverStorageTransactions(area(s),j),1);for(const [key,value]of Object.entries(before))assert.equal(s.getItem(key),value);
});
test("failed commit marker rolls back a deletion before reporting success",async()=>{
  const {s,j,w}=fixture(),before=new Map(s.values),put=j.put;let failed=false;
  j.put=async value=>{if(value.committed&&!failed){failed=true;throw Error("Commit marker failed");}await put(value);};
  await assert.rejects(deleteClosedProject(area(s),w,"a",j),/Commit marker/);assert.deepEqual(new Map(s.values),before);assert.equal(j.values.size,0);
});
test("repairing a damaged current checkpoint retains image sources of the actual preserved backup",async()=>{
  const {s,j,w}=fixture(),a=projectStorage(s,"a");
  writeRecoveryCheckpoint(a,{...doc(image("b","new image")),revision:1});
  a.setItem(DOCUMENT_CACHE_KEY,"damaged");writeRecoveryCheckpoint(a,{...doc(image("c","latest image")),revision:2});
  assert.ok(a.getItem(DOCUMENT_RASTER_ASSET_PREFIX+image("a","original").id));
  assert.equal(await cleanProjectAssets(area(s),w,"a",j),1);assert.ok(a.getItem(DOCUMENT_RASTER_ASSET_PREFIX+image("a","original").id));
  a.setItem(DOCUMENT_CACHE_KEY,"damaged again");assert.equal(readRecoveryCheckpoint(a)!.document.rasterAssets![image("a","old").id].name,"A source");
});
test("malformed recovery journal entries cannot change keys owned by another project",async()=>{
  const {s,j}=fixture(),key=`agent-webcad-project:b:${DOCUMENT_CACHE_KEY}`,original=s.getItem(key);
  await j.put({id:"wrong-owner",target:"a",committed:false,before:{[key]:"foreign value"},after:{[key]:original}});
  await assert.rejects(recoverStorageTransactions(area(s),j),/ownership/);assert.equal(s.getItem(key),original);assert.equal(j.values.size,1);
});
