import * as THREE from "three";
import {WORK_PLANES,worldToPlane,type WorkPlaneId} from "./workPlane";
export type PlanePoint=[number,number];
/** Model-mm movement in the saved output plane, independent of zoom and active work plane. */
export function savedMeasurementPlacementOffset(offset:PlanePoint,start:PlanePoint,current:PlanePoint):PlanePoint|null{
 const next=offset.map((n,i)=>n+current[i]-start[i]) as PlanePoint;
 return next.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6)?next:null;
}
export function savedMeasurementPointerPlane(camera:THREE.Camera,rect:{left:number;top:number;width:number;height:number},client:PlanePoint,plane:WorkPlaneId):PlanePoint|null{
 if(!(rect.width>0&&rect.height>0)||![...client,rect.left,rect.top,rect.width,rect.height].every(Number.isFinite))return null;
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((client[0]-rect.left)/rect.width*2-1,-((client[1]-rect.top)/rect.height*2-1)),camera);
 const frame=WORK_PLANES[plane],normal=new THREE.Vector3(...frame.normal);
 if(Math.abs(ray.ray.direction.dot(normal))<1e-5)return null;
 const hit=ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(...frame.origin)),new THREE.Vector3());
 if(!hit)return null;const point=worldToPlane(hit.toArray(),frame);return point.every(Number.isFinite)?point:null;
}
