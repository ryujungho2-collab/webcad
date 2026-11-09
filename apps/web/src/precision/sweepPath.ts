import type {CadDocument} from "@agent-webcad/cad-document";
import {getWorldDrawingGeometry} from "./worldGeometry";
/** Creation and live regeneration consume the same world-space path basis. */
export function resolveSweepPath(document:CadDocument,id:string,forRegeneration=false){
 const object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id),layer=object&&document.layers[object.layerId];
 if(!object||feature?.type!=="drawing"||feature.construction||feature.pattern||!layer||(!forRegeneration&&(!object.visible||!layer.visible||layer.locked)))throw Error("Select an independent visible unlocked drawing path.");
 const world=getWorldDrawingGeometry(object,feature);
 if(!world||world.closed)throw Error("Sweep requires an open path; select the closed section first, then the open path.");
 if(world.kind==="spline"&&world.spline){const s=world.spline;return {kind:"spline" as const,degree:s.degree,controlPoints:structuredClone(s.controlPoints),knots:[...s.knots],...s.weights?{weights:[...s.weights]}:{},domain:[...s.domain] as [number,number]};}
 if(!["line","polyline","arc"].includes(world.kind))throw Error("Sweep supports open lines, polylines, arcs and exact splines.");
 const points=world.points,spine=points?.filter((p,i)=>!i||Math.hypot(...p.map((v,j)=>v-points[i-1][j]))>1e-9);
 if(!spine||spine.length<2)throw Error("Sweep path is degenerate.");return spine;
}
