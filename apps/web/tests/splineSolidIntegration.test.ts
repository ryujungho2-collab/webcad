import assert from "node:assert/strict";
import {test} from "node:test";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {measureDocumentObject} from "../src/state/documentQuery";
import {undoDocument} from "../src/state/history";
import {resetTestDocument,documentState} from "./helpers/documentHarness";
import type {CadSpline} from "@agent-webcad/cad-document";
const circle=(radius:number,z:number):CadSpline=>({degree:2,controlPoints:[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[1,0]].map(([x,y])=>[x*radius,y*radius,z]),weights:[1,Math.SQRT1_2,1,Math.SQRT1_2,1,Math.SQRT1_2,1,Math.SQRT1_2,1],knots:[0,0,0,1,1,2,2,3,3,4,4,4],domain:[0,4]});
async function source(id:string,r:number,z:number){assert.ok((await dispatchCadCommand({type:"create-drawing",id,drawing:"spline",params:{...circle(r,z),workPlane:"XY"}})).ok);}
async function volume(id:string,expected:number){const m=await measureDocumentObject(cadDocument,id);assert.equal(m.validity,"valid");assert.ok(Math.abs(m.volume!-expected)<expected*1e-8,`${id}: ${m.volume} vs ${expected}`);}
test("exact rational circle profile extrudes and lofts with independent analytic BRep volumes",async()=>{
 resetTestDocument();await source("lower",10,0);await source("upper",5,30);const before=documentState();const preview=await previewCadCommand({type:"create-extrude",id:"cylinder",profileObjectIds:["lower"],distance:10});assert.ok(preview.result.ok,preview.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(preview.planId)).ok);await volume("cylinder",1000*Math.PI);
 const loft=await dispatchCadCommand({type:"create-loft",id:"frustum",profileObjectIds:["lower","upper"],ruled:true});assert.ok(loft.ok,loft.reason);await volume("frustum",1750*Math.PI);assert.equal(cadDocument.features["feature-cylinder"].params.profile!==undefined,true);
 const original=documentState();assert.ok((await dispatchCadCommand({type:"update-spline",objectId:"lower",spline:circle(12,0)})).ok);await volume("cylinder",1440*Math.PI);await volume("frustum",2290*Math.PI);assert.ok(undoDocument());assert.deepEqual(documentState(),original);
});
