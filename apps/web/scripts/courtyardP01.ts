import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {restoreTestDocument} from "../tests/helpers/documentHarness";
import {modelSheetSvg,modelSheetDxf} from "../src/export/modelSheetExport";
const out=resolve('../../output/projects/courtyard-commons/p01-fixed');await mkdir(out,{recursive:true});
restoreTestDocument(deserializeDocument(await readFile(resolve(out,'../courtyard-commons.webcad.json'),'utf8')));
const metrics:{label:string;ms:number;sectionTasks:number;projectionTasks:number}[]=[];
const tasks=(name:string)=>performance.getEntriesByName(`agent-webcad:kernel-task:${name}`).length;
async function measured<T>(label:string,run:()=>Promise<T>){console.log(`BEGIN ${label}`);const start=performance.now(),s=tasks('section'),p=tasks('projection'),r=await run();metrics.push({label,ms:Math.round(performance.now()-start),sectionTasks:tasks('section')-s,projectionTasks:tasks('projection')-p});console.log(JSON.stringify(metrics.at(-1)));return r;}
const apply=async(c:CadCommand)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;};
const note=Object.values(cadDocument.features).find(f=>f.output==='program-0-0')!.params.modelNote as any;
await measured('annotation edit without kernel recomputation',()=>apply({type:'upsert-model-note',id:'program-0-0',...note,text:'MAKE / FABRICATION — R2',layerId:'drawings'}));
assert.equal(metrics.at(-1)!.sectionTasks,0);
const root=cadDocument.modelPresentation!.sheets!['studio-set'],board=cadDocument.artboards![root.artboardId];
const publication:Extract<CadCommand,{type:'layout-model-sheet-set'}>={type:'layout-model-sheet-set',id:root.id,name:'Courtyard Commons',artboardId:root.artboardId,viewIds:['plan-1','plan-2','plan-3','section-aa','section-bb'],fixedViewIds:[],denominators:[100],origin:[...board.origin],size:[...board.size],margin:12,gap:10,maxPages:8,alignment:'none',template:'standard',fields:root.publication!.fields};
for(const label of ['cold five-view sheet Review','warm five-view sheet Review']){const review=await measured(label,()=>previewCadCommand(publication));assert.ok(review.result.ok,review.result.reason);discardCadPlan(review.planId);}
assert.equal(metrics.at(-1)!.sectionTasks,0);
await measured('five-view sheet Apply',()=>apply(publication));
const partIds=Object.keys(cadDocument.modelPresentation!.parts).filter(id=>id!=='skylight-study:part');
for(const [id,basis] of [['elevation-front','XZ'],['elevation-right','YZ']] as const)await measured(id,()=>apply({type:'upsert-model-projection',method:'brep-hlr',id,name:id==='elevation-front'?'South elevation':'East elevation',partIds,basis,origin:[0,0],scale:.01,layerId:'drawings'}));
await measured('seven-view sheet Apply',()=>apply({...publication,viewIds:[...publication.viewIds,'elevation-front','elevation-right'],fields:{...publication.fields,revision:'R2'}}));
assert.ok([...Object.values(cadDocument.modelPresentation!.sections!),...Object.values(cadDocument.modelPresentation!.projections)].every(v=>v.status==='resolved'));
const pages=Object.values(cadDocument.modelPresentation!.sheets!).sort((a,b)=>a.publication!.page-b.publication!.page);
for(const page of pages){await writeFile(resolve(out,`sheet-${page.publication!.page}.svg`),modelSheetSvg(page.id));const dxf=modelSheetDxf(page.id);assert.equal(dxf.skipped,0);await writeFile(resolve(out,`sheet-${page.publication!.page}.dxf`),dxf.text);}
const saved=serializeDocument(cadDocument);assert.deepEqual(deserializeDocument(saved),cadDocument);await writeFile(resolve(out,'courtyard-commons.webcad.json'),saved);
await writeFile(resolve(out,'report.json'),JSON.stringify({date:'2026-10-12',phase:'P0/P1 corrections',parts:Object.keys(cadDocument.modelPresentation!.parts).length,views:7,pages:pages.length,metrics,projectionOutputs:Object.fromEntries(Object.values(cadDocument.modelPresentation!.projections).map(v=>[v.id,{edges:Object.keys(v.outputs).length,hidden:Object.values(v.outputs).filter(e=>Object.values(cadDocument.features).find(f=>f.output===e.objectId)?.params.projectionVisibility==='hidden').length}])),limits:['Line/circle/arc HLR; unsupported ellipse/spline rejects atomically.','Cut-only architectural plans and hatch remain G6-D4-H1 work.','Legacy simple primitive projections keep prior outlines; explicit HLR selection adds assembly occlusion.','Node timings exclude browser/GPU and output file I/O.']},null,2)+'\n');
console.log(`SAVED ${out}: ${pages.length} pages`);
