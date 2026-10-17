import {sampleSpline} from "../precision/splineGeometry";
import type {CadArtboard} from "@agent-webcad/cad-document";
import type {SvgExportItem} from "./svgWriter";
import {clipSvgPolylinesToArtboard} from "./artboardSvg";
import {clipStitchPolyline} from "./frameStitchScene";
import {insideConvex} from "../precision/convexClip";
/** Explicit flattened presentation export: sampled curves and editable text. */
export function encodeFrameDxf(board:CadArtboard,items:SvgExportItem[]){
 const pairs:(string|number)[]=[0,"SECTION",2,"HEADER",9,"$INSUNITS",70,4,0,"ENDSEC",0,"SECTION",2,"ENTITIES"];
 for(const item of items){if(item.type==="polyline"){
 for(const ring of [item.polyline.points,...(item.polyline.holes??[])]){const flat={...item.polyline,points:item.polyline.spline?sampleSpline(item.polyline.spline,.02).map(p=>[p[0],p[1]] as [number,number]):ring,spline:undefined,ellipse:undefined,holes:undefined,fill:undefined},lines=item.clip?.polygon?clipStitchPolyline(flat,item.clip.polygon):[flat];for(const l of clipSvgPolylinesToArtboard(lines,board)){pairs.push(0,"LWPOLYLINE",8,"FRAME",90,l.points.length,70,l.closed?1:0);for(const p of l.points)pairs.push(10,p[0],20,p[1]);}}
 }else if(item.type==="text"){
 const t=item.text,[x,y]=t.position,clip=item.clip??board;
 // DXF has no SVG text clipping. Refuse partial or outside text rather than lose it silently.
 const h=t.size??3.5,w=Array.from(t.text).length*h*1.2;
 if(item.clip?.polygon){const left=x-(t.align==="center"?w/2:0),right=x+(t.align==="center"?w/2:w);if([left,right].some(px=>[y-h,y+h].some(py=>!insideConvex([px,py],item.clip!.polygon!))))throw Error("Frame DXF cannot clip this seam annotation. Change the seam or use SVG/PDF.");}
 if(t.basis||t.angle||x-(t.align==="center"?w/2:0)<clip.origin[0]||x+(t.align==="center"?w/2:w)>clip.origin[0]+clip.size[0]||y-h<clip.origin[1]||y+h>clip.origin[1]+clip.size[1])throw Error("Frame DXF cannot clip or rotate this annotation. Enlarge the crop or use SVG/PDF.");
 pairs.push(0,"TEXT",8,"FRAME",10,x,20,y,40,h,1,t.text.replace(/[\r\n]/g," "),...(t.align==="center"?[72,1,11,x,21,y]:[]));
 }}pairs.push(0,"ENDSEC",0,"EOF");return pairs.join("\n");
}
