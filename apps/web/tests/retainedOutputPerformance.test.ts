import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {deserializeDocument} from "@agent-webcad/cad-document";
import {executeKernelOperation,clearRetainedShapes,retainedShapeStatistics} from "../src/cad/kernelRuntime";
import {sheetViewGroups,relocateSheetNotes,refreshSheetLayoutGeometry} from "../src/state/modelSheetLayoutService";
import {sheetGroupBounds} from "../src/precision/modelSheetLayout";
const box={kind:"box",width:20,depth:30,height:40};
const cut={kind:"boolean",operation:"cut",operands:[{params:box},{params:{kind:"box",width:10,depth:10,height:50},transform:{translation:[5,5,-5],rotation:[0,0,0],scale:[1,1,1]}}]};
test("retained native BRep has task-owned wrappers, exact transforms, nested revisions and bounded disposal",async()=>{
 clearRetainedShapes();const operand={params:cut},request={operands:[operand],normal:[0,0,1],xAxis:[1,0,0]};
 const cold=await executeKernelOperation("projection",request),s=retainedShapeStatistics();assert.ok(s.builds>0);
 assert.deepEqual(await executeKernelOperation("projection",request),cold);assert.equal(retainedShapeStatistics().builds,s.builds);assert.ok(retainedShapeStatistics().hits>s.hits);
 await executeKernelOperation("solid",cut);assert.deepEqual(await executeKernelOperation("projection",request),cold,"meshing cannot alter analytic HLR");
 const placed={...operand,transform:{translation:[100,0,0],rotation:[0,0,0],scale:[1,1,1]}};
 assert.notDeepEqual(await executeKernelOperation("projection",{...request,operands:[placed]}),cold);
 const changed=structuredClone(request);(changed.operands[0].params.operands[0].params as any).width=25;assert.notDeepEqual(await executeKernelOperation("projection",changed),cold);
 assert.deepEqual(await executeKernelOperation("projection",request),cold,"Undo-like old source key is reusable");
 const count=retainedShapeStatistics().entries;await assert.rejects(executeKernelOperation("solid",{kind:"unknown"}));assert.equal(retainedShapeStatistics().entries,count);
 for(let i=0;i<140;i++)await executeKernelOperation("section",{operand:{params:{...box,width:i+1}},normal:[0,0,1],height:10});
 assert.equal(retainedShapeStatistics().entries,retainedShapeStatistics().limit);assert.ok(retainedShapeStatistics().evictions>0);
 clearRetainedShapes();assert.equal(retainedShapeStatistics().entries,0);assert.deepEqual(await executeKernelOperation("projection",request),cold);
 clearRetainedShapes();
});
test("R5 3400 objects retain paper bounds and live mm after moving all 14 view groups without BRep tasks",async()=>{
 const d=deserializeDocument(await readFile(new URL("../../../output/projects/courtyard-commons/issued-r5/courtyard-commons.webcad.json",import.meta.url),"utf8")),before=structuredClone(d),p=d.modelPresentation!,ids=[...Object.keys(p.sections!),...Object.keys(p.projections)],groups=sheetViewGroups(d,ids);
 const bounds=Object.fromEntries(ids.map(id=>[id,sheetGroupBounds(d,groups[id])]));
 const old=Object.fromEntries(ids.map(id=>{const v=p.sections![id]??p.projections[id];return [id,{origin:[...v.origin] as [number,number],scale:v.scale}];}));
 const tasks=performance.getEntriesByName("agent-webcad:kernel-task:projection").length+performance.getEntriesByName("agent-webcad:kernel-task:section").length;
 for(const id of ids){const v=p.sections![id]??p.projections[id];v.origin=[v.origin[0]+10,v.origin[1]+5];}
 relocateSheetNotes(d,groups,old);await refreshSheetLayoutGeometry(d,before);
 for(const id of ids){const next=sheetGroupBounds(d,groups[id]);for(let i=0;i<4;i++)assert.ok(Math.abs(next[i]-bounds[id][i]-(i%2?5:10))<1e-7);const v=p.sections![id]??p.projections[id];assert.equal(v.status,"resolved");assert.deepEqual(v.outputs,(before.modelPresentation!.sections![id]??before.modelPresentation!.projections[id]).outputs);}
 assert.equal(performance.getEntriesByName("agent-webcad:kernel-task:projection").length+performance.getEntriesByName("agent-webcad:kernel-task:section").length,tasks);
 for(const f of Object.values(d.features))if(f.params.modelNote||f.params.modelDrawingReference)assert.equal(f.params.referenceStatus,"resolved");
 assert.notDeepEqual(d,before);assert.deepEqual(before,deserializeDocument(await readFile(new URL("../../../output/projects/courtyard-commons/issued-r5/courtyard-commons.webcad.json",import.meta.url),"utf8")));
});

test("paper bounds stream a dense derived polyline without argument-stack limits",async()=>{
 const d=deserializeDocument(await readFile(new URL("../../../output/projects/courtyard-commons/issued-r5/courtyard-commons.webcad.json",import.meta.url),"utf8"));
 const id="dense",points=Array.from({length:150000},(_,i)=>[i,i%2,0]);
 d.objects[id]={id,name:id,geometryId:id,layerId:"default",visible:true};
 d.layers.default={id:"default",name:"Default",visible:true,locked:false,objectIds:[id]};
 d.features[id]={id,type:"drawing",output:id,inputs:[],params:{kind:"polyline",workPlane:"XY",points,closed:false}};
 assert.deepEqual(sheetGroupBounds(d,[id]),[-.25,-.25,149999.25,1.25]);
});
