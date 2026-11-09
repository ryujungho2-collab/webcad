import {measurementDisplayPoint} from "./measurementPresentation";
import {savedMeasurementCurrent,type CadDocument,type SavedMeasurement} from "@agent-webcad/cad-document";
import {savedMeasurementGeometry} from "./savedMeasurementGeometry";
import {type Vec3} from "./workPlane";
type P=[number,number];
const dot=(a:P,b:P)=>a[0]*b[0]+a[1]*b[1];
function baseline(d:CadDocument,m:SavedMeasurement){const g=savedMeasurementGeometry(d,m);if(!g)return null;const [a,b]=g.lines[2],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<1e-8)return null;let u:P=[(b[0]-a[0])/length,(b[1]-a[1])/length];if(u[0]<-1e-9||Math.abs(u[0])<1e-9&&u[1]<0)u=[-u[0],-u[1]];return {a,b,u,n:[-u[1],u[0]] as P};}
export function parallelMeasurements(d:CadDocument,selected:SavedMeasurement){const base=baseline(d,selected);if(!base)return [];return Object.values(d.savedMeasurements??{}).filter(m=>m.plane===selected.plane&&m.drawingId===selected.drawingId&&m.visible&&savedMeasurementCurrent(d,m)).flatMap(m=>{const b=baseline(d,m);return b&&Math.abs(base.u[0]*b.u[1]-base.u[1]*b.u[0])<1e-6?[{m,base:b}]:[];});}
/** Axis locking is in the saved plane; screen distance alone determines snap capture. */
export function snapMeasurementOffset(d:CadDocument,m:SavedMeasurement,raw:P,start:P,shift:boolean,bypass:boolean,project:(p:Vec3)=>P,lockedAxis?:"X"|"Y"){
 const offset:P=[...raw];let axis:"X"|"Y"|undefined;if(shift){axis=lockedAxis??(Math.abs(raw[0]-start[0])>=Math.abs(raw[1]-start[1])?"X":"Y");offset[axis==="X"?1:0]=start[axis==="X"?1:0];}
 if(bypass)return {offset,axis};const moving=baseline(d,{...m,offset});if(!moving)return {offset,axis};let best:{offset:P;distance:number;targetId:string;guide:Vec3[]}|undefined;
 for(const {m:target,base} of parallelMeasurements(d,m)){if(target.id===m.id)continue;const gap=dot(base.a,moving.n)-dot(moving.a,moving.n);let correction:P=[moving.n[0]*gap,moving.n[1]*gap];
 if(axis){const index=axis==="X"?0:1,component=moving.n[index];if(Math.abs(component)<1e-8)continue;correction=[0,0];correction[index]=gap/component;}
 const next:P=[offset[0]+correction[0],offset[1]+correction[1]];if(!next.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))continue;
 const screen=project(measurementDisplayPoint(d,m,moving.a)!),snapped=project(measurementDisplayPoint(d,m,[moving.a[0]+correction[0],moving.a[1]+correction[1]])!),distance=Math.hypot(snapped[0]-screen[0],snapped[1]-screen[1]);if(distance<=8&&(!best||distance<best.distance-1e-8||Math.abs(distance-best.distance)<1e-8&&target.id<best.targetId))best={offset:next,distance,targetId:target.id,guide:[base.a,base.b].map(p=>measurementDisplayPoint(d,m,p)!)};}
 return best?{...best,axis}:{offset,axis};
}
export function organizeMeasurementOffsets(d:CadDocument,selected:SavedMeasurement,gap:number){if(!Number.isFinite(gap)||gap<.1||gap>1000)throw Error("치수 간격은 0.1–1000 mm여야 합니다.");const group=parallelMeasurements(d,selected),anchor=baseline(d,selected);if(!anchor||group.length<2)throw Error("같은 평면에 평행한 치수가 두 개 이상 필요합니다.");group.sort((a,b)=>dot(a.base.a,anchor.n)-dot(b.base.a,anchor.n)||a.m.id.localeCompare(b.m.id));const index=group.findIndex(e=>e.m.id===selected.id),level=dot(anchor.a,anchor.n);return group.map(({m,base},i)=>{const delta=level+(i-index)*gap-dot(base.a,anchor.n),offset:P=[m.offset[0]+anchor.n[0]*delta,m.offset[1]+anchor.n[1]*delta];if(!offset.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e6))throw Error("치수 배치 범위를 초과합니다.");return {measurementId:m.id,offset};}).filter(p=>p.offset.some((n,i)=>Math.abs(n-d.savedMeasurements![p.measurementId].offset[i])>1e-8));}
export function measurementOverlaps(items:{id:string;text:P;width:number;lines:P[][]}[]){const conflicts=new Set<string>();const box=(a:typeof items[number])=>({left:a.text[0]-a.width/2-3,right:a.text[0]+a.width/2+3,top:a.text[1]-17,bottom:a.text[1]+8});
 const hits=(a:P,b:P,r:ReturnType<typeof box>)=>{let lo=0,hi=1;for(const [p,q] of [[a[0]-b[0],a[0]-r.left],[b[0]-a[0],r.right-a[0]],[a[1]-b[1],a[1]-r.top],[b[1]-a[1],r.bottom-a[1]]]){if(Math.abs(p)<1e-10){if(q<0)return false;}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}}return true;};
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j],aa=box(a),bb=box(b),labels=aa.left<bb.right&&bb.left<aa.right&&aa.top<bb.bottom&&bb.top<aa.bottom,lines=a.lines.some(l=>l.slice(1).some((p,k)=>hits(l[k],p,bb)))||b.lines.some(l=>l.slice(1).some((p,k)=>hits(l[k],p,aa)));if(labels||lines){conflicts.add(a.id);conflicts.add(b.id);}}
 return conflicts;
}
