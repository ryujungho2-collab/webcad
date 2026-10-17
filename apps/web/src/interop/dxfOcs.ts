import * as THREE from "three";
import {linearToleranceAt,type CadObject,type CadFeature} from "@agent-webcad/cad-document";
import {drawingModelOrigin,drawingTransformMatrix} from "../precision/worldGeometry";
import {WORK_PLANES,type Vec3} from "../precision/workPlane";
import {profileSegments} from "../precision/profileGeometry";

/** Autodesk arbitrary axis algorithm: the OCS origin is the WCS origin. */
export function dxfOcs(normal:Vec3){
 const n=new THREE.Vector3(...normal),length=n.length();if(!Number.isFinite(length)||length<1e-12)throw new Error("Invalid DXF extrusion normal.");n.divideScalar(length);
 const x=new THREE.Vector3(...(Math.abs(n.x)<1/64&&Math.abs(n.y)<1/64?[0,1,0]:[0,0,1]) as Vec3).cross(n).normalize(),y=n.clone().cross(x).normalize(),matrix=new THREE.Matrix4().makeBasis(x,y,n);
 return {normal:n.toArray() as Vec3,matrix,toWorld:(p:Vec3)=>new THREE.Vector3(...p).applyMatrix4(matrix).toArray() as Vec3,toLocal:(p:Vec3)=>[new THREE.Vector3(...p).dot(x),new THREE.Vector3(...p).dot(y),new THREE.Vector3(...p).dot(n)] as Vec3};
}
export function dxfPlacement(params:Record<string,unknown>,normal:Vec3){
 const frame=dxfOcs(normal),origin=drawingModelOrigin(params),world=frame.toWorld(origin),e=new THREE.Euler().setFromRotationMatrix(frame.matrix,"XYZ");
 return {rotation:[e.x,e.y,e.z].map(v=>THREE.MathUtils.radToDeg(v)||0) as Vec3,translation:world.map((v,i)=>v-origin[i]) as Vec3};
}
/** Export actual model controls and an orthonormal OCS; never sample circular geometry. */
export function dxfPlanarDrawing(object:CadObject,feature:CadFeature){
 const params=feature.params,kind=String(params.kind),plane=WORK_PLANES[(params.workPlane??"XY") as keyof typeof WORK_PLANES],matrix=drawingTransformMatrix(object,feature),map=(p:Vec3)=>new THREE.Vector3(...p).applyMatrix4(matrix),origin=map([0,0,0]),a=map(plane.xAxis).sub(origin),b=map(plane.yAxis).sub(origin),sx=a.length(),sy=b.length();
 if(!Number.isFinite(sx)||!Number.isFinite(sy)||sx<1e-12||sy<1e-12)throw new Error("degenerate drawing placement");
 const segments=profileSegments(kind,params),curved=kind==="arc"||kind==="circle"||segments.some(s=>s.kind==="arc");
 if(curved&&(Math.abs(sx-sy)>1e-9*Math.max(1,sx,sy)||Math.abs(a.dot(b))>1e-9*sx*sy))throw new Error("circular geometry requires uniform orthogonal in-plane scale");
 let normal=a.clone().cross(b).normalize();if(normal.length()<.5)throw new Error("degenerate drawing plane");
 if(Math.abs(normal.x)<1e-10&&Math.abs(normal.y)<1e-10)normal.set(0,0,1);
 const sweep=kind==="arc"?Number(params.endAngle)-Number(params.startAngle):0;
 if(kind==="arc"&&sweep*a.clone().cross(b).dot(normal)<0)normal.negate(); // DXF ARC always progresses CCW about its extrusion.
 const frame=dxfOcs(normal.toArray() as Vec3),orientation=Math.sign(a.clone().cross(b).dot(normal)),world=(p:Vec3)=>map(p).toArray() as Vec3,local=(p:Vec3)=>frame.toLocal(world(p));
 if(kind==="circle"||kind==="arc"){
  const center=local(params.center as Vec3),radius=Number(params.radius)*sx;if(!Number.isFinite(radius)||radius<=0)throw new Error("invalid circular geometry");
  const start=Number(params.startAngle??0),sourceCenter=params.center as Vec3,p=sourceCenter.map((v,i)=>v+Number(params.radius)*(Math.cos(start)*plane.xAxis[i]+Math.sin(start)*plane.yAxis[i])) as Vec3,contact=local(p),startAngle=Math.atan2(contact[1]-center[1],contact[0]-center[0]);
  return {kind,normal:frame.normal,center,radius,startAngle,endAngle:startAngle+sweep*orientation};
 }
 if(!segments.length)throw new Error("no finite drawing controls");const points=segments.map(s=>local(s.start)),closed=kind==="rectangle"||params.closed===true;if(!closed)points.push(local(segments.at(-1)!.end));
 if(points.some(p=>p.some(v=>!Number.isFinite(v)))||points.some(p=>Math.abs(p[2]-points[0][2])>1e-6))throw new Error("nonplanar contour needs a 3D polyline representation");
 return {kind:"polyline",normal:frame.normal,points,closed,bulges:segments.map(s=>s.kind==="arc"?Math.tan(s.sweep!*orientation/4):0)};
}

/** WCS LINE/3D POLYLINE may lie on a plane that is not a principal plane. */
export function dxfWcsPlane(points:Vec3[]){
 if(points.length<2||points.some(p=>p.some(v=>!Number.isFinite(v))))return null;
 const origin=new THREE.Vector3(...points[0]),vectors=points.slice(1).map(p=>new THREE.Vector3(...p).sub(origin)),first=vectors.find(v=>v.length()>1e-9);if(!first)return null;
 const direction=first.clone().normalize();
 let normal=vectors.filter(v=>v.length()>1e-9).map(v=>direction.clone().cross(v.clone().normalize())).find(v=>v.length()>1e-8);
 if(!normal)normal=first.clone().cross(Math.abs(first.clone().normalize().z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0));
 const frame=dxfOcs(normal.normalize().toArray() as Vec3),local=points.map(frame.toLocal),tol=linearToleranceAt(...points.flat());if(local.some(p=>Math.abs(p[2]-local[0][2])>tol))return null;
 const height=local[0][2];return {normal:frame.normal,points:local.map(p=>[p[0],p[1],height] as Vec3)};
}

/** INSERT applies its angle inside OCS, then maps its origin into WCS. */
export function dxfInsertPlacement(position:Vec3,angle:number,normal:Vec3=[0,0,1]){
 const frame=dxfOcs(normal),matrix=frame.matrix.clone().multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(angle))),e=new THREE.Euler().setFromRotationMatrix(matrix,"XYZ");
 return {translation:frame.toWorld(position),rotation:[e.x,e.y,e.z].map(v=>THREE.MathUtils.radToDeg(v)||0) as Vec3};
}
export function dxfInsertCoordinates(transform:import("@agent-webcad/cad-document").CadObjectTransform){
 const rotation=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as Vec3)),normal=new THREE.Vector3(0,0,1).transformDirection(rotation).toArray() as Vec3,frame=dxfOcs(normal),x=new THREE.Vector3(1,0,0).transformDirection(rotation),local=frame.toLocal(x.toArray() as Vec3);
 return {normal:frame.normal,position:frame.toLocal(transform.translation),angle:Math.atan2(local[1],local[0])*180/Math.PI,scale:transform.scale};
}
export function dxfTextCoordinates(text:import("../precision/draftingGeometry").DraftText){
 const r=text.angle*Math.PI/180,axes=text.axes??[[Math.cos(r),Math.sin(r),0],[-Math.sin(r),Math.cos(r),0]] as [Vec3,Vec3],u=new THREE.Vector3(...axes[0]),v=new THREE.Vector3(...axes[1]);
 if(Math.abs(u.length()-v.length())>1e-9||Math.abs(u.dot(v))>1e-9||u.length()<1e-12)throw new Error("TEXT requires orthogonal uniform in-plane scale; width/shear is unsupported");
 const frame=dxfOcs(u.clone().cross(v).normalize().toArray() as Vec3),local=frame.toLocal(u.toArray() as Vec3);
 return {normal:frame.normal,point:frame.toLocal(text.point),height:text.height,angle:Math.atan2(local[1],local[0])*180/Math.PI};
}
