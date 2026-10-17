import type {CadArtboard,CadDocument,StitchPoint} from "@agent-webcad/cad-document";
import type {SvgExportItem,SvgPolyline} from "./svgWriter";
import {resolveFrameStitch,rigidPoint,type FrameStitchReport} from "../precision/frameStitch";
import {insideConvex,clipConvexSegment} from "../precision/convexClip";
export function clipStitchPolyline(line:SvgPolyline,polygon:StitchPoint[]):SvgPolyline[]{
 if(line.spline||line.ellipse||line.fill||line.points.every(p=>insideConvex(p,polygon)))return [line];
 const out:SvgPolyline[]=[],points=line.closed?[...line.points,line.points[0]]:line.points;let fragment:StitchPoint[]=[];
 const flush=()=>{if(fragment.length>1)out.push({...line,points:fragment,closed:false,fill:undefined});fragment=[];};
 for(let i=1;i<points.length;i++){const segment=clipConvexSegment(points[i-1],polygon,points[i]);if(!segment){flush();continue;}const [a,b]=segment;if(fragment.length&&Math.hypot(fragment.at(-1)![0]-a[0],fragment.at(-1)![1]-a[1])>1e-7)flush();if(!fragment.length)fragment.push(a);fragment.push(b);if(Math.hypot(b[0]-points[i][0],b[1]-points[i][1])>1e-7)flush();}flush();return out;
}
function duplicateKey(item:SvgExportItem,tolerance:number){
 const round=(v:number)=>Math.round(v/tolerance),point=(p:number[])=>p.map(round).join(",");
 if(item.type==="polyline"){const l=item.polyline;let points=l.points.map(point);if(l.closed&&!l.spline){const sequences=[points,[...points].reverse()].flatMap(p=>p.map((_,i)=>[...p.slice(i),...p.slice(0,i)].join(";"))).sort();points=[sequences[0]];}else{const a=points.join(";"),b=[...points].reverse().join(";");points=[a<b?a:b];}const clipped=l.points.some(p=>item.clip?.polygon&&!insideConvex(p,item.clip.polygon));return JSON.stringify(["line",l.closed,points,l.holes?.map(ring=>ring.map(point)),l.spline?l.spline:l.ellipse?{...l.ellipse,center:l.ellipse.center.map(round),axisU:l.ellipse.axisU.map(round),axisV:l.ellipse.axisV.map(round)}:null,clipped?item.clip?.polygon:null]);}
 if(item.type==="text"){const t=item.text,clip=item.clip?.polygon,size=t.size??3.5,width=t.text.length*size*1.2,x=t.align==="center"?-width/2:0,angle=(t.angle??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),corners=[x,x+width].flatMap(dx=>[-size*.4,size*1.2].map(dy=>[t.position[0]+dx*c-dy*s,t.position[1]+dx*s+dy*c] as StitchPoint));return JSON.stringify(["text",point(t.position),t.text,round(size),round(t.angle??0),t.basis,t.align,clip&&corners.some(p=>!insideConvex(p,clip))?clip:null]);}
 return JSON.stringify(item);
}
/** Assemble presentation instances in anchor model coordinates, without editing source objects. */
export function collectFrameStitchScene(board:CadArtboard,d:CadDocument,collect:(b:CadArtboard,d:CadDocument)=>SvgExportItem[]):{items:SvgExportItem[];report:FrameStitchReport}{
 const frame=board.frame,s=frame?.stitch;if(!s)throw Error("Choose a continuous frame.");const report=resolveFrameStitch(d,s),items:SvgExportItem[]=[],seen=new Set<string>();let duplicateCount=0;
 for(const part of report.parts){const source=d.artboards![part.frameId],sf=source.frame!,scale=sf.denominator/frame!.denominator,angle=part.transform.rotation,c=Math.cos(angle),sn=Math.sin(angle),vector=(p:number[]):[number,number,number]=>[(p[0]*c-p[1]*sn)*scale,(p[0]*sn+p[1]*c)*scale,0];
  const toPaper=(q:StitchPoint):StitchPoint=>[board.origin[0]+(q[0]-frame!.sourceOrigin[0])/frame!.denominator,board.origin[1]+(q[1]-frame!.sourceOrigin[1])/frame!.denominator];
  const point=(p:number[]):StitchPoint=>toPaper(rigidPoint([sf.sourceOrigin[0]+(p[0]-source.origin[0])*sf.denominator,sf.sourceOrigin[1]+(p[1]-source.origin[1])*sf.denominator],part.transform));
  const polygon=part.polygon.map(toPaper),clip={origin:board.origin,size:board.size,polygon};
  for(const item of collect(source,d)){let transformed:SvgExportItem[]=[];
   if(item.type==="polyline"){const l=item.polyline,line={...l,points:l.points.map(point),holes:l.holes?.map(ring=>ring.map(point)),...(l.spline?{spline:{...l.spline,controlPoints:l.spline.controlPoints.map(q=>[...point(q),0] as [number,number,number])}}:{}),...(l.ellipse?{ellipse:{...l.ellipse,center:[...point(l.ellipse.center),0] as [number,number,number],axisU:vector(l.ellipse.axisU),axisV:vector(l.ellipse.axisV)}}:{})};transformed=clipStitchPolyline(line,polygon).map(polyline=>({type:"polyline",polyline,clip}));}
   else if(item.type==="text"){const t=item.text,basis=t.basis?.map(p=>{const v=vector(p);return [v[0]/scale,v[1]/scale] as StitchPoint;}) as [StitchPoint,StitchPoint]|undefined;transformed=[{type:"text",text:{...t,position:point(t.position),size:(t.size??3.5)*scale,angle:(t.angle??0)+angle*180/Math.PI,...(basis?{basis}:{})},clip}];}
   else throw Error("Continuous frames require vector drawings and annotations.");
   for(const next of transformed){const key=duplicateKey(next,Math.max(1e-8,s.tolerance/frame!.denominator));if(seen.has(key)){duplicateCount++;if(s.duplicates==="first")continue;}seen.add(key);items.push(next);}
  }
 }
 report.duplicateCount=duplicateCount;return {items,report};
}
