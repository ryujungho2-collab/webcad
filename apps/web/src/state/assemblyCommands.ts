import {Matrix4,Quaternion,Euler,Vector3,MathUtils} from "three";
import {jointValue,resolveJointValues,validRigidWorldPose,interferencePairKey,validateInterferenceIntents,validateAssembly,validJointInput,validJointEdit,type AssemblyJoint,type CadDocument,type CadObjectTransform} from "@agent-webcad/cad-document";
import type {CommandBus} from "@agent-webcad/cad-commands";
import {getObjectTransform} from "../precision/objectTransform";
export function assemblyMatrix(t:CadObjectTransform){return new Matrix4().compose(new Vector3(...t.translation),new Quaternion().setFromEuler(new Euler(...t.rotation.map(MathUtils.degToRad) as [number,number,number],"XYZ")),new Vector3(...t.scale));}
function transform(m:Matrix4):CadObjectTransform{const p=new Vector3(),q=new Quaternion(),s=new Vector3();m.decompose(p,q,s);const e=new Euler().setFromQuaternion(q,"XYZ");return {translation:p.toArray().map(n=>Object.is(n,-0)?0:n) as [number,number,number],rotation:[e.x,e.y,e.z].map(MathUtils.radToDeg).map(n=>Object.is(n,-0)?0:n) as [number,number,number],scale:[1,1,1]};}
function part(d:CadDocument,id:string){const o=d.objects[id],f=Object.values(d.features).find(f=>f.output===id);if(!o||!f||!["primitive","extrude","boolean","fillet","chamfer","revolve","sweep","loft","shell","mesh"].includes(f.type)||f.params.hybridDatum)throw Error("Assembly requires existing independent BRep/mesh parts (Bake procedural/datum outputs first).");const t=getObjectTransform(o,f);if([...t.translation,...t.rotation,...t.scale].some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))throw Error("Invalid rigid part frame.");if(t.scale.some(s=>Math.abs(s-1)>1e-8))throw Error("Assembly MVP requires unit scale; scaled/sheared frames unsupported.");return t;}
const changed=(a:CadObjectTransform,b:CadObjectTransform)=>{const x=assemblyMatrix(a).elements,y=assemblyMatrix(b).elements;return x.some((n,i)=>Math.abs(n-y[i])>1e-7);};
export function jointMotion(j:AssemblyJoint,value=jointValue(j)){if(j.type==="prismatic")return new Matrix4().makeTranslation(...j.axis.map(n=>n*value) as [number,number,number]);return new Matrix4().makeTranslation(...j.origin).multiply(new Matrix4().makeRotationAxis(new Vector3(...j.axis),MathUtils.degToRad(value))).multiply(new Matrix4().makeTranslation(...j.origin.map(n=>-n) as [number,number,number]));}
export function evaluateAssembly(d:CadDocument,before?:CadDocument,allowJointEdit=false){
 validateInterferenceIntents(d);validateAssembly(d);const a=d.assembly;if(!a)return;
 if(d.modelPresentation?.activeExplosionId)throw Error("Disable exploded presentation before assembly edits.");
 const joints=Object.values(a.joints),ids=new Set([...a.grounded,...joints.flatMap(j=>[j.parentId,j.childId])]);
 for(const id of ids){part(d,id);const f=Object.values(d.features).find(f=>f.output===id)!;if(f.inputs.some(i=>ids.has(i)))throw Error("Joint parts must not depend geometrically on other joint parts.");}
 if(before&&!allowJointEdit)for(const id of ids){if(before.objects[id]&&(a.grounded.includes(id)||joints.some(j=>j.childId===id))&&changed(part(d,id),part(before,id)))throw Error("Grounded/dependent part transform is Joint-owned; edit the Joint or unground the root.");}
 const values=resolveJointValues(a),incoming=new Map(joints.map(j=>[j.childId,j])),cache=new Map<string,Matrix4>();
 const world=(id:string):Matrix4=>{const c=cache.get(id);if(c)return c;const j=incoming.get(id);let m=assemblyMatrix(part(d,id));if(j){m=world(j.parentId).clone().multiply(jointMotion(j,values.get(j.id))).multiply(assemblyMatrix(j.rest));}cache.set(id,m);return m;};
 const updates=joints.map(j=>({id:j.childId,t:transform(world(j.childId))}));
 for(const u of updates)if(changed(part(d,u.id),u.t)&&d.layers[d.objects[u.id].layerId]?.locked)throw Error("Joint motion would move a locked part.");
 for(const u of updates)d.objects[u.id].transform=u.t;
 for(const j of joints)if(j.type==="prismatic")j.offset=values.get(j.id)!;else j.angle=values.get(j.id)!;
}
export function registerAssemblyCommands(bus:CommandBus,d:CadDocument){
 bus.registerHandler("assembly-part-place",c=>{if(c.type!=="assembly-part-place")return;const report=placeAssemblyPart(d,c);d.revision++;return {assemblyPlacement:report};});
 bus.registerHandler("assembly-pair-intent",c=>{if(c.type!=="assembly-pair-intent")return;const pair=[...c.pair].sort() as [string,string];if(pair.some(id=>!Object.hasOwn(d.objects,id)))throw Error("Part not found.");const key=interferencePairKey(pair);
  if(c.intent===null){if(d.interferenceIntents)delete d.interferenceIntents[key];if(!Object.keys(d.interferenceIntents??{}).length)delete d.interferenceIntents;}
  else{d.interferenceIntents??={};d.interferenceIntents[key]={pair,intent:c.intent,note:c.note};}validateInterferenceIntents(d);d.revision++;
 });

 const owned=(id:string)=>{const j=d.assembly?.joints[id];if(!j)throw Error("Joint not found.");assertAssemblyPose(d);for(const partId of [j.parentId,j.childId])if(d.layers[d.objects[partId].layerId]?.locked)throw Error("Part locked.");return j;};
 const rebind=(j:AssemblyJoint)=>{j.rest=transform(jointMotion(j,resolveJointValues(d.assembly!).get(j.id)).invert().multiply(assemblyMatrix(part(d,j.parentId)).invert()).multiply(assemblyMatrix(part(d,j.childId))));};
 bus.registerHandler("assembly-joint-delete",c=>{if(c.type!=="assembly-joint-delete")return;owned(c.jointId);delete d.assembly!.joints[c.jointId];evaluateAssembly(d,undefined,true);d.revision++;});
 bus.registerHandler("assembly-joint-reparent",c=>{if(c.type!=="assembly-joint-reparent")return;const j=owned(c.jointId);part(d,c.parentId);if(d.layers[d.objects[c.parentId].layerId]?.locked)throw Error("New parent locked.");j.parentId=c.parentId;validateAssembly(d);if(c.preserveWorld)rebind(j);evaluateAssembly(d,undefined,true);d.revision++;});
 bus.registerHandler("assembly-joint-edit",c=>{if(c.type!=="assembly-joint-edit")return;const j=owned(c.jointId);if(!validJointEdit(c.edit))throw Error("Invalid Joint edit.");for(const k of ["origin","axis","min","max","coupling"] as const){const v=c.edit[k];if(v===undefined)continue;if(v===null)delete (j as any)[k];else (j as any)[k]=structuredClone(v);}validateAssembly(d);
  if(c.preserveWorld){const values=resolveJointValues(d.assembly!);for(const edge of Object.values(d.assembly!.joints))if(edge===j||jointValue(edge)!==values.get(edge.id)){if([edge.parentId,edge.childId].some(id=>d.layers[d.objects[id].layerId]?.locked))throw Error("Coupling edit would recapture a locked Joint Rest.");rebind(edge);}}
  evaluateAssembly(d,undefined,true);d.revision++;});

 const get=()=>d.assembly??={version:1,grounded:[],joints:{}};
 bus.registerHandler("assembly-ground",c=>{if(c.type!=="assembly-ground")return;part(d,c.objectId);if(d.layers[d.objects[c.objectId].layerId]?.locked)throw Error("Part locked.");const a=get();a.grounded=a.grounded.filter(id=>id!==c.objectId);if(c.grounded)a.grounded.push(c.objectId);validateAssembly(d);d.revision++;});
 bus.registerHandler("assembly-joint-create",c=>{if(c.type!=="assembly-joint-create")return;const a=get(),j=c.joint;if(!validJointInput(j)||a.joints[j.id])throw Error("Invalid/duplicate Joint.");for(const id of [j.parentId,j.childId]){part(d,id);if(d.layers[d.objects[id].layerId]?.locked)throw Error("Part locked.");}
 const rest=transform(assemblyMatrix(part(d,j.parentId)).invert().multiply(assemblyMatrix(part(d,j.childId))));a.joints[j.id]={...structuredClone(j),angle:j.angle??0,rest};evaluateAssembly(d,undefined,true);d.revision++;});
 bus.registerHandler("assembly-joint-update",c=>{if(c.type!=="assembly-joint-update")return;const a=get(),j=a.joints[c.jointId];if(!j)throw Error("Joint not found.");if(j.type==="fixed"||j.coupling)throw Error("Select an independent movable Joint driver.");if([j.parentId,j.childId].some(id=>d.layers[d.objects[id].layerId]?.locked))throw Error("Part locked.");if(j.type==="prismatic"){if(c.offset===undefined||c.angle!==undefined)throw Error("Prismatic Joint requires offset.");j.offset=c.offset;}else{if(c.angle===undefined||c.offset!==undefined)throw Error("Revolute Joint requires angle.");j.angle=c.angle;}evaluateAssembly(d,undefined,true);d.revision++;});
}

/** Reject inconsistent persisted poses instead of silently reconnecting or repairing constraints. */
export function assertAssemblyPose(d:CadDocument){if(!d.assembly)return;const copy=structuredClone(d);evaluateAssembly(copy);for(const j of Object.values(d.assembly.joints))if(changed(part(d,j.childId),part(copy,j.childId)))throw Error("Stored assembly pose does not satisfy absolute Joint state.");}

export type AssemblyPlacementInput={objectId:string;targetWorldPose:CadObjectTransform;descendantPolicy:'move-subtree'|'preserve-descendant-world'};
/** Existing absolute tree evaluator, with a newly captured rest pose; no solver. */
export function placeAssemblyPart(d:CadDocument,c:AssemblyPlacementInput){
 if(!validRigidWorldPose(c.targetWorldPose)||!['move-subtree','preserve-descendant-world'].includes(c.descendantPolicy))throw Error('Invalid rigid World Pose or explicit descendant policy.');
 assertAssemblyPose(d);const a=d.assembly;if(!a)throw Error('Assembly required.');if(a.grounded.includes(c.objectId))throw Error('Grounded part cannot be placed.');
 const incoming=Object.values(a.joints).find(j=>j.childId===c.objectId);if(!incoming)throw Error('Select a Joint-owned child.');
 const before=structuredClone(d),beforePose=part(d,c.objectId);if(!changed(beforePose,c.targetWorldPose))throw Error('Part placement is unchanged.');
 const descendants=new Set<string>();const visit=(id:string)=>{for(const j of Object.values(a.joints))if(j.parentId===id){descendants.add(j.childId);visit(j.childId);}};visit(c.objectId);
 const recaptured=[incoming,...(c.descendantPolicy==='preserve-descendant-world'?Object.values(a.joints).filter(j=>j.parentId===c.objectId):[])];
 for(const j of recaptured)for(const id of [j.parentId,j.childId])if(d.layers[d.objects[id].layerId]?.locked)throw Error('Placement would edit a locked part or its Joint Rest.');
 const rebind=(j:AssemblyJoint,child:CadObjectTransform)=>{const parent=assemblyMatrix(part(d,j.parentId)),motion=jointMotion(j);j.rest=transform(parent.multiply(motion).invert().multiply(assemblyMatrix(child)));};
 rebind(incoming,c.targetWorldPose);d.objects[c.objectId].transform=structuredClone(c.targetWorldPose);
 for(const j of recaptured.slice(1))rebind(j,part(before,j.childId));
 validateAssembly(d);evaluateAssembly(d,undefined,true);assertAssemblyPose(d);
 const matrix=(doc:CadDocument,id:string)=>assemblyMatrix(part(doc,id)).elements;
 const different=(id:string)=>changed(getObjectTransform(before.objects[id],Object.values(before.features).find(f=>f.output===id)),getObjectTransform(d.objects[id],Object.values(d.features).find(f=>f.output===id)));
 for(const id of Object.keys(before.objects)){
  const intended=id===c.objectId||c.descendantPolicy==='move-subtree'&&descendants.has(id);
  if(!intended&&different(id))throw Error('Placement moved an unspecified part: '+id);
  if(!intended){if(before.objects[id].transform)d.objects[id].transform=structuredClone(before.objects[id].transform);else delete d.objects[id].transform;}
 }
 if(changed(part(d,c.objectId),c.targetWorldPose))throw Error('Target World Pose was not attained.');
 const anchors=Object.values(a.joints).map(j=>{const frame=(doc:CadDocument)=>{const p=assemblyMatrix(part(doc,j.parentId));return {origin:new Vector3(...j.origin).applyMatrix4(p).toArray(),axis:new Vector3(...j.axis).transformDirection(p).toArray()};};const old=frame(before),next=frame(d);return {jointId:j.id,before:old,after:next,changed:[...old.origin,...old.axis].some((v,i)=>Math.abs(v-[...next.origin,...next.axis][i])>1e-7)};});
 const annotations=Object.values(d.interferenceIntents??{}).filter(i=>i.pair.includes(c.objectId)||i.pair.some(id=>descendants.has(id)));
 return {objectId:c.objectId,descendantPolicy:c.descendantPolicy,before:beforePose,target:structuredClone(c.targetWorldPose),after:part(d,c.objectId),matrices:{before:matrix(before,c.objectId),after:matrix(d,c.objectId)},restChanges:recaptured.map(j=>({jointId:j.id,before:before.assembly!.joints[j.id].rest,after:j.rest})),movedDescendants:[...descendants].filter(different),preservedDescendants:[...descendants].filter(id=>!different(id)),anchors,annotations,requiresIntentReview:anchors.some(a=>a.changed)||annotations.length>0,preservation:{geometry:JSON.stringify(before.features)===JSON.stringify(d.features),relationsAndAngles:Object.values(a.joints).every(j=>{const {rest:_,...x}=j,{rest:__,...y}=before.assembly!.joints[j.id];return JSON.stringify(x)===JSON.stringify(y);}),nonTargetPoses:true},warning:'Rest recapture does not certify structural attachment, fastening, clearance or physical feasibility. Existing design intent requires review.'};
}
export function inspectAssemblyPlacement(d:CadDocument,c:AssemblyPlacementInput){return placeAssemblyPart(structuredClone(d),c);}
