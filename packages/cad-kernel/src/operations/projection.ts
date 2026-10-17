import {nativeSpline} from "./spline";
import {CadEngine} from "../runtime/CadEngine";
import type {SectionCurve,SectionPoint} from "./section";
import {mergeProjectionConics,projectionCurveKey} from "./projectionConics";
import {intersect} from "./booleans";
export type ProjectionClip={normal:SectionPoint;height:number;keep:"positive"|"negative";depth:number};
/** Conservative analytic BRep bounds, including native shape tolerances.
 * An uncertain/touching boundary always falls through to exact clipping. */
export async function classifyProjectionSlab(shape:any,c:ProjectionClip):Promise<"inside"|"outside"|"intersect">{
 const {oc}=await CadEngine.create(),box=new oc.Bnd_Box_1();let a:any,b:any;
 try{oc.BRepBndLib.AddOptimal(shape,box,false,true);if(box.IsVoid()||box.IsOpen())return "intersect";a=box.CornerMin();b=box.CornerMax();const min=[a.X(),a.Y(),a.Z()],max=[b.X(),b.Y(),b.Z()],lo=c.keep==="negative"?c.height-c.depth:c.height,hi=lo+c.depth;
 const lower=c.normal.reduce((v,n,i)=>v+n*(n>=0?min[i]:max[i]),0),upper=c.normal.reduce((v,n,i)=>v+n*(n>=0?max[i]:min[i]),0),eps=1e-6;
 if(![lower,upper,lo,hi].every(Number.isFinite))return "intersect";
 return upper<lo-eps||lower>hi+eps?"outside":lower>lo+eps&&upper<hi-eps?"inside":"intersect";
 }finally{b?.delete();a?.delete();box.delete();}
}
/** Exact retained slab, bounded by two infinite OCCT half spaces. */
export async function clipProjectionShape(shape:any,c:ProjectionClip){
 if(!Array.isArray(c.normal)||c.normal.length!==3||!c.normal.every(Number.isFinite)||Math.abs(Math.hypot(...c.normal)-1)>1e-8||!Number.isFinite(c.height)||!Number.isFinite(c.depth)||c.depth<=1e-6||!["positive","negative"].includes(c.keep))throw Error("Invalid retained projection depth/plane.");
 const {oc}=await CadEngine.create();let result=shape.clone();
 for(const [height,sign] of [[c.height,c.keep==="negative"?-1:1],[c.height+(c.keep==="negative"?-c.depth:c.depth),c.keep==="negative"?1:-1]]){
  const plane=new oc.gp_Pln_4(...c.normal,-height),faceBuilder=new oc.BRepBuilderAPI_MakeFace_3(plane),face=faceBuilder.Face(),point=new oc.gp_Pnt_3(...c.normal.map(v=>v*(height+sign)) as SectionPoint),halfBuilder=new oc.BRepPrimAPI_MakeHalfSpace_1(face,point),half=halfBuilder.Solid();
  try{const next=await intersect(result,half);result.delete();result=next;}catch(e){result.delete();throw e;}finally{half.delete();halfBuilder.delete();point.delete();face.delete();faceBuilder.delete();plane.delete();}
 }
 return result;
}
export type ProjectionCurve={sourceIndex:number;hidden:boolean;edgeClass:"sharp"|"outline";curve:SectionCurve};

/** OCCT exact HLR across the complete assembly; returned edges live in paper XY.
 * Sharp V/H and silhouette OutLine only; Rg1/RgN smooth/seam and isolines are excluded.
 * No mesh hull, tessellation or unclassified edge is substituted for a curve. */
export async function projectShapes(shapes:any[],normal:SectionPoint,xAxis:SectionPoint):Promise<ProjectionCurve[]>{
 const {oc}=await CadEngine.create();
 const p=new oc.gp_Pnt_3(0,0,0),n=new oc.gp_Dir_4(...normal),x=new oc.gp_Dir_4(...xAxis),axes=new oc.gp_Ax2_2(p,n,x),projector=new oc.HLRAlgo_Projector_2(axes),algo=new oc.HLRBRep_Algo_1();
 let handle:any,output:any;const result:ProjectionCurve[]=[];
 try{
  for(const shape of shapes)algo.Add_2(shape,0);
  algo.Projector_1(projector);algo.Update();algo.Hide_1();handle=new oc.Handle_HLRBRep_Algo_2(algo);output=new oc.HLRBRep_HLRToShape(handle);
  const point=(v:any):SectionPoint=>{try{return [v.X(),v.Y(),0];}finally{v.delete();}};
  for(const [sourceIndex,source] of shapes.entries())for(const hidden of [false,true]){
   const seen=new Set<string>();
   for(const method of hidden?["HCompound_2","OutLineHCompound_2"]:["VCompound_2","OutLineVCompound_2"]){
    const shape=output[method](source);let explorer:any;
    try{
     if(shape.IsNull())continue;if(!oc.BRepLib.BuildCurves3d_2(shape))throw Error("Projection curves could not be reconstructed.");
     explorer=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE as any,oc.TopAbs_ShapeEnum.TopAbs_SHAPE as any);
     while(explorer.More()){
      const current=explorer.Current(),edge=oc.TopoDS.Edge_1(current),a=new oc.BRepAdaptor_Curve_2(edge);
      try{
       const first=a.FirstParameter(),last=a.LastParameter(),pts=[first,last,(first+last)/2].map(t=>point(a.Value(t))) as [SectionPoint,SectionPoint,SectionPoint];let curve!:SectionCurve;
       if(a.GetType()===oc.GeomAbs_CurveType.GeomAbs_Line){if(Math.hypot(pts[1][0]-pts[0][0],pts[1][1]-pts[0][1])<1e-7){explorer.Next();continue;}curve={kind:"line",points:[pts[0],pts[1]]};}
       else if(a.GetType()===oc.GeomAbs_CurveType.GeomAbs_Circle){const c=a.Circle();try{curve={kind:Math.abs(last-first-2*Math.PI)<1e-6?"circle":"arc",center:point(c.Location()),radius:c.Radius(),points:pts,sweep:last-first};}finally{c.delete();}}
       else if(a.GetType()===oc.GeomAbs_CurveType.GeomAbs_Ellipse){const e=a.Ellipse(),ax=e.XAxis(),ay=e.YAxis(),u=ax.Direction(),v=ay.Direction();try{curve={kind:"ellipse",center:point(e.Location()),axisU:[u.X()*e.MajorRadius(),u.Y()*e.MajorRadius(),0],axisV:[v.X()*e.MinorRadius(),v.Y()*e.MinorRadius(),0],startParam:first,sweep:last-first};}finally{v.delete();u.delete();ay.delete();ax.delete();e.delete();}}
       else if(a.GetType()===oc.GeomAbs_CurveType.GeomAbs_BSplineCurve){
        // OCCT reconstructs an edge-on conic as a degree-1 control polygon.
        // Only a nonrational, collinear, monotone polygon proves a line locus.
        const handle=a.BSpline(),b=handle.get();let linear=false;
        try{if(b.Degree()===1&&!b.IsRational()){const poles=Array.from({length:b.NbPoles()},(_,i)=>point(b.Pole(i+1))),p=poles[0],q=poles.at(-1)!,u=q.map((v,i)=>v-p[i]),length=Math.hypot(...u);if(length>1e-7){const fractions=poles.map(q=>q.reduce((s,v,i)=>s+(v-p[i])*u[i],0)/(length*length));linear=poles.every((q,i)=>Math.hypot(...q.map((v,j)=>v-p[j]-fractions[i]*u[j]))<=1e-7)&&fractions.every((t,i)=>i===0||t>=fractions[i-1]-1e-12);}}}finally{handle.delete();}
        if(!linear)curve=await nativeSpline(a,first,last);
        if(linear){if(Math.hypot(...pts[1].map((v,i)=>v-pts[0][i]))<1e-7){explorer.Next();continue;}curve={kind:"line",points:[pts[0],pts[1]]};}
       }
       else if(a.GetType()===oc.GeomAbs_CurveType.GeomAbs_BezierCurve)curve=await nativeSpline(a,first,last);
       else throw Error("Projection contains parabola/hyperbola/spline or unsupported curves; no sampled replacement is exported.");
       const key=method+":"+projectionCurveKey(curve);
       if(!seen.has(key)){seen.add(key);result.push({sourceIndex,hidden,edgeClass:method.startsWith("OutLine")?"outline":"sharp",curve});}if(result.length>10000)throw Error("Projection exceeds 10,000 analytic edges.");
      }finally{a.delete();edge.delete();current.delete();}
      explorer.Next();
     }
    }finally{explorer?.delete();shape.delete();}
   }
  }
  return mergeProjectionConics(result);
 }finally{output?.delete();if(handle)handle.delete();else algo.delete();projector.delete();axes.delete();x.delete();n.delete();p.delete();}
}
