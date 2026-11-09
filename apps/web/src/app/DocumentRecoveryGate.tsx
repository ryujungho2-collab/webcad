import { useEffect, useRef, useState } from "react";
import { App } from "../App";
import { loadDocumentRecovery } from "../state/documentFile";
import { notifyProjectHost } from "./projectSession";
import { isProjectSearchShortcut } from "./projectTabs";
import { isCadKeyboardBlocked } from "../input/shortcutRouter";
export function DocumentRecoveryGate() {
  const [ready,setReady]=useState(false),[error,setError]=useState("");
  const loading=useRef<Promise<unknown>|null>(null);
  useEffect(()=>{
    const activate=()=>notifyProjectHost("activate");
    const find=(e:KeyboardEvent)=>{if(isProjectSearchShortcut(e)&&!isCadKeyboardBlocked(e.target)){e.preventDefault();notifyProjectHost("find-project");}};
    document.addEventListener("pointerdown",activate,true);document.addEventListener("focusin",activate,true);window.addEventListener("focus",activate);
    window.addEventListener("keydown",find,true);
    return()=>{document.removeEventListener("pointerdown",activate,true);document.removeEventListener("focusin",activate,true);window.removeEventListener("focus",activate);window.removeEventListener("keydown",find,true);};
  },[]);
  function load() {
    setError("");loading.current ??= loadDocumentRecovery();
    void loading.current.then(()=>setReady(true)).catch(error=>{loading.current=null;setError(error instanceof Error?error.message:String(error));});
  }
  useEffect(load,[]);
  return ready?<App recoveryReady/>:<div role={error?"alert":"status"}>{error||"Loading project recovery…"}{error&&<button onClick={load}>Retry project recovery</button>}</div>;
}
