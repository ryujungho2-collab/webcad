import {createRoot} from 'react-dom/client';
import {App} from '../src/App';
import '../src/styles.css';import '../src/ui/tokens.css';import '../src/ui/workstation.css';import '../src/ui/commands.css';import '../src/ui/menu.css';import '../src/ui/explorer.css';import '../src/ui/inspector.css';
import {cadDocument} from '../src/state/cadDocument';
import {cadHistory} from '../src/state/history';
import {serializeDocument} from '@agent-webcad/cad-document';
import {saveDocumentToCache} from '../src/state/documentFile';
import {measureDocumentObject} from '../src/state/documentQuery';
import {collectExportDrawings,exportStepBytes} from '../src/export/exportModel';
import {encodeSvg} from '../src/export/svgWriter';
import {encodeDxf} from '../src/interop/dxfWriter';
import {inspectFittedCurve} from '../src/copilot/fittedCurveTools';
import {sourceMesh} from '../src/state/faceCutCommands';
import {getObjectTransform} from '../src/precision/objectTransform';
import {click,text,choose,input} from './helpers/physicalInput';
import {installBrowserChecks} from './helpers/browserChecks';
import {courtyardBatches,courtParts,framePoints,tool,type PavilionCall} from './helpers/courtyardPavilionFixture';
import {naturalPathLength} from './helpers/pavilionFixture';
createRoot(document.getElementById('root')!).render(<App/>);
const button=document.getElementById('run-task') as HTMLButtonElement,output=document.getElementById('task-output')!,artifacts:Record<string,string>={};
const panel=()=>document.querySelector('[data-testid="copilot-panel"]')!;
const apply=()=>[...panel().querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='Apply');
async function waitFor(check:()=>boolean,message='Courtyard task did not become ready'){const end=Date.now()+150000;while(!check()){if(Date.now()>end)throw Error(message+': '+document.body.innerText.slice(-1600));await new Promise(r=>setTimeout(r,50));}}
async function host(body:unknown){const r=await fetch(`/__browser_mcp?run=${new URLSearchParams(location.search).get('run')}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),v=await r.json();if(!r.ok)throw Error(v.error);return v;}
async function call(name:string,args:unknown={}){const r=await host({action:'call',name,arguments:args});if(r.isError)throw Error(JSON.stringify(r.structuredContent??r.content));return r.structuredContent.result;}
async function useTarget(id:string,add=false){await text('Find tool target',id);await click(add?'Add target':'Use target');}
const state=()=>serializeDocument(cadDocument);
let modelRequests=0;const originalFetch=window.fetch.bind(window);window.fetch=async(url,init)=>{if(new URL(String(url),location.href).pathname.startsWith('/api/copilot/'))modelRequests++;return originalFetch(url,init);};
button.onclick=async()=>{button.disabled=true;document.getElementById('test-controls')!.hidden=true;const checks:string[]=[],trace:unknown[]=[],measurements:Record<string,any>={};
 const check=(v:unknown,label:string)=>{if(!v)throw Error(label);checks.push('PASS '+label);output.textContent=checks.join('\n');};
 try{
 await waitFor(()=>!!document.querySelector('canvas'));await click('New document');await click('3D');await click('Copilot');await click('Enable CAD MCP');await waitFor(()=>!!panel().querySelector('[aria-label="CAD MCP client configuration"]'));await host({action:'connect',configuration:JSON.parse((panel().querySelector('[aria-label="CAD MCP client configuration"]') as HTMLTextAreaElement).value)});
 async function propose(label:string,calls:PavilionCall[]){output.textContent=checks.join('\n')+'\nWORK '+label;const context=await call('cad.context'),before=state(),past=cadHistory.getPastLabels().length,r=await call('cad.propose',{contextId:context.contextId,calls,waitForReview:false});if(r.status!=='validating')throw Error(JSON.stringify(r));let pending=r;const deadline=Date.now()+240000;while(pending.status==='validating'){if(Date.now()>deadline)throw Error('Review deadline: '+label);await new Promise(r=>setTimeout(r,500));pending=await call('cad.proposal',{proposalId:r.proposalId});}if(pending.status!=='pending-review')throw Error(JSON.stringify(pending));await waitFor(()=>!!apply()&&!apply()!.disabled);check(state()===before,`${label}: native Review is detached`);await click('Apply');await waitFor(()=>!apply());const receipt=await call('cad.proposal',{proposalId:r.proposalId});check(receipt.status==='applied'&&cadHistory.getPastLabels().length===past+1,`${label}: UI Apply publishes one MCP transaction`);trace.push({label,calls,receipt,summary:pending.summary});}
 for(const batch of courtyardBatches())await propose(batch.label,batch.calls);
 for(const id of courtParts){const m=await measureDocumentObject(cadDocument,id);check(m.validity==='valid'&&m.volume!>0,`${id}: actual native BRep is valid`);measurements[id]=m;}
 check(courtParts.length===27,'Architectural assembly has 27 independently editable solids');
 for(const side of [-1,1])for(let i=0;i<7;i++){const id=`${side<0?'south':'north'}Frame${i}`,source=inspectFittedCurve(cadDocument,`${id}Path`),expected=120*320*naturalPathLength(framePoints(side,i));check(source.space==='spatial'&&source.continuity==='C2'&&Math.abs(measurements[id].volume-expected)<expected*1e-4,`${id}: XYZ C2 frame volume agrees with independent path integration × rectangular area`);}
 check(measurements.northCanopy.bounds.min[2]>2600&&measurements.southCanopy.bounds.min[2]>2500,'Both roof undersides clear the conceptual occupied walk by at least 2.5 m');
 check(modelRequests===0,'All construction uses shared internal CAD tools and actual MCP without a model endpoint');
 await click('Choose tool targets');await choose('Tool target kind',1);await useTarget('courtGround');for(const id of ['southCanopy','northCanopy','eastReturn'])await useTarget(id,true);await click('Fit selected geometry');await input({type:'key',key:'Escape'});await click('Choose tool targets');await click('Copilot');await waitFor(()=>!document.body.innerText.includes('Preparing display'));
 artifacts['pavilion.webcad.json']=state();artifacts['pavilion.step']=new TextDecoder().decode(await exportStepBytes());artifacts['viewport.png']=(await(await input({type:'screenshot'})).json()).data;
 const meshes=[];for(const id of courtParts){const object=cadDocument.objects[id],feature=Object.values(cadDocument.features).find(f=>f.output===id)!,mesh=await sourceMesh(feature);meshes.push({id,name:object.name,positions:Array.from(mesh.positions),indices:Array.from(mesh.indices),transform:getObjectTransform(object,feature),finish:feature.params.solidFinish});}artifacts['mesh-scene.json']=JSON.stringify({basis:'Actual native BRep tessellation from the same sourceMesh used by Agent WebCAD. World units mm. No generated replacement geometry.',meshes});
 // Keep the clean model and its drawing issue as separate normal native projects.
 // The drawing issue retains exact associations and the original 27 source BReps.
 await click('Copilot');await click('Choose tool targets');await choose('Tool target kind',1);await useTarget(courtParts[0]);for(const id of courtParts.slice(1))await useTarget(id,true);check((await call('cad.context')).selectionIds.length===27,'Human target picker and MCP share the same explicit 27-part architectural selection');
 await propose('Issue actual transverse section and low-level plan',[tool('section','drawing.section',{id:'courtSection',name:'A–A · transverse through the sky court · X0',objectIds:['southCanopy','northCanopy','southFrame3','northFrame3','courtGround'],basis:'YZ',height:0,origin:[0,-17000],scale:1}),tool('plan','drawing.section',{id:'courtPlan',name:'Low-level plan · frames and seat plinths · Z250',objectIds:courtParts,basis:'XY',height:250,origin:[27000,0],scale:1})]);
 for(const id of ['courtSection','courtPlan']){const view=cadDocument.modelPresentation!.sections![id];check(view.status==='resolved'&&Object.keys(view.outputs).length>0,`${id}: drawing is derived from current BRep geometry`);const ids=Object.values(view.outputs).map(v=>v.objectId),dxf=encodeDxf(cadDocument,ids);check(dxf.skipped===0,`${id}: native cut exports with no skipped DXF entities`);artifacts[`${id}.dxf`]=dxf.text;artifacts[`${id}.svg`]=encodeSvg(collectExportDrawings('XY',cadDocument,ids));}
 artifacts['pavilion-drawings.webcad.json']=state();artifacts['handoff.json']=JSON.stringify({title:'바람의 뜰 · Courtyard pavilion',brief:{site:'22 × 17 m continuous garden ground',roof:'Two rising 18 m ribbon canopies and an east return; west entrance, central sky court',structure:'14 linked spatial C2 bent timber frames, rectangular 120 × 320 mm',occupation:'Three curved court-facing seats at H450, water court, two H1780 human scale silhouettes',acceptance:'Judge the actual CAD exterior, interior clearance and section together. No numerical beauty score.'},authoring:trace,partIds:courtParts,measurements,modelRequests,limits:'Architectural concept and geometric CAD workflow. No structural sizing or detailed frame joints claimed. Roof has 140 mm vertical section thickness, not a constant normal shell thickness.'},null,2);await host({action:'close'});await click('Disconnect CAD MCP');saveDocumentToCache();
 (globalThis as any).cadTestArtifacts=artifacts;output.textContent=checks.join('\n')+`\nALL ${checks.length} CHECKS PASSED`;
 }catch(e){artifacts['partial.webcad.json']=state();artifacts['diagnostics.json']=JSON.stringify({error:String(e),checks},null,2);artifacts['viewport.png']=(await(await input({type:'screenshot'})).json()).data;(globalThis as any).cadTestArtifacts=artifacts;output.textContent=checks.join('\n')+'\nFAIL: '+(e instanceof Error?e.stack:String(e));}
};installBrowserChecks(button,output);
