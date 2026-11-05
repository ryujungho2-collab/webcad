import {validCanvasFlex,validCanvasFlexItem} from "./CanvasFlex";
import type {CadDocument} from "./CadDocument";
export type CanvasTargetKind="canvas"|"object"|"artboard"|"workspace-section"|"projection"|"section"|"sheet"|"scene";
export type CanvasMember={kind:CanvasTargetKind;id:string;relation:"own"|"reference";layout?:import("./CanvasFlex").CanvasFlexItem};
/** Bounds organize the global work-plane space; parenting never applies a CAD transform. */
export type CadCanvas={id:string;name:string;units:"model-mm"|"paper-mm";workPlane:"XY"|"XZ"|"YZ";origin:[number,number];size:[number,number];locked:boolean;layout?:import("./CanvasFlex").CanvasFlexLayout;members:CanvasMember[]};
const entry=<T>(collection:Record<string,T>|undefined,id:string):T|undefined=>collection&&Object.hasOwn(collection,id)?collection[id]:undefined;
const name=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=200;
export const canvasTargetKey=(m:Pick<CanvasMember,"kind"|"id">)=>`${m.kind}:${m.id}`;
export function validCanvasMember(v:unknown):v is CanvasMember{if(!v||typeof v!=="object")return false;const m=v as CanvasMember;return ["canvas","object","artboard","workspace-section","projection","section","sheet","scene"].includes(m.kind)&&name(m.id)&&["own","reference"].includes(m.relation)&&(m.layout===undefined||validCanvasFlexItem(m.layout));}
export function validCanvas(v:unknown):v is CadCanvas{
 if(!v||typeof v!=="object")return false;const c=v as CadCanvas;
 return (c.layout===undefined||validCanvasFlex(c.layout))&&name(c.id)&&name(c.name)&&["model-mm","paper-mm"].includes(c.units)&&["XY","XZ","YZ"].includes(c.workPlane)&&typeof c.locked==="boolean"&&Array.isArray(c.origin)&&c.origin.length===2&&c.origin.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e7)&&Array.isArray(c.size)&&c.size.length===2&&c.size.every(n=>Number.isFinite(n)&&n>0&&n<=1e7)&&Array.isArray(c.members)&&c.members.length<=1000&&c.members.every(validCanvasMember)&&new Set(c.members.map(canvasTargetKey)).size===c.members.length;
}
export function canvasTarget(document:CadDocument,m:Pick<CanvasMember,"kind"|"id">):{name:string;units:CadCanvas["units"];workPlane?:CadCanvas["workPlane"];objectIds:string[];artboardIds:string[]}|undefined{
 const p=document.modelPresentation;
 if(m.kind==="canvas"){const c=entry(document.canvases,m.id);return c?{name:c.name,units:c.units,workPlane:c.workPlane,objectIds:[],artboardIds:[]}:undefined;}
 if(m.kind==="object"){const o=entry(document.objects,m.id),f=Object.values(document.features).find(f=>f.output===m.id),plane=f?.params.workPlane;return o?{name:o.name,units:"model-mm",workPlane:["XY","XZ","YZ"].includes(String(plane))?plane as CadCanvas["workPlane"]:undefined,objectIds:[o.id],artboardIds:[]}:undefined;}
 if(m.kind==="artboard"){const b=entry(document.artboards,m.id);return b?{name:b.name,units:"paper-mm",workPlane:b.workPlane,objectIds:[],artboardIds:[b.id]}:undefined;}
 if(m.kind==="workspace-section"){const s=entry(document.workspaceSections,m.id);return s?{name:s.name,units:"paper-mm",workPlane:s.workPlane,objectIds:[],artboardIds:[...s.frameIds]}:undefined;}
 if(m.kind==="projection"||m.kind==="section"){const v=m.kind==="projection"?entry(p?.projections,m.id):entry(p?.sections,m.id);return v?{name:v.name,units:"model-mm",workPlane:"XY",objectIds:[...Object.values(v.outputs),...Object.values("decorations" in v?v.decorations??{}:{})].map(o=>o.objectId),artboardIds:[]}:undefined;}
 if(m.kind==="sheet"){const s=entry(p?.sheets,m.id),b=s&&entry(document.artboards,s.artboardId);return s&&b?{name:s.name,units:"paper-mm",workPlane:b.workPlane,objectIds:[],artboardIds:[b.id]}:undefined;}
 const s=entry(document.scenes,m.id),b=s&&entry(document.artboards,s.artboardId);return s&&b?{name:s.name,units:"paper-mm",workPlane:b.workPlane,objectIds:[...s.objectIds],artboardIds:[b.id]}:undefined;
}
function ownedKeys(document:CadDocument,m:CanvasMember):string[]{
 const keys=[canvasTargetKey(m)];
 // Sections and sheets already own their boards; frame memberIds remain presentation references.
 if(m.kind==="workspace-section"||m.kind==="sheet")keys.push(...(canvasTarget(document,m)?.artboardIds??[]).map(id=>`artboard:${id}`));
 return keys;
}
export function validateCanvasHierarchy(document:CadDocument):void{
 if(document.canvases===undefined)return;
 const nodes=document.canvases;
 if(!nodes||typeof nodes!=="object"||Array.isArray(nodes)||Object.keys(nodes).length>256)throw Error("Invalid canvas collection (maximum 256 canvases).");
 const owners=new Map<string,string>();let count=0;
 for(const [id,c] of Object.entries(nodes)){
  if(!validCanvas(c)||id!==c.id)throw Error(`Invalid canvas: ${id}.`);
  count+=c.members.length;if(count>5000)throw Error("Canvas hierarchy exceeds 5,000 memberships.");
  for(const m of c.members){
   const target=canvasTarget(document,m);if(!target)throw Error(`Canvas ${c.name} references missing ${canvasTargetKey(m)}. Detach it before deleting its source.`);
   if(m.relation==="own"){
    if(target.units!==c.units||target.workPlane&&target.workPlane!==c.workPlane)throw Error(`Canvas ${c.name}: ownership requires matching model/paper units and work plane. Use a reference across this boundary.`);
    for(const key of ownedKeys(document,m)){if(owners.has(key))throw Error(`Duplicate canvas ownership of ${key}. Release its current owner first.`);owners.set(key,id);}
   }
  }
 }
 const visiting=new Set<string>(),depths=new Map<string,number>();
 const visit=(id:string):number=>{if(visiting.has(id))throw Error("Canvas cycle detected in ownership or reference links.");if(depths.has(id))return depths.get(id)!;visiting.add(id);let depth=1;for(const m of nodes[id].members)if(m.kind==="canvas")depth=Math.max(depth,1+visit(m.id));visiting.delete(id);if(depth>32)throw Error("Canvas hierarchy exceeds 32 levels.");depths.set(id,depth);return depth;};
 for(const id of Object.keys(nodes))visit(id);
}
export function canvasOwner(document:CadDocument,id:string){return Object.values(document.canvases??{}).find(c=>c.members.some(m=>m.kind==="canvas"&&m.id===id&&m.relation==="own"));}
export function canvasLockReason(document:CadDocument,id:string):string|undefined{
 const seen=new Set<string>();let current=entry(document.canvases,id);
 while(current&&!seen.has(current.id)){seen.add(current.id);if(current.locked)return `Canvas ${current.name} is locked. Unlock it before editing its hierarchy.`;current=canvasOwner(document,current.id);}return undefined;
}
/** Explicit adapter from flat legacy structures. No existing entity/coordinate/reference is edited. */
export function legacyCanvasHierarchy(document:CadDocument):Record<string,CadCanvas>{
 const nodes:Record<string,CadCanvas>={},derived=new Set<string>();
 const add=(units:CadCanvas["units"],plane:CadCanvas["workPlane"],member:CanvasMember)=>{const id=`canvas-${units==="model-mm"?"model":"paper"}-${plane.toLowerCase()}`;nodes[id]??={id,name:`${units==="model-mm"?"Model":"Paper"} · ${plane}`,units,workPlane:plane,origin:[0,0],size:units==="model-mm"?[1000,1000]:[420,297],locked:false,members:[]};nodes[id].members.push(member);};
 for(const kind of ["projection","section"] as const)for(const v of Object.values(kind==="projection"?document.modelPresentation?.projections??{}:document.modelPresentation?.sections??{})){const target=canvasTarget(document,{kind,id:v.id})!;target.objectIds.forEach(id=>derived.add(id));add("model-mm","XY",{kind,id:v.id,relation:"reference"});}
 for(const feature of Object.values(document.features))if(feature.params.modelProjection||feature.params.modelSection||feature.params.modelSectionPresentation||feature.params.modelSheet)derived.add(feature.output);
 for(const id of document.rootObjects){if(derived.has(id))continue;const t=canvasTarget(document,{kind:"object",id})!;add("model-mm",t.workPlane??"XY",{kind:"object",id,relation:"own"});}
 const boards=new Set<string>();
 for(const section of Object.values(document.workspaceSections??{})){add("paper-mm",section.workPlane,{kind:"workspace-section",id:section.id,relation:"own"});section.frameIds.forEach(id=>boards.add(id));}
 for(const sheet of Object.values(document.modelPresentation?.sheets??{})){const b=document.artboards?.[sheet.artboardId];if(!b)continue;add("paper-mm",b.workPlane,{kind:"sheet",id:sheet.id,relation:boards.has(b.id)?"reference":"own"});boards.add(b.id);}
 for(const b of Object.values(document.artboards??{}))if(!boards.has(b.id))add("paper-mm",b.workPlane,{kind:"artboard",id:b.id,relation:"own"});
 for(const s of Object.values(document.scenes??{})){const b=entry(document.artboards,s.artboardId);if(b)add("paper-mm",b.workPlane,{kind:"scene",id:s.id,relation:"reference"});}
 for(const c of Object.values(nodes))if(c.units==="paper-mm"){
  const boxes=c.members.flatMap(m=>{const t=canvasTarget(document,m);return (t?.artboardIds??[]).map(id=>document.artboards?.[id]).filter((b):b is NonNullable<typeof b>=>!!b);});
  if(boxes.length){const x=Math.min(...boxes.map(b=>b.origin[0]))-20,y=Math.min(...boxes.map(b=>b.origin[1]))-20;c.origin=[x,y];c.size=[Math.max(...boxes.map(b=>b.origin[0]+b.size[0]))-x+20,Math.max(...boxes.map(b=>b.origin[1]+b.size[1]))-y+20];}
 }
 if(!Object.keys(nodes).length)nodes["canvas-model-xy"]={id:"canvas-model-xy",name:"Model · XY",units:"model-mm",workPlane:"XY",origin:[0,0],size:[1000,1000],locked:false,members:[]};
 validateCanvasHierarchy({...document,canvases:nodes});return nodes;
}
