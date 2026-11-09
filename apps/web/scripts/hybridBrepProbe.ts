/** Bounded feasibility experiment only. Not registered as a CAD command or conversion service. */
import {writeFile} from "node:fs/promises";
import {CadEngine,inspectShape} from "@agent-webcad/cad-kernel";
import {createPolygonMesh,meshTriangles,meshEdges,type EditableMesh} from "@agent-webcad/cad-document";
const start=performance.now(),oc=(await CadEngine.create()).oc as any,loadMs=performance.now()-start;
const capabilities=Object.fromEntries(["BRepBuilderAPI_Sewing","BRepBuilderAPI_MakeSolid_3","BRepBuilderAPI_MakePolygon_1","BRepBuilderAPI_MakeFace_15","GeomAPI_PointsToBSplineSurface_1","Geom_CylindricalSurface_1","BRepCheck_Analyzer"].map(name=>[name,typeof oc[name]==="function"]));
async function probe(label:string,mesh:EditableMesh,triangles:boolean){
 const begin=performance.now(),owned:any[]=[],own=<T>(value:T)=>{owned.push(value);return value;};
 try{
  const boundaries=meshEdges(mesh).filter(e=>e.faceIds.length!==2).length;
  if(boundaries)return {label,status:"rejected-open-input",boundaryEdges:boundaries,elapsedMs:performance.now()-begin};
  const sewing=own(new oc.BRepBuilderAPI_Sewing(1e-7,true,true,true,false)),positions=new Map(mesh.vertices.map(v=>[v.id,v.position]));
  const faces=triangles?meshTriangles(mesh).map(t=>t.vertices):mesh.faces.map(f=>f.vertices);
  for(const ids of faces){const polygon=own(new oc.BRepBuilderAPI_MakePolygon_1());for(const id of ids)polygon.Add_1(own(new oc.gp_Pnt_3(...positions.get(id)!)));polygon.Close();if(!polygon.IsDone())throw Error("Wire failure");const wire=own(polygon.Wire()),maker=own(new oc.BRepBuilderAPI_MakeFace_15(wire,true));if(!maker.IsDone())throw Error("Planar face failure");sewing.Add(own(maker.Face()));}
  sewing.Perform(own(new oc.Message_ProgressRange_1()));const freeEdges=sewing.NbFreeEdges(),multipleEdges=sewing.NbMultipleEdges();if(freeEdges||multipleEdges)throw Error(`Unsewn boundary: ${freeEdges}; nonmanifold: ${multipleEdges}`);
  const sewed=own(sewing.SewedShape()),shell=own(oc.TopoDS.Shell_1(sewed)),maker=own(new oc.BRepBuilderAPI_MakeSolid_3(shell));if(!maker.IsDone())throw Error("Solid failure");const solid=own(maker.Solid()),measurement=await inspectShape(solid);
  if(measurement.validity!=="valid"||Math.abs(measurement.volume-1000)>1e-6)throw Error("Solid validity/volume oracle failed");
  return {label,status:"valid-solid",inputFaces:faces.length,freeEdges,multipleEdges,measurement,elapsedMs:performance.now()-begin};
 }finally{owned.reverse().forEach(value=>value.delete?.());}
}
const cube=createPolygonMesh(10),cases=[];cases.push(await probe("triangle cube → 12 faceted faces",cube,true));cases.push(await probe("known six planar quad regions → 6 faces (no region recognition)",cube,false));const open=structuredClone(cube);open.faces.pop();cases.push(await probe("open cube is refused before sewing",open,true));
const report={loadMs,capabilities,cases,scope:"Controlled 10 mm cube fixtures only. No generic Mesh-to-BRep command, automatic segmentation, analytic fitting, watertight healing, parameter inference, or large-mesh performance claim."};
await writeFile("../../output/verification/hybrid-phase-5a/brep-feasibility.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
