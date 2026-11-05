import test from "node:test";
import assert from "node:assert/strict";
import type {CadDocument} from "@agent-webcad/cad-document";
import {selectionContext} from "../src/commands/selectionContext";
const document=()=>({id:"context",revision:7,objects:Object.fromEntries(["line","arc","spline","solid","note","image"].map(id=>[id,{id,name:id,layerId:"layer",visible:true}])),features:Object.fromEntries([...["line","arc","spline"].map(id=>[id,{id,output:id,type:"drawing",inputs:[],params:{kind:id}}]),["solid",{id:"solid",output:"solid",type:"primitive",inputs:[],params:{}}],["note",{id:"note",output:"note",type:"dimension",inputs:[],params:{}}],["image",{id:"image",output:"image",type:"image",inputs:[],params:{}}]]),layers:{layer:{id:"layer",name:"Layer",visible:true,locked:false,objectIds:[]}},rootObjects:[],rootLayers:["layer"],artboards:{f:{id:"f",name:"Frame",visible:true,locked:false,frame:{memberIds:["line"],denominator:1}}}} as unknown as CadDocument);
const options={workspace:"2d" as const};
test("context suggestions distinguish exact curves, solids, annotations and image placements",()=>{
  const d=document();assert.equal(selectionContext(d,[],options).kind,"create");
  for(const id of ["line","arc"])assert.ok(selectionContext(d,[id],options).primary.includes("contour-lengthen"));
  assert.ok(selectionContext(d,["spline"],options).primary.includes("draw-spline"));
  assert.equal(selectionContext(d,["solid"],options).kind,"solid");assert.equal(selectionContext(d,["note"],options).kind,"annotation");assert.equal(selectionContext(d,["image"],options).kind,"image");
});
test("mixed types and locked or hidden targets explain eligibility without changing document",()=>{
  const d=document(),before=JSON.stringify(d),mixed=selectionContext(d,["line","solid"],options);
  assert.equal(mixed.kind,"mixed");assert.match(mixed.reason!,/Different object types/);assert.ok(!mixed.primary.includes("contour-lengthen"));assert.equal(JSON.stringify(d),before);
  d.layers.layer.locked=true;assert.match(selectionContext(d,["line","solid"],options).reason!,/locked/);
  d.layers.layer.locked=false;d.objects.line.visible=false;assert.match(selectionContext(d,["line"],options).reason!,/hidden/);
});
test("active frame and sketch use their own edit paths and locked frame retains inspection",()=>{
  const d=document();assert.deepEqual(selectionContext(d,[],{...options,artboard:"f"}).primary,["frame-edit","frame-links","frame-sheets"]);
  d.artboards!.f.locked=true;assert.match(selectionContext(d,[],{...options,artboard:"f"}).reason!,/Unlock/);
  assert.deepEqual(selectionContext(d,["line"],{...options,sketch:"sketch"}).primary,["sketch"]);
  d.features.line.params.sketchId="s";assert.ok(selectionContext(d,["line"],options).primary.includes("edit-sketch"));
});
