import {validSpline, type CadSpline} from "@agent-webcad/cad-document";
import {splineClosed, splinePoint, trimSpline} from "../precision/splineGeometry";

type V = [number, number, number];
const distance = (a:V,b:V) => Math.hypot(...a.map((v,i)=>v-b[i]));

/** Open natural cubic interpolation, chord-length parameters, C2 joins.
 * Fit points alone do not identify the originating CAD application's curve.
 * The explicit Bezier basis is the editable result; no polyline substitution.
 */
export function reconstructDxfFit(points:V[], tolerance:number):{curve:CadSpline; residual:number} {
 if(points.length<2||points.length>86)throw Error("fit-only cubic requires 2–86 fit points (256-pole budget)");
 const lengths=points.slice(1).map((p,i)=>distance(p,points[i])),total=lengths.reduce((a,b)=>a+b,0);
 if(!Number.isFinite(total)||!total||lengths.some(h=>h<=total*1e-8))throw Error("repeated or ill-conditioned fit points");
 const h=lengths.map(v=>v/total),ts=[0];for(const v of h)ts.push(ts.at(-1)!+v);ts[ts.length-1]=1;
 const n=points.length,second:V[]=Array.from({length:n},()=>[0,0,0]);
 for(let axis=0;axis<3;axis++){
  const diag=new Array<number>(n).fill(1),rhs=new Array<number>(n).fill(0),upper=new Array<number>(n).fill(0);
  for(let i=1;i<n-1;i++){const lower=h[i-1];diag[i]=2*(h[i-1]+h[i]);upper[i]=h[i];rhs[i]=6*((points[i+1][axis]-points[i][axis])/h[i]-(points[i][axis]-points[i-1][axis])/h[i-1]);const m=lower/diag[i-1];diag[i]-=m*upper[i-1];rhs[i]-=m*rhs[i-1];}
  for(let i=n-2;i>0;i--)second[i][axis]=(rhs[i]-upper[i]*second[i+1][axis])/diag[i];
 }
 const controlPoints:V[]=[points[0]],knots=[0,0,0,0];
 for(let i=0;i<n-1;i++){
  const dt=h[i],delta=points[i+1].map((v,j)=>(v-points[i][j])/dt),d0=delta.map((v,j)=>v-dt*(2*second[i][j]+second[i+1][j])/6),d1=delta.map((v,j)=>v+dt*(second[i][j]+2*second[i+1][j])/6);
  controlPoints.push(points[i].map((v,j)=>v+dt*d0[j]/3) as V,points[i+1].map((v,j)=>v-dt*d1[j]/3) as V,points[i+1]);
  knots.push(...new Array(i===n-2?4:3).fill(ts[i+1]));
 }
 const curve:CadSpline={degree:3,controlPoints,knots,domain:[0,1]};
 if(!validSpline(curve))throw Error("reconstructed fit curve exceeds the existing spline schema");
 const residual=Math.max(...points.map((p,i)=>distance(p,splinePoint(curve,ts[i]))));
 if(residual>tolerance)throw Error(`fit-point residual ${residual} exceeds declared tolerance ${tolerance} source units`);
 return {curve,residual};
}

/** DXF SPLINE coordinates and tangents are WCS, never OCS coordinates. */
export function readDxfSpline(ordered:[number,string][]):{curve:CadSpline; conversion?:string} {
 const fields=new Map<number,string[]>();for(const [c,v] of ordered)(fields.get(c)??fields.set(c,[]).get(c)!).push(v);
 const numbers=(c:number)=>(fields.get(c)??[]).map(v=>{if(!v.trim()||!Number.isFinite(Number(v)))throw Error(`invalid numeric group ${c}`);return Number(v);});
 const scalar=(c:number,fallback=0)=>{const values=numbers(c);if(values.length>1)throw Error(`duplicate group ${c}`);return values[0]??fallback;};
 const vectors=(base:number):V[]=>{
  const out:V[]=[],seen=new Set<number>();let p:V|undefined;
  for(const [c,v] of ordered){if(![base,base+10,base+20].includes(c))continue;
   if(c===base){if(p&&!seen.has(base+10))throw Error(`missing Y group ${base+10}`);p=[0,0,0];out.push(p);seen.clear();}
   if(!p||seen.has(c))throw Error(`orphan or duplicate coordinate group ${c}`);
   if(!v.trim()||!Number.isFinite(Number(v)))throw Error(`invalid coordinate group ${c}`);p[(c-base)/10]=Number(v);seen.add(c);
  }
  if(p&&!seen.has(base+10))throw Error(`missing Y group ${base+10}`);return out;
 };
 const flags=scalar(70),degree=scalar(71),knots=numbers(40),weights=numbers(41),controlPoints=vectors(10),fit=vectors(11);
 if(!Number.isInteger(flags)||flags<0||flags>31||(flags&~31))throw Error("unsupported spline flags");
 if(!Number.isInteger(degree)||degree<1||degree>8)throw Error("degree must remain within 1–8");
 if(scalar(72)!==knots.length||scalar(73)!==controlPoints.length||scalar(74)!==fit.length)throw Error("declared knot/control/fit counts do not match");
 if(controlPoints.length>256||fit.length>256)throw Error("source pole/fit budget exceeds 256");
 for(const c of [42,43,44])if(scalar(c,1e-10)<0)throw Error("negative spline tolerance");
 if(scalar(39)!==0)throw Error("spline thickness is unsupported");
 const normal:V[]=[210,220,230].some(c=>fields.has(c))?[[scalar(210),scalar(220),scalar(230)]]:[];if(normal.length){const length=Math.hypot(...normal[0]);if(normal.length!==1||!length)throw Error("invalid WCS spline normal");if(flags&8){const points=controlPoints.length?controlPoints:fit,origin=points[0];if(origin&&points.some(p=>Math.abs(p.reduce((sum,v,i)=>sum+(v-origin[i])*normal[0][i]/length,0))>1e-7))throw Error("planar spline normal disagrees with WCS points");}}
 // Tangents are not interpreted as OCS vectors. Fit-only boundary conditions
 // other than natural endpoints need a separate, explicit reconstruction policy.
 const tangents=[vectors(12),vectors(13)];if(tangents.some(v=>v.length>1))throw Error("duplicate fit tangent");
 if(!controlPoints.length){
  if(knots.length||weights.length||flags&7||degree!==3||tangents.some(v=>v.length))throw Error("fit-only first scope requires open nonrational cubic, no knots/weights or endpoint tangents");
  if(fit.length>1&&distance(fit[0],fit.at(-1)!)<1e-7)throw Error("closed fit-only endpoints need an explicit closed reconstruction policy");
  const {curve,residual}=reconstructDxfFit(fit,scalar(44,1e-10));
  return {curve,conversion:`Fit-only reconstruction: open natural C2 cubic with chord-length parameters; ${fit.length} fit points, maximum fit-point residual ${residual} source units (declared tolerance ${scalar(44,1e-10)}). Original between-point shape is not determined by DXF fit points. Natural endpoints and explicit control basis replace source fit editing semantics; no source-curve deviation bound.`};
 }
 const source:CadSpline={degree,knots,controlPoints,...weights.length?{weights}:{},domain:[knots[degree],knots[controlPoints.length]]};
 if(!validSpline(source))throw Error("invalid knots, positive weights, poles or finite domain");
 if(flags&16&&degree!==1)throw Error("linear spline flag requires degree 1");
 let curve=source,conversion:string|undefined;
 if(flags&2){
  const unique=controlPoints.length-degree,period=source.domain[1]-source.domain[0];
  if(unique<=degree)throw Error("periodic source needs an explicit wrapped pole basis");
  for(let i=0;i<degree;i++)if(controlPoints[i].some((v,j)=>v!==controlPoints[unique+i][j])||(weights[i]??1)!==(weights[unique+i]??1))throw Error("periodic source must explicitly repeat degree poles and weights at the seam");
  for(let i=0;i+unique<knots.length;i++)if(Math.abs(knots[i+unique]-knots[i]-period)>32*Number.EPSILON*Math.max(Math.abs(knots[i]),Math.abs(knots[i+unique]),Math.abs(period)))throw Error("periodic knot extensions disagree with the finite period");
  curve=trimSpline(source);if(!validSpline(curve)||!splineClosed(curve))throw Error("periodic finite basis exceeds schema budget or does not close");
  conversion=`Periodic source normalized by exact homogeneous knot insertion to one finite nonperiodic period [${source.domain.join(", ")}]. WCS poles, rational weights and start seam preserved geometrically; cyclic editing/periodic flag is not retained on export.`;
 }else if(!!(flags&1)!==splineClosed(curve))throw Error("closed flag disagrees with finite endpoints");
 if(fit.length||tangents.some(v=>v.length))conversion=[conversion,"Explicit control/knot basis is authoritative; auxiliary fit points/tangents are not retained for fit editing."].filter(Boolean).join(" ");
 return {curve,conversion};
}
