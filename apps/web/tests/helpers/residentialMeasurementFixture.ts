import type {CadDocument,SavedMeasurementDefinition} from "@agent-webcad/cad-document";
import {enumerateSolidTopology} from "../../src/cad/kernelGeometryService";
export const residentialMeasurementSource=new URL("../../../../output/projects/residential-q1/residential.webcad.json",import.meta.url);
export async function residentialMeasurementDefinition(d:CadDocument):Promise<SavedMeasurementDefinition>{
 const wall=Object.values(d.features).find(f=>{const a=f.params.architecturalWall as {sourceObjectIds?:string[]}|undefined;return a?.sourceObjectIds?.some(id=>id.endsWith("entity-1"));})!,sofa=Object.values(d.features).find(f=>f.output.startsWith("content-")&&JSON.stringify(f.params).includes("sofa-plinth"))??Object.values(d.features).find(f=>f.output==="content-b952f3b5-da36-48e0-9995-f1e4569266d3")!;
 if(!wall||!sofa)throw Error("Residential source walls/furniture missing.");
 const [w,s]=await Promise.all([enumerateSolidTopology(wall.params),enumerateSolidTopology(sofa.params)]),face=w.faces.find(f=>f.key.split(":")[3]?.startsWith("5900.000000,"))!,maxX=Math.max(...s.edges.flatMap(e=>e.points.map(p=>p[0]))),edge=s.edges.find(e=>e.points.length>1&&e.points.every(p=>Math.abs(p[0]-maxX)<1e-5))!,view=Object.values(d.modelPresentation!.sections!).find(v=>v.basis==="XY")!;
 if(!face||!edge||!view)throw Error("Residential measurement topology is missing.");
 return {id:"residential-living-gap",name:"Living gap",source:{objectId:wall.output,kind:"brep-face",topologyId:face.key},target:{objectId:sofa.output,kind:"brep-edge",topologyId:edge.key},mode:"shortest",plane:"XY",drawingId:view.id,offset:[0,800],textHeight:2.5,visible:true};
}
