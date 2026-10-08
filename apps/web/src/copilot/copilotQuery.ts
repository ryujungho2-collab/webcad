import type { GeometryMeasurement } from "@agent-webcad/cad-document";
import { queryCadDocument } from "../state/documentQuery";
import { sameDocumentVersion, type DocumentVersion } from "../state/documentSession";
import type { DependencyNode, DependencyEdge } from "../state/dependencyGraph";

export const COPILOT_QUERY_LIMITS = { objects: 50, relations: 20, solveGroups: 10, text: 200, bytes: 65536, timeoutMs: 30000 } as const;
type QueryReader = typeof queryCadDocument;
export type CopilotQueryRelation = { id: string; name: string; kind: DependencyNode["kind"]; relation?: DependencyEdge["relation"]; missing: boolean; operation?: string };
export type CopilotQueryObject = {
  id: string; name: string; type?: string; representation?: string;
  layer?: { id: string; name: string; locked: boolean; visible: boolean };
  editable: boolean; editabilityReasons: string[]; sketchId?: string;
  measurement?: GeometryMeasurement; measurementNote?: string;
  error?: string; recovery?: string; operation?: string;
  sources: CopilotQueryRelation[]; sourceCount: number;
  affected: CopilotQueryRelation[]; affectedCount: number;
  solveGroups: { sketchId: string; degreesOfFreedom: number; constraintCount: number; residual: number }[]; solveGroupCount: number;
};
export type CopilotQueryResult = { version: DocumentVersion; units: { length: "mm"; area: "mm²"; volume: "mm³"; sketchAngle: "rad"; rotation: "deg" }; objects: CopilotQueryObject[]; byteLength: number; labelsShortened: boolean };
export type CopilotQueryContext = { version: DocumentVersion; selectionIds: string[] };
export function copilotQueryContextChange(saved: CopilotQueryContext, current: CopilotQueryContext) {
  if (!sameDocumentVersion(saved.version) || saved.version.documentId!==current.version.documentId || saved.version.revision!==current.version.revision || saved.version.generation!==current.version.generation) return "The document changed. Read selection again.";
  if (saved.selectionIds.length !== current.selectionIds.length || saved.selectionIds.some((id,i)=>id!==current.selectionIds[i])) return "The selection changed. Read selection again.";
}

/** Local, bounded read DTO. No feature params, raster bytes or full graph escape. */
export async function readCopilotSelection(ids: string[], options: { signal?: AbortSignal; timeoutMs?: number; reader?: QueryReader } = {}): Promise<CopilotQueryResult> {
  const selected=[...new Set(ids)];
  if (!selected.length) throw new Error("Select an object in the canvas or Model tree, then Read selection.");
  if (selected.length>COPILOT_QUERY_LIMITS.objects) throw new Error("Select at most 50 objects to read. Split the selection into smaller groups.");
  if (selected.some(id=>!id || id.length>200)) throw new Error("A selected object identity is invalid or too long. Select another object to read.");
  const timeout=options.timeoutMs??COPILOT_QUERY_LIMITS.timeoutMs;
  if (!Number.isFinite(timeout)||timeout<1||timeout>COPILOT_QUERY_LIMITS.timeoutMs) throw new Error("Query deadline must be between 1 and 30000 ms.");
  options.signal?.throwIfAborted();
  const controller=new AbortController(), abort=()=>controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error("Reading timed out. Select fewer objects and Read selection again.")),timeout);
  let onAbort!:()=>void;
  const cancelled=new Promise<never>((_,reject)=>{onAbort=()=>reject(controller.signal.reason);controller.signal.addEventListener("abort",onAbort,{once:true});});
  try {
    const query=await Promise.race([(options.reader??queryCadDocument)(selected,{signal:controller.signal,maxObjects:COPILOT_QUERY_LIMITS.objects}),cancelled]);
    controller.signal.throwIfAborted();
    if(query.stale||!sameDocumentVersion(query.version))throw new Error("The document changed. Read selection again.");
    let labelsShortened=false;
    const text=(value:string)=>{if(value.length>COPILOT_QUERY_LIMITS.text)labelsShortened=true;return value.slice(0,COPILOT_QUERY_LIMITS.text);};
    const relation=(node:DependencyNode,kind?:DependencyEdge["relation"]):CopilotQueryRelation=>({id:node.sourceId,name:text(node.label),kind:node.kind,relation:kind,missing:!!node.missing,operation:node.operation?text(node.operation):undefined});
    const objects:CopilotQueryObject[]=query.objects.map(row=>{
      if(!row.feature)return {id:row.id,name:"Missing object",editable:false,error:row.error??"Object does not exist.",recovery:"Select an existing object in Model tree and Read selection again.",editabilityReasons:["Object is missing."],sources:[],sourceCount:0,affected:[],affectedCount:0,solveGroups:[],solveGroupCount:0};
      const dependencies=row.dependencies!,affected=dependencies.affected.filter(node=>node.kind==="object"),groups=dependencies.solveGroups;
      const missing=dependencies.immediate.some(entry=>entry.source.missing);
      const error=row.error??(missing?"A required source reference is missing.":undefined);
      return {id:row.id,name:text(row.name!),type:row.feature.type,representation:row.contract?.representation,layer:row.layer?{...row.layer,name:text(row.layer.name)}:undefined,
        editable:!!row.editable,editabilityReasons:row.editabilityReasons?.map(text)??[],sketchId:typeof row.feature.params.sketchId==="string"?row.feature.params.sketchId:undefined,
        measurement:row.measurement?structuredClone(row.measurement):undefined,measurementNote:!row.contract?.supportsExactMeasurement?"This object has no exact geometric measurement.":row.measurement&&row.measurement.length===undefined&&row.measurement.area===undefined&&row.measurement.volume===undefined?"No finite extent is reported for this geometry.":undefined,
        error:error?text(error):undefined,recovery:error?(missing?"Inspect the missing source and reconnect it in the owning tool, then Read selection again.":"Inspect the source geometry and transform, correct the reported problem, then Read selection again."):undefined,
        operation:dependencies.object?.operation?text(dependencies.object.operation):undefined,
        sources:dependencies.immediate.slice(0,COPILOT_QUERY_LIMITS.relations).map(entry=>relation(entry.source,entry.relation)),sourceCount:dependencies.immediate.length,
        affected:affected.slice(0,COPILOT_QUERY_LIMITS.relations).map(node=>relation(node)),affectedCount:affected.length,
        solveGroups:groups.slice(0,COPILOT_QUERY_LIMITS.solveGroups).map(group=>({sketchId:group.sketchId,degreesOfFreedom:group.degreesOfFreedom,constraintCount:group.constraints.length,residual:group.residual})),solveGroupCount:groups.length};
    });
    const result:CopilotQueryResult={version:query.version,units:{length:query.units.lengthUnit,area:"mm²",volume:"mm³",sketchAngle:query.units.sketchAngleUnit,rotation:query.units.objectRotationUnit},objects,labelsShortened,byteLength:0};
    let size=new TextEncoder().encode(JSON.stringify(result)).byteLength;
    while(result.byteLength!==size){result.byteLength=size;size=new TextEncoder().encode(JSON.stringify(result)).byteLength;}
    if(result.byteLength>COPILOT_QUERY_LIMITS.bytes)throw new Error("Read selection exceeds 64 KiB. Select fewer objects and Read selection again.");
    return result;
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort",abort); controller.signal.removeEventListener("abort",onAbort); }
}
