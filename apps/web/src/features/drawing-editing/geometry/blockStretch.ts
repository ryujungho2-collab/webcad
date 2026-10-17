import * as THREE from "three";
import type {CadDocument,CadFeature,CadObject,CadObjectTransform} from "@agent-webcad/cad-document";
import {linearToleranceAt} from "@agent-webcad/cad-document";
import {drawingTransformMatrix} from "../../../precision/worldGeometry";
import {getObjectTransform} from "../../../precision/objectTransform";
import {profileSegments} from "../../../precision/profileGeometry";
import {worldDraftingGeometry} from "../../../precision/draftingGeometry";
import {WORK_PLANES,planeToWorld,worldToPlane,type Vec3,type WorkPlaneId} from "../../../precision/workPlane";
import type {ExactContour} from "./contourEditing";
import type {StretchRegion} from "./basicDrawingEditing";
const matrix=(t:CadObjectTransform)=>new THREE.Matrix4().compose(new THREE.Vector3(...t.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation.map(THREE.MathUtils.degToRad) as Vec3)),new THREE.Vector3(...t.scale));
const map=(m:THREE.Matrix4,p:Vec3)=>new THREE.Vector3(...p).applyMatrix4(m).toArray() as Vec3;
const mod=(n:number)=>(n%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
/** Definition traversal only measures the instance. No member is detached or edited. */
export function blockStretchEnvelope(document:CadDocument,object:CadObject,feature:CadFeature):ExactContour {
 if(feature.type!=="drafting"||feature.params.kind!=="block")throw new Error("Select a placed block instance.");
 const block=document.blocks?.[String(feature.params.blockId)];if(!block)throw new Error("The block definition no longer exists.");
 const workPlane=block.workPlane,plane=WORK_PLANES[workPlane],points:Vec3[]=[];let count=0;
 const add=(p:Vec3)=>{if(p.some(v=>!Number.isFinite(v)))throw new Error("Block bounds must be finite.");points.push(p);};
 const arc=(m:THREE.Matrix4,center:Vec3,radius:number,start:number,sweep:number,sourcePlane:WorkPlaneId)=>{
  if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(start)||!Number.isFinite(sweep)||Math.abs(sweep)<1e-12)throw new Error("A block curve has invalid geometry.");
  const axes=WORK_PLANES[sourcePlane],c=map(m,center),x=map(m,center.map((v,i)=>v+radius*axes.xAxis[i]) as Vec3).map((v,i)=>v-c[i]),y=map(m,center.map((v,i)=>v+radius*axes.yAxis[i]) as Vec3).map((v,i)=>v-c[i]);
  const angles=[start,start+sweep];for(const axis of [plane.xAxis,plane.yAxis,plane.normal]){const a=x.reduce((n,v,i)=>n+v*axis[i],0),b=y.reduce((n,v,i)=>n+v*axis[i],0),angle=Math.atan2(b,a);angles.push(angle,angle+Math.PI);}
  for(const angle of angles)if(Math.abs(sweep)>=2*Math.PI-1e-10||angle===start||angle===start+sweep||mod(Math.sign(sweep)*(angle-start))<=Math.abs(sweep)+1e-10)add(c.map((v,i)=>v+x[i]*Math.cos(angle)+y[i]*Math.sin(angle)) as Vec3);
 };
 const expand=(id:string,placement:THREE.Matrix4,ancestors:Set<string>)=>{
  if(ancestors.has(id)||ancestors.size>=64)throw new Error("Block nesting has a cycle or exceeds 64 levels.");const definition=document.blocks?.[id];if(!definition)throw new Error("A nested block definition no longer exists.");
  if(definition.workPlane!==workPlane)throw new Error("Stretch requires block members on the same work plane.");const next=new Set(ancestors);next.add(id);
  for(const member of definition.members){if(++count>4096)throw new Error("Stretch supports at most 4096 nested block members.");
   const o:CadObject={id:"member",geometryId:"member",name:"Member",visible:true,layerId:member.layerId,transform:member.transform},f:CadFeature={id:"member",output:"member",inputs:[],type:member.type,params:member.params};
   if(member.type==="drafting"&&member.params.kind==="block"){expand(String(member.params.blockId),placement.clone().multiply(matrix(member.transform)),next);continue;}
   if(member.type==="drafting"){if(!["text","chain","hatch","floor-plan"].includes(String(member.params.kind)))throw new Error("Unsupported drafting block member. Edit its definition or explicitly disband the instance.");continue;} // Drafting lines and labels use the renderer's composed output below.
   const kind=String(member.params.kind),sourcePlane=(member.params.workPlane??workPlane) as WorkPlaneId;if(!WORK_PLANES[sourcePlane]||sourcePlane!==workPlane)throw new Error("Stretch requires block members on the same work plane.");
   if(["infinite-line","ray"].includes(kind))throw new Error("Unbounded block members cannot be fully contained. Edit the definition or explicitly disband the instance.");
   const composed=placement.clone().multiply(drawingTransformMatrix(o,f));
   if(kind==="circle"||kind==="arc")arc(composed,member.params.center as Vec3,Number(member.params.radius),kind==="circle"?0:Number(member.params.startAngle),kind==="circle"?2*Math.PI:Number(member.params.endAngle)-Number(member.params.startAngle),sourcePlane);
   else if(kind==="point"){for(const p of member.params.points as Vec3[])add(map(composed,p));}
   else if(["line","polyline","rectangle"].includes(kind)){const segments=profileSegments(kind,member.params);if(!segments.length)throw new Error("A block member has no measurable geometry.");for(const s of segments)if(s.kind==="arc")arc(composed,s.center!,s.radius!,s.startAngle!,s.sweep!,sourcePlane);else {add(map(composed,s.start));add(map(composed,s.end));}}
   else throw new Error(`Unsupported block member '${kind}'. Edit the definition or explicitly disband the instance.`);
  }
 };
 expand(block.id,matrix(getObjectTransform(object,feature)),new Set());
 const drawing=worldDraftingGeometry(document,object,feature);for(const line of drawing.lines)for(const p of line.points)add(p);
 // Conservative model text envelope: renderer uses system font; reserve 2 em per UTF-16 unit plus padding.
 for(const text of drawing.texts){const h=Math.abs(text.height),w=h*Math.max(1,2*(text.text.length+1)),angle=text.angle*Math.PI/180,left=text.align==="center"?-w/2:text.height<0?-w:0;for(const u of [left,left+w])for(const v of [0,Math.sign(text.height)*h])add(text.point.map((n,i)=>n+(u*Math.cos(angle)-v*Math.sin(angle))*plane.xAxis[i]+(u*Math.sin(angle)+v*Math.cos(angle))*plane.yAxis[i]) as Vec3);}
 if(!points.length)throw new Error("An empty block has no Stretch bounds.");
 const min=[Infinity,Infinity],max=[-Infinity,-Infinity];let h=Infinity,top=-Infinity,largest=0;
 for(const p of points){const uv=worldToPlane(p,plane),height=p.reduce((n,v,i)=>n+v*plane.normal[i],0);h=Math.min(h,height);top=Math.max(top,height);for(let i=0;i<2;i++){min[i]=Math.min(min[i],uv[i]);max[i]=Math.max(max[i],uv[i]);}for(const v of p)largest=Math.max(largest,Math.abs(v));}
 if(top-h>linearToleranceAt(largest))throw new Error("Block Stretch requires a flat instance aligned with its work plane.");
 const corners=[[min[0],min[1]],[max[0],min[1]],[max[0],max[1]],[min[0],max[1]]].map(p=>planeToWorld(p as [number,number],plane).map((v,i)=>v+h*plane.normal[i]) as Vec3);
 return {workPlane,closed:true,segments:corners.map((start,i)=>({kind:"line",start,end:corners[(i+1)%4]}))};
}
export function classifyBlockStretch(document:CadDocument,object:CadObject,feature:CadFeature,region:StretchRegion):"inside"|"partial"|"outside" {
 const path=blockStretchEnvelope(document,object,feature);if(path.workPlane!==region.workPlane)return "outside";
 const plane=WORK_PLANES[region.workPlane],p=path.segments.map(s=>worldToPlane(s.start,plane)),a=worldToPlane(region.first,plane),b=worldToPlane(region.second,plane),tol=linearToleranceAt(...region.first,...region.second,...path.segments.flatMap(s=>s.start));
 const elevation=path.segments[0].start.reduce((n,v,i)=>n+(v-region.first[i])*plane.normal[i],0);if(Math.abs(elevation)>tol)return "outside";
 const min=[Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1]))],max=[Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))],lo=a.map((v,i)=>Math.min(v,b[i])),hi=a.map((v,i)=>Math.max(v,b[i]));
 if(min.some((v,i)=>v>hi[i]+tol||max[i]<lo[i]-tol))return "outside";
 return min.every((v,i)=>v>=lo[i]-tol&&max[i]<=hi[i]+tol)?"inside":"partial";
}
