import assert from "node:assert/strict";
import {test} from "node:test";
import {readRecoveryCheckpoint,writeRecoveryCheckpoint,recoveryStatus,DOCUMENT_CACHE_KEY,DOCUMENT_BACKUP_KEY} from "../src/state/documentRecovery";
import {documentFingerprint,loadDocumentFromCache,newDocument,saveDocumentToCache} from "../src/state/documentFile";
import {documentVersion} from "../src/state/documentSession";
import {resetTestDocument} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";

function storage(){const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};}
test("local save acknowledges only the exact written snapshot and detects a version change during the write",()=>{
  resetTestDocument();const cache=storage(),old=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
  try{
    Object.defineProperty(globalThis,"localStorage",{configurable:true,value:cache});
    const fingerprint=documentFingerprint(),version=documentVersion();assert.deepEqual(saveDocumentToCache(),version);
    assert.equal(recoveryStatus().fingerprint,fingerprint);assert.equal(recoveryStatus().revision,version.revision);
    let changed=false;
    Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{...cache,setItem:(key:string,value:string)=>{cache.setItem(key,value);if(key===DOCUMENT_CACHE_KEY&&!changed){changed=true;cadDocument.revision++;cadDocument.id="changed-during-write";}}}});
    assert.throws(()=>saveDocumentToCache(),/changed while saving/);assert.equal(recoveryStatus().state,"failed");
    assert.equal(readRecoveryCheckpoint(cache)!.document.id,version.documentId);
    Object.defineProperty(globalThis,"localStorage",{configurable:true,value:cache});saveDocumentToCache();
    assert.equal(recoveryStatus().fingerprint,documentFingerprint());assert.equal(readRecoveryCheckpoint(cache)!.document.id,"changed-during-write");
  }finally{if(old)Object.defineProperty(globalThis,"localStorage",old);else Reflect.deleteProperty(globalThis,"localStorage");resetTestDocument();}
});
test("an unreadable document cannot be overwritten by recovery retry or autosave until an explicit valid New/Open",()=>{
  resetTestDocument();const cache=storage(),old=Object.getOwnPropertyDescriptor(globalThis,"localStorage");cache.setItem(DOCUMENT_CACHE_KEY,"unreadable source");cache.setItem(DOCUMENT_BACKUP_KEY,"unreadable backup");
  try{
    Object.defineProperty(globalThis,"localStorage",{configurable:true,value:cache});assert.throws(()=>loadDocumentFromCache(),/No valid recovery/);
    assert.throws(()=>saveDocumentToCache(),/Recovery source is unreadable/);assert.equal(cache.getItem(DOCUMENT_CACHE_KEY),"unreadable source");assert.equal(cache.getItem(DOCUMENT_BACKUP_KEY),"unreadable backup");
    newDocument();assert.equal(recoveryStatus().state,"saved");assert.equal(readRecoveryCheckpoint(cache)!.document.id,cadDocument.id);
  }finally{if(old)Object.defineProperty(globalThis,"localStorage",old);else Reflect.deleteProperty(globalThis,"localStorage");resetTestDocument();}
});
test("large model recovery compresses current and backup, survives reload and corrupt data falls back",()=>{
 resetTestDocument();const doc=structuredClone(cadDocument);doc.id="large";doc.features.large={id:"large",type:"primitive",output:"large",inputs:[],params:{kind:"box",width:1,depth:1,height:1,studyText:"library ".repeat(100000)}};
 doc.objects.large={id:"large",geometryId:"large-geometry",name:"Large",layerId:"layer-default",visible:true};doc.rootObjects=["large"];doc.layers["layer-default"].objectIds=["large"];
 const cache=storage(),bounded={getItem:cache.getItem,setItem:(key:string,value:string)=>{if(value.length>128000)throw Error("Quota exceeded");cache.setItem(key,value);}};
 writeRecoveryCheckpoint(bounded,doc);assert.equal(JSON.parse(cache.getItem(DOCUMENT_CACHE_KEY)!).format,"agent-webcad-recovery-compressed");assert.deepEqual(readRecoveryCheckpoint(bounded)!.document,doc);
 const changed=structuredClone(doc);changed.revision++;writeRecoveryCheckpoint(bounded,changed);assert.deepEqual(readRecoveryCheckpoint(bounded)!.document,changed);
 const packed=cache.getItem(DOCUMENT_CACHE_KEY)!;writeRecoveryCheckpoint(bounded,changed);assert.equal(cache.getItem(DOCUMENT_CACHE_KEY),packed);
 cache.data.set(DOCUMENT_CACHE_KEY,packed.replace('"decodedBytes":','"decodedBytes":999999999,"ignored":'));assert.deepEqual(readRecoveryCheckpoint(bounded),{document:doc,recovered:true});
});
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
