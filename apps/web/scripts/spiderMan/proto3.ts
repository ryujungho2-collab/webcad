import assert from 'node:assert/strict';
import {cadDocument} from '../../src/state/cadDocument';
import {dispatchCadCommand} from '../../src/state/dispatchCadCommand';
import {measureDocumentObject} from '../../src/state/documentQuery';
import {resetTestDocument} from '../../tests/helpers/documentHarness';
const run=async(c:any)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,`${c.type} ${c.id??''}: ${r.reason}`);return r;};
resetTestDocument();await run({type:'create-layer',id:'L',name:'L'});
const sq:any={XY:(a:number,b:number)=>[a,b,7],YZ:(a:number,b:number)=>[7,a,b],XZ:(a:number,b:number)=>[a,7,b]};
for(const p of ['XY','YZ','XZ']){await run({type:'create-drawing',id:'p'+p,drawing:'polyline',layerId:'L',params:{kind:'polyline',workPlane:p,closed:true,points:[[0,0],[10,0],[10,10],[0,10]].map(([a,b])=>sq[p](a,b))}});
for(const d of [5,-5]){const r=await dispatchCadCommand({type:'create-extrude',id:`e${p}${d}`,layerId:'L',profileObjectIds:['p'+p],distance:d} as any);if(!r.ok){console.log(p,d,'fail',(r as any).reason);continue;}const m:any=await measureDocumentObject(cadDocument,`e${p}${d}`);console.log(p,d,JSON.stringify(m.bounds));}}
process.exit(0);
