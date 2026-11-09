import {CadEngine} from "../runtime/CadEngine";
import {intersect} from "./booleans";
import {volume} from "./measurements";
export type BrepDistancePoint={point:[number,number,number];elementId:string;support:"face"|"edge"|"vertex"};
export type BrepDistance={boundaryDistance:number;materialDistance?:number;source:BrepDistancePoint;target:BrepDistancePoint;relationship:"separated"|"contact"|"overlapping"|"source-contained"|"target-contained"|"coincident"|"indeterminate";tolerance:number;volumeTolerance:number;commonVolume?:number;sourceVolume:number;targetVolume:number;classificationError?:string};
/** World-space BRep boundaries. No meshing and no explorer indices persisted as identities. */
export async function measureBrepDistance(a:any,b:any,tolerance=1e-6):Promise<BrepDistance>{
 if(!Number.isFinite(tolerance)||tolerance<1e-7||tolerance>.01)throw Error("BRep distance tolerance must be between 1e-7 and 0.01 mm.");
 const {oc:instance}=await CadEngine.create(),oc=instance as unknown as Record<string,any>,owned:any[]=[];
 const own=<T>(v:T):T=>{owned.push(v);return v;};
 try{
  let solidCount=0;
  const closedOnly=(shape:any,depth=0)=>{if(depth>16)throw Error("BRep assembly nesting exceeds the distance budget.");const type=shape.ShapeType();if(type===oc.TopAbs_ShapeEnum.TopAbs_SOLID){if(++solidCount>64)throw Error("Distance supports at most 32 solids per object.");return;}if(type!==oc.TopAbs_ShapeEnum.TopAbs_COMPOUND&&type!==oc.TopAbs_ShapeEnum.TopAbs_COMPSOLID)throw Error("Distance requires closed solid bodies without free faces or shells.");const it=new oc.TopoDS_Iterator_2(shape,false,false);let count=0;try{while(it.More()){const child=it.Value();try{closedOnly(child,depth+1);}finally{child.delete();}count++;it.Next();}}finally{it.delete();}if(!count)throw Error("Empty BRep assembly.");};
  closedOnly(a);closedOnly(b);
  for(const shape of [a,b]){if(!shape||shape.IsNull())throw Error("Cannot measure an empty BRep.");const checker=own(new oc.BRepCheck_Analyzer(shape,true,false));if(!checker.IsValid_2())throw Error("Distance requires valid closed BRep solids.");const solids=own(new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));let count=0;while(solids.More()){if(++count>32)throw Error("Distance supports at most 32 solids per object.");solids.Next();}if(!count)throw Error("Distance requires closed BRep solids, not open faces or shells.");}
  const boundary=(shape:any)=>{const compound=own(new oc.TopoDS_Compound()),builder=own(new oc.BRep_Builder());builder.MakeCompound(compound);const ex=own(new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));let count=0;while(ex.More()){if(++count>4096)throw Error("Distance face budget exceeded (4096 per object).");const face=ex.Current();try{builder.Add(compound,face);}finally{face.delete();}ex.Next();}if(!count)throw Error("BRep has no finite boundary faces.");return compound;};
  const range=own(new oc.Message_ProgressRange_1()),distance=own(new oc.BRepExtrema_DistShapeShape_1());distance.SetDeflection(tolerance);distance.LoadS1(boundary(a));distance.LoadS2(boundary(b));distance.Perform(range);
  if(!distance.IsDone()||distance.NbSolution()<1)throw Error("OCCT could not converge to BRep boundary witnesses.");
  const boundaryDistance=distance.Value();if(!Number.isFinite(boundaryDistance)||boundaryDistance<0)throw Error("Non-finite BRep distance.");
  const witness=(side:1|2):BrepDistancePoint=>{const p=side===1?distance.PointOnShape1(1):distance.PointOnShape2(1),supportShape=side===1?distance.SupportOnShape1(1):distance.SupportOnShape2(1),box=new oc.Bnd_Box_1();let lo:any,hi:any,props:any;
   try{const point:[number,number,number]=[p.X(),p.Y(),p.Z()],type=supportShape.ShapeType(),support=type===oc.TopAbs_ShapeEnum.TopAbs_FACE?"face":type===oc.TopAbs_ShapeEnum.TopAbs_EDGE?"edge":"vertex";oc.BRepBndLib.AddOptimal(supportShape,box,false,false);lo=box.CornerMin();hi=box.CornerMax();props=new oc.GProp_GProps_1();if(support==="face")oc.BRepGProp.SurfaceProperties_1(supportShape,props,false,false);else if(support==="edge")oc.BRepGProp.LinearProperties(supportShape,props,false,false);
    const signature=[lo.X(),lo.Y(),lo.Z(),hi.X(),hi.Y(),hi.Z(),props.Mass()].map(n=>Math.abs(n)<1e-9?0:Number(n.toPrecision(12))).join(",");if(!point.every(Number.isFinite))throw Error("Invalid BRep witness.");return {point,support,elementId:`brep-${support}:${signature}`};
   }finally{props?.delete();hi?.delete();lo?.delete();box.delete();supportShape.delete();p.delete();}
  };
  const source=witness(1),target=witness(2),sourceVolume=Math.abs(await volume(a)),targetVolume=Math.abs(await volume(b));if(![sourceVolume,targetVolume].every(v=>Number.isFinite(v)&&v>0))throw Error("Distance requires positive-volume solids.");
  const volumeTolerance=Math.max(1e-12,Math.min(sourceVolume,targetVolume)*1e-9);
  let relationship:BrepDistance["relationship"]="separated",commonVolume:number|undefined,classificationError:string|undefined;
  // Positive boundary gap alone cannot distinguish separation from nesting.
  try{const common=own(await intersect(a,b));commonVolume=Math.abs(await volume(common));if(!Number.isFinite(commonVolume)||commonVolume>Math.min(sourceVolume,targetVolume)+volumeTolerance*10)throw Error("Unreliable common volume.");
   if(commonVolume>volumeTolerance){const allA=Math.abs(sourceVolume-commonVolume)<=volumeTolerance,allB=Math.abs(targetVolume-commonVolume)<=volumeTolerance;relationship=allA&&allB?"coincident":allA?"source-contained":allB?"target-contained":"overlapping";}
   else relationship=commonVolume>0?"indeterminate":boundaryDistance<=tolerance?"contact":"separated";
  }catch(e){relationship="indeterminate";commonVolume=undefined;classificationError=e instanceof Error?e.message:String(e);}
  return {boundaryDistance,...commonVolume!==undefined?{materialDistance:commonVolume>0?0:boundaryDistance}:{},source,target,relationship,tolerance,volumeTolerance,commonVolume,sourceVolume,targetVolume,...classificationError?{classificationError}:{}};
 }finally{for(const handle of owned.reverse())handle?.delete?.();}
}
