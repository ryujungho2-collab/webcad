import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import {CoordinationReviewPanel} from '../src/copilot/CoordinationReviewPanel';
import {cadDocument} from '../src/state/cadDocument';
import {dispatchCadCommand} from '../src/state/dispatchCadCommand';
import {cadHistory,undoDocument} from '../src/state/history';
import {resetTestDocument} from './helpers/documentHarness';
import {click,text,waitFor,physical} from './helpers/physicalInput';
import {installBrowserChecks} from './helpers/browserChecks';
import '../src/styles.css';import '../src/ui/tokens.css';import '../src/ui/inspector.css';
const run=async(c:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(c);if(!r.ok)throw Error(r.reason);};
resetTestDocument();await run({type:'create-box',id:'a',width:100,depth:100,height:100});await run({type:'create-box',id:'b',width:100,depth:100,height:100});await run({type:'move-object',objectId:'b',translation:[105,0,0]});
let selected:string[]=[];function Harness(){const [ids,setIds]=useState(['a','b']);return <div style={{maxWidth:750,padding:24}}><CoordinationReviewPanel selectionIds={ids} onSelect={value=>{selected=value;setIds(value);}}/></div>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
const button=document.getElementById('run') as HTMLButtonElement,output=document.getElementById('output')!;
let downloaded:Promise<string>|undefined;HTMLAnchorElement.prototype.click=function(){downloaded=fetch(this.href).then(r=>r.text());};
button.onclick=async()=>{const lines:string[]=[],check=(v:unknown,message:string)=>{if(!v)throw Error(message);lines.push('PASS '+message);output.textContent=lines.join('\n');};try{
 await waitFor(()=>!!document.querySelector('[aria-label="Coordination review"]'));await text('Coordination minimum clearance','10');const before=JSON.stringify(cadDocument),depth=cadHistory.past.length;
 await click('간격·도면 검사');await waitFor(()=>!!document.querySelector('[aria-label="Coordination result"]'));
 check(document.querySelector('[data-review-code="clearance"]')?.getAttribute('data-review-status')==='fail','Actual browser Worker diagnoses 5 mm gap against 10 mm input');check(JSON.stringify(cadDocument)===before&&cadHistory.past.length===depth,'UI review leaves native document and Undo intact');
 await click('검토 근거 JSON 저장');const report=JSON.parse(await downloaded!);check(report.pairs[0].distanceMm===5&&report.coverage.requestedPairs===1&&report.unverified.length>0,'JSON preserves exact measurements, requirements and unchecked scope');
 await physical(document.querySelector('[data-review-code="clearance"] button')!);check(selected.join(',')==='a,b','Issue navigation selects exact source object IDs');
 await run({type:'move-object',objectId:'b',translation:[110,0,0]});await waitFor(()=>!document.querySelector('[aria-label="Coordination result"]'));check(true,'Geometry edit invalidates the displayed report');
 await click('간격·도면 검사');await waitFor(()=>!!document.querySelector('[aria-label="Coordination result"]'));check(document.querySelector('[data-review-code="clearance"]')?.getAttribute('data-review-status')==='pass','Recheck measures the repaired 10 mm gap');check(document.querySelector('[aria-label="Coordination result"]')!.textContent!.includes('검사 범위 외 검토 필요'),'Passing a pair never presents delivery approval');
 check(undoDocument(),'Undo remains available');await waitFor(()=>!document.querySelector('[aria-label="Coordination result"]'));await click('간격·도면 검사');await waitFor(()=>!!document.querySelector('[aria-label="Coordination result"]'));check(document.querySelector('[data-review-code="clearance"]')?.getAttribute('data-review-status')==='fail','Undo and recheck restore the actual clearance failure');
 await text('Coordination minimum clearance','0');await waitFor(()=>!document.querySelector('[aria-label="Coordination result"]'));check(true,'Changing the requirement invalidates prior evidence');output.textContent=lines.join('\n')+`\nALL ${lines.length} CHECKS PASSED`;
 }catch(e){output.textContent=lines.join('\n')+'\nFAIL: '+(e instanceof Error?e.stack:String(e));}};installBrowserChecks(button,output);
