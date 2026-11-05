import type {ArchitectureWall,CadDocument} from "@agent-webcad/cad-document";
import {Matrix4,Vector3,Quaternion,Euler,MathUtils} from "three";
import {wallFootprint} from "../precision/architectureWall";
import {getObjectTransform} from "../precision/objectTransform";
type P=[number,number];
const dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1],sub=(a:P,b:P):P=>[a[0]-b[0],a[1]-b[1]];
function pointDistance(p:P,a:P,b:P){const d=sub(b,a),den=dot(d,d),t=den?Math.max(0,Math.min(1,dot(sub(p,a),d)/den)):0;return Math.hypot(p[0]-a[0]-t*d[0],p[1]-a[1]-t*d[1]);}
function distanceToRect(a:P,b:P,x0:number,x1:number,y0:number,y1:number){
 // Slab clipping tests an exact finite segment/rectangle intersection first.
 let lo=0,hi=1;const d=sub(b,a);let hit=true;
 for(const [p,q]of [[-d[0],a[0]-x0],[d[0],x1-a[0]],[-d[1],a[1]-y0],[d[1],y1-a[1]]]){if(Math.abs(p)<1e-12){if(q<0){hit=false;break;}}else if(p<0)lo=Math.max(lo,q/p);else hi=Math.min(hi,q/p);}
 if(hit&&lo<=hi)return 0;
 const corners:P[]=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];let result=Infinity;for(let i=0;i<4;i++){const p=corners[i],q=corners[(i+1)%4];result=Math.min(result,pointDistance(a,p,q),pointDistance(b,p,q),pointDistance(p,a,b),pointDistance(q,a,b));}return result;
}
function distanceToQuad(a:P,b:P,polygon:P[]){
 const cross=(a:P,b:P,c:P)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const inside=(p:P)=>polygon.every((v,i)=>cross(v,polygon[(i+1)%polygon.length],p)>=-1e-8);
 if(inside(a)||inside(b))return 0;let result=Infinity;
 for(let i=0;i<polygon.length;i++){const c=polygon[i],d=polygon[(i+1)%polygon.length],x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);if(x*y<=1e-12&&z*w<=1e-12&&Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))+1e-8&&Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))+1e-8)return 0;result=Math.min(result,pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));}return result;
}
export type WallPathInput={objectIds:string[];points:P[];level:number;radius:number;height:number};
export type WallPathResult={status:"clear"|"blocked";checkedWalls:number;radius:number;height:number;level:number;collisionCount:number;collisions:{objectId:string;segment:number;clearance:number}[];basis:string;limits:string[]};
/** Exact 2D segment-to-rectangle distance for upright unit-scale straight native wall hosts.
 * This is a bounded body-clearance check, not a room graph, floor/step check or egress assessment.
 */
export function checkWallPath(d:CadDocument,input:WallPathInput):WallPathResult{
 const {objectIds,points,level,radius,height}=input;if(!objectIds.length||objectIds.length>64||new Set(objectIds).size!==objectIds.length||points.length<2||points.length>32||points.some(p=>p.length!==2||!p.every(Number.isFinite))||![level,radius,height].every(Number.isFinite)||radius<=0||height<=0)throw Error("Use 1–64 unique native walls, 2–32 XY points and positive body radius/height.");
 const collisions:WallPathResult["collisions"]=[];let collisionCount=0;
 for(const objectId of objectIds){const o=d.objects[objectId],f=Object.values(d.features).find(f=>f.output===objectId),wall=f?.params.architecturalWall as ArchitectureWall|undefined;if(!o||!f||!wall)throw Error(`Path check needs a native wall: ${objectId}`);
  const t=getObjectTransform(o,f);if(t.rotation.slice(0,2).some(v=>Math.abs(v)>1e-8)||t.scale.some(v=>Math.abs(v-1)>1e-8)||wall.height<=0)throw Error("Path clearance supports upright unit-scale walls with positive height. A tilted/scaled/downward host is not silently approximated.");
  const frame=wallFootprint(d,wall).frame;if(!frame)throw Error("Path clearance needs straight wall hosts, not arbitrary footprints.");
  const inverse=new Matrix4().compose(new Vector3(...t.translation),new Quaternion().setFromEuler(new Euler(...t.rotation.map(MathUtils.degToRad) as [number,number,number])),new Vector3(...t.scale)).invert();
  const local=points.map(p=>new Vector3(p[0],p[1],level).applyMatrix4(inverse)),bottom=local[0].z,top=bottom+height,base=wall.baseLevel;
  if(top<=base||bottom>=base+wall.height)continue;
  const z0=Math.max(bottom,base),z1=Math.min(top,base+wall.height);
  // Windows remain obstacles for walking; only full-height door passages may remove wall intervals.
  const holes=wall.openings.filter(o=>o.kind==="door"&&base+o.sill<=z0+1e-7&&base+o.sill+o.height>=z1-1e-7).map(o=>[o.along-o.width/2,o.along+o.width/2]).sort((a,b)=>a[0]-b[0]);
  const intervals:number[][]=[];let cursor=0;for(const [a,b]of holes){if(a>cursor)intervals.push([cursor,a]);cursor=Math.max(cursor,b);}if(cursor<frame.length)intervals.push([cursor,frame.length]);
  const path=local.map(p=>{const x=p.x-frame.start[0],y=p.y-frame.start[1];return [x*frame.u[0]+y*frame.u[1],x*frame.v[0]+y*frame.v[1]] as P;});
  for(let i=1;i<path.length;i++){const clearance=Math.min(...intervals.map(([a,b])=>(()=>{const h=frame.thickness/2,sm=Math.tan((wall.startMiter??0)*Math.PI/180)*h,em=Math.tan((wall.endMiter??0)*Math.PI/180)*h;return sm===0&&em===0?distanceToRect(path[i-1],path[i],a,b,-h,h):distanceToQuad(path[i-1],path[i],[[a===0?-sm:a,-h],[b===frame.length?b+em:b,-h],[b===frame.length?b-em:b,h],[a===0?sm:a,h]]);})()));if(clearance<=radius+1e-7){collisionCount++;if(collisions.length<32)collisions.push({objectId,segment:i-1,clearance:Number(clearance.toFixed(6))});}}
 }
 return {status:collisionCount?"blocked":"clear",checkedWalls:objectIds.length,radius,height,level,collisionCount,collisions,basis:"Finite straight XY center path with a circular body against occupied native wall intervals with explicit miter end caps and full-height hosted doors; exact 2D distances, mm.",limits:["Only the explicitly checked wall set is considered. Furniture, door leaves/swing, floors, steps, stairs, other solids and unlisted walls are not checked.","This is not automatic room adjacency, accessibility or evacuation compliance. A clear result only means no collision in this bounded wall/body model."]};
}
