import type {CadDocument} from "@agent-webcad/cad-document";
import {linearToleranceAt} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {threePointCurve} from "../precision/threePointCurve";
import {WORK_PLANES,planeToWorld,worldToWorkPlane} from "../precision/workPlane";
import {drawingToSketchGeometry,sketchPlane} from "../precision/sketchAdapter";

export function registerThreePointCurveCommands(bus:CommandBus,document:CadDocument){
  bus.registerHandler("create-three-point-curve",async command=>{
    if(command.type!=="create-three-point-curve")return;
    const sketch=command.sketchId?document.sketches?.[command.sketchId]:undefined;
    if(command.sketchId&&!sketch)return {accepted:false,reason:"The target sketch is missing."};
    if(sketch&&(sketch.workPlane!==command.workPlane||sketch.facePlaneId&&sketch.faceStatus!=="resolved"))return {accepted:false,reason:"The target sketch work plane is different or unresolved."};
    const plane=sketch?sketchPlane(sketch):WORK_PLANES[command.workPlane],local=command.points.map(p=>worldToWorkPlane(p,plane));
    if(local.some(p=>Math.abs(p[2])>linearToleranceAt(...command.points.flat())))return {accepted:false,reason:"All three points must lie on the target work plane."};
    const result=threePointCurve(local.map(p=>[p[0],p[1]]));
    if(!result.ok)return {accepted:false,reason:result.reason};
    const {center,radius,startAngle,endAngle}=result.curve;
    const params={center:planeToWorld(center,plane),radius,...(command.drawing==="arc"?{startAngle,endAngle}:{}),workPlane:command.workPlane};
    if(sketch){
      const id=command.id??`sketch-${command.drawing}-${crypto.randomUUID()}`,geometry=drawingToSketchGeometry(sketch,command.drawing,params,id);
      if(!geometry)return {accepted:false,reason:"Three-point geometry cannot be represented on the sketch plane."};
      // Acquired points are on the circumference, not the centre. Do not infer centre Coincident constraints.
      return bus.dispatch({type:"add-sketch-geometry",sketchId:sketch.id,geometry});
    }
    return bus.dispatch({type:"create-drawing",drawing:command.drawing,id:command.id,params,layerId:command.layerId});
  });
}
