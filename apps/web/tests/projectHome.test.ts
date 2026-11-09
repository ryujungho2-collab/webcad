import test from "node:test";
import assert from "node:assert/strict";
import {createProjectCopy,homeProjectRows,startsOnProjectHome,saveProjectHomePreference} from "../src/app/projectHomeStore";
import {PROJECT_TEMPLATES,projectTemplate} from "../src/app/projectTemplates";
import {projectHomePreview} from "../src/app/projectHomePreview";
import {projectStorage} from "../src/app/projectSession";
import {readRecoveryCheckpoint} from "../src/state/documentRecovery";
import {writeWorkspace,WORKSPACE_KEY,type Workspace} from "../src/app/projectWorkspaceStore";
import type {StorageUndo} from "../src/app/projectStorageTransactions";
function storage(){const values=new Map<string,string>();return {values,get length(){return values.size;},key:(i:number)=>[...values.keys()][i]??null,clear:()=>values.clear(),getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};}
function journal(){const values=new Map<string,StorageUndo>();return {values,list:async()=>[...values.values()],put:async(v:StorageUndo)=>{values.set(v.id,structuredClone(v));},remove:async(id:string)=>{values.delete(id);}};}
const empty=():Workspace=>({version:1,projects:[],active:""});
test("first-party template snapshots validate and bounded XY previews do not mutate them",()=>{
  for(const template of PROJECT_TEMPLATES){const doc=projectTemplate(template.id),before=JSON.stringify(doc),preview=projectHomePreview(doc);assert.ok(preview.paths.length>0);assert.ok(!preview.viewBox.includes("Infinity"));assert.equal(JSON.stringify(doc),before);assert.notEqual(projectTemplate(template.id),doc);}
  assert.throws(()=>projectTemplate("missing"));
});
test("template copies get independent document/project identities, assets and atomic list membership",async()=>{
  const s=storage(),j=journal(),source=projectTemplate("mechanical-plate"),hash="a".repeat(64);source.rasterAssets={[`asset-${hash}`]:{id:`asset-${hash}`,contentHash:hash,name:"Source",mimeType:"image/png",width:1,height:1,byteLength:1,dataUrl:"data:image/png;base64,AA=="}};
  const original=JSON.stringify(source);writeWorkspace(s,empty());const a=await createProjectCopy(s,empty(),source,"Copy A",j),b=await createProjectCopy(s,a,source,"Copy B",j);
  const ac=readRecoveryCheckpoint(projectStorage(s,a.active))!.document,bc=readRecoveryCheckpoint(projectStorage(s,b.active))!.document;
  assert.notEqual(a.active,b.active);assert.notEqual(ac.id,bc.id);assert.notEqual(ac.id,source.id);assert.equal(JSON.stringify(source),original);assert.equal(b.projects.length,2);assert.ok([...s.values.keys()].some(k=>k.startsWith(`agent-webcad-project:${a.active}:agent-webcad-recovery-asset-`)));assert.ok([...s.values.keys()].some(k=>k.startsWith(`agent-webcad-project:${b.active}:agent-webcad-recovery-asset-`)));assert.equal(j.values.size,0);
});
test("failed project-list publication rolls back staged copies and preserves existing data",async()=>{
  const s=storage(),j=journal(),w=empty();writeWorkspace(s,w);s.setItem("unrelated","keep");const before=[...s.values],set=s.setItem;
  s.setItem=(key,value)=>{if(key===WORKSPACE_KEY&&value!==JSON.stringify(w))throw Error("Quota");set(key,value);};
  await assert.rejects(createProjectCopy(s,w,projectTemplate("residential-plan"),"Copy",j),/Quota/);assert.deepEqual([...s.values].sort(),before.sort());assert.equal(j.values.size,0);
});
test("capacity and stale workspace checks run before copying any template bytes",async()=>{
  const s=storage(),j=journal(),w=empty();writeWorkspace(s,w);const full={...w,projects:Array.from({length:200},(_,i)=>({id:`p-${i}`,title:`P${i}`,closed:true}))};
  await assert.rejects(createProjectCopy(s,full,projectTemplate("residential-plan"),"Copy",j),/200/);s.setItem(WORKSPACE_KEY,JSON.stringify({...w,projects:[{id:"other",title:"Other",closed:true}]}));const before=[...s.values];await assert.rejects(createProjectCopy(s,w,projectTemplate("residential-plan"),"Copy",j),/changed/);assert.deepEqual([...s.values],before);
});
test("home search sorts recents, handles Korean normalization and separates recovery copies",()=>{
  const rows=[{id:"a",title:"주거 검토",closed:false,unlisted:false,lastOpenedAt:10},{id:"b",title:"Plate",closed:true,unlisted:false,lastOpenedAt:20},{id:"c",title:"Recovery",closed:true,unlisted:true}].map(r=>({...r,bytes:0,assetCount:0,checkpoint:true}));
  assert.deepEqual(homeProjectRows(rows,"","all").map(r=>r.id),["b","a"]);assert.equal(homeProjectRows(rows,"주거".normalize("NFD"),"all")[0].id,"a");assert.equal(homeProjectRows(rows,"","closed")[0].id,"b");assert.equal(homeProjectRows(rows,"","recovery")[0].id,"c");
});
test("startup choice is optional UI data and storage failure does not block editing",()=>{const s=storage();assert.equal(startsOnProjectHome(s),true);assert.ok(saveProjectHomePreference(s,false));assert.equal(startsOnProjectHome(s),false);assert.equal(saveProjectHomePreference({setItem(){throw Error("quota");}},true),false);});
