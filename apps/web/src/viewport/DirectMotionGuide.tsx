import { useEffect, useState } from "react";
import type { SketchPoint } from "@agent-webcad/cad-document";
import type { SketchGripMotion } from "../precision/sketchGripMotion";
import type { Vec3 } from "../precision/workPlane";

type Props={motion:SketchGripMotion;world:(point:SketchPoint)=>Vec3;raw:Vec3;project:(point:Vec3)=>[number,number]};
export function motionCaption(motion:SketchGripMotion,axes:string[]){
  if(motion.kind==="locked")return "This grip is locked · edit a dimension or explicitly release a relation.";
  if(motion.kind==="orbit")return "Move along the circle · the fixed distance is maintained.";
  if(motion.kind==="free")return "This grip can move in both plane directions.";
  if(motion.kind==="local")return "Local tangent shown · movement is checked against the curved constraints.";
  const direction=Math.abs(motion.direction[1])<1e-6?axes[0]:Math.abs(motion.direction[0])<1e-6?axes[1]:"the shown direction";
  return `This grip: move along ${direction}${motion.driverIds.length?" · resize the driving dimension":" · keep existing relations"}.`;
}

/** Reprojects with the camera; guides never intercept pointer capture or selection. */
export function DirectMotionGuide({motion,world,raw,project}:Props){
  const [screen,setScreen]=useState<{origin:number[];target:number[];raw:number[];paths:string[];orbit?:string}>();
  useEffect(()=>{let frame=0,signature="";const draw=()=>{
    const origin=project(world(motion.origin)),target=project(world(motion.point)),requested=project(raw),paths:string[]=[];
    const arrow=(direction:SketchPoint)=>{
      const base=motion.point,center=project(world(base)),end=project(world([base[0]+direction[0],base[1]+direction[1]])),length=Math.hypot(end[0]-center[0],end[1]-center[1]);
      if(length<1e-7)return;const u=[(end[0]-center[0])/length,(end[1]-center[1])/length];
      const point=(along:number,side=0)=>`${(center[0]+along*u[0]-side*u[1]).toFixed(1)},${(center[1]+along*u[1]+side*u[0]).toFixed(1)}`;
      paths.push(`${point(-110)} ${point(110)}`,`${point(-101,5)} ${point(-110)} ${point(-101,-5)}`,`${point(101,5)} ${point(110)} ${point(101,-5)}`);
    };
    if(motion.kind==="line"||motion.kind==="local")arrow(motion.direction);
    else if(motion.kind==="free"){arrow([1,0]);arrow([0,1]);}
    const orbit=motion.orbit?Array.from({length:97},(_,i)=>{const angle=2*Math.PI*i/96;return project(world([motion.orbit!.center[0]+motion.orbit!.radius*Math.cos(angle),motion.orbit!.center[1]+motion.orbit!.radius*Math.sin(angle)])).map(x=>x.toFixed(1)).join(",");}).join(" "):undefined;
    const next={origin,target,raw:requested,paths,orbit},hash=JSON.stringify(next);if(hash!==signature){signature=hash;setScreen(next);}frame=requestAnimationFrame(draw);
  };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);},[motion,world,raw,project]);
  if(!screen)return null;
  return <g className={`direct-motion-guide motion-${motion.kind}`} data-motion-kind={motion.kind} data-motion-dof={motion.dof}>
    {screen.paths.map((points,i)=><polyline key={i} data-motion-direction points={points}/>)}
    {screen.orbit&&<polyline data-motion-orbit points={screen.orbit}/>}
    <rect data-motion-origin x={screen.origin[0]-3} y={screen.origin[1]-3} width="6" height="6"/>
    {motion.projected&&<><line data-motion-projection x1={screen.raw[0]} y1={screen.raw[1]} x2={screen.target[0]} y2={screen.target[1]}/><circle data-motion-requested cx={screen.raw[0]} cy={screen.raw[1]} r="5"/></>}
    <circle data-motion-controlled cx={screen.target[0]} cy={screen.target[1]} r="7"/>
    {motion.kind==="locked"&&<path data-motion-locked d={`M${screen.target[0]-4},${screen.target[1]-4}l8,8m0,-8l-8,8`}/>}
  </g>;
}
