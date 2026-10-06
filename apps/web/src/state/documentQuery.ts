import { CAD_PRECISION, featureContract, type CadDocument, type GeometryMeasurement } from "@agent-webcad/cad-document";
import { inspectSolid } from "../cad/kernelGeometryService";
import { cadDocument } from "./cadDocument";
import { documentVersion, sameDocumentVersion } from "./documentSession";
import { getObjectTransform } from "../precision/objectTransform";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { measureDrawing } from "../precision/measurements";
import {evaluateVariables,parameterTargets} from "@agent-webcad/cad-document";
import { buildDependencyGraph, createDependencyExplainer } from "./dependencyGraph";

export async function measureDocumentObject(document:CadDocument,objectId:string,features?:ReadonlyMap<string,import("@agent-webcad/cad-document").CadFeature>):Promise<GeometryMeasurement> {
  const object=document.objects[objectId], feature=features?features.get(objectId):Object.values(document.features).find(f=>f.output===objectId);
  if(!object||!feature)throw new Error(`Object does not exist: ${objectId}`);
  const contract=featureContract(feature);
  if(contract.representation==="brep")return inspectSolid({params:structuredClone(feature.params),transform:getObjectTransform(object,feature)});
  if(contract.representation!=="analytic-curve")throw new Error("Annotations do not have a geometric measurement.");
  const geometry=getWorldDrawingGeometry(object,feature);
  if(!geometry)throw new Error("Unsupported drawing geometry.");
  if (["point", "infinite-line", "ray"].includes(geometry.kind)) return { basis: "analytic", lengthUnit: "mm", validity: "valid" };
  const curved=["circle","arc"].includes(geometry.kind)||Array.isArray(feature.params.bulges)&&feature.params.bulges.some(value=>Number(value)!==0);
  if(curved&&!geometry.uniformScale)throw new Error("Exact measurement of nonuniformly scaled curves requires an ellipse representation.");
  if(!geometry.planeAligned)throw new Error("Exact measurement requires a drawing aligned with its work plane.");
  const measured=measureDrawing({kind:geometry.kind,workPlane:geometry.workPlane,points:geometry.points,center:geometry.center,radius:geometry.radius,startAngle:geometry.startAngle,endAngle:geometry.endAngle,closed:geometry.closed,profileSegments:geometry.profileSegments});
  return {basis:"analytic",lengthUnit:"mm",area:measured.area,length:geometry.kind==="circle"?2*Math.PI*geometry.radius!:measured.distance};
}

/** Detached snapshot queries never expose writable document references to tools/agents. */
export async function queryCadDocument(objectIds?:string[]) {
  const version=documentVersion(),snapshot=structuredClone(cadDocument);
  const ids=objectIds??snapshot.rootObjects;
  const dependencyGraph = buildDependencyGraph(snapshot);
  const explainDependencies = createDependencyExplainer(dependencyGraph);
  const objects=await Promise.all([...new Set(ids)].map(async id=>{
    const object=snapshot.objects[id],feature=Object.values(snapshot.features).find(f=>f.output===id);
    if(!object||!feature)return {id,error:"Object does not exist"};
    const contract=featureContract(feature),layer=snapshot.layers[object.layerId];
    let measurement:GeometryMeasurement|undefined,error:string|undefined;
    if(contract.supportsExactMeasurement)try{measurement=await measureDocumentObject(snapshot,id);}catch(e){error=e instanceof Error?e.message:String(e);}
    return {id,name:object.name,feature:structuredClone(feature),contract,transform:getObjectTransform(object,feature),
      visible:object.visible&&layer?.visible!==false,editable:object.visible&&layer?.visible===true&&!layer.locked,
      dependents:Object.values(snapshot.features).filter(f=>f.inputs.includes(id)).map(f=>f.output),dependencies:explainDependencies(id),measurement,error};
  }));
  return {version,stale:!sameDocumentVersion(version),units:CAD_PRECISION,objects,dependencyGraph,variables:evaluateVariables(snapshot.variables),bindings:structuredClone(snapshot.parameterBindings??{}),parameterTargets:parameterTargets(snapshot)};
}
