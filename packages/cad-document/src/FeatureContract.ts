import type { CadFeature } from "./Feature";
import type { GeometryRepresentation } from "./Precision";
import { validVectorStyle } from "./VectorStyle";
import { validImageNodeParams } from "./ImageNode";

export const SOLID_FEATURE_TYPES = ["primitive","extrude","boolean","fillet","chamfer","revolve","sweep","loft"] as const;
export type SolidFeatureType = typeof SOLID_FEATURE_TYPES[number];
export type ParameterContract = { key:string; quantity:"length"|"angle"|"count"|"boolean"|"text"; unit?:"mm"|"deg"|"rad"; minimum?:number; exclusiveMinimum?:number };
export type FeatureContract = { representation:GeometryRepresentation; parameters:ParameterContract[]; supportsExactMeasurement:boolean };
const length=(key:string):ParameterContract=>({key,quantity:"length",unit:"mm",exclusiveMinimum:0});
const primitiveParameters:Record<string,ParameterContract[]>={box:[length("width"),length("depth"),length("height")],cylinder:[length("radius"),length("height")],sphere:[length("radius")],cone:[length("radius1"),length("radius2"),length("height")],torus:[length("majorRadius"),length("minorRadius")]};

export function featureContract(feature:CadFeature):FeatureContract {
  const solid=SOLID_FEATURE_TYPES.includes(feature.type as SolidFeatureType);
  let parameters:ParameterContract[]=[];
  if(feature.type === "primitive") parameters=primitiveParameters[String(feature.params.kind??"box")]??[];
  if(feature.type === "extrude") parameters=[{key:"distance",quantity:"length",unit:"mm"}];
  if(feature.type === "fillet") parameters=[length("radius")];
  if(feature.type === "chamfer") parameters=[length("distance")];
  if(feature.type === "revolve") parameters=[{key:"angle",quantity:"angle",unit:"deg",exclusiveMinimum:0}];
  if(feature.type === "loft") parameters=[{key:"ruled",quantity:"boolean"}];
  if(feature.type === "drawing" && ["circle","arc"].includes(String(feature.params.kind))) parameters=[length("radius")];
  return {representation:solid?"brep":feature.type==="drawing"?"analytic-curve":"annotation",parameters:structuredClone(parameters),supportsExactMeasurement:solid||feature.type==="drawing"};
}

export function validateFeatureParameters(feature:CadFeature):boolean {
  if(feature.type === "image") return validImageNodeParams(feature.params);
  if(feature.params.vectorStyle!==undefined&&(feature.type!=="drawing"||!validVectorStyle(feature.params.vectorStyle)))return false;
  if(feature.type==="primitive"&&!primitiveParameters[String(feature.params.kind??"box")])return false;
  for(const field of featureContract(feature).parameters){
    const value=feature.params[field.key];
    if(field.quantity==="boolean"){if(value!==undefined&&typeof value!=="boolean")return false;continue;}
    if(typeof value!=="number"||!Number.isFinite(value)||field.minimum!==undefined&&value<field.minimum||field.exclusiveMinimum!==undefined&&value<=field.exclusiveMinimum)return false;
  }
  if(feature.type==="primitive"&&feature.params.kind==="torus"&&Number(feature.params.majorRadius)<=Number(feature.params.minorRadius))return false;
  if(feature.type==="extrude"&&Number(feature.params.distance)===0)return false;
  if(feature.type==="revolve"&&Number(feature.params.angle)>360)return false;
  if(feature.type==="drawing"){
    const p=feature.params,vec=(v:unknown):boolean=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
    const kind=String(p.kind);
    if(p.workPlane!==undefined&&!["XY","XZ","YZ"].includes(String(p.workPlane)))return false;
    if(p.construction!==undefined&&typeof p.construction!=="boolean")return false;
    if(p.bulges!==undefined&&(!Array.isArray(p.bulges)||!p.bulges.every(Number.isFinite)))return false;
    if(kind === "point") {
      if (!Array.isArray(p.points) || p.points.length !== 1 || !p.points.every(vec)) return false;
    }else if(["infinite-line","ray"].includes(kind)) {
      if (!Array.isArray(p.points) || p.points.length !== 2 || !p.points.every(vec)) return false;
      const points = p.points as number[][];
      if (Math.hypot(...points[1].map((v,i)=>v-points[0][i])) <= 1e-6) return false;
    }else if(["line","rectangle","polyline"].includes(kind)){
      if(!Array.isArray(p.points)||!p.points.every(vec)||p.points.length<(kind==="rectangle"?4:2)||kind==="line"&&p.points.length!==2||kind==="rectangle"&&p.points.length!==4)return false;
    }else if(["circle","arc"].includes(kind)){
      if(!vec(p.center))return false;
      if(kind==="arc"&&(!Number.isFinite(p.startAngle)||!Number.isFinite(p.endAngle)||p.startAngle===p.endAngle))return false;
    }else return false;
  }
  return true;
}
