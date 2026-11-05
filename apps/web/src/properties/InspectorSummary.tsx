import {useMemo} from "react";
import {cadDocument} from "../state/cadDocument";
import {buildDependencyGraph,createDependencyExplainer} from "../state/dependencyGraph";
export function InspectorSummary({ids,revision}:{ids:string[];revision:number}){
  const info=useMemo(()=>{const explain=createDependencyExplainer(buildDependencyGraph(cadDocument));return ids.map(explain);},[ids.join("\0"),revision]);
  const selected=new Set(ids);
  const objects=ids.map(id=>cadDocument.objects[id]).filter(Boolean),features=Object.values(cadDocument.features).filter(f=>selected.has(f.output));
  const types=[...new Set(features.map(f=>`${f.type}${f.params.kind?` · ${f.params.kind}`:""}`))],locked=objects.filter(o=>cadDocument.layers[o.layerId]?.locked),hidden=objects.filter(o=>!o.visible||!cadDocument.layers[o.layerId]?.visible),missing=info.flatMap(i=>i.immediate).filter(e=>e.source.missing),sources=info.reduce((n,i)=>n+i.immediate.length,0);
  return <section className="inspector-overview" aria-label="Selection overview">
    <div className="inspector-header"><span>Inspector</span><small>{objects.length} selected · mm</small></div>
    <div className="inspector-selection-summary"><span className="inspector-selection-mark" aria-hidden="true">◇</span><div><strong title={objects.map(o=>o.name).join(" · ")}>{objects.length===1?objects[0].name:`${objects.length} objects · ${objects[0]?.name??"Missing selection"}`}</strong><span>{types.length>1?"Mixed types":types[0]??"Unsupported object"} · {sources} references</span></div>{locked.length>0&&<span className="inspector-state-badge">Locked</span>}</div>
    {locked.length>0&&<p className="inspector-notice" role="status">{locked.length} selected objects are on locked layers. Unlock them in Layers before editing.</p>}
    {hidden.length>0&&<p className="inspector-notice" role="status">Selection includes hidden objects or layers.</p>}
    {types.length>1&&<p className="inspector-notice">Mixed types: shared position and display controls only. Select matching primitives to edit dimensions together.</p>}
    {missing.length>0&&<p className="inspector-notice inspector-error" role="alert">{missing.length} missing source references. Inspect Dependencies before editing.</p>}
    {objects.length===1&&features.some(f=>f.type==="image")&&<p className="property-hint inspector-summary-note">Raster dimensions are presentation values; use the image controls below.</p>}
  </section>;
}
