import * as THREE from "three";
import type {CadDocument} from "@agent-webcad/cad-document";
import {modelPlaneNormal} from "./modelSection";
export function modelClippingPlane(document:CadDocument){const c=document.modelPresentation?.clipping;if(!c?.enabled)return null;const sign=c.keep==="positive"?1:-1;return new THREE.Plane(new THREE.Vector3(...modelPlaneNormal(c.basis)).multiplyScalar(sign),-sign*c.height);}
export function modelPointVisible(document:CadDocument,point:THREE.Vector3){const plane=modelClippingPlane(document);return !plane||plane.distanceToPoint(point)>=-1e-7;}
