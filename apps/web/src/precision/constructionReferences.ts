import type {CadConstructionDefinition,CadConstructionElement,CadDocument} from "@agent-webcad/cad-document";
import type {DrawingTopology} from "./drawingTopology";
import {drawingReferenceGeometry} from "./drawingReference";
import type {WorkPlaneId} from "./workPlane";

export type ConstructionRole="segment"|"first"|"second"|"midpoint";
export function constructionRoles(definition:CadConstructionDefinition):ConstructionRole[]{
  return definition.operation==="midpoint"?["segment"]:definition.operation==="perpendicular-bisector"?["segment","midpoint"]:["first","second"];
}
export function constructionSource(definition:CadConstructionDefinition,role:ConstructionRole):string{
  if(role==="segment"&&"segmentId" in definition)return definition.segmentId;
  if(role==="midpoint"&&"midpointId" in definition)return definition.midpointId;
  return "firstId" in definition?role==="first"?definition.firstId:definition.secondId:"";
}
export function constructionElement(definition:CadConstructionDefinition,role:ConstructionRole){return role==="midpoint"?undefined:definition.elements?.[role];}
export function reassignConstructionSource(definition:CadConstructionDefinition,role:ConstructionRole,id:string,element?:CadConstructionElement):CadConstructionDefinition{
  const next=structuredClone(definition);
  if(next.operation==="intersection")delete next.branchBasis;
  if(role==="segment"&&"segmentId" in next)next.segmentId=id;
  else if(role==="midpoint"&&"midpointId" in next)next.midpointId=id;
  else if("firstId" in next){if(role==="first")next.firstId=id;else next.secondId=id;}
  if(role!=="midpoint"){
    const elements={...next.elements};delete elements[role];if(element)elements[role]=element;
    if(Object.keys(elements).length)next.elements=elements;else delete next.elements;
  }
  return next;
}

/** Choices use exactly the same saved topology resolution as command evaluation.
 * Read-only sources may be hidden or locked; their coordinates are never edited. */
export function constructionReferenceChoices(document:CadDocument,id:string,definition:CadConstructionDefinition,role:ConstructionRole,plane:WorkPlaneId){
  const object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id);
  if(!object||!feature)return [];
  const topology=feature.params.topology as DrawingTopology|undefined;
  const choices:{label:string;element?:CadConstructionElement}[]=[{label:"Whole object"}];
  if(role!=="midpoint"){
    if(role==="segment")choices.push({label:"Whole endpoint span",element:{span:"endpoints"}});
    for(const [i,s] of (topology?.segments??[]).entries())choices.push({label:`Edge ${i+1}`,element:{topologyId:s.id}},{label:`Edge ${i+1} start`,element:{topologyId:s.id,endpoint:"start"}},{label:`Edge ${i+1} end`,element:{topologyId:s.id,endpoint:"end"}});
    for(const [i,c] of (topology?.controls??[]).entries())choices.push({label:`${c.role} ${i+1}`,element:{topologyId:c.id}});
    for(const [i,c] of (topology?.curves??[]).entries())choices.push({label:`${c.kind} ${i+1}`,element:{topologyId:c.id}},{label:`${c.kind} ${i+1} start`,element:{topologyId:c.id,endpoint:"start"}},{label:`${c.kind} ${i+1} end`,element:{topologyId:c.id,endpoint:"end"}});
  }
  return choices.filter(choice=>{
    const geometry=drawingReferenceGeometry(object,feature,choice.element);
    if(!geometry?.planeAligned||geometry.workPlane!==plane)return false;
    return role==="segment"?geometry.kind==="line":definition.operation==="intersection"?["line","infinite-line","ray","circle","arc"].includes(geometry.kind):geometry.kind==="point";
  });
}

export function constructionUsesCenterLine(document:CadDocument,definition:CadConstructionDefinition){
  if(definition.operation!=="intersection")return false;
  return (["first","second"] as const).every(role=>{const id=constructionSource(definition,role),object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id);const g=object&&feature?drawingReferenceGeometry(object,feature,definition.elements?.[role]):undefined;return g?.kind==="circle"||g?.kind==="arc";});
}
