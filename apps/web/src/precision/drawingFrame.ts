import type {CadDocument} from "@agent-webcad/cad-document";
import {getWorldDrawingGeometry} from "./worldGeometry";
import {resolveDimension} from "./dimensionGeometry";
import * as THREE from "three";
import {worldDraftingGeometry} from "./draftingGeometry";
import {worldToPlane,WORK_PLANES,type WorkPlaneId} from "./workPlane";
export function assertFrameMembers(document:CadDocument,ids:string[],plane:WorkPlaneId){
 for(const id of ids){const o=document.objects[id],f=Object.values(document.features).find(f=>f.output===id);
 if(!o||!f||!document.rootObjects.includes(id))throw Error(`Frame source ${id} is missing; remove or reassign this member.`);
 if(!["drawing","drafting","dimension"].includes(f.type))throw Error(`${o.name}: select a 2D drawing or generated model view, not a solid/sketch container.`);
 if(String(f.params.workPlane??"XY")!==plane)throw Error(`${o.name}: frame members must use ${plane}.`);
 if(["point","ray","infinite-line"].includes(String(f.params.kind)))throw Error(`${o.name}: frame requires finite geometry.`);
 const w=f.type==="drawing"?getWorldDrawingGeometry(o,f):undefined;
 if(f.type==="drawing"&&!w)throw Error(`${o.name}: unsupported drawing source.`);
 if(w&&!w.planeAligned)throw Error(`${o.name}: tilted geometry cannot enter this planar frame.`);
 }
}
export function frameSourceBounds(document:CadDocument,ids:string[],plane:WorkPlaneId){
 assertFrameMembers(document,ids,plane);const points:number[][]=[];
 for(const id of ids){const o=document.objects[id],f=Object.values(document.features).find(f=>f.output===id)!;
 if(f.type==="drawing"){for(const p of getWorldDrawingGeometry(o,f)?.points??[])points.push(worldToPlane(p,WORK_PLANES[plane]));}
 else if(f.type==="dimension"){const dim=resolveDimension(f.params);if(!dim)throw Error("Invalid dimension in frame.");const transform=o.transform??{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},m=new THREE.Matrix4().compose(new THREE.Vector3(...transform.translation),new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation.map(THREE.MathUtils.degToRad) as [number,number,number])),new THREE.Vector3(...transform.scale));for(const v of [...dim.segments.flat(),dim.textPosition]){const p=worldToPlane(new THREE.Vector3(...v).applyMatrix4(m).toArray() as [number,number,number],WORK_PLANES[plane]),w=dim.text.length*dim.textHeight;points.push([p[0]-w,p[1]-dim.textHeight],[p[0]+w,p[1]+dim.textHeight]);}}
 else {const g=worldDraftingGeometry(document,o,f);for(const l of g.lines)for(const p of l.points)points.push(worldToPlane(p,WORK_PLANES[plane]));for(const t of g.texts){const p=worldToPlane(t.point,WORK_PLANES[plane]),h=t.height,w=Math.max(h,Array.from(t.text).length*h*1.2);points.push([p[0]-w,p[1]-h],[p[0]+w,p[1]+h]);}}
 }
 const mapping=frameSourceMapping(document,ids);for(let i=0;i<points.length;i++)points[i]=points[i].map((v,j)=>(v-mapping.origin[j])/mapping.scale);
 if(!points.length)return {min:[0,0] as [number,number],size:[100,70] as [number,number]};
 const min:[number,number]=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))];return {min,size:[Math.max(...points.map(p=>p[0]))-min[0],Math.max(...points.map(p=>p[1]))-min[1]] as [number,number]};
}

/** Derived views are stored in sheet coordinates: normalize before a new 1:N presentation. */
export function frameSourceMapping(document:CadDocument,ids:string[]){
 const views=new Set<string>();for(const id of ids){const f=Object.values(document.features).find(f=>f.output===id),p=f?.params;const view=p?.modelProjection??p?.modelSection??(p?.modelDrawingReference as {viewId?:string})?.viewId??(p?.modelNote as {sourceViewId?:string})?.sourceViewId;if(typeof view==="string")views.add(view);}
 if(views.size>1)throw Error("Use a separate frame for each model view; frame connections belong to G2-F2.");
 const id=[...views][0];if(!id)return {origin:[0,0] as [number,number],scale:1};
 const view=document.modelPresentation?.projections[id]??document.modelPresentation?.sections?.[id];if(!view||view.status!=="resolved")throw Error("Frame model view is unresolved. Repair its source first.");return {origin:view.origin,scale:view.scale};
}
