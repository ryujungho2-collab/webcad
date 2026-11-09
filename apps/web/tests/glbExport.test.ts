import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import {encodeGlb,type GlbPart} from "../src/export/glbWriter";
import {collectGlbParts,exportGlbBytes} from "../src/export/glbExport";
import {CAFE_FINISHES} from "../src/library/cafeModelAssets";
import {resetTestDocument} from "./helpers/documentHarness";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadDocument} from "../src/state/cadDocument";

test("Binary glTF reuses geometry, preserves CAD IDs/materials and maps mm Z up to metres Y up",()=>{
 const mesh={positions:new Float64Array([0,0,0,1000,0,0,0,1000,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),indices:new Uint32Array([0,1,2])};
 const part:GlbPart={id:"p",name:"Part",layerId:"2f",geometryKey:"triangle",mesh,transform:{translation:[2000,3000,3900],rotation:[0,0,0],scale:[1,1,1]},finish:CAFE_FINISHES.glass};
 const bytes=encodeGlb([part,{...part,id:"q",finish:CAFE_FINISHES.oak}]),v=new DataView(bytes.buffer);assert.equal(v.getUint32(0,true),0x46546c67);assert.equal(v.getUint32(8,true),bytes.length);
 const d=JSON.parse(new TextDecoder().decode(bytes.slice(20,20+v.getUint32(12,true))));assert.equal(d.nodes.length,3);assert.equal(d.accessors.length,3);assert.equal(d.meshes.length,2);assert.equal(d.materials.length,2);assert.equal(d.nodes[1].extras.cadObjectId,"p");assert.equal(d.materials[0].alphaMode,"BLEND");
 const matrix=new THREE.Matrix4().compose(new THREE.Vector3(),new THREE.Quaternion(...d.nodes[0].rotation),new THREE.Vector3(...d.nodes[0].scale)),world=new THREE.Vector3(...d.nodes[1].translation).applyMatrix4(matrix);assert.ok(world.distanceTo(new THREE.Vector3(2,3.9,-3))<1e-9);
 assert.equal(v.getUint32(24+v.getUint32(12,true),true),0x004e4942);assert.throws(()=>encodeGlb([]),/at least one/);
});
test("GLB export honors layer visibility and selection, retaining the source document",async()=>{
 resetTestDocument();const result=await dispatchCadCommand({type:"batch",commands:[{type:"create-layer",id:"hidden"},{type:"create-primitive",id:"a",primitive:"box",params:{width:1000,depth:500,height:250}},{type:"create-primitive",id:"b",primitive:"cylinder",params:{radius:20,height:100},layerId:"hidden"},{type:"set-solid-finish",objectId:"a",finish:CAFE_FINISHES.oak},{type:"set-layer-visible",layerId:"hidden",visible:false}]});assert.ok(result.ok,result.reason);
 const state=JSON.stringify(cadDocument),parts=await collectGlbParts();assert.equal(parts.length,1);assert.equal(parts[0].id,"a");assert.equal(parts[0].finish.name,"Oak / WL-02");assert.equal((await collectGlbParts(cadDocument,["b"])).length,0);assert.ok((await exportGlbBytes(["a"])).length>1000);assert.equal(JSON.stringify(cadDocument),state);
});
