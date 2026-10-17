import {nativeSpline,type KernelSpline} from "./spline";
import {CadEngine} from "../runtime/CadEngine";
export type SectionPoint=[number,number,number];
export type SectionEllipse={kind:"ellipse";center:SectionPoint;axisU:SectionPoint;axisV:SectionPoint;startParam:number;sweep:number};
export type SectionCurve=KernelSpline|SectionEllipse|{kind:"line";points:[SectionPoint,SectionPoint]}|{kind:"circle"|"arc";center:SectionPoint;radius:number;points:[SectionPoint,SectionPoint,SectionPoint];sweep:number};
/** OCCT BRep × plane. Analytic curves stay analytic; native fitted spline basis
 * preserves the kernel intersection tolerance, never a mesh silhouette. */
export async function sectionShape(shape:any,normal:SectionPoint,height:number):Promise<SectionCurve[]>{
 const {oc}=await CadEngine.create();
 if(!normal.every(Number.isFinite)||Math.abs(Math.hypot(...normal)-1)>1e-8||!Number.isFinite(height))throw Error("Invalid section plane.");
 const plane=new oc.gp_Pln_4(...normal,-height),operation=new oc.BRepAlgoAPI_Section_5(shape,plane,false);
 let result:any,explorer:any;const curves:SectionCurve[]=[],seen=new Set<string>();
 const point=(p:any):SectionPoint=>{try{return [p.X(),p.Y(),p.Z()];}finally{p.delete();}};
 try{
  operation.Approximation(true);const progress=new oc.Message_ProgressRange_1();try{operation.Build(progress);}finally{progress.delete();}
  if(!operation.IsDone())throw Error("BRep section calculation failed.");result=operation.Shape();
  explorer=new oc.TopExp_Explorer_2(result,oc.TopAbs_ShapeEnum.TopAbs_EDGE as any,oc.TopAbs_ShapeEnum.TopAbs_SHAPE as any);
  while(explorer.More()){
   const current=explorer.Current(),edge=oc.TopoDS.Edge_1(current),adaptor=new oc.BRepAdaptor_Curve_2(edge);
   try{
    const first=adaptor.FirstParameter(),last=adaptor.LastParameter(),type=adaptor.GetType(),samples=[first,last,(first+last)/2].map(t=>point(adaptor.Value(t))) as [SectionPoint,SectionPoint,SectionPoint];let curve:SectionCurve;
    if(type===oc.GeomAbs_CurveType.GeomAbs_Line){if(Math.hypot(...samples[1].map((v,i)=>v-samples[0][i]))<1e-7){explorer.Next();continue;}curve={kind:"line",points:[samples[0],samples[1]]};}
    else if(type===oc.GeomAbs_CurveType.GeomAbs_Circle){const circle=adaptor.Circle();try{curve={kind:Math.abs(last-first-2*Math.PI)<1e-6?"circle":"arc",center:point(circle.Location()),radius:circle.Radius(),points:samples,sweep:last-first};}finally{circle.delete();}}
    else if(type===oc.GeomAbs_CurveType.GeomAbs_Ellipse){const ellipse=adaptor.Ellipse(),x=ellipse.XAxis(),y=ellipse.YAxis(),u=x.Direction(),v=y.Direction();try{curve={kind:"ellipse",center:point(ellipse.Location()),axisU:[u.X(),u.Y(),u.Z()].map(n=>n*ellipse.MajorRadius()) as SectionPoint,axisV:[v.X(),v.Y(),v.Z()].map(n=>n*ellipse.MinorRadius()) as SectionPoint,startParam:first,sweep:last-first};}finally{v.delete();u.delete();y.delete();x.delete();ellipse.delete();}}
    else if(type===oc.GeomAbs_CurveType.GeomAbs_BSplineCurve||type===oc.GeomAbs_CurveType.GeomAbs_BezierCurve)curve=await nativeSpline(adaptor,first,last);
    else throw Error("Section contains spline or unsupported curves. No sampled approximation is exported.");
    const key=JSON.stringify(curve.kind==="ellipse"||curve.kind==="spline"?curve:curve.kind==="line"?{kind:curve.kind,points:curve.points.map(p=>p.map(v=>Math.round(v*1e6))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}:{...curve,points:curve.kind==="arc"?curve.points.map(p=>p.map(v=>Math.round(v*1e6))):undefined,center:curve.center.map(v=>Math.round(v*1e6)),radius:Math.round(curve.radius*1e6)});
    if(!seen.has(key)){seen.add(key);curves.push(curve);}if(curves.length>2000)throw Error("Section exceeds 2,000 analytic edges.");
   }finally{adaptor.delete();edge.delete();current.delete();}
   explorer.Next();
  }
  return curves;
 }finally{explorer?.delete();result?.delete();operation.delete();plane.delete();}
}
