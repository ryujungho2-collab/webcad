import {validSolidFinish,validArchitecturalSlab,validComponentContent} from "./ArchitectureContent";
import {validSpline} from "./Spline";
import {validArchitectureWall} from "./ArchitectureWall";
import {validEllipse} from "./Ellipse";
import type { CadFeature } from "./Feature";
import type { GeometryRepresentation } from "./Precision";
import { validVectorStyle } from "./VectorStyle";
import { validImageNodeParams } from "./ImageNode";
import { validAngularParams } from "./AngularDimension";
import { validDimensionStyle } from "./DimensionStyle";
import { validWorkPlaneFrame, validWorkPlaneId } from "./WorkPlane";

export const SOLID_FEATURE_TYPES = ["primitive","extrude","boolean","fillet","chamfer","revolve","sweep","loft","shell"] as const;
export type SolidFeatureType = typeof SOLID_FEATURE_TYPES[number];
export type ParameterContract = { key:string; quantity:"length"|"angle"|"count"|"boolean"|"text"; unit?:"mm"|"deg"|"rad"; minimum?:number; exclusiveMinimum?:number };
export type FeatureContract = { representation:GeometryRepresentation; parameters:ParameterContract[]; supportsExactMeasurement:boolean };
const length=(key:string):ParameterContract=>({key,quantity:"length",unit:"mm",exclusiveMinimum:0});
const primitiveParameters:Record<string,ParameterContract[]>={box:[length("width"),length("depth"),length("height")],cylinder:[length("radius"),length("height")],sphere:[length("radius")],cone:[length("radius1"),length("radius2"),length("height")],torus:[length("majorRadius"),length("minorRadius")]};

export function featureContract(feature:CadFeature):FeatureContract {
  if(feature.params.architecturalSlab||feature.params.componentContent)return {...featureContract({...feature,params:{...feature.params,architecturalSlab:undefined,componentContent:undefined}}),parameters:[]};
  if(feature.params.architecturalWall)return {representation:"brep",parameters:[],supportsExactMeasurement:true};
  const solid=SOLID_FEATURE_TYPES.includes(feature.type as SolidFeatureType);
  let parameters:ParameterContract[]=[];
  if(feature.type === "primitive") parameters=primitiveParameters[String(feature.params.kind??"box")]??[];
  if(feature.type === "extrude") parameters=[{key:"distance",quantity:"length",unit:"mm"}];
  if(feature.type === "fillet") parameters=[length("radius")];
  if(feature.type === "shell") parameters=[length("thickness")];
  if(feature.type === "chamfer") parameters=[length("distance")];
  if(feature.type === "revolve") parameters=[{key:"angle",quantity:"angle",unit:"deg",exclusiveMinimum:0}];
  if(feature.type === "loft") parameters=[{key:"ruled",quantity:"boolean"}];
  if(feature.type === "drawing" && ["circle","arc"].includes(String(feature.params.kind))) parameters=[length("radius")];
  return {representation:solid?"brep":feature.params.kind==="face"?"planar-region":feature.type==="drawing"?"analytic-curve":"annotation",parameters:structuredClone(parameters),supportsExactMeasurement:solid||feature.type==="drawing"||feature.params.kind==="face"};
}

export function validateFeatureParameters(feature:CadFeature):boolean {
  if(feature.params.solidFinish!==undefined&&!validSolidFinish(feature.params.solidFinish))return false;
  if(feature.params.architecturalSlab!==undefined&&!validArchitecturalSlab(feature.params.architecturalSlab))return false;
  if(feature.params.componentContent!==undefined){if(!validComponentContent(feature.params.componentContent))return false;const {componentContent:_,...params}=feature.params;return validateFeatureParameters({...feature,params,inputs:[],dependencyMode:"snapshot"});}
  if(feature.params.architecturalWall!==undefined){const wall=feature.params.architecturalWall;if(!validArchitectureWall(wall)||feature.type!==(wall.openings.length?"boolean":"extrude")||feature.dependencyMode!=="live"||JSON.stringify(feature.inputs)!==JSON.stringify(wall.sourceObjectIds))return false;}
  const source=feature.params.floorPlanSource as Record<string,unknown>|undefined;
  if(source?.layerRoles!==undefined&&(!source.layerRoles||typeof source.layerRoles!=="object"||Array.isArray(source.layerRoles)||!Object.values(source.layerRoles).every(role=>["wall","opening","reference","exclude"].includes(String(role)))))return false;
  if(source?.unitCheck!==undefined){const check=source.unitCheck as Record<string,unknown>;if(!check||typeof check!=="object"||![check.measuredMm,check.expectedMm].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>0)||Math.abs(Number(check.measuredMm)-Number(check.expectedMm))>Math.max(.01,Number(check.expectedMm)*.001))return false;}
  if(source!==undefined&&(!source||typeof source!=="object"||typeof source.sourceName!=="string"||typeof source.sourceTag!=="string"||typeof source.unitMm!=="number"||!Number.isFinite(source.unitMm)||source.unitMm<=0||!Array.isArray(source.originMm)||source.originMm.length!==3||!source.originMm.every(Number.isFinite)||!Array.isArray(source.layers)||!source.layers.every(v=>typeof v==="string")||typeof source.objectId!=="string"||!source.objectId||!Number.isSafeInteger(source.sourceIndex)||Number(source.sourceIndex)<0))return false;
  if(feature.params.profileRegionIds!==undefined&&(feature.type!=="extrude"||!Array.isArray(feature.params.profileRegionIds)||!feature.params.profileRegionIds.length||!feature.params.profileRegionIds.every(id=>typeof id==="string")))return false;
  if(feature.params.kind==="face"){
    const p=feature.params,vec=(v:unknown)=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
    const boundary=(v:any):boolean=>!!v&&typeof v==="object"&&typeof v.id==="string"&&vec(v.normal)&&Array.isArray(v.segments)&&v.segments.length>0&&v.segments.length<=4000&&v.segments.every((s:any)=>s&&s.kind==="circle"?vec(s.center)&&typeof s.radius==="number"&&Number.isFinite(s.radius)&&s.radius>0:s&&(s.kind==="line"||s.kind==="arc")&&vec(s.start)&&vec(s.end)&&(s.kind!=="arc"||vec(s.mid)));
    if(feature.type!=="drafting"||!["XY","XZ","YZ"].includes(String(p.workPlane))||!Array.isArray(p.sourceObjectIds)||!p.sourceObjectIds.length||p.sourceObjectIds.length>4000||!p.sourceObjectIds.every(id=>typeof id==="string")||JSON.stringify(feature.inputs)!==JSON.stringify(p.sourceObjectIds)||!Array.isArray(p.regions)||!p.regions.length||p.regions.length>2000||!p.regions.every((r:any)=>r.workPlane===p.workPlane&&boundary(r)&&(r.holes===undefined||Array.isArray(r.holes)&&r.holes.every(boundary))))return false;
  }
  if(feature.params.modelMeasurementScale!==undefined&&(!Number.isFinite(feature.params.modelMeasurementScale)||Number(feature.params.modelMeasurementScale)<=0))return false;
  if(feature.params.modelDrawingReference!==undefined){const r=feature.params.modelDrawingReference as {viewId?:unknown;sourceToken?:unknown};if(feature.type!=="dimension"||!r||typeof r.viewId!=="string"||typeof r.sourceToken!=="string"||!["resolved","unresolved"].includes(String(feature.params.referenceStatus)))return false;}
  if(feature.params.modelNote!==undefined){const a=feature.params.modelNote as Record<string,unknown>,p=feature.params;if(feature.type!=="drafting"||p.kind!=="leader"||!a||typeof a.sourceObjectId!=="string"||!["center","start","end"].includes(String(a.anchor))||!["live","snapshot"].includes(String(a.mode))||!["text","length","diameter","area"].includes(String(a.quantity))||typeof a.text!=="string"||a.text.length>4000||!Array.isArray(a.point)||a.point.length!==2||!a.point.every(Number.isFinite)||!Number.isFinite(a.height)||Number(a.height)<=0||typeof a.sourceToken!=="string"||!["resolved","unresolved"].includes(String(p.referenceStatus))||!Array.isArray(p.points)||p.points.length<2||!p.points.every(point=>Array.isArray(point)&&point.length===3&&point.every(Number.isFinite))||typeof p.text!=="string"||!p.text.trim()||!Number.isFinite(p.height)||Number(p.height)<=0)return false;}

  if(feature.type==="shell"){
    const p=feature.params,source=p.source as {params?:unknown}|undefined;
    if(p.kind!=="shell"||!Array.isArray(p.faceKeys)||!p.faceKeys.length||!p.faceKeys.every(k=>typeof k==="string"&&k.length>0)||new Set(p.faceKeys).size!==p.faceKeys.length||!source||typeof source!=="object"||!source.params||typeof source.params!=="object"||Array.isArray(source.params)||feature.inputs.length!==(feature.dependencyMode==="snapshot"?0:1)||!["resolved","missing","ambiguous"].includes(String(p.referenceStatus))||Number(p.thickness)<=1e-6)return false;
  }
  if(feature.params.faceHole!==undefined){
    const h=feature.params.faceHole as Record<string,unknown>;
    if(feature.type!=="boolean"||feature.params.operation!=="cut"||!Array.isArray(feature.params.operands)||feature.params.operands.length!==2||typeof h!=="object"||h===null||typeof h.planeId!=="string"||!h.planeId||typeof h.targetId!=="string"||!h.targetId||!Array.isArray(h.center)||h.center.length!==2||!h.center.every(Number.isFinite)||typeof h.diameter!=="number"||!Number.isFinite(h.diameter)||h.diameter<=0||typeof h.depth!=="number"||!Number.isFinite(h.depth)||h.depth<=0||typeof h.through!=="boolean"||!["resolved","missing","ambiguous","non-planar","unsupported"].includes(String(feature.params.faceHoleStatus))||feature.inputs.length!==1||feature.inputs[0]!==h.targetId)return false;
  }
  if(feature.type === "dimension" && feature.params.style !== undefined && !validDimensionStyle(feature.params.style)) return false;
  if(feature.type === "dimension" && feature.params.kind === "angular") return validAngularParams(feature.params);
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
    if(p.facePlaneId!==undefined&&(!validWorkPlaneId(p.facePlaneId)||!validWorkPlaneFrame(p.faceFrame)||typeof p.sketchId!=="string"))return false;
    if(p.workPlane!==undefined&&!["XY","XZ","YZ"].includes(String(p.workPlane)))return false;
    if(p.construction!==undefined&&typeof p.construction!=="boolean")return false;
    if(p.bulges!==undefined&&(!Array.isArray(p.bulges)||!p.bulges.every(Number.isFinite)))return false;
    if(kind === "spline")return validSpline(p);
    if(kind === "ellipse"||kind === "elliptic-arc")return validEllipse(p)&&((kind==="ellipse")===(Math.abs(Math.abs(Number(p.sweep))-2*Math.PI)<1e-9));
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


