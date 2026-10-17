import assert from "node:assert/strict";
import {test} from "node:test";
import {sectionSolid} from "../src/cad/kernelGeometryService";
test("OCCT plane section returns exact box edges and cylinder circle",async()=>{
 const edges=await sectionSolid({params:{kind:"box",width:20,depth:10,height:5}},[0,0,1],2);
 assert.equal(edges.length,4);assert.ok(edges.every(e=>e.kind==="line"));
 const circle=await sectionSolid({params:{kind:"cylinder",radius:10,height:80}},[0,0,1],40);
 assert.equal(circle.length,1);assert.equal(circle[0].kind,"circle");assert.equal((circle[0] as any).radius,10);
});
