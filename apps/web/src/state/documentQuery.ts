import { CAD_PRECISION, featureContract, type CadDocument, type GeometryMeasurement } from "@agent-webcad/cad-document";
import { inspectSolid } from "../cad/kernelGeometryService";
import { cadDocument } from "./cadDocument";
import { documentVersion, sameDocumentVersion } from "./documentSession";
import { getObjectTransform } from "../precision/objectTransform";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";
import { measureDrawing } from "../precision/measurements";
import {evaluateVariables,parameterTargets} from "@agent-webcad/cad-document";
import { buildDependencyGraph, createDependencyExplainer } from "./dependencyGraph";
import {extractSketchLoops} from "../precision/sketchProfiles";
import {profileRegionMeasurement} from "../precision/profileRegions";

export async function measureDocumentObject(document:CadDocument,objectId:string,features?:ReadonlyMap<string,import("@agent-webcad/cad-document").CadFeature>):Promise<GeometryMeasurement> {
  const object=document.objects[objectId], feature=features?features.get(objectId):Object.values(document.features).find(f=>f.output===objectId);
  if(!object||!feature)throw new Error(`Object does not exist: ${objectId}`);
  if((feature.params.modelProjection||feature.params.modelSection)&&feature.params.projectionStatus!=="resolved")throw new Error("Model projection source is unresolved. Rebind the derived view before measuring it.");
  const contract=featureContract(feature);
  if(contract.representation==="planar-region"){
    const result=extractSketchLoops(document,[objectId],{forRegeneration:true});if(!result.ok)throw Error(result.reason);
    const measurements=result.loops.map(loop=>profileRegionMeasurement(loop,loop.workPlane));
    return {basis:"analytic",lengthUnit:"mm",validity:"valid",area:measurements.reduce((s,m)=>s+m.area,0),length:measurements.reduce((s,m)=>s+m.length,0)};
  }
  if(contract.representation==="brep")return inspectSolid({params:structuredClone(feature.params),transform:getObjectTransform(object,feature)});
  if(contract.representation!=="analytic-curve")throw new Error("Annotations do not have a geometric measurement.");
  const geometry=getWorldDrawingGeometry(object,feature);
  if(!geometry)throw new Error("Unsupported drawing geometry.");
  if (["point", "infinite-line", "ray"].includes(geometry.kind)) return { basis: "analytic", lengthUnit: "mm", validity: "valid" };
  const curved=["circle","arc"].includes(geometry.kind)||Array.isArray(feature.params.bulges)&&feature.params.bulges.some(value=>Number(value)!==0);
  if(curved&&!geometry.uniformScale)throw new Error("Exact measurement of nonuniformly scaled curves requires an ellipse representation.");
  if(!geometry.ellipse&&!geometry.spline&&!geometry.planeAligned)throw new Error("Exact measurement requires a drawing aligned with its work plane.");
  const measured=measureDrawing({spline:geometry.spline,ellipse:geometry.ellipse,kind:geometry.kind,workPlane:geometry.workPlane,points:geometry.points,center:geometry.center,radius:geometry.radius,startAngle:geometry.startAngle,endAngle:geometry.endAngle,closed:geometry.closed,profileSegments:geometry.profileSegments});
  return {basis:"analytic",lengthUnit:"mm",area:measured.area,length:geometry.kind==="circle"?2*Math.PI*geometry.radius!:measured.distance};
}

/** Detached snapshot queries never expose writable document references to tools/agents. */
export async function queryCadDocument(objectIds?:string[],options:{signal?:AbortSignal;maxObjects?:number}={}) {
  options.signal?.throwIfAborted();
  const requested=[...new Set(objectIds??cadDocument.rootObjects)];
  if(options.maxObjects!==undefined&&requested.length>options.maxObjects)throw new Error(`Select at most ${options.maxObjects} objects to read.`);
  // Measurements and relationships never need original raster pixels.
  const version=documentVersion(),snapshot=structuredClone({...cadDocument,rasterAssets:undefined});
  const features=new Map(Object.values(snapshot.features).map(feature=>[feature.output,feature]));
  const dependencyGraph = buildDependencyGraph(snapshot);
  const explainDependencies = createDependencyExplainer(dependencyGraph);
  const objects=await Promise.all(requested.map(async id=>{
    options.signal?.throwIfAborted();
    const object=snapshot.objects[id],feature=features.get(id);
    if(!object||!feature)return {id,error:"Object does not exist"};
    const contract=featureContract(feature),layer=snapshot.layers[object.layerId];
    let measurement:GeometryMeasurement|undefined,error:string|undefined;
    if(contract.supportsExactMeasurement)try{measurement=await measureDocumentObject(snapshot,id,features);}catch(e){error=e instanceof Error?e.message:String(e);}
    options.signal?.throwIfAborted();
    const editabilityReasons=[!layer?"Source layer is missing.":layer.locked?`Layer ${layer.name} is locked.`:undefined,!object.visible?"Object is hidden.":undefined,layer?.visible===false?`Layer ${layer.name} is hidden.`:undefined].filter((value):value is string=>!!value);
    return {id,name:object.name,feature:structuredClone(feature),contract,transform:getObjectTransform(object,feature),
      visible:object.visible&&layer?.visible!==false,editable:object.visible&&layer?.visible===true&&!layer.locked,
      layer:layer?{id:layer.id,name:layer.name,locked:layer.locked,visible:layer.visible}:undefined,editabilityReasons,
      dependents:Object.values(snapshot.features).filter(f=>f.inputs.includes(id)).map(f=>f.output),dependencies:explainDependencies(id),measurement,error};
  }));
  return {version,stale:!sameDocumentVersion(version),units:CAD_PRECISION,objects,dependencyGraph,variables:evaluateVariables(snapshot.variables),bindings:structuredClone(snapshot.parameterBindings??{}),parameterTargets:parameterTargets(snapshot)};
}
