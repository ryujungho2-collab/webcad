import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_SNAP_PREFERENCES, SNAP_LABELS, SNAP_SYMBOLS, type SnapPreferences } from "../precision/snapPreferences";
import type { SnapType } from "../precision/snapEngine";
import { parseLength } from "../precision/units";

export function SnapSettings({value,onChange}:{value:SnapPreferences;onChange:(value:SnapPreferences)=>void}){
  const [open,setOpen]=useState(false),[grid,setGrid]=useState(String(value.gridStep)),[tolerance,setTolerance]=useState(String(value.tolerancePx)),[error,setError]=useState("");const host=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{setGrid(String(value.gridStep));setTolerance(String(value.tolerancePx));},[value.gridStep,value.tolerancePx]);
  useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!host.current?.contains(e.target as Node)&&!panel.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();setOpen(false);}};window.addEventListener("pointerdown",outside);window.addEventListener("keydown",key,true);return()=>{window.removeEventListener("pointerdown",outside);window.removeEventListener("keydown",key,true);};},[open]);
  function commit(){const step=parseLength(grid),radius=Number(tolerance);if(step===null||step<1e-6||step>1e9||!Number.isFinite(radius)||radius<2||radius>40){setError("Enter a positive grid spacing and a snap radius between 2 and 40 pixels.");return;}setError("");onChange({...value,gridStep:step,tolerancePx:radius});}
  return <div className="snap-settings-host" ref={host}>
    <button type="button" aria-label="Snap settings" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Snaps ▾</button>
    {open&&createPortal(<div ref={panel} style={{left:Math.max(8,Math.min(host.current?.getBoundingClientRect().left??8,window.innerWidth-352))}} className="snap-settings-panel" role="dialog" aria-label="Object snap settings" data-cad-editor>
      <strong>Object snaps</strong><p>Choose the exact points acquired while drawing and editing. Alt temporarily suppresses snapping.</p>
      <div className="snap-settings-types">{(Object.keys(SNAP_LABELS) as SnapType[]).map(type=><label key={type}><input type="checkbox" aria-label={`${SNAP_LABELS[type]} snap`} checked={value.enabled[type]} onChange={event=>onChange({...value,enabled:{...value.enabled,[type]:event.target.checked}})}/><span aria-hidden="true">{SNAP_SYMBOLS[type]}</span>{SNAP_LABELS[type]}</label>)}</div>
      <label>Grid spacing <span><input aria-label="Snap grid spacing" value={grid} onChange={e=>setGrid(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();}}}/> mm</span></label>
      <label>Acquisition radius <span><input aria-label="Snap acquisition radius" value={tolerance} onChange={e=>setTolerance(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();}}}/> px</span></label>
      {error&&<p role="alert">{error}</p>}
      <div><button type="button" onClick={()=>{setError("");onChange(structuredClone(DEFAULT_SNAP_PREFERENCES));}}>Reset snaps</button><button type="button" onClick={()=>setOpen(false)}>Close snaps</button></div>
    </div>,document.body)}
  </div>;
}
