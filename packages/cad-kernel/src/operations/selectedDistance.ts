import {CadEngine} from "../runtime/CadEngine";
import {shapeToMesh,meshDeflection} from "../mesh/shapeToMesh";
import {transformShape} from "./transforms";
import {fingerprintEdge} from "./topology";
export type BrepElementRef={kind:"brep-face"|"brep-edge";key:string};
export const SELECTED_DISTANCE_MODES=["shortest","project-XY","project-XZ","project-YZ","axis-X","axis-Y","axis-Z"] as const;
export type SelectedDistanceMode=typeof SELECTED_DISTANCE_MODES[number];
export type SelectedBrepDistance={distance:number;tolerance:number;source:[number,number,number];target:[number,number,number];mode:SelectedDistanceMode;accuracy:"kernel"|"within-tolerance"|"approximate";lower:number;upper:number;regularization?:number;witnessCorrection?:number;convergenceWarning?:string};
/** Resolve in params-local geometry before placement. Missing or ambiguous keys fail closed. */
export async function resolveDistanceElement(shape:any,ref:BrepElementRef):Promise<any>{
 const {oc:instance}=await CadEngine.create(),oc=instance as unknown as Record<string,any>;
 if(!ref||!["brep-face","brep-edge"].includes(ref.kind)||!ref.key)throw Error("Choose a valid face or edge.");
 const face=ref.kind==="brep-face";
 const ex=new oc.TopExp_Explorer_2(shape,face?oc.TopAbs_ShapeEnum.TopAbs_FACE:oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
 let result:any,index=0,count=0;const deflection=face?meshDeflection(oc,shape):undefined;
 try{while(ex.More()){if(++index>16384)throw Error("Selected topology budget exceeded.");const current=ex.Current();try{
 let key:string|undefined;
 if(face)key=(await shapeToMesh(current,deflection)).faces[0]?.key;
 else{const edge=oc.TopoDS.Edge_1(current),curve=new oc.BRepAdaptor_Curve_2(edge);try{const first=curve.FirstParameter(),last=curve.LastParameter(),samples:[number,number,number][]=[];for(let i=0;i<9;i++){const p=curve.Value(first+(last-first)*i/8);try{samples.push([p.X(),p.Y(),p.Z()]);}finally{p.delete();}}key=fingerprintEdge(samples)?.key;}finally{curve.delete();edge.delete();}}
 if(key===ref.key&&(!result||!current.IsSame(result))){count++;if(!result)result=current.clone();}
 }finally{current.delete();}ex.Next();}
 if(count!==1)throw Error("Selected face or edge is missing or ambiguous. Select it again.");const resolved=result;result=null;return resolved;
 }finally{result?.delete();ex.delete();}
}
/** OCCT measures trimmed faces/edges, never their tessellation or infinite extensions. */
export async function measureSelectedBrepDistance(a:any,b:any,tolerance=1e-6):Promise<SelectedBrepDistance>{
 if(!Number.isFinite(tolerance)||tolerance<1e-7||tolerance>.01)throw Error("Invalid selected distance tolerance.");
 const {oc:instance}=await CadEngine.create(),oc=instance as unknown as Record<string,any>,solver=new oc.BRepExtrema_DistShapeShape_1(),range=new oc.Message_ProgressRange_1();
 try{solver.SetDeflection(tolerance);solver.LoadS1(a);solver.LoadS2(b);solver.Perform(range);if(!solver.IsDone()||solver.NbSolution()<1)throw Error("Selected distance did not converge.");
 const point=(side:number):[number,number,number]=>{const p=side===1?solver.PointOnShape1(1):solver.PointOnShape2(1);try{return [p.X(),p.Y(),p.Z()];}finally{p.delete();}};
 const distance=solver.Value(),result:SelectedBrepDistance={distance,tolerance,source:point(1),target:point(2),mode:"shortest",accuracy:"kernel",lower:Math.max(0,distance-tolerance),upper:distance+tolerance};if(![result.distance,...result.source,...result.target].every(Number.isFinite))throw Error("Invalid selected witnesses.");return result;
 }finally{range.delete();solver.delete();}
}

/** Minimize each metric independently on native trimmed elements. A positive
 * regularization avoids invalid singular BRep transforms. The result reports
 * numerical bounds, never a certified interval or a 3D-distance component. */
export async function measureSelectedMetric(a:any,b:any,mode:SelectedDistanceMode="shortest",tolerance=.001):Promise<SelectedBrepDistance>{
 if(!SELECTED_DISTANCE_MODES.includes(mode))throw Error("Unsupported selected distance metric.");
 if(!Number.isFinite(tolerance)||tolerance<1e-6||tolerance>.01)throw Error("Selected metric tolerance must be between 1e-6 and 0.01 mm.");
 if(mode==="shortest")return measureSelectedBrepDistance(a,b);
 const {oc:instance}=await CadEngine.create(),oc=instance as unknown as Record<string,any>;
 const mask=["X","Y","Z"].map(axis=>mode.startsWith("axis-")?mode.endsWith(axis):mode.slice(8).includes(axis));
 const bounds=(shape:any)=>{const box=new oc.Bnd_Box_1();let lo:any,hi:any;try{oc.BRepBndLib.AddOptimal(shape,box,false,false);lo=box.CornerMin();hi=box.CornerMax();return [[lo.X(),lo.Y(),lo.Z()],[hi.X(),hi.Y(),hi.Z()]] as [number[],number[]];}finally{hi?.delete();lo?.delete();box.delete();}};
 const [al,ah]=bounds(a),[bl,bh]=bounds(b),origin=al.map((v,i)=>Math.min(v,bl[i])+(Math.max(ah[i],bh[i])-Math.min(v,bl[i]))/2);
 if(![...al,...ah,...bl,...bh,...origin].every(Number.isFinite))throw Error("Non-finite selected metric bounds.");
 const hiddenSpan=Math.hypot(...mask.map((keep,i)=>keep?0:Math.max(Math.abs(ah[i]-bl[i]),Math.abs(bh[i]-al[i]))));
 const snap=async(shape:any,point:[number,number,number])=>{const p=new oc.gp_Pnt_3(...point);let maker:any,vertex:any;try{maker=new oc.BRepBuilderAPI_MakeVertex(p);vertex=maker.Vertex();return await measureSelectedBrepDistance(vertex,shape,1e-7);}finally{vertex?.delete();maker?.delete();p.delete();}};
 let best:SelectedBrepDistance|undefined,lower=0,lastError:unknown;
 // At most three native refinements; the floor protects OCCT from singular shapes.
 const initial=Math.max(1e-5,Math.min(.001,tolerance*.25/Math.max(hiddenSpan,1)));
 for(const epsilon of [...new Set([Math.max(.001,initial),Math.max(.0001,initial),initial])]){
  const scale=mask.map(keep=>keep?1:epsilon),translation=origin.map((v,i)=>-v*scale[i]);let aa:any,bb:any;
  try{aa=await transformShape(a,{scale,translation});bb=await transformShape(b,{scale,translation});
   const weighted=await measureSelectedBrepDistance(aa,bb,1e-7),unmap=(p:number[])=>p.map((v,i)=>v/scale[i]+origin[i]) as [number,number,number];
   const sa=await snap(a,unmap(weighted.source)),sb=await snap(b,unmap(weighted.target)),source=sa.target,target=sb.target;
   const distance=Math.hypot(...source.map((v,i)=>mask[i]?v-target[i]:0)),correction=Math.max(sa.distance,sb.distance);
   lower=Math.max(lower,weighted.distance-epsilon*hiddenSpan-1e-7);
   if(!best||distance<best.distance)best={distance,tolerance,source,target,mode,accuracy:"approximate",lower:0,upper:distance+1e-7,regularization:epsilon,witnessCorrection:correction};
   if(best.upper-Math.max(0,lower)<=tolerance)break;
  }catch(e){lastError=e;}finally{bb?.delete();aa?.delete();}
 }
 if(!best)throw Error(`Projected BRep metric could not converge: ${lastError instanceof Error?lastError.message:String(lastError)}`);
 const inconsistent=lower>best.distance+Math.max(1e-6,tolerance*.1),largeCorrection=(best.witnessCorrection??0)>tolerance;
 best.lower=inconsistent?0:Math.max(0,Math.min(best.distance,lower));best.accuracy=!inconsistent&&!largeCorrection&&best.upper-best.lower<=tolerance?"within-tolerance":"approximate";
 if(inconsistent||largeCorrection)best.convergenceWarning=inconsistent?"Numerical bounds disagree; treat the result as approximate.":"Native witness recovery exceeded the target tolerance.";
 return best;
}
