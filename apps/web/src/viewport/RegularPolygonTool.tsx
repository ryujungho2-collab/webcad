import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../app/projectActivity";
import {useEffect,useRef,useState} from "react";
import {cadDocument} from "../state/cadDocument";
import {previewCadCommand,applyCadPlan,discardCadPlan,type CadPlanPreview} from "../state/documentPlans";
import {subscribeDocumentChanges} from "../state/documentSession";
import {commandInteraction} from "../state/commandInteraction";
import {CommandReview} from "../ui/CommandReview";
import {parseLength,parseAngle} from "../precision/units";
import {regularPolygon,MAX_POLYGON_SIDES,type PolygonRadiusMode} from "../precision/regularPolygon";
import {WORK_PLANES,planeToWorld,type WorkPlaneId,type Vec3} from "../precision/workPlane";
import {sketchPlane} from "../precision/sketchAdapter";

export type RegularPolygonSession={id:string;workPlane:WorkPlaneId;layerId:string;sketchId?:string};
export function RegularPolygonTool({session,project,onClose,onApplied,onFrame}:{session:RegularPolygonSession;project:(point:Vec3)=>[number,number];onClose:()=>void;onApplied:(ids:string[])=>void;onFrame:(points:Vec3[])=>void}){
  const [u,setU]=useState("0"),[v,setV]=useState("0"),[sides,setSides]=useState("6"),[radius,setRadius]=useState("50 mm"),[rotation,setRotation]=useState("0 deg"),[mode,setMode]=useState<PolygonRadiusMode>("inscribed");
  const [review,setReview]=useState<CadPlanPreview>(),[reviewedKey,setReviewedKey]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState(""),[revision,setRevision]=useState(0),[path,setPath]=useState<[number,number][]>([]);
  const plan=useRef<string|undefined>(undefined),sequence=useRef(0),latest=useRef({points:[] as Vec3[],project});
  function cancel(){sequence.current++;if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReview(undefined);setReviewedKey(undefined);setBusy(false);}
  useEffect(()=>subscribeDocumentChanges(()=>{cancel();setRevision(n=>n+1);}),[]);
  useEffect(()=>()=>{sequence.current++;if(plan.current)discardCadPlan(plan.current);},[]);
  const x=parseLength(u),y=parseLength(v),r=parseLength(radius),angle=parseAngle(rotation),count=/^\d+$/.test(sides.trim())?Number(sides):NaN;
  const polygon=x===null||y===null||r===null||angle===null?{ok:false as const,reason:"Enter centre and radius in mm / cm / m / in / ft; angle in deg / rad."}:regularPolygon([x,y],count,r,mode,angle);
  const sketch=session.sketchId?cadDocument.sketches?.[session.sketchId]:undefined;
  const validPlane=!session.sketchId||Boolean(sketch&&(!sketch.facePlaneId||sketch.faceStatus==="resolved"));
  const points=polygon.ok&&validPlane?polygon.points.map(p=>planeToWorld(p,sketch?sketchPlane(sketch):WORK_PLANES[session.workPlane])):[];
  latest.current={points,project};
  useEffect(()=>{let frame:number,previous="";const draw=()=>{const p=latest.current.points.map(latest.current.project),signature=JSON.stringify(p);if(signature!==previous){previous=signature;setPath(p);}frame=requestAnimationFrame(draw);};draw();return()=>cancelAnimationFrame(frame);},[]);
  const key=JSON.stringify([u,v,sides,radius,rotation,mode,revision]);
  const interaction=commandInteraction({command:"Regular polygon",draftKey:key,reviewedKey,preview:review,pending:busy,targets:[],idle:!busy&&!review});
  async function preview(){
    if(!polygon.ok||!validPlane)return;cancel();const ticket=++sequence.current;setBusy(true);setError("");
    try{const next=await previewCadCommand({type:"create-regular-polygon",id:session.id,center:[x!,y!],sides:count,radius:r!,radiusMode:mode,rotation:angle!,workPlane:session.workPlane,layerId:session.layerId,sketchId:session.sketchId});
      if(ticket!==sequence.current){discardCadPlan(next.planId);return;}plan.current=next.planId;setReview(next);setReviewedKey(key);if(!next.result.ok)setError(next.result.reason??"Polygon rejected.");
    }catch(cause){if(ticket===sequence.current)setError(String(cause));}finally{if(ticket===sequence.current)setBusy(false);}
  }
  async function apply(){if(!interaction.canApply||!plan.current)return;setBusy(true);try{const result=await applyCadPlan(plan.current);if(!result.ok)throw Error(result.reason);cancel();onApplied(result.createdIds);onClose();}catch(cause){setError(String(cause));setBusy(false);}}
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!busy){e.preventDefault();e.stopImmediatePropagation();onClose();}};window.addEventListener("keydown",escape,true);return()=>window.removeEventListener("keydown",escape,true);},[busy,onClose]);
  const field=(label:string,value:string,set:(v:string)=>void)=><label>{label}<input aria-label={`Polygon ${label.toLowerCase()}`} disabled={busy} value={value} onChange={e=>{cancel();setError("");set(e.target.value);}}/></label>;
  return <>
    <svg className="cad-contour-ghosts" aria-label="Regular polygon preview"><polygon points={path.map(p=>p.join(",")).join(" ")} fill="none" stroke={interaction.canApply?"#61dcac":"#ffc96f"} strokeWidth="2" strokeDasharray={interaction.canApply?undefined:"5 4"}/></svg>
    <form className="cad-contour-tool" aria-label="Regular polygon editor" data-cad-editor="true" onSubmit={e=>{e.preventDefault();void apply();}}>
      <div className="cad-tool-body"><strong>Regular Polygon · {session.sketchId?"Sketch":session.workPlane}</strong>
        {field("Centre U",u,setU)}{field("Centre V",v,setV)}{field("Sides",sides,setSides)}{field("Radius",radius,setRadius)}
        <label>Radius type<select aria-label="Polygon radius type" disabled={busy} value={mode} onChange={e=>{cancel();setError("");setMode(e.target.value as PolygonRadiusMode);}}><option value="inscribed">Inscribed · centre to vertex</option><option value="circumscribed">Circumscribed · centre to edge</option></select></label>
        {field("Rotation",rotation,setRotation)}<small>Rotation points to the first {mode==="inscribed"?"vertex":"edge outward normal"}. {3}–{MAX_POLYGON_SIDES} sides. Created as an editable closed polyline.</small>
        {!polygon.ok&&<p role="alert">{polygon.reason}</p>}{!validPlane&&<p role="alert">The target sketch is missing or its face is unresolved.</p>}
        {polygon.ok&&<p data-testid="polygon-measurements">Perimeter: {polygon.perimeter.toFixed(3)} mm · Area: {polygon.area.toFixed(3)} mm²</p>}
        {error&&<p role="alert">{error}</p>}<CommandReview state={interaction}/>
      </div><div className="cad-tool-footer"><button type="button" disabled={!points.length||busy} onClick={()=>onFrame(points)}>Fit polygon preview</button><div>
        <button type="button" disabled={!polygon.ok||!validPlane||busy} onClick={()=>void preview()}>Review polygon</button><button type="submit" disabled={!interaction.canApply}>Apply polygon</button><button type="button" disabled={busy} onClick={onClose}>Cancel polygon</button>
      </div></div>
    </form>
  </>;
}
