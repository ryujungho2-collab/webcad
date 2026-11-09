import type {CadDocument,CadSpline} from "@agent-webcad/cad-document";
import {validSpline} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import type {CopilotPlan} from "./copilotPlan";
import {copilotSolidContract,solidParameterPlan} from "./copilotSolid";
import {fitSpline,fittedSplineDefinition} from "../precision/fitSpline";
import {splineArea,splineLength} from "../precision/splineGeometry";
import {getWorldDrawingGeometry} from "../precision/worldGeometry";
import {getObjectTransform} from "../precision/objectTransform";
import {WORK_PLANES,planeToWorld,worldToPlane,type Vec3,type WorkPlaneId} from "../precision/workPlane";

export type DesignAnchor={objectId:string;role:"preserve"|"reference"|"core"|"opening"|"structure"};
export type DesignBrief={goal:string;requirements:string;assumptions:string;questions:string;qualities:string[];anchors:DesignAnchor[]};
export type DesignMark={viewId:string;box:[number,number,number,number];note:string};
export type DesignDecision={id:string;date:string;candidate:string;outcome:"keep"|"reject"|"applied";reason:string;summary:string[]};
export type DesignStudy={version:1;documentId:string;brief:DesignBrief;decisions:DesignDecision[];intentConfirmed?:boolean};
export type DesignCandidate={id:string;label:string;rationale:string;plan:CopilotPlan;origin:"local"|"gateway"};
export type DesignSettings={width:number;depth:number;tension:number;variation:number;parameter:string};
export const DESIGN_QUALITIES=["Flow / 연속성","Hierarchy / 주종 대비","Light / 빛과 여백","Quiet / 절제"];
export const emptyDesignStudy=(documentId:string,goal=""):DesignStudy=>({version:1,documentId,brief:{goal,requirements:"",assumptions:"",questions:"",qualities:[],anchors:[]},decisions:[]});
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
/** Sidecar contains intent and human decisions, never executable cached proposals. */
export function parseDesignStudy(raw:string,documentId:string):DesignStudy{
 if(new TextEncoder().encode(raw).length>128000)throw Error("Design study exceeds 128 KB.");const v:unknown=JSON.parse(raw);
 if(!record(v)||v.version!==1||v.documentId!==documentId||!record(v.brief)||!Array.isArray(v.decisions)||v.decisions.length>30)throw Error("Choose a version 1 design study for this document.");
 if(v.intentConfirmed!==undefined&&typeof v.intentConfirmed!=="boolean")throw Error("Invalid intent confirmation.");
 const b=v.brief;for(const key of ["goal","requirements","assumptions","questions"])if(typeof b[key]!=="string"||(b[key] as string).length>4000)throw Error("Brief fields must contain at most 4000 characters.");
 if(!Array.isArray(b.qualities)||b.qualities.length>8||!b.qualities.every(x=>typeof x==="string"&&x.length<=100)||!Array.isArray(b.anchors)||b.anchors.length>24||!b.anchors.every(a=>record(a)&&typeof a.objectId==="string"&&a.objectId.length<=200&&["preserve","reference","core","opening","structure"].includes(String(a.role))))throw Error("Invalid design qualities or anchors.");
 if(new Set(b.anchors.map(a=>a.objectId)).size!==b.anchors.length)throw Error("Use one role per anchored object.");
 if(!v.decisions.every(d=>record(d)&&typeof d.id==="string"&&d.id.length<=200&&typeof d.date==="string"&&d.date.length<=50&&typeof d.candidate==="string"&&d.candidate.length<=200&&["keep","reject","applied"].includes(String(d.outcome))&&typeof d.reason==="string"&&d.reason.length<=2000&&Array.isArray(d.summary)&&d.summary.length<=20&&d.summary.every(s=>typeof s==="string"&&s.length<=500)))throw Error("Invalid design decisions.");
 return {version:1,documentId,...v.intentConfirmed?{intentConfirmed:true}:{},brief:{goal:b.goal as string,requirements:b.requirements as string,assumptions:b.assumptions as string,questions:b.questions as string,qualities:[...b.qualities] as string[],anchors:b.anchors.map(a=>({objectId:a.objectId,role:a.role}))},decisions:v.decisions.map(d=>({id:d.id,date:d.date,candidate:d.candidate,outcome:d.outcome,reason:d.reason,summary:[...d.summary]}))} as DesignStudy;
}
/** Keep exported studies readable after long feedback sessions, including UTF-8 notes. */
export function appendDesignDecision(study:DesignStudy,decision:DesignDecision):DesignStudy{
 const next={...study,decisions:[...study.decisions,decision].slice(-30)};
 while(next.decisions.length&&new TextEncoder().encode(JSON.stringify(next)).length>128000)next.decisions.shift();
 return next;
}
export function validateDesignMarks(marks:unknown):asserts marks is DesignMark[]{if(!Array.isArray(marks)||marks.length>8||!marks.every(m=>record(m)&&typeof m.viewId==="string"&&m.viewId.length<=40&&Array.isArray(m.box)&&m.box.length===4&&m.box.every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1)&&m.box[2]>0&&m.box[3]>0&&m.box[0]+m.box[2]<=1.00001&&m.box[1]+m.box[3]<=1.00001&&typeof m.note==="string"&&m.note.length<=400))throw Error("Use at most eight bounded visual regions with short notes.");}
export function intentSuggestions(goal:string){const out:string[]=[];if(/DDP|유기|유선|organic|fluid/i.test(goal))out.push("Flow / 연속성");if(/웅장|강조|대비|contrast|dominant/i.test(goal))out.push("Hierarchy / 주종 대비");if(/빛|중정|밝|light|court/i.test(goal))out.push("Light / 빛과 여백");if(/단순|절제|조용|quiet|minimal/i.test(goal))out.push("Quiet / 절제");return out;}
export function designPreservationIssue(before:CadDocument,after:CadDocument,brief:DesignBrief){for(const a of brief.anchors){if(a.role==="reference")continue;const value=(d:CadDocument)=>({object:d.objects[a.objectId],features:Object.values(d.features).filter(f=>f.output===a.objectId)});if(!before.objects[a.objectId])return `Preserved object ${a.objectId} is missing. Rebind or remove the anchor.`;if(JSON.stringify(value(before))!==JSON.stringify(value(after)))return `Preserved ${a.role} object ${before.objects[a.objectId].name} would change. Choose a different target or revise the intent.`;}}

/** Local alternatives are transparent geometric studies, not an architectural reasoning model. */
export function localDesignCandidates(document:CadDocument,selectionIds:string[],plane:WorkPlaneId,layerId:string,settings:DesignSettings):DesignCandidate[]{
 if(!document.layers[layerId]?.visible||document.layers[layerId].locked)throw Error("Choose a visible, unlocked output layer.");
 if(![settings.width,settings.depth].every(n=>Number.isFinite(n)&&n>=10&&n<=100000)||!Number.isFinite(settings.tension)||settings.tension<.1||settings.tension>1.5||!Number.isFinite(settings.variation)||settings.variation<.02||settings.variation>.3)throw Error("Use width/depth 10–100000 mm, tangent 0.1–1.5 and variation 0.02–0.30.");
 const contract=copilotSolidContract(document,selectionIds);
 if(contract.targetId){const p=contract.parameters.find(p=>p.key===settings.parameter)??contract.parameters[0];return [-1,.5,1].map((factor,i)=>{const value=Number((p.value*(1+factor*settings.variation)).toFixed(5));return {id:`dimension-${i}`,label:["Compact / 축소","Balanced / 중간","Expanded / 확대"][i],rationale:`Change only ${p.key}: ${p.value} → ${value} mm. Other drivers remain unchanged; dependent geometry is checked in Review.`,plan:solidParameterPlan(contract,p.key,value),origin:"local"};});}
 if(selectionIds.length>1)throw Error("Local studies use one fitted contour or one supported solid. Gateway can plan a broader selected scope.");
 const object=document.objects[selectionIds[0]],f=Object.values(document.features).find(f=>f.output===selectionIds[0]);
 let points:Vec3[],target:string|undefined,tension=settings.tension;
 if(object&&f){
  const layer=document.layers[object.layerId];if(!object.visible||!layer?.visible||layer.locked||f.type!=="drawing"||f.inputs.length||f.pattern||f.construction||f.params.sketchId||!document.rootObjects.includes(object.id))throw Error("Select an independent visible, unlocked fitted spline or polyline.");
  const g=getWorldDrawingGeometry(object,f);if(!g?.planeAligned||g.workPlane!==plane)throw Error("Switch to the source work plane.");
  if(validSpline(f.params)){const fitted=fittedSplineDefinition(f.params);if(!fitted?.closed)throw Error("Local shape studies require a closed Through points spline. Advanced NURBS stays editable in Spline tools.");points=fitted.points;target=object.id;}
  else if(f.params.kind==="polyline"&&f.params.closed===true&&Array.isArray(f.params.points)&&(f.params.points as unknown[]).length<=60&&!(f.params.bulges as number[]|undefined)?.some(Boolean)){points=g.points!;if(Math.hypot(...points[0].map((v,j)=>v-points.at(-1)![j]))<1e-7)points=points.slice(0,-1);}
  else throw Error("Select a closed fitted spline or straight polyline, or deselect to create a new shape study.");
 }else{const w=settings.width,h=settings.depth;points=[[.05,.28],[.16,.08],[.43,.05],[.69,.16],[.93,.27],[.97,.56],[.83,.84],[.53,.96],[.24,.85],[.06,.61]].map(([x,y])=>planeToWorld([x*w,y*h],WORK_PLANES[plane]));}
 const source2=points.map(p=>worldToPlane(p,WORK_PLANES[plane])),xs=source2.map(p=>p[0]),ys=source2.map(p=>p[1]),xmin=Math.min(...xs),ymin=Math.min(...ys),w=Math.max(...xs)-xmin,h=Math.max(...ys)-ymin;
 if(w<1e-6||h<1e-6)throw Error("The contour needs a finite two-dimensional extent.");
 const id=`design-${crypto.randomUUID()}`;
 return ["flow","hierarchy","threshold"].map((kind,i)=>{
  const v=settings.variation,anchors=source2.map(([x,y])=>{const u=(x-xmin)/w,t=(y-ymin)/h;return kind==="flow"?[x+(u-.5)*w*v*.7,y-(t-.5)*h*v*.4]:kind==="hierarchy"?[x+w*v*Math.sin(Math.PI*t)*Math.cos(Math.PI*u),y+h*v*(u-.5)*Math.sin(Math.PI*t)]:[x,y+h*v*Math.exp(-(((u-.66)/.23)**2))*Math.exp(-((t/.27)**2))];});
  let spline:CadSpline;if(target){const frame=getObjectTransform(object!,f!);if(frame.rotation.some(n=>Math.abs(n)>1e-8)||frame.scale.some(n=>Math.abs(n-1)>1e-8))throw Error("Local spline studies support translation only; use a world-space copy for rotated/scaled sources.");spline=fitSpline(anchors.map(([x,y],j)=>{const p=planeToWorld([x,y],WORK_PLANES[plane]);const axis=WORK_PLANES[plane].normal.findIndex(v=>v!==0);p[axis]=points[j][axis];return p;}),true,tension);}
  else spline=fitSpline(anchors.map(([x,y])=>{const p=planeToWorld([x,y],WORK_PLANES[plane]),axis=WORK_PLANES[plane].normal.findIndex(v=>v!==0);p[axis]=points[0][axis];return p;}),true,tension);
  const command:CadCommand=target?{type:"update-spline",objectId:target,spline}:{type:"create-drawing",id:`${id}-${i}`,name:`Design study / ${kind}`,layerId,drawing:"spline",params:{...spline,workPlane:plane}};
  const length=splineLength(spline,.01),area=splineArea(spline,.1)!;
  return {id:kind,label:["Flow / 연속적인 외곽","Hierarchy / 비대칭 강조","Threshold / 오목한 진입면"][i],rationale:["Adjust the aspect ratio of the same closed curve.","Redistribute the contour toward one side; this is a shape study, not a room layout.","Indent the lower edge near 66% of the width. This does not create a door or an accessible entrance."][i],origin:"local",plan:{command,summary:[`${kind}: perimeter ${length.toFixed(1)} mm, enclosed area ${area.toFixed(1)} mm².`,target?"Updates the selected spline; snapshot derivatives are not automatically rebuilt.":"Creates a separate exact fitted spline. Existing reference geometry stays intact."],ghosts:[],resultObjectIds:[target??`${id}-${i}`]}};
 });
}
