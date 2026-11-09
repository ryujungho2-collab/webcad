import {test} from "node:test";
import assert from "node:assert/strict";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {resetTestDocument} from "./helpers/documentHarness";
import {encodeDxf} from "../src/interop/dxfWriter";
import {parseDxf} from "../src/interop/dxfParser";
import {dxfOcs} from "../src/interop/dxfOcs";
import {collectExportAnnotations} from "../src/export/exportModel";
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} versus ${b}`);
test("native DXF dimensions preserve real text height and translated rotated uniform-scale placement on all origin planes",async()=>{
 for(const plane of ["XY","XZ","YZ"] as const){
  resetTestDocument();assert.ok((await dispatchCadCommand({type:"create-dimension",id:"dim",dimension:"linear",params:{workPlane:plane,points:[[0,0],[15000,0]],offset:-850,symbolScale:40,style:{precision:0}}})).ok);
  const object=cadDocument.objects.dim;object.transform={translation:[100,200,300],rotation:plane==="XY"?[0,0,30]:[0,0,0],scale:[2,2,2]};
  const dxf=encodeDxf(cadDocument),parsed=parseDxf(dxf.text),label=parsed.entities.find(e=>e.kind==="text");assert.equal(dxf.skipped,0);assert.ok(label?.kind==="text");near(label.height,320);assert.equal(label.text,"15,000 mm");
  const expected=collectExportAnnotations(plane).texts[0];near(label.height,expected.size!);
  const expectedPoint=plane==="XY"?[100+15000*Math.cos(Math.PI/6)+950,200+7500-1900*Math.cos(Math.PI/6),300]:plane==="XZ"?[15100,200,-1600]:[100,15200,-1600];dxfOcs(label.normal??[0,0,1]).toWorld(label.point).forEach((v,i)=>near(v,expectedPoint[i]));
  const line=parsed.entities.find(e=>e.kind==="polyline");assert.ok(line?.kind==="polyline");assert.ok(line.points.some(p=>p.some(v=>Math.abs(v)>10000)),"Dimension line retains model coordinates, not paper-sized fallback");
 }
});
