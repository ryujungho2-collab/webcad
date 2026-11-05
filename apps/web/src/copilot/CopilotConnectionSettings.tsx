import {useEffect,useState} from "react";
import type {CopilotConnection} from "./copilotConnection";
import {BUILTIN_COPILOT} from "./designIntent";
type Status={ready:boolean;provider:string;model:string;models:string[];vision:boolean;message:string};
type Props={value:CopilotConnection;onChange:(value:CopilotConnection)=>void;disabled?:boolean;prefix?:string};
export function CopilotConnectionSettings({value,onChange,disabled,prefix="Copilot"}:Props){
 const [status,setStatus]=useState<Status>(),[error,setError]=useState(""),[checking,setChecking]=useState(false),[reload,setReload]=useState(0),[connect,setConnect]=useState(false);
 const builtin=value.endpoint===BUILTIN_COPILOT;
 useEffect(()=>{
  if(!connect&&(!builtin||value.mode!=="gateway")){setChecking(false);return;}
  const controller=new AbortController(),timer=setTimeout(()=>{controller.abort();setChecking(false);setConnect(false);setError("Local model check timed out. Start Ollama and try again.");},6000);setChecking(true);setError("");
  void fetch(`/api/copilot/status${value.model?`?model=${encodeURIComponent(value.model)}`:""}`,{signal:controller.signal,credentials:"omit"}).then(async r=>{const v=await r.json();if(controller.signal.aborted)return;if(!r.ok||!Array.isArray(v.models)||!v.ready)throw Error(v.message??"Start Ollama and install a local model.");setStatus(v);if(connect){onChange({mode:"gateway",endpoint:BUILTIN_COPILOT,model:v.model});setConnect(false);}}).catch(e=>{if(!controller.signal.aborted){setError(e instanceof Error?e.message:"Local model unavailable.");setConnect(false);}}).finally(()=>{clearTimeout(timer);if(!controller.signal.aborted)setChecking(false);});
  return()=>{controller.abort();clearTimeout(timer);};
 },[value.mode,value.endpoint,value.model,reload,connect]);
 return <div className="copilot-connection-settings">
  <label>Planner<select aria-label={`${prefix} planner`} disabled={disabled} value={value.mode==="rules"?"rules":builtin?"ollama":"external"} onChange={e=>{setConnect(false);setStatus(undefined);setError("");onChange(e.target.value==="rules"?{...value,mode:"rules"}:e.target.value==="ollama"?{mode:"gateway",endpoint:BUILTIN_COPILOT}:{mode:"gateway",endpoint:builtin?"":value.endpoint});}}><option value="rules">Agent WebCAD 내부 엔진</option><option value="ollama">로컬 모델 / Ollama · 선택</option><option value="external">외부 모델 gateway · 선택</option></select></label>
  {value.mode==="rules"&&<p className="property-hint design-hint">기본 모드입니다. 의도 확인·지원 수치/형상 대안·수정·CAD 검증·Undo를 내부 엔진으로 실행하며 모델이나 API 서버가 필요하지 않습니다. 자유로운 언어·이미지 해석은 선택한 모델의 확장입니다.</p>}<button disabled={disabled||checking} onClick={()=>{setConnect(true);setReload(n=>n+1);}}>Use local copilot</button>
  {value.mode==="gateway"&&<><label>Gateway URL<input aria-label={`${prefix} gateway URL`} disabled={disabled} value={value.endpoint} onChange={e=>{setStatus(undefined);onChange({mode:"gateway",endpoint:e.target.value});}}/></label>
   {builtin&&<><button disabled={disabled||checking} onClick={()=>setReload(n=>n+1)}>Check local model</button>{status&&<><label>Local model<select aria-label={`${prefix} local model`} disabled={disabled||checking} value={value.model??status.model} onChange={e=>{setStatus(undefined);onChange({...value,model:e.target.value});}}>{status.models.map(n=><option key={n}>{n}</option>)}</select></label><p role="status">Ollama · {value.model??status.model} · {status.vision?"CAD images supported":"Text and CAD tools; image reading unavailable"}</p><p className="property-hint design-hint">{status.message} Cold loading can take time; requests can be cancelled. No model is downloaded automatically.</p></>}</>}
   <p className="property-hint design-hint">Requests send your brief, selected metadata and bounded CAD queries to this endpoint. CAD execution and Apply stay local. The built-in gateway uses Ollama on this computer. Other gateways use their configured server.</p>
  </>}
  {checking&&<p role="status">Checking local model…</p>}{error&&<p role="alert">{error}</p>}
 </div>;
}
