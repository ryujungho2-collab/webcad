/** A design development/stress project using production CAD commands. Run from apps/web. */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {CadCommand} from '@agent-webcad/cad-commands';
import {serializeDocument,deserializeDocument} from '@agent-webcad/cad-document';
import {cadDocument} from '../src/state/cadDocument';
import {dispatchCadCommand} from '../src/state/dispatchCadCommand';
import {previewCadCommand,discardCadPlan} from '../src/state/documentPlans';
import {measureDocumentObject} from '../src/state/documentQuery';
import {undoDocument,redoDocument} from '../src/state/history';
import {modelSheetSvg,modelSheetDxf} from '../src/export/modelSheetExport';
import {resetTestDocument,restoreTestDocument,documentState} from '../tests/helpers/documentHarness';
const out=resolve('../../output/projects/courtyard-commons');await mkdir(out,{recursive:true});
resetTestDocument();cadDocument.id='courtyard-commons-design-study';
const times:{label:string;ms:number}[]=[],issues:{id:string;operation:string;reason:string;severity:string}[]=[],parts:string[]=[],floorParts:string[][]=[[],[],[]];
const f=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
async function apply(c:CadCommand){console.log(`BEGIN ${c.type} ${"id" in c?c.id:"objectId" in c?c.objectId:""}`);const t=performance.now(),r=await dispatchCadCommand(c);console.log(`END ${c.type} ${Math.round(performance.now()-t)}ms`);times.push({label:c.type+('id'in c?`:${c.id}`:''),ms:Math.round(performance.now()-t)});assert.ok(r.ok,`${c.type}: ${r.reason}`);return r;}
async function box(id:string,size:[number,number,number],position:[number,number,number],layerId:string){await apply({type:'create-box',id,width:size[0],depth:size[1],height:size[2],position,layerId});}
async function cut(id:string,target:string,tool:string){await apply({type:'boolean-operation',operation:'cut',id,target,tool});}
async function part(id:string,name:string,level?:number){await apply({type:'rename-object',objectId:id,name});await apply({type:'register-model-part',part:{id:`${id}:part`,name,objectId:id}});parts.push(`${id}:part`);if(level!==undefined)floorParts[level].push(`${id}:part`);}
async function probe(id:string,operation:string,c:CadCommand){const before=documentState(),r=await dispatchCadCommand(c);assert.deepEqual(documentState(),before,'Unsupported probe must be atomic');assert.equal(r.ok,false);issues.push({id,operation,reason:r.reason??'rejected',severity:'blocks full project'});console.log(`${id}: ${r.reason}`);}
const resume=process.argv.includes('--resume');let floorAreas:number[]=[];
if(resume){restoreTestDocument(deserializeDocument(await readFile(resolve(out,'baseline.webcad.json'),'utf8')));parts.push(...Object.keys(cadDocument.modelPresentation!.parts));for(let i=0;i<3;i++)floorParts[i].push(...parts.filter(id=>id.startsWith(`l${i+1}-`)||i===0&&id==='entry-walls:part'));floorAreas=[840,792.88,792.88];issues.push({id:'GAP-ELEVATION',operation:'General BRep elevation',reason:'Previous run rejected Boolean solids: primitive box/cylinder only.',severity:'blocks full project'},{id:'GAP-ELLIPSE',operation:'Inclined skylight section',reason:'Previous run rejected ellipse/spline section.',severity:'blocks full project'});}
if(!resume){
for(const [id,name,color] of [['L1','01 Ground · make / exhibit','#715844'],['L2','02 Library · learn','#5a7085'],['L3','03 Research · collaborate','#63775f'],['roof','04 Roof / skylight','#8a776b'],['site','00 Site context','#789079'],['drawings','90 Derived drawings','#202020']]){await apply({type:'create-layer',id,name});await apply({type:'set-layer-style',layerId:id,style:{color,lineType:'continuous',lineWeight:.25}});}
// Slabs, courtyard void, two stair voids, exterior walls and real openings.
for(let level=0;level<3;level++){
 const z=4200*level,layer=`L${level+1}`,prefix=`l${level+1}`;console.log(`Modeling ${layer}`);
 await box(`${prefix}-slab-outer`,[36000,28000,300],[0,0,z-300],layer);await box(`${prefix}-court-void`,[12000,14000,600],[12000,7000,z-450],layer);await cut(`${prefix}-slab-court`,`${prefix}-slab-outer`,`${prefix}-court-void`);let slab=`${prefix}-slab-court`;
 if(level>0)for(const [key,x,y] of [['west',1700,2500],['east',30500,19300]] as const){await box(`${prefix}-${key}-stair-void`,[3800,6200,600],[x,y,z-450],layer);const next=`${prefix}-slab-${key}`;await cut(next,slab,`${prefix}-${key}-stair-void`);slab=next;}
 await part(slab,`Level ${level+1} courtyard floor slab`,level);
 await box(`${prefix}-envelope-outer`,[36000,28000,3900],[0,0,z],layer);await box(`${prefix}-envelope-inner`,[35400,27400,4100],[300,300,z-100],layer);await cut(`${prefix}-wall-ring`,`${prefix}-envelope-outer`,`${prefix}-envelope-inner`);let wall=`${prefix}-wall-ring`;
 for(const [side,size,pos] of [
  ['south',[28000,600,1800],[4000,-100,z+1200]],['north',[28000,600,1800],[4000,27500,z+1200]],
  ['west',[600,12000,1800],[-100,9000,z+1200]],['east',[600,12000,1800],[35500,9000,z+1200]]
 ] as [string,[number,number,number],[number,number,number]][]){await box(`${prefix}-${side}-window`,size,pos,layer);const next=`${prefix}-walls-${side}`;await cut(next,wall,`${prefix}-${side}-window`);wall=next;}
 if(level===0){await box('entry-tool',[4000,700,2700],[16000,-200,0],layer);await cut('entry-walls',wall,'entry-tool');wall='entry-walls';}
 await part(wall,`Level ${level+1} external walls / ribbon openings`,level);
 // Courtyard parapets, separated into four solids to expose junction/ownership behavior.
 for(const [side,size,pos] of [['south',[12000,200,1100],[12000,6800,z]],['north',[12000,200,1100],[12000,21000,z]],['west',[200,14000,1100],[11800,7000,z]],['east',[200,14000,1100],[24000,7000,z]]] as [string,[number,number,number],[number,number,number]][]){const id=`${prefix}-court-${side}`;await box(id,size,pos,layer);await part(id,`Level ${level+1} courtyard edge ${side}`,level);}
 // Program boundaries remain geometric partitions, no fabricated BIM room semantics.
 for(const [key,size,pos] of [['west',[8200,150,3200],[300,14000,z]],['east',[8200,150,3200],[27500,14000,z]],['south',[150,4600,3200],[12000,300,z]],['north',[150,4600,3200],[24000,23100,z]]] as [string,[number,number,number],[number,number,number]][]){const id=`${prefix}-partition-${key}`;await box(id,size,pos,layer);await part(id,`Level ${level+1} program partition ${key}`,level);}
 for(const [i,x,y] of [[0,8500,4500],[1,27500,4500],[2,8500,23500],[3,27500,23500]]){const id=`${prefix}-column-${i}`;await box(id,[450,450,3900],[x,y,z],layer);await part(id,`Level ${level+1} column ${i+1}`,level);}
 // Two U-turn stairs, 28 x150mm risers per storey, 300mm goings, 1500mm clear flight.
 if(level<2)for(const [core,x,y] of [['west',2000,2800],['east',30800,19600]] as const){
  for(let flight=0;flight<2;flight++){
   const id=`${prefix}-${core}-flight-${flight+1}`,y0=flight===0?y:y+4200,z0=z+flight*2100,points:[number,number,number][]=[[0,y0,z0-200],[0,y0,z0]];
   for(let n=0;n<14;n++){const yy=y0+(flight===0?1:-1)*n*300,zz=z0+(n+1)*150;points.push([0,yy,zz],[0,yy+(flight===0?300:-300),zz]);}points.push([0,y0+(flight===0?4200:-4200),z0-200]);
   await apply({type:'create-drawing',id:`${id}-profile`,drawing:'polyline',layerId:layer,params:{workPlane:'YZ',points,closed:true}});await apply({type:'create-extrude',id,profileObjectIds:[`${id}-profile`],distance:1500,layerId:layer});await apply({type:'move-object',objectId:id,translation:[x+flight*1700,0,0]});await apply({type:'set-object-visible',objectId:`${id}-profile`,visible:false});await part(id,`Level ${level+1} ${core} stair flight ${flight+1}`,level);
  }
  const landing=`${prefix}-${core}-landing`;await box(landing,[3200,1500,200],[x,y+4200,z+1900],layer);await part(landing,`Level ${level+1} ${core} stair landing`,level);
 }
}
await box('roof-outer',[36000,28000,300],[0,0,12600],'roof');await box('roof-court-tool',[12000,14000,600],[12000,7000,12450],'roof');await cut('roof-ring','roof-outer','roof-court-tool');await part('roof-ring','Courtyard roof ring');
// Deliberately exercises an unsupported elliptic section, kept as an optional roof study.
await apply({type:'create-primitive',id:'skylight-study',primitive:'cylinder',params:{radius:1800,height:6000},layerId:'roof'});await apply({type:'rotate-object',objectId:'skylight-study',rotation:[0,30,0]});await apply({type:'move-object',objectId:'skylight-study',translation:[18000,14000,11000]});await part('skylight-study','Inclined cylindrical skylight study');
await box('site-base',[54000,44000,150],[-9000,-8000,-650],'site');
await apply({type:'upsert-model-view',view:{id:'studio-axon',name:'01 Courtyard axonometric',camera:{projection:'orthographic',eye:[62000,-48000,44000],target:[18000,14000,5500],up:[0,0,1],near:1,far:300000,zoom:1,left:-34000,right:34000,top:24000,bottom:-24000}}});
floorAreas=await Promise.all(['l1-slab-court','l2-slab-east','l3-slab-east'].map(async id=>(await measureDocumentObject(cadDocument,id)).volume!/300/1e6));assert.ok(Math.abs(floorAreas.reduce((a,b)=>a+b)-2425.76)<.01);
await writeFile(resolve(out,'model-before-drawings.webcad.json'),serializeDocument(cadDocument));console.log(`Model checkpoint: ${parts.length} parts, floor area ${floorAreas}`);
}
const sections:Extract<CadCommand,{type:'upsert-model-section'}>[]=Array.from({length:3},(_,i)=>({type:'upsert-model-section',view:{id:`plan-${i+1}`,name:`A10${i+1} Level ${i+1} plan`,partIds:floorParts[i],basis:'XY',height:i*4200+1500,origin:[0,0],scale:.01,layerId:'drawings'}}));
// Exclude unsupported roof study from issued sections; record the omission explicitly.
const rectParts=parts.filter(id=>id!=='skylight-study:part');sections.push({type:'upsert-model-section',view:{id:'section-aa',name:'A201 Section A-A / courtyard',partIds:rectParts,basis:'XZ',height:14000,origin:[0,0],scale:.01,layerId:'drawings'}},{type:'upsert-model-section',view:{id:'section-bb',name:'A202 Section B-B / stairs',partIds:rectParts,basis:'YZ',height:2750,origin:[0,0],scale:.01,layerId:'drawings'}});
if(!resume){
for(const c of sections){console.log(`Deriving ${c.view.id}`);await apply(c);}
await probe('GAP-ELEVATION','South elevation of Boolean walls',{type:'upsert-model-projection',id:'south',name:'South elevation',partIds:rectParts,basis:'XZ',origin:[0,0],scale:.01,layerId:'drawings'});
await probe('GAP-ELLIPSE','Inclined skylight section',{type:'upsert-model-section',view:{id:'skylight-cut',name:'Skylight horizontal cut',partIds:['skylight-study:part'],basis:'XY',height:13500,origin:[0,0],scale:.05,layerId:'drawings'}});
await writeFile(resolve(out,'baseline.webcad.json'),serializeDocument(cadDocument));
}
// Real revision: change entrance and restore views explicitly; compare source measurement and history.
await apply({type:'set-object-visible',objectId:'entry-tool',visible:true});const before=documentState(),initialVolume=(await measureDocumentObject(cadDocument,'entry-walls')).volume!;
await apply({type:'update-primitive',objectId:'entry-tool',params:{width:4800,depth:700,height:2700}});const after=documentState(),changedVolume=(await measureDocumentObject(cadDocument,'entry-walls')).volume!,unresolved=Object.values(cadDocument.modelPresentation!.sections!).filter(v=>v.status==='unresolved').map(v=>v.id);
assert.ok(changedVolume<initialVolume);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
if(unresolved.length)issues.push({id:'GAP-REFERENCE',operation:'Entry width4000 to4800',reason:`Explicit rebind required for ${unresolved.join(', ')||'none'}; source volume delta ${initialVolume-changedVolume} mm3`,severity:'editing friction'});
for(const id of unresolved)await apply(sections.find(c=>c.view.id===id)!);await apply({type:'set-object-visible',objectId:'entry-tool',visible:false});
// Program labels linked to their view; annotations remain paper-sized at layout scale.
const programs=[['MAKE / FABRICATION','EXHIBITION / CAFE','PUBLIC FORUM'],['LIBRARY / STACKS','LEARNING COMMONS','MEDIA LAB'],['RESEARCH STUDIOS','CO-WORK / CRITIQUE','SEMINAR / TERRACE']];
for(let level=0;level<3;level++){const view=cadDocument.modelPresentation!.sections![`plan-${level+1}`],source=Object.values(view.outputs)[0].objectId;for(const [i,label] of programs[level].entries()){const xy:[[number,number],[number,number],[number,number]]=[[65,105],[295,110],[180,40]];await apply({type:'upsert-model-note',id:`program-${level}-${i}`,sourceObjectId:source,anchor:'start',mode:'snapshot',quantity:'text',text:label,point:xy[i],height:2.5,layerId:'drawings'});}}
// Dimensions on stable long edges; sheets include model-linked true lengths.
for(const viewId of ['plan-1','section-aa']){const v=cadDocument.modelPresentation!.sections![viewId],edge=Object.values(v.outputs).map(o=>({id:o.objectId,p:f(o.objectId).params.points as number[][]})).filter(o=>o.p?.length===2).sort((a,b)=>Math.hypot(...b.p[1].map((n,i)=>n-b.p[0][i]))-Math.hypot(...a.p[1].map((n,i)=>n-a.p[0][i])))[0];await apply({type:'upsert-model-dimension',id:`dimension-${viewId}`,sourceObjectId:edge.id,dimension:'linear',offset:15,angle:45,orientation:'aligned',height:3,layerId:'drawings'});}
const publication:Extract<CadCommand,{type:'layout-model-sheet-set'}>={type:'layout-model-sheet-set',id:'studio-set',name:'Courtyard Commons',artboardId:'studio-sheet',viewIds:sections.map(c=>c.view.id),fixedViewIds:[],denominators:[100],origin:[50000,0],size:[420,297],margin:12,gap:10,maxPages:8,alignment:'none',template:'standard',fields:{drawingName:'Courtyard Commons / design study',author:'CAD capability study',revision:'R1'}};
// 36m plan at1:100 may exceed A3 height with margin/title; report and choose A2 explicitly.
let reviewed=await previewCadCommand(publication);if(!reviewed.result.ok){issues.push({id:'LAYOUT-A3',operation:'Five views at1:100 on A3',reason:reviewed.result.reason??'overflow',severity:'paper choice'});discardCadPlan(reviewed.planId);publication.size=[594,420];reviewed=await previewCadCommand(publication);}assert.ok(reviewed.result.ok,reviewed.result.reason);discardCadPlan(reviewed.planId);await apply(publication);
const pages=Object.values(cadDocument.modelPresentation!.sheets!).sort((a,b)=>(a.publication?.page??1)-(b.publication?.page??1));for(const page of pages){const n=page.publication?.page??1;await writeFile(resolve(out,`sheet-${n}.svg`),modelSheetSvg(page.id));await writeFile(resolve(out,`sheet-${n}.dxf`),modelSheetDxf(page.id).text);}
const data=serializeDocument(cadDocument);assert.deepEqual(deserializeDocument(data),cadDocument);await writeFile(resolve(out,'courtyard-commons.webcad.json'),data);
await writeFile(resolve(out,'report.json'),JSON.stringify({project:'Courtyard Commons',date:'2026-10-12',phase:'design-development capability study; not completed graduation submission',site:{fictional:true,sizeM:[54,44],buildingM:[36,28],courtyardM:[12,14]},floorAreasM2:floorAreas,totalFloorAreaM2:floorAreas.reduce((a,b)=>a+b),storeys:3,floorHeightMm:4200,parts:parts.length,documentObjects:Object.keys(cadDocument.objects).length,derivedViews:sections.map(c=>({id:c.view.id,edges:Object.keys(cadDocument.modelPresentation!.sections![c.view.id].outputs).length})),pages:pages.length,paperMm:publication.size,scale:100,revision:{entryWidthMm:[4000,4800],initialVolume,changedVolume,unresolved,undoRedo:true,explicitRebind:unresolved.length>0},issues,timingScope:resume?'resume commands only; excludes model build and layout previews':'command dispatch only; excludes layout previews',times,limits:['Scripted modeling via public CAD commands; native editing/export verified separately.','Conceptual space program and fictional site; no institution grading, code, structure, accessibility or fire approval asserted.','Sloping skylight is a study solid, omitted from issued sections because ellipse section is unsupported.','Program partitions and stairs are geometry; no BIM floor/room/stair semantics or schedules.','Actual elevation generation blocked; no traced or manually fabricated replacement elevation.']},null,2)+'\n');
console.log(JSON.stringify({out,parts:parts.length,pages:pages.length,issues},null,2));

