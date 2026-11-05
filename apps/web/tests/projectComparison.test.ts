import test from "node:test";
import assert from "node:assert/strict";
import {COMPARISON_KEY,comparisonRatio,readProjectComparison,reconcileComparison,replaceComparisonPane,type ProjectComparison} from "../src/app/projectComparison";
import type {Workspace} from "../src/app/projectWorkspaceStore";
const layout:ProjectComparison={version:1,pair:["a","b"],ratio:.5};
const workspace=(active="a",closed:string[]=[]):Workspace=>({version:1,active,projects:["a","b","c"].map(id=>({id,title:id,closed:closed.includes(id)}))});

test("comparison preference restores only a valid distinct pair and clamps malformed sizes without touching projects",()=>{
  const read=(value:unknown)=>readProjectComparison({getItem:key=>key===COMPARISON_KEY?JSON.stringify(value):null});
  assert.deepEqual(read(layout),layout);
  for(const value of [null,{...layout,version:2},{...layout,pair:["a","a"]},{...layout,pair:["a",5]},{...layout,pair:"ab"},{...layout,ratio:null}])assert.equal(read(value).pair,null);
  assert.equal(read({...layout,ratio:5}).ratio,.75);
  assert.equal(readProjectComparison({getItem:()=>{throw Error("Storage unavailable");}}).pair,null);
});
test("activating the opposite pane preserves sides; a third project replaces only the previously active pane",()=>{
  assert.equal(reconcileComparison(layout,workspace("b"),"a"),layout);
  assert.deepEqual(reconcileComparison(layout,workspace("c"),"b").pair,["a","c"]);
  assert.deepEqual(reconcileComparison(layout,workspace("c"),"a").pair,["c","b"]);
  assert.deepEqual(layout.pair,["a","b"]);
});
test("closing a displayed project collapses comparison, closing a background tab keeps the pair",()=>{
  assert.equal(reconcileComparison(layout,workspace("b",["a"])).pair,null);
  assert.equal(reconcileComparison(layout,workspace("a",["c"])),layout);
  assert.equal(reconcileComparison(layout,{...workspace(),projects:[]}).pair,null);
});
test("pane selector swaps existing views rather than duplicating an editor",()=>{
  assert.deepEqual(replaceComparisonPane(layout,0,"b").pair,["b","a"]);
  assert.deepEqual(replaceComparisonPane(layout,1,"c").pair,["a","c"]);
  assert.equal(replaceComparisonPane(layout,0,"a"),layout);
});
test("resize keeps 320px per pane at 960px and finite keyboard bounds",()=>{
  const left=comparisonRatio(.1,960),right=comparisonRatio(.9,960);
  assert.ok(left*960-4>=320);
  assert.ok((1-right)*960-4>=320-1e-10);
  assert.equal(comparisonRatio(NaN),.5);
  assert.equal(comparisonRatio(-5),.25);
  assert.equal(comparisonRatio(10),.75);
});
