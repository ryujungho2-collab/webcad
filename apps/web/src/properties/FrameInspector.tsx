import type {CadArtboard} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {PropertySection} from "../ui/PropertySection";
export function FrameInspector({board,onEdit}:{board:CadArtboard;onEdit?:()=>void}){
  const missing=board.frame?.memberIds.filter(id=>!cadDocument.objects[id])??[];
  return <div className="properties-content" aria-label="Frame inspector">
    <div className="inspector-header"><span>Frame inspector</span><small>{board.workPlane} · mm</small></div>
    <div className="inspector-selection-summary"><div><strong title={board.name}>{board.name}</strong><span>{board.frame?"Drawing frame":"Artboard"} · {board.frame?.memberIds.length??0} members</span></div>{board.locked&&<span className="inspector-state-badge">Locked</span>}</div>
    {board.locked&&<p className="inspector-notice" role="status">Unlock this frame in Artboards before editing.</p>}
    {!!missing.length&&<p className="inspector-notice inspector-error" role="alert">Missing members: {missing.join(", ")}. Repair references before publishing.</p>}
    <PropertySection title="Frame dimensions" meta="Paper · mm">
      {[["Width",board.size[0]],["Height",board.size[1]],["Origin X",board.origin[0]],["Origin Y",board.origin[1]]].map(([label,value])=><div key={label} className="property-row"><span>{label}</span><strong>{value} mm</strong></div>)}
      {board.frame&&<><div className="property-row"><span>Scale</span><strong>1:{board.frame.denominator}</strong></div><p className="property-hint">Crop and scale change presentation; source measurements stay unchanged.</p></>}
      {onEdit&&board.frame&&<div className="property-actions"><button disabled={board.locked||!!missing.length||!!board.frame.stitch} onClick={onEdit}>Edit frame crop & scale</button></div>}
    </PropertySection>
    <PropertySection title="Frame references" defaultOpen={false}>{board.frame?.memberIds.map(id=><p key={id} className="property-hint">{cadDocument.objects[id]?.name??`${id} (missing)`}</p>)}</PropertySection>
  </div>;
}
