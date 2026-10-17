import {test} from "node:test";
import assert from "node:assert/strict";
import {createBox,translate,clipProjectionShape,classifyProjectionSlab,projectShapes} from "@agent-webcad/cad-kernel";
import {executeKernelOperation,clearRetainedShapes,retainedShapeStatistics} from "../src/cad/kernelRuntime";
test("conservative slab bounds preserve exact global HLR, boundary contacts and original source indices",async()=>{
 const boxes=await Promise.all([createBox(10,10,10),createBox(10,10,10),createBox(10,10,10)]),shapes:any[]=[];
 try{for(let i=0;i<3;i++)shapes.push(await translate(boxes[i],i*15,0,i*20));
 const clip={normal:[0,0,1] as [number,number,number],height:15,keep:"positive" as const,depth:20};
 assert.deepEqual(await Promise.all(shapes.map(s=>classifyProjectionSlab(s,clip))),["outside","inside","outside"]);
 const clipped:any[]=[];try{for(const s of shapes)clipped.push(await clipProjectionShape(s,clip));const faces=clipped.filter(s=>!s.IsNull());const exact=await projectShapes(faces,[0,0,1],[1,0,0]);
 const result=await executeKernelOperation("projection",{operands:shapes.map((_,i)=>({params:{kind:"box",width:10,depth:10,height:10},transform:{translation:[i*15,0,i*20],rotation:[0,0,0],scale:[1,1,1]}})),clipping:clip,normal:[0,0,1],xAxis:[1,0,0]});
 assert.deepEqual(result.map(x=>({...x,sourceIndex:0})),exact.map(x=>({...x,sourceIndex:0})));assert.ok(result.every(x=>x.sourceIndex===1));
 }finally{for(const s of clipped)s.delete();}
 assert.equal(await classifyProjectionSlab(shapes[0],{...clip,height:10,depth:10}),"intersect","touching is never culled");
 }finally{for(const s of shapes)s.delete();for(const s of boxes)s.delete();clearRetainedShapes();}
});
test("partial slab LRU reuses unchanged source/placement/clip only and preserves global occlusion",async()=>{
 clearRetainedShapes();const operand={params:{kind:"box",width:20,depth:10,height:10}},c={normal:[0,0,1],height:5,keep:"negative",depth:20},request={operands:[operand,{params:{kind:"box",width:8,depth:10,height:10},transform:{translation:[5,0,0],rotation:[0,0,0],scale:[1,1,1]}}],clipping:c,normal:[0,-1,0],xAxis:[1,0,0]};
 const a=await executeKernelOperation("projection",request),stats=retainedShapeStatistics();assert.equal(stats.slabs.builds,2);assert.deepEqual(await executeKernelOperation("projection",request),a);assert.equal(retainedShapeStatistics().slabs.builds,2);assert.equal(retainedShapeStatistics().slabs.hits,2);
 const changed=structuredClone(request);changed.operands[0].params.width=22;assert.notDeepEqual(await executeKernelOperation("projection",changed),a);assert.equal(retainedShapeStatistics().slabs.builds,3);assert.deepEqual(await executeKernelOperation("projection",request),a);
 for(let i=0;i<132;i++)await executeKernelOperation("projection",{...request,operands:[operand],clipping:{...c,height:1+i*.01}});
 assert.equal(retainedShapeStatistics().slabs.entries,128);assert.ok(retainedShapeStatistics().slabs.evictions>0);clearRetainedShapes();assert.equal(retainedShapeStatistics().slabs.entries,0);
 await assert.rejects(executeKernelOperation("projection",{...request,clipping:{...c,depth:0}}));assert.equal(retainedShapeStatistics().slabs.entries,0);
});
