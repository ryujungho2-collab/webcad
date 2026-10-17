import type {CadArtboard,CadDocument} from "@agent-webcad/cad-document";
import type {SvgExportItem} from "./svgWriter";
import {frameSheetPages,frameSheetLinkSignature,frameSheetCaption} from "../precision/frameSheetLayout";
/** The viewport, SVG, PDF and flattened DXF all consume this same scene. */
export function collectFrameSheetItems(board:CadArtboard,d:CadDocument,collect:(b:CadArtboard,d:CadDocument,sourceDocument?:CadDocument)=>SvgExportItem[]):SvgExportItem[]{
 const s=board.frameSheet;if(!s)throw Error("Choose a frame sheet.");
 const pages=frameSheetPages(d,s.setId),ids=pages.flatMap(b=>b.frameSheet!.placements.map(p=>p.frameId));if(frameSheetLinkSignature(d,ids)!==s.linkSignature)throw Error("Frame references changed; re-layout this sheet set before output.");
 const virtual=structuredClone(d);for(const page of pages){for(const p of page.frameSheet!.placements){const source=d.artboards?.[p.frameId];if(!source?.frame||JSON.stringify(source.frame)!==JSON.stringify(p.frame)||JSON.stringify(source.size)!==JSON.stringify(p.size)||source.workPlane!==page.workPlane)throw Error("Frame source crop/scale changed or is missing; re-layout this sheet set.");
  virtual.artboards![p.frameId]={...source,origin:[page.origin[0]+p.origin[0],page.origin[1]+p.origin[1]],size:[p.size[0]/s.divisor,p.size[1]/s.divisor],frame:{...p.frame,denominator:p.frame.denominator*s.divisor}};
 }}
 const items:SvgExportItem[]=s.placements.flatMap(p=>{const b=virtual.artboards![p.frameId];return collect(b,virtual,d).map(item=>({...item,clip:item.clip??{origin:b.origin,size:b.size}}));});
 const frames=s.placements.map(p=>virtual.artboards![p.frameId]);for(const source of frames)items.push({type:"text",text:frameSheetCaption(source,frames)});
 const [x,y]=board.origin,m=s.margin,w=board.size[0]-2*m,h=s.template==="standard"?32:24;
 const rect=(left:number,bottom:number,width:number,height:number)=>items.push({type:"polyline",polyline:{points:[[left,bottom],[left+width,bottom],[left+width,bottom+height],[left,bottom+height]],closed:true,color:"#303030",lineWeight:.25}});
 const text=(value:string,dy:number)=>items.push({type:"text",text:{position:[x+m+3,y+m+dy],text:value,size:2.5,color:"#303030"}});
 rect(x+m,y+m,w,board.size[1]-2*m);rect(x+m,y+m,w,h);
 text(s.fields.drawingName,h-7);text(`Author: ${s.fields.author}${s.template==="compact"?` | Rev: ${s.fields.revision}`:""}`,s.template==="standard"?17:10);if(s.template==="standard")text(`Revision: ${s.fields.revision}`,10);
 text(`Frame scales / ${s.divisor} | Page ${s.page}/${s.pageCount}`,3);
 return items;
}
