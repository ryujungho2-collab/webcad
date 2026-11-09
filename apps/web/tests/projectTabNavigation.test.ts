import test from "node:test";
import assert from "node:assert/strict";
import {orderedOpenProjects,pinProjectTab,moveProjectTab,reorderProjectTab,findOpenProjects,isProjectSearchShortcut} from "../src/app/projectTabs";
import {parseWorkspace,writeWorkspace,readWorkspace,WORKSPACE_KEY} from "../src/app/projectWorkspaceStore";
import type {Workspace} from "../src/app/projectWorkspaceStore";
const workspace=():Workspace=>({version:1,active:"a",projects:[{id:"a",title:"중정 주거 A",closed:false},{id:"closed",title:"닫힌 프로젝트",closed:true},{id:"b",title:"중정 주거 B",closed:false},{id:"c",title:"Motor",closed:false}]});
const ids=(w:Workspace)=>orderedOpenProjects(w).map(p=>p.id);
test("optional pins migrate old v1 manifests and roundtrip with project identity unchanged",()=>{
  const w=workspace();assert.deepEqual(parseWorkspace(JSON.stringify(w)),w);
  const pinned=pinProjectTab(w,"c");assert.deepEqual(ids(pinned),["c","a","b"]);assert.equal(pinned.active,"a");
  assert.deepEqual(parseWorkspace(JSON.stringify(pinned)),pinned);
  assert.deepEqual(pinProjectTab(pinned,"c"),w);
  assert.throws(()=>parseWorkspace(JSON.stringify({...w,projects:[{...w.projects[0],pinned:"yes"}]})),/Invalid/);
});
test("pointer and keyboard moves preserve closed records, active ID and all project metadata",()=>{
  const w=workspace(),moved=reorderProjectTab(w,"c","a",true);
  assert.deepEqual(ids(moved),["c","a","b"]);assert.equal(moved.projects[1],w.projects[1]);assert.equal(moved.active,"a");
  assert.deepEqual(ids(moveProjectTab(moved,"c",1)),["a","c","b"]);
  assert.equal(moveProjectTab(w,"a",-1),w);assert.equal(reorderProjectTab(w,"a","a",true),w);
  assert.deepEqual(ids(w),["a","b","c"]);
});
test("pinned groups cannot be crossed by drag or keyboard and closed tabs cannot be reordered",()=>{
  const pinned=pinProjectTab(workspace(),"c");assert.equal(moveProjectTab(pinned,"c",1),pinned);
  assert.throws(()=>reorderProjectTab(pinned,"a","c",true),/within/);
  assert.throws(()=>reorderProjectTab(pinned,"closed","a",true),/open/);
  assert.throws(()=>pinProjectTab(pinned,"closed"),/open/);
});
test("search is case-insensitive, Unicode normalized, accepts IDs and excludes closed projects",()=>{
  const w=workspace();assert.deepEqual(findOpenProjects(w.projects,"주거").map(p=>p.id),["a","b"]);
  assert.equal(findOpenProjects(w.projects," MOTOR ")[0].id,"c");
  assert.equal(findOpenProjects(w.projects,"닫힌").length,0);assert.equal(findOpenProjects(w.projects,"not found").length,0);
  assert.equal(findOpenProjects(w.projects,"중정".normalize("NFD")).length,2);
});
test("failed order persistence keeps the previous primary and its valid backup; retry roundtrips pin/order",()=>{
  const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  const w=workspace();writeWorkspace(storage,w);const changed=moveProjectTab(pinProjectTab(w,"b"),"c",-1);
  assert.throws(()=>writeWorkspace({...storage,setItem:(key,value)=>{if(key===WORKSPACE_KEY)throw Error("Quota");storage.setItem(key,value);}},changed),/Quota/);
  assert.deepEqual(readWorkspace(storage).workspace,w);writeWorkspace(storage,changed);assert.deepEqual(readWorkspace(storage).workspace,changed);
});
test("project search does not claim browser Ctrl+Tab or composing/repeated/prevented keys",()=>{
  const chord={key:"p",altKey:true,shiftKey:true,ctrlKey:false,metaKey:false,isComposing:false,defaultPrevented:false,repeat:false};
  assert.equal(isProjectSearchShortcut(chord),true);
  for(const patch of [{isComposing:true},{repeat:true},{defaultPrevented:true},{ctrlKey:true},{metaKey:true},{key:"Tab"},{shiftKey:false}])assert.equal(isProjectSearchShortcut({...chord,...patch}),false);
});
