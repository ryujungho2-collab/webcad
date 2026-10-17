import { useEffect, useRef, useState } from "react";
import { App } from "../App";
import { loadDocumentRecovery } from "../state/documentFile";
export function DocumentRecoveryGate() {
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  const loading=useRef<Promise<unknown>|null>(null);
  function load() {
    setError("");loading.current ??= loadDocumentRecovery();
    void loading.current.then(()=>setReady(true)).catch(error=>{loading.current=null;setError(error instanceof Error?error.message:String(error));});
  }
  useEffect(load,[]);
  return ready?<App recoveryReady/>:<div role={error?"alert":"status"}>{error||"Loading project recovery…"}{error&&<button onClick={load}>Retry project recovery</button>}</div>;
}
