import {getWorldDrawingGeometry} from "./worldGeometry";
import {sampleSpline,splineClosed} from "./splineGeometry";
import {sampleEllipse,ellipseClosed} from "./ellipseGeometry";
import {WORK_PLANES,worldToPlane,planeToWorld,type Vec3,type WorkPlaneId} from "./workPlane";
import type {CadDocument} from "@agent-webcad/cad-document";
export type CurveStation={point:Vec3;tangent:[number,number];normal:[number,number];angle:number;distance:number};
export type CurveStationOptions={count:number;start:number;end:number;offset:number};

/** DIVIDE-style snapshot positions. Spline/ellipse lengths use a 0.05 mm chord approximation. */
export function curveStations(d:CadDocument,id:string,options:CurveStationOptions){
 const {count,start,end,offset}=options;if(!Number.isInteger(count)||count<2||count>128||![start,end,offset].every(Number.isFinite)||start<0||end>1||end<=start)throw Error("Use 2–128 placements, a 0–1 interval and a finite normal offset.");
 const o=d.objects[id],f=Object.values(d.features).find(f=>f.output===id);if(!o||f?.type!=="drawing"||!o.visible||d.layers[o.layerId]?.visible===false)throw Error("Choose a visible finite drawing curve.");
 const g=getWorldDrawingGeometry(o,f);if(!g?.points?.length||!g.planeAligned)throw Error("Choose a curve aligned to its principal work plane.");
 const isClosed=g.closed||g.kind==="circle"||!!g.spline&&splineClosed(g.spline)||!!g.ellipse&&ellipseClosed(g.ellipse);
 const plane=WORK_PLANES[g.workPlane],elevation=g.points[0].reduce((s,v,i)=>s+v*plane.normal[i],0);
 const pieces:{length:number;point:(t:number)=>[number,number];tangent:(t:number)=>[number,number]}[]=[];
 if((g.kind==="circle"||g.kind==="arc")&&g.center&&g.radius&&g.uniformScale){
  const center=worldToPlane(g.center,plane),r=g.radius,a=g.startAngle??0,b=g.endAngle??Math.PI*2,sweep=b-a;
  pieces.push({length:Math.abs(sweep)*r,point:t=>[center[0]+r*Math.cos(a+t*sweep),center[1]+r*Math.sin(a+t*sweep)],tangent:t=>[-Math.sin(a+t*sweep)*Math.sign(sweep),Math.cos(a+t*sweep)*Math.sign(sweep)]});
 }else{
  const points=(g.spline?sampleSpline(g.spline,.05):g.ellipse?sampleEllipse(g.ellipse,.05):g.points).map(p=>worldToPlane(p,plane));
  if(isClosed&&Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1])>1e-7)points.push(points[0]);
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length>1e-8)pieces.push({length,point:t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],tangent:()=>[(b[0]-a[0])/length,(b[1]-a[1])/length]});}
 }
 const length=pieces.reduce((n,p)=>n+p.length,0);if(!(length>1e-6))throw Error("Curve has no measurable length.");
 const closed=isClosed&&start===0&&end===1,stations:CurveStation[]=Array.from({length:count},(_,i)=>{
  const distance=(start+(end-start)*i/(closed?count:count-1))*length;let remaining=distance,index=0;while(index<pieces.length-1&&remaining>pieces[index].length){remaining-=pieces[index++].length;}
  const piece=pieces[index],t=Math.max(0,Math.min(1,remaining/piece.length)),p=piece.point(t),tangent=piece.tangent(t),normal:[number,number]=[-tangent[1],tangent[0]],point=planeToWorld([p[0]+normal[0]*offset,p[1]+normal[1]*offset],plane).map((v,j)=>v+elevation*plane.normal[j]) as Vec3;
  return {point,tangent,normal,angle:Math.atan2(tangent[1],tangent[0])*180/Math.PI,distance};
 });return {stations,length,closed,workPlane:g.workPlane as WorkPlaneId};
}
