import {readFile,writeFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {previewCadCommand,applyCadPlan,discardCadPlan} from "../src/state/documentPlans";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {restoreTestDocument,documentState} from "../tests/helpers/documentHarness";
const root='../../output/projects/courtyard-commons/',original=deserializeDocument(await readFile(root+'courtyard-commons.webcad.json','utf8'));
const samples:{phase:string;ms:number;kernelTasks:number;kernelSections:number;kernelProjections:number;sectionCacheLookups:number}[]=[];
const count=(name:string)=>performance.getEntriesByName(name).length;const kernelTasks=()=>performance.getEntriesByType("measure").filter(e=>e.name.startsWith("agent-webcad:kernel-task:")).length;
async function sample<T>(phase:string,run:()=>Promise<T>){const t=performance.now(),k=kernelTasks(),s=count('agent-webcad:kernel-task:section'),p=count('agent-webcad:kernel-task:projection'),h=count('agent-webcad:section-cache-hit'),result=await run();const value={phase,ms:Math.round(performance.now()-t),kernelTasks:kernelTasks()-k,kernelSections:count('agent-webcad:kernel-task:section')-s,kernelProjections:count('agent-webcad:kernel-task:projection')-p,sectionCacheLookups:count('agent-webcad:section-cache-hit')-h};samples.push(value);console.log(JSON.stringify(value));return result;}
const apply=async(c:CadCommand)=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,r.reason);return r;};
restoreTestDocument(deserializeDocument(await readFile(root+'model-before-drawings.webcad.json','utf8')));
for(const v of Object.values(original.modelPresentation!.sections!)){const {outputs,status,reason,...view}=v;await sample(`first source derivation: ${v.id}`,()=>apply({type:'upsert-model-section',view}));}
for(const v of Object.values(cadDocument.modelPresentation!.sections!)){const {outputs,status,reason,...view}=v;await sample(`warmed source derivation: ${v.id}`,()=>apply({type:'upsert-model-section',view}));}
restoreTestDocument(original);assert.equal(Object.keys(cadDocument.modelPresentation!.parts).length,56);assert.equal(Object.keys(cadDocument.modelPresentation!.sections!).length,5);
const note=Object.values(cadDocument.features).find(f=>f.output==='program-0-0')!.params.modelNote as any;
await sample('annotation',()=>apply({type:'upsert-model-note',id:'program-0-0',...note,text:'MAKE / FABRICATION P1',layerId:'drawings'}));
await sample('rename',()=>apply({type:'rename-object',objectId:'entry-walls',name:'Ground exterior P1'}));
await sample('show source',()=>apply({type:'set-object-visible',objectId:'l1-south-window',visible:true}));
await sample('hide source',()=>apply({type:'set-object-visible',objectId:'l1-south-window',visible:false}));
const sheet=cadDocument.modelPresentation!.sheets!['studio-set'],board=cadDocument.artboards![sheet.artboardId];
const command:Extract<CadCommand,{type:'layout-model-sheet-set'}>={type:'layout-model-sheet-set',id:sheet.id,name:'Courtyard Commons',artboardId:sheet.artboardId,viewIds:Object.keys(cadDocument.modelPresentation!.sections!),fixedViewIds:[],denominators:[50,100,200],origin:[...board.origin],size:[...board.size],margin:12,gap:10,maxPages:8,alignment:'none',template:'standard',fields:sheet.publication!.fields};
const baseline=documentState(),depth=cadHistory.past.length;
const first=await sample('first paper candidates after reopen (1:50/100/200)',()=>previewCadCommand(command));assert.ok(first.result.ok,first.result.reason);assert.deepEqual(documentState(),baseline);assert.equal(cadHistory.past.length,depth);discardCadPlan(first.planId);
const warm=await sample('warmed paper candidates (1:50/100/200)',()=>previewCadCommand(command));assert.ok(warm.result.ok,warm.result.reason);
await sample('Apply shared candidates',async()=>{const r=await applyCadPlan(warm.planId);assert.ok(r.ok,r.reason);});const applied=documentState();assert.equal(cadHistory.past.length,depth+1);assert.ok(undoDocument());assert.deepEqual(documentState(),baseline);assert.ok(redoDocument());assert.deepEqual(documentState(),applied);
const stale=await previewCadCommand(command);await apply({type:'rename-object',objectId:'entry-walls',name:'Stale baseline'});assert.equal((await applyCadPlan(stale.planId)).ok,false);
await apply({type:'set-layer-locked',layerId:'drawings',locked:true});const locked=documentState(),past=cadHistory.past.length,r=await dispatchCadCommand({...command,origin:[51000,0]});assert.equal(r.ok,false);assert.deepEqual(documentState(),locked);assert.equal(cadHistory.past.length,past);
assert.ok(samples.filter(s=>!s.phase.includes('source derivation')).every(s=>s.kernelTasks===0&&s.kernelSections===0&&s.kernelProjections===0&&s.sectionCacheLookups===0));
await writeFile('../../output/verification/g6-d6-p1-benchmark.json',JSON.stringify({date:'2026-10-13',fixture:{parts:56,views:5},sourceRevision:'full validated feature parameters/nested operands + world TRS; never global document revision',environment:'Node/OCCT; single explicit runs, no aggregate average or user GPU claim',samples,contracts:{detached:true,stale:true,locked:true,undoRedo:true},candidateReport:{denominator:cadDocument.modelPresentation!.sheets![sheet.id].denominator,pages:Object.keys(cadDocument.modelPresentation!.sheets!).length},limits:'First source derivation includes cold kernel initialization. First paper layout starts from already resolved saved drawings and requires no source kernel work.'},null,2)+'\n');
