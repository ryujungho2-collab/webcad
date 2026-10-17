import type {CadDocument} from "@agent-webcad/cad-document";
import {linearToleranceAt} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {regularPolygon} from "../precision/regularPolygon";
import {WORK_PLANES,planeToWorld} from "../precision/workPlane";
import {drawingToSketchGeometry,sketchPlane} from "../precision/sketchAdapter";

export function registerRegularPolygonCommands(bus:CommandBus,document:CadDocument){
  bus.registerHandler("create-regular-polygon",async command=>{
    if(command.type!=="create-regular-polygon")return;
    const sketch=command.sketchId?document.sketches?.[command.sketchId]:undefined;
    if(command.sketchId&&!sketch)return {accepted:false,reason:"The target sketch is missing."};
    if(sketch&&(sketch.workPlane!==command.workPlane||sketch.facePlaneId&&sketch.faceStatus!=="resolved"))return {accepted:false,reason:"The target sketch work plane is different or unresolved."};
    const polygon=regularPolygon(command.center,command.sides,command.radius,command.radiusMode,command.rotation);
    if(!polygon.ok)return {accepted:false,reason:polygon.reason};
    const plane=sketch?sketchPlane(sketch):WORK_PLANES[command.workPlane],points=polygon.points.map(p=>planeToWorld(p,plane));
    if(points.some((p,i)=>!p.every(Number.isFinite)||Math.hypot(...p.map((v,j)=>v-points[(i+1)%points.length][j]))<=linearToleranceAt(...p,...points[(i+1)%points.length])))return {accepted:false,reason:"Polygon edges collapse on the target work plane."};
    const id=command.id??`polygon-${crypto.randomUUID()}`,params={points,closed:true,workPlane:command.workPlane};
    if(sketch){
      const geometry=drawingToSketchGeometry(sketch,"polyline",params,id);
      if(!geometry)return {accepted:false,reason:"Polygon cannot be represented on the sketch plane."};
      return bus.dispatch({type:"add-sketch-geometry",sketchId:sketch.id,geometry});
    }
    return bus.dispatch({type:"create-drawing",drawing:"polyline",id,params,layerId:command.layerId,name:"Regular polygon"});
  });
}
