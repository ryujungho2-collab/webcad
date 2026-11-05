import {CadEngine} from "../runtime/CadEngine";
import {volume} from "./measurements";
type Point=[number,number,number];
export type PlanarBodyInput={version:1;tolerance:number;regions:{id:string;origin:Point;normal:Point;loops:Point[][];loopVertexIds?:string[][]}[];sharedTopology?:{version:1;vertices:{id:string;position:Point}[];edges:{id:string;vertices:[string,string];uses:{regionId:string;forward:boolean}[]}[]}};
/** Sew planar region faces, including their holes, into one checked closed solid. */
export async function reconstructPlanarSolid(definition:PlanarBodyInput):Promise<any>{
 const d=definition;let edges=0;
 if(!d||d.version!==1||!Number.isFinite(d.tolerance)||d.tolerance<1e-7||d.tolerance>1000||!Array.isArray(d.regions)||d.regions.length<4||d.regions.length>128||d.regions.some(r=>!r||!Array.isArray(r.loops)||!r.loops.length||r.loops.length>64||r.loops.some(l=>!Array.isArray(l)||l.length<3||(edges+=l.length)>4096||l.some(p=>!Array.isArray(p)||p.length!==3||p.some(n=>!Number.isFinite(n)||Math.abs(n)>1e9)))))throw Error("Invalid/budget-exceeding planar BRep definition.");
 const oc=(await CadEngine.create()).oc as any,owned:any[]=[],own=<T>(x:T)=>{owned.push(x);return x;};let result:any;
 try{
  const sharedVertices=new Map<string,any>(),sharedEdges=new Map<string,any>();
  if(d.sharedTopology){
   const t=d.sharedTopology;if(t.version!==1||t.vertices.length>1000||t.edges.length>4096)throw Error("Invalid shared topology budget.");
   for(const v of t.vertices){if(sharedVertices.has(v.id))throw Error("Duplicate shared vertex.");const maker=own(new oc.BRepBuilderAPI_MakeVertex(own(new oc.gp_Pnt_3(...v.position))));sharedVertices.set(v.id,own(maker.Vertex()));}
   for(const e of t.edges){const [a,b]=e.vertices.map(id=>sharedVertices.get(id));if(!a||!b||e.uses.length!==2||e.uses[0].forward===e.uses[1].forward||sharedEdges.has(e.id))throw Error("Invalid shared edge incidence.");const maker=own(new oc.BRepBuilderAPI_MakeEdge_2(a,b));if(!maker.IsDone())throw Error("Shared edge construction failed.");sharedEdges.set(e.id,own(maker.Edge()));}
  }
  const sewing=own(new oc.BRepBuilderAPI_Sewing(Math.max(1e-7,2*d.tolerance),true,true,true,false));
  for(const region of d.regions){let faceMaker:any;
   for(const [i,loop] of region.loops.entries()){
    let wire:any;
    if(d.sharedTopology){const ids=region.loopVertexIds?.[i];if(!ids||ids.length!==loop.length)throw Error("Missing shared boundary IDs.");const maker=own(new oc.BRepBuilderAPI_MakeWire_1());for(let j=0;j<ids.length;j++){const a=ids[j],b=ids[(j+1)%ids.length],key=JSON.stringify([a,b].sort()),edge=sharedEdges.get(key);if(!edge)throw Error("Missing shared boundary edge.");const occurrence=a<b?edge:own(oc.TopoDS.Edge_1(own(edge.Reversed())));maker.Add_1(occurrence);}if(!maker.IsDone())throw Error("Shared wire construction failed.");wire=own(maker.Wire());}
    else{const polygon=own(new oc.BRepBuilderAPI_MakePolygon_1());for(const p of loop)polygon.Add_1(own(new oc.gp_Pnt_3(...p)));polygon.Close();if(!polygon.IsDone())throw Error(`Cannot construct wire for ${region.id}.`);wire=own(polygon.Wire());}
    if(i===0)faceMaker=own(new oc.BRepBuilderAPI_MakeFace_15(wire,true));else faceMaker.Add(wire);
   }
   if(!faceMaker.IsDone())throw Error(`Cannot construct planar face ${region.id}.`);
   const face=own(faceMaker.Face()),check=own(new oc.BRepCheck_Analyzer(face,true,false));if(!check.IsValid_2())throw Error(`Invalid planar face/hole loops in ${region.id}.`);
   if(d.sharedTopology){const expected=new Set(region.loopVertexIds!.flatMap(ids=>ids.map((id,i)=>JSON.stringify([id,ids[(i+1)%ids.length]].sort())))),found=new Set<string>(),explorer=own(new oc.TopExp_Explorer_2(face,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));while(explorer.More()){const edge=own(explorer.Current()),key=[...expected].find(id=>edge.IsSame(sharedEdges.get(id)));if(!key)throw Error("Face construction did not retain the shared TopoDS_Edge identity.");found.add(key);explorer.Next();}if(found.size!==expected.size)throw Error("A shared boundary edge was lost in face construction.");}
   sewing.Add(face);
  }
  sewing.Perform(own(new oc.Message_ProgressRange_1()));
  if(sewing.NbFreeEdges()!==0||sewing.NbMultipleEdges()!==0||sewing.NbDegeneratedShapes()!==0||sewing.NbDeletedFaces()!==0)throw Error("Sewing did not produce a closed manifold shell without face loss.");
  const shape=own(sewing.SewedShape()),shell=own(oc.TopoDS.Shell_1(shape));if(!shell.Closed_1())throw Error("Sewn shell is not closed.");const maker=own(new oc.BRepBuilderAPI_MakeSolid_3(shell));if(!maker.IsDone())throw Error("Closed shell could not form one solid.");
  result=maker.Solid();const checker=own(new oc.BRepCheck_Analyzer(result,true,false));if(!checker.IsValid_2())throw Error("Reconstruction failed OpenCascade solid validity checks.");if(await volume(result)<=0)throw Error("Reconstruction failed positive outward-volume check.");
  const explorer=own(new oc.TopExp_Explorer_2(result,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));let count=0;while(explorer.More()){count++;explorer.Next();}if(count!==d.regions.length)throw Error("Reconstruction changed the recognized face count.");
  const interference=own(new oc.BRepAlgoAPI_Check_1());interference.SetData_1(result,true,true);interference.Perform(own(new oc.Message_ProgressRange_1()));if(!interference.IsValid())throw Error("Reconstruction failed exact small-edge/self-interference validation.");
  return result;
 }catch(error){result?.delete?.();throw error;}finally{owned.reverse().forEach(o=>o.delete?.());}
}
