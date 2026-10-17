import type {CadDocument,ModelSheet} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import type {SheetLayoutReport} from "../precision/modelSheetLayout";
import {sheetAlignmentUnits} from "../precision/sheetAlignment";
import {autoSheetLayout} from "./modelSheetLayoutService";
export type SheetSetReport={denominator:number;pages:SheetLayoutReport[];attempts:{denominator:number;reason:string}[]};
type SetCommand=Extract<CadCommand,{type:"layout-model-sheet-set"}>;
export const sheetSetPages=(d:CadDocument,id:string):ModelSheet[]=>Object.values(d.modelPresentation?.sheets??{}).filter(s=>s.publication?.setId===id||s.id===id&&!s.publication).sort((a,b)=>(a.publication?.page??1)-(b.publication?.page??1));
export async function layoutSheetSet(d:CadDocument,c:SetCommand):Promise<SheetSetReport>{
 const existing=sheetSetPages(d,c.id),allowed=new Set(existing.map(s=>s.id));if(d.modelPresentation?.sheets?.[c.id]?.publication?.setId&&d.modelPresentation.sheets[c.id].publication!.setId!==c.id)throw Error("Choose the sheet set root page for editing.");
 for(const s of existing){if(d.artboards?.[s.artboardId]?.locked||[s.titleId,...s.publication?.frameIds??[]].some(id=>d.layers[d.objects[id]?.layerId]?.locked))throw Error("Unlock all pages and frame annotations before changing the sheet set.");}
 const source=structuredClone(d);if(!source.modelPresentation)throw Error("Create model views first.");for(const s of existing)delete source.modelPresentation.sheets![s.id];
 for(const id of c.viewIds){const v=source.modelPresentation.projections[id]??source.modelPresentation.sections?.[id];if(!v||v.status!=="resolved")throw Error("Choose resolved source views.");if(Object.values(d.modelPresentation?.sheets??{}).some(s=>!allowed.has(s.id)&&s.placements[id]))throw Error("A view belongs to a different sheet/set; remove it there first.");}
 const units=sheetAlignmentUnits(source,c.viewIds,c.alignment),attempts:SheetSetReport["attempts"]=[];let best:SheetSetReport|undefined;
 const footerHeight=c.template==="standard"?32:24;
 for(const n of [...new Set(c.denominators)].sort((a,b)=>a-b)){try{
  const pageIds:string[][]=[],pinned=new Set<string[]>();for(const unit of units){const fixed=unit.filter(id=>c.fixedViewIds.includes(id));if(!fixed.length)continue;if(fixed.length!==unit.length)throw Error("Fix or release the entire aligned group.");const owners=unit.map(id=>existing.find(s=>s.placements[id]));if(owners.some(s=>!s)||new Set(owners.map(s=>s!.id)).size!==1)throw Error("Fixed groups must belong to one existing page.");const page=owners[0]!.publication?.page??1;if(page>c.maxPages)throw Error("Fixed page exceeds the page limit.");while(pageIds.length<page)pageIds.push([]);pageIds[page-1].push(...unit);pinned.add(unit);}
  const tryPage=(ids:string[],index:number)=>autoSheetLayout(source,{...c,type:"auto-layout-model-sheet",id:`${c.id}:layout`,viewIds:ids,fixedViewIds:c.fixedViewIds.filter(id=>ids.includes(id)),denominators:[n],origin:[c.origin[0]+index*(c.size[0]+20),c.origin[1]],footerHeight,alignment:c.alignment});
  for(let i=0;i<pageIds.length;i++)if(pageIds[i].length)await tryPage(pageIds[i],i);
  for(const unit of units){if(pinned.has(unit))continue;let assigned=false;for(let i=0;i<pageIds.length;i++){try{await tryPage([...pageIds[i],...unit],i);pageIds[i].push(...unit);assigned=true;break;}catch{/* try another page without mutating */}}
   if(!assigned){const i=pageIds.length;if(i>=c.maxPages)throw Error(`Page limit ${c.maxPages} exceeded; choose a larger denominator or paper.`);await tryPage(unit,i);pageIds.push([...unit]);}
  }
  if(pageIds.some(ids=>!ids.length))throw Error("Fixed pages leave an empty page; release fixed groups before reducing/reordering pages.");
  const pages:SheetLayoutReport[]=[];for(let i=0;i<pageIds.length;i++)pages.push(await tryPage(pageIds[i],i));
  // Review all supplied scales; fewer pages wins, then the larger drawing scale.
  attempts.push({denominator:n,reason:`Fits ${pages.length} page(s); aligned groups remain together.`});if(!best||pages.length<best.pages.length)best={denominator:n,pages,attempts:[]};if(pages.length===1)break;
 }catch(e){attempts.push({denominator:n,reason:e instanceof Error?e.message:String(e)});}}
 if(!best)throw Error(`Sheet set overflow. ${attempts.map(a=>`1:${a.denominator}: ${a.reason}`).join(" | ")}`);
 const width=c.size[0]-2*c.margin-6,rows=[c.fields.drawingName,`Author: ${c.fields.author}${c.template==="compact"?` | Rev: ${c.fields.revision}`:""}`,`Revision: ${c.fields.revision}`,`Scale 1:${best.denominator} | Page ${best.pages.length}/${best.pages.length}`];if(rows.some(row=>Array.from(row).length*2.5*1.2>width))throw Error("Title block field exceeds its paper row. Shorten the field or choose a wider page.");return {...best,attempts};
}
