import type {CadDocument} from "./CadDocument";
export type FrameViewRole="front"|"top"|"right";
export type CadFrameReference=
 | {kind:"orthographic";fromView:FrameViewRole;toView:FrameViewRole}
 | {kind:"section";number:string;cut:[[number,number],[number,number]];direction:"left"|"right"}
 | {kind:"detail";number:string}
 | {kind:"part";number:string;sourceObjectId:string};
export type CadFrameLink={id:string;fromId:string;toId:string;placement:"left"|"right"|"above"|"below";gap:number;fixed:boolean;reference:CadFrameReference};
const name=(s:unknown):s is string=>typeof s==="string"&&s.trim().length>0&&s.length<=200;
const pair=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite);
export function validFrameLink(value:unknown):value is CadFrameLink {
 if(!value||typeof value!=="object")return false;const l=value as CadFrameLink,r=l.reference;
 if(!name(l.id)||!name(l.fromId)||!name(l.toId)||l.fromId===l.toId||!["left","right","above","below"].includes(l.placement)||!Number.isFinite(l.gap)||l.gap<0||l.gap>1e6||typeof l.fixed!=="boolean"||!r||typeof r!=="object")return false;
 if(r.kind==="orthographic")return ["front","top","right"].includes(r.fromView)&&["front","top","right"].includes(r.toView)&&r.fromView!==r.toView&&[r.fromView,r.toView].includes("front")&&([r.fromView,r.toView].includes("top")?["above","below"]:["left","right"]).includes(l.placement);
 if(!("number" in r)||!name(r.number)||r.number.length>20)return false;
 if(r.kind==="section")return Array.isArray(r.cut)&&r.cut.length===2&&r.cut.every(pair)&&Math.hypot(r.cut[1][0]-r.cut[0][0],r.cut[1][1]-r.cut[0][1])>1e-8&&["left","right"].includes(r.direction);
 return r.kind==="detail"||r.kind==="part"&&name(r.sourceObjectId);
}
/** Structural graph validation permits unresolved model sources and layout drift. */
export function validateFrameLinks(d:CadDocument){
 const links=d.frameLinks;if(links===undefined)return;
 if(!links||typeof links!=="object"||Array.isArray(links)||Object.keys(links).length>1000)throw Error("Invalid frame link collection.");
 const parents=new Map<string,string>(),numbers=new Set<string>(),roles=new Map<string,FrameViewRole>();
 for(const [id,l] of Object.entries(links)){
  if(!validFrameLink(l)||id!==l.id)throw Error(`Invalid frame link ${id}.`);
  const a=d.artboards?.[l.fromId],b=d.artboards?.[l.toId];if(!a?.frame||!b?.frame||a.workPlane!==b.workPlane)throw Error("Frame links require existing frames on the same presentation plane.");
  if(parents.has(l.toId))throw Error("Conflicting frame parents. Detach the previous connection first.");parents.set(l.toId,l.fromId);
  if(l.reference.kind==="orthographic")for(const [frameId,role] of [[l.fromId,l.reference.fromView],[l.toId,l.reference.toView]] as const){if(roles.has(frameId)&&roles.get(frameId)!==role)throw Error("Conflicting orthographic roles. Use a separate frame for another view.");roles.set(frameId,role);}
  if(l.reference.kind!=="orthographic"){const key=l.reference.kind+":"+l.reference.number;if(numbers.has(key))throw Error("Duplicate frame reference number. Choose another number.");numbers.add(key);}
 }
 for(const id of parents.keys()){const seen=new Set<string>();let p:string|undefined=id;while(p){if(seen.has(p))throw Error("Cyclic frame connections are not allowed.");seen.add(p);p=parents.get(p);}}
}
