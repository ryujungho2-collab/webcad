import { useEffect,useState } from "react";
import type { GeometryMeasurement } from "@agent-webcad/cad-document";
import { queryCadDocument } from "../state/documentQuery";

export function ExactMeasurements({objectId,revision}:{objectId:string;revision:number}) {
  const [state,setState]=useState<{measurement?:GeometryMeasurement;error?:string;loading:boolean}>({loading:true});
  useEffect(()=>{
    let active=true;setState({loading:true});
    void queryCadDocument([objectId]).then(query=>{if(active)setState(query.stale?{loading:false,error:"Geometry changed; select again to measure."}:{loading:false,measurement:query.objects[0]?.measurement,error:query.objects[0]?.error});})
      .catch(error=>{if(active)setState({loading:false,error:error.message});});
    return ()=>{active=false;};
  },[objectId,revision]);
  const m=state.measurement;
  return <section className="property-section" aria-label="Exact geometry measurements"><h3>Geometry measurements</h3>
    {state.loading?<p role="status">Measuring geometry…</p>:state.error?<p role="alert">{state.error}</p>:m?<>
      <div className="property-row"><span>Source</span><strong>{m.basis==="brep"?"Exact solid":"Exact curves"}</strong></div>
      {m.validity&&<div className="property-row"><span>Geometry</span><strong>{m.validity}</strong></div>}
      {m.volume!==undefined&&<div className="property-row"><span>Volume</span><strong data-measured-volume={m.volume}>{m.volume.toFixed(4)} mm³</strong></div>}
      {m.area!==undefined&&<div className="property-row"><span>Area</span><strong data-measured-area={m.area}>{m.area.toFixed(4)} mm²</strong></div>}
      {m.length!==undefined&&<div className="property-row"><span>Length</span><strong>{m.length.toFixed(4)} mm</strong></div>}
    </>:null}
  </section>;
}
