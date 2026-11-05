import {useEffect,useRef,useState} from "react";
import {INTERFERENCE_INTENTS,interferencePairKey,type InterferenceIntent} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {previewCadCommand,applyCadPlan,discardCadPlan,getCadPlanFrameDocument} from "../state/documentPlans";
export function InterferenceIntentEditor({pair,revision}:{pair:[string,string];revision:number}){
 const key=interferencePairKey(pair),stored=cadDocument.interferenceIntents?.[key];
 const [kind,setKind]=useState<InterferenceIntent>("undecided"),[note,setNote]=useState(""),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const plan=useRef<string|undefined>(undefined),ticket=useRef(0);
 function cancel(){ticket.current++;if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReady(false);setBusy(false);}
 useEffect(()=>{cancel();setKind(stored?.intent??"undecided");setNote(stored?.note??"");setMessage("");},[key,revision]);
 useEffect(()=>()=>{ticket.current++;if(plan.current)discardCadPlan(plan.current);},[]);
 async function review(remove=false){cancel();const seq=++ticket.current;setBusy(true);try{const r=await previewCadCommand({type:"assembly-pair-intent",pair,intent:remove?null:kind,note:remove?"":note});if(seq!==ticket.current){discardCadPlan(r.planId);return;}plan.current=r.planId;if(!r.result.ok)throw Error(r.result.reason);const after=getCadPlanFrameDocument(r.planId)!.interferenceIntents?.[key];setReady(true);setMessage("Metadata Preview: "+(stored?.intent??"no annotation")+" → "+(after?.intent??"removed")+". Geometry and measured volume unchanged.");}catch(e){if(seq===ticket.current)setMessage(String(e));}finally{if(seq===ticket.current)setBusy(false);}}
 async function apply(){if(!plan.current)return;setBusy(true);try{const r=await applyCadPlan(plan.current);if(!r.ok)throw Error(r.reason);cancel();setMessage("Design intent saved. Original geometric result retained.");}catch(e){setBusy(false);setMessage(String(e));}}
 return <fieldset disabled={busy}><legend>Pair design intent: {pair.join(" / ")}</legend><p>Annotation only. It does not suppress, reclassify or repair measured geometry.</p>
 <label>Intent<select aria-label="Pair design intent" value={kind} onChange={e=>{cancel();setKind(e.target.value as InterferenceIntent);}}>{INTERFERENCE_INTENTS.map(k=><option key={k}>{k}</option>)}</select></label>
 <label>User explanation<textarea aria-label="Pair explanation" maxLength={1000} value={note} onChange={e=>{cancel();setNote(e.target.value);}}/></label>
 <button onClick={()=>void review()}>Review pair intent</button><button disabled={!stored} onClick={()=>void review(true)}>Review remove intent</button>
 {ready&&<button onClick={()=>void apply()}>Apply pair intent</button>}<button disabled={!ready&&!busy} onClick={cancel}>Cancel pair intent</button>
 <p role="status" aria-label="Pair intent status">{message}</p></fieldset>;
}
