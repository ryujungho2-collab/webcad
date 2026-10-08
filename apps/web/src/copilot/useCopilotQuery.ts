import { useEffect, useRef, useState } from "react";
import { documentVersion, type DocumentVersion } from "../state/documentSession";
import { copilotQueryContextChange, readCopilotSelection, type CopilotQueryContext, type CopilotQueryResult } from "./copilotQuery";

export type CopilotQueryState = { status: "idle" | "loading" | "ready" | "invalid"; result?: CopilotQueryResult; error?: string; context?: CopilotQueryContext };

/** App-owned read session survives activity navigation; old reads cannot win. */
export function useCopilotQuery(selectionIds: string[], version: DocumentVersion) {
  const [state,setState]=useState<CopilotQueryState>({status:"idle"});
  const sequence=useRef(0),controller=useRef<AbortController|null>(null);
  const current=useRef<CopilotQueryContext>({selectionIds,version});current.current={selectionIds,version};
  const changed=state.context?copilotQueryContextChange(state.context,current.current):undefined;
  function cancel(error="Read cancelled. Read selection again.") {
    sequence.current++;controller.current?.abort();controller.current=null;
    setState({status:"invalid",error});
  }
  useEffect(()=>{if(changed)cancel(changed);},[changed]);
  useEffect(()=>()=>{sequence.current++;controller.current?.abort();},[]);
  async function read() {
    if(controller.current)return;
    const token=++sequence.current,abort=new AbortController();controller.current=abort;
    const context={version:{...current.current.version},selectionIds:[...current.current.selectionIds]};
    setState({status:"loading",context});
    try {
      const result=await readCopilotSelection(context.selectionIds,{signal:abort.signal});
      if(token!==sequence.current)return;
      const invalid=copilotQueryContextChange(context,{...current.current,version:documentVersion()});
      setState(invalid?{status:"invalid",error:invalid}:{status:"ready",result,context});
    } catch(error) {
      if(token===sequence.current)setState({status:"invalid",error:error instanceof Error?error.message:"Reading failed. Inspect the selected objects and read again."});
    } finally {if(controller.current===abort)controller.current=null;}
  }
  return {state:changed?{status:"invalid" as const,error:changed}:state,read,cancel:()=>cancel()};
}
