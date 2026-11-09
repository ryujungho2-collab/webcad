import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGlb,inspectGlbMetadata,externalSceneSummary,encodeSceneBytes,sceneHash,SIMREADY_SOURCE,serializeDocument,deserializeDocument,featureContract,type ExternalSceneAsset,type CadDocument} from '@agent-webcad/cad-document';
import {previewGlbAssembly} from '../src/interop/glbAssemblyPreview';
import {encodeProjectBundle,parseProjectBundle} from '../src/app/projectBundle';
import {prepareCadCommand} from '../src/state/dispatchCadCommand';
const bytes=new Uint8Array(readFileSync(new URL('../../../output/verification/simready/arm_articulated_support_a01.glb',import.meta.url))),original=Buffer.from(bytes),g=parseGlb(bytes);
const asset=async():Promise<ExternalSceneAsset>=>{const hash=await sceneHash(bytes);return {id:`glb-${hash}`,name:'arm_articulated_support_a01.glb',byteLength:bytes.length,contentHash:hash,base64:encodeSceneBytes(bytes),source:SIMREADY_SOURCE};};
const empty=():CadDocument=>({id:'simready-test',revision:0,objects:{},features:{},layers:{'layer-default':{id:'layer-default',name:'Default',visible:true,locked:false,objectIds:[]}},rootLayers:['layer-default'],rootObjects:[]});
function glb(json:any){const raw=new TextEncoder().encode(JSON.stringify(json)),padded=Math.ceil(raw.length/4)*4,binSize=new DataView(bytes.buffer).getUint32(20+new DataView(bytes.buffer).getUint32(12,true),true),binStart=28+new DataView(bytes.buffer).getUint32(12,true);const out=new Uint8Array(28+padded+binSize),v=new DataView(out.buffer);v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,out.length,true);v.setUint32(12,padded,true);v.setUint32(16,0x4e4f534a,true);out.fill(32,20,20+padded);out.set(raw,20);v.setUint32(20+padded,binSize,true);v.setUint32(24+padded,0x004e4942,true);out.set(bytes.subarray(binStart),28+padded);return out;}
test('real GLB: limits, textures, hierarchy, physics and bounded summary',async()=>{
 const m=inspectGlbMetadata(g.json),s=externalSceneSummary(await asset());assert.equal(s.nodeCount,31);assert.equal(s.meshNodeCount,8);assert.equal(s.rigidBodyCount,8);assert.equal(s.jointCount,7);assert.deepEqual(s.jointTypes,{revolute:5,prismatic:2});assert.equal(m.materials.length,2);assert.equal(s.extensionJointCount,7);assert.equal(g.json.images.length,32);assert.equal(g.texturePixels,33554432);assert.ok(JSON.stringify(s).length<2600);assert.ok(!JSON.stringify(s).includes('base64'));assert.ok(m.parts.some(p=>p.mass.state==='valid'));assert.equal(m.parts[0].mass.state,'absent');const bad=structuredClone(g.json);bad.nodes[2].extensions.KHR_physics_rigid_bodies.motion.mass=-1;assert.equal(inspectGlbMetadata(bad).parts[2].mass.state,'invalid');assert.deepEqual(Buffer.from(bytes),original);
});
test('mapping validates coordinate conversion, five revolutes and two unsupported slides without mutation',()=>{
 const before=JSON.stringify(g.json),p=previewGlbAssembly(g.json,SIMREADY_SOURCE);assert.equal(p.candidateCount,5);assert.equal(p.rows.filter(r=>r.type==='prismatic'&&r.status==='blocked').length,2);assert.equal(p.applySupported,false);const j=p.rows[0].candidate!;assert.ok(Math.abs(j.axis[2]-1)<1e-8);assert.ok(Math.abs(j.rest.translation[2]+121.4435100555)<1e-6);assert.equal(JSON.stringify(g.json),before);assert.equal(previewGlbAssembly(g.json,{...SIMREADY_SOURCE,coordinateConvention:'gltf'}).candidateCount,0);
});
test('mapping rejects cycles, multiple parents, wrong references, axes, limits and nonrigid rest frames',()=>{
 for(const edit of [
  (j:any)=>j.nodes[6].extras.joints=[{...j.nodes[2].extras.joints[0],parent:j.nodes[2].name}],
  (j:any)=>j.nodes[2].extras.joints.push({...j.nodes[2].extras.joints[0]}),
  (j:any)=>j.nodes[2].extras.joints[0].parent='absent',
  (j:any)=>j.nodes[2].extras.joints[0].axis=[0,0,0],
  (j:any)=>j.nodes[2].extras.joints[0].min=20,
  (j:any)=>j.nodes[2].scale=[2,1,1],
  (j:any)=>j.nodes[2].extras.joints[0].pivot=[100,0,0],
  (j:any)=>j.nodes[24].rotation=[0,Math.sin(.3),0,Math.cos(.3)],
 ]){const json=structuredClone(g.json);edit(json);assert.equal(previewGlbAssembly(json,SIMREADY_SOURCE).rows[0].status,'blocked');}
});
test('fixed mapping uses a neutral unused axis and validates all six constrained degrees of freedom',()=>{
 const json={nodes:[{name:'parent',children:[2],extensions:{KHR_physics_rigid_bodies:{motion:{mass:1}}}},{name:'child',children:[3],extensions:{KHR_physics_rigid_bodies:{motion:{mass:1}}},extras:{joints:[{type:'fixed',parent:'parent',pivot:[0,0,0]}]}},{extensions:{KHR_physics_rigid_bodies:{joint:{connectedNode:3,joint:0}}}},{}],extensions:{KHR_physics_rigid_bodies:{physicsJoints:[{limits:[{linearAxes:[0,1,2],min:0,max:0},{angularAxes:[0,1,2],min:0,max:0}]}]}}};
 const p=previewGlbAssembly(json,SIMREADY_SOURCE);assert.equal(p.candidateCount,1);assert.equal(p.rows[0].candidate!.type,'fixed');assert.deepEqual(p.rows[0].candidate!.rest.translation,[0,0,0]);
});
test('invalid GLB, buffer budgets, external requests, unknown required extension and cyclic hierarchy rejected before loading',()=>{
 assert.throws(()=>parseGlb(bytes.subarray(0,100)));const wrong=bytes.slice();wrong[0]=0;assert.throws(()=>parseGlb(wrong));
 for(const edit of [
  (j:any)=>j.nodes[2].children.push(2),
  (j:any)=>j.buffers[0].uri='https://example.com/a.bin',
  (j:any)=>j.buffers[1].byteLength=1e9,
  (j:any)=>j.accessors[0].count=1e9,
  (j:any)=>j.images[0].uri='https://example.com/t.webp',
  (j:any)=>j.extensionsRequired.push('KHR_unknown'),
 ]){const json=structuredClone(g.json);edit(json);assert.throws(()=>parseGlb(glb(json)));}
});
test('native command, document v64 and bundle roundtrip retain byte identity and reject broken references/checksum',async()=>{
 const a=await asset(),doc=empty(),p=await prepareCadCommand(doc,{type:'insert-external-scene',id:'arm',layerId:'layer-default',asset:a});assert.equal(p.result.ok,true,p.result.reason);assert.equal(doc.rootObjects.length,0);const restored=deserializeDocument(serializeDocument(p.proposed));assert.equal(JSON.parse(serializeDocument(restored)).version,64);assert.equal(restored.externalSceneAssets![a.id].base64,a.base64);assert.equal(featureContract(restored.features['feature-arm']).representation,'external-reference');assert.equal(featureContract(restored.features['feature-arm']).supportsExactMeasurement,false);
 const text=await encodeProjectBundle([{id:'arm',title:'Arm',document:restored}]);assert.equal((await parseProjectBundle(text)).projects[0].document.externalSceneAssets![a.id].contentHash,a.contentHash);
 const missing=structuredClone(restored);delete missing.externalSceneAssets;assert.throws(()=>deserializeDocument(serializeDocument(missing)),/Missing/);
 const old=JSON.parse(serializeDocument(restored));old.version=63;assert.throws(()=>deserializeDocument(JSON.stringify(old)),/version 64/);
 const corrupt=JSON.parse(text),entry=corrupt.projects[0].document.externalSceneAssets[a.id];const changed=bytes.slice();changed[changed.length-1]^=1;entry.base64=encodeSceneBytes(changed);await assert.rejects(parseProjectBundle(JSON.stringify(corrupt)),/checksum/);
});
