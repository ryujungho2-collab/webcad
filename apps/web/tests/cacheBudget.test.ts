import test from 'node:test';
import assert from 'node:assert/strict';
import {CacheBudget,payloadBytes} from '../src/cad/cacheBudget';
import * as THREE from 'three';
import {gpuPayloadBytes} from '../src/viewport/gpuPayload';
test('cache byte cap evicts LRU, shrinks on inactivity and cannot resurrect an evicted pending result',()=>{
 const budget=new CacheBudget(100),a={},b={},removed:string[]=[];
 budget.track(a,60,()=>removed.push('a'));budget.track(b,30,()=>removed.push('b'));budget.touch(a);budget.resize(b,60);
 assert.deepEqual(removed,['b']);assert.equal(budget.bytes,60);budget.resize(b,10000);assert.equal(budget.bytes,60);
 budget.setLimit(20);assert.equal(budget.bytes,0);assert.deepEqual(removed,['b','a']);
});
test('shared typed array buffers are counted once; cycles terminate and large buffers exceed budgets',()=>{
 const buffer=new ArrayBuffer(4096),obj:any={a:new Float32Array(buffer),b:new Uint8Array(buffer)};obj.self=obj;
 const size=payloadBytes(obj);assert.ok(size>=4096&&size<4200);
 const budget=new CacheBudget(1024);budget.track({},size,()=>{});assert.equal(budget.bytes,0);
});
test('GPU payload estimates deduplicate shared geometry buffers',()=>{
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(9),3));geometry.setIndex([0,1,2]);
 const root=new THREE.Group();root.add(new THREE.Mesh(geometry),new THREE.Mesh(geometry));assert.equal(gpuPayloadBytes([root]),42);geometry.dispose();
});
