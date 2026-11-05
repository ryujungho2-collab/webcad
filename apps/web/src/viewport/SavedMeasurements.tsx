import {measurementPresentation} from "../precision/measurementPresentation";
import {snapMeasurementOffset,organizeMeasurementOffsets,measurementOverlaps} from "../precision/measurementLayout";
import {useEffect,useMemo,useRef,useState,useSyncExternalStore,type PointerEvent as ReactPointerEvent} from "react";
import type * as THREE from "three";
import {savedMeasurementCurrent,type SavedMeasurement} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {documentVersion,sameDocumentVersion,subscribeDocumentChanges,type DocumentVersion} from "../state/documentSession";
import {dispatchCadCommand} from "../state/dispatchCadCommand";
import {undoDocument,redoDocument} from "../state/history";
import {savedMeasurementDefinition} from "../state/savedMeasurementCommands";
import {savedMeasurementGeometry} from "../precision/savedMeasurementGeometry";
import {savedMeasurementPlacementOffset,savedMeasurementPointerPlane,type PlanePoint} from "../precision/savedMeasurementPlacement";
import type {Vec3} from "../precision/workPlane";
import "./savedMeasurements.css";
type Drag={id:string;pointerId:number;element:SVGGElement;version:DocumentVersion;stamp:string;start:PlanePoint;client:PlanePoint;offset:PlanePoint;next:PlanePoint;distance:number;axis?:"X"|"Y"};
export function SavedMeasurements({project,onRecall,direct,enabled,getCanvas,getCamera,onWheel}:{project:(p:Vec3)=>[number,number];onRecall:(m:SavedMeasurement)=>void;direct:boolean;enabled:boolean;getCanvas:()=>HTMLCanvasElement|null;getCamera:()=>THREE.Camera|null;onWheel:(event:WheelEvent)=>void}){
 const epoch=useSyncExternalStore(subscribeDocumentChanges,()=>documentVersion().generation);
 const [tick,setTick]=useState(0),[error,setError]=useState(""),[selected,setSelected]=useState<string|null>(null),[preview,setPreview]=useState<{id:string;offset:PlanePoint;axis?:"X"|"Y";targetId?:string;guide?:Vec3[]}|null>(null),[busy,setBusy]=useState(false);
 const [snapEnabled,setSnapEnabled]=useState(true),[gap,setGap]=useState("5"),[layout,setLayout]=useState<{placements:{measurementId:string;offset:PlanePoint}[];version:DocumentVersion;stamp:string}|null>(null);
 const layoutRef=useRef(layout);layoutRef.current=layout;
 const drag=useRef<Drag|null>(null),busyRef=useRef(false),svg=useRef<SVGSVGElement>(null);
 const entries=useMemo(()=>Object.values(cadDocument.savedMeasurements??{}).map(m=>({m,current:savedMeasurementCurrent(cadDocument,m)&&!!measurementPresentation(cadDocument,m),geometry:savedMeasurementGeometry(cadDocument,m)})),[epoch]);
 const animated=entries.some(e=>!!e.geometry);
 // Ignore numerical jitter from OrbitControls matrix updates; real view changes cancel the gesture.
 const cameraStamp=()=>{const camera=getCamera(),canvas=getCanvas();if(!camera||!canvas)return "";const r=canvas.getBoundingClientRect();return JSON.stringify([...camera.matrixWorld.elements,...camera.projectionMatrix.elements,r.left,r.top,r.width,r.height].map(n=>Math.abs(n)<1e-10?0:Number(n.toPrecision(10))));};
 function release(){const active=drag.current;drag.current=null;if(active?.element.hasPointerCapture(active.pointerId))active.element.releasePointerCapture(active.pointerId);}
 function cancel(message=""){release();setPreview(null);setLayout(null);if(message)setError(message);}
 useEffect(()=>{cancel();if(!enabled)setSelected(null);else setSelected(id=>id&&cadDocument.savedMeasurements?.[id]?.visible&&savedMeasurementCurrent(cadDocument,cadDocument.savedMeasurements[id])?id:null);},[epoch,enabled]);
 useEffect(()=>{const blur=()=>cancel();window.addEventListener("blur",blur);return()=>{window.removeEventListener("blur",blur);release();};},[]);
 useEffect(()=>{if(!animated)return;let frame:number,last=0;const update=()=>{const now=performance.now();if(now-last>32){last=now;if((drag.current&&drag.current.stamp!==cameraStamp())||(layoutRef.current&&layoutRef.current.stamp!==cameraStamp()))cancel("화면이 바뀌어 배치 미리보기를 취소했습니다. 다시 드래그하세요.");setTick(t=>t+1);}frame=requestAnimationFrame(update);};update();return()=>cancelAnimationFrame(frame);},[animated]);
 useEffect(()=>{const element=svg.current;if(!element)return;const wheel=(e:WheelEvent)=>{cancel();onWheel(e);};element.addEventListener("wheel",wheel,{passive:false});return()=>element.removeEventListener("wheel",wheel);},[onWheel,entries.length]);
 const run=async(command:Parameters<typeof dispatchCadCommand>[0])=>{setError("");try{const r=await dispatchCadCommand(command);if(!r.ok)setError(r.reason??"Measurement command failed.");}catch(e){setError(String(e));}};
 async function place(id:string,offset:PlanePoint,version:DocumentVersion){
  if(busyRef.current)return;if(!sameDocumentVersion(version)){cancel("문서가 변경되어 배치를 취소했습니다. 다시 드래그하세요.");return;}
  busyRef.current=true;setBusy(true);try{await run({type:"place-saved-measurement",measurementId:id,offset,documentId:version.documentId,expectedRevision:version.revision});}finally{busyRef.current=false;setBusy(false);setPreview(null);}
 }
 function organize(){if(!selected||busyRef.current)return;cancel();setError("");try{const m=cadDocument.savedMeasurements?.[selected];if(!m)return;const placements=organizeMeasurementOffsets(cadDocument,m,Number(gap));if(!placements.length){setError("치수 간격이 이미 적용되어 있습니다.");return;}setLayout({placements,version:documentVersion(),stamp:cameraStamp()});}catch(e){setError(e instanceof Error?e.message:String(e));}}
 async function applyLayout(){if(!layout||busyRef.current)return;if(!sameDocumentVersion(layout.version)||layout.stamp!==cameraStamp()){cancel("문서 또는 화면이 변경되어 정리를 취소했습니다.");return;}busyRef.current=true;setBusy(true);try{await run({type:"layout-saved-measurements",placements:layout.placements,documentId:layout.version.documentId,expectedRevision:layout.version.revision});}finally{busyRef.current=false;setBusy(false);setLayout(null);}}
 function point(client:PlanePoint,m:SavedMeasurement){const camera=getCamera(),canvas=getCanvas();const frame=measurementPresentation(cadDocument,m);if(!camera||!canvas||!frame)return null;const p=savedMeasurementPointerPlane(camera,canvas.getBoundingClientRect(),client,frame.plane);return p?[(p[0]-frame.origin[0])/frame.scale,(p[1]-frame.origin[1])/frame.scale] as PlanePoint:null;}
 function down(e:ReactPointerEvent<SVGGElement>,m:SavedMeasurement){
  if(!enabled||busyRef.current||e.button!==0)return;e.preventDefault();e.stopPropagation();setSelected(m.id);setError("");e.currentTarget.focus();
  if(drag.current){cancel();return;}setLayout(null);const client:PlanePoint=[e.clientX,e.clientY],start=point(client,m);
  if(!start){setError("출력 평면이 화면에 너무 기울어져 있습니다. 평면을 바라보도록 회전한 뒤 드래그하세요.");return;}
  drag.current={id:m.id,pointerId:e.pointerId,element:e.currentTarget,version:documentVersion(),stamp:cameraStamp(),start,client,offset:[...m.offset],next:[...m.offset],distance:0};e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e:ReactPointerEvent<SVGGElement>){
  const active=drag.current;if(!active||active.pointerId!==e.pointerId)return;e.preventDefault();e.stopPropagation();
  if(!sameDocumentVersion(active.version)||active.stamp!==cameraStamp()){cancel("문서 또는 화면이 변경되어 배치를 취소했습니다.");return;}
  const m=cadDocument.savedMeasurements?.[active.id];if(!m){cancel();return;}const current=point([e.clientX,e.clientY],m);if(!current){cancel("출력 평면과 포인터의 교점을 찾을 수 없습니다.");return;}
  const raw=savedMeasurementPlacementOffset(active.offset,active.start,current);if(!raw){cancel("치수 배치는 ±1,000,000 mm 범위에서 가능합니다.");return;}
  const snapped=snapMeasurementOffset(cadDocument,m,raw,active.offset,e.shiftKey,!snapEnabled||e.altKey,project,active.axis),next=snapped.offset;
  active.axis=e.shiftKey?snapped.axis:undefined;
  active.next=next;active.distance=Math.max(active.distance,Math.hypot(e.clientX-active.client[0],e.clientY-active.client[1]));if(active.distance>=3)setPreview({id:m.id,...snapped});
 }
 function up(e:ReactPointerEvent<SVGGElement>){
  if(drag.current?.pointerId!==e.pointerId)return;move(e);const active=drag.current;if(!active)return;release();
  if(active.distance<3||active.next.every((n,i)=>Math.abs(n-active.offset[i])<1e-9)){setPreview(null);return;}
  void place(active.id,active.next,active.version);
 }
 useEffect(()=>{
  const outside=(e:PointerEvent)=>{if(e.button===0&&!drag.current&&e.target instanceof Element&&!e.target.closest('[data-saved-dimension-editor],.saved-measurements-panel')){cancel();setSelected(null);}};
  const key=(e:KeyboardEvent)=>{
   if(e.isComposing||e.keyCode===229)return;const target=e.target instanceof Element?e.target:null,focused=!!target?.closest('[data-saved-dimension-editor]');
   if(e.key==="Escape"&&(drag.current||layoutRef.current||focused&&selected)){e.preventDefault();e.stopImmediatePropagation();cancel();setSelected(null);getCanvas()?.focus();return;}
   if(!enabled||!selected||!focused||target?.closest('input,textarea,select,[contenteditable="true"]'))return;
   if((e.key==="Enter"||e.key===" ")&&target?.closest("[data-measurement-id]")){e.preventDefault();e.stopImmediatePropagation();return;}
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.stopImmediatePropagation();if(drag.current||layoutRef.current)cancel();else if(!busyRef.current)(e.shiftKey?redoDocument:undoDocument)();return;}
   if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat&&!busyRef.current){cancel();void run({type:"delete-saved-measurement",measurementId:selected});}return;}
   if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)||e.ctrlKey||e.metaKey)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat||drag.current||busyRef.current)return;
   const m=cadDocument.savedMeasurements?.[selected];if(!m)return;const step=e.altKey ? 0.1 : e.shiftKey ? 10 : 1,next=savedMeasurementPlacementOffset(m.offset,[0,0],[(e.key==="ArrowRight"?1:e.key==="ArrowLeft"?-1:0)*step,(e.key==="ArrowUp"?1:e.key==="ArrowDown"?-1:0)*step]);if(next)void place(m.id,next,documentVersion());
  };
  document.addEventListener("pointerdown",outside,true);window.addEventListener("keydown",key,true);return()=>{document.removeEventListener("pointerdown",outside,true);window.removeEventListener("keydown",key,true);};
 },[selected,enabled,epoch]);
 if(!entries.length)return null;
 const display=entries.map(({m,geometry})=>{const offset=preview?.id===m.id?preview.offset:layout?.placements.find(p=>p.measurementId===m.id)?.offset,g=offset?savedMeasurementGeometry(cadDocument,{...m,offset}):geometry;return {m,g,text:g?project(g.worldText):[0,0] as PlanePoint,width:g?Math.max(44,Array.from(g.text).reduce((n,c)=>n+(c.charCodeAt(0)>255?12:7),0)+14):0};});
 const overlaps=measurementOverlaps(display.flatMap(({m,g,text,width})=>g?[{id:m.id,text,width,lines:g.worldLines.map(line=>line.map(project))}]:[]));
 const selectedMeasurement=entries.find(e=>e.m.id===selected&&e.geometry)?.m;
 return <>
 <svg ref={svg} className="saved-measurement-overlay" aria-label="Saved measurement dimensions" data-frame={tick} data-layout-preview={layout?.placements.length} data-preview={preview?.id} data-snap-target={preview?.targetId} data-axis-lock={preview?.axis} data-placing={busy||undefined}>
 {preview?.guide&&<polyline className="measurement-snap-guide" aria-label="치수 정렬 스냅 가이드" points={preview.guide.map(p=>project(p).join(",")).join(" ")}/>}
 {display.map(({m,g,text,width})=>{if(!g)return null;const baseline=g.worldLines[2].map(project);
 return <g key={m.id} data-measurement-id={m.id} data-distance={m.result!.distance} data-overlap={overlaps.has(m.id)||undefined} data-selected={selected===m.id||undefined} data-saved-dimension-editor data-cad-editor role="button" aria-label={`치수 배치 ${m.name}`} aria-pressed={selected===m.id} aria-disabled={!enabled||busy} tabIndex={enabled?0:-1}
 onPointerDown={e=>down(e,m)} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>cancel()} onLostPointerCapture={()=>{if(drag.current?.id===m.id)cancel();}} onFocus={()=>enabled&&setSelected(m.id)}>
 {g.worldLines.map((line,i)=>{const p=line.map(project);return <polyline key={i} points={p.map(p=>p.join(",")).join(" ")}/>;})}
 {enabled&&!busy&&<><polyline className="saved-dimension-hit" data-dimension-line-hit points={baseline.map(p=>p.join(",")).join(" ")}/><rect className="saved-dimension-label-hit" data-dimension-label-hit x={text[0]-width/2} y={text[1]-16} width={width} height="23" rx="3"/></>}
 <text x={text[0]} y={text[1]}>{g.text}</text><title>치수선·문구를 끌어 함께 배치 · 방향키 1 mm · Shift 10 mm · Alt 0.1 mm · Escape 취소 · Delete 삭제</title></g>;})}
 </svg>
 {selectedMeasurement&&enabled&&<div className="saved-dimension-editbar" data-saved-dimension-editor data-cad-editor aria-label="선택 치수 편집"><strong>{selectedMeasurement.name}</strong><span role="status">{preview?`배치 미리보기 · ${preview.offset.map(n=>n.toFixed(3)).join(", ")} mm${preview.axis?` · ${preview.axis}축 고정`:""}${preview.targetId?" · 치수선 정렬 스냅":""}`:busy?"배치 저장 중…":layout?`간격 정리 미리보기 · ${layout.placements.length}개 이동`:"드래그 · Shift 축 고정 · Alt 스냅 해제"}</span><label><input type="checkbox" aria-label="치수 정렬 스냅" checked={snapEnabled} onChange={e=>setSnapEnabled(e.target.checked)}/>정렬 스냅</label><label>간격 mm <input aria-label="치수 정리 간격" type="number" min="0.1" max="1000" step="1" value={gap} onChange={e=>{setGap(e.target.value);setLayout(null);}}/></label><button disabled={busy} onClick={organize}>간격 정리 미리보기</button>{layout&&<><button disabled={busy} onClick={()=>void applyLayout()}>치수 정리 적용</button><button disabled={busy} onClick={()=>cancel()}>치수 정리 취소</button></>}{overlaps.size>0&&<span role="status" className="measurement-overlap-note">문구·치수선 겹침 {overlaps.size}개 · 화면 기준 안내</span>}{direct&&<button disabled={busy} onClick={()=>onRecall(structuredClone(selectedMeasurement))}>선택 치수 상세 편집</button>}<button disabled={busy} onClick={()=>{cancel();void run({type:"delete-saved-measurement",measurementId:selectedMeasurement.id});}}>선택 치수 삭제</button>{error&&<span role="alert">{error}</span>}</div>}
 <details className="saved-measurements-panel"><summary>저장된 측정 ({entries.length}){overlaps.size>0?` · 겹침 ${overlaps.size}개`:""}</summary><p>치수선·문구를 클릭해 드래그 배치하세요. 참조 재지정은 Direct(F2)에서 편집합니다.</p><button onClick={()=>void run({type:"refresh-saved-measurements"})}>저장 측정 다시 계산</button>{entries.map(({m,current})=><section key={m.id} data-saved-measurement={m.id}><strong>{m.name}</strong><p role="status">{current?`${m.result!.distance.toFixed(4)} mm · ${m.mode}${m.result!.accuracy==="approximate"?" · 근사값":""}`:`재지정 필요 · ${m.message??"참조 확인이 필요합니다."}`}</p><label><input type="checkbox" checked={m.visible} onChange={()=>void run({type:"upsert-saved-measurement",measurement:{...savedMeasurementDefinition(m),visible:!m.visible}})}/>치수 표시·출력</label><button disabled={!direct} onClick={()=>{setSelected(m.id);onRecall(structuredClone(m));}}>편집·재지정</button><button onClick={()=>void run({type:"delete-saved-measurement",measurementId:m.id})}>측정 삭제</button></section>)}{error&&<p role="alert">{error}</p>}</details>
 </>;
}
