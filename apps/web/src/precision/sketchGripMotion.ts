import { CAD_PRECISION, type Sketch, type SketchGeometry, type SketchPoint } from "@agent-webcad/cad-document";
import { geometryPointIds } from "./sketchEditing";
import { editSketchPointGeometry, editSketchSegmentGeometry } from "./sketchGripEditing";
import { sketchDimensionName } from "./sketchAnnotations";
import { sketchGripFreedom, sketchPoint, solveSketch, type SketchMotionRestriction } from "./sketchSolver";
import { projectPointToArc } from "./sketchArcRelations";

export type SketchGripTarget={kind:"control"|"segment";id:string};
export type SketchGripMotion={dof:0|1|2;kind:"locked"|"line"|"orbit"|"free"|"local";origin:SketchPoint;direction:SketchPoint;
  point:SketchPoint;projected:boolean;unchanged:boolean;driverIds:string[];constraintIds:string[];orbit?:{center:SketchPoint;radius:number;arc?:Extract<SketchGeometry,{kind:"arc"}>};geometry?:SketchGeometry};
const tolerance=CAD_PRECISION.linearTolerance;
const subtract=(a:SketchPoint,b:SketchPoint):SketchPoint=>[a[0]-b[0],a[1]-b[1]];
const distance=(a:SketchPoint,b:SketchPoint)=>Math.hypot(...subtract(a,b));

/** Only the dimensions this grip declares editable may be omitted from motion analysis. */
export function gripDriverIds(sketch:Sketch,g:SketchGeometry,target:SketchGripTarget,drivers:boolean){
  if(!drivers)return [];
  if(g.kind==="circle"&&target.kind==="control"&&target.id===`${g.id}:radius:0`){const c=sketch.constraints.find(c=>(c.kind==="radius"||c.kind==="diameter")&&c.geometryId===g.id);return c?[c.id]:[];}
  if(g.kind!=="rectangle")return [];
  const index=(target.kind==="control"?g.cornerIds:g.edgeIds).indexOf(target.id);
  const names=target.kind==="control"?index===2?["Width","Height"]:index===1?["Width"]:index===3?["Height"]:[]:index===1?["Width"]:index===2?["Height"]:[];
  return names.flatMap(name=>{const c=sketch.constraints.find(c=>c.kind==="distance"&&c.first.geometryId===g.id&&c.second.geometryId===g.id&&sketchDimensionName(sketch,c)===name);return c?[c.id]:[];});
}

function gripPoints(g:SketchGeometry,target:SketchGripTarget):string[]{
  if(target.kind==="control")return [target.id];
  if(g.kind==="line"&&g.segmentId===target.id)return [g.startId,g.endId];
  if(g.kind==="polyline"){const index=g.segmentIds.indexOf(target.id);return index<0?[]:[g.vertices[index].id,g.vertices[(index+1)%g.vertices.length].id];}
  if(g.kind==="rectangle"){const index=g.edgeIds.indexOf(target.id);return index<0?[]:[g.cornerIds[index],g.cornerIds[(index+1)%4]];}
  return [];
}

export function sketchGripPosition(g:SketchGeometry,target:SketchGripTarget):SketchPoint {
  const points=gripPoints(g,target).map(id=>sketchPoint(g,id)!);
  return [points.reduce((sum,p)=>sum+p[0],0)/points.length,points.reduce((sum,p)=>sum+p[1],0)/points.length];
}

/** Project the pointer onto the grip's feasible motion, retaining every non-driver relation. */
export function controlSketchGrip(sketch:Sketch,g:SketchGeometry,target:SketchGripTarget,requested:SketchPoint,drivers:boolean,followConnected=false):SketchGripMotion {
  if(followConnected&&(target.kind!=="control"||!["line","polyline"].includes(g.kind)))throw new Error("Connected-point editing currently supports line/polyline vertices.");
  const points=gripPoints(g,target);if(!points.length||points.some(id=>!sketchPoint(g,id)))throw new Error("Grip topology is unavailable.");
  const pointOf=(entity:SketchGeometry)=>sketchGripPosition(entity,target);
  const origin=pointOf(g),desired:SketchPoint=target.kind==="control"?requested:[origin[0]+requested[0],origin[1]+requested[1]];
  const driverIds=gripDriverIds(sketch,g,target,drivers),analysis=structuredClone(sketch);
  analysis.constraints=analysis.constraints.filter(c=>!driverIds.includes(c.id));analysis.dimensions=analysis.dimensions.filter(d=>!driverIds.includes(d.constraintId));
  const anchorIds:string[]=[];const invariants:((entity:SketchGeometry)=>number[])[]=[];
  if(g.kind==="rectangle"){
    const index=(target.kind==="control"?g.cornerIds:g.edgeIds).indexOf(target.id);
    if(drivers&&target.kind==="control"&&(index===1||index===3))anchorIds.push(g.cornerIds[0],g.cornerIds[index===1?3:1]);
    else if(target.kind==="control")anchorIds.push(g.cornerIds[(index+2)%4]);
    else anchorIds.push(g.cornerIds[(index+2)%4],g.cornerIds[(index+3)%4]);
  }else if(g.kind==="line"||g.kind==="polyline"){
    if(!followConnected)anchorIds.push(...geometryPointIds(g).filter(id=>!points.includes(id)));
    if(target.kind==="segment"){
      const vector=subtract(sketchPoint(g,points[1])!,sketchPoint(g,points[0])!);
      invariants.push(entity=>subtract(subtract(sketchPoint(entity,points[1])!,sketchPoint(entity,points[0])!),vector));
    }
  }else if(g.kind==="circle"){
    if(target.id===g.centerId)invariants.push(entity=>[entity.kind==="circle"?entity.radius-g.radius:NaN]);
    else anchorIds.push(g.centerId);
  }else if(g.kind==="arc"){
    if(target.id===g.centerId)invariants.push(entity=>entity.kind==="arc"?[entity.radius-g.radius,(entity.startAngle-g.startAngle)*g.radius,(entity.endAngle-g.endAngle)*g.radius]:[NaN]);
    else {anchorIds.push(g.centerId);invariants.push(entity=>entity.kind==="arc"?[(target.id===g.startId?entity.endAngle-g.endAngle:entity.startAngle-g.startAngle)*g.radius]:[NaN]);}
  }
  const anchors=anchorIds.map(id=>({id,point:sketchPoint(g,id)!}));
  const restriction:SketchMotionRestriction={geometryId:g.id,residual:entity=>[...anchors.flatMap(a=>subtract(sketchPoint(entity,a.id)!,a.point)),...invariants.flatMap(fn=>fn(entity))]};
  const freedom=sketchGripFreedom(analysis,restriction,pointOf);
  let orbit:SketchGripMotion["orbit"];
  if(target.kind==="control"&&freedom.dof===1){
    if(g.kind==="arc"&&target.id!==g.centerId&&analysis.constraints.some(c=>(c.kind==="radius"||c.kind==="diameter")&&c.geometryId===g.id))orbit={center:g.center,radius:g.radius};
    else for(const c of analysis.constraints){if(c.kind!=="distance")continue;
      const selected=c.first.geometryId===g.id&&c.first.pointId===target.id?c.second:c.second.geometryId===g.id&&c.second.pointId===target.id?c.first:undefined;
      if(!selected)continue;
      const fixed=selected.geometryId===g.id&&anchorIds.includes(selected.pointId)||analysis.constraints.some(a=>a.kind==="fixed-point"&&a.point.geometryId===selected.geometryId&&a.point.pointId===selected.pointId);
      const entity=analysis.geometry.find(e=>e.id===selected.geometryId),center=entity&&sketchPoint(entity,selected.pointId);
      if(fixed&&center){orbit={center,radius:c.value};break;}
    }
    if(!orbit)for(const c of analysis.constraints){
      const curveId=(c.kind==="point-on-circle"||c.kind==="point-on-arc")&&c.point.geometryId===g.id&&c.point.pointId===target.id?c.curveId
        :c.kind==="tangent-circles"&&g.kind==="circle"&&target.id===g.centerId?(c.firstCurveId===g.id?c.secondCurveId:c.secondCurveId===g.id?c.firstCurveId:undefined):undefined;
      const curve=analysis.geometry.find(e=>e.id===curveId);
      if(curve?.kind!=="circle"&&curve?.kind!=="arc")continue;
      const centerFixed=analysis.constraints.some(a=>a.kind==="fixed-point"&&a.point.geometryId===curve.id&&a.point.pointId===curve.centerId);
      const radiusFixed=analysis.constraints.some(a=>(a.kind==="radius"||a.kind==="diameter")&&a.geometryId===curve.id)||curve.kind==="arc"&&[curve.startId,curve.endId].every(pointId=>analysis.constraints.some(a=>a.kind==="fixed-point"&&a.point.geometryId===curve.id&&a.point.pointId===pointId));
      if(centerFixed&&radiusFixed){const radius=c.kind==="tangent-circles"&&g.kind==="circle"?(c.contact==="external"?curve.radius+g.radius:Math.abs(curve.radius-g.radius)):curve.radius;orbit={center:curve.center,radius,...(c.kind==="point-on-arc"&&curve.kind==="arc"?{arc:curve}:{})};break;}
    }
  }
  // A nonlocal distance/angle relation may curve. Its line is explicitly a local tangent.
  const nonlinear=analysis.constraints.some(c=>freedom.constraintIds.includes(c.id)&&["distance","angle","radius","diameter","equal-length","point-on-circle","point-on-arc","tangent-circles","tangent-line","parallel","perpendicular","symmetric"].includes(c.kind));
  const kind:SketchGripMotion["kind"]=freedom.dof===0?"locked":freedom.dof===2?"free":orbit?"orbit":nonlinear&&g.kind!=="rectangle"&&!(g.kind==="circle"&&target.id!==g.centerId)?"local":"line";
  const motion:SketchGripMotion={...freedom,kind,origin,point:origin,projected:distance(desired,origin)>tolerance,unchanged:true,driverIds,orbit};
  if(freedom.dof===0)return motion;
  let point=desired;
  if(orbit){const delta=subtract(desired,orbit.center),length=Math.hypot(...delta);point=length>tolerance?[orbit.center[0]+delta[0]*orbit.radius/length,orbit.center[1]+delta[1]*orbit.radius/length]:origin;if(orbit.arc)point=projectPointToArc(orbit.arc,point);}
  else if(freedom.dof===1){const delta=subtract(desired,origin),along=delta[0]*freedom.direction[0]+delta[1]*freedom.direction[1];point=[origin[0]+along*freedom.direction[0],origin[1]+along*freedom.direction[1]];}
  const make=(position:SketchPoint)=>target.kind==="control"?editSketchPointGeometry(g,target.id,position):editSketchSegmentGeometry(g,target.id,subtract(position,origin));
  if(g.kind==="circle"&&target.id===`${g.id}:radius:0`&&point[0]<=g.center[0]+tolerance)throw new Error("The radius handle must stay on the positive radial direction.");
  const candidate=make(point);if(!candidate)return motion;
  analysis.geometry=analysis.geometry.map(entity=>entity.id===g.id?candidate:entity);
  // Follow the controlled target exactly; otherwise a coincident neighbor would absorb
  // half the drag in the solver's least-squares correction. Only unknown curved paths
  // need a second solve without the tangent target to find a feasible point.
  let solved=solveSketch(analysis,{geometryId:g.id,residual:entity=>[...restriction.residual(entity),...subtract(pointOf(entity),point)]}),exactTarget=solved.ok;
  if(!solved.ok&&kind==="local"){
    const raw=make(desired);if(raw)analysis.geometry=analysis.geometry.map(entity=>entity.id===g.id?raw:entity);
    solved=solveSketch(analysis,restriction);exactTarget=false;
  }
  if(!solved.ok)return motion;
  const actual=solved.sketch.geometry.find(entity=>entity.id===g.id)!,controlled=exactTarget?point:pointOf(actual),represented=make(controlled);
  if(!represented||!followConnected&&geometryPointIds(g).some(id=>distance(sketchPoint(represented,id)!,sketchPoint(actual,id)!)>tolerance))return motion;
  return {...motion,point:controlled,geometry:followConnected||actual.kind==="polyline"?actual:represented,projected:distance(desired,controlled)>tolerance,unchanged:distance(origin,controlled)<=tolerance};
}
