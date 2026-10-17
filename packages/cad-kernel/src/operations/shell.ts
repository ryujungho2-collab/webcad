import { CadEngine } from "../runtime/CadEngine";
import { shapeToMesh } from "../mesh/shapeToMesh";

/** Inward thick-solid offset. Removed faces are resolved by exact persisted keys. */
export async function shellSolid(shape:any,thickness:number,faceKeys:string[]):Promise<any>{
  if(!Number.isFinite(thickness)||thickness<=1e-6||!faceKeys.length||new Set(faceKeys).size!==faceKeys.length)throw Error("Shell needs a positive thickness and distinct removed faces.");
  const {oc:instance}=await CadEngine.create(),oc=instance as unknown as Record<string,any>;
  const explorer=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const closing=new oc.TopTools_ListOfShape_1(),maker=new oc.BRepOffsetAPI_MakeThickSolid(),progress=new oc.Message_ProgressRange_1();
  const matches=new Map(faceKeys.map(key=>[key,0]));let count=0;
  try{
    while(explorer.More()){
      const face=oc.TopoDS.Face_1(explorer.Current());
      try{
        count++;const mesh=await shapeToMesh(face),key=mesh.faces[0]?.key;
        if(matches.has(key)){matches.set(key,matches.get(key)!+1);closing.Append_1(face);}
      }finally{face.delete();}
      explorer.Next();
    }
    if([...matches.values()].some(value=>value!==1))throw Error("Shell removed face is missing or ambiguous. Rebind the intended faces explicitly.");
    if(faceKeys.length>=count)throw Error("Shell must retain at least one source face.");
    maker.MakeThickSolidByJoin(shape,closing,-thickness,1e-6,oc.BRepOffset_Mode.BRepOffset_Skin,false,false,oc.GeomAbs_JoinType.GeomAbs_Intersection,true,progress);
    if(!maker.IsDone())throw Error("Shell thickness cannot produce a valid offset. Reduce thickness or change removed faces.");
    const result=maker.Shape();if(result.IsNull()){result.delete();throw Error("Shell produced an empty shape.");}
    const solids=new oc.TopExp_Explorer_2(result,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    let solidCount=0;try{while(solids.More()){solidCount++;solids.Next();}}finally{solids.delete();}
    if(solidCount!==1){result.delete();throw Error("Shell must produce exactly one solid.");}return result;
  }catch(cause){if(cause instanceof Error)throw cause;throw Error("Shell offset failed. Reduce thickness or change removed faces.");}
  finally{progress.delete();maker.delete();closing.delete();explorer.delete();}
}
