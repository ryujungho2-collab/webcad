import { CAD_PRECISION, evaluateVariables, type CadDocument, type Sketch, type SketchConstraint } from "@agent-webcad/cad-document";
import type { CadCommand } from "@agent-webcad/cad-commands";
import { canvasDimensionDriver } from "./canvasDimensionEdit";
import type { DocumentVersion } from "./documentSession";
import { editSketchPointGeometry, editSketchSegmentGeometry } from "../precision/sketchGripEditing";
import { controlSketchGrip, type SketchGripMotion } from "../precision/sketchGripMotion";
import { editDrawingControlParams, editDrawingSegmentParams } from "../features/drawing-editing/geometry/drawingOperations";
import { sketchDimensionName } from "../precision/sketchAnnotations";
import { drawingModelToWorld, drawingTransformAfterEdit, getWorldDrawingGeometry } from "../precision/worldGeometry";
import { WORK_PLANES, planeToWorld, worldToPlane, type Vec3 } from "../precision/workPlane";
import { sketchPlane } from "../precision/sketchAdapter";

export type DirectEditRequest={objectId:string;target:{kind:"control";id:string;point:Vec3}|{kind:"segment";id:string;delta:Vec3};startWorld:Vec3;targetWorld:Vec3};
export type DirectEditSession={id:string;baseVersion:DocumentVersion;request:DirectEditRequest;phase:"dragging"|"review";snap:string;input?:"keyboard"};
export type DirectEditMode="drivers"|"geometry"|"connected";
export type DirectIntentPlan={command:CadCommand;label:string;sketchId?:string;requestedSketch?:Sketch;requestedPath?:Vec3[];motion?:SketchGripMotion;controlledRequest?:DirectEditRequest;drivers:{constraintId:string;label:string;before:number;after:number}[]};

/** Keep dependencies when a numeric grip adjusts a formula rather than replacing its equation. */
function driverValueCommand(document:CadDocument,sketch:Sketch,constraint:SketchConstraint,value:number){
  if(!("value" in constraint)||typeof constraint.value!=="number")throw new Error("Numeric driver required.");
  const driver=canvasDimensionDriver(document,sketch,constraint),delta=Number((value-constraint.value).toFixed(6));
  if(driver.kind==="binding")return driver.command(`(${driver.draft}) + (${delta}mm)`);
  const command=driver.command(`${value}mm`);
  if(command.type==="set-variable"&&evaluateVariables(document.variables)[command.name].dependencies.length)return driver.command(`(${driver.draft}) + (${delta}mm)`);
  return command;
}

/** Pure intent: neither pointer movement nor planning changes the document. */
export function planDirectEdit(document:CadDocument,request:DirectEditRequest,mode:DirectEditMode="drivers"):DirectIntentPlan {
  const object=document.objects[request.objectId],feature=Object.values(document.features).find(f=>f.output===request.objectId);
  if(!object?.visible||feature?.type!=="drawing"||!document.layers[object.layerId]?.visible||document.layers[object.layerId].locked)throw new Error("The drawing source is hidden, locked or unavailable.");
  const target=request.target,drivers:DirectIntentPlan["drivers"]=[];
  const sketchId=typeof feature.params.sketchId==="string"?feature.params.sketchId:undefined;
  if(!sketchId){
    const params=target.kind==="control"?editDrawingControlParams(feature.params,target.id,target.point):editDrawingSegmentParams(feature.params,target.id,target.delta);
    if(!params)throw new Error("Move the handle to a valid new position.");
    return {command:target.kind==="control"?{type:"edit-drawing-control",objectId:object.id,controlId:target.id,point:target.point}:{type:"edit-drawing-segment",objectId:object.id,segmentId:target.id,delta:target.delta},
      label:target.kind==="control"?"Edit drawing handle":"Edit drawing segment",drivers,requestedPath:getWorldDrawingGeometry({...object,transform:drawingTransformAfterEdit(object,feature,params)},{...feature,params})?.points};
  }
  const sketch=document.sketches?.[sketchId],geometry=sketch?.geometry.find(g=>g.id===object.id);
  if(!sketch||!geometry)throw new Error("Sketch source is unavailable.");
  if(sketch.facePlaneId)throw new Error("Edit face sketch dimensions in the Sketch inspector; free direct grips on an attached face are not available yet.");
  const plane=sketchPlane(sketch);
  const coordinates=worldToPlane(target.kind==="control"?target.point:target.delta,plane);
  const motion=controlSketchGrip(sketch,geometry,target,coordinates,mode==="drivers",mode==="connected");
  if(motion.dof>0&&!motion.geometry)throw new Error("No valid movement was found for this handle. Adjust the target or inspect its constraints.");
  const controlled=motion.geometry?adjustDirectRequest(document,request,...(target.kind==="control"?motion.point:[motion.point[0]-motion.origin[0],motion.point[1]-motion.origin[1]]) as [number,number]):request;
  const rawGeometry=target.kind==="control"?editSketchPointGeometry(geometry,target.id,coordinates):editSketchSegmentGeometry(geometry,target.id,coordinates);
  const requestedGeometry=motion.geometry??rawGeometry;
  if(!requestedGeometry)throw new Error("Move the handle to a valid new position.");
  const requestedSketch=structuredClone(sketch);requestedSketch.geometry=requestedSketch.geometry.map(g=>g.id===object.id?(rawGeometry??requestedGeometry):g);
  const geometryCommand:CadCommand=controlled.target.kind==="control"?{type:"move-sketch-point",sketchId,point:{geometryId:object.id,pointId:target.id},position:worldToPlane(controlled.target.point,plane),...(mode==="connected"?{behavior:"solve-connected" as const}:{})}:{type:"move-sketch-segment",sketchId,geometryId:object.id,segmentId:target.id,delta:worldToPlane(controlled.target.delta,plane)};
  const commands:Exclude<CadCommand,{type:"batch"}>[]=[];
  const add=(constraint:SketchConstraint,value:number)=>{
    value=Number(value.toFixed(6));
    const before="value" in constraint&&typeof constraint.value==="number"?constraint.value:NaN;
    if(Math.abs(value-before)<=CAD_PRECISION.linearTolerance)return;
    const command=driverValueCommand(document,sketch,constraint,value);if(command.type==="batch")throw new Error("Nested driver edits are unsupported.");
    const same=commands.find(c=>c.type==="set-variable"&&command.type==="set-variable"&&c.name===command.name);
    if(same&&JSON.stringify(same)!==JSON.stringify(command))throw new Error("These dimensions share a variable. Edit its equation or resize along one axis.");
    if(!same)commands.push(command);
    drivers.push({constraintId:constraint.id,label:canvasDimensionDriver(document,sketch,constraint).label,before,after:value});
  };
  let covered=true;
  if(mode==="drivers"&&geometry.kind==="rectangle"&&requestedGeometry.kind==="rectangle"&&Math.hypot(...geometry.origin.map((v,i)=>v-requestedGeometry.origin[i]))<=CAD_PRECISION.linearTolerance){
    for(const [name,key] of [["Width","width"],["Height","height"]] as const){
      if(Math.abs(geometry[key]-requestedGeometry[key])<=CAD_PRECISION.linearTolerance)continue;
      const dimension=sketch.constraints.find(c=>c.kind==="distance"&&c.first.geometryId===object.id&&c.second.geometryId===object.id&&sketchDimensionName(sketch,c)===name);
      if(dimension)add(dimension,requestedGeometry[key]);else covered=false;
    }
  }else if(mode==="drivers"&&geometry.kind==="circle"&&requestedGeometry.kind==="circle"&&target.kind==="control"&&target.id===`${geometry.id}:radius:0`){
    const dimension=sketch.constraints.find(c=>(c.kind==="radius"||c.kind==="diameter")&&c.geometryId===object.id);
    if(dimension)add(dimension,requestedGeometry.radius*(dimension.kind==="diameter"?2:1));
  }
  if(!commands.length||!covered){commands.push(geometryCommand);}
  return {command:commands.length===1?commands[0]:{type:"batch",label:"Resize through driving dimensions",commands},sketchId,requestedSketch,drivers,motion,controlledRequest:controlled,
    label:drivers.length?`Resize via ${drivers.map(d=>sketchDimensionName(sketch,sketch.constraints.find(c=>c.id===d.constraintId)!)).join(" + ")}`:mode==="connected"?"Move point · let constrained geometry follow":target.kind==="control"?"Move sketch handle · keep dimensions":"Move sketch segment · keep dimensions"};
}

export function directEditWithReleases(command:CadCommand,sketchId:string|undefined,ids:string[]):CadCommand {
  if(!ids.length)return command;if(!sketchId)throw new Error("Only sketch constraints can be released.");
  const children=command.type==="batch"?command.commands:[command];
  return {type:"batch",label:"Direct edit and release selected constraints",commands:[...ids.map(constraintId=>({type:"remove-sketch-constraint" as const,sketchId,constraintId})),...children]};
}

export function directRequestCoordinates(document:CadDocument,request:DirectEditRequest){
  const feature=Object.values(document.features).find(f=>f.output===request.objectId)!;
  const plane=WORK_PLANES[feature.params.workPlane==="XZ"||feature.params.workPlane==="YZ"?feature.params.workPlane:"XY"];
  return worldToPlane(request.target.kind==="control"?request.target.point:request.target.delta,plane);
}

export function adjustDirectRequest(document:CadDocument,request:DirectEditRequest,x:number,y:number):DirectEditRequest {
  const object=document.objects[request.objectId],feature=Object.values(document.features).find(f=>f.output===request.objectId)!;
  const plane=WORK_PLANES[feature.params.workPlane==="XZ"||feature.params.workPlane==="YZ"?feature.params.workPlane:"XY"];
  const original=request.target.kind==="control"?request.target.point:request.target.delta;
  const normal=plane.normal.findIndex(v=>v!==0),value=planeToWorld([x,y],plane);value[normal]=original[normal];
  if(request.target.kind==="control")return {...request,target:{...request.target,point:value},targetWorld:drawingModelToWorld(object,feature,value)!};
  const origin=drawingModelToWorld(object,feature,[0,0,0])!,end=drawingModelToWorld(object,feature,value)!;
  return {...request,target:{...request.target,delta:value},targetWorld:request.startWorld.map((v,i)=>v+end[i]-origin[i]) as Vec3};
}
