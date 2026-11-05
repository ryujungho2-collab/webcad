// ARC 1.7 kettle — 3D/2D verification, drawings and exports.
// Run after buildModel.ts: npx tsx scripts/arcKettle/verify.ts  (from apps/web)
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {serializeDocument,deserializeDocument} from '@agent-webcad/cad-document';
import {CadEngine,inspectShape} from '@agent-webcad/cad-kernel';
import {cadDocument} from '../../src/state/cadDocument';
import {dispatchCadCommand} from '../../src/state/dispatchCadCommand';
import {measureDocumentObject} from '../../src/state/documentQuery';
import {undoDocument,redoDocument} from '../../src/state/history';
import {restoreTestDocument} from '../../tests/helpers/documentHarness';
import {measureSolidDistance} from '../../src/cad/kernelGeometryService';
import {exportStepBytes} from '../../src/export/exportModel';
import {exportGlbBytes} from '../../src/export/glbExport';
import {modelSheetSvg,modelSheetDxf} from '../../src/export/modelSheetExport';
import {getWorldDrawingGeometry} from '../../src/precision/worldGeometry';
import {OUT,DESIGN,PARTS} from './buildModel';

const t0=performance.now(),checks:{group:string;label:string;value:string;pass:boolean}[]=[];
const check=(group:string,pass:boolean,label:string,value:unknown)=>{checks.push({group,label,value:String(value),pass});console.log(`${pass?'PASS':'FAIL'} [${group}] ${label} = ${value}`);};
const run=async(c:any)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,`${c.type} ${c.id??''}: ${r.reason}`);return r;};
const feat=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const operand=(id:string)=>({params:structuredClone(feat(id).params),transform:structuredClone(cadDocument.objects[id].transform)});
restoreTestDocument(deserializeDocument(await readFile(resolve(OUT,'model.webcad.json'),'utf8')));
const D=DESIGN,rim=D.body.at(-1)![0];

// ---- 1. Solid validity and mass (density g/cm3 per material)
const density:Record<string,number>={'kettle-body':.905,handle:1.36,window:1.18,lid:.905,knob:7.93,plinth:1.36,base:1.36,connector:7.93,switch:1.15};
const parts:any[]=[],exactVolumes:number[]=[];let mass=0;
for(const p of PARTS){const m:any=await measureDocumentObject(cadDocument,p.id);const g=m.volume/1000*density[p.id];mass+=g;exactVolumes.push(m.volume);parts.push({id:p.id,name:p.name,material:p.finish.name,volumeCm3:+(m.volume/1000).toFixed(2),massG:+g.toFixed(1),bounds:m.bounds,validity:m.validity});check('3D solid',m.validity==='valid'&&m.volume>0,`${p.id} BRep valid, volume cm3`,(m.volume/1000).toFixed(2));}
check('3D solid',mass>500&&mass<1600,'shell mass without heater element / PCB (g)',mass.toFixed(0));

// ---- 2. Capacity from the exact interior solid
async function waterVolume(h:number){
  const id=`level-${h.toFixed(3)}`;
  await run({type:'create-drawing',id:`${id}-p`,drawing:'polyline',layerId:'construction',params:{kind:'polyline',workPlane:'XY',closed:true,points:[[-100,-100,-5],[100,-100,-5],[100,100,-5],[-100,100,-5]]}});
  await run({type:'create-extrude',id:`${id}-box`,layerId:'construction',profileObjectIds:[`${id}-p`],distance:h+5});
  const before=new Set(Object.keys(cadDocument.objects));
  await run({type:'duplicate-object',objectId:'cavity',offset:[0,0,0]});
  const src=Object.keys(cadDocument.objects).find(k=>!before.has(k)&&feat(k)?.type!=='drawing')!;assert.ok(src,'cavity copy');
  await run({type:'boolean-operation',operation:'intersect',target:src,tool:`${id}-box`,id});
  const v=(await measureDocumentObject(cadDocument,id)).volume!;
  for(const u of [id])if(cadDocument.objects[u])await run({type:'delete-object',objectId:u}).catch(()=>{});
  return v;
}
const full=(await measureDocumentObject(cadDocument,'cavity')).volume!;
check('capacity',full>1.7e6,'brim volume to rim z=195 (L)',(full/1e6).toFixed(3));
// secant search for the 1.7 L and 0.5 L lines on the exact cavity
async function levelFor(target:number,a:number,b:number){let va=await waterVolume(a),vb=await waterVolume(b);for(let i=0;i<5;i++){const c=b+(target-vb)*(b-a)/(vb-va);a=b;va=vb;b=Math.min(rim-1,Math.max(3,c));vb=await waterVolume(b);if(Math.abs(vb-target)<2000)break;}return {h:b,v:vb};}
const max=await levelFor(1.7e6,90,130),min=await levelFor(0.5e6,30,50);
check('capacity',Math.abs(max.v-1.7e6)<5000,'MAX 1.7 L line height z (mm), volume L',`${max.h.toFixed(1)} mm, ${(max.v/1e6).toFixed(3)} L`);
check('capacity',Math.abs(min.v-0.5e6)<5000,'MIN 0.5 L line height z (mm), volume L',`${min.h.toFixed(1)} mm, ${(min.v/1e6).toFixed(3)} L`);
check('capacity',rim-max.h>=20,'boiling headroom MAX→rim ≥ 20 mm',`${(rim-max.h).toFixed(1)} mm`);
check('capacity',D.lipZ-max.h>=25,'pour lip above MAX ≥ 25 mm (no dribble when full)',`${(D.lipZ-max.h).toFixed(1)} mm`);
check('capacity',D.window.z0<=min.h&&D.window.z1>=max.h,'level window spans MIN and MAX lines',`window z ${D.window.z0}–${D.window.z1}`);

// ---- 3. Assembly fit: BRep boundary distance & relationship for every mating pair
const pairs:[string,string,string,number,number][]=[
  ['lid','kettle-body','lid skirt / opening (sliding fit)',.2,2],
  ['knob','lid','knob seated on lid',0,.05],
  ['handle','kettle-body','handle bonded to body',0,.05],
  ['switch','handle','rocker seated on pivot floor of handle pocket (0.4 side clearance)',0,1],
  ['window','kettle-body','window bonded in slot',0,.05],
  ['plinth','kettle-body','heater housing under body',0,1],
  ['connector','plinth','360° boss in recess',.3,2],
  ['plinth','base','kettle seated on power base',.2,1],
  ['connector','base','boss mounted on base',0,.05],
];
const fits:any[]=[];
for(const [a,b,label,lo,hi] of pairs){const r:any=await measureSolidDistance(operand(a),operand(b),1e-4);const ok=r.relationship!=='overlapping'&&r.relationship!=='indeterminate'&&r.boundaryDistance>=lo-1e-3&&r.boundaryDistance<=hi;fits.push({a,b,label,relationship:r.relationship,gapMm:+r.boundaryDistance.toFixed(3)});check('fit',ok,`${label}: ${r.relationship}, gap mm (allowed ${lo}–${hi})`,r.boundaryDistance.toFixed(3));}

// ---- 4. Ergonomics / use
const hb=parts.find(p=>p.id==='handle').bounds,bb=parts.find(p=>p.id==='kettle-body').bounds;
check('use',hb.max[2]-hb.min[2]>=120,'handle grip span (mm) ≥ 120 for four fingers',(hb.max[2]-hb.min[2]).toFixed(0));
check('use',-hb.min[0]-(D.body[1][1])>=35,'knuckle clearance handle↔body at widest (mm) ≥ 35',(-hb.min[0]-D.body[1][1]).toFixed(0));
const baseB=parts.find(p=>p.id==='base').bounds,footR=(baseB.max[0]-baseB.min[0])/2;
check('use',footR>=D.body[1][1],'base footprint radius ≥ body radius (stable on worktop)',`${footR.toFixed(1)} mm`);
const total=Math.max(...parts.map(p=>p.bounds.max[2]))-Math.min(...parts.map(p=>p.bounds.min[2]));
check('use',total<=260,'overall height on base ≤ 260 mm (fits under wall cabinets)',total.toFixed(1));

// ---- 5. 2D→3D associativity: edit a 2D lid station, the lid regenerates; Undo/Redo restores
for(const l of ['2D-body','2D-spout','2D-handle','2D-parts'])await run({type:'set-layer-visible',layerId:l,visible:true});
const lidBefore=(await measureDocumentObject(cadDocument,'lid')).volume!,st=`lid-st-${D.lid[2][0]}`;
const topo=feat(st).params.topology as any,radiusCtl=topo.controls.find((c:any)=>c.role==='radius')??topo.controls.find((c:any)=>c.role!=='center');
const center=(feat(st).params as any).center as number[];
await run({type:'edit-drawing-control',objectId:st,controlId:radiusCtl.id,point:[center[0]+D.lid[2][1]+3,center[1],center[2]]});
const lidAfter=(await measureDocumentObject(cadDocument,'lid')).volume!;
check('2D↔3D',Math.abs(lidAfter-lidBefore)>1,'editing 2D lid station r+3 regenerates the 3D lid (Δ volume mm3)',(lidAfter-lidBefore).toFixed(0));
await undoDocument();const lidUndo=(await measureDocumentObject(cadDocument,'lid')).volume!;
check('2D↔3D',Math.abs(lidUndo-lidBefore)<1e-3,'Undo restores the lid exactly',(lidUndo-lidBefore).toExponential(1));
await redoDocument();await undoDocument();
const hp:any=feat('handle-path'),pole=hp.params.topology.controls.find((c:any)=>c.index===3),p3=hp.params.controlPoints[3],hBefore=(await measureDocumentObject(cadDocument,'handle')).volume!;
await run({type:'edit-drawing-control',objectId:'handle-path',controlId:pole.id,point:[p3[0]-6,p3[1],p3[2]]});
const hAfter=(await measureDocumentObject(cadDocument,'handle')).volume!;check('2D↔3D',Math.abs(hAfter-hBefore)>1,'moving a 2D handle-spine pole 6 mm regenerates sweep → trims → handle (Δ volume mm3)',(hAfter-hBefore).toFixed(0));
await undoDocument();check('2D↔3D',Math.abs((await measureDocumentObject(cadDocument,'handle')).volume!-hBefore)<1e-3,'Undo restores the handle exactly','ok');
for(const l of ['2D-body','2D-spout','2D-handle','2D-parts'])await run({type:'set-layer-visible',layerId:l,visible:false});

// ---- 6. 2D drawings derived from the 3D BRep: three HLR projections + section A-A
await run({type:'create-layer',id:'drawings',name:'drawings'});
const all=PARTS.map(p=>`part-${p.id}`);
const views=[{id:'v-front',name:'FRONT ELEVATION',basis:'XZ'},{id:'v-side',name:'SIDE ELEVATION',basis:'YZ'},{id:'v-top',name:'PLAN',basis:'XY'}] as const;
for(const v of views)await run({type:'upsert-model-projection',method:'brep-hlr',hiddenLines:'omit',id:v.id,name:v.name,partIds:all,basis:v.basis,origin:[0,0],scale:1,layerId:'drawings'});
await run({type:'upsert-model-section',view:{id:'v-section',name:'SECTION A-A',partIds:all,basis:'XZ',height:0,origin:[0,0],scale:1,layerId:'drawings',presentation:{background:true,keep:'negative',depth:200,hatch:true,spacing:3,angle:45,cutWeight:.5,backgroundWeight:.18,hatchWeight:.13,label:true}}});
const pres=cadDocument.modelPresentation!;
const extent=(ids:string[])=>{let lo=[Infinity,Infinity],hi=[-Infinity,-Infinity];for(const id of ids){const o=cadDocument.objects[id],f=feat(id);const g:any=getWorldDrawingGeometry(o,f);const pts:number[][]=[...(g?.points??[]),...(g?.spline?.controlPoints??[]),...(g?.center&&g?.radius?[[g.center[0]-g.radius,g.center[1]-g.radius,g.center[2]-g.radius],[g.center[0]+g.radius,g.center[1]+g.radius,g.center[2]+g.radius]]:[])];for(const p of pts){lo=[Math.min(lo[0],p[0]),Math.min(lo[1],p[1])];hi=[Math.max(hi[0],p[0]),Math.max(hi[1],p[1])];}}return {w:hi[0]-lo[0],h:hi[1]-lo[1]};};
const modelX=Math.max(...parts.map(p=>p.bounds.max[0]))-Math.min(...parts.map(p=>p.bounds.min[0]));
const drawings:any[]=[];
for(const v of views){const p=pres.projections[v.id];const ids=Object.values(p.outputs).map((e:any)=>e.objectId);const hidden=ids.filter(id=>feat(id).params.projectionVisibility==='hidden').length;drawings.push({id:v.id,name:v.name,status:p.status,entities:ids.length,hidden});check('2D drawing',p.status==='resolved'&&ids.length>20,`${v.name} BRep HLR resolved, entities`,ids.length);}
const fx=extent(Object.values(pres.projections['v-front'].outputs).map((e:any)=>e.objectId));
check('2D↔3D',Math.abs(fx.w-modelX)<.6,'front elevation width = 3D X extent (mm)',`${fx.w.toFixed(2)} vs ${modelX.toFixed(2)}`);
check('2D↔3D',Math.abs(fx.h-total)<.6,'front elevation height = 3D overall height (mm)',`${fx.h.toFixed(2)} vs ${total.toFixed(2)}`);
const sec=pres.sections!['v-section'];const secIds=Object.values(sec.outputs).map((e:any)=>e.objectId);
drawings.push({id:'v-section',name:'SECTION A-A',status:sec.status,entities:secIds.length,decorations:Object.keys(sec.decorations??{}).length});
check('2D drawing',sec.status==='resolved'&&secIds.length>10,'SECTION A-A exact BRep cut resolved, cut curves',secIds.length);
check('2D drawing',Object.values(sec.decorations??{}).some((d:any)=>d.role==='hatch'),'section hatch generated on cut walls',Object.values(sec.decorations??{}).filter((d:any)=>d.role==='hatch').length);

// ---- 7. A2 sheet with title block, orthographic alignment, 1:2
{const viewIds=[...Object.values(pres.projections).flatMap((p:any)=>Object.values(p.outputs).map((e:any)=>e.objectId)),...Object.values(pres.sections??{}).flatMap((s:any)=>[...Object.values(s.outputs),...Object.values(s.decorations??{})].map((e:any)=>e.objectId))];const hidden=viewIds.map(id=>cadDocument.objects[id]).filter(o=>!o||!o.visible||cadDocument.layers[o.layerId]?.visible===false);console.log('layers of hidden',[...new Set(hidden.map(o=>o?o.layerId+':'+o.visible+':'+cadDocument.layers[o.layerId]?.visible:'missing'))]);console.log('hidden drawing outputs',hidden.length);for(const o of hidden)await run({type:'set-object-visible',objectId:o.id,visible:true});}
await run({type:'create-artboard',id:'sheet-a2',name:'A2 GA sheet',workPlane:'XY',origin:[2000,0],size:[594,420]});
await run({type:'upsert-model-sheet',id:'ga',name:'ARC 1.7 GA 1:2',artboardId:'sheet-a2',denominator:2,placements:{'v-front':[2120,250],'v-side':[2290,250],'v-section':[2460,250],'v-top':[2120,95]},origin:[2000,0],size:[594,420]});
const sheets=Object.values(cadDocument.modelPresentation!.sheets??{});check('2D drawing',sheets.length>=1,'model sheets laid out at 1:2 with title block',sheets.length);
const sheetFiles:string[]=[];
for(const s of sheets){const svg=modelSheetSvg(s.id);const dxf=modelSheetDxf(s.id);await writeFile(resolve(OUT,`${s.id}.svg`),svg);await writeFile(resolve(OUT,`${s.id}.dxf`),dxf.text);sheetFiles.push(s.id);check('2D export',dxf.skipped===0&&svg.length>1000,`${s.id} SVG + DXF (skipped entities)`,dxf.skipped);}

// ---- 8. Exchange: STEP round trip through a fresh OCCT reader, GLB for presentation
const step=await exportStepBytes(PARTS.map(p=>p.id));await writeFile(resolve(OUT,'arc-kettle.step'),step);
{const {oc:instance}=await CadEngine.create(),oc=instance as any,path='/arc.step',reader=new oc.STEPControl_Reader_1(),progress=new oc.Message_ProgressRange_1();oc.FS.writeFile(path,step);reader.ReadFile(path);reader.TransferRoots(progress);const shape=reader.OneShape(),ex=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);const vols:number[]=[];while(ex.More()){const s=ex.Current();const m:any=await inspectShape(s);if(m.validity==='valid')vols.push(m.volume);s.delete();ex.Next();}
 const expected=[...exactVolumes].sort((a,b)=>a-b),got=vols.sort((a,b)=>a-b);
 const dev=Math.max(...got.map((v,i)=>Math.abs(v-expected[i])/expected[i]));check('exchange',got.length===expected.length&&dev<2e-3,'STEP re-read: valid solids, max volume deviation (%)',`${got.length}/${expected.length}, ${(dev*100).toFixed(4)}%`);}
const glb=await exportGlbBytes(PARTS.map(p=>p.id));await writeFile(resolve(OUT,'arc-kettle.glb'),glb);check('exchange',glb.byteLength>10000,'GLB with materials (bytes)',glb.byteLength);
const saved=serializeDocument(cadDocument);assert.deepEqual(deserializeDocument(saved),deserializeDocument(saved));await writeFile(resolve(OUT,'arc-kettle.webcad.json'),saved);
check('exchange',JSON.stringify(deserializeDocument(saved).modelPresentation?.projections?.['v-front']?.status)==='"resolved"','saved project reopens with drawings resolved','ok');

const report={product:'ARC 1.7 cordless kettle',date:'2026-11-05',seconds:+((performance.now()-t0)/1000).toFixed(1),design:D,parts,massG:+mass.toFixed(0),capacity:{brimL:+(full/1e6).toFixed(3),max:{z:+max.h.toFixed(1),L:+(max.v/1e6).toFixed(3)},min:{z:+min.h.toFixed(1),L:+(min.v/1e6).toFixed(3)}},fits,drawings,sheets:sheetFiles,checks,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length};
await writeFile(resolve(OUT,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(`\n${report.passed} passed, ${report.failed} failed in ${report.seconds}s`);
process.exit(report.failed?1:0);
