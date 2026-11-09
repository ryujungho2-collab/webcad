import type {CadDocument} from "@agent-webcad/cad-document";
import type {CopilotPlan} from "./copilotPlan";
import type {CadToolReadResult} from "./cadToolSession";
import {validateCopilotEdit} from "./copilotEdit";
import {taskToolScope,positionOnlyRequest} from "./copilotTaskScope";
import {previewCadCommand,discardCadPlan,getCadPlanFrameDocument} from "../state/documentPlans";
import {documentVersion} from "../state/documentSession";
import {inspectAssemblyMotion,type MotionReport} from "../state/assemblyMotion";
/** Existing native Preview + design-specific comparisons. Never publishes a document. */
export async function validateAgentProposal(plan:CopilotPlan,source:CadDocument,selection:string[],plane:string,prompt:string,evidence:CadToolReadResult[],signal:AbortSignal){
 if(positionOnlyRequest(prompt)&&["update-primitive","update-extrude","set-variable"].includes(plan.command.type))throw Error("CONSTRAINT: position-only request preserves dimensions. Scalar dimension edits conflict with the requested preservation. Joint-owned translation/rest-frame edits are not supported by this task scope.");
 validateCopilotEdit(plan.command,source,selection,plane);
 const p=await previewCadCommand(plan.command,{signal});
 try{
  if(!p.result.ok||p.stale)throw Error(p.result.reason??"Native Preview is stale.");
  if(taskToolScope(prompt,{targetId:selection.length===1?selection[0]:undefined}).kind==="interference"){
   const d=getCadPlanFrameDocument(p.planId)!;
   if(JSON.stringify(d.assembly)!==JSON.stringify(source.assembly)||JSON.stringify(d.interferenceIntents)!==JSON.stringify(source.interferenceIntents))throw Error("CONSTRAINT: preserve original Joints, axis and intent annotations.");
   const allowed=new Set(selection),changed=Object.values(d.features).some(f=>!allowed.has(f.output)&&JSON.stringify(f)!==JSON.stringify(source.features[f.id]))||Object.keys(source.objects).length!==Object.keys(d.objects).length||Object.keys(d.objects).some(id=>!allowed.has(id)&&JSON.stringify(d.objects[id])!==JSON.stringify(source.objects[id]));
   if(changed)throw Error("CONSTRAINT: proposal changed a non-target part.");
   const baseline=evidence.find(e=>e.ok&&e.name==="assembly.motion.inspect")?.result as MotionReport|undefined;
   if(baseline&&JSON.stringify(baseline.version)!==JSON.stringify(documentVersion(source)))throw Error("CONSTRAINT: stale baseline evidence.");
   const annotation=Object.values(source.interferenceIntents??{}).find(a=>a.pair.some(id=>allowed.has(id)));
   const pair=annotation?.pair??baseline?.request.partIds;
   if(!baseline||!pair||pair.length!==2)throw Error("CONSTRAINT: unambiguous target pair and baseline motion evidence required.");
   const rows=baseline.rows.filter(r=>pair.every(id=>r.pair.includes(id)));
   if(!baseline.samplingFinished||rows.length!==baseline.angles.length||rows.some(r=>!["penetration","contact","no-penetration"].includes(r.baseStatus)))throw Error("CONSTRAINT: baseline inspection incomplete/unknown.");
   if(![0,90,180].every(angle=>baseline.angles.includes(angle)))throw Error("CONSTRAINT: require0/90/180 baseline samples.");
   const next=await inspectAssemblyMotion(d,{...baseline.request,partIds:[...pair],exceptions:[]},{signal});
   const beforeVolume=Math.max(...rows.map(r=>r.commonVolume??0)),afterVolume=Math.max(...next.rows.map(r=>r.commonVolume??0)),epsilon=Math.max(...rows.map(r=>r.volumeTolerance??0));
   if(!next.samplingFinished||next.state!=="finished"||next.rows.length!==baseline.angles.length)throw Error("CONSTRAINT: proposed geometry inspection incomplete/unknown.");
   if(!(afterVolume<beforeVolume-epsilon))throw Error("CONSTRAINT: measured Common volume did not decrease.");
   plan.summary.push(`Native Preview only: Common max ${beforeVolume} → ${afterVolume} mm³ over checked angles; original Joints/axis/non-target parts preserved. Existing ${annotation?.intent??"no"} annotation retained. Discrete samples only; not structural/load approval.`);
  }
  return p;
 }catch(e){discardCadPlan(p.planId);throw e;}
}
