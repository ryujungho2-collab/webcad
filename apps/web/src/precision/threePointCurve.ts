import {CAD_PRECISION,linearToleranceAt} from "@agent-webcad/cad-document";
import type {SketchPoint} from "@agent-webcad/cad-document";

export type ThreePointCurve={center:SketchPoint;radius:number;startAngle:number;endAngle:number};
export type ThreePointCurveResult={ok:true;curve:ThreePointCurve}|{ok:false;reason:string};
/** Translate and normalize before the circumcenter calculation to retain precision at survey coordinates. */
export function threePointCurve(points:readonly SketchPoint[]):ThreePointCurveResult{
  const fail=(reason:string):ThreePointCurveResult=>({ok:false,reason});
  if(points.length!==3||points.some(p=>p.length!==2||!p.every(Number.isFinite)))return fail("Three finite points are required.");
  const [a,b,c]=points,tolerance=linearToleranceAt(...points.flat());
  const bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1];
  const lengths=[Math.hypot(bx,by),Math.hypot(cx,cy),Math.hypot(c[0]-b[0],c[1]-b[1])];
  if(lengths.some(length=>length<=tolerance))return fail("Three points must be distinct beyond the modeling tolerance.");
  const scale=Math.max(...lengths),x=bx/scale,y=by/scale,u=cx/scale,v=cy/scale,cross=x*v-y*u;
  if(!Number.isFinite(scale)||Math.abs(cross)*scale<=tolerance||Math.abs(cross)<=CAD_PRECISION.angularTolerance*Math.hypot(x,y)*Math.hypot(u,v))return fail("Three points are collinear or too nearly collinear to define a stable circle.");
  const bb=x*x+y*y,cc=u*u+v*v,ox=(bb*v-cc*y)/(2*cross),oy=(x*cc-u*bb)/(2*cross);
  const center:SketchPoint=[a[0]+ox*scale,a[1]+oy*scale],radius=Math.hypot(ox,oy)*scale;
  if(![...center,radius].every(Number.isFinite)||radius<=tolerance)return fail("The circle is outside the supported coordinate precision.");
  const errorTolerance=Math.max(linearToleranceAt(...center,radius,...points.flat()),radius*1e-10);
  if(points.some(p=>Math.abs(Math.hypot(p[0]-center[0],p[1]-center[1])-radius)>errorTolerance))return fail("The circle cannot retain all three points at the supported precision.");
  const startAngle=Math.atan2(-oy,-ox),middle=Math.atan2(y-oy,x-ox),end=Math.atan2(v-oy,u-ox),turn=2*Math.PI;
  const positive=(angle:number)=>(angle%turn+turn)%turn;
  const midDelta=positive(middle-startAngle),endDelta=positive(end-startAngle);
  const sweep=midDelta<endDelta?endDelta:endDelta-turn;
  if(Math.abs(sweep)<=CAD_PRECISION.angularTolerance||turn-Math.abs(sweep)<=CAD_PRECISION.angularTolerance)return fail("The arc endpoints are indistinguishable at the supported angular precision.");
  return {ok:true,curve:{center,radius,startAngle,endAngle:startAngle+sweep}};
}
