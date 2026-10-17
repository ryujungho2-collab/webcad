import {validModelClip,validModelSection,validModelSheet,type ModelClip,type ModelSection,type ModelSheet} from "./ModelDrawing";
export type ModelVector = [number, number, number];
export type CadModelPart = {id:string; name:string; objectId:string};
export type CadExplodedView = {id:string; name:string; amount:number; offsets:Record<string,{direction:ModelVector; distance:number}>};
export type CadModelProjection = {
 id:string; name:string; partIds:string[]; basis:"XY"|"XZ"|"YZ"; origin:[number,number]; scale:number; layerId:string;
 status:"resolved"|"unresolved"; reason?:string;
 method?:"brep-hlr";edgePolicy?:"sharp-outline";direction?:"opposite";hiddenLines?:"omit";
 outputs:Record<string,{objectId:string; sourceEdges:string[]; kind:"spline"|"rectangle"|"circle"|"line"|"arc"|"ellipse"|"elliptic-arc";partId?:string}>;
};
export type CadModelPresentation = {parts:Record<string,CadModelPart>; explosions:Record<string,CadExplodedView>; projections:Record<string,CadModelProjection>; activeExplosionId:string|null;clipping?:ModelClip;sections?:Record<string,ModelSection>;sheets?:Record<string,ModelSheet>};
const record=(v:unknown):v is Record<string,any>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const name=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=200;
const vector=(v:unknown,n=3):v is number[]=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
export const validModelPart=(v:unknown):v is CadModelPart=>record(v)&&name(v.id)&&name(v.name)&&name(v.objectId);
export function validExplodedView(v:unknown):v is CadExplodedView{return record(v)&&name(v.id)&&name(v.name)&&Number.isFinite(v.amount)&&v.amount>=0&&v.amount<=1&&record(v.offsets)&&Object.keys(v.offsets).length>0&&Object.entries(v.offsets).every(([id,o])=>name(id)&&record(o)&&vector(o.direction)&&Math.abs(Math.hypot(...o.direction)-1)<1e-8&&Number.isFinite(o.distance)&&o.distance>=0);}
export function validModelProjection(v:unknown):v is CadModelProjection{return record(v)&&name(v.id)&&name(v.name)&&Array.isArray(v.partIds)&&v.partIds.length>0&&v.partIds.every(name)&&new Set(v.partIds).size===v.partIds.length&&["XY","XZ","YZ"].includes(v.basis)&&vector(v.origin,2)&&Number.isFinite(v.scale)&&v.scale>0&&name(v.layerId)&&["resolved","unresolved"].includes(v.status)&&(v.reason===undefined||typeof v.reason==="string")&&(v.method===undefined||v.method==="brep-hlr")&&(v.hiddenLines===undefined||v.method==="brep-hlr"&&v.hiddenLines==="omit")&&(v.direction===undefined||v.method==="brep-hlr"&&v.direction==="opposite")&&(v.edgePolicy===undefined||v.method==="brep-hlr"&&v.edgePolicy==="sharp-outline")&&record(v.outputs)&&Object.values(v.outputs).every(o=>record(o)&&name(o.objectId)&&(v.method==="brep-hlr"?["spline","line","circle","arc","ellipse","elliptic-arc"]:["rectangle","circle"]).includes(o.kind)&&(v.method!=="brep-hlr"||name(o.partId)&&v.partIds.includes(o.partId))&&Array.isArray(o.sourceEdges)&&o.sourceEdges.length>0&&o.sourceEdges.every(name));}
export function validateModelPresentation(v:unknown){
 if(v===undefined)return;if(!record(v)||!record(v.parts)||!record(v.explosions)||!record(v.projections)||!(v.activeExplosionId===null||typeof v.activeExplosionId==="string"&&v.explosions[v.activeExplosionId]))throw Error("Invalid model presentation.");
 if(v.clipping!==undefined&&!validModelClip(v.clipping))throw Error("Invalid clipping plane.");
 if(v.sections!==undefined&&(!record(v.sections)||Object.entries(v.sections).some(([id,s])=>!validModelSection(s)||s.id!==id||s.partIds.some(id=>!v.parts[id]))))throw Error("Invalid section view.");
 if(v.sheets&&new Set(Object.values(v.sheets as Record<string,ModelSheet>).map(s=>s.artboardId)).size!==Object.keys(v.sheets).length)throw Error("Duplicate model sheet artboard ownership.");
 if(v.sheets!==undefined&&(!record(v.sheets)||Object.entries(v.sheets).some(([id,s])=>!validModelSheet(s)||s.id!==id||Object.keys(s.placements).some(id=>!v.sections?.[id]&&!v.projections[id]))))throw Error("Invalid model sheet view reference.");
 const owners=Object.values(v.sheets??{}).flatMap((s:any)=>Object.keys(s.placements));if(new Set(owners).size!==owners.length)throw Error("Duplicate model sheet view ownership.");
 const sets=new Set(Object.values(v.sheets??{}).map((s:any)=>s.publication?.setId).filter(Boolean));for(const id of sets){const pages=Object.values(v.sheets as Record<string,ModelSheet>).filter(s=>s.publication?.setId===id).sort((a,b)=>a.publication!.page-b.publication!.page),root=pages[0];if(!root||root.id!==id||pages.length!==root.publication!.pageCount||pages.some((s,i)=>s.publication!.page!==i+1||s.publication!.pageCount!==pages.length||s.denominator!==root.denominator||JSON.stringify([s.publication!.fields,s.publication!.template,s.publication!.alignment])!==JSON.stringify([root.publication!.fields,root.publication!.template,root.publication!.alignment])))throw Error("Invalid model sheet set page ownership/order.");}
 const sources=new Set<string>();for(const [id,p] of Object.entries(v.parts)){if(!validModelPart(p)||p.id!==id||sources.has(p.objectId))throw Error("Invalid or duplicated model part.");sources.add(p.objectId);}
 for(const [id,e] of Object.entries(v.explosions))if(!validExplodedView(e)||e.id!==id||Object.keys(e.offsets).some(p=>!v.parts[p]))throw Error("Invalid exploded view part reference.");
 for(const [id,p] of Object.entries(v.projections))if(!validModelProjection(p)||p.id!==id||p.partIds.some(id=>!v.parts[id]))throw Error("Invalid model projection part reference.");
}
