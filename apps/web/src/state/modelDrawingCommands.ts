import {type CadDocument,type ModelSection} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {modelSectionDrawings} from "./modelSectionService";
import {createDrawingTopology} from "../precision/drawingTopology";
import {unchangedModelView} from "./modelViewRefresh";
import {preserveSectionCorrespondence} from "../precision/sectionCorrespondence";
import {syncSectionPresentation,hideSectionPresentation} from "./sectionPresentationService";
const presentation=(d:CadDocument)=>d.modelPresentation??={parts:{},explosions:{},projections:{},activeExplosionId:null};
const editable=(d:CadDocument,id:string)=>{const o=d.objects[id];if(!o||!d.layers[o.layerId]||d.layers[o.layerId].locked)throw Error("Derived drawing is missing or locked.");return o;};
const ownedParams=(view:ModelSection,g:Awaited<ReturnType<typeof modelSectionDrawings>>[number],topology:unknown)=>{const {sectionRole:_,sectionLineWeight:__,...params}=g.params;return {...params,...view.presentation?{sectionRole:"cut",sectionLineWeight:view.presentation.cutWeight}:{},kind:g.kind,modelSection:view.id,sourcePartId:g.partId,sourceKey:g.sourceKey,projectionStatus:"resolved",sectionFrame:{basis:view.basis,height:view.height,range:view.range??null,origin:[...view.origin],scale:view.scale},topology};};
export async function refreshModelSections(d:CadDocument,before?:CadDocument){
 const features=new Map(Object.values(d.features).map(f=>[f.output,f])),priorFeatures=new Map(Object.values(before?.features??d.features).map(f=>[f.output,f]));
 for(const view of Object.values(d.modelPresentation?.sections??{})){
  if(unchangedModelView(d,before,view))continue;
  try{let curves=await modelSectionDrawings(d,view,before);
   const candidatePrevious=before?.modelPresentation?.sections?.[view.id],savedPrevious=candidatePrevious&&JSON.stringify(candidatePrevious.outputs)===JSON.stringify(view.outputs)?candidatePrevious:undefined,previous=savedPrevious??view,priorDocument=savedPrevious?before!:d;
   const prior=Object.entries(previous.outputs).map(([sourceKey,e])=>{const f=(priorDocument===d?features:priorFeatures).get(e.objectId)!;
    const frame=(f.params.sectionFrame??{...previous,range:previous.range??null}) as {basis:string;height:number;range:unknown;origin:number[];scale:number},params={...f.params};
    const map=(p:number[])=>[view.origin[0]+(p[0]-frame.origin[0])/frame.scale*view.scale,view.origin[1]+(p[1]-frame.origin[1])/frame.scale*view.scale,0];
    if(Array.isArray(params.controlPoints))params.controlPoints=(params.controlPoints as number[][]).map(map);if(Array.isArray(params.points))params.points=(params.points as number[][]).map(map);if(Array.isArray(params.center))params.center=map(params.center as number[]);if(typeof params.radius==="number")params.radius=params.radius/frame.scale*view.scale;for(const axis of ["axisU","axisV"])if(Array.isArray(params[axis]))params[axis]=(params[axis] as number[]).map(x=>x/frame.scale*view.scale);
    return {sourceKey,partId:String(f.params.sourcePartId),kind:e.kind,params,frame};});
   if(prior.every(g=>JSON.stringify([g.frame.basis,g.frame.height,g.frame.range])===JSON.stringify([view.basis,view.height,view.range??null]))){
    curves=preserveSectionCorrespondence(prior,curves);
   }
   if(JSON.stringify(curves.map(g=>g.sourceKey).sort())!==JSON.stringify(Object.keys(view.outputs).sort()))throw Error("Section topology/crop correspondence changed. Review and rebind this section.");
   for(const g of curves){const id=view.outputs[g.sourceKey].objectId,o=d.objects[id],f=features.get(id);if(!o||!f)throw Error("Section output feature is missing.");const params=ownedParams(view,g,f.params.topology);if(JSON.stringify(f.params)!==JSON.stringify(params)||!o.visible){editable(d,id);f.params=params;o.visible=true;}}
   view.status="resolved";delete view.reason;await syncSectionPresentation(d,view,curves,before);
  }catch(cause){if(String(cause).includes("locked"))throw cause;view.status="unresolved";view.reason=cause instanceof Error?cause.message:String(cause);for(const entry of Object.values(view.outputs)){const o=d.objects[entry.objectId],f=Object.values(d.features).find(f=>f.output===entry.objectId);if(o&&f&&(o.visible||f.params.projectionStatus!=="unresolved")){editable(d,entry.objectId);o.visible=false;f.params.projectionStatus="unresolved";}}hideSectionPresentation(d,view);}
 }
}
export function registerModelDrawingCommands(bus:CommandBus,d:CadDocument){
 bus.registerHandler("set-model-clipping",c=>{if(c.type!=="set-model-clipping")return;const p=presentation(d);if(JSON.stringify(p.clipping)===JSON.stringify(c.clipping))return {accepted:false,reason:"Clipping is unchanged."};p.clipping=structuredClone(c.clipping);d.revision++;});
 bus.registerHandler("upsert-model-section",async c=>{
  if(c.type!=="upsert-model-section")return;const p=presentation(d),old=p.sections?.[c.view.id],layer=d.layers[c.view.layerId];if(!layer?.visible||layer.locked)throw Error("Choose a visible unlocked section layer.");
  if(old&&old.layerId!==c.view.layerId)throw Error("Keep the section layer or create another view.");
  const view:ModelSection={...structuredClone(c.view),status:"resolved",outputs:{},...old?.decorations?{decorations:structuredClone(old.decorations)}:{}},curves=await modelSectionDrawings(d,view);if(!curves.length)throw Error("No section edges inside this height/range. Adjust the cutting plane.");
  const used=new Set<string>();
  for(const g of curves){const prior=old?.outputs[g.sourceKey];let id=prior?.objectId;
   if(id){editable(d,id);used.add(id);const f=Object.values(d.features).find(f=>f.output===id)!;f.params=ownedParams(view,g,f.params.topology);d.objects[id].name=`${view.name} · ${p.parts[g.partId].name}`.slice(0,200);d.objects[id].visible=true;}
   else{id=`section-${crypto.randomUUID()}`;await bus.dispatch({type:"create-drawing",id,name:`${view.name} · ${p.parts[g.partId].name}`,drawing:g.kind,layerId:view.layerId,params:ownedParams(view,g,createDrawingTopology(g.kind,g.params,crypto.randomUUID()))});}
   view.outputs[g.sourceKey]={objectId:id,kind:g.kind,sourceKey:g.sourceKey};
  }
  // Explicit rebind removes retired outputs, keeping stable slots that still resolve.
  if(old)for(const entry of Object.values(old.outputs))if(!used.has(entry.objectId)){editable(d,entry.objectId);await bus.dispatch({type:"delete-object",objectId:entry.objectId});}
  await syncSectionPresentation(d,view,curves);p.sections??={};p.sections[view.id]=view;d.revision++;return {createdIds:Object.values(view.outputs).map(e=>e.objectId)};
 });
 bus.registerHandler("delete-model-section",async c=>{if(c.type!=="delete-model-section")return;const p=presentation(d),v=p.sections?.[c.viewId];if(!v)throw Error("Choose a saved section.");if(Object.values(p.sheets??{}).some(s=>s.placements[v.id]))throw Error("Remove this view from its sheet first.");for(const e of [...Object.values(v.outputs),...Object.values(v.decorations??{})])editable(d,e.objectId);await syncSectionPresentation(d,{...v,presentation:undefined},[]);delete p.sections![c.viewId];for(const e of Object.values(v.outputs))await bus.dispatch({type:"delete-object",objectId:e.objectId});d.revision++;});
}
