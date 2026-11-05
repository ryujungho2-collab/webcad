import type {CadDocument} from "@agent-webcad/cad-document";
import {getWorldDrawingGeometry} from "../precision/worldGeometry";
/** Bounded saved XY outline only. No kernel, mesh generation, raster decoding or document mutation. */
export function projectHomePreview(document:CadDocument){
  const paths:string[]=[],points:number[][]=[];let shown=0;
  for(const feature of Object.values(document.features).slice(0,96)){
    const object=document.objects[feature.output],layer=object&&document.layers[object.layerId];
    if(!object?.visible||!layer?.visible||feature.type!=="drawing"||!(["line","polyline","rectangle","circle","arc"].includes(String(feature.params.kind)))||(feature.params.workPlane??"XY")!=="XY"||Array.isArray(feature.params.points)&&feature.params.points.length>512)continue;
    try{const world=getWorldDrawingGeometry(object,feature);if(!world?.points||world.points.length>2048)continue;const outline=world.points.filter(p=>p.every(Number.isFinite));if(outline.length<2)continue;if(points.length+outline.length>8192)break;
      if(world.closed)outline.push(outline[0]);paths.push(outline.map(p=>`${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`).join(" "));points.push(...outline.map(p=>[p[0],-p[1]]));shown++;
    }catch{/* Unsupported saved outline is represented by its summary instead. */}
  }
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(...xs)-minX,height=Math.max(...ys)-minY,pad=Math.max(width,height,1)*.08;
  return {paths,viewBox:points.length?`${minX-pad} ${minY-pad} ${Math.max(width,1)+pad*2} ${Math.max(height,1)+pad*2}`:"0 0 320 180",shown,objects:document.rootObjects.length,revision:document.revision};
}
