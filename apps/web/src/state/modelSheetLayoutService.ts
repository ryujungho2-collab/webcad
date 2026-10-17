import {orthographicSharedOrigin} from "../precision/sheetAlignment";
import {sheetAlignmentUnits} from "../precision/sheetAlignment";
import type {CadDocument} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {refreshDrafting} from "../precision/draftingGeometry";
import {getObjectTransform} from "../precision/objectTransform";
import {sheetGroupBounds,packSheetGroups,type SheetLayoutReport} from "../precision/modelSheetLayout";
import {refreshModelProjections} from "./modelPresentationCommands";
import {refreshModelSections} from "./modelDrawingCommands";
import {refreshModelNotes} from "./modelNoteCommands";
import {refreshAssociativeDimensions} from "./dimensionRefresh";
type AutoSheet=Extract<CadCommand,{type:"auto-layout-model-sheet"}>&{alignment?:"none"|"orthographic";footerHeight?:number};
const view=(d:CadDocument,id:string)=>d.modelPresentation!.projections[id]??d.modelPresentation!.sections?.[id];
export function sheetViewGroups(d:CadDocument,ids:string[]){const groups=Object.fromEntries(ids.map(id=>[id,[...Object.values(view(d,id)?.outputs??{}),...Object.values(d.modelPresentation?.sections?.[id]?.decorations??{})].map(o=>o.objectId)]));
 for(const f of Object.values(d.features)){const a=f.params.modelNote as {sourceViewId?:string;sourceObjectId?:string}|undefined,ref=f.params.modelDrawingReference as {viewId?:string}|undefined;let matches:string[]=[];
  const linked=a?.sourceViewId??ref?.viewId;if(linked){if(ids.includes(linked))matches=[linked];}
  else{const source=a?.sourceObjectId??f.params.sourceObjectId;if(typeof source==="string")matches=ids.filter(id=>groups[id].includes(source)||!!a&&view(d,id).partIds.some(part=>d.modelPresentation!.parts[part]?.objectId===source));}
  if(a&&matches.length&&!linked&&!ids.some(id=>Object.values(view(d,id).outputs).some(o=>o.objectId===a.sourceObjectId)))throw Error("Attach model-part notes to derived view outputs before automatic layout.");
  if(matches.length>1)throw Error("An annotation belongs to multiple selected views. Attach it to a derived view before automatic layout.");if(matches.length){if(f.type!=="drawing"){const t=getObjectTransform(d.objects[f.output],f);if(t.translation.some(x=>x!==0)||t.rotation.some(x=>x!==0)||t.scale.some(x=>x!==1))throw Error("Reset transformed annotation objects before automatic layout; use their paper position/offset instead.");}groups[matches[0]].push(f.output);}
 }return groups;
}
/** Move the whole note group intentionally; paper font height and frozen measured values are preserved. */
export function relocateSheetNotes(d:CadDocument,groups:Record<string,string[]>,old:Record<string,{origin:[number,number];scale:number}>){const features=new Map(Object.values(d.features).map(f=>[f.output,f]));for(const [id,ids] of Object.entries(groups)){const v=view(d,id),prior=old[id],r=v.scale/prior.scale,map=(p:number[])=>[v.origin[0]+(p[0]-prior.origin[0])*r,v.origin[1]+(p[1]-prior.origin[1])*r,...p.slice(2)];for(const objectId of ids){const f=features.get(objectId);if(!f?.params.modelNote)continue;const a=f.params.modelNote as {point:number[];mode:string};const before=JSON.stringify(f.params);a.point=map(a.point);if(a.mode==="snapshot")f.params.points=(f.params.points as number[][]).map(map);if(before!==JSON.stringify(f.params)&&d.layers[d.objects[objectId].layerId]?.locked)throw Error("Unlock associated annotations before automatic layout.");}}}
export async function refreshSheetLayoutGeometry(d:CadDocument,before?:CadDocument){await refreshModelProjections(d,before);await refreshModelSections(d,before);await refreshModelNotes(d);refreshAssociativeDimensions(d);refreshDrafting(d);}
export async function autoSheetLayout(d:CadDocument,c:AutoSheet):Promise<SheetLayoutReport>{
 if(!d.modelPresentation)throw Error("Create resolved model views first.");for(const id of c.viewIds){const v=view(d,id);if(!v||v.status!=="resolved")throw Error("Select resolved views; rebind unresolved sources first.");if(Object.values(d.modelPresentation.sheets??{}).some(s=>s.id!==c.id&&s.placements[id]))throw Error("A selected view already belongs to another sheet.");}
 if(c.margin*2>=Math.min(...c.size)||c.origin.some(x=>!Number.isFinite(x)))throw Error("Margins leave no usable paper area.");
 const groups=sheetViewGroups(d,c.viewIds),old=Object.fromEntries(c.viewIds.map(id=>[id,{origin:[...view(d,id).origin] as [number,number],scale:view(d,id).scale}])),attempts:SheetLayoutReport["attempts"]=[];
 const measure=typeof document==="undefined"?undefined:(()=>{const ctx=document.createElement("canvas").getContext("2d");return ctx?(text:string,height:number)=>{ctx.font="48px system-ui";return (ctx.measureText(text).width+8)*height/48;}:undefined;})();
 for(const n of [...new Set(c.denominators)].sort((a,b)=>a-b)){try{
  if(c.fixedViewIds.some(id=>Math.abs(view(d,id).scale-1/n)>1e-10))throw Error("Fixed groups require their existing common scale; release them to change scale.");
  const candidate=structuredClone(d);for(const id of c.viewIds){const v=view(candidate,id);v.scale=1/n;if(!c.fixedViewIds.includes(id))v.origin=[0,0];}
  relocateSheetNotes(candidate,groups,old);await refreshSheetLayoutGeometry(candidate,d);let b=Object.fromEntries(c.viewIds.map(id=>[id,sheetGroupBounds(candidate,groups[id],measure)]));
  const beforeAlignment=structuredClone(candidate),units=sheetAlignmentUnits(candidate,c.viewIds,c.alignment),stage=Object.fromEntries(c.viewIds.map(id=>[id,{origin:[...view(candidate,id).origin] as [number,number],scale:view(candidate,id).scale}]));
  for(const unit of units){if(unit.length<2)continue;const fixed=unit.filter(id=>c.fixedViewIds.includes(id));if(fixed.length&&fixed.length!==unit.length)throw Error("Fix or release the whole aligned view group.");const front=unit.find(id=>candidate.modelPresentation!.projections[id].basis==="XZ");if(!front)continue;const top=unit.find(id=>candidate.modelPresentation!.projections[id].basis==="XY"),right=unit.find(id=>candidate.modelPresentation!.projections[id].basis==="YZ");
   if(fixed.length){if(top&&Math.abs(view(candidate,top).origin[0]-view(candidate,front).origin[0])>1e-7||right&&Math.abs(view(candidate,right).origin[1]-view(candidate,front).origin[1])>1e-7)throw Error("Fixed views are not orthographically aligned; release the whole group.");}
   else{if(top)view(candidate,top).origin=[orthographicSharedOrigin(view(candidate,front).origin[0]),b[front][3]-b[top][1]+c.gap];if(right)view(candidate,right).origin=[Math.max(b[front][2],top?b[top][2]:b[front][2])-b[right][0]+c.gap,orthographicSharedOrigin(view(candidate,front).origin[1])];}
  }
  relocateSheetNotes(candidate,groups,stage);await refreshSheetLayoutGeometry(candidate,beforeAlignment);b=Object.fromEntries(c.viewIds.map(id=>[id,sheetGroupBounds(candidate,groups[id],measure)]));for(const unit of units)for(let i=0;i<unit.length;i++)for(let j=i+1;j<unit.length;j++){const a=b[unit[i]],z=b[unit[j]];if(a[0]<z[2]+c.gap-1e-7&&a[2]>z[0]-c.gap+1e-7&&a[1]<z[3]+c.gap-1e-7&&a[3]>z[1]-c.gap+1e-7)throw Error("Aligned view annotation bounds overlap; release fixed views or increase spacing.");}const union=Object.fromEntries(units.map(unit=>[unit[0],[Math.min(...unit.map(id=>b[id][0])),Math.min(...unit.map(id=>b[id][1])),Math.max(...unit.map(id=>b[id][2])),Math.max(...unit.map(id=>b[id][3]))] as [number,number,number,number]]));
  const area:[number,number,number,number]=[c.origin[0]+c.margin,c.origin[1]+c.margin+(c.footerHeight??10),c.origin[0]+c.size[0]-c.margin,c.origin[1]+c.size[1]-c.margin],packed=packSheetGroups(union,units.filter(u=>u.some(id=>c.fixedViewIds.includes(id))).map(u=>u[0]),area,c.gap),placements:Record<string,[number,number]>={},finalBounds:typeof b={};for(const unit of units)for(const id of unit){const v=view(candidate,id),s=packed.shifts[unit[0]];placements[id]=[v.origin[0]+s[0],v.origin[1]+s[1]];finalBounds[id]=[b[id][0]+s[0],b[id][1]+s[1],b[id][2]+s[0],b[id][3]+s[1]];}
  // The footer title is a separate reserved paper band, never silently clipped.
  const title=`${c.name} · 1:${n}`;if(c.footerHeight===undefined&&Math.max(Array.from(title).length*3.5*1.2,measure?.(title,3.5)??0)>c.size[0]-2*Math.max(c.margin,1))throw Error("Sheet title exceeds the page width; shorten the name.");
  return {paper:{origin:[...c.origin],size:[...c.size],margin:c.margin,gap:c.gap},denominator:n,placements,bounds:finalBounds,attempts:[...attempts,{denominator:n,reason:"Fits: no group overlap or paper clipping."}]};
 }catch(e){attempts.push({denominator:n,reason:e instanceof Error?e.message:String(e)});}}
 throw Error(`Automatic sheet overflow. ${attempts.map(a=>`1:${a.denominator}: ${a.reason}`).join(" | ")} Choose larger paper, larger denominators, release fixed groups or fewer views.`);
}
