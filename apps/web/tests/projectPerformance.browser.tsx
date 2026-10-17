import {createRoot} from 'react-dom/client';
import {ProjectWorkspace} from '../src/app/ProjectWorkspace';
import {projectStorage} from '../src/app/projectSession';
import {writeRecoveryCheckpoint} from '../src/state/documentRecovery';
import {deserializeDocument} from '@agent-webcad/cad-document';
import fixture from '../../../output/projects/courtyard-commons/issued-r5/courtyard-commons.webcad.json';
import '../src/styles.css';import '../src/ui/tokens.css';
import {physical,pause,input} from './helpers/physicalInput';
import {installBrowserChecks} from './helpers/browserChecks';
const data=deserializeDocument(JSON.stringify(fixture));
const resumed=sessionStorage.getItem("durable-r5-reload");
if(!resumed)for(const id of ['r5-a','r5-b'])writeRecoveryCheckpoint(projectStorage(localStorage,id),data);
if(!resumed)localStorage.setItem('agent-webcad-project-workspace-v1',JSON.stringify({version:1,active:'r5-a',projects:['r5-a','r5-b'].map(id=>({id,title:id,closed:false}))}));
const start=performance.now();createRoot(document.getElementById('root')!).render(<ProjectWorkspace/>);
const button=document.getElementById('run') as HTMLButtonElement,output=document.getElementById('output')!;
async function until(check:()=>boolean,label:string){const deadline=performance.now()+180000;while(!check()){if(performance.now()>deadline)throw Error(label);await pause();}}
const frame=(id:string)=>document.querySelector<HTMLIFrameElement>(`#project-panel-${id} iframe`)!;
const probe=async(id:string)=>{await until(()=>!!frame(id)?.contentDocument?.querySelector('canvas'),'canvas');return (frame(id).contentWindow as any).eval('import("/tests/helpers/projectPerformanceProbe.ts")') as Promise<typeof import('./helpers/projectPerformanceProbe')>;};
const state=(p:any)=>JSON.stringify({...p.cadDocument,revision:0});
button.onclick=async()=>{button.disabled=true;const lines:string[]=resumed?JSON.parse(resumed).lines:[],metrics:any={fixture:'R5: 56 parts, 14 views, 10 sheets per project',coldSceneMs:[],warmSwitchMs:[],environment:'isolated Chromium / SwiftShader',samples:20};const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);lines.push('PASS: '+label);output.textContent=lines.join('\n');};try{
 if(resumed){const a=await probe('r5-a');await until(()=>Object.values(a.cadDocument.modelPresentation!.parts).every(part=>a.renderedObjects.has(part.objectId)),'Recovered A');await physical(document.getElementById('project-tab-r5-b')!);const b=await probe('r5-b');await until(()=>Object.values(b.cadDocument.modelPresentation!.parts).every(part=>b.renderedObjects.has(part.objectId)),'Recovered B');check(Object.keys(a.cadDocument.modelPresentation!.parts).length===56&&Object.keys(b.cadDocument.modelPresentation!.parts).length===56,'Actual page reload restores both full R5 documents from IndexedDB');check(a.cadHistory.getPastLabels().length===0&&b.cadHistory.getPastLabels().length===0,'Recovered documents start fresh Undo sessions');sessionStorage.removeItem('durable-r5-reload');(globalThis as any).cadTestMetrics=JSON.parse(resumed).metrics;output.textContent=lines.join('\n')+`\nALL ${lines.length} CHECKS PASSED`;return;}
 const a=await probe('r5-a');await until(()=>a.renderedObjects.size>0&&Object.values(a.cadDocument.modelPresentation!.parts).every(part=>a.renderedObjects.has(part.objectId)),'A parts');metrics.coldSceneMs.push(performance.now()-start);
 const next=performance.now();await physical(document.getElementById('project-tab-r5-b')!);const b=await probe('r5-b');await until(()=>Object.values(b.cadDocument.modelPresentation!.parts).every(part=>b.renderedObjects.has(part.objectId)),'B parts');metrics.coldSceneMs.push(performance.now()-next);
 check(Object.keys(a.cadDocument.modelPresentation!.parts).length===56&&Object.keys(b.cadDocument.modelPresentation!.parts).length===56,'Both independent R5 projects render all 56 real model parts');
 await until(()=>!a.projectActivityMetrics().active&&b.projectActivityMetrics().active,'activity delivery');
 const stopped=a.projectActivityMetrics().deliveredFrames;const deadline=performance.now()+1200;while(performance.now()<deadline)await pause();
 check(a.projectActivityMetrics().deliveredFrames===stopped,'Inactive R5 runs zero scheduled viewport/tool callbacks during observation');
 check(b.projectActivityMetrics().deliveredFrames>0,'Active R5 continues rendering');
 for(let i=0;i<20;i++){const id=i%2?'r5-b':'r5-a',p=i%2?b:a,before=p.projectActivityMetrics().deliveredFrames,t=performance.now();await physical(document.getElementById(`project-tab-${id}`)!);await until(()=>p.projectActivityMetrics().active&&p.projectActivityMetrics().deliveredFrames>before,'warm resume');metrics.warmSwitchMs.push(performance.now()-t);}
 const beforeA=state(a),beforeB=state(b);
 for(const [p,other] of [[a,b],[b,a]]){const original=state(p),untouched=state(other),id=p.cadDocument.rootObjects[0];const r=await p.dispatchCadCommand({type:'rename-object',objectId:id,name:'P2 reviewed name'});check(r.ok&&state(other)===untouched,'Metadata edit remains session-local while inactive');check(p.undoDocument()&&state(p)===original,'Each mounted R5 keeps its independent Undo');await p.saveDocumentToCache();(metrics.checkpoints??=[]).push("saved");const saved=p.documentExportSnapshot();check(deserializeDocument(saved.data).rootObjects.length===data.rootObjects.length,'Each R5 exports a portable complete document from the durable checkpoint');const view=Object.values(p.cadDocument.modelPresentation!.projections)[0];const dx=p.encodeDxf(p.cadDocument,Object.values(view.outputs).map(o=>o.objectId));check(dx.entities>0&&dx.skipped===0,'Each R5 exports its associative projection with no skipped output');}
 check(state(a)===beforeA&&state(b)===beforeB,'Switching, saving and output preserve both documents');
 metrics.beforeIdle={a:a.projectKernelMetrics(),b:b.projectKernelMetrics()};
 await until(()=>a.projectKernelMetrics().idleWorkerReleases>0,'Inactive idle WASM release');
 check(a.projectKernelMetrics().activeTasks===0,'Idle heap release interrupts no document operation');
 check(a.projectKernelMetrics().cacheBytes===0&&a.projectKernelMetrics().gpuPayloadBytes===0,'Long inactive R5 releases accounted caches and model GPU payload');const oldRoot=a.rootUuids.get('entry-walls');
 await physical(document.getElementById('project-tab-r5-a')!);await until(()=>a.projectActivityMetrics().active,'resume after release');
 const result=await a.dispatchCadCommand({type:'create-primitive',primitive:'box',params:{width:2,height:3,depth:4}});
 check(result.ok,'Geometry work restarts successfully after inactive Worker release');check(a.undoDocument()&&state(a)===beforeA,'Worker restart preserves original R5 Undo and source state');
 await until(()=>a.projectKernelMetrics().gpuPayloadBytes>0,'Rebuild released GPU scene');check(a.rootUuids.get('entry-walls')!==oldRoot,'Resuming recreates actual model GPU objects from unchanged CAD sources');check(a.projectKernelMetrics().cacheBytes<=a.projectKernelMetrics().cacheLimitBytes,'Resumed cache remains within its active byte budget');
 metrics.afterIdle={a:a.projectKernelMetrics(),b:b.projectKernelMetrics()};(globalThis as any).cadTestMetrics=metrics;
 if(!resumed){await physical(document.getElementById("project-tab-r5-a")!);await a.saveDocumentToCache();const previousFrame=frame('r5-a');const close=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute('aria-label')==='Close project r5-a')!;await physical(close);await until(()=>!previousFrame.isConnected,'Durable close acknowledgement');check(!previousFrame.isConnected,'Large project closes only after its IndexedDB checkpoint completes');const reopen=document.querySelector('[aria-label="Reopen closed project"]')!;await physical(reopen);await input({type:'key',key:'End'});await input({type:'key',key:'Enter'});const fresh=await probe('r5-a');await until(()=>Object.values(fresh.cadDocument.modelPresentation!.parts).every(part=>fresh.renderedObjects.has(part.objectId)),'Durable reopen');check(fresh.cadHistory.getPastLabels().length===0&&Object.keys(fresh.cadDocument.modelPresentation!.parts).length===56,'Closed large project reopens its durable source with fresh history');sessionStorage.setItem("durable-r5-reload",JSON.stringify({lines,metrics}));location.reload();return;}
 output.textContent=lines.join('\n')+`\nALL ${lines.length} CHECKS PASSED`;
}catch(e){(globalThis as any).cadTestMetrics=metrics;output.textContent=lines.join('\n')+`\nFAIL: ${e instanceof Error?e.stack:String(e)}`;}};installBrowserChecks(button,output);
