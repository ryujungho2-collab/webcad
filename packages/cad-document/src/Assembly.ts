import type {CadDocument} from "./CadDocument";
import type {CadObjectTransform} from "./CadObject";
export type JointCoupling={driverId:string;ratio:number;offset:number};
type JointFrame={id:string;parentId:string;childId:string;origin:[number,number,number];axis:[number,number,number];min?:number;max?:number;coupling?:JointCoupling};
export type JointInput=JointFrame & ({type:"fixed"|"revolute";angle:number;offset?:never}|{type:"prismatic";offset:number;angle?:number});
// angle remains zero on prismatic joints for compatibility with existing readers of the in-memory model.
export type AssemblyJoint=JointInput & {rest:CadObjectTransform;angle:number};
export type CadAssembly={version:1;grounded:string[];joints:Record<string,AssemblyJoint>};
const record=(v:unknown):v is Record<string,any>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const name=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&v.length<=200&&!["__proto__","constructor","prototype"].includes(v);
const vec=(v:unknown):v is [number,number,number]=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e9);
const scalar=(v:unknown,limit=1e9):v is number=>typeof v==="number"&&Number.isFinite(v)&&Math.abs(v)<=limit;
const coupling=(v:unknown):v is JointCoupling=>record(v)&&Object.keys(v).length===3&&Object.keys(v).every(k=>["driverId","ratio","offset"].includes(k))&&name(v.driverId)&&scalar(v.ratio)&&scalar(v.offset);
export const jointValue=(j:JointInput)=>j.type==="prismatic"?j.offset:j.angle;
export function validJointInput(v:unknown):v is JointInput{
 if(!record(v)||Object.keys(v).some(k=>!["id","type","parentId","childId","origin","axis","angle","offset","coupling","min","max","rest"].includes(k)))return false;
 const value=v.type==="prismatic"?v.offset:v.angle;
 return name(v.id)&&name(v.parentId)&&name(v.childId)&&v.parentId!==v.childId&&["fixed","revolute","prismatic"].includes(v.type)&&vec(v.origin)&&vec(v.axis)&&Math.abs(Math.hypot(...v.axis)-1)<1e-8&&scalar(value,v.type==="prismatic"?1e9:360000)&&(v.type==="prismatic"?(v.angle===undefined||v.angle===0):v.offset===undefined)&&(v.min===undefined||Number.isFinite(v.min))&&(v.max===undefined||Number.isFinite(v.max))&&(v.min===undefined||v.max===undefined||v.min<=v.max)&&(v.coupling!==undefined?coupling(v.coupling):(v.min===undefined||value>=v.min)&&(v.max===undefined||value<=v.max))&&(v.type!=="fixed"||v.angle===0&&v.min===undefined&&v.max===undefined&&v.coupling===undefined);
}
/** Resolve the scalar dependency graph independently of the rigid parent tree. Units are degrees or document length units. */
export function resolveJointValues(a:CadAssembly){
 const values=new Map<string,number>(),visiting=new Set<string>();
 const visit=(id:string):number=>{if(values.has(id))return values.get(id)!;if(visiting.has(id))throw Error("Assembly coupling cycle.");
  const j=Object.hasOwn(a.joints,id)?a.joints[id]:undefined;if(!j)throw Error("Missing coupling driver.");visiting.add(id);
  if(j.coupling&&a.joints[j.coupling.driverId]?.type==="fixed")throw Error("Fixed Joint cannot drive coupling.");
  const value=j.coupling?visit(j.coupling.driverId)*j.coupling.ratio+j.coupling.offset:jointValue(j);
  if(!scalar(value,j.type==="prismatic"?1e9:360000)||j.min!==undefined&&value<j.min||j.max!==undefined&&value>j.max)throw Error("Joint value outside limits.");
  visiting.delete(id);values.set(id,value);return value;
 };for(const id of Object.keys(a.joints))visit(id);return values;
}
export function validateAssembly(document:CadDocument){
 const a=document.assembly;if(a===undefined)return;
 if(!record(a)||a.version!==1||Object.keys(a).some(k=>!["version","grounded","joints"].includes(k))||!Array.isArray(a.grounded)||new Set(a.grounded).size!==a.grounded.length||a.grounded.some(id=>!name(id)||!Object.hasOwn(document.objects,id))||!record(a.joints)||Object.keys(a.joints).length>256)throw Error("Invalid assembly or grounded part.");
 const parent=new Map<string,string>();
 for(const [id,j] of Object.entries(a.joints)){
  if(!validJointInput(j)||id!==j.id||!Object.hasOwn(document.objects,j.parentId)||!Object.hasOwn(document.objects,j.childId)||parent.has(j.childId)||a.grounded.includes(j.childId)||!record(j.rest)||!vec(j.rest.translation)||!vec(j.rest.rotation)||!vec(j.rest.scale)||j.rest.scale.some(s=>Math.abs(s-1)>1e-8))throw Error("Invalid joint reference, duplicate child, grounded child or rest frame.");
  parent.set(j.childId,j.parentId);
 }
 for(const id of parent.keys()){const seen=new Set<string>();let n:string|undefined=id;while(n){if(seen.has(n))throw Error("Assembly joint cycle.");seen.add(n);n=parent.get(n);}}
 resolveJointValues(a);
}

export type JointEdit={origin?:[number,number,number];axis?:[number,number,number];min?:number|null;max?:number|null;coupling?:JointCoupling|null};
export function validJointEdit(v:unknown):v is JointEdit{
 return record(v)&&Object.keys(v).length>0&&Object.keys(v).every(k=>["origin","axis","min","max","coupling"].includes(k))&&(v.origin===undefined||vec(v.origin))&&(v.axis===undefined||vec(v.axis)&&Math.abs(Math.hypot(...v.axis)-1)<1e-8)&&["min","max"].every(k=>v[k]===undefined||v[k]===null||typeof v[k]==="number"&&Number.isFinite(v[k]))&&(v.min==null||v.max==null||v.min<=v.max)&&(v.coupling==null||coupling(v.coupling));
}

export type DescendantPolicy='move-subtree'|'preserve-descendant-world';
export function validRigidWorldPose(v:unknown):v is CadObjectTransform{return record(v)&&Object.keys(v).length===3&&Object.keys(v).every(k=>['translation','rotation','scale'].includes(k))&&vec(v.translation)&&v.translation.every(n=>Math.abs(n)<=1e6)&&vec(v.rotation)&&v.rotation.every(n=>Math.abs(n)<=1e6)&&vec(v.scale)&&v.scale.every(s=>s===1);}
