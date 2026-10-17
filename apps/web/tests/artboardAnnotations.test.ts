import assert from "node:assert/strict";
import {beforeEach,test} from "node:test";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {collectArtboardExportItems} from "../src/export/exportModel";
import {encodeSvg} from "../src/export/svgWriter";
import {artboardPngSvg} from "../src/export/artboardPng";
import {WORK_PLANES,planeToWorld} from "../src/precision/workPlane";
import {documentState,resetTestDocument} from "./helpers/documentHarness";
beforeEach(resetTestDocument);
async function apply(c:CadCommand){const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);}
async function board(){await apply({type:"create-artboard",id:"board",workPlane:"XY",origin:[0,0],size:[100,80]});}
async function label(id="text",x=10){await apply({type:"create-drafting",id,params:{kind:"text",workPlane:"XY",point:[x,20,0],text:"도면 <A>&",height:8,angle:30,align:"center"}});}
function svg(){const b=cadDocument.artboards!.board;return encodeSvg([],{items:collectArtboardExportItems(b.id),viewBox:b,background:b.background});}

test("text-only artboards include Unicode, escaping, rotation, alignment and clipping",async()=>{
  await board();await label();const before=documentState(),history=cadHistory.getPastLabels(),items=collectArtboardExportItems("board");assert.equal(items.length,1);assert.equal(items[0].type,"text");const output=svg();assert.match(output,/도면 &lt;A&gt;&amp;/);assert.match(output,/text-anchor="middle"/);assert.match(output,/rotate\(-30 10 -20\)/);assert.match(output,/font-size="8"/);assert.match(output,/clip-path="url\(#artboard-crop\)"/);assert.deepEqual(documentState(),before);assert.deepEqual(cadHistory.getPastLabels(),history);
});
test("dimensions and chain labels share styles without duplicating drafting lines",async()=>{
  await board();await apply({type:"create-layer",id:"notes",name:"Notes"});await apply({type:"set-layer-style",layerId:"notes",style:{color:"#204060",lineType:"center",lineWeight:.7}});
  await apply({type:"create-dimension",id:"dim",layerId:"notes",dimension:"linear",params:{workPlane:"XY",points:[[-10,0],[120,0]],offset:10,style:{textHeight:6,paperScale:2}}});
  await apply({type:"create-drafting",id:"chain",params:{kind:"chain",workPlane:"XY",points:[[10,20,0],[30,20,0],[50,20,0]],orientation:"horizontal",offset:10,height:4}});
  const items=collectArtboardExportItems("board"),texts=items.filter(i=>i.type==="text");assert.equal(texts.length,3);assert.ok(texts.some(t=>t.text.objectId==="dim"&&t.text.size===12&&t.text.color==="#204060"));for(const item of items)if(item.type==="polyline")for(const p of item.polyline.points){assert.ok(p[0]>=0&&p[0]<=100&&p[1]>=0&&p[1]<=80);}
  assert.match(svg(),/stroke-dasharray="6 1.5 1 1.5"/);
});
test("board output preserves object stacking including later fills covering text",async()=>{
  await board();await label();await apply({type:"create-drawing",id:"cover",drawing:"rectangle",params:{workPlane:"XY",points:[[0,0,0],[40,0,0],[40,40,0],[0,40,0]],vectorStyle:{stroke:"#ff0000",fill:"#ff0000",fillGradient:null,opacity:1,strokeWidth:.25}}});
  const output=svg();assert.ok(output.indexOf("<text")<output.indexOf("<polygon"));assert.deepEqual(collectArtboardExportItems("board").map(i=>i.type),["text","polyline"]);
});
test("outside anchors remain available to clip glyphs crossing the board edge",async()=>{
  await board();await label("edge",-1);assert.ok(collectArtboardExportItems("board").some(i=>i.type==="text"&&i.text.position[0]===-1));assert.match(svg(),/x="-1"/);
});
test("object and layer visibility filter annotations while locks preserve output",async()=>{
  await board();await label();await apply({type:"set-layer-locked",layerId:"layer-default",locked:true});assert.match(svg(),/<text/);await apply({type:"set-layer-locked",layerId:"layer-default",locked:false});await apply({type:"set-object-visible",objectId:"text",visible:false});assert.equal(collectArtboardExportItems("board").length,0);await apply({type:"set-object-visible",objectId:"text",visible:true});await apply({type:"set-layer-visible",layerId:"layer-default",visible:false});assert.equal(collectArtboardExportItems("board").length,0);await apply({type:"update-artboard",artboardId:"board",visible:false});assert.throws(()=>collectArtboardExportItems("board"),/visible artboard/);
});
test("all work planes resolve moved rotated scaled text axes in plane coordinates",async()=>{
  for(const plane of ["XY","XZ","YZ"] as const){resetTestDocument();await apply({type:"create-artboard",id:"board",workPlane:plane,origin:[-100,-100],size:[200,200]});await apply({type:"create-drafting",id:"text",params:{kind:"text",workPlane:plane,point:planeToWorld([10,20],WORK_PLANES[plane]),text:"Note",height:4,angle:0}});
    const rotation: [number,number,number]=plane==="XY"?[0,0,90]:plane==="XZ"?[0,-90,0]:[90,0,0];await apply({type:"rotate-object",objectId:"text",rotation});await apply({type:"scale-object",objectId:"text",scale:[2,2,2]});await apply({type:"move-object",objectId:"text",translation:planeToWorld([5,7],WORK_PLANES[plane])});
    const item=collectArtboardExportItems("board").find(i=>i.type==="text")!;assert.equal(item.type,"text");assert.ok(Math.abs(item.text.position[0]+35)<1e-7);assert.ok(Math.abs(item.text.position[1]-27)<1e-7);assert.ok(Math.abs(item.text.angle!-90)<1e-7);assert.equal(item.text.size,8);
  }
});
test("affine text retains nonuniform scale; tilted glyphs reject",async()=>{
  await board();await label();await apply({type:"scale-object",objectId:"text",scale:[2,1,1]});assert.match(svg(),/transform="matrix\(/);await apply({type:"rotate-object",objectId:"text",rotation:[45,0,0]});assert.throws(()=>svg(),/tilted out/);
});
test("dimension placement transforms linework and label without changing measurement",async()=>{
  await board();await apply({type:"create-dimension",id:"dim",dimension:"linear",params:{workPlane:"XY",points:[[0,0],[20,0]],offset:5}});await apply({type:"rotate-object",objectId:"dim",rotation:[0,0,90]});await apply({type:"scale-object",objectId:"dim",scale:[2,2,2]});await apply({type:"move-object",objectId:"dim",translation:[40,10,0]});
  const items=collectArtboardExportItems("board"),label=items.find(i=>i.type==="text")!;assert.equal(label.type,"text");assert.equal(label.text.text,"20.00 mm");assert.equal(label.text.size,8);assert.ok(Math.abs(label.text.angle!-90)<1e-7);assert.ok(Math.abs(label.text.position[1]-30)<1e-7);assert.ok(items.some(i=>i.type==="polyline"&&i.polyline.points.every(p=>Math.abs(p[0]-30)<1e-7)));
});
test("style Undo/Redo, JSON and PNG scene use the same detached annotation graphics",async()=>{
  await board();await label();const before=svg();await apply({type:"update-drafting",objectId:"text",params:{height:12}});assert.match(svg(),/font-size="12"/);assert.ok(undoDocument());assert.equal(svg(),before);assert.ok(redoDocument());assert.deepEqual(deserializeDocument(serializeDocument(cadDocument)),cadDocument);const b=cadDocument.artboards!.board,scene={board:b,items:collectArtboardExportItems("board")};assert.match(artboardPngSvg(scene,{width:378,height:302}),/font-size="12"/);
});
