import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../app/projectActivity";
import {useEffect,useRef,useState} from "react";
import * as THREE from "three";
import {linearToleranceAt} from "@agent-webcad/cad-document";
import {cadDocument} from "../state/cadDocument";
import {previewCadCommand,applyCadPlan,discardCadPlan,type CadPlanPreview} from "../state/documentPlans";
import {subscribeDocumentChanges} from "../state/documentSession";
import {commandInteraction} from "../state/commandInteraction";
import {CommandReview} from "../ui/CommandReview";
import {PrecisionField} from "../ui/PrecisionField";
import {startTangentArc} from "../precision/tangentCreation";
import {parseAngle,parseLength} from "../precision/units";
import {parsePointEntry} from "../precision/pointInput";
import {endpointRadiusArc,type ArcCentreSide,type ArcDirection} from "../precision/endpointRadiusArc";
import {WORK_PLANES,planeToWorld,worldToPlane,worldToWorkPlane,intersectRayWithWorkPlane,type WorkPlaneId,type Vec3} from "../precision/workPlane";
import {sketchPlane} from "../precision/sketchAdapter";
import {getWorldDrawingGeometry} from "../precision/worldGeometry";
import {querySnap,type SnapEntity} from "../precision/snapEngine";
import {DEFAULT_SNAP_PREFERENCES,snapCaption,type SnapPreferences} from "../precision/snapPreferences";

export type EndpointRadiusArcSession={id:string;workPlane:WorkPlaneId;layerId:string;sketchId?:string;mode?:"tangent"};
type Props={session:EndpointRadiusArcSession;project:(point:Vec3)=>[number,number];getCanvas:()=>HTMLCanvasElement|null;getCamera:()=>THREE.Camera|null;snapEnabled:boolean;snapPreferences:SnapPreferences;constructionVisible:boolean;onClose:()=>void;onApplied:(ids:string[])=>void;onFrame:(points:Vec3[])=>void};
export function EndpointRadiusArcTool(props:Props){
  const {session}=props;
  const tangent=session.mode==="tangent",[angle,setAngle]=useState("0 deg");
  const [start,setStart]=useState("0,0"),[end,setEnd]=useState(tangent?"100,100":"100,0"),[radius,setRadius]=useState("75 mm"),[side,setSide]=useState<ArcCentreSide>("left"),[direction,setDirection]=useState<ArcDirection>("ccw"),[pick,setPick]=useState<0|1>(0);
  const [review,setReview]=useState<CadPlanPreview>(),[reviewedKey,setReviewedKey]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState(""),[revision,setRevision]=useState(0),[path,setPath]=useState<[number,number][]>([]),[marker,setMarker]=useState<[number,number]|null>(null),[snapLabel,setSnapLabel]=useState("");
  const plan=useRef<string|undefined>(undefined),sequence=useRef(0),hover=useRef<Vec3|null>(null),latest=useRef({props,points:[] as Vec3[],busy,pick});
  function cancel(){sequence.current++;if(plan.current)discardCadPlan(plan.current);plan.current=undefined;setReview(undefined);setReviewedKey(undefined);setBusy(false);}
  function change(action:()=>void){cancel();setError("");action();}
  useEffect(()=>subscribeDocumentChanges(()=>{cancel();setRevision(n=>n+1);}),[]);
  useEffect(()=>()=>{sequence.current++;if(plan.current)discardCadPlan(plan.current);},[]);
  const a=parsePointEntry(start),b=parsePointEntry(end,a??undefined),r=parseLength(radius),curve=a&&b&&r!==null?tangent?(parseAngle(angle)===null?{ok:false as const,reason:"Enter a tangent angle in deg/rad."}:startTangentArc(a,b,parseAngle(angle)!*Math.PI/180)):endpointRadiusArc(a,b,r,side,direction):{ok:false as const,reason:"Enter endpoint coordinates (mm / cm / m / in / ft), @relative / @distance<angle, and a positive radius."};
  const sketch=session.sketchId?cadDocument.sketches?.[session.sketchId]:undefined,validPlane=!session.sketchId||Boolean(sketch&&(!sketch.facePlaneId||sketch.faceStatus==="resolved")),plane=sketch?sketchPlane(sketch):WORK_PLANES[session.workPlane];
  const points=curve.ok&&validPlane?Array.from({length:97},(_,i)=>{const angle=curve.curve.startAngle+(curve.curve.endAngle-curve.curve.startAngle)*i/96;return planeToWorld([curve.curve.center[0]+curve.curve.radius*Math.cos(angle),curve.curve.center[1]+curve.curve.radius*Math.sin(angle)],plane);}):[];
  latest.current={props,points,busy,pick};
  useEffect(()=>{let frame:number,previous="";const draw=()=>{const p=latest.current.points.map(latest.current.props.project),m=hover.current?latest.current.props.project(hover.current):null,signature=JSON.stringify([p,m]);if(signature!==previous){previous=signature;setPath(p);setMarker(m);}frame=requestAnimationFrame(draw);};draw();return()=>cancelAnimationFrame(frame);},[]);
  const key=JSON.stringify([start,end,radius,side,direction,angle,revision]);
  const interaction=commandInteraction({command:tangent?"Start tangent arc":"Endpoint radius arc",draftKey:key,reviewedKey,preview:review,pending:busy,targets:[],idle:!busy&&!review});
  async function preview(){if(!curve.ok||!validPlane||!a||!b)return;cancel();const ticket=++sequence.current;setBusy(true);setError("");try{
    const target={id:session.id,points:[planeToWorld(a,plane),planeToWorld(b,plane)] as [Vec3,Vec3],workPlane:session.workPlane,layerId:session.layerId,sketchId:session.sketchId};
    const next=await previewCadCommand(tangent?{type:"create-start-tangent-arc",...target,tangentAngle:parseAngle(angle)!*Math.PI/180}:{type:"create-endpoint-radius-arc",id:session.id,points:[planeToWorld(a,plane),planeToWorld(b,plane)],radius:r!,centreSide:side,direction,workPlane:session.workPlane,layerId:session.layerId,sketchId:session.sketchId});
    if(ticket!==sequence.current){discardCadPlan(next.planId);return;}plan.current=next.planId;setReview(next);setReviewedKey(key);if(!next.result.ok)setError(next.result.reason??"Arc rejected.");
  }catch(cause){if(ticket===sequence.current)setError(String(cause));}finally{if(ticket===sequence.current)setBusy(false);}}
  async function apply(){if(!interaction.canApply||!plan.current)return;setBusy(true);try{const result=await applyCadPlan(plan.current);if(!result.ok)throw Error(result.reason);cancel();props.onApplied(result.createdIds);props.onClose();}catch(cause){setError(String(cause));setBusy(false);}}
  useEffect(()=>{
    const canvas=props.getCanvas();if(!canvas)return;
    const move=(event:PointerEvent)=>{
      if(latest.current.busy||!validPlane)return;const camera=latest.current.props.getCamera();if(!camera)return;
      const rect=canvas.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
      const raw=intersectRayWithWorkPlane(ray.ray.origin.toArray() as Vec3,ray.ray.direction.toArray() as Vec3,plane);if(!raw)return;
      const entities:SnapEntity[]=Object.values(cadDocument.features).flatMap(f=>{const o=cadDocument.objects[f.output],layer=o&&cadDocument.layers[o.layerId];if(f.type!=="drawing"||!o?.visible||layer?.visible===false||f.params.construction&&!latest.current.props.constructionVisible)return [];
        const g=getWorldDrawingGeometry(o,f);if(!g?.points||g.points.some(p=>Math.abs(worldToWorkPlane(p,plane)[2])>linearToleranceAt(...p)))return [];
        return [{objectId:o.id,kind:g.kind as SnapEntity["kind"],points:g.points,center:g.center,radius:g.radius,startAngle:g.startAngle,endAngle:g.endAngle,profileSegments:g.profileSegments}];});
      const snapped=latest.current.props.snapEnabled&&!event.altKey?querySnap({point:raw,referencePoint:pick===1&&a?planeToWorld(a,plane):undefined,entities,plane,...latest.current.props.snapPreferences,project:latest.current.props.project}):null;
      const valid=snapped&&Number.isFinite(snapped.screenDistance)?snapped:null;hover.current=valid?.point??raw;setSnapLabel(valid?snapCaption(valid,cadDocument.objects[valid.objectId??""]?.name):"Coordinate");
    };
    const down=(event:PointerEvent)=>{if(event.button!==0||latest.current.busy)return;move(event);if(!hover.current)return;const value=worldToPlane(hover.current,plane).join(",");change(()=>{if(pick===0){setStart(value);setPick(1);}else setEnd(value);});};
    const leave=()=>{hover.current=null;};canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointerleave",leave);
    return()=>{canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointerleave",leave);};
  },[start,pick,revision,validPlane,session.sketchId]);
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!busy){e.preventDefault();e.stopImmediatePropagation();props.onClose();}};window.addEventListener("keydown",escape,true);return()=>window.removeEventListener("keydown",escape,true);},[busy,props.onClose]);
  const summary=curve.ok?curve.curve:undefined;
  return <>
    <svg className="cad-contour-ghosts" aria-label="Endpoint radius arc preview"><polyline points={path.map(p=>p.join(",")).join(" ")} fill="none" stroke={interaction.canApply?"#61dcac":"#ffc96f"} strokeWidth="2" strokeDasharray={interaction.canApply?undefined:"5 4"}/>{marker&&<g><circle cx={marker[0]} cy={marker[1]} r="7" fill="none" stroke="#ffc96f"/><text x={marker[0]+10} y={marker[1]+18} fill="#ffc96f">{snapLabel}</text></g>}</svg>
    <form className="cad-contour-tool" aria-label="Endpoint radius arc editor" data-cad-editor="true" onSubmit={e=>{e.preventDefault();void apply();}}>
      <div className="cad-tool-body"><strong>{tangent?"Start Tangent Arc":"Endpoint + Radius Arc"} · {session.sketchId?"Sketch":session.workPlane}</strong>
        <PrecisionField label="Start U,V" aria-label="Arc start coordinate" kind="coordinate" value={start} disabled={busy} onChange={v=>change(()=>setStart(v))}/>
        <PrecisionField label="End U,V" aria-label="Arc end coordinate" kind="coordinate" relativeTo={a??undefined} value={end} disabled={busy} onChange={v=>change(()=>setEnd(v))}/>
        {tangent?<><PrecisionField label="Start tangent" aria-label="Arc tangent angle" kind="angle" value={angle} disabled={busy} onChange={v=>change(()=>setAngle(v))}/><button type="button" disabled={busy||parseAngle(angle)===null} onClick={()=>change(()=>setAngle(`${parseAngle(angle)!+180} deg`))}>Reverse start tangent</button></>:<><PrecisionField label="Radius" aria-label="Arc radius" value={radius} min={0} minExclusive disabled={busy} onChange={v=>change(()=>setRadius(v))}/>
        <label>Centre side<select aria-label="Arc centre side" disabled={busy} value={side} onChange={e=>change(()=>setSide(e.target.value as ArcCentreSide))}><option value="left">Left of start → end</option><option value="right">Right of start → end</option></select></label>
        <label>Direction<select aria-label="Arc direction" disabled={busy} value={direction} onChange={e=>change(()=>setDirection(e.target.value as ArcDirection))}><option value="ccw">Counterclockwise (CCW)</option><option value="cw">Clockwise (CW)</option></select></label></>}
        <div><button type="button" disabled={busy} aria-pressed={pick===0} onClick={()=>{setPick(0);props.getCanvas()?.focus();}}>Pick arc start</button><button type="button" disabled={busy} aria-pressed={pick===1} onClick={()=>{setPick(1);props.getCanvas()?.focus();}}>Pick arc end</button></div>
        <small>Pick or enter two endpoints. End accepts @relative / @distance&lt;angle. Alt bypasses snapping. {tangent?"The oriented start tangent determines CW/CCW and minor/major; reversing it selects the complementary sweep.":"Centre side and direction select independent solutions; acquired values create an ordinary editable arc."}</small>
        {!curve.ok&&<p role="alert">{curve.reason}</p>}{!validPlane&&<p role="alert">The target sketch is missing or its face is unresolved.</p>}
        {summary&&<p data-testid="endpoint-radius-arc-summary">Centre U,V: {summary.center.map(v=>Number(v.toFixed(6))).join(", ")} mm · Radius: {summary.radius} mm · Sweep: {((summary.endAngle-summary.startAngle)*180/Math.PI).toFixed(6)}° · {summary.diametric?"Diameter: one centre":Math.abs(summary.endAngle-summary.startAngle)>Math.PI?"Major arc":"Minor arc"}</p>}
        {error&&<p role="alert">{error}</p>}<CommandReview state={interaction}/>
      </div><div className="cad-tool-footer"><button type="button" disabled={!points.length||busy} onClick={()=>props.onFrame(points)}>Fit arc preview</button><div><button type="button" disabled={!curve.ok||!validPlane||busy} onClick={()=>void preview()}>Review arc</button><button type="submit" disabled={!interaction.canApply}>Apply arc</button><button type="button" disabled={busy} onClick={props.onClose}>Cancel arc</button></div></div>
    </form>
  </>;
}
