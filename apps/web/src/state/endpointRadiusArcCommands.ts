import {linearToleranceAt,type CadDocument} from "@agent-webcad/cad-document";
import type {CommandBus,CadCommand} from "@agent-webcad/cad-commands";
import {endpointRadiusArc} from "../precision/endpointRadiusArc";
import {startTangentArc,twoLineTangentCircles} from "../precision/tangentCreation";
import {getWorldDrawingGeometry} from "../precision/worldGeometry";
import {WORK_PLANES,planeToWorld,worldToWorkPlane,type Vec3} from "../precision/workPlane";
import {drawingToSketchGeometry,sketchPlane} from "../precision/sketchAdapter";

type Creation=Extract<CadCommand,{type:"create-endpoint-radius-arc"|"create-start-tangent-arc"|"create-two-line-tangent-circle"}>;
export function registerEndpointRadiusArcCommands(bus:CommandBus,document:CadDocument){
 const create=async(command:Creation)=>{
  const sketch=command.sketchId?document.sketches?.[command.sketchId]:undefined;
  if(command.sketchId&&!sketch)return {accepted:false,reason:"The target sketch is missing."};
  if(sketch&&(sketch.workPlane!==command.workPlane||sketch.facePlaneId&&sketch.faceStatus!=="resolved"))return {accepted:false,reason:"The target sketch work plane is different or unresolved."};
  const layerId=sketch?sketch.layerId:command.layerId??"layer-default",layer=document.layers[layerId];
  if(!layer?.visible||layer.locked)return {accepted:false,reason:"The target drawing layer is missing, hidden or locked."};
  const plane=sketch?sketchPlane(sketch):WORK_PLANES[command.workPlane];
  let params:Record<string,unknown>,kind:"arc"|"circle"="arc";
  if(command.type==="create-two-line-tangent-circle"){
   const lines=command.objectIds.map(id=>{const object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id),sourceLayer=object&&document.layers[object.layerId];
    if(!object?.visible||!sourceLayer?.visible||!feature||feature.type!=="drawing"||feature.params.kind!=="line")throw Error("Choose two visible straight drawing lines.");
    const world=getWorldDrawingGeometry(object,feature);if(!world?.points||world.points.length!==2)throw Error("Invalid straight line controls.");
    const points=world.points.map(p=>worldToWorkPlane(p,plane));if(points.some(p=>Math.abs(p[2])>linearToleranceAt(...world.points!.flat())))throw Error("Both lines must lie on the target work plane.");
    return points.map(p=>[p[0],p[1]] as [number,number]) as [[number,number],[number,number]];
   }) as [[[number,number],[number,number]],[[number,number],[number,number]]];
   const candidate=twoLineTangentCircles(lines,command.radius,command.extend).find(c=>c.branch===command.branch);
   if(!candidate)return {accepted:false,reason:"The selected centre branch has no tangencies within the chosen line domains."};
   kind="circle";params={workPlane:command.workPlane,center:planeToWorld(candidate.center,plane),radius:candidate.radius};
  }else{
   const points=command.points.map(p=>worldToWorkPlane(p,plane));
   if(points.some(p=>Math.abs(p[2])>linearToleranceAt(...command.points.flat())))return {accepted:false,reason:"Both endpoints must lie on the target work plane."};
   const a:[number,number]=[points[0][0],points[0][1]],b:[number,number]=[points[1][0],points[1][1]],result=command.type==="create-start-tangent-arc"?startTangentArc(a,b,command.tangentAngle):endpointRadiusArc(a,b,command.radius,command.centreSide,command.direction);
   if(!result.ok)return {accepted:false,reason:result.reason};
   const {center,radius,startAngle,endAngle}=result.curve;params={center:planeToWorld(center,plane),radius,startAngle,endAngle,workPlane:command.workPlane};
  }
  if(sketch){const id=command.id??`sketch-${kind}-${crypto.randomUUID()}`,geometry=drawingToSketchGeometry(sketch,kind,params,id);if(!geometry)return {accepted:false,reason:"The curve cannot be represented on the target sketch."};return bus.dispatch({type:"add-sketch-geometry",sketchId:sketch.id,geometry});}
  return bus.dispatch({type:"create-drawing",drawing:kind,id:command.id,params,layerId});
 };
 for(const type of ["create-endpoint-radius-arc","create-start-tangent-arc","create-two-line-tangent-circle"] as const)bus.registerHandler(type,command=>create(command as Creation));
}
