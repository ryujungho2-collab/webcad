import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadDocument } from "../src/state/cadDocument";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { extractSketchLoops, extrusionProfileParams } from "../src/precision/sketchProfiles";
import { regionContainsPoint } from "../src/precision/profileRegions";
import { buildExtrudeMesh } from "../src/cad/kernelGeometryService";
import { documentState, meshVolume, resetTestDocument } from "./helpers/documentHarness";
import {getObjectWorldBounds} from "../src/precision/worldBounds";

async function plate() {
  resetTestDocument();
  await dispatchCadCommand({type:"create-drawing", id:"plate", drawing:"rectangle", params:{workPlane:"XY", points:[[0,0,0],[100,0,0],[100,60,0],[0,60,0]]}});
  for (const [i, [x,y]] of [[15,15],[85,15],[15,45],[85,45]].entries()) await dispatchCadCommand({type:"create-drawing", id:`hole-${i}`, drawing:"circle", params:{workPlane:"XY", center:[x,y,0], radius:4}});
  return ["plate","hole-0","hole-1","hole-2","hole-3"];
}
test("plate regions preserve four exact through holes and complete history", async () => {
  const ids = await plate(), result = extractSketchLoops(cadDocument, ids);
  assert.ok(result.ok); if (!result.ok) return;
  assert.equal(result.loops.length, 1); assert.equal(result.loops[0].holes?.length, 4);
  assert.equal(regionContainsPoint(result.loops[0], [15,15], "XY"), false);
  assert.equal(regionContainsPoint(result.loops[0], [50,30], "XY"), true);
  const before = documentState();
  assert.ok((await dispatchCadCommand({type:"create-extrude",id:"solid",profileObjectIds:ids,distance:8})).ok);
  const solid = cadDocument.features["feature-solid"];
  assert.deepEqual(new Set(solid.inputs),new Set(ids));
  const volume = meshVolume(await buildExtrudeMesh(solid.params));
  // The tessellated circles approximate exact BRep arcs; 0.05% bounds the mesh error.
  assert.ok(Math.abs(volume-(6000-4*Math.PI*16)*8)<24, `actual volume ${volume}`);
  const after = documentState(); undoDocument(); assert.deepEqual(documentState(),before);
  redoDocument(); assert.deepEqual(documentState(),after);
});
test("independent islands form one compound feature without filling nested holes", async () => {
  await plate();
  await dispatchCadCommand({type:"create-drawing",id:"island",drawing:"circle",params:{workPlane:"XY",center:[15,15,0],radius:2}});
  const ids=["plate","hole-0","island"], result=extractSketchLoops(cadDocument,ids);
  assert.ok(result.ok); if(!result.ok)return;
  assert.equal(result.loops.length,2);
  const volume=meshVolume(await buildExtrudeMesh({kind:"extrude",distance:8,...extrusionProfileParams(result.loops)}));
  assert.ok(Math.abs(volume-(6000-Math.PI*16+Math.PI*4)*8)<6, `${volume}`);
  await dispatchCadCommand({type:"create-extrude",id:"islands",profileObjectIds:ids,distance:8});
  assert.equal(getObjectWorldBounds(cadDocument,"islands")!.max[2],8);
  await dispatchCadCommand({type:"update-extrude",objectId:"islands",distance:-12});
  assert.equal(getObjectWorldBounds(cadDocument,"islands")!.min[2],-12);
});
test("touching holes reject atomically and keep redo history", async () => {
  const ids=await plate();
  await dispatchCadCommand({type:"move-object",objectId:"hole-0",translation:[-11,0,0]});
  const before=documentState(), revision=cadDocument.revision, labels=cadHistory.getPastLabels();
  const loops=extractSketchLoops(cadDocument,ids); assert.equal(loops.ok,false);
  assert.equal((await dispatchCadCommand({type:"create-extrude",profileObjectIds:ids,distance:8})).ok,false);
  assert.deepEqual(documentState(),before); assert.equal(cadDocument.revision,revision); assert.deepEqual(cadHistory.getPastLabels(),labels);
});

test("driving plate width, hole diameter and spacing regenerate every through hole atomically", async () => {
  resetTestDocument();
  await dispatchCadCommand({type:"create-sketch",id:"sketch",workPlane:"XY"});
  await dispatchCadCommand({type:"add-sketch-geometry",sketchId:"sketch",geometry:{id:"plate",kind:"rectangle",origin:[0,0],width:100,height:60,cornerIds:["a","b","c","d"],edgeIds:["ab","bc","cd","da"]}});
  await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:"width",kind:"distance",first:{geometryId:"plate",pointId:"a"},second:{geometryId:"plate",pointId:"b"},value:100}});
  for (const [i,[x,y]] of [[15,15],[85,15],[15,45],[85,45]].entries()) {
    await dispatchCadCommand({type:"add-sketch-geometry",sketchId:"sketch",geometry:{id:`hole-${i}`,kind:"circle",centerId:`c-${i}`,curveId:`curve-${i}`,center:[x,y],radius:4}});
    await dispatchCadCommand({type:"add-sketch-constraint",sketchId:"sketch",constraint:{id:`diameter-${i}`,kind:"diameter",geometryId:`hole-${i}`,value:8}});
  }
  const ids=["plate","hole-0","hole-1","hole-2","hole-3"];
  assert.ok((await dispatchCadCommand({type:"create-extrude",id:"solid",profileObjectIds:ids,distance:8})).ok);
  const original=documentState();cadHistory.clear();
  assert.ok((await dispatchCadCommand({type:"batch",commands:[
    {type:"set-sketch-dimension",sketchId:"sketch",constraintId:"width",value:120},
    {type:"set-sketch-dimension",sketchId:"sketch",constraintId:"diameter-0",value:12},
    {type:"move-sketch-point",sketchId:"sketch",point:{geometryId:"hole-1",pointId:"c-1"},position:[100,15]},
  ]})).ok);
  const params=cadDocument.features["feature-solid"].params, volume=meshVolume(await buildExtrudeMesh(params));
  assert.ok(Math.abs(volume-(120*60-Math.PI*(36+3*16))*8)<24, `${volume}`);
  const holes=(params.profile as import("../src/precision/sketchProfiles").SketchLoop).holes!;
  assert.equal(holes.length,4);assert.ok(holes.some(hole=>hole.segments.some(s=>s.kind==="circle" && s.center[0]===100)));
  const changed=documentState();assert.equal(cadHistory.getPastLabels().length,1);undoDocument();assert.deepEqual(documentState(),original);redoDocument();assert.deepEqual(documentState(),changed);
  const revision=cadDocument.revision;
  assert.equal((await dispatchCadCommand({type:"set-sketch-dimension",sketchId:"sketch",constraintId:"diameter-0",value:200})).ok,false);
  assert.deepEqual(documentState(),changed);assert.equal(cadDocument.revision,revision);
});
