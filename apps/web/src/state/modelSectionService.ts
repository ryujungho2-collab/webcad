import type {CadDocument,ModelSection} from "@agent-webcad/cad-document";
import {sectionSolid} from "../cad/kernelGeometryService";
import {getObjectTransform} from "../precision/objectTransform";
import {modelPlaneNormal,sectionDrawingGeometry,type SectionDrawing} from "../precision/modelSection";
export async function modelSectionDrawings(document:CadDocument,view:ModelSection,before?:CadDocument):Promise<SectionDrawing[]>{const result:SectionDrawing[]=[];
 const features=new Map(Object.values(document.features).map(f=>[f.output,f]));
 if(features.size!==Object.keys(document.features).length)throw Error("Ambiguous solid feature outputs.");
 const prior=before?.modelPresentation?.sections?.[view.id],priorFeatures=new Map(Object.values(before?.features??{}).map(f=>[f.output,f]));
 for(const partId of view.partIds){const part=document.modelPresentation?.parts[partId],object=part&&document.objects[part.objectId],feature=object&&features.get(object.id);
 if(!part||!object||!feature)throw Error(`Missing section source: ${part?.name??partId}. Rebind the stable part.`);
 const oldPart=before?.modelPresentation?.parts[partId],oldObject=oldPart&&before?.objects[oldPart.objectId],oldFeature=oldObject&&priorFeatures.get(oldObject.id);
 if(prior?.status==="resolved"&&prior.partIds.includes(partId)&&oldPart?.objectId===part.objectId&&oldObject&&oldFeature&&JSON.stringify([prior.basis,prior.height,prior.range])===JSON.stringify([view.basis,view.height,view.range])&&JSON.stringify([oldFeature.type,oldFeature.params,getObjectTransform(oldObject,oldFeature)])===JSON.stringify([feature.type,feature.params,getObjectTransform(object,feature)])){
  const entries=Object.entries(prior.outputs).filter(([,e])=>priorFeatures.get(e.objectId)?.params.sourcePartId===partId);
  if(entries.every(([key,e])=>view.outputs[key]?.objectId===e.objectId&&features.has(e.objectId))){
   const map=(p:number[])=>[view.origin[0]+(p[0]-prior.origin[0])/prior.scale*view.scale,view.origin[1]+(p[1]-prior.origin[1])/prior.scale*view.scale,0];
   for(const [sourceKey,e] of entries){const params={...priorFeatures.get(e.objectId)!.params};if(Array.isArray(params.controlPoints))params.controlPoints=(params.controlPoints as number[][]).map(map);if(Array.isArray(params.points))params.points=(params.points as number[][]).map(map);if(Array.isArray(params.center))params.center=map(params.center as number[]);if(typeof params.radius==="number")params.radius=params.radius/prior.scale*view.scale;for(const axis of ["axisU","axisV"])if(Array.isArray(params[axis]))params[axis]=(params[axis] as number[]).map(x=>x/prior.scale*view.scale);result.push({kind:e.kind,params,sourceKey,partId});}
   continue;
  }
 }
 const curves=await sectionSolid({params:feature.params,transform:getObjectTransform(object,feature)},modelPlaneNormal(view.basis),view.height);result.push(...sectionDrawingGeometry(view,partId,curves));}
 return result;
}
