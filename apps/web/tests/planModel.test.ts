import test from "node:test";
import assert from "node:assert/strict";
import {PlanModelBuilder} from "../src/architecture/planModel";
import {cafeModelAsset,CAFE_FINISHES} from "../src/library/cafeModelAssets";
import {CAFE_SYMBOLS} from "../src/library/cafeSymbols";
import {appendOnlyModelBatch} from "../src/state/appendOnlyModelBatch";
import {resetTestDocument} from "./helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {measureDocumentObject} from "../src/state/documentQuery";

test("Model append path permits new solids and refuses edits to existing geometry",()=>{
 resetTestDocument();const create:any={type:"batch",commands:[{type:"create-layer",id:"new"},{type:"create-primitive",id:"box",layerId:"new",primitive:"box",params:{width:1,depth:2,height:3}},{type:"move-object",objectId:"box",translation:[10,0,0]}]};
 assert.equal(appendOnlyModelBatch(cadDocument,create),true);create.commands[2].objectId="existing";assert.equal(appendOnlyModelBatch(cadDocument,create),false);create.commands[2]={type:"update-extrude",objectId:"box",distance:5};assert.equal(appendOnlyModelBatch(cadDocument,create),false);
 const profile:any={type:"batch",commands:[{type:"create-layer",id:"new"},{type:"create-drawing",id:"p",layerId:"new",drawing:"rectangle",params:{}},{type:"create-extrude",id:"e",layerId:"new",profileObjectIds:["p"],distance:100},{type:"move-object",objectId:"p",translation:[50,0,0]}]};assert.equal(appendOnlyModelBatch(cadDocument,profile),false,"Post-extrusion profile edits must use normal dependent regeneration");
});
test("Every issued cafe symbol has a finite, volumetric CAD recipe",()=>{
 for(const symbol of CAFE_SYMBOLS){const pieces=cafeModelAsset(symbol.id);assert.ok(pieces.length);for(const p of pieces){assert.ok(p.position.every(Number.isFinite));assert.ok(Object.values(p.params).every(v=>v>0&&Number.isFinite(v)));assert.ok(p.finish.opacity>0);}}
 assert.throws(()=>cafeModelAsset("unmapped"),/No 3D recipe/);
});
test("Plan extrusion retains the native source, aligns offset floor and regenerates after source edit",async()=>{
 resetTestDocument();let result=await dispatchCadCommand({type:"create-drawing",id:"wall",drawing:"polyline",params:{workPlane:"XY",closed:true,points:[[22000,0,0],[22200,0,0],[22200,5000,0],[22000,5000,0]]}});assert.ok(result.ok,result.reason);
 const floor={id:"2f",name:"2F",sourceOrigin:[22000,0] as [number,number],level:3900},b=new PlanModelBuilder(cadDocument,"model"),id=b.extrude("wall",3650,floor,CAFE_FINISHES.white);
 assert.equal(appendOnlyModelBatch(cadDocument,{type:"batch",commands:b.commands}),true);
 result=await dispatchCadCommand({type:"batch",commands:b.commands});assert.ok(result.ok,result.reason);
 let m=await measureDocumentObject(cadDocument,id);assert.equal(m.validity,"valid");assert.ok(Math.abs(m.volume!-200*5000*3650)<1);assert.deepEqual(m.bounds!.min.map(Math.round),[0,0,3900]);assert.deepEqual(m.bounds!.max.map(Math.round),[200,5000,7550]);
 result=await dispatchCadCommand({type:"move-object",objectId:"wall",translation:[100,0,0]});assert.ok(result.ok,result.reason);m=await measureDocumentObject(cadDocument,id);assert.ok(Math.abs(m.bounds!.min[0]-100)<.001);assert.deepEqual(Object.values(cadDocument.features).find(f=>f.output===id)!.inputs,["wall"]);
 assert.throws(()=>new PlanModelBuilder(cadDocument,"model").extrude("wall",100,floor,CAFE_FINISHES.white),/already exists/);
});
test("Recipe placement rotates source blocks without losing the floor offset",async()=>{
 resetTestDocument();cadDocument.objects.block={id:"block",name:"Block",geometryId:"g",visible:true,layerId:"layer-default",transform:{translation:[23000,2000,0],rotation:[0,0,90],scale:[1,1,1]}};cadDocument.features.fb={id:"fb",type:"drafting",inputs:[],output:"block",params:{kind:"block"}};
 const b=new PlanModelBuilder(cadDocument,"m");b.block("block",[{name:"Test",kind:"box",position:[10,20,30],params:{width:100,depth:200,height:300},finish:CAFE_FINISHES.oak}],{id:"2f",name:"2F",sourceOrigin:[22000,0],level:3900},"furniture");
 const command=b.commands.find(c=>c.type==="create-primitive")!;assert.equal(command.type,"create-primitive");if(command.type==="create-primitive")assert.deepEqual(command.position,[980,2010,3930]);
 assert.deepEqual(b.receipts[0].sourceObjectIds,["block"]);cadDocument.objects.block.transform!.scale=[2,1,1];assert.throws(()=>b.block("block",cafeModelAsset("stool"),{id:"2f",name:"2F",sourceOrigin:[22000,0],level:3900},"furniture"),/unit-scale/);
});
