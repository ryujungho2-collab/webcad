import { useEffect, useRef, useState } from "react";
import { cadDocument } from "../state/cadDocument";
import { previewCadCommand, applyCadPlan, discardCadPlan, type CadPlanPreview } from "../state/documentPlans";
import { commandInteraction } from "../state/commandInteraction";
import { subscribeDocumentChanges } from "../state/documentSession";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { parseLength } from "../precision/units";
import { planeToWorld, worldToPlane, WORK_PLANES, type Vec3, type WorkPlaneId } from "../precision/workPlane";
import type { CadDimensionStyle } from "@agent-webcad/cad-document";

export function DraftingPanel({ids,layerId,plane,initialBlockId,onChange,onSelect,onClose}:{ids:string[];layerId:string;plane:WorkPlaneId;initialBlockId?:string;onChange:()=>void;onSelect:(id:string)=>void;onClose:()=>void}) {
  const selected=ids.length===1?Object.values(cadDocument.features).find(f=>f.output===ids[0]&&f.type==="drafting"):undefined;
  const [kind,setKind]=useState(String(initialBlockId?"insert-block":selected?.params.kind==="block"?"insert-block":selected?.params.kind??"text"));
  const [text,setText]=useState(String(selected?.params.text??"ROOM"));
  const [point,setPoint]=useState(()=>Array.isArray(selected?.params.point)?worldToPlane(selected.params.point as Vec3,WORK_PLANES[plane]).join(","):"0,0"),[height,setHeight]=useState(String(selected?.params.height??175)),[spacing,setSpacing]=useState(String(selected?.params.spacing??100)),[angle,setAngle]=useState(String(selected?.params.angle??0));
  const [offset,setOffset]=useState(String(selected?.params.offset??300)),[orientation,setOrientation]=useState(String(selected?.params.orientation??"horizontal"));
  const [chainStyle,setChainStyle]=useState<CadDimensionStyle>(()=>structuredClone((selected?.params.style??{}) as CadDimensionStyle));
  const [values,setValues]=useState<Record<string,string>>(()=>Object.fromEntries(Object.entries({width:6000,depth:4000,wall:150,doorCenter:1500,doorWidth:900,windowCenter:4000,windowWidth:1200}).map(([key,value])=>[key,String(selected?.params[key]??value)])));
  const [block,setBlock]=useState(String(initialBlockId??selected?.params.blockId??Object.keys(cadDocument.blocks??{})[0]??"")),[name,setName]=useState("Symbol"),[status,setStatus]=useState("");
  const [preview,setPreview]=useState<CadPlanPreview>(),[reviewedKey,setReviewedKey]=useState<string>(),[pending,setPending]=useState(false),[revision,setRevision]=useState(0);
  const blockId=useRef(`block-${crypto.randomUUID()}`);
  const draftKey=JSON.stringify([ids,layerId,plane,kind,text,point,height,spacing,angle,offset,orientation,chainStyle,values,block,name,revision]);
  const interaction=commandInteraction({command:"Drafting",draftKey,reviewedKey,preview,pending,targets:ids});
  useEffect(()=>subscribeDocumentChanges(()=>setRevision(v=>v+1)),[]);
  const inputPoint=()=>{const parts=point.split(",").map(value=>parseLength(value));return parts.length===2&&parts.every(v=>v!==null)?planeToWorld(parts as [number,number],WORK_PLANES[plane]):null;};
  function prepare(){
    const p=inputPoint();if(!p)throw new Error("Enter a point as x,y with optional units.");
    let params:Record<string,unknown>={kind,workPlane:plane};
    if(kind==="text")params={...params,point:p,text,height:parseLength(height),angle:Number(angle)};
    if(kind==="floor-plan")params={...params,text,...Object.fromEntries(Object.entries(values).map(([key,value])=>[key,parseLength(value)]))};
    if(kind==="chain"){
      const source=ids.length===1?cadDocument.objects[ids[0]]:null, feature=source&&Object.values(cadDocument.features).find(f=>f.output===source.id&&f.type==="drawing");
      const world=source&&feature?getWorldDrawingGeometry(source,feature):null;
      if(!selected&&!world?.points?.length)throw new Error("Select a line or polyline to dimension consecutive spans.");
      params={...params,points:world?.points??selected?.params.points,sourceObjectId:feature?.output??selected?.params.sourceObjectId,orientation,offset:parseLength(offset),height:parseLength(height),style:chainStyle};
    }
    if(kind==="hatch")params={...params,sourceObjectIds:selected?.params.sourceObjectIds??ids,spacing:parseLength(spacing),angle:Number(angle)};
    return kind==="define-block"?{type:"define-block" as const,id:blockId.current,name,objectIds:ids,base:p}:kind==="insert-block"?{type:"insert-block" as const,blockId:block,layerId,position:p,angle:Number(angle)}:selected&&selected.params.kind===kind?{type:"update-drafting" as const,objectId:selected.output,params}:{type:"create-drafting" as const,layerId,params};
  }
  useEffect(()=>{
    const controller=new AbortController();let planId:string|undefined;setPreview(undefined);setStatus("Reviewing drafting input…");
    void(async()=>{try{const next=await previewCadCommand(prepare(),{signal:controller.signal});planId=next.planId;if(controller.signal.aborted){discardCadPlan(planId);return;}setPreview(next);setReviewedKey(draftKey);setStatus(next.result.ok?`${next.changes.length} affected objects · ready to apply`:next.result.reason??"Invalid drafting input.");}catch(error){if(!controller.signal.aborted)setStatus(error instanceof Error?error.message:String(error));}})();
    return()=>{controller.abort();if(planId)discardCadPlan(planId);};
  },[draftKey]);
  async function apply(){
    if(!interaction.canApply||!preview)return;setPending(true);
    try{
      const result=await applyCadPlan(preview.planId);if(!result.ok){setStatus(result.reason??"Invalid geometry, values or locked layer.");return;}
      if(kind==="define-block"){setBlock(blockId.current);blockId.current=`block-${crypto.randomUUID()}`;setKind("insert-block");onChange();setStatus("Block defined. Enter the insertion point.");return;}
      onChange();if(result.createdIds[0])onSelect(result.createdIds[0]);onClose();
    }catch(error){setStatus(error instanceof Error?error.message:String(error));}finally{setPending(false);}
  }
  return <form className="drafting-panel" data-cad-editor onSubmit={event=>{event.preventDefault();void apply();}} onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();onClose();}}}>
    <strong>Drafting</strong><label>Operation<select aria-label="Drafting operation" value={kind} onChange={event=>setKind(event.target.value)}><option value="text">Text</option><option value="chain">Continuous dimensions</option><option value="hatch">Associative hatch</option><option value="define-block">Define block from selection</option><option value="insert-block">Insert block</option><option value="floor-plan">Room plan with openings</option></select></label>
    {["text","floor-plan"].includes(kind)&&<label>Text<input aria-label="Drafting text" value={text} onChange={event=>setText(event.target.value)}/></label>}
    {["text","define-block","insert-block"].includes(kind)&&<label>Point / base<input aria-label="Drafting point" value={point} onChange={event=>setPoint(event.target.value)}/></label>}
    {["text","chain"].includes(kind)&&<label>Text height<input aria-label="Drafting text height" value={height} onChange={event=>setHeight(event.target.value)}/></label>}
    {["text","hatch","insert-block"].includes(kind)&&<label>Angle °<input aria-label="Drafting angle" value={angle} onChange={event=>setAngle(event.target.value)}/></label>}
    {kind==="hatch"&&<label>Spacing<input aria-label="Hatch spacing" value={spacing} onChange={event=>setSpacing(event.target.value)}/></label>}
    {kind==="chain"&&<><label>Direction<select aria-label="Dimension chain direction" value={orientation} onChange={event=>setOrientation(event.target.value)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="aligned">Aligned</option></select></label><label>Offset<input aria-label="Dimension chain offset" value={offset} onChange={event=>setOffset(event.target.value)}/></label></>}
    {kind==="chain"&&<><label>Length unit<select aria-label="Chain length unit" value={chainStyle.lengthUnit??"mm"} onChange={event=>setChainStyle({...chainStyle,lengthUnit:event.target.value as CadDimensionStyle["lengthUnit"]})}>{["mm","cm","m","in","ft"].map(unit=><option key={unit} value={unit}>{unit}</option>)}</select></label><label>Decimals<input aria-label="Chain decimals" type="number" min="0" max="6" value={chainStyle.precision??2} onChange={event=>setChainStyle({...chainStyle,precision:Number(event.target.value)})}/></label><label>Arrow size<input aria-label="Chain arrow size" type="number" min="0.01" step="any" value={chainStyle.arrowSize??3} onChange={event=>setChainStyle({...chainStyle,arrowSize:Number(event.target.value)})}/></label><label>Text gap<input aria-label="Chain text gap" type="number" min="0" step="0.5" value={chainStyle.textGap??2.5} onChange={event=>setChainStyle({...chainStyle,textGap:Number(event.target.value)})}/></label><label>Paper scale<input aria-label="Chain paper scale" type="number" min="0.001" step="any" value={chainStyle.paperScale??1} onChange={event=>setChainStyle({...chainStyle,paperScale:Number(event.target.value)})}/></label></>}
    {kind==="define-block"&&<label>Name<input aria-label="Block name" value={name} onChange={event=>setName(event.target.value)}/></label>}
    {kind==="insert-block"&&<label>Block<select aria-label="Block definition" value={block} onChange={event=>setBlock(event.target.value)}>{Object.values(cadDocument.blocks??{}).map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
    {kind==="floor-plan"&&Object.entries(values).map(([key,value])=><label key={key}>{key}<input aria-label={`Plan ${key}`} value={value} onChange={event=>setValues({...values,[key]:event.target.value})}/></label>)}
    {status&&<span role="alert">{status}</span>}<div><button type="submit" disabled={!interaction.canApply}>Apply drafting</button><button type="button" disabled={pending} onClick={onClose}>Cancel drafting</button></div>
  </form>;
}
