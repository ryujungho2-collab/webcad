import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {compareProjectRevisions,encodeProjectBundle,importProjectBundle,parseProjectBundle,MAX_BUNDLE_BYTES} from "../src/app/projectBundle";
import {projectTemplate} from "../src/app/projectTemplates";
import {projectStorage} from "../src/app/projectSession";
import {readRecoveryCheckpoint} from "../src/state/documentRecovery";
import {WORKSPACE_KEY,writeWorkspace,type Workspace} from "../src/app/projectWorkspaceStore";
import {recoverStorageTransactions,type StorageUndo} from "../src/app/projectStorageTransactions";
function storage(){const values=new Map<string,string>();return {values,get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,clear:()=>values.clear(),getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};}
function journal(){const values=new Map<string,StorageUndo>();return {values,list:async()=>[...values.values()],put:async(v:StorageUndo)=>{values.set(v.id,structuredClone(v));},remove:async(id:string)=>{values.delete(id);}};}
const workspace=():Workspace=>({version:1,active:"same",projects:[{id:"same",title:"Local project",closed:false}]});
async function fixture(){const a=projectTemplate("residential-plan"),b=projectTemplate("mechanical-plate");a.id="source-a";b.id="source-b";const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=","base64"),hash=createHash("sha256").update(bytes).digest("hex"),id=`asset-${hash}`;a.rasterAssets={[id]:{id,name:"source.png",width:1,height:1,mimeType:"image/png",byteLength:bytes.length,contentHash:hash,dataUrl:`data:image/png;base64,${bytes.toString("base64")}`}};return parseProjectBundle(await encodeProjectBundle([{id:"same",title:"주거 A",document:a},{id:"other",title:"Plate B",document:b}]));}
test("bundle roundtrip validates sources and imports all projects in independent namespaces without mutating the source",async()=>{
 const bundle=await fixture(),s=storage(),j=journal(),w=workspace();writeWorkspace(s,w);s.setItem("unrelated","keep");const source=JSON.stringify(bundle);
 const next=await importProjectBundle(s,w,bundle,j);assert.equal(next.projects.length,3);assert.equal(next.projects[0].id,"same");assert.equal(next.projects[1].closed,false);assert.equal(next.projects[2].closed,true);
 for(let i=0;i<2;i++){const project=next.projects[i+1],document=readRecoveryCheckpoint(projectStorage(s,project.id))!.document;assert.notEqual(project.id,bundle.projects[i].id);assert.notEqual(document.id,bundle.projects[i].document.id);assert.deepEqual(document.rootObjects,bundle.projects[i].document.rootObjects);assert.deepEqual(document.rasterAssets,bundle.projects[i].document.rasterAssets);}
 assert.equal(JSON.stringify(bundle),source);assert.equal(s.getItem("unrelated"),"keep");assert.equal(j.values.size,0);
});
test("invalid format, duplicate identity, missing asset, checksum mismatch and oversize bundles fail before storage",async()=>{
 const bundle=await fixture();await assert.rejects(parseProjectBundle('{"version":2}'),/Invalid/);await assert.rejects(parseProjectBundle(" ".repeat(MAX_BUNDLE_BYTES+1)),/16 MiB/);
 const duplicate=structuredClone(bundle);duplicate.projects.push(duplicate.projects[0]);await assert.rejects(parseProjectBundle(JSON.stringify(duplicate)),/duplicate/);
 const corrupt=structuredClone(bundle);Object.values(corrupt.projects[0].document.rasterAssets!)[0].contentHash="a".repeat(64);await assert.rejects(parseProjectBundle(JSON.stringify(corrupt)));
 const missing=structuredClone(bundle);const original=Object.values(missing.projects[0].document.features)[0];missing.projects[0].document.features[original.id]={id:original.id,type:"image",inputs:[],output:original.output,params:{kind:"image",assetId:"asset-missing",workPlane:"XY",width:10,height:10,crop:{x:0,y:0,width:1,height:1}}};await assert.rejects(parseProjectBundle(JSON.stringify(missing)),/image asset reference/);
});
test("quota failure rolls back every project namespace and workspace list together",async()=>{
 const bundle=await fixture(),s=storage(),j=journal(),w=workspace();writeWorkspace(s,w);s.setItem("unrelated","keep");const before=[...s.values].sort(),set=s.setItem,primary=s.getItem(WORKSPACE_KEY);
 s.setItem=(key,value)=>{if(key===WORKSPACE_KEY&&value!==primary)throw Error("Quota");set(key,value);};await assert.rejects(importProjectBundle(s,w,bundle,j),/Quota/);assert.deepEqual([...s.values].sort(),before);assert.equal(j.values.size,0);
});
test("a stale workspace review never overwrites another window's project list",async()=>{
 const bundle=await fixture(),s=storage(),j=journal(),w=workspace();writeWorkspace(s,w);const changed={...w,projects:[...w.projects,{id:"external",title:"Newer",closed:true}]};const put=j.put;
 j.put=async record=>{await put(record);s.setItem(WORKSPACE_KEY,JSON.stringify(changed));};await assert.rejects(importProjectBundle(s,w,bundle,j),/changed/);assert.deepEqual(JSON.parse(s.getItem(WORKSPACE_KEY)!),changed);assert.equal([...s.values.keys()].some(key=>key.startsWith("agent-webcad-project:")),false);
});
test("interrupted multi-project journal restores all namespaces and rejects unrelated storage keys",async()=>{
 const s=storage(),j=journal(),a="agent-webcad-project:a:checkpoint",b="agent-webcad-project:b:checkpoint";
 s.setItem(a,"new a");s.setItem(b,"new b");await j.put({id:"transaction",target:"a",targets:["a","b"],committed:false,before:{[a]:null,[b]:"old b"},after:{[a]:"new a",[b]:"new b"}});assert.equal(await recoverStorageTransactions(s,j),1);assert.equal(s.getItem(a),null);assert.equal(s.getItem(b),"old b");
 await j.put({id:"bad",target:"a",targets:["a","b"],committed:false,before:{unrelated:null},after:{unrelated:"bad"}});await assert.rejects(recoverStorageTransactions(s,j),/ownership/);
});
test("revision comparison counts content changes even with equal or older revision numbers",async()=>{
 const bundle=await fixture(),local=bundle.projects[0].document,incoming=structuredClone(local),id=incoming.rootObjects[0];incoming.objects[id].name="Changed";incoming.revision=Math.max(0,local.revision-1);incoming.rootObjects.reverse();const rows=compareProjectRevisions(local,incoming);assert.equal(rows.find(r=>r.section==="objects")!.changed,1);assert.equal(rows.find(r=>r.section==="document settings & order")!.changed,1);assert.equal(compareProjectRevisions(local,local).some(r=>r.added||r.removed||r.changed),false);
});

test("revision comparison ignores JSON object key order while retaining ordered geometry and root arrays",async()=>{
 const bundle=await fixture(),local=bundle.projects[0].document,incoming=structuredClone(local),id=local.rootObjects[0];
 incoming.objects[id]=Object.fromEntries(Object.entries(incoming.objects[id]).reverse()) as typeof incoming.objects[string];
 assert.equal(compareProjectRevisions(local,incoming).some(r=>r.added||r.removed||r.changed),false);
});
test("bundle capacity and unsupported versions reject without publishing any project",async()=>{
 const bundle=await fixture(),s=storage(),j=journal();await assert.rejects(parseProjectBundle(JSON.stringify({...bundle,version:2})),/Invalid/);
 const full:Workspace={version:1,active:"",projects:Array.from({length:199},(_,i)=>({id:`p-${i}`,title:`P${i}`,closed:true}))};writeWorkspace(s,full);const before=[...s.values];await assert.rejects(importProjectBundle(s,full,bundle,j),/200/);assert.deepEqual([...s.values],before);
});
