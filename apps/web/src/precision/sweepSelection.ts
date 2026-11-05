import type {CadDocument} from "@agent-webcad/cad-document";
import {extractSketchLoops} from "./sketchProfiles";
import {resolveSweepPath} from "./sweepPath";
import {splinePoint,splineLength,splineBezierSpans} from "./splineGeometry";
/** Same bounded section/path diagnostics for the human form and MCP context. */
export function inspectSweepSelection(document:CadDocument,ids:string[]){
 if(ids.length!==2)return;
 try{const section=extractSketchLoops(document,[ids[0]]);if(!section.ok)throw Error(section.reason);if(section.loops.length!==1||section.loops[0].holes?.length)throw Error("Select one closed section without holes first, then an open path.");
 const spine=resolveSweepPath(document,ids[1]),normalize=(v:number[])=>{const length=Math.hypot(...v);if(length<1e-9)throw Error("Path endpoint has no defined tangent.");return v.map(x=>x/length);};let start:number[],end:number[],startTangent:number[],lengthMm:number,representation:string;
 if(Array.isArray(spine)){start=spine[0];end=spine.at(-1)!;startTangent=normalize(spine[1].map((v,i)=>v-start[i]));lengthMm=spine.slice(1).reduce((n,p,i)=>n+Math.hypot(...p.map((v,j)=>v-spine[i][j])),0);representation="world point spine; legacy arcs are sampled";}
 else{start=splinePoint(spine,spine.domain[0]);end=splinePoint(spine,spine.domain[1]);const h=splineBezierSpans(spine)[0].h;startTangent=normalize([0,1,2].map(j=>h[1][j]*h[0][3]-h[0][j]*h[1][3]));lengthMm=splineLength(spine);representation="exact world NURBS";}
 return {ok:true as const,sectionObjectId:ids[0],pathObjectId:ids[1],sectionNormal:section.loops[0].normal,path:{representation,start,end,startTangent,lengthMm},alignment:"Preserve by default; alignToPath rotates the section perpendicular to the initial tangent. Center section on path start. Not a roll-angle control."};
 }catch(e){return {ok:false as const,reason:e instanceof Error?e.message:String(e)};}
}
