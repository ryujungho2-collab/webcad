import type {CadDocument,CadArtboard,CadFrameSheet} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {packSheetGroups,type PaperBounds} from "./modelSheetLayout";
import {frameLinkView,linkedFrameOrigin,assertFrameLinkSource,frameLinkAnnotations} from "./frameLinks";
import {assertFrameMembers,frameSourceMapping} from "./drawingFrame";
import {sheetAlignmentUnits} from "./sheetAlignment";
type Command=Extract<CadCommand,{type:"layout-frame-sheet-set"}>;
export const frameSheetPages=(d:CadDocument,id:string)=>Object.values(d.artboards??{}).filter(b=>b.frameSheet?.setId===id).sort((a,b)=>a.frameSheet!.page-b.frameSheet!.page);
export function frameSheetLinkSignature(d:CadDocument,ids:string[]){return JSON.stringify(Object.values(d.frameLinks??{}).filter(l=>ids.includes(l.fromId)||ids.includes(l.toId)).sort((a,b)=>a.id.localeCompare(b.id)));}
export function frameSheetCaption(source:CadArtboard,others:CadArtboard[]){
 const label=`${source.name} · 1:${source.frame!.denominator}`,font=Math.min(1.5,source.size[0]/(Array.from(label).length*1.2));if(font<1)throw Error("Frame caption cannot fit at this scale; shorten the frame name or use a larger scale.");const point:[number,number]=[source.origin[0]+source.size[0]/2,source.origin[1]+source.size[1]+3];
 if(others.some(b=>b.id!==source.id&&point[0]+source.size[0]/2>b.origin[0]&&point[0]-source.size[0]/2<b.origin[0]+b.size[0]&&point[1]+font>b.origin[1]&&point[1]-font<b.origin[1]+b.size[1]))throw Error("Frame captions overlap another crop; increase connected frame gaps or use a larger scale.");
 return {position:point,text:label,size:font,align:"center" as const,color:"#303030"};
}
/** Paper instances retain their crop and scale; workspace translations are independent. */
export function layoutFrameSheets(d:CadDocument,c:Command):{boards:CadArtboard[];attempts:string[];frameIds:string[]}{
 const ids:string[]=[];for(const id of c.sectionIds){const area=d.workspaceSections?.[id];if(!area)throw Error("Work area is missing.");for(const f of area.frameIds)if(!ids.includes(f))ids.push(f);}
 for(const id of c.frameIds)if(!ids.includes(id))ids.push(id);
 // Selecting any endpoint includes its entire connected tree, even across areas.
 const links=Object.values(d.frameLinks??{});for(let i=0;i<ids.length;i++)for(const l of links)if(l.fromId===ids[i]||l.toId===ids[i])for(const id of [l.fromId,l.toId])if(!ids.includes(id))ids.push(id);
 if(!ids.length)throw Error("Select at least one drawing frame or nonempty area.");
 const boards=ids.map(id=>{const b=d.artboards?.[id];if(!b?.frame)throw Error("Choose drawing frames, not paper sheets.");assertFrameMembers(d,b.frame.memberIds,b.workPlane);frameSourceMapping(d,b.frame.memberIds);frameLinkAnnotations(d,b);return b;});
 if(new Set(boards.map(b=>b.workPlane)).size!==1)throw Error("A sheet set requires one presentation plane.");
 const plane=boards[0].workPlane,positions=Object.fromEntries(boards.map(b=>[b.id,[...b.origin] as [number,number]]));
 const parent=new Map(ids.map(id=>[id,id]));const root=(id:string):string=>parent.get(id)===id?id:root(parent.get(id)!);const join=(a:string,b:string)=>parent.set(root(b),root(a));
 for(const l of links.filter(l=>ids.includes(l.fromId))){assertFrameLinkSource(d,l);const expected=linkedFrameOrigin(d,l);if(expected.some((v,i)=>Math.abs(v-d.artboards![l.toId].origin[i])>1e-6))throw Error("Review connected frame layout before making sheets.");join(l.fromId,l.toId);}
 if(c.alignment==="orthographic"){
  const byView=new Map<string,string>();for(const b of boards){const v=frameLinkView(d,b);if(v&&!v.section){if(byView.has(v.id))throw Error("Choose one frame per derived view for orthographic alignment.");byView.set(v.id,b.id);}}
  for(const views of sheetAlignmentUnits(d,[...byView.keys()],"orthographic")){if(views.length<2)continue;const front=byView.get(views.find(id=>d.modelPresentation!.projections[id].basis==="XZ")!)!;
   for(const id of views){const target=byView.get(id)!;if(root(front)===root(target))continue;if(ids.some(other=>other!==target&&root(other)===root(target))||ids.some(other=>other!==front&&root(other)===root(front)&&!views.some(view=>byView.get(view)===other)))throw Error("Connect these orthographic groups explicitly before automatic alignment.");
    const basis=d.modelPresentation!.projections[id].basis;const l={id:"alignment",fromId:front,toId:target,placement:basis==="XY"?"above" as const:"right" as const,gap:c.gap,fixed:false,reference:{kind:"orthographic" as const,fromView:"front" as const,toView:basis==="XY"?"top" as const:"right" as const}};assertFrameLinkSource(d,l);positions[target]=linkedFrameOrigin(d,l);join(front,target);
   }
  }
 }
 const units:Record<string,string[]>={};for(const id of ids)(units[root(id)]??=[]).push(id);
 for(const group of Object.values(units))for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){const a=d.artboards![group[i]],b=d.artboards![group[j]],p=positions[a.id],q=positions[b.id];if(p[0]<q[0]+b.size[0]-1e-7&&p[0]+a.size[0]>q[0]+1e-7&&p[1]<q[1]+b.size[1]-1e-7&&p[1]+a.size[1]>q[1]+1e-7)throw Error("Connected frame crops overlap; review their layout first.");}
 const prior=frameSheetPages(d,c.id);if(prior.some(b=>b.locked))throw Error("Unlock all paper pages before changing this set.");
 if(c.fixedFrameIds.some(id=>!ids.includes(id)))throw Error("Fixed frames must be selected.");
 const footer=c.template==="standard"?32:24,area:PaperBounds=[c.margin,c.margin+footer+c.gap,c.size[0]-c.margin,c.size[1]-c.margin];
 const rows=[c.fields.drawingName,`Author: ${c.fields.author}${c.template==="compact"?` | Rev: ${c.fields.revision}`:""}`,`Revision: ${c.fields.revision}`];if(rows.some(s=>Array.from(s).length*3>c.size[0]-2*c.margin-6))throw Error("Title field exceeds its row; shorten it or choose wider paper.");
 const attempts:string[]=[];let best:CadArtboard[]|undefined;
 for(const divisor of [...new Set(c.denominators)].sort((a,b)=>a-b)){try{
  const bounds:Record<string,PaperBounds>={},fixed:string[]=[],pins=new Map<string,number>();
  for(const [key,group] of Object.entries(units)){const xs=group.map(id=>positions[id][0]),ys=group.map(id=>positions[id][1]);bounds[key]=[Math.min(...xs)/divisor,Math.min(...ys)/divisor,Math.max(...group.map(id=>positions[id][0]+d.artboards![id].size[0]))/divisor,Math.max(...group.map(id=>positions[id][1]+d.artboards![id].size[1]))/divisor+6];
   if(group.some(id=>c.fixedFrameIds.includes(id))){if(!group.every(id=>c.fixedFrameIds.includes(id)))throw Error("Fix or release the entire connected/aligned group.");const owners=group.map(id=>prior.find(b=>b.frameSheet!.placements.some(p=>p.frameId===id)));if(owners.some(b=>!b)||new Set(owners.map(b=>b!.id)).size!==1)throw Error("Fixed group must belong to one saved page.");const owner=owners[0]!,s=owner.frameSheet!;if(s.divisor!==divisor||JSON.stringify(owner.size)!==JSON.stringify(c.size)||s.template!==c.template)throw Error("Fixed pages require their original paper, template and scale divisor.");
    const ps=group.map(id=>s.placements.find(p=>p.frameId===id)!);if(ps.some(p=>JSON.stringify(p.frame)!==JSON.stringify(d.artboards![p.frameId].frame)||JSON.stringify(p.size)!==JSON.stringify(d.artboards![p.frameId].size)))throw Error("Fixed source crop/scale changed; release the group.");
    const offset:[number,number]=[ps[0].origin[0]-positions[group[0]][0]/divisor,ps[0].origin[1]-positions[group[0]][1]/divisor];if(ps.some((p,i)=>p.origin.some((v,j)=>Math.abs(v-positions[group[i]][j]/divisor-offset[j])>1e-6)))throw Error("Fixed group arrangement changed; release it.");
    bounds[key]=bounds[key].map((v,i)=>v+offset[i%2]) as PaperBounds;fixed.push(key);pins.set(key,s.page-1);
   }
  }
  const pages:string[][]=[];for(const [key,page] of pins){if(page>=c.maxPages)throw Error("Fixed page exceeds page limit.");while(pages.length<=page)pages.push([]);pages[page].push(key);}
  const pack=(keys:string[])=>packSheetGroups(Object.fromEntries(keys.map(k=>[k,bounds[k]])),keys.filter(k=>fixed.includes(k)),area,c.gap);
  for(const p of pages)if(p.length)pack(p);
  for(const key of Object.keys(units)){if(pins.has(key))continue;let assigned=false;for(const page of pages){try{pack([...page,key]);page.push(key);assigned=true;break;}catch{}}
   if(!assigned){if(pages.length>=c.maxPages)throw Error("Page limit exceeded.");pack([key]);pages.push([key]);}
  }
  if(pages.some(p=>!p.length))throw Error("Fixed pages leave empty pages; release them to reorder.");
  const result=pages.map((keys,i):CadArtboard=>{const packed=pack(keys),placements=keys.flatMap(key=>units[key].map(id=>{const b=d.artboards![id],shift=packed.shifts[key];let origin:[number,number]=[positions[id][0]/divisor+shift[0],positions[id][1]/divisor+shift[1]];if(fixed.includes(key))origin=[...prior[pins.get(key)!].frameSheet!.placements.find(p=>p.frameId===id)!.origin];return {frameId:id,origin,size:[...b.size] as [number,number],frame:structuredClone(b.frame!)};}));
   const sheet:CadFrameSheet={setId:c.id,page:i+1,pageCount:pages.length,divisor,margin:c.margin,gap:c.gap,template:c.template,alignment:c.alignment,fields:structuredClone(c.fields),sectionIds:[...c.sectionIds],linkSignature:frameSheetLinkSignature(d,ids),placements};
   const id=`${c.id}:paper:${i+1}`;if(d.artboards?.[id]&&!prior.some(b=>b.id===id))throw Error("Paper artboard identity is occupied.");return {id,name:`${c.name} · ${i+1}/${pages.length}`,workPlane:plane,origin:[c.origin[0]+i*(c.size[0]+20),c.origin[1]],size:[...c.size],background:"#ffffff",backgroundOpacity:1,showGrid:false,visible:true,locked:false,frameSheet:sheet};
  });
  // Reference labels and captions must fit before this candidate can win.
  const virtual={...d,artboards:{...d.artboards}};for(const page of result)for(const p of page.frameSheet!.placements){const b=d.artboards![p.frameId];virtual.artboards[p.frameId]={...b,origin:p.origin,size:[b.size[0]/divisor,b.size[1]/divisor],frame:{...b.frame!,denominator:b.frame!.denominator*divisor}};}
  for(const page of result){const frames=page.frameSheet!.placements.map(p=>virtual.artboards[p.frameId]);for(const b of frames){frameLinkAnnotations(virtual,b);frameSheetCaption(b,frames);}}
  attempts.push(`Divisor ${divisor}: ${result.length} page(s)`);if(!best||result.length<best.length)best=result;if(result.length===1)break;
 }catch(e){attempts.push(`Divisor ${divisor}: ${e instanceof Error?e.message:String(e)}`);}}
 if(!best)throw Error(`Frame sheet overflow. ${attempts.join(" | ")}`);return {boards:best,attempts,frameIds:ids};
}
