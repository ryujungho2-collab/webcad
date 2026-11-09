import {useState} from "react";
import {cadDocument} from "../state/cadDocument";
import {selectAllIds} from "../state/selection";
import {featureContract} from "@agent-webcad/cad-document";

/** Explicit human selection; the same editor selection is captured by NL and MCP. */
export function SharedToolTargets({ids,disabled,onSelect}:{ids:string[];disabled:boolean;onSelect:(ids:string[])=>void}){
  const [open,setOpen]=useState(false),[search,setSearch]=useState(""),[candidate,setCandidate]=useState(""),[kind,setKind]=useState("all");
  const features=new Map(Object.values(cadDocument.features).map(f=>[f.output,f]));
  const query=search.trim().toLowerCase(),rank=(id:string)=>id.toLowerCase()===query?0:cadDocument.objects[id].name.toLowerCase()===query?1:2;
  const candidates=selectAllIds(cadDocument).filter(id=>{const o=cadDocument.objects[id],f=features.get(id),representation=f&&featureContract(f).representation;return (kind==="all"||kind==="solids"&&representation==="brep"||kind==="profiles"&&(representation==="analytic-curve"||representation==="planar-region"))&&`${o.name} ${id}`.toLowerCase().includes(query);}).sort((a,b)=>rank(a)-rank(b));
  const shown=candidates.slice(0,50),choice=shown.includes(candidate)?candidate:shown[0]??"";
  function move(index:number,delta:number){const next=[...ids];[next[index],next[index+delta]]=[next[index+delta],next[index]];onSelect(next);}
  return <section aria-label="Shared edit selection">
    <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Choose tool targets</button>
    <small> · {ids.length} selected</small>
    <div hidden={!open} className="shared-cad-tool-form">
      <p className="property-hint">사람이 선택한 대상을 자연어와 MCP가 함께 사용합니다. 대상 변경은 미적용 제안을 취소하며 모델을 수정하지 않습니다.</p>
      <label>Find target<input aria-label="Find tool target" placeholder="Name or exact object ID" value={search} onChange={e=>{setSearch(e.target.value);setCandidate("");}} disabled={disabled}/></label>
      <label>Target kind<select aria-label="Tool target kind" value={kind} disabled={disabled} onChange={e=>setKind(e.target.value)}><option value="all">All editable objects</option><option value="solids">3D solids</option><option value="profiles">Profiles / curves · planar or spatial</option></select></label>
      <label>Visible, unlocked objects<select aria-label="Tool target candidate" value={choice} disabled={disabled||!choice} onChange={e=>setCandidate(e.target.value)}>{!choice&&<option value="">No matching editable target</option>}{shown.map(id=><option key={id} value={id}>{cadDocument.objects[id].name} · {id}</option>)}</select></label>
      {candidates.length>shown.length&&<small>Showing 50 of {candidates.length}. Narrow the search.</small>}
      <div className="sketch-actions"><button type="button" disabled={disabled||!choice} onClick={()=>onSelect([choice])}>Use target</button><button type="button" disabled={disabled||!choice||ids.includes(choice)||ids.length>=64} onClick={()=>onSelect([...ids,choice])}>Add target</button><button type="button" disabled={disabled||!ids.length} onClick={()=>onSelect([])}>Clear tool targets</button></div>
      <small>Up to 64 explicit targets for architectural sections. Each tool validates its own source limit before Review.</small>
      <ol aria-label="Shared selected targets">{ids.map((id,i)=><li key={id}>{cadDocument.objects[id]?.name??id}<small> · {id}</small><div className="sketch-actions"><button type="button" aria-label={`Move tool target ${id} up`} disabled={disabled||i===0} onClick={()=>move(i,-1)}>↑ Up</button><button type="button" aria-label={`Move tool target ${id} down`} disabled={disabled||i===ids.length-1} onClick={()=>move(i,1)}>↓ Down</button><button type="button" aria-label={`Remove tool target ${id}`} disabled={disabled} onClick={()=>onSelect(ids.filter(v=>v!==id))}>Remove</button></div></li>)}</ol>
      {ids.length===2&&<button type="button" disabled={disabled} onClick={()=>onSelect([ids[1],ids[0]])}>Swap target and tool</button>}
    </div>
  </section>;
}
