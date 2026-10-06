import assert from "node:assert/strict";
import {test} from "node:test";
import {readRecoveryCheckpoint,writeRecoveryCheckpoint,DOCUMENT_CACHE_KEY,DOCUMENT_BACKUP_KEY} from "../src/state/documentRecovery";
import {resetTestDocument} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";

function storage(){const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};}
test("recovery falls back from a damaged latest copy to the last valid checkpoint",()=>{
  resetTestDocument();const cache=storage(),original=structuredClone(cadDocument);writeRecoveryCheckpoint(cache,original);
  const changed=structuredClone(original);changed.id="newer";writeRecoveryCheckpoint(cache,changed);
  assert.equal(readRecoveryCheckpoint(cache)!.document.id,"newer");cache.data.set(DOCUMENT_CACHE_KEY,'{"format":"agent-webcad","version":1,"document":{"id":"broken"}}');
  const recovered=readRecoveryCheckpoint(cache)!;assert.equal(recovered.recovered,true);assert.deepEqual(recovered.document,original);
  writeRecoveryCheckpoint(cache,changed);assert.equal(readRecoveryCheckpoint(cache)!.recovered,false);assert.equal(cache.data.get(DOCUMENT_BACKUP_KEY),serializeDocument(original));
});
test("storage failures retain a readable checkpoint and do not report successful writes",()=>{
  resetTestDocument();const cache=storage();writeRecoveryCheckpoint(cache,cadDocument);const original=cache.data.get(DOCUMENT_CACHE_KEY);
  const changed=structuredClone(cadDocument);changed.id="unsaved";
  const broken={getItem:cache.getItem,setItem:(key:string,value:string)=>{if(key===DOCUMENT_CACHE_KEY)throw new Error("Quota exceeded");cache.setItem(key,value);}};
  assert.throws(()=>writeRecoveryCheckpoint(broken,changed),/Quota/);assert.equal(cache.data.get(DOCUMENT_CACHE_KEY),original);assert.equal(readRecoveryCheckpoint(cache)!.document.id,cadDocument.id);
  cache.data.set(DOCUMENT_CACHE_KEY,"broken");cache.data.set(DOCUMENT_BACKUP_KEY,"also broken");assert.throws(()=>readRecoveryCheckpoint(cache),/No valid recovery/);
});
test("document loading rejects damaged collections, transforms and parameter values before mutation",()=>{
  resetTestDocument();const original=structuredClone(cadDocument);
  for(const patch of [{objects:null},{features:[]},{revision:NaN},{rootLayers:["missing"]}])assert.throws(()=>deserializeDocument(serializeDocument({...original,...patch} as any)),/Invalid CAD/);
  const document=structuredClone(original);document.objects.box={id:"box",geometryId:"g",name:"box",visible:true,layerId:"layer-default",transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
  document.features.box={id:"box",type:"primitive",inputs:[],output:"box",params:{kind:"sphere",radius:null}};
  assert.throws(()=>deserializeDocument(serializeDocument(document)),/feature box/);
  document.features.box.params.radius=3;
  for(const transform of [
    {translation:[NaN,0,0],rotation:[0,0,0],scale:[1,1,1]},
    {translation:[0,0,0],rotation:[0,0,0],scale:[1,0,1]},
    {translation:[0,0,0],rotation:[0,0,Infinity],scale:[1,1,1]},
  ]){
    document.objects.box.transform=transform as any;
    assert.throws(()=>deserializeDocument(serializeDocument(document)),/transform box/);
  }
});

test("legacy scalar scales migrate without changing geometry or topology on the next reopen",()=>{
  resetTestDocument();const legacy=structuredClone(cadDocument);
  legacy.objects.circle={id:"circle",geometryId:"g",name:"circle",visible:true,layerId:"layer-default",transform:{translation:[0,0,0],rotation:[0,0,0],scale:2} as any};
  legacy.features.circle={id:"circle",type:"drawing",inputs:[],output:"circle",params:{kind:"circle",center:[10,20,0],radius:3}};
  legacy.rootObjects=["circle"];legacy.layers["layer-default"].objectIds=["circle"];
  const loaded=deserializeDocument(serializeDocument(legacy));
  assert.deepEqual(loaded.objects.circle.transform!.scale,[2,2,2]);
  assert.deepEqual(deserializeDocument(serializeDocument(loaded)),loaded);
  const invalid=structuredClone(loaded);invalid.features.circle.params.center=[0,null,0];
  assert.throws(()=>deserializeDocument(serializeDocument(invalid)),/feature circle/);
});
