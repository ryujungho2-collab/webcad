import * as THREE from "three";
import type { CadDocument, CadFeature, CadObject, CadVectorStyle, LayerStyle } from "@agent-webcad/cad-document";
import { getObjectTransform } from "./objectTransform";
import { getWorldDrawingGeometry } from "./worldGeometry";
import { layerStyle } from "./layerStyle";
import { resolveDimension } from "./dimensionGeometry";
import { profileBoundaryPoints } from "./profileRegions";
import { extractSketchLoops, type SketchLoop } from "./sketchProfiles";
import { planeToWorld, worldToPlane, WORK_PLANES, type Vec3, type WorkPlaneId } from "./workPlane";

export type DraftLine = {points:Vec3[];closed:boolean;style:LayerStyle;vectorStyle?:CadVectorStyle};
export type DraftText = {point:Vec3;text:string;height:number;angle:number;style:LayerStyle;align?:"center"};
export type DraftGeometry = {lines:DraftLine[];texts:DraftText[]};
const vec=(value:unknown):value is Vec3=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const finite=(value:unknown)=>typeof value==="number"&&Number.isFinite(value);
const empty=():DraftGeometry=>({lines:[],texts:[]});

export function validDraftingParams(params:Record<string,unknown>) {
  if (!["XY","XZ","YZ"].includes(String(params.workPlane ?? "XY"))) return false;
  if(params.kind==="text")return typeof params.text==="string"&&params.text.trim().length>0&&params.text.length<=4000&&vec(params.point)&&finite(params.height)&&Number(params.height)>0&&(params.angle===undefined||finite(params.angle));
  if(params.kind==="chain")return Array.isArray(params.points)&&params.points.length>=2&&params.points.length<=100&&params.points.every(vec)&&finite(params.offset)&&finite(params.height)&&Number(params.height)>0&&["horizontal","vertical","aligned"].includes(String(params.orientation));
  if(params.kind==="hatch")return Array.isArray(params.sourceObjectIds)&&params.sourceObjectIds.length>0&&params.sourceObjectIds.every(id=>typeof id==="string")&&finite(params.spacing)&&Number(params.spacing)>0&&finite(params.angle);
  if(params.kind==="floor-plan"){
    const values=[params.width,params.depth,params.wall,params.doorCenter,params.doorWidth,params.windowCenter,params.windowWidth];
    if(!values.every(finite))return false;
    const [w,d,t,dc,dw,wc,ww]=values as number[];
    return params.workPlane==="XY"&&t>0&&w>2*t&&d>2*t&&dw>0&&ww>0&&dc-dw/2>t&&dc+dw/2<w-t&&wc-ww/2>t&&wc+ww/2<w-t;
  }
  return false;
}

export function hatchLines(regions:SketchLoop[],spacing:number,angle:number):Vec3[][] {
  const output:Vec3[][]=[], rad=angle*Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
  const rotate=([x,y]:[number,number]):[number,number]=>[x*cos+y*sin,-x*sin+y*cos];
  const restore=([x,y]:[number,number]):[number,number]=>[x*cos-y*sin,x*sin+y*cos];
  for(const region of regions){
    const rings=[region,...(region.holes??[])].map(profile=>profileBoundaryPoints(profile,region.workPlane).map(rotate));
    const ys=rings.flat().map(p=>p[1]), min=Math.min(...ys),max=Math.max(...ys);
    if((max-min)/spacing>4000)throw new Error("Hatch spacing creates more than 4,000 rows; increase spacing.");
    for(let y=Math.ceil(min/spacing)*spacing;y<max;y+=spacing){
      const xs:number[]=[];
      for(const points of rings)for(let i=0;i<points.length;i++){
        const a=points[i],b=points[(i+1)%points.length];
        if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
      }
      xs.sort((a,b)=>a-b);
      for(let i=0;i+1<xs.length;i+=2)if(xs[i+1]-xs[i]>1e-7)output.push([xs[i],xs[i+1]].map(x=>planeToWorld(restore([x,y]),WORK_PLANES[region.workPlane])));
    }
  }
  return output;
}

/** Jointed wall strips and door/window gaps derive from one editable plan. */
export function floorPlanGeometry(params:Record<string,unknown>,style:LayerStyle):DraftGeometry {
  const width=Number(params.width),depth=Number(params.depth),wall=Number(params.wall),door=Number(params.doorCenter),dw=Number(params.doorWidth),window=Number(params.windowCenter),ww=Number(params.windowWidth);
  const result=empty();
  const path=(points:[number,number][],closed=false)=>result.lines.push({points:points.map(([x,y])=>[x,y,0]),closed,style});
  const rect=(x:number,y:number,w:number,h:number)=>path([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],true);
  // Side strips own the corners; horizontal strips meet their inner faces.
  rect(0,0,wall,depth);rect(width-wall,0,wall,depth);
  rect(wall,0,door-dw/2-wall,wall);rect(door+dw/2,0,width-wall-door-dw/2,wall);
  rect(wall,depth-wall,window-ww/2-wall,wall);rect(window+ww/2,depth-wall,width-wall-window-ww/2,wall);
  path([[window-ww/2,depth-wall/2],[window+ww/2,depth-wall/2]]);
  const hinge=door-dw/2;path([[hinge,wall],[hinge,wall+dw]]);
  path(Array.from({length:33},(_,i)=>[hinge+dw*Math.cos(Math.PI*i/64),wall+dw*Math.sin(Math.PI*i/64)] as [number,number]));
  const chain = chainGeometry({kind:"chain",workPlane:"XY",points:[[0,0,0],[door-dw/2,0,0],[door+dw/2,0,0],[width,0,0]],orientation:"horizontal",offset:-350,height:175},style);
  result.lines.push(...chain.lines);result.texts.push(...chain.texts);
  result.texts.push({point:[width/2,depth/2,0],text:String(params.text??"ROOM"),height:175,angle:0,style,align:"center"});
  return result;
}

function chainGeometry(params:Record<string,unknown>,style:LayerStyle):DraftGeometry {
  const result=empty(),plane=(params.workPlane??"XY") as WorkPlaneId,points=(params.points as Vec3[]).map(p=>worldToPlane(p,WORK_PLANES[plane]));
  const height=Number(params.height),symbolScale=height/4;
  for(let i=0;i+1<points.length;i++){
    const dimension=resolveDimension({kind:"linear",workPlane:plane,points:[points[i],points[i+1]],offset:params.offset,orientation:params.orientation,symbolScale});
    if(dimension){result.lines.push(...dimension.segments.map(pair=>({points:pair,closed:false,style})));const point=dimension.textPosition.map((v,j)=>v-(Number(params.offset)<0?WORK_PLANES[plane].yAxis[j]*height:0)) as Vec3;result.texts.push({point,text:dimension.text,height,angle:0,style,align:"center"});}
  }
  return result;
}

export function localDraftingGeometry(document:CadDocument,params:Record<string,unknown>,style:LayerStyle,componentPath=new Set<string>()):DraftGeometry {
  if(params.kind==="text")return {lines:[],texts:[{point:params.point as Vec3,text:String(params.text),height:Number(params.height),angle:Number(params.angle??0),style,...(params.align==="center"?{align:"center" as const}:{})}]};
  if(params.kind==="chain")return chainGeometry(params,style);
  if(params.kind==="floor-plan")return floorPlanGeometry(params,style);
  if(params.kind==="hatch")return {texts:[],lines:hatchLines(params.regions as SketchLoop[],Number(params.spacing),Number(params.angle)).map(points=>({points,closed:false,style}))};
  if(params.kind==="block"){
    const block=document.blocks?.[String(params.blockId)], result=empty();
    if(!block||componentPath.has(block.id))return result;
    const nextPath=new Set(componentPath);nextPath.add(block.id);
    for(const member of block.members){
      const object:CadObject={id:"member",geometryId:"member",name:"member",visible:true,layerId:member.layerId,transform:member.transform};
      const feature:CadFeature={id:"member",type:member.type,inputs:[],output:"member",params:member.params};
      const data=worldDraftingGeometryWithComponents(document,object,feature,nextPath);result.lines.push(...data.lines);result.texts.push(...data.texts);
    }return result;
  }
  return empty();
}

export function worldDraftingGeometry(document:CadDocument,object:CadObject,feature:CadFeature):DraftGeometry {
  return worldDraftingGeometryWithComponents(document,object,feature,new Set());
}

function worldDraftingGeometryWithComponents(document:CadDocument,object:CadObject,feature:CadFeature,componentPath:Set<string>):DraftGeometry {
  const style=layerStyle(document.layers[object.layerId]);
  if(feature.type==="drawing"){
    const world=getWorldDrawingGeometry(object,feature);
    const vectorStyle=feature.params.vectorStyle&&typeof feature.params.vectorStyle==="object"?feature.params.vectorStyle as CadVectorStyle:undefined;
    return world?.points?.length?{texts:[],lines:[{points:world.points,closed:world.closed,style,...(vectorStyle?{vectorStyle}:{})}]}:empty();
  }
  if(feature.type!=="drafting")return empty();
  const geometry=localDraftingGeometry(document,feature.params,style,componentPath),transform=getObjectTransform(object,feature);
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as Vec3)),new THREE.Vector3(...transform.scale));
  const map=(point:Vec3)=>new THREE.Vector3(...point).applyMatrix4(matrix).toArray() as Vec3;
  return {lines:geometry.lines.map(line=>({...line,points:line.points.map(map)})),texts:geometry.texts.map(text=>({...text,point:map(text.point),height:text.height*transform.scale[0],angle:text.angle+transform.rotation[2]}))};
}

export function refreshDrafting(document:CadDocument,before?:CadDocument) {
  for(const feature of Object.values(document.features)){
    if(feature.type!=="drafting")continue;
    if(feature.params.kind==="hatch"){
      const result=extractSketchLoops(document,feature.params.sourceObjectIds as string[],{forRegeneration:true});
      if(!result.ok)throw new Error(`Cannot refresh hatch: ${result.reason}`);
      feature.params.regions=result.loops;
      hatchLines(result.loops,Number(feature.params.spacing),Number(feature.params.angle));
    }
    if(feature.params.kind==="chain" && typeof feature.params.sourceObjectId==="string"){
      const id=feature.params.sourceObjectId,object=document.objects[id],source=Object.values(document.features).find(f=>f.output===id);
      if(!object||!source){delete feature.params.sourceObjectId;feature.inputs=[];continue;}
      const world=getWorldDrawingGeometry(object,source);
      if(world?.points?.length)feature.params.points=world.points;
    }
    const old=before?.features[feature.id],object=document.objects[feature.output];
    if(old && document.layers[object.layerId]?.locked && JSON.stringify(old.params)!==JSON.stringify(feature.params))throw new Error(`Cannot refresh ${feature.output}: annotation layer is locked.`);
  }
}
