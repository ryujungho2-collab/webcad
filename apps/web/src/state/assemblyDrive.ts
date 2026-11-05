import type {AssemblyJoint,CadDocument,CadObjectTransform} from "@agent-webcad/cad-document";
import {drivenAssemblyParts,motionPose,type MotionReport,type MotionRequest} from "./assemblyMotion";
import {getObjectTransform} from "../precision/objectTransform";

/**
 * Joint drive preview helpers. They only use the public assembly engine API
 * (motionPose / drivenAssemblyParts) and never mutate the live document.
 */
export type DriveRange={min:number;max:number;limited:boolean};
export const DEFAULT_UNLIMITED_RANGE:[number,number]=[0,360];

/** Playback range: the Joint limits when present, otherwise an explicit fallback sweep. */
export function driveRange(j:Pick<AssemblyJoint,"min"|"max">,fallback:[number,number]=DEFAULT_UNLIMITED_RANGE):DriveRange{
 const min=j.min??Math.min(fallback[0],j.max??fallback[0]),max=j.max??Math.max(fallback[1],j.min??fallback[1]);
 return {min,max,limited:j.min!==undefined||j.max!==undefined};
}
export const clampDriveAngle=(angle:number,r:Pick<DriveRange,"min"|"max">)=>Math.min(r.max,Math.max(r.min,Number.isFinite(angle)?angle:r.min));

export type DriveState={angle:number;dir:1|-1};
export type DriveOptions={min:number;max:number;speed:number;repeat:boolean};
/** One animation tick. Repeat bounces between min and max; without repeat it stops at the far end. */
export function stepDrive(s:DriveState,dtMs:number,o:DriveOptions):DriveState&{finished:boolean}{
 const span=o.max-o.min;if(!(span>0)||!(o.speed>0)||!(dtMs>=0))return {...s,finished:true};
 let angle=clampDriveAngle(s.angle,o),dir=s.dir,left=o.speed*dtMs/1000;
 for(let guard=0;left>1e-12&&guard<8;guard++){
  const room=dir>0?o.max-angle:angle-o.min;
  if(left<room){angle+=dir*left;left=0;break;}
  angle=dir>0?o.max:o.min;left-=room;
  if(!o.repeat)return {angle,dir,finished:true};
  dir=dir>0?-1:1;
 }
 return {angle:clampDriveAngle(angle,o),dir,finished:false};
}

export type DrivePose={joint:AssemblyJoint;poses:Record<string,CadObjectTransform>};
/** Absolute pose of the whole tree with one Joint at `angle`; the live document is cloned, never edited. */
export function drivePose(source:CadDocument,jointId:string,angle:number):DrivePose{
 const request:MotionRequest={jointId,start:angle,end:angle,step:1,partIds:[],exceptions:[],tolerance:1e-6};
 const d=motionPose(source,request,angle);
 const poses=Object.fromEntries(Object.values(d.objects).filter(o=>o.visible).map(o=>[o.id,getObjectTransform(o,Object.values(d.features).find(f=>f.output===o.id))]));
 return {joint:d.assembly!.joints[jointId],poses};
}
/** Parts that move together with this Joint's child, including downstream Joint chains. */
export function followerParts(source:CadDocument,jointId:string){return [...drivenAssemblyParts(source,jointId)];}

export type DriveInterference={sampleAngle:number;pairs:[string,string][]};
/** Penetrating samples for one driver Joint; exceptions keep their original result and are not flagged. */
export function interferenceSamples(report:MotionReport|null,jointId:string):DriveInterference[]{
 if(!report||report.request.jointId!==jointId)return [];
 const byAngle=new Map<number,[string,string][]>();
 for(const row of report.rows)if(row.status==="penetration"){const list=byAngle.get(row.angle)??[];list.push(row.pair);byAngle.set(row.angle,list);}
 return [...byAngle].map(([sampleAngle,pairs])=>({sampleAngle,pairs})).sort((a,b)=>a.sampleAngle-b.sampleAngle);
}
/** Highlight only when the pose sits on (or within half a step of) a measured penetrating sample. */
export function interferenceAtAngle(report:MotionReport|null,jointId:string,angle:number):DriveInterference|null{
 if(!report||report.request.jointId!==jointId)return null;
 const tolerance=Math.max(report.request.step/2,1e-6),hits=interferenceSamples(report,jointId).filter(s=>Math.abs(s.sampleAngle-angle)<=tolerance+1e-9);
 if(!hits.length)return null;
 return hits.reduce((best,s)=>Math.abs(s.sampleAngle-angle)<Math.abs(best.sampleAngle-angle)?s:best);
}

// Latest Motion Inspection result, shared read-only with the drive panel.
let latest:MotionReport|null=null;const listeners=new Set<()=>void>();
export const motionReportForDrive=()=>latest;
export function publishMotionReport(report:MotionReport|null){if(latest===report)return;latest=report;for(const fn of listeners)fn();}
export function subscribeMotionReport(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
