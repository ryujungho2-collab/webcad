import type {CadDocument} from "@agent-webcad/cad-document";
import {getWorldDrawingGeometry} from "./worldGeometry";
import {worldDraftingGeometry} from "./draftingGeometry";
import {resolveDimension} from "./dimensionGeometry";
import type {DraftGeometry} from "./draftingGeometry";
import {layerStyle} from "./layerStyle";
export type PaperBounds=[number,number,number,number];
export type SheetLayoutReport={paper:{origin:[number,number];size:[number,number];margin:number;gap:number};denominator:number;placements:Record<string,[number,number]>;bounds:Record<string,PaperBounds>;attempts:{denominator:number;reason:string}[]};
/** Conservative glyph envelope shares exported system-ui advance safety; optional measured metrics may enlarge it. */
export function sheetGroupBounds(d:CadDocument,ids:string[],measure?:(text:string,height:number)=>number):PaperBounds{
 const bounds:PaperBounds=[Infinity,Infinity,-Infinity,-Infinity];let count=0,finite=true;const add=(points:readonly number[][])=>{for(const p of points){count++;if(!p.slice(0,2).every(Number.isFinite)){finite=false;continue;}bounds[0]=Math.min(bounds[0],p[0]);bounds[1]=Math.min(bounds[1],p[1]);bounds[2]=Math.max(bounds[2],p[0]);bounds[3]=Math.max(bounds[3],p[1]);}};const features=new Map(Object.values(d.features).map(f=>[f.output,f]));let pad=.25;
 for(const id of ids){const o=d.objects[id],f=features.get(id);if(!o||!f||!o.visible||d.layers[o.layerId]?.visible===false)throw Error("Show all selected view outputs and annotations before automatic layout.");
  const style=layerStyle(d.layers[o.layerId]);pad=Math.max(pad,Number((f.params.vectorStyle as {strokeWidth?:number}|undefined)?.strokeWidth??style.lineWeight)/2);
  const g=getWorldDrawingGeometry(o,f);if(g){if(g.workPlane!=="XY")throw Error("Automatic sheets require XY derived drawings.");if(g.center&&g.radius)add([[g.center[0]-g.radius,g.center[1]-g.radius],[g.center[0]+g.radius,g.center[1]+g.radius]]);else add(g.points??[]);}
  else{let a:DraftGeometry;if(f.type==="dimension"){const dim=resolveDimension(f.params);if(!dim)throw Error("Repair unresolved dimension references before automatic layout.");a={lines:dim.segments.map(points=>({points,closed:false,style})),texts:[{point:dim.textPosition,text:dim.text,height:dim.textHeight,angle:0,style}]};}else a=worldDraftingGeometry(d,o,f);for(const line of a.lines){pad=Math.max(pad,(line.vectorStyle?.strokeWidth??line.style.lineWeight)/2);add(line.points);}for(const t of a.texts){const width=Math.max(t.height,Array.from(t.text).length*t.height*1.2,measure?.(t.text,t.height)??0),left=t.align==="center"?-width/2:0,angle=t.angle*Math.PI/180,u=t.axes?.[0]??[Math.cos(angle),Math.sin(angle),0],v=t.axes?.[1]??[-Math.sin(angle),Math.cos(angle),0];for(const x of [left,left+width])for(const y of [-t.height*.4,t.height*1.2])add([[t.point[0]+u[0]*x+v[0]*y,t.point[1]+u[1]*x+v[1]*y]]);}}
 }
 if(!count||!finite)throw Error("View group has no finite paper geometry.");return [bounds[0]-pad,bounds[1]-pad,bounds[2]+pad,bounds[3]+pad];
}
const overlaps=(a:PaperBounds,b:PaperBounds,gap:number)=>a[0]<b[2]+gap-1e-7&&a[2]>b[0]-gap+1e-7&&a[1]<b[3]+gap-1e-7&&a[3]>b[1]-gap+1e-7;
/** Deterministic, no rotation, bottom-left obstacle packing. Fixed rectangles keep absolute paper coordinates. */
export function packSheetGroups(bounds:Record<string,PaperBounds>,fixed:string[],area:PaperBounds,gap:number){
 const placed:Record<string,PaperBounds>={},shifts:Record<string,[number,number]>={};const inside=(b:PaperBounds)=>b[0]>=area[0]-1e-7&&b[1]>=area[1]-1e-7&&b[2]<=area[2]+1e-7&&b[3]<=area[3]+1e-7;
 for(const id of [...fixed].sort()){const b=bounds[id];if(!inside(b)||Object.values(placed).some(p=>overlaps(b,p,gap)))throw Error(`Fixed view ${id} is outside margins or overlaps another fixed group.`);placed[id]=b;shifts[id]=[0,0];}
 const movable=Object.keys(bounds).filter(id=>!fixed.includes(id)).sort((a,b)=>{const x=bounds[a],y=bounds[b];return (y[2]-y[0])*(y[3]-y[1])-(x[2]-x[0])*(x[3]-x[1])||a.localeCompare(b);});
 for(const id of movable){const b=bounds[id],w=b[2]-b[0],h=b[3]-b[1],xs=[area[0],...Object.values(placed).map(p=>p[2]+gap)].sort((a,b)=>a-b),ys=[area[1],...Object.values(placed).map(p=>p[3]+gap)].sort((a,b)=>a-b);let fit:PaperBounds|undefined;
  for(const y of ys){for(const x of xs){const next:PaperBounds=[x,y,x+w,y+h];if(inside(next)&&Object.values(placed).every(p=>!overlaps(next,p,gap))){fit=next;break;}}if(fit)break;}
  if(!fit)throw Error(`Overflow: view ${id} and its annotations cannot fit this page without rotation.`);placed[id]=fit;shifts[id]=[fit[0]-b[0],fit[1]-b[1]];
 }return {bounds:placed,shifts};
}
