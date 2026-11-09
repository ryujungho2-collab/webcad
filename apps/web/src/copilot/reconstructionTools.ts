import {DEFAULT_RECONSTRUCTION,validReconstructionOptions,type ReconstructionOptions} from "@agent-webcad/cad-document";
import {validateCommand,type CadCommand} from "@agent-webcad/cad-commands";
import {reconstructionSource,evaluateReconstruction,reconstructionSnapshotStatus} from "../state/reconstructionCommands";
import {hybridSource} from "../state/hybridReferences";
import type {CadToolCall} from "./cadToolContract";
import type {CadModelingContext} from "./cadModelingTools";
import type {CopilotPlan} from "./copilotPlan";
export function reconstructionToolOptions(a:Record<string,unknown>):ReconstructionOptions{const options={absoluteTolerance:Number(a.absoluteTolerance??DEFAULT_RECONSTRUCTION.absoluteTolerance),relativeTolerance:Number(a.relativeTolerance??DEFAULT_RECONSTRUCTION.relativeTolerance),angleDegrees:Number(a.angleDegrees??DEFAULT_RECONSTRUCTION.angleDegrees)};if(!validReconstructionOptions(options))throw Error("Invalid reconstruction tolerances.");return options;}
export async function readReconstructionTools(context:CadModelingContext,call:CadToolCall,signal?:AbortSignal){
 const id=String(call.arguments.objectId),doc=context.document;
 if(call.name==="reconstruction.result"){const f=Object.values(doc.features).find(f=>f.output===id);if(f?.params.kind!=="planar-reconstruction")throw Error("Select a reconstructed planar BRep.");const receipt=f.params.reconstructionReceipt as {sourceObjectId:string;sourceFingerprint:string};const status=reconstructionSnapshotStatus(doc,id);return {objectId:id,representation:"brep",ownership:"independent snapshot; no automatic source regeneration",...status,report:receipt};}
 const options=reconstructionToolOptions(call.arguments);
 if(call.name==="reconstruction.preview"){const result=await evaluateReconstruction(doc,id,options,{signal});return {objectId:id,report:result.report,policy:"Read-only evaluation. Use reconstruction.create to propose the same validated transaction, then native Apply."};}
 const a=reconstructionSource(doc,id,options).analysis;return {...a,definition:{...a.definition,regions:a.definition.regions.map(r=>({...r,loops:r.loops.map(loop=>({vertices:loop.length}))}))},policy:"Candidate analysis only. Solid validity requires kernel reconstruction/quality validation."};
}
export function planReconstructionTools(calls:CadToolCall[],context:CadModelingContext):CopilotPlan|undefined{
 if(!calls.some(c=>c.name.startsWith("reconstruction.")))return;if(calls.length!==1||calls[0].name!=="reconstruction.create")throw Error("Review one reconstruction operation per proposal.");
 const call=calls[0],id=String(call.arguments.objectId),object=context.document.objects[id],layer=object&&context.document.layers[object.layerId];if(!context.selectionIds.includes(id)||!object?.visible||!layer?.visible||layer.locked)throw Error("Select the visible unlocked source Mesh first.");
 const command:CadCommand={type:"reconstruct-planar-mesh",objectId:id,id:(call.arguments.id as string|undefined)??`reconstructed-${crypto.randomUUID()}`,options:reconstructionToolOptions(call.arguments)};if(!validateCommand(command))throw Error("Invalid reconstruction command.");
 return {command,ghosts:[],resultObjectIds:[command.id!],summary:["Preserve source Mesh; create independent merged planar BRep only after kernel and sampled-error validation.","Open/multi-component inputs refused. Native Review/Apply required; sampling is not certified Hausdorff distance."],toolSteps:[call.name]};
}
