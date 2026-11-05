import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {serializeDocument,deserializeDocument} from '@agent-webcad/cad-document';
import type {CadCommand} from '@agent-webcad/cad-commands';
import {cadDocument} from '../src/state/cadDocument';
import {dispatchCadCommand} from '../src/state/dispatchCadCommand';
import {previewCadCommand,applyCadPlan,discardCadPlan} from '../src/state/documentPlans';
import {undoDocument,redoDocument,cadHistory} from '../src/state/history';
import {measureDocumentObject} from '../src/state/documentQuery';
import {resetTestDocument,documentState,restoreTestDocument} from '../tests/helpers/documentHarness';
import {collectExportDrawings,exportStepBytes} from '../src/export/exportModel';
import {exportGlbBytes} from '../src/export/glbExport';
import {encodeSvg} from '../src/export/svgWriter';
import {encodeDxf} from '../src/interop/dxfWriter';
import {createCadToolSession} from '../src/copilot/cadToolSession';
const dir=resolve('../../output/projects/three-storey-house');await mkdir(dir,{recursive:true});resetTestDocument();cadDocument.id='module-house-3f';
type P=[number,number];type Part={id:string;name:string;level:string;kind:string;expected?:number};
const parts:Part[]=[],sources:Record<string,string[]>={},walls:any[]=[],checks:string[]=[],schedule:any[]=[];
const run=async(c:CadCommand)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,`${c.type}: ${r.reason}`);};
const check=(ok:unknown,label:string)=>{assert.ok(ok,label);checks.push(label);};
const rect=(x:number,y:number,w:number,d:number):P[]=>[[x,y],[x+w,y],[x+w,y+d],[x,y+d]];
const finish=(kind:string)=>({name:kind,color:({wall:'#e7e1d4',slab:'#b4b5ad',timber:'#b18b60',metal:'#3b484a',glass:'#a8c9cf',panel:'#757f7b'} as any)[kind]??'#b4b5ad',roughness:kind==='glass'?.15:.75,metalness:kind==='metal'?.7:0,opacity:kind==='glass'?.3:1});
async function layer(id:string){await run({type:'create-layer',id,name:id});}
for(const l of ['F1','F2','F3','RF']){await layer(l);await layer(`${l}-2D`);sources[l]=[];}
async function profile(id:string,p:P[],level:string,z=0,closed=true){await run({type:'create-drawing',id,name:id,drawing:closed?'polyline':'line',layerId:`${level}-2D`,params:{kind:closed?'polyline':'line',workPlane:'XY',points:p.map(v=>[...v,z]),closed}});sources[level].push(id);}
const solidCommands:CadCommand[]=[],details:{id:string;level:string;kind:string;h:number}[]=[];
async function box(id:string,name:string,l:string,x:number,y:number,z:number,w:number,d:number,h:number,kind='timber'){
 await profile(`${id}-source`,rect(x,y,w,d),l,z);details.push({id,level:l,kind,h});parts.push({id,name,level:l,kind,expected:w*d*h});
}
const opening=(id:string,along:number,width:number,kind='window',sill=800,height=1800)=>({id,along,width,kind,side:'left',sill,height});
const roomLabels:Record<string,{position:P;text:string;size:number}[]>={
 F1:[{position:[2700,2400],text:'LIVING / DINING',size:210},{position:[2700,7200],text:'WORK / GUEST',size:210},{position:[6600,2400],text:'KITCHEN',size:210},{position:[6600,8200],text:'WC / UTILITY',size:180}],
 F2:[{position:[2700,2400],text:'MASTER SUITE',size:210},{position:[2700,7200],text:'BEDROOM 02',size:210},{position:[6600,2400],text:'BEDROOM 03',size:210},{position:[6600,8200],text:'BATH / LAUNDRY',size:160}],
 F3:[{position:[2700,2400],text:'ROOF TERRACE',size:210},{position:[2700,7200],text:'DESIGN STUDIO',size:210},{position:[6600,2400],text:'LIBRARY',size:210},{position:[6600,8200],text:'TEA / WC',size:180}],RF:[]};
for(let f=0;f<3;f++){
 const l=`F${f+1}`,z=f*3000;await profile(`${l}-floor`,rect(0,0,10800,9600),l);if(f)await profile(`${l}-stair-void`,rect(7950,5450,2400,3850),l);
 solidCommands.push({type:'create-architectural-slab',id:`${l}-slab`,layerId:l,definition:{kind:'floor',sourceObjectIds:[`${l}-floor`,...(f?[`${l}-stair-void`]:[])],level:z,thickness:220}});
 parts.push({id:`${l}-slab`,name:`${l} floor / FFL ${z}`,level:l,kind:'slab',expected:(10800*9600-(f?2400*3850:0))*220});
 const southY=f===2?4200:125;
 const definitions=[{id:'south',a:[125,southY],b:[5275,southY],t:250,op:[opening(`${l}-W01`,2575,3200,'window',f===2?0:450,f===2?2600:2150)]},
 {id:'southEast',a:[5275,125],b:[10675,125],t:250,op:[opening(`${l}-W02`,1800,1800),...(f===0?[opening(`${l}-D01`,4200,1000,'door',0,2300)]:[])]},
 {id:'west',a:[125,southY],b:[125,9475],t:250,op:[opening(`${l}-W03`,(9475-southY)/2,1600)]},
 {id:'east',a:[10675,125],b:[10675,9475],t:250,op:[opening(`${l}-W04`,2500,1800),opening(`${l}-W05`,7400,1200)]},
 {id:'north',a:[125,9475],b:[10675,9475],t:250,op:[opening(`${l}-W06`,2600,2000),opening(`${l}-W07`,6500,1000,'window',1300,1000)]},
 {id:'spine',a:[5400,250],b:[5400,9350],t:150,op:[opening(`${l}-D02`,4200,1000,'door',0,2200),opening(`${l}-D03`,6500,900,'door',0,2200)]},
 {id:'westRoom',a:[250,4800],b:[5325,4800],t:150,op:[opening(`${l}-D04`,4300,900,'door',0,2200)]},
 {id:'service',a:[5475,7200],b:[7875,7200],t:150,op:[opening(`${l}-D05`,1200,800,'door',0,2200)]},
 {id:'core',a:[7875,7200],b:[7875,9350],t:150,op:[]},
 ...(f===2?[{id:'terraceReturn',a:[5275,250],b:[5275,4200],t:150,op:[opening(`${l}-D06`,1700,1000,'door',0,2300)]}]:[])];
 for(const w of definitions){const id=`${l}-${w.id}`;await profile(`${id}-axis`,[w.a as P,w.b as P],l,0,false);const definition={mode:'centerline' as const,sourceObjectIds:[`${id}-axis`],height:2780,thickness:w.t,baseLevel:z,openings:w.op as any};walls.push({...w,id,level:l,definition});solidCommands.push({type:'create-wall',id,layerId:l,definition});parts.push({id,name:id,level:l,kind:'wall',expected:(Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])*2780-w.op.reduce((s,o)=>s+o.width*o.height,0))*w.t});
 for(const o of w.op){schedule.push({level:l,host:id,...o});if(o.kind!=='window')continue;const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy),cx=w.a[0]+dx/len*o.along,cy=w.a[1]+dy/len*o.along,ax=!!dx;
 await box(`${o.id}-glass`,o.id,l,cx-(ax?o.width/2:15),cy-(ax?15:o.width/2),z+o.sill,ax?o.width:30,ax?30:o.width,o.height,'glass');
 for(const sign of [-1,1])await box(`${o.id}-jamb${sign}`,`${o.id} jamb`,l,cx+(ax?sign*(o.width/2-25):0)-(ax?25:60),cy+(ax?0:sign*(o.width/2-25))-(ax?60:25),z+o.sill,ax?50:120,ax?120:50,o.height,'metal');
 }}
 if(f<2){for(let n=1;n<=20;n++){if(n===10||n===20)continue;const first=n<10,i=first?n-1:n-11;await box(`${l}-tread-${n}`,`${l} stair tread ${n}`,l,first?8050:9250,first?5550+i*280:5550+(8-i)*280,z+n*150-70,1000,280,70,'timber');}await box(`${l}-landing`,`${l} half landing`,l,8050,8070,z+1500-120,2200,1100,120,'timber');}
 for(let i=0;i<4;i++)await box(`${l}-cabinet${i}`,`${l} 600mm cabinet module`,l,5700+i*600,350,z,590,600,900,'timber');
 await box(`${l}-table`,`${l} work / dining surface`,l,1400,6500,z+720,1800,800,60,'timber');
 for(const [i,x,y]of [[0,1450,6550],[1,3100,6550],[2,1450,7150],[3,3100,7150]])await box(`${l}-table-leg${i}`,'Table leg',l,x,y,z,50,50,720,'metal');
 for(let i=0;i<8;i++)await box(`${l}-screen${i}`,`${l} 600 pitch facade screen`,l,5700+i*600,-120,z+300,80,120,2300,'panel');
}
await profile('RF-outline',[[0,4200],[5400,4200],[5400,0],[10800,0],[10800,9600],[0,9600]],'RF');solidCommands.push({type:'create-architectural-slab',id:'RF-slab',layerId:'RF',definition:{kind:'ceiling',sourceObjectIds:['RF-outline'],level:8780,thickness:220}});parts.push({id:'RF-slab',name:'Roof / drainage design pending',level:'RF',kind:'slab'});
// Terrace guard uses actual posts and rails; close infill remains an explicit delivery issue.
for(let i=0;i<6;i++)await box(`F3-guard${i}`,'Terrace guard post','F3',100+i*1000,100,6000,50,50,1100,'metal');
await box('F3-handrail','Terrace top rail','F3',100,100,7075,5100,50,50,'metal');
await writeFile(resolve(dir,'01-source-2d.webcad.json'),serializeDocument(cadDocument));
console.log(`2D first: ${Object.values(sources).flat().length} profiles/axes. Building ${parts.length} linked parts.`);
for(const c of solidCommands)await run(c);
for(const d of details)await run({type:'create-extrude',id:d.id,layerId:d.level,profileObjectIds:[`${d.id}-source`],distance:d.h});
for(const p of parts){await run({type:'rename-object',objectId:p.id,name:p.name});await run({type:'set-solid-finish',objectId:p.id,finish:finish(p.kind)});await run({type:'register-model-part',part:{id:`part-${p.id}`,objectId:p.id,name:p.name}});}
for(const ids of Object.values(sources))for(const id of ids)await run({type:'set-object-visible',objectId:id,visible:false});
const measured=[];for(const [i,p]of parts.entries()){const m=await measureDocumentObject(cadDocument,p.id);check(m.validity==='valid',`${p.id}: valid BRep`);if(p.expected!==undefined)check(Math.abs(m.volume!-p.expected)<Math.max(1,p.expected*1e-6),`${p.id}: independent volume`);measured.push({...p,volumeMm3:m.volume});if(i%40===0)console.log(`Measured ${i}/${parts.length}`);}
for(const [id,min,max]of [['F1-slab',-220,0],['F2-slab',2780,3000],['F3-slab',5780,6000],['RF-slab',8780,9000]] as const){const m=await measureDocumentObject(cadDocument,id);check(!!m.bounds&&Math.abs(m.bounds.min[2]-min)<.01&&Math.abs(m.bounds.max[2]-max)<.01,`${id}: correct top/bottom level and wall contact`);}
// Same public edit tool used by Copilot and MCP: no alternate geometry engine.
const target=walls.find(w=>w.id==='F1-westRoom'),before=documentState();cadHistory.clear();
const session=createCadToolSession({document:cadDocument,selectionIds:[target.id],layerId:'F1',workPlane:'XY'});
const plan=await session.plan([{id:'edit-wall',name:'wall.update',arguments:{objectId:target.id,height:2780,thickness:150,baseLevel:0,start:[250,5000],end:[5325,5000],refreshDrawings:false}}]);
const preview=await previewCadCommand(plan.command);check(preview.result.ok,'Shared tool preview valid');check(JSON.stringify(documentState())===JSON.stringify(before),'Preview leaves original intact');check((await applyCadPlan(preview.planId)).ok,'Shared tool applies');discardCadPlan(preview.planId);const after=documentState();check(undoDocument(),'Undo wall edit');assert.deepEqual(documentState(),before);check(redoDocument(),'Redo wall edit');assert.deepEqual(documentState(),after);undoDocument();
await layer('sheets');const sheetList=[];
for(const l of ['F1','F2','F3']){
 const ids=parts.filter(p=>p.level===l&&['wall','slab'].includes(p.kind)).map(p=>`part-${p.id}`),id=`A10${l.slice(1)}`;
 await run({type:'upsert-model-section',view:{id,name:`${l} plan / cut +1200`,partIds:ids,basis:'XY',height:(Number(l.slice(1))-1)*3000+1200,origin:[0,0],scale:1,layerId:'sheets'}});sheetList.push({id,label:`${l} PLAN`,labels:roomLabels[l]});
}
for(const [id,basis,height,label]of [['A201','XZ',6800,'SECTION A-A / Y6800'],['A202','YZ',9750,'STAIR SECTION / X9750']] as const){await run({type:'upsert-model-section',view:{id,name:label,partIds:parts.filter(p=>p.kind!=='panel').map(p=>`part-${p.id}`),basis,height,origin:[0,0],scale:1,layerId:'sheets'}});sheetList.push({id,label,labels:[]});}
for(const s of sheetList){const v=cadDocument.modelPresentation!.sections![s.id];check(v.status==='resolved',`${s.id}: resolved live BRep section`);const ids=Object.values(v.outputs).map(o=>o.objectId);const lines=collectExportDrawings('XY',cadDocument,ids);check(lines.length>0,`${s.id}: nonempty drawing`);await writeFile(resolve(dir,`${s.id}.svg`),encodeSvg(lines.map(l=>({...l,color:'#22313a',lineWeight:12})),{texts:[...s.labels,{position:[0,10800],text:`${s.id} | MODULE HOUSE | ${s.label} | R0 / REVIEW ONLY`,size:200},{position:[0,-1000],text:'mm | footprint 10800 x 9600 | FFL 0 / 3000 / 6000 | 20 x 150 stair rise / 280 going',size:140}]}));const dxf=encodeDxf({...cadDocument,rootObjects:ids});check(dxf.skipped===0,`${s.id}: DXF lossless supported entities`);await writeFile(resolve(dir,`${s.id}.dxf`),dxf.text);}
await run({type:'set-layer-visible',layerId:'sheets',visible:false});
const native=serializeDocument(cadDocument),snapshot=documentState();restoreTestDocument(deserializeDocument(native));assert.deepEqual(documentState(),snapshot);check(true,'Native reopen preserves sources / parts / drawings');
await writeFile(resolve(dir,'house.webcad.json'),native);await writeFile(resolve(dir,'house.step'),await exportStepBytes(parts.map(p=>p.id)));await writeFile(resolve(dir,'house.glb'),await exportGlbBytes(parts.map(p=>p.id)));
await writeFile(resolve(dir,'parts.json'),JSON.stringify(measured,null,2));await writeFile(resolve(dir,'openings.json'),JSON.stringify(schedule,null,2));
await writeFile(resolve(dir,'quantities.csv'),'id,level,kind,volume_m3\n'+measured.map(p=>`${p.id},${p.level},${p.kind},${p.volumeMm3!/1e9}`).join('\n'));
const issues=['No site survey, jurisdiction or client brief supplied; virtual 18 x 24 m site assumed.','R0 design coordination issue only: not construction or permit issue.','Structural sizing, foundation, lateral system and load paths require engineering.','Wall junction overlaps remain; volumes are gross per-part, not net procurement quantities.','Stair flight guards, terrace infill, roof parapets and headroom clearance need detailed resolution.','Roof slope, drainage, flashing, waterproofing and thermal build-ups are not resolved.','MEP routes, fire/egress/accessibility, parking and local planning compliance need specialist review.','Door leaves/swings, sanitary fixtures, complete dimensions and fabrication connections are not yet issued.'];
await writeFile(resolve(dir,'verification.json'),JSON.stringify({status:'geometry-passed-delivery-gate-open',checks,partCount:parts.length,sourceCount:Object.values(sources).flat().length,levels:[0,3000,6000],footprint:[10800,9600],stair:{risers:20,rise:150,going:280,width:1000},issues},null,2));
await writeFile(resolve(dir,'README.md'),`# MODULE HOUSE / 3-storey verification\n\nR0 review package, 2026-11-05.\n\n2D profiles → live extrusions / hosted openings → assembled parts → exact BRep plan / section cuts. Native file retains editable original profiles. Parts are assembled by world coordinates, not fused into an uneditable solid.\n\n${checks.length} geometric checks passed, ${parts.length} parts.\n\n## Delivery gate — unresolved\n\n${issues.map(i=>'- '+i).join('\n')}\n\nSVG/DXF sheets A101–A103, A201–A202; STEP solids; GLB viewer geometry; parts and openings schedules; gross quantities CSV.\n`);
console.log(JSON.stringify({directory:dir,checks:checks.length,parts:parts.length,status:'geometry-passed-delivery-gate-open'}));
