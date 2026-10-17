import type {CadDocument,CadDrawingFrame} from "./CadDocument";
import {validDrawingFrame} from "./DrawingFrame";
import {validFrameLink} from "./FrameLink";
export type CadFrameSheet={setId:string;page:number;pageCount:number;divisor:number;margin:number;gap:number;template:"standard"|"compact";alignment:"none"|"orthographic";fields:{drawingName:string;author:string;revision:string};sectionIds:string[];linkSignature:string;placements:{frameId:string;origin:[number,number];size:[number,number];frame:CadDrawingFrame}[]};
const record=(v:any)=>v&&typeof v==="object"&&!Array.isArray(v);
const name=(v:any)=>typeof v==="string"&&v.trim().length>0&&v.length<=200;
const vec=(v:any)=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite);
export function validateFrameSheets(d:CadDocument){
 const sets=new Map<string,number[]>();
 for(const b of Object.values(d.artboards??{})){const s=b.frameSheet;if(s===undefined)continue;
  if(!record(s)||b.frame||!name(s.setId)||!Number.isInteger(s.page)||s.page<1||!Number.isInteger(s.pageCount)||s.pageCount<s.page||s.pageCount>16||!Number.isFinite(s.divisor)||s.divisor<=0||!Number.isFinite(s.margin)||s.margin<1||!Number.isFinite(s.gap)||s.gap<0||!["standard","compact"].includes(s.template)||!["none","orthographic"].includes(s.alignment)||!record(s.fields)||![s.fields.drawingName,s.fields.author,s.fields.revision].every(v=>typeof v==="string"&&v.length<=80)||!s.fields.drawingName.trim()||!Array.isArray(s.sectionIds)||!s.sectionIds.every(name)||typeof s.linkSignature!=="string"||!Array.isArray(s.placements)||!s.placements.length||s.placements.length>1000)throw Error("Invalid frame sheet publication.");
  if(!vec(b.size)||b.size.some(v=>v<=0)||new Set(s.sectionIds).size!==s.sectionIds.length)throw Error("Invalid frame sheet paper/area selection.");
  const seen=new Set<string>();for(const p of s.placements){if(!record(p)||!name(p.frameId)||seen.has(p.frameId)||!vec(p.origin)||!vec(p.size)||p.size.some(v=>v<=0)||!validDrawingFrame(p.frame)||!d.artboards?.[p.frameId]?.frame||d.artboards[p.frameId].workPlane!==b.workPlane)throw Error("Invalid frame sheet source/placement.");seen.add(p.frameId);
   const footer=s.template==="standard"?32:24;if(p.origin[0]<s.margin-1e-6||p.origin[1]<s.margin+footer+s.gap-1e-6||p.origin[0]+p.size[0]/s.divisor>b.size[0]-s.margin+1e-6||p.origin[1]+p.size[1]/s.divisor+6>b.size[1]-s.margin+1e-6)throw Error("Frame sheet placement exceeds paper margins/title block.");
  }
  for(let i=0;i<s.placements.length;i++)for(let j=i+1;j<s.placements.length;j++){const a=s.placements[i],b=s.placements[j];if(a.origin[0]<b.origin[0]+b.size[0]/s.divisor-1e-6&&a.origin[0]+a.size[0]/s.divisor>b.origin[0]+1e-6&&a.origin[1]<b.origin[1]+b.size[1]/s.divisor-1e-6&&a.origin[1]+a.size[1]/s.divisor>b.origin[1]+1e-6)throw Error("Overlapping frame sheet placements.");}
  const pages=sets.get(s.setId)??[];pages.push(s.page);sets.set(s.setId,pages);
 }
 for(const [id,pages] of sets){const boards=Object.values(d.artboards??{}).filter(b=>b.frameSheet?.setId===id),first=boards[0];if(new Set(pages).size!==pages.length||boards.some(b=>b.frameSheet!.pageCount!==pages.length)||pages.some(p=>p>pages.length)||new Set(boards.flatMap(b=>b.frameSheet!.placements.map(p=>p.frameId))).size!==boards.reduce((n,b)=>n+b.frameSheet!.placements.length,0))throw Error("Invalid frame sheet page sequence or duplicate source.");
  for(const b of boards)if(b.workPlane!==first.workPlane||JSON.stringify(b.size)!==JSON.stringify(first.size)||["divisor","margin","gap","template","alignment","fields","sectionIds","linkSignature"].some(k=>JSON.stringify((b.frameSheet as any)[k])!==JSON.stringify((first.frameSheet as any)[k])))throw Error("Inconsistent frame sheet set metadata.");
  let links:unknown;try{links=JSON.parse(first.frameSheet!.linkSignature);}catch{throw Error("Invalid published frame reference graph.");}
  if(!Array.isArray(links)||links.length>1000||!links.every(validFrameLink))throw Error("Invalid published frame reference graph.");
  const owners=new Map(boards.flatMap(b=>b.frameSheet!.placements.map(p=>[p.frameId,b.id] as const)));for(const l of links)if(!owners.has(l.fromId)||owners.get(l.fromId)!==owners.get(l.toId))throw Error("Published connected frames must stay on one paper page.");
 }
}
