import {useEffect,useState} from "react";
import type {KernelStatus,KernelTaskProgress} from "../cad/kernelGeometryService";
const phases={queued:"Queued",loading:"Loading geometry",building:"Building geometry",meshing:"Preparing display",topology:"Reading edges",measuring:"Measuring geometry"};

/** Indeterminate phases come from the Worker; no invented percentage or completion guarantee. */
export function GeometryTaskStatus({status,progress,onCancel}:{status:KernelStatus;progress:KernelTaskProgress|null;onCancel:()=>number}){
  const [notice,setNotice]=useState("");
  useEffect(()=>{if(progress)setNotice("");},[progress?.taskId]);
  const label=progress?`${phases[progress.phase]} · ${progress.pendingCount} pending`:status==="deferred"?"Kernel deferred":status==="error"?"Kernel error":status==="loading"?"Loading geometry":status==="working"?"Processing":"Ready";
  return <div className="status-task" aria-label="Geometry task status">
    <span className={`status-ready status-ready-${status}`} role="status" aria-live="polite" aria-atomic="true" title={progress?`Task ${progress.taskId} · ${progress.operation}`:label}><i aria-hidden="true"/>{label}</span>
    {progress&&<button type="button" className="status-cancel" aria-label="Cancel geometry task" title="Cancel queued and running geometry tasks in this project" onClick={()=>{const count=onCancel();setNotice(count?`Cancellation requested for ${count} geometry tasks. Completed edits are kept.`:"No cancellable geometry tasks remain.");}}>Cancel tasks</button>}
    <span className="a11y-only" role="status" aria-live="polite" aria-atomic="true">{notice}</span>
  </div>;
}
