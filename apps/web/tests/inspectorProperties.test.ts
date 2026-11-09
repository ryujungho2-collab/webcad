import test from "node:test";
import assert from "node:assert/strict";
import {primitivePropertyEdit} from "../src/properties/inspectorEdits";
import {readInspectorSection,writeInspectorSection,INSPECTOR_PREFERENCES_KEY} from "../src/properties/inspectorPreferences";
import {resetTestDocument} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory,undoDocument} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
test("primitive property edits convert units and patch just the entered dimension atomically",async()=>{
  resetTestDocument();for(const [id,width,depth] of [["a",10,20],["b",30,40]] as const)assert.ok((await dispatchCadCommand({type:"create-primitive",id,primitive:"box",params:{width,depth,height:5}})).ok);
  const before=JSON.stringify(cadDocument),history=cadHistory.past.length,command=primitivePropertyEdit(cadDocument,["a","b"],"width","2in")!;
  assert.equal(JSON.stringify(cadDocument),before);assert.equal(command.type,"batch");assert.ok((await dispatchCadCommand(command)).ok);assert.equal(cadHistory.past.length,history+1);
  const params=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!.params;
  assert.equal(params("a").width,50.8);assert.equal(params("b").width,50.8);assert.equal(params("a").depth,20);assert.equal(params("b").depth,40);
  undoDocument();assert.equal(params("a").width,10);assert.equal(params("b").width,30);
});
test("invalid, locked, mixed kinds and unsupported property inputs never mutate sources",async()=>{
  resetTestDocument();await dispatchCadCommand({type:"create-primitive",id:"a",primitive:"box",params:{width:10,depth:20,height:5}});
  const before=JSON.stringify(cadDocument);for(const draft of ["", "Mixed","bad","0","-2cm"])assert.throws(()=>primitivePropertyEdit(cadDocument,["a"],"width",draft),/positive/);
  assert.throws(()=>primitivePropertyEdit(cadDocument,["a"],"missing","2cm"),/not supported/);assert.equal(primitivePropertyEdit(cadDocument,["a"],"width","1cm"),undefined);assert.equal(JSON.stringify(cadDocument),before);
  cadDocument.layers["layer-default"].locked=true;assert.throws(()=>primitivePropertyEdit(cadDocument,["a"],"width","2cm"),/unlock/);
});
test("inspector collapse settings are scoped UI data and tolerate damaged or full storage",()=>{
  const data=new Map<string,string>([["document","source bytes"]]),storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
  assert.equal(readInspectorSection(storage,"primitive:Dimensions",true),true);assert.equal(writeInspectorSection(storage,"primitive:Dimensions",false),true);assert.equal(readInspectorSection(storage,"primitive:Dimensions",true),false);assert.equal(readInspectorSection(storage,"sketch:Dimensions",true),true);assert.equal(data.get("document"),"source bytes");
  storage.setItem(INSPECTOR_PREFERENCES_KEY,"broken");assert.equal(readInspectorSection(storage,"primitive:Dimensions",true),true);
  assert.equal(writeInspectorSection({...storage,setItem(){throw Error("quota");}},"primitive:Dimensions",false),false);
});
