import {SCULPT_BUDGET,SCULPT_BRUSHES,validSculptStroke,validRemeshOptions,type SculptStroke,type RemeshOptions,type sculptMesh} from "@agent-webcad/cad-document";
import type {CadCommand} from "@agent-webcad/cad-commands";
import {validateCommand} from "@agent-webcad/cad-commands";
import {documentMesh} from "../state/meshCommands";
import {sculptSourceSignature} from "../state/sculptCommands";
import {documentVersion} from "../state/documentSession";
import {geometryEvaluationClient} from "../cad/geometryEvaluationClient";
import type {CadToolCall} from "./cadToolContract";
import type {CadModelingContext} from "./cadModelingTools";
import type {CopilotPlan} from "./copilotPlan";
const previews=new Map<string,{objectId:string;stroke:SculptStroke;version:string;signature:string;expires:number}>();
const version=(c:CadModelingContext)=>JSON.stringify(documentVersion(c.document));
const own=(name:string)=>name.startsWith("sculpt.")||["mesh.remesh","mesh.remesh.inspect","mesh.bake"].includes(name);
export function planSculptTools(calls:CadToolCall[],context:CadModelingContext):CopilotPlan|undefined{
 if(!calls.some(c=>own(c.name)))return;if(calls.length!==1)throw Error("Review one sculpt/remesh operation per proposal.");const call=calls[0],a=call.arguments,id=String(a.objectId),o=context.document.objects[id],layer=o&&context.document.layers[o.layerId];if(!context.selectionIds.includes(id)||!o?.visible||!layer?.visible||layer.locked)throw Error("Select the visible unlocked source object before sculpting, baking or remeshing.");let command:CadCommand;
 if(call.name==="mesh.bake")command={type:"bake-mesh",objectId:id,id:(a.id as string|undefined)??`mesh-${crypto.randomUUID()}`};
 else if(call.name==="mesh.remesh"){const options=JSON.parse(String(a.optionsJson));if(!validRemeshOptions(options))throw Error("Invalid remesh options.");command={type:"remesh-mesh",objectId:id,id:(a.id as string|undefined)??`mesh-${crypto.randomUUID()}`,options};}
 else if(call.name==="sculpt.stroke"){const stroke=JSON.parse(String(a.strokeJson));if(!validSculptStroke(stroke))throw Error("Invalid sculpt stroke.");command={type:"sculpt-stroke",objectId:id,stroke};}
 else if(call.name==="sculpt.apply"){const p=previews.get(String(a.previewId));if(!p||p.expires<Date.now()||p.objectId!==id||p.version!==version(context)||p.signature!==sculptSourceSignature(context.document,id))throw Error("Sculpt preview expired or source changed; preview again.");command={type:"sculpt-stroke",objectId:id,stroke:structuredClone(p.stroke)};}
 else throw Error("Read-only sculpt tool cannot produce a command.");
 if(!validateCommand(command))throw Error("Invalid sculpt command.");return {command,ghosts:[],resultObjectIds:["id" in command&&command.id?command.id:id],summary:["검증된 기하 엔진과 CommandBus에서 실행합니다.","Sculpt는 한 번의 Undo, Remesh/Bake는 원본을 남기는 별도 객체입니다. Native Review의 Apply로 확정합니다."],toolSteps:[call.name]};
}
export async function readSculptTools(context:CadModelingContext,call:CadToolCall,signal?:AbortSignal){
 const id=String(call.arguments.objectId),mesh=documentMesh(context.document,id);if(!mesh)throw Error("Editable mesh required; explicitly Bake Geometry Nodes output first.");
 if(call.name==="sculpt.inspect")return {objectId:id,editable:!mesh.modifiers?.some(m=>m.enabled&&m.level>0),vertices:mesh.vertices.length,faces:mesh.faces.length,brushes:SCULPT_BRUSHES,coordinates:"object-local mm; ray origin/direction; X symmetry about local origin",limits:{...SCULPT_BUDGET,radius:[.0001,1e6],strength:[-1,1],spacing:[.02,1]},derivation:mesh.derivation,sourceChanged:mesh.derivation?sculptSourceSignature(context.document,mesh.derivation.sourceObjectId)!==mesh.derivation.sourceSignature:undefined};
 if(call.name==="mesh.remesh.inspect")return {objectId:id,derivation:mesh.derivation??null,sourcePresent:mesh.derivation?!!context.document.objects[mesh.derivation.sourceObjectId]:null,distancePolicy:"Bidirectional sampled vertices and triangle centroids, <=512 per direction. Not certified Hausdorff distance.",referencePolicy:"New result element IDs; source references resolve to deleted in result provenance. Original source objects remain unchanged."};
 const stroke=JSON.parse(String(call.arguments.strokeJson));if(!validSculptStroke(stroke))throw Error("Invalid sculpt stroke.");const capturedVersion=version(context),capturedSignature=sculptSourceSignature(context.document,id),isCurrent=()=>capturedVersion===version(context)&&capturedSignature===sculptSourceSignature(context.document,id);const result=await geometryEvaluationClient.evaluate({kind:"sculpt",mesh,stroke},{signal,isCurrent}) as ReturnType<typeof sculptMesh>;signal?.throwIfAborted();if(!isCurrent())throw Error("Sculpt preview source changed during evaluation; preview again.");
 for(const [id,p] of previews)if(p.expires<Date.now())previews.delete(id);if(previews.size>=16)previews.delete(previews.keys().next().value!);const previewId=crypto.randomUUID();previews.set(previewId,{objectId:id,stroke,signature:capturedSignature!,version:capturedVersion,expires:Date.now()+120000});
 return {previewId,objectId:id,changedVertices:result.changedVertexIds.length,samples:result.samples,elapsedMs:result.elapsedMs,expiresInSeconds:120,policy:"sculpt.apply prepares the same native reviewed transaction. Only editor Apply publishes it."};
}
