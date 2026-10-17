import {autoSheetLayout,sheetViewGroups,relocateSheetNotes,refreshSheetLayoutGeometry} from "./modelSheetLayoutService";
import type {CadDocument,ModelSheet} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
export function registerModelSheetCommands(bus:CommandBus,d:CadDocument){
 bus.registerHandler("auto-layout-model-sheet",async c=>{
  if(c.type!=="auto-layout-model-sheet")return;const source=structuredClone(d),report=await autoSheetLayout(d,c),groups=sheetViewGroups(d,c.viewIds),old=Object.fromEntries(c.viewIds.map(id=>{const v=d.modelPresentation!.projections[id]??d.modelPresentation!.sections![id];return [id,{origin:[...v.origin] as [number,number],scale:v.scale}];}));
  await bus.dispatch({type:"upsert-model-sheet",id:c.id,name:c.name,artboardId:c.artboardId,origin:c.origin,size:c.size,denominator:report.denominator,placements:report.placements});relocateSheetNotes(d,groups,old);const title=Object.values(d.features).find(f=>f.output===d.modelPresentation!.sheets![c.id].titleId)!;title.params.point=[c.origin[0]+Math.max(c.margin,1),c.origin[1]+c.margin+4,0];await refreshSheetLayoutGeometry(d,source);return {createdIds:[c.artboardId],sheetLayout:report};
 });
 bus.registerHandler("upsert-model-sheet",async c=>{
  if(c.type!=="upsert-model-sheet")return;const p=d.modelPresentation;if(!p)throw Error("Create model views before a sheet.");const old=p.sheets?.[c.id],board=d.artboards?.[c.artboardId];if(Object.values(p.sheets??{}).some(s=>s.id!==c.id&&s.artboardId===c.artboardId))throw Error("An artboard belongs to one model sheet.");if(old?.publication)throw Error("Edit published pages through their sheet set.");if(board?.locked)throw Error("Unlock the sheet artboard first.");if(old&&old.artboardId!==c.artboardId)throw Error("Keep the existing sheet artboard identity.");
  for(const [id,position] of Object.entries(c.placements)){
   const view=p.projections[id]??p.sections?.[id];if(!view||view.status!=="resolved")throw Error("Choose resolved source views; rebind unresolved geometry first.");
   if(Object.values(p.sheets??{}).some(s=>s.id!==c.id&&s.placements[id]))throw Error("A view belongs to one sheet. Create another derived view for another sheet.");
   if(Object.values(view.outputs).some(e=>d.layers[d.objects[e.objectId]?.layerId]?.locked))throw Error("Unlock the view outputs before moving/scaling the sheet.");
   view.origin=[...position];view.scale=1/c.denominator;
  }
  if(board){const changed=JSON.stringify([board.origin,board.size,board.name,board.workPlane])!==JSON.stringify([c.origin,c.size,c.name,"XY"]);if(changed)await bus.dispatch({type:"update-artboard",artboardId:board.id,origin:c.origin,size:c.size,name:c.name,workPlane:"XY"});}
  else await bus.dispatch({type:"create-artboard",id:c.artboardId,name:c.name,workPlane:"XY",origin:c.origin,size:c.size});
  const titleId=old?.titleId??`sheet-title-${crypto.randomUUID()}`,params={kind:"text",workPlane:"XY",point:[c.origin[0]+5,c.origin[1]+5,0],height:3.5,text:`${c.name} · 1:${c.denominator}`,modelSheet:c.id};
  if(old){const o=d.objects[titleId],f=Object.values(d.features).find(f=>f.output===titleId);if(!o||!f||d.layers[o.layerId]?.locked)throw Error("Sheet title is missing or locked.");f.params=params;}
  else await bus.dispatch({type:"create-drafting",id:titleId,params});
  const sheet:ModelSheet={id:c.id,name:c.name,artboardId:c.artboardId,denominator:c.denominator,placements:structuredClone(c.placements),titleId};p.sheets??={};p.sheets[c.id]=sheet;d.revision++;return {createdIds:[c.artboardId]};
 });
 bus.registerHandler("delete-model-sheet",async c=>{if(c.type!=="delete-model-sheet")return;const p=d.modelPresentation,s=p?.sheets?.[c.sheetId];if(!s)throw Error("Choose a model sheet.");if(s.publication)throw Error("Delete published pages through their sheet set.");if(d.artboards?.[s.artboardId]?.locked||d.layers[d.objects[s.titleId]?.layerId]?.locked)throw Error("Unlock the sheet and its title first.");delete p!.sheets![s.id];await bus.dispatch({type:"delete-artboard",artboardId:s.artboardId});await bus.dispatch({type:"delete-object",objectId:s.titleId});d.revision++;});
}
export function assertModelSheets(d:CadDocument){for(const s of Object.values(d.modelPresentation?.sheets??{})){const board=d.artboards?.[s.artboardId];if(!board||board.workPlane!=="XY"||!d.objects[s.titleId])throw Error("Model sheet board/title is missing. Remove its sheet before deleting owned objects.");for(const id of s.publication?.frameIds??[]){const f=Object.values(d.features).find(f=>f.output===id);if(!d.objects[id]||f?.params.modelSheet!==s.id)throw Error("Edit owned frame objects through their sheet set.");}for(const [id,origin] of Object.entries(s.placements)){const v=d.modelPresentation!.projections[id]??d.modelPresentation!.sections?.[id];if(!v||v.scale!==1/s.denominator||JSON.stringify(v.origin)!==JSON.stringify(origin))throw Error("Edit paper placement/scale through the owning model sheet.");}}}
