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
// tilted sections: axis direction d
const d=[1,0,0];
const u=[0,1,0], w=[0,0,1];
const ids:string[]=[];
for(let k=0;k<6;k++){const s=k*60,a=40-3*k+(k==2?6:0),b=35-2*k;
 const pts:V[]=Array.from({length:20},(_,i)=>{const t=i/20*2*Math.PI;const r=1+0.08*Math.cos(2*t)+0.05*Math.sin(3*t);const y=a*r*Math.cos(t),z=b*r*Math.sin(t);return [d[0]*s+u[0]*y+w[0]*z,d[1]*s+u[1]*y+w[1]*z,d[2]*s+u[2]*y+w[2]*z] as V;});
 const id='s'+k;ids.push(id);await run({type:'create-drawing',id,name:id,drawing:'spline',layerId:'L',params:{...fitSpline(pts,true,1,'C2'),workPlane:'YZ'}});}
lap('sections');
await run({type:'create-loft',id:'limb',layerId:'L',profileObjectIds:ids});lap('loft');
const m:any=await measureDocumentObject(cadDocument,'limb');console.log(m.volume,m.validity,JSON.stringify(m.bounds));
await run({type:'create-primitive',id:'ball',primitive:'sphere',params:{radius:30},position:[0,0,0],layerId:'L'});lap('sphere');
console.log(JSON.stringify(Object.values(cadDocument.features).find(f=>f.output==='ball')!.params));
await run({type:'boolean-operation',operation:'union',target:'limb',tool:'ball',id:'u'});lap('union');
const m2:any=await measureDocumentObject(cadDocument,'u');console.log(m2.volume,m2.validity);
process.exit(0);
