import type {CadDocument} from "@agent-webcad/cad-document";
/** Sheet ownership scopes output independently of overlapping canvas artboards. */
export function modelSheetOwnedIds(document:CadDocument,artboardId:string):string[]|undefined{
 const p=document.modelPresentation,s=Object.values(p?.sheets??{}).find(s=>s.artboardId===artboardId);if(!p||!s)return;
 const ids=new Set<string>([s.titleId,...s.publication?.frameIds??[]]),sources=new Set<string>();
 for(const viewId of Object.keys(s.placements)){const view=p.projections[viewId]??p.sections?.[viewId];if(!view)throw Error("Model sheet view is missing.");for(const entry of [...Object.values(view.outputs),...Object.values("decorations" in view?view.decorations??{}:{})])ids.add(entry.objectId);for(const partId of view.partIds){const part=p.parts[partId];if(part)sources.add(part.objectId);}}
 for(const f of Object.values(document.features)){const a=f.params.modelNote as {sourceObjectId?:string;sourceViewId?:string}|undefined;
 if((f.params.modelDrawingReference as {viewId?:string}|undefined)?.viewId&&s.placements[(f.params.modelDrawingReference as {viewId:string}).viewId]||a?.sourceViewId&&s.placements[a.sourceViewId]||a?.sourceObjectId&&(ids.has(a.sourceObjectId)||sources.has(a.sourceObjectId))||typeof f.params.sourceObjectId==="string"&&ids.has(f.params.sourceObjectId))ids.add(f.output);}
 return [...ids];
}
