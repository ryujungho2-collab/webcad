import { requestProjectFrame as requestAnimationFrame, cancelProjectFrame as cancelAnimationFrame } from "../app/projectActivity";
import { useEffect, useState } from "react";
import type { SketchLoop } from "../precision/sketchProfiles";
import { profileBoundaryPoints } from "../precision/profileRegions";
import { planeToWorld, WORK_PLANES, type Vec3 } from "../precision/workPlane";

export function RegionOverlay({loops, selected, toggle, project}: {loops:SketchLoop[]; selected:string[]; toggle:(id:string)=>void; project:(point:Vec3)=>[number,number]}) {
  const [paths,setPaths]=useState<string[]>([]);
  useEffect(()=>{
    let frame=0;
    const update=()=>{
      const values=loops.map(loop=>[loop,...(loop.holes??[])].map(boundary=>{
        const segment=boundary.segments[0], origin=segment.kind==="circle"?segment.center:segment.start, plane=WORK_PLANES[loop.workPlane];
        const elevation=origin.reduce((sum,value,i)=>sum+value*plane.normal[i],0);
        return profileBoundaryPoints(boundary,loop.workPlane).map((point,i)=>{
          const p=planeToWorld(point,plane).map((value,j)=>value+plane.normal[j]*elevation) as Vec3;
          return `${i?"L":"M"}${project(p).map(value=>value.toFixed(1)).join(",")}`;
        }).join(" ")+" Z";
      }).join(" "));
      setPaths(previous=>previous.join("|")===values.join("|")?previous:values);
      frame=requestAnimationFrame(update);
    };update();return()=>cancelAnimationFrame(frame);
  },[loops,project]);
  return <svg className="region-overlay">{loops.map((loop,i)=><path key={loop.id} data-region-id={loop.id} d={paths[i]} fillRule="evenodd" className={selected.includes(loop.id)?"chosen":""} onClick={()=>toggle(loop.id)}><title>Toggle region {i+1}, {loop.holes?.length??0} holes</title></path>)}</svg>;
}
