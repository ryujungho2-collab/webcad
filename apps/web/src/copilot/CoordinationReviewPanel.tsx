import {useEffect,useRef,useState} from 'react';
import {cadDocument} from '../state/cadDocument';
import {subscribeDocumentChanges} from '../state/documentSession';
import {downloadFile} from '../export/exportModel';
import {PropertySection} from '../ui/PropertySection';
import {createCadToolSession} from './cadToolSession';
import type {ClearanceRequirement,CoordinationReport} from './coordinationReview';

export function CoordinationReviewPanel({selectionIds=[],onSelect}:{selectionIds?:string[];onSelect:(ids:string[])=>void}){
 const [generation,setGeneration]=useState(0),[minimum,setMinimum]=useState(0),[purpose,setPurpose]=useState('부재 사이 간섭 검토'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[report,setReport]=useState<{key:string;value:CoordinationReport}>();
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>subscribeDocumentChanges(()=>setGeneration(g=>g+1)),[]);
 const viewIds=[...Object.keys(cadDocument.modelPresentation?.sections??{}),...Object.keys(cadDocument.modelPresentation?.projections??{})];
 const key=JSON.stringify([cadDocument.id,cadDocument.revision,generation,selectionIds,minimum,purpose,viewIds]),latest=useRef(key);latest.current=key;
 useEffect(()=>{controller.current?.abort();setBusy(false);setReport(undefined);setError('');return()=>controller.current?.abort();},[key]);
 async function run(){const abort=new AbortController();controller.current=abort;setBusy(true);setError('');setReport(undefined);
  try{const pairs:ClearanceRequirement[]=selectionIds.flatMap((a,i)=>selectionIds.slice(i+1).map(b=>({objectIds:[a,b] as [string,string],minimumClearanceMm:minimum,purpose}))),session=createCadToolSession({document:cadDocument,selectionIds,layerId:'layer-default',workPlane:'XY'},{isCurrent:()=>latest.current===key});
   const result=await session.read({id:'coordination',name:'cad.coordinationReview',arguments:{pairs,viewIds}},abort.signal);if(latest.current!==key||abort.signal.aborted)return;if(!result.ok)throw Error(result.error);setReport({key,value:result.result as CoordinationReport});
  }catch(e){if(latest.current===key)setError(abort.signal.aborted?'검사를 취소했습니다. 다시 검사하세요.':e instanceof Error?e.message:String(e));}finally{if(controller.current===abort)setBusy(false);}
 }
 const current=report?.key===key?report.value:undefined,valid=selectionIds.length<=7&&selectionIds.length!==1&&viewIds.length<=32&&Number.isFinite(minimum)&&minimum>=0&&minimum<=1e6&&!!purpose.trim();
 const label={pass:'확인',fail:'문제',unknown:'미확인'};
 return <PropertySection title="실무 검토 · 간격과 도면" meta="공통 검사 · MCP" defaultOpen={false}><section aria-label="Coordination review" aria-busy={busy}>
  <p>선택한 부재 {selectionIds.length}개의 모든 쌍과 native 도면 {viewIds.length}개를 검사합니다. 부재 0개면 도면만 검사합니다. 모든 부재 쌍에 같은 기준이 적용됩니다.</p>
  <label>검토 목적<input aria-label="Coordination purpose" maxLength={200} value={purpose} onChange={e=>setPurpose(e.target.value)}/></label>
  <label>요구 최소 간격 / mm<input aria-label="Coordination minimum clearance" type="number" min={0} max={1000000} value={Number.isNaN(minimum)?'':minimum} onChange={e=>setMinimum(e.target.value===''?NaN:Number(e.target.value))}/></label>
  <p className="property-hint">0은 관통 검사입니다. 통로·유지보수 여유는 프로젝트 기준을 직접 입력하세요. 부재 표면의 최단거리이며 실제 통행 경로 판정은 아닙니다. 부재는 2–7개씩 선택하세요.</p>
  <button type="button" disabled={busy||!valid} onClick={()=>void run()}>간격·도면 검사</button>{busy&&<button type="button" onClick={()=>controller.current?.abort()}>검사 취소</button>}
  {!valid&&<p role="alert">부재 수(0 또는 2–7), 도면 수(최대 32), 검토 목적과 최소 간격을 확인하세요. 범위를 자동으로 잘라내지 않습니다.</p>}
  {error&&<p role="alert">{error}</p>}
  {current&&<div aria-label="Coordination result"><p role="status">{current.decision==='issues-found'?'검토 문제 발견':'검사 범위 외 검토 필요'} · 측정 {current.coverage.measuredPairs}/{current.coverage.requestedPairs}쌍 · 미확인 {current.coverage.unknownPairs}쌍 · 도면 {current.coverage.requestedViews}/{current.coverage.totalViews} · 전체 표시 솔리드 {current.coverage.visibleSolids}개</p>
   <button type="button" onClick={()=>downloadFile(JSON.stringify(current,null,2),'coordination-review.json','application/json')}>검토 근거 JSON 저장</button>
   <ul>{[...current.pairs,...current.drawings].map(row=><li key={row.id} data-review-code={row.code} data-review-status={row.status}><strong>{label[row.status]}</strong> {'requirement' in row?(row as CoordinationReport['pairs'][number]).requirement.purpose:row.viewId} · {row.message}{row.status!=='pass'&&<p>{row.action}</p>}{row.objectIds.length>0&&<button type="button" onClick={()=>onSelect(row.objectIds.filter(id=>!!cadDocument.objects[id]))}>대상 선택</button>}</li>)}</ul>
   <details><summary>이번에 확인하지 않은 범위</summary><ul>{current.unverified.map(s=><li key={s}>{s}</li>)}</ul></details><p>검사 통과 개수는 설계 완성도나 납품 승인이 아닙니다. 수정·선택·기준 변경 시 결과를 다시 확인합니다.</p>
  </div>}
 </section></PropertySection>;
}
