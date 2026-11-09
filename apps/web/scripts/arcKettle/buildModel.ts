// ARC 1.7 cordless kettle — 3D build through real CAD commands and the OCCT kernel.
// Run: npx tsx scripts/arcKettle/buildModel.ts  (from apps/web)
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {serializeDocument} from '@agent-webcad/cad-document';
import {cadDocument} from '../../src/state/cadDocument';
import {dispatchCadCommand} from '../../src/state/dispatchCadCommand';
import {measureDocumentObject} from '../../src/state/documentQuery';
import {resetTestDocument} from '../../tests/helpers/documentHarness';
import {enumerateSolidTopology} from '../../src/cad/kernelGeometryService';
import {fitSpline} from '../../src/precision/fitSpline';

export const OUT=resolve('../../output/projects/arc-kettle');
type V=[number,number,number];
const t0=performance.now(),log:string[]=[];
const note=(s:string)=>{const line=`[${((performance.now()-t0)/1000).toFixed(1)}s] ${s}`;log.push(line);console.log(line);};
const run=async(c:any)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,`${c.type} ${c.id??''}: ${r.reason}`);return r;};
const feat=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
const faceInfo=(k:string)=>{const [c,n,a]=k.split(':').slice(3).join(':').split('|');return {c:c.split(',').map(Number),n:n.split(',').map(Number),a:+a};};
const faces=async(id:string)=>(await enumerateSolidTopology(feat(id).params as any)).faces as {key:string}[];
const oval=(x:number,z:number,a:number,b:number)=>fitSpline(Array.from({length:12},(_,i)=>{const t=i/12*2*Math.PI;return [x,a*Math.cos(t),z+b*Math.sin(t)] as V;}),true,1,'C2');
const circle=async(id:string,z:number,r:number,layerId:string,x=0,y=0)=>run({type:'create-drawing',id,name:id,drawing:'circle',layerId,params:{center:[x,y,z],radius:r,workPlane:'XY'}});
const rectXY=async(id:string,x0:number,y0:number,x1:number,y1:number,z:number,layerId:string)=>run({type:'create-drawing',id,name:id,drawing:'polyline',layerId,params:{kind:'polyline',workPlane:'XY',closed:true,points:[[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]]}});

/** Design table (mm). z up; spout +X; handle -X; window on -Y (front view side). */
export const DESIGN={
  body:[[0,65],[12,68],[50,67],[100,62.5],[150,55],[195,46]] as [number,number][],
  bottomFillet:10,
  lipZ:203,
  wall:1.8,
  spout:[[24,140,27,21],[54,163,18,13.5],[74,184,12,8.5],[84,199,8.5,6]] as [number,number,number,number][],
  channel:[[10,138,23,17],[54,163,14.8,10.3],[74,184,9,5.8],[90,209,6,3.8]] as [number,number,number,number][],
  handlePath:[[-28,0,182],[-64,0,193],[-98,0,171],[-106,0,115],[-97,0,62],[-50,0,40]] as V[],
  handleSection:{a:13,b:10},
  window:{x:7,yIn:-45,yOut:-85,z0:15,z1:155},
  lid:[[195.6,45.5],[199,44.5],[204,38.5],[207,26]] as [number,number][],
  lidSkirt:{r:43.6,z0:184,z1:195.6},
  lidWall:2,
  knob:{r:10,z0:206,h:9},
  plinth:{r:57,z0:-9,recessR:19.5,recessDepth:6.5},
  base:[[-32,74],[-27,78],[-15,77],[-9.5,66]] as [number,number][],
  baseWall:2.5,
  boss:{r:18,z0:-9.5,h:5.5},
  switch:{x0:-76,x1:-60,y:6,z0:197,z1:205},
};
export const PARTS:{id:string;name:string;finish:{name:string;color:string;roughness:number;metalness:number;opacity:number}}[]=[
  {id:'kettle-body',name:'Body shell · PP 1.8 mm',finish:{name:'Matte porcelain PP',color:'#ECE7DF',roughness:.55,metalness:0,opacity:1}},
  {id:'handle',name:'Handle · PA6-GF',finish:{name:'Graphite PA6',color:'#2D3236',roughness:.7,metalness:0,opacity:1}},
  {id:'window',name:'Level window · Tritan',finish:{name:'Smoke Tritan',color:'#9FC3CC',roughness:.1,metalness:0,opacity:.45}},
  {id:'lid',name:'Lid · PP',finish:{name:'Matte porcelain PP',color:'#ECE7DF',roughness:.55,metalness:0,opacity:1}},
  {id:'knob',name:'Lid knob · brushed steel',finish:{name:'Brushed 304',color:'#B9BDBF',roughness:.32,metalness:.85,opacity:1}},
  {id:'plinth',name:'Heater housing · PA6',finish:{name:'Graphite PA6',color:'#2D3236',roughness:.7,metalness:0,opacity:1}},
  {id:'base',name:'Power base · PA6',finish:{name:'Graphite PA6',color:'#2D3236',roughness:.7,metalness:0,opacity:1}},
  {id:'connector',name:'360° connector boss',finish:{name:'Brushed 304',color:'#B9BDBF',roughness:.32,metalness:.85,opacity:1}},
  {id:'switch',name:'Rocker switch · signal orange',finish:{name:'Signal orange',color:'#E2622B',roughness:.45,metalness:0,opacity:1}},
];

export async function buildModel(){
  resetTestDocument();cadDocument.id='arc-kettle-1-7';
  for(const l of ['2D-body','2D-spout','2D-handle','2D-parts','solids','construction'])await run({type:'create-layer',id:l,name:l});
  const D=DESIGN;
  // 1. Body: smooth loft through six circular stations drawn in 2D first.
  for(const [z,r] of D.body)await circle(`body-st-${z}`,z,r,'2D-body');
  await run({type:'create-loft',id:'body-solid',layerId:'construction',profileObjectIds:D.body.map(([z])=>`body-st-${z}`)});
  const bottomEdges=(await enumerateSolidTopology(feat('body-solid').params as any)).edges.filter((e:any)=>e.points.every((p:number[])=>Math.abs(p[2])<.05)).map((e:any)=>e.key);
  assert.ok(bottomEdges.length>=1,'body bottom edge');
  await run({type:'fillet',id:'body-filleted',layerId:'construction',target:'body-solid',edges:bottomEdges,radius:D.bottomFillet});
  const top=(await faces('body-filleted')).filter(f=>Math.abs(faceInfo(f.key).c[2]-D.body.at(-1)![0])<.5).map(f=>f.key);
  assert.equal(top.length,1,'one top cap face');
  await run({type:'create-shell',id:'body-shell',layerId:'construction',targetId:'body-filleted',faceKeys:top,thickness:D.wall});
  await run({type:'boolean-operation',operation:'cut',target:'body-filleted',tool:'body-shell',id:'cavity'});note('body loft + shell + cavity');
  // body-solid was consumed by the cut; rebuild the outer envelope for later trims.
  for(const [z,r] of D.body)await circle(`env-st-${z}`,z,r,'construction');
  await run({type:'create-loft',id:'envelope',layerId:'construction',profileObjectIds:D.body.map(([z])=>`env-st-${z}`)});
  // 2. Spout outer + channel lofts from closed oval sections on YZ stations.
  for(const [x,z,a,b] of D.spout)await run({type:'create-drawing',id:`spout-st-${x}`,name:`spout station x${x}`,drawing:'spline',layerId:'2D-spout',params:{...oval(x,z,a,b),workPlane:'YZ'}});
  await run({type:'create-loft',id:'spout',layerId:'construction',profileObjectIds:D.spout.map(([x])=>`spout-st-${x}`)});
  for(const [x,z,a,b] of D.channel)await run({type:'create-drawing',id:`channel-st-${x}`,name:`channel station x${x}`,drawing:'spline',layerId:'construction',params:{...oval(x,z,a,b),workPlane:'YZ'}});
  await run({type:'create-loft',id:'channel',layerId:'construction',profileObjectIds:D.channel.map(([x])=>`channel-st-${x}`)});
  await run({type:'boolean-operation',operation:'union',target:'body-shell',tool:'spout',id:'k1'});
  await run({type:'boolean-operation',operation:'cut',target:'k1',tool:'channel',id:'k2a'});
  // Level pouring lip: trim the spout tip with a horizontal plane above the rim.
  await rectXY('lip-cut',55,-40,130,40,D.lipZ,'2D-spout');await run({type:'create-extrude',id:'lip-cut-solid',layerId:'construction',profileObjectIds:['lip-cut'],distance:40});
  await run({type:'boolean-operation',operation:'cut',target:'k2a',tool:'lip-cut-solid',id:'k2'});note('spout + channel + level lip');
  // 3. Level window: slot through the wall, insert = envelope ∩ slot − cavity copy.
  const W=D.window;
  await rectXY('slot-a',-W.x,W.yOut,W.x,W.yIn,W.z0,'2D-parts');await run({type:'create-extrude',id:'slot-a-solid',layerId:'construction',profileObjectIds:['slot-a'],distance:W.z1-W.z0});
  await rectXY('slot-b',-W.x,W.yOut,W.x,W.yIn,W.z0,'construction');await run({type:'create-extrude',id:'slot-b-solid',layerId:'construction',profileObjectIds:['slot-b'],distance:W.z1-W.z0});
  await run({type:'boolean-operation',operation:'cut',target:'k2',tool:'slot-a-solid',id:'kettle-body'});
  for(const [z,r] of D.body)await circle(`env2-st-${z}`,z,r,'construction');
  await run({type:'create-loft',id:'envelope2',layerId:'construction',profileObjectIds:D.body.map(([z])=>`env2-st-${z}`)});
  await run({type:'create-shell',id:'wall2',layerId:'construction',targetId:'envelope2',faceKeys:(await faces('envelope2')).filter(f=>Math.abs(faceInfo(f.key).c[2]-D.body.at(-1)![0])<.5).map(f=>f.key),thickness:D.wall});
  await run({type:'boolean-operation',operation:'intersect',target:'wall2',tool:'slot-b-solid',id:'window'});note('level window');
  // 4. Handle: closed oval swept along a 2D spline, trimmed exactly to the body envelope.
  const H=D.handlePath[0];
  await run({type:'create-drawing',id:'handle-path',name:'handle spine',drawing:'spline',layerId:'2D-handle',params:{...fitSpline(D.handlePath,false,1,'C2'),workPlane:'XZ'}});
  await run({type:'create-drawing',id:'handle-section',name:'handle section',drawing:'spline',layerId:'2D-handle',params:{...oval(H[0],H[2],D.handleSection.a,D.handleSection.b),workPlane:'YZ'}});
  await run({type:'create-sweep',id:'handle-raw',layerId:'construction',profileObjectIds:['handle-section'],pathObjectId:'handle-path',alignToPath:true});
  await run({type:'boolean-operation',operation:'cut',target:'handle-raw',tool:'envelope',id:'handle-trim'});
  const S=D.switch;
  await rectXY('switch-pocket',S.x0-.4,-S.y-.4,S.x1+.4,S.y+.4,S.z0,'construction');await run({type:'create-extrude',id:'switch-pocket-solid',layerId:'construction',profileObjectIds:['switch-pocket'],distance:S.z1-S.z0+20});
  await run({type:'boolean-operation',operation:'cut',target:'handle-trim',tool:'switch-pocket-solid',id:'handle'});
  await rectXY('switch-profile',S.x0,-S.y,S.x1,S.y,S.z0,'2D-parts');await run({type:'create-extrude',id:'switch',layerId:'solids',profileObjectIds:['switch-profile'],distance:S.z1-S.z0});note('handle + switch');
  // 5. Lid: domed loft + skirt that plugs the opening with clearance, steel knob.
  for(const [z,r] of D.lid)await circle(`lid-st-${z}`,z,r,'2D-parts');
  await run({type:'create-loft',id:'lid-dome',layerId:'construction',profileObjectIds:D.lid.map(([z])=>`lid-st-${z}`)});
  await circle('lid-skirt-c',D.lidSkirt.z0,D.lidSkirt.r,'2D-parts');await run({type:'create-extrude',id:'lid-skirt',layerId:'construction',profileObjectIds:['lid-skirt-c'],distance:D.lidSkirt.z1-D.lidSkirt.z0+.4});
  await run({type:'boolean-operation',operation:'union',target:'lid-dome',tool:'lid-skirt',id:'lid-solid'});
  const lidBottom=(await faces('lid-solid')).filter(f=>Math.abs(faceInfo(f.key).c[2]-D.lidSkirt.z0)<.2).map(f=>f.key);
  assert.equal(lidBottom.length,1,'lid underside');
  await run({type:'create-shell',id:'lid',layerId:'solids',targetId:'lid-solid',faceKeys:lidBottom,thickness:D.lidWall});
  await circle('knob-c',D.knob.z0,D.knob.r,'2D-parts');await run({type:'create-extrude',id:'knob-raw',layerId:'construction',profileObjectIds:['knob-c'],distance:D.knob.h});
  const knobTop=(await faces('knob-raw')).filter(f=>Math.abs(faceInfo(f.key).c[2]-(D.knob.z0+D.knob.h))<.1);
  const knobEdges=(await enumerateSolidTopology(feat('knob-raw').params as any)).edges.filter((e:any)=>e.points.every((p:number[])=>Math.abs(p[2]-(D.knob.z0+D.knob.h))<.05)).map((e:any)=>e.key);
  assert.ok(knobTop.length===1&&knobEdges.length>=1,'knob top edge');
  await run({type:'fillet',id:'knob-fillet',target:'knob-raw',edges:knobEdges,radius:3});
  // lid dome top is at 204; knob sits on it — cut the dome-overlap so parts touch, not overlap.
  for(const [z,r] of D.lid)await circle(`lid2-st-${z}`,z,r,'construction');
  await run({type:'create-loft',id:'lid-dome2',layerId:'construction',profileObjectIds:D.lid.map(([z])=>`lid2-st-${z}`)});
  await run({type:'boolean-operation',operation:'cut',target:'knob-fillet',tool:'lid-dome2',id:'knob'});note('lid + knob');
  // 6. Heater housing (plinth) with 360° connector recess, power base with boss and cable notch.
  const P=D.plinth;await circle('plinth-c',P.z0,P.r,'2D-parts');await run({type:'create-extrude',id:'plinth-raw',layerId:'construction',profileObjectIds:['plinth-c'],distance:-P.z0});
  await circle('recess-c',P.z0,P.recessR,'construction');await run({type:'create-extrude',id:'recess',layerId:'construction',profileObjectIds:['recess-c'],distance:P.recessDepth});
  await run({type:'boolean-operation',operation:'cut',target:'plinth-raw',tool:'recess',id:'plinth'});
  for(const [z,r] of D.base)await circle(`base-st-${z}`,z,r,'2D-parts');
  await run({type:'create-loft',id:'base-raw',layerId:'construction',profileObjectIds:D.base.map(([z])=>`base-st-${z}`)});
  await rectXY('cable-notch',60,-7,85,7,-32,'2D-parts');await run({type:'create-extrude',id:'cable-notch-solid',layerId:'construction',profileObjectIds:['cable-notch'],distance:7});
  const baseBottom=(await faces('base-raw')).filter(f=>Math.abs(faceInfo(f.key).c[2]-D.base[0][0])<.2).map(f=>f.key);
  assert.equal(baseBottom.length,1,'base underside');
  await run({type:'create-shell',id:'base-shell',layerId:'construction',targetId:'base-raw',faceKeys:baseBottom,thickness:D.baseWall});
  await run({type:'boolean-operation',operation:'cut',target:'base-shell',tool:'cable-notch-solid',id:'base'});
  await circle('boss-c',D.boss.z0,D.boss.r,'2D-parts');await run({type:'create-extrude',id:'connector',layerId:'solids',profileObjectIds:['boss-c'],distance:D.boss.h});note('plinth + base');
  for(const p of PARTS){if(cadDocument.objects[p.id].layerId!=='solids')await run({type:'move-object-to-layer',objectId:p.id,layerId:'solids'});await run({type:'rename-object',objectId:p.id,name:p.name});await run({type:'set-solid-finish',objectId:p.id,finish:p.finish});await run({type:'register-model-part',part:{id:`part-${p.id}`,objectId:p.id,name:p.name}});}
  for(const id of Object.keys(cadDocument.objects))if(cadDocument.objects[id].layerId==='construction')await run({type:'set-object-visible',objectId:id,visible:false}).catch(()=>{});
  for(const l of ['2D-body','2D-spout','2D-handle','2D-parts'])await run({type:'set-layer-visible',layerId:l,visible:false});
  await mkdir(OUT,{recursive:true});await writeFile(resolve(OUT,'model.webcad.json'),serializeDocument(cadDocument));await writeFile(resolve(OUT,'build.log'),log.join('\n')+'\n');
  note('saved model.webcad.json');
}
if(process.argv[1]?.endsWith('buildModel.ts')){await buildModel();
  for(const p of PARTS){const m=await measureDocumentObject(cadDocument,p.id);console.log(p.id,(m.volume!/1000).toFixed(2),'cm3',(m as any).validity);}
  process.exit(0);}
