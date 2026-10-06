import * as THREE from "three";
import type {CadDocument,CadFeature,CadPatternInstance,CadPatternSpec} from "@agent-webcad/cad-document";
import {CAD_PRECISION} from "@agent-webcad/cad-document";
import {drawingModelToWorld,drawingPlaneScale,getWorldDrawingGeometry} from "./worldGeometry";
import {getObjectTransform} from "./objectTransform";
import {createDrawingTopology,type DrawingTopology} from "./drawingTopology";
import {WORK_PLANES,worldToPlane,planeToWorld,type Vec3} from "./workPlane";

/** Rigid pattern operations preserve exact arcs and bulges, rather than their display tessellation. */
export function patternPoint(point:[number,number],spec:CadPatternSpec,index:number):[number,number]{
  const [x,y]=point;
  if(spec.kind==="linear")return [x+(index%spec.columns)*spec.spacing[0],y+Math.floor(index/spec.columns)*spec.spacing[1]];
  if(spec.kind==="radial"){
    const a=spec.angle*index*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-spec.center[0],dy=y-spec.center[1];
    return [spec.center[0]+dx*c-dy*s,spec.center[1]+dx*s+dy*c];
  }
  const dx=spec.axisEnd[0]-spec.axisStart[0],dy=spec.axisEnd[1]-spec.axisStart[1];
  const t=((x-spec.axisStart[0])*dx+(y-spec.axisStart[1])*dy)/(dx*dx+dy*dy);
  return [2*(spec.axisStart[0]+t*dx)-x,2*(spec.axisStart[1]+t*dy)-y];
}

export function buildPatternDrawingParams(document:CadDocument,instance:CadPatternInstance,outputId:string,features?:ReadonlyMap<string,CadFeature>):Record<string,unknown>{
  const source=features?.get(instance.sourceId)??Object.values(document.features).find(f=>f.output===instance.sourceId);
  const object=document.objects[instance.sourceId];
  if(!source||!object||source.type!=="drawing")throw new Error("Patterns require drawing or sketch curves.");
  const world=getWorldDrawingGeometry(object,source),spec=instance.spec,plane=WORK_PLANES[spec.workPlane];
  if(!world||world.workPlane!==spec.workPlane||!world.planeAligned)throw new Error("Pattern sources must share the selected work plane.");
  const onPlane=(p:Vec3)=>Math.abs(p.reduce((sum,v,i)=>sum+(v-plane.origin[i])*plane.normal[i],0))<=CAD_PRECISION.linearTolerance;
  if((world.center&&!onPlane(world.center))||world.points?.some(p=>!onPlane(p)))throw new Error("Pattern curves must lie on the selected work plane.");
  const transform=getObjectTransform(object,source),normal=new THREE.Vector3(...plane.normal);
  const rotated=normal.clone().applyEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as Vec3));
  const orientation=drawingPlaneScale(transform.scale,spec.workPlane).orientation*Math.sign(rotated.dot(normal));
  const curved=world.kind==="circle"||world.kind==="arc"||Array.isArray(source.params.bulges)&&source.params.bulges.some(v=>Math.abs(Number(v))>1e-9);
  if(curved&&!world.uniformScale)throw new Error("Curved patterns require uniform in-plane scale.");
  const map=(p:Vec3):Vec3=>{
    const result=planeToWorld(patternPoint(worldToPlane(p,plane),spec,instance.index),plane);
    const elevation=p.reduce((sum,v,i)=>sum+(v-plane.origin[i])*plane.normal[i],0);
    return result.map((v,i)=>v+elevation*plane.normal[i]) as Vec3;
  };
  const params:Record<string,unknown>={kind:world.kind,workPlane:spec.workPlane};
  if(source.params.construction)params.construction=true;
  if(Array.isArray(source.params.points)){
    params.points=(source.params.points as Vec3[]).map(p=>map(drawingModelToWorld(object,source,p)!));
    if(source.params.closed!==undefined)params.closed=source.params.closed;
    if(Array.isArray(source.params.bulges))params.bulges=source.params.bulges.map(b=>Number(b)*orientation*(spec.kind==="mirror"?-1:1));
  }else{
    if(!world.center||!world.radius)throw new Error("Invalid curved source.");
    const center=map(world.center);params.center=center;params.radius=world.radius;
    if(world.kind==="arc"){
      const start=map(world.points![0]),c=worldToPlane(center,plane),p=worldToPlane(start,plane);
      const a=Math.atan2(p[1]-c[1],p[0]-c[0]);
      params.startAngle=a;params.endAngle=a+(Number(source.params.endAngle)-Number(source.params.startAngle))*orientation*(spec.kind==="mirror"?-1:1);
    }
  }
  const topology=structuredClone(source.params.topology??createDrawingTopology(world.kind,source.params,source.id)) as DrawingTopology;
  const scope=(id:string)=>`${outputId}:${id}`;
  for(const control of topology.controls)control.id=scope(control.id);
  for(const segment of topology.segments){segment.id=scope(segment.id);segment.startControlId=scope(segment.startControlId);segment.endControlId=scope(segment.endControlId);}
  for(const curve of topology.curves)curve.id=scope(curve.id);
  params.topology=topology;
  return params;
}
