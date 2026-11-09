import {CadEngine} from "../runtime/CadEngine";

/** Conservative accounting model, NOT a malloc/live-allocation measurement.
 * Repeated topology visits intentionally overcount sharing. Unknown geometry
 * or traversal overflow makes the shape uncacheable, not uncomputable.
 * Call again after meshing: task clones can share native triangulations.
 */
export async function estimateShapeBytes(shape:any):Promise<number|undefined>{
 const {oc}=await CadEngine.create();let bytes=16384,visits=0;
 try{
  for(const [kind,cost] of [[oc.TopAbs_ShapeEnum.TopAbs_FACE,4096],[oc.TopAbs_ShapeEnum.TopAbs_EDGE,1024],[oc.TopAbs_ShapeEnum.TopAbs_VERTEX,128]] as const){
   const explorer=new oc.TopExp_Explorer_2(shape,kind as any,oc.TopAbs_ShapeEnum.TopAbs_SHAPE as any);
   try{while(explorer.More()){
    if(++visits>200000)return;bytes+=cost;const current=explorer.Current();
    try{
     if(kind===oc.TopAbs_ShapeEnum.TopAbs_FACE){const face=oc.TopoDS.Face_1(current);let surface:any,location:any,handle:any,tri:any;
      try{surface=new oc.BRepAdaptor_Surface_2(face,true);location=new oc.TopLoc_Location_1();const type=surface.GetType();
       if(type===oc.GeomAbs_SurfaceType.GeomAbs_BSplineSurface){const h=surface.BSpline();try{const b=h.get();bytes+=b.NbUPoles()*b.NbVPoles()*128+(b.NbUKnots()+b.NbVKnots())*32;}finally{h.delete();}}
       else if(type===oc.GeomAbs_SurfaceType.GeomAbs_BezierSurface){const h=surface.Bezier();try{const b=h.get();bytes+=b.NbUPoles()*b.NbVPoles()*128;}finally{h.delete();}}
       else if(![oc.GeomAbs_SurfaceType.GeomAbs_Plane,oc.GeomAbs_SurfaceType.GeomAbs_Cylinder,oc.GeomAbs_SurfaceType.GeomAbs_Cone,oc.GeomAbs_SurfaceType.GeomAbs_Sphere,oc.GeomAbs_SurfaceType.GeomAbs_Torus].includes(type))return;
       handle=oc.BRep_Tool.Triangulation(face,location,0 as any);if(!handle.IsNull()){tri=new oc.Poly_Triangulation_5(handle);bytes+=tri.NbNodes()*96+tri.NbTriangles()*24;}
      }finally{tri?.delete();handle?.delete();location?.delete();surface?.delete();face.delete();}
     }else if(kind===oc.TopAbs_ShapeEnum.TopAbs_EDGE){const edge=oc.TopoDS.Edge_1(current);let curve:any;
      try{curve=new oc.BRepAdaptor_Curve_2(edge);const type=curve.GetType();if(type===oc.GeomAbs_CurveType.GeomAbs_BSplineCurve){const h=curve.BSpline();try{const b=h.get();bytes+=b.NbPoles()*128+b.NbKnots()*32;}finally{h.delete();}}
       else if(type===oc.GeomAbs_CurveType.GeomAbs_BezierCurve){const h=curve.Bezier();try{bytes+=h.get().NbPoles()*128;}finally{h.delete();}}
       else if(![oc.GeomAbs_CurveType.GeomAbs_Line,oc.GeomAbs_CurveType.GeomAbs_Circle,oc.GeomAbs_CurveType.GeomAbs_Ellipse,oc.GeomAbs_CurveType.GeomAbs_Parabola,oc.GeomAbs_CurveType.GeomAbs_Hyperbola].includes(type))return;
      }finally{curve?.delete();edge.delete();}
     }
    }finally{current.delete();}explorer.Next();
   }}finally{explorer.delete();}
  }
  return Math.ceil(bytes*4);
 }catch{return;}
}
