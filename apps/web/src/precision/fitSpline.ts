import {c2Tangents} from "./cubicTangents";
export type FitContinuity="C1"|"C2";
import {validSpline,type CadSpline} from "@agent-webcad/cad-document";
type V=[number,number,number];
/** Uniform cardinal interpolation compiled into exact cubic Bezier spans (one B-spline). */
export function fitSpline(points:V[],closed=false,tension=1,continuity:FitContinuity="C1"):CadSpline{
 if(points.length<(closed?3:2)||points.length>60||points.some(p=>p.length!==3||!p.every(Number.isFinite))||!Number.isFinite(tension)||tension<.1||tension>1.5)throw Error("Use 2–60 finite fit points (3 for closed curves) and tangent strength 0.1–1.5.");
 if(continuity!=="C1"&&continuity!=="C2")throw Error("Use C1 or C2 interpolation.");if(continuity==="C2"&&tension!==1)throw Error("C2 computes linked tangents; use strength 1, or switch to C1 for a strength control.");
 const pts=structuredClone(points);if(closed&&Math.hypot(...pts[0].map((v,i)=>v-pts.at(-1)![i]))<1e-7)pts.pop();
 if(pts.length<(closed?3:2)||pts.some((p,i)=>i>0&&Math.hypot(...p.map((v,j)=>v-pts[i-1][j]))<1e-6))throw Error("Fit points must be distinct; remove repeated adjacent vertices.");
 const at=(i:number)=>pts[closed?(i+pts.length)%pts.length:Math.max(0,Math.min(pts.length-1,i))],n=closed?pts.length:pts.length-1,poles:V[]=[pts[0]];
 const tangents=continuity==="C2"?c2Tangents(pts,closed):undefined;
 for(let i=0;i<n;i++){const a=at(i),b=at(i+1),previous=at(i-1),next=at(i+2);poles.push(a.map((v,j)=>v+(tangents?tangents[i][j]/3:(b[j]-previous[j])*tension/6)) as V,b.map((v,j)=>v-(tangents?tangents[(i+1)%pts.length][j]/3:(next[j]-a[j])*tension/6)) as V,[...b]);}
 const knots=[0,0,0,0];for(let i=1;i<n;i++)knots.push(i,i,i);knots.push(n,n,n,n);
 const spline:CadSpline={degree:3,controlPoints:poles,knots,weights:poles.map(()=>1),domain:[0,n]};if(!validSpline(spline))throw Error("Could not construct the fitted spline.");return continuity==="C2"?{...spline,fitContinuity:"C2"}:spline;
}

/** Recover our interpolation editor only when recompilation matches all control poles. */
export function fittedSplineDefinition(s:CadSpline):{points:V[];closed:boolean;tension:number;continuity:FitContinuity}|undefined{
 try{
 const n=(s.controlPoints.length-1)/3;if(s.degree!==3||!Number.isInteger(n)||s.weights?.some(w=>w!==1))return;
 const points=s.controlPoints.filter((_,i)=>i%3===0),closed=Math.hypot(...points[0].map((v,i)=>v-points.at(-1)![i]))<1e-7;if(closed)points.pop();
 if(s.fitContinuity==="C2"){const smooth=fitSpline(points,closed,1,"C2");if(JSON.stringify(smooth.knots)===JSON.stringify(s.knots)&&JSON.stringify(smooth.domain)===JSON.stringify(s.domain)&&smooth.controlPoints.every((p,i)=>p.every((v,j)=>Math.abs(v-s.controlPoints[i][j])<1e-6)))return {points,closed,tension:1,continuity:"C2"};return;}
 const test=fitSpline(points,closed,1);let numerator=0,denominator=0;for(let i=0;i<s.controlPoints.length;i++){if(i%3===0)continue;const base=i%3===1?points[Math.floor(i/3)]:points[(Math.floor(i/3)+1)%points.length];for(let j=0;j<3;j++){const d=test.controlPoints[i][j]-base[j];numerator+=d*(s.controlPoints[i][j]-base[j]);denominator+=d*d;}}
 if(!denominator)return;const rawTension=numerator/denominator;if(rawTension<.1-1e-10||rawTension>1.5+1e-10)return;const tension=Math.max(.1,Math.min(1.5,rawTension));const result=fitSpline(points,closed,tension);if(JSON.stringify(result.knots)!==JSON.stringify(s.knots)||JSON.stringify(result.domain)!==JSON.stringify(s.domain)||result.controlPoints.some((p,i)=>p.some((v,j)=>Math.abs(v-s.controlPoints[i][j])>1e-6)))return;return {points,closed,tension,continuity:"C1"};
 }catch{return;}
}
