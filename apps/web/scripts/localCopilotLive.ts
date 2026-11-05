/** Opt-in live inference against the locally installed Ollama model. Never part of ordinary unit tests. */
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {serializeDocument} from "@agent-webcad/cad-document";
import {resetTestDocument,documentState} from "../tests/helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../src/state/documentPlans";
import {requestDesignIntent,requestDesignCandidates} from "../src/copilot/designStudyGateway";
import {emptyDesignStudy,appendDesignDecision} from "../src/copilot/designStudy";
import {confirmedIntent} from "../src/copilot/designIntent";
import {inspectFittedCurve} from "../src/copilot/fittedCurveTools";
import {readDesignScene,projectDesignScenes,designViewSvg} from "../src/copilot/designStudyScene";
const dir=resolve("../../output/verification/local-copilot");await mkdir(dir,{recursive:true});
resetTestDocument();cadDocument.id="local-copilot-live";
const checks:string[]=[],replies:unknown[]=[],requests:unknown[]=[];
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks.push(label);console.log(`PASS ${label}`);};
const fetcher:typeof fetch=async(url,init)=>{if(String(url).endsWith("/api/copilot/plan")){requests.push(JSON.parse(String(init?.body)));const r=await fetch(url,init);replies.push(await r.clone().json());await writeFile(resolve(dir,"transcript.json"),JSON.stringify({requests,replies},null,2));return r;}return fetch(url,init);};
const baseUrl=process.env.CAD_LIVE_APP_URL??"http://127.0.0.1:5188/",connection={mode:"gateway" as const,endpoint:"/api/copilot/plan",model:process.env.CAD_LIVE_MODEL??"qwen3-coder-32k:latest"};
let study=emptyDesignStudy(cadDocument.id,"24000×18000 mm 범위에 들어가는 유기적 비대칭 전시관의 2D 외곽 곡선을 두 안으로 탐색. 하나는 연속적인 흐름, 하나는 오른쪽 오목한 진입면을 강조. 방 배치나 3D는 하지 않는다.");
study.brief.requirements="각 안은 XY 평면 z=0에 있는 단일 닫힌 fitted spline이다. 통과점은 8~12개, 반복 닫힘점은 생략. 원이나 polyline으로 대체하지 않는다. 단위 mm. 건물 승인이나 실면적으로 주장하지 않는다.";
const args=(selectionIds:string[]=[])=>({connection,document:cadDocument,selectionIds,layerId:"layer-default",plane:"XY" as const,study,marks:[],visuals:[],signal:new AbortController().signal,isCurrent:()=>true,baseUrl,fetcher});
try{
 const before=documentState();console.log("Live local model: clarifying intent…");const intent=await requestDesignIntent(args());check(intent.run?.provider==="Ollama"&&intent.run.model===connection.model,"Real local model returned a structured interpretation and inference metadata");check(JSON.stringify(documentState())===JSON.stringify(before),"Intent interpretation did not mutate native CAD");
 // Explicit test answers, never represented as answers from the human user.
 const answers=Object.fromEntries(intent.questions.map(q=>[q.id,q.options[0]??"설명한 두 외곽을 비교하고 나머지는 미정으로 둔다."]));
 study={...study,brief:confirmedIntent({...intent.brief,requirements:study.brief.requirements,anchors:[]},intent.questions,answers),intentConfirmed:true};
 await writeFile(resolve(dir,"intent.json"),JSON.stringify({intent,testAnswers:answers,study},null,2));
 console.log("Live local model: generating actual alternatives…");const first=await requestDesignCandidates(args());check(first.candidates.length>=2&&first.run?.provider==="Ollama","Real local model proposed two CAD alternatives, without a fixture response");
 const previews=[];for(const candidate of first.candidates){const p=await previewCadCommand(candidate.plan.command);assert.ok(p.result.ok,p.result.reason);const d=getCadPlanFrameDocument(p.planId)!;const ids=candidate.plan.resultObjectIds!;assert.equal(ids.length,1);const curve=inspectFittedCurve(d,ids[0]);assert.equal(curve.closed,true);previews.push({candidate,preview:p,document:d,curve});}
 check(JSON.stringify(documentState())===JSON.stringify(before),"All live-model candidates were evaluated while the original document stayed untouched");check(JSON.stringify(previews[0].curve.points)!==JSON.stringify(previews[1].curve.points),"Live alternatives differ in actual editable fitted points");
 const scenes=await Promise.all(previews.map(p=>readDesignScene(p.document,p.candidate.plan.resultObjectIds!))),views=projectDesignScenes(scenes,"XY");for(let i=0;i<views.length;i++)await writeFile(resolve(dir,`alternative-${i+1}.svg`),designViewSvg(views[i][0]));
 const chosen=previews[0],past=cadHistory.getPastLabels().length;assert.ok((await applyCadPlan(chosen.preview.planId)).ok);check(cadHistory.getPastLabels().length===past+1,"Selected live-model creation applied as one native history step");const id=chosen.candidate.plan.resultObjectIds![0],created=documentState(),source=inspectFittedCurve(cadDocument,id);assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),created);check(true,"Live-model creation Undo and Redo restore exact source state");for(const p of previews)discardCadPlan(p.preview.planId);
 const right=source.points.reduce((best,p,i)=>p[0]>source.points[best][0]?i:best,0),feedback=`선택한 같은 fitted spline을 수정하고 새 객체는 만들지 않는다. 0부터 세는 인덱스 ${right}의 가장 오른쪽 통과점 하나만 바꾼다. 안 A는 X를 1000 mm 줄이고 안 B는 1500 mm 줄인다. 그 점의 Y/Z, 다른 모든 통과점, 닫힘과 tension은 그대로 유지한다. cad.curve로 원본 좌표를 읽어라.`;
 study=appendDesignDecision(study,{id:"live-feedback",date:new Date().toISOString(),candidate:chosen.candidate.label,outcome:"keep",reason:feedback,summary:chosen.candidate.plan.summary});
 console.log("Live local model: reading the selected curve and applying feedback…");const second=await requestDesignCandidates({...args([id]),revision:{label:chosen.candidate.label,feedback,command:chosen.candidate.plan.command,fit:{points:source.points,tension:source.tension,closed:source.closed}}});
 const deltas:number[]=[];for(const candidate of second.candidates){assert.equal(candidate.plan.command.type,"update-spline");const p=await previewCadCommand(candidate.plan.command);assert.ok(p.result.ok,p.result.reason);const next=inspectFittedCurve(getCadPlanFrameDocument(p.planId)!,id);assert.equal(next.points.length,source.points.length);source.points.forEach((point,i)=>point.forEach((value,axis)=>{if(i===right&&axis===0)return;assert.ok(Math.abs(value-next.points[i][axis])<1e-6,`Unrequested fit-point edit at ${i}/${axis}`);}));deltas.push(source.points[right][0]-next.points[right][0]);discardCadPlan(p.planId);}
 check(deltas.length===2&&[1000,1500].every(n=>deltas.some(d=>Math.abs(d-n)<1e-6)),"Feedback reached the real model: only the named point changed by 1000 / 1500 mm in the two alternatives");check(JSON.stringify(documentState())===JSON.stringify(created),"Feedback refinement still leaves committed CAD unchanged before Apply");
 const refined=await previewCadCommand(second.candidates[0].plan.command);assert.ok((await applyCadPlan(refined.planId)).ok);check(!!cadDocument.objects[id]&&Object.keys(cadDocument.objects).length===1,"Refinement preserved the same native source identity instead of creating replacement objects");assert.ok(undoDocument());assert.deepEqual(documentState(),created);check(true,"Refinement applies as one exact Undo step");discardCadPlan(refined.planId);
 await writeFile(resolve(dir,"model.webcad.json"),serializeDocument(cadDocument));await writeFile(resolve(dir,"design-study.json"),JSON.stringify(study,null,2));await writeFile(resolve(dir,"live-report.json"),JSON.stringify({status:"passed",checks,runs:[intent.run,first.run,second.run],model:connection.model,provider:"Ollama",scriptedProvider:false,geometry:"Native CAD",limits:["Test answers are fixture choices, not user design approvals","No aesthetic/building compliance approval","Text model used CAD tools; no image understanding claimed"]},null,2));console.log(`ALL ${checks.length} LIVE CHECKS PASSED`);
}catch(e){await writeFile(resolve(dir,"live-report.json"),JSON.stringify({status:"failed",checks,error:e instanceof Error?e.message:String(e)},null,2));throw e;}
