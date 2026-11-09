import assert from 'node:assert/strict';
import {cadDocument} from '../../src/state/cadDocument';
import {dispatchCadCommand} from '../../src/state/dispatchCadCommand';
import {measureDocumentObject} from '../../src/state/documentQuery';
import {resetTestDocument} from '../../tests/helpers/documentHarness';
import {fitSpline} from '../../src/precision/fitSpline';
type V=[number,number,number];
const run=async(c:any)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,`${c.type} ${c.id??''}: ${r.reason}`);return r;};
const t0=performance.now();const lap=(s:string)=>console.log(((performance.now()-t0)/1000).toFixed(1),s);
resetTestDocument();
await run({type:'create-layer',id:'L',name:'L'});
const ids:string[]=[];
for(let k=0;k<6;k++){const s=k*60,a=40-3*k,b=35-2*k;
 const pts:V[]=Array.from({length:24},(_,i)=>{const t=i/24*2*Math.PI;return [s,a*Math.cos(t),b*Math.sin(t)] as V;});
 const id='s'+k;ids.push(id);await run({type:'create-drawing',id,name:id,drawing:'spline',layerId:'L',params:{...fitSpline(pts,true,1,'C2'),workPlane:'YZ'}});}
await run({type:'create-loft',id:'A',layerId:'L',profileObjectIds:ids});lap('loftA');
const r=await dispatchCadCommand({type:'create-loft',id:'B',layerId:'L',profileObjectIds:ids} as any);console.log('reuse sections',r.ok,(r as any).reason);
console.log('visible s0',cadDocument.objects.s0.visible);
// zone: box top half
await run({type:'create-drawing',id:'zp',drawing:'polyline',layerId:'L',params:{kind:'polyline',workPlane:'XZ',closed:true,points:[[-10,200,0],[400,200,0],[400,200,100],[-10,200,100]]}});
await run({type:'create-extrude',id:'zone',layerId:'L',profileObjectIds:['zp'],distance:400});lap('zone');
const z:any=await measureDocumentObject(cadDocument,'zone');console.log('zone bounds',JSON.stringify(z.bounds));
await run({type:'boolean-operation',operation:'intersect',target:'A',tool:'zone',id:'red'});lap('intersect');
const m:any=await measureDocumentObject(cadDocument,'red');console.log('red',m.volume,m.validity,JSON.stringify(m.bounds));
await run({type:'create-primitive',id:'ball',primitive:'sphere',params:{radius:30},position:[100,50,20],layerId:'L'});
console.log('ball obj',JSON.stringify(cadDocument.objects.ball.transform));
const mb:any=await measureDocumentObject(cadDocument,'ball');console.log('ball bounds',JSON.stringify(mb.bounds));
// joint test
if(r.ok){
await run({type:'assembly-ground',objectId:'ball',grounded:true});
await run({type:'assembly-joint-create',joint:{id:'j1',type:'revolute',parentId:'ball',childId:'B',origin:[0,0,0],axis:[0,0,1],angle:0,min:-90,max:90}});
await run({type:'assembly-joint-update',jointId:'j1',angle:45});console.log('B transform',JSON.stringify(cadDocument.objects.B.transform));
}
process.exit(0);
