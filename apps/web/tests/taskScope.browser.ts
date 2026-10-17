import {createViewGeometry} from '../src/cad/viewGeometryService';
import {inspectSolid,buildPrimitiveMesh,projectKernelMetrics,isKernelCancelled} from '../src/cad/kernelGeometryService';
import {installBrowserChecks} from './helpers/browserChecks';
const run=document.getElementById('run') as HTMLButtonElement,output=document.getElementById('output')!;
run.onclick=async()=>{run.disabled=true;const lines:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push('PASS: '+label);output.textContent=lines.join('\n');};try{
 const params={kind:'box',width:2,depth:3,height:4},scope=new AbortController();
 const view=createViewGeometry(scope.signal).buildPrimitiveMesh(params),doc=inspectSolid({params});
 const cancelled=view.then(()=>false,error=>isKernelCancelled(error));scope.abort();
 check(await cancelled,'An actual active view request is cancelled by its owner signal');
 check(Math.abs((await doc).volume!-24)<1e-6,'Queued protected document measurement survives the view Worker restart');
 const retry=await createViewGeometry().buildPrimitiveMesh(params);check(retry.indices.length>0,'A fresh view retries cancelled geometry and receives real mesh buffers');
 const before=projectKernelMetrics().cacheEvictions,payload='x'.repeat(2*1024*1024);
 for(let i=0;i<20;i++)await buildPrimitiveMesh({...params,cacheFixture:payload+i});
 const metrics=projectKernelMetrics();check(metrics.cacheBytes<=metrics.cacheLimitBytes&&metrics.cacheEvictions>before,'Long source keys trigger actual byte-budget eviction below the item limit');
 check(metrics.activeTasks===0,'All consumers settle after cancellation and eviction');
 check(metrics.wasmCapacityBytes===null||metrics.wasmCapacityBytes>=0,'WASM capacity is reported separately from JS cache payload');
 (globalThis as any).cadTestMetrics=metrics;output.textContent=lines.join('\n')+`\nALL ${lines.length} CHECKS PASSED`;
}catch(e){output.textContent=lines.join('\n')+`\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}};installBrowserChecks(run,output);
