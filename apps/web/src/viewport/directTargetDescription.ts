import type { CadDocument } from "@agent-webcad/cad-document";
import type { DrawingTopology } from "../precision/drawingTopology";
import { constraintGeometryIds } from "../precision/sketchEditing";
import { constraintCaption } from "../state/canvasDimensionEdit";
import type { DirectTargetRef } from "./directSelection";

/** Document terminology for a persistent target; array positions only label it. */
export function describeDirectTarget(document:CadDocument,target:DirectTargetRef){
  const object=document.objects[target.objectId],feature=Object.values(document.features).find(f=>f.output===target.objectId),layer=object&&document.layers[object.layerId];
  if(!object?.visible||!layer?.visible||layer.locked||feature?.type!=="drawing")return undefined;
  const topology=feature.params.topology as DrawingTopology|undefined;
  const control=topology?.controls.find(c=>c.id===target.topologyId),segment=topology?.segments.find(c=>c.id===target.topologyId),curve=topology?.curves?.find(c=>c.id===target.topologyId);
  if(target.kind==="control"&&!control||target.kind==="segment"&&(!segment||segment.kind==="arc")||target.kind==="curve"&&!curve&&segment?.kind!=="arc")return undefined;
  const kind=String(feature.params.kind),index=control?.index??segment?.index??0;
  const label=target.kind==="curve"?"Curve":target.kind==="segment"?(["infinite-line","ray"].includes(kind)?"Direction definition":kind==="line"?"Segment":`Edge ${index+1}`):kind==="point"?"Point":kind==="infinite-line"||kind==="ray"?(index===0?"Origin":"Through point · direction"):control?.role==="center"?"Center":control?.role==="radius"?"Radius handle":control?.role==="start"?"Arc start":control?.role==="end"?"Arc end":kind==="line"?(index===0?"Start point":"End point"):`${kind==="rectangle"?"Corner":"Vertex"} ${index+1}`;
  const sameName=Object.values(document.objects).filter(o=>o.name===object.name).map(o=>o.id);
  const name=object.name+(sameName.length>1?` #${sameName.indexOf(object.id)+1}`:"");
  const sketch=typeof feature.params.sketchId==="string"?document.sketches?.[feature.params.sketchId]:undefined;
  const relations=sketch?.constraints.filter(c=>constraintGeometryIds(c).includes(object.id)).map(c=>({id:c.id,caption:constraintCaption(sketch,c),geometryIds:constraintGeometryIds(c)}))??[];
  return {name,label,plane:feature.params.workPlane==="XZ"||feature.params.workPlane==="YZ"?feature.params.workPlane:"XY",sketchId:sketch?.id,relations};
}

/** One tab stop and a deterministic order through the visible, editable grip group. */
export function nextDirectGrip<T>(handles:readonly T[],current:number,key:string){
  if(!handles.length)return -1;
  if(key==="Home")return 0;if(key==="End")return handles.length-1;
  if(["ArrowRight","ArrowDown"].includes(key))return (Math.max(0,current)+1)%handles.length;
  if(["ArrowLeft","ArrowUp"].includes(key))return (Math.max(0,current)-1+handles.length)%handles.length;
  return -1;
}
