import {measurementPresentation,measurementDisplayPoint} from "./measurementPresentation";
import {savedMeasurementCurrent,type CadDocument,type SavedMeasurement} from "@agent-webcad/cad-document";
import {WORK_PLANES,worldToPlane,type Vec3} from "./workPlane";
export function savedMeasurementGeometry(d:CadDocument,m:SavedMeasurement){
 if(!m.visible||!savedMeasurementCurrent(d,m))return null;const presentation=measurementPresentation(d,m);if(!presentation)return null;const r=m.result!,frame=WORK_PLANES[m.plane],textHeight=m.textHeight/presentation.scale;
 const end=r.source.map((v,i)=>{const axis=["X","Y","Z"][i],keep=m.mode==="shortest"||m.mode.startsWith("axis-")&&m.mode.endsWith(axis)||m.mode.startsWith("project-")&&m.mode.slice(8).includes(axis);return keep?r.target[i]:v;}) as Vec3;
 const a=worldToPlane(r.source,frame),b=worldToPlane(end,frame),aa=a.map((v,i)=>v+m.offset[i]) as [number,number],bb=b.map((v,i)=>v+m.offset[i]) as [number,number],length=Math.hypot(bb[0]-aa[0],bb[1]-aa[1]),u:[number,number]=length>1e-9?[(bb[0]-aa[0])/length,(bb[1]-aa[1])/length]:[1,0],v:[number,number]=[-u[1],u[0]],size=Math.min(textHeight,Math.max(length/4,.1));
 const lines:[number,number][][]=[[a,aa],[b,bb],[aa,bb]];
 for(const [point,sign] of [[aa,1],[bb,-1]] as const)for(const side of [-1,1])lines.push([point,[point[0]+sign*u[0]*size+side*v[0]*size*.35,point[1]+sign*u[1]*size+side*v[1]*size*.35]]);
 const position:[number,number]=[(aa[0]+bb[0])/2+v[0]*textHeight,(aa[1]+bb[1])/2+v[1]*textHeight],mode=m.mode==="shortest"?"3D":m.mode.startsWith("axis-")?m.mode.slice(5):m.mode.slice(8),text=`${m.name} · ${mode} ${r.accuracy!=="kernel"?"≈ ":""}${r.distance.toFixed(4)} mm${r.accuracy==="approximate"?" (approx.)":""}`;
 const map=(p:[number,number]):[number,number]=>[presentation.origin[0]+p[0]*presentation.scale,presentation.origin[1]+p[1]*presentation.scale];
 return {lines,position,text,outputLines:lines.map(line=>line.map(map)),outputPosition:map(position),outputPlane:presentation.plane,anchorId:presentation.anchorId,worldLines:lines.map(line=>line.map(p=>measurementDisplayPoint(d,m,p)!)),worldText:measurementDisplayPoint(d,m,position)!,textHeight:m.textHeight};
}
