import {readFile,writeFile,mkdir} from "node:fs/promises";
import {deserializeDocument} from "@agent-webcad/cad-document";
import {sheetViewGroups,relocateSheetNotes,refreshSheetLayoutGeometry} from "../src/state/modelSheetLayoutService";
import {sheetGroupBounds} from "../src/precision/modelSheetLayout";
const doc=deserializeDocument(await readFile("../../output/projects/courtyard-commons/issued-r5/courtyard-commons.webcad.json","utf8"));
const ids=[...Object.keys(doc.modelPresentation!.sections!),...Object.keys(doc.modelPresentation!.projections)];
const records=[];
if(process.argv.includes("--scale")){
 const {executeKernelOperation,retainedShapeStatistics,clearRetainedShapes}=await import("../src/cad/kernelRuntime");
 for(const count of [10,50,100]){clearRetainedShapes();const operands=Array.from({length:count},(_,i)=>({params:{kind:"box",width:20+i/100,depth:15,height:10},transform:{translation:[(i%10)*30,Math.floor(i/10)*25,0],rotation:[0,0,0],scale:[1,1,1]}}));let expected="";
 for(let run=0;run<6;run++){const t=performance.now(),curves=await executeKernelOperation("projection",{operands,normal:[0,0,1],xAxis:[1,0,0]}),ms=performance.now()-t,key=JSON.stringify(curves);if(run===0)expected=key;if(expected!==key)throw Error("Warm output differs from cold geometry");records.push({count,run:run+1,kind:run===0?"first source build (module may be warm)":"warmed raw HLR",ms,edges:curves.length,retained:retainedShapeStatistics()});console.log(JSON.stringify(records.at(-1)));}}
 await writeFile("../../output/benchmarks/p2-scale-after.json",JSON.stringify({fixture:"spaced boxes; not architectural complexity",records},null,2));process.exit(0);
}
if(process.argv.includes("--review")){
 const {retainedShapeStatistics}=await import("../src/cad/kernelRuntime");
 const {restoreTestDocument,documentState}=await import("../tests/helpers/documentHarness"),{previewCadCommand,applyCadPlan}=await import("../src/state/documentPlans"),{undoDocument}=await import("../src/state/history");const assert=(await import("node:assert/strict")).default;
 const f=Object.values(doc.features).find(f=>f.output==="skylight-study")!,{kind:_,...params}=f.params;
 for(let i=0;i<3;i++){restoreTestDocument(doc);const before=documentState(),t=performance.now(),r=await previewCadCommand({type:"update-primitive",objectId:f.output,params:{...params,radius:2000}});const review=performance.now()-t;assert.ok(r.result.ok,r.result.reason);assert.deepEqual(documentState(),before);const at=performance.now();assert.ok((await applyCadPlan(r.planId)).ok);const applyMs=performance.now()-at,ut=performance.now();assert.ok(undoDocument());const undo=performance.now()-ut;assert.deepEqual(documentState(),before);records.push({run:i+1,kind:i===0?"first source Review":"warmed source Review",reviewMs:review,applyMs,undoMs:undo,changes:r.changes.length,retained:retainedShapeStatistics()});console.log(JSON.stringify(records.at(-1)));}
 await writeFile(`../../output/benchmarks/p2-review-${process.env.P2_PHASE??"after"}.json`,JSON.stringify({records,phases:performance.getEntriesByType("measure").filter(m=>/preview|kernel-task/.test(m.name)).map(m=>({name:m.name,ms:m.duration}))},null,2));process.exit(0);
}
if(process.argv.includes("--kernel")||process.argv.includes("--slab")){
 const {executeKernelOperation,retainedShapeStatistics}=await import("../src/cad/kernelRuntime");const {getObjectTransform}=await import("../src/precision/objectTransform");
 const features=new Map(Object.values(doc.features).map(f=>[f.output,f])),operands=Object.values(doc.modelPresentation!.parts).map(p=>({params:features.get(p.objectId)!.params,transform:getObjectTransform(doc.objects[p.objectId],features.get(p.objectId))}));
 for(let run=0;run<2;run++){const t=performance.now(),result=await executeKernelOperation("projection",{operands,normal:[0,-1,0],xAxis:[1,0,0],...process.argv.includes("--slab")?{clipping:{normal:[0,0,1],height:1350,keep:"negative",depth:10000}}:{}});records.push({run:run+1,kind:run===0?"first raw kernel projection":"warmed raw kernel projection",ms:performance.now()-t,edges:result.length,retained:retainedShapeStatistics(),fingerprint:JSON.stringify(result)});console.log(JSON.stringify({...records.at(-1),fingerprint:undefined}));}
 await writeFile(`../../output/benchmarks/p2-${process.argv.includes("--slab")?"slab":"kernel"}-${process.env.P2_PHASE??"before"}.json`,JSON.stringify({records},null,2));process.exit(0);
}

for(let i=0;i<Number(process.env.P2_SAMPLES??3);i++){
 const stages:Record<string,number>={},start=performance.now(),d=structuredClone(doc);stages.snapshot=performance.now()-start;
 let t=performance.now();const groups=sheetViewGroups(d,ids);stages.groups=performance.now()-t;
 const old=Object.fromEntries(ids.map(id=>{const v=d.modelPresentation!.sections![id]??d.modelPresentation!.projections[id];return [id,{origin:[...v.origin] as [number,number],scale:v.scale}]}));
 for(const id of ids){const v=d.modelPresentation!.sections![id]??d.modelPresentation!.projections[id];v.origin=[v.origin[0]+10,v.origin[1]+5];}
 t=performance.now();relocateSheetNotes(d,groups,old);stages.notes=performance.now()-t;
 t=performance.now();await refreshSheetLayoutGeometry(d,doc);stages.refresh=performance.now()-t;
 t=performance.now();const bounds=Object.fromEntries(ids.map(id=>[id,sheetGroupBounds(d,groups[id])]));stages.bounds=performance.now()-t;
 records.push({run:i+1,kind:i===0?"first execution":"warmed",stages,totalMs:performance.now()-start,bounds,outputs:Object.keys(d.objects).length});console.log(JSON.stringify(records.at(-1)));
}
await mkdir("../../output/benchmarks",{recursive:true});await writeFile(`../../output/benchmarks/p2-${process.env.P2_PHASE??"before"}.json`,JSON.stringify({fixture:"issued-r5",parts:56,views:14,records},null,2));
