import {CadEngine} from "../runtime/CadEngine";
export type KernelSpline={kind:"spline";degree:number;controlPoints:[number,number,number][];knots:number[];weights?:number[];domain:[number,number]};
/** Construct an exact finite nonperiodic NURBS edge; no display samples enter the kernel. */
export function splineEdges(oc:any,s:KernelSpline,temps:{delete?:()=>void}[]){
 const n=s.controlPoints?.length,p=s.degree;
 if(!Number.isInteger(p)||p<1||p>8||!Array.isArray(s.controlPoints)||n<p+1||n>256||!s.controlPoints.every(q=>Array.isArray(q)&&q.length===3&&q.every(Number.isFinite))||!Array.isArray(s.knots)||s.knots.length!==n+p+1||!s.knots.every((v,i)=>Number.isFinite(v)&&(!i||v>=s.knots[i-1]))||!Array.isArray(s.domain)||s.domain.length!==2||!s.domain.every(Number.isFinite)||s.domain[0]<s.knots[p]||s.domain[1]>s.knots[n]||s.domain[0]>=s.domain[1]||s.weights!==undefined&&(!Array.isArray(s.weights)||s.weights.length!==n||!s.weights.every(w=>Number.isFinite(w)&&w>0)))throw Error("Invalid exact spline profile basis.");
 const unique:number[]=[],multiplicities:number[]=[];for(const knot of s.knots){if(unique.at(-1)===knot)multiplicities[multiplicities.length-1]++;else{unique.push(knot);multiplicities.push(1);}}
 if(multiplicities.some((m,i)=>m>(i===0||i===multiplicities.length-1?p+1:p)))throw Error("Invalid spline knot multiplicity.");
 const poles=new oc.TColgp_Array1OfPnt_2(1,n),weights=new oc.TColStd_Array1OfReal_2(1,n),knots=new oc.TColStd_Array1OfReal_2(1,unique.length),mults=new oc.TColStd_Array1OfInteger_2(1,unique.length);temps.push(poles,weights,knots,mults);
 s.controlPoints.forEach((q,i)=>{const point=new oc.gp_Pnt_3(...q);try{poles.SetValue(i+1,point);weights.SetValue(i+1,s.weights?.[i]??1);}finally{point.delete();}});unique.forEach((v,i)=>{knots.SetValue(i+1,v);mults.SetValue(i+1,multiplicities[i]);});
 const raw=new oc.Geom_BSplineCurve_2(poles,weights,knots,mults,p,false,true);let curve:any;try{curve=new oc.Handle_Geom_Curve_2(raw);}catch(error){raw.delete();throw error;}temps.push(curve);
 // The OCCT handle owns raw; deleting raw separately would invalidate retained shapes.
 // Split at exact knot spans so face integration respects the piecewise basis.
 const cuts=[s.domain[0],...unique.filter(v=>v>s.domain[0]&&v<s.domain[1]),s.domain[1]];return cuts.slice(0,-1).map((a,i)=>{const edge=new oc.BRepBuilderAPI_MakeEdge_25(curve,a,cuts[i+1]);temps.push(edge);return edge;});
}
/** Maximum certified deviation (mm) when a native curve above degree 8 is re-fitted. */
export const SPLINE_REFIT_TOLERANCE=1e-3;
/** Preserve native finite BSpline/Bezier domain, converting a private trimmed copy. */
export async function nativeSpline(adaptor:any,first:number,last:number):Promise<KernelSpline>{
 const {oc}=await CadEngine.create();let basis:any,base:any,trim:any,converted:any,rawTrim:any,approx:any,refit:any;
 try{basis=adaptor.GetType()===oc.GeomAbs_CurveType.GeomAbs_BezierCurve?adaptor.Bezier():adaptor.BSpline();base=new oc.Handle_Geom_Curve_2(basis.get());rawTrim=new oc.Geom_TrimmedCurve(base,first,last,true,true);trim=new oc.Handle_Geom_Curve_2(rawTrim);converted=oc.GeomConvert.CurveToBSplineCurve(trim,oc.Convert_ParameterisationType.Convert_TgtThetaOver2 as any);let c=converted.get();if(c.IsPeriodic())throw Error("Periodic kernel spline did not convert to a finite nonperiodic domain.");
  // HLR outlines and planar sections of loft/sweep surfaces arrive as degree 9–14
  // BSplines. Re-fit them to degree ≤ 8 only when OCCT certifies the deviation
  // within SPLINE_REFIT_TOLERANCE; otherwise keep rejecting as before.
  if(c.Degree()>8||c.NbPoles()>256){const source=new oc.Handle_Geom_Curve_2(c);try{approx=new oc.GeomConvert_ApproxCurve_1(source,SPLINE_REFIT_TOLERANCE/10,oc.GeomAbs_Shape.GeomAbs_C2 as ConstructorParameters<typeof oc.GeomConvert_ApproxCurve_1>[2],64,8);if(approx.IsDone()&&approx.HasResult()&&approx.MaxError()<=SPLINE_REFIT_TOLERANCE){refit=approx.Curve();c=refit.get();}}finally{source.delete();}}const controlPoints:[number,number,number][]=[],weights:number[]=[],knots:number[]=[];for(let i=1;i<=c.NbPoles();i++){const p=c.Pole(i);try{controlPoints.push([p.X(),p.Y(),p.Z()]);weights.push(c.Weight(i));}finally{p.delete();}}for(let i=1;i<=c.NbKnots();i++)for(let j=0;j<c.Multiplicity(i);j++)knots.push(c.Knot(i));if(c.Degree()>8||controlPoints.length>256)throw Error(`Kernel spline exceeds support budget: degree ${c.Degree()} / ${controlPoints.length} poles.`);return {kind:"spline",degree:c.Degree(),controlPoints,knots,...c.IsRational()?{weights}:{},domain:[c.FirstParameter(),c.LastParameter()]};
 }finally{refit?.delete();approx?.delete();converted?.delete();if(trim)trim.delete();else rawTrim?.delete();base?.delete();basis?.delete();}
}
/** Preserve an oversized native intersection as bounded exact finite domains. */
export async function nativeSplinePieces(adaptor:any,first:number,last:number,depth=0):Promise<KernelSpline[]>{
 try{return [await nativeSpline(adaptor,first,last)];}catch(error){
  if(depth>=8||!(error instanceof Error)||!/^Kernel spline exceeds support budget: degree [1-8] \/ /.test(error.message))throw error;
  const mid=(first+last)/2;return [...await nativeSplinePieces(adaptor,first,mid,depth+1),...await nativeSplinePieces(adaptor,mid,last,depth+1)];
 }
}
