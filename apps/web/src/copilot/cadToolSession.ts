import {externalSceneSummary} from "@agent-webcad/cad-document";
import {inspectCoordination,type CoordinationRequest} from './coordinationReview';
import {readReconstructionTools} from "./reconstructionTools";
import {inspectAssemblyMotion} from "../state/assemblyMotion";
import {readAssembly} from "./assemblyTools";
import {readHybridTools} from "./hybridTools";
import {readSculptTools} from "./sculptTools";
import {readGeometryNodes} from "./geometryNodeTools";
import {resolveTopologyReference,type TopologyDomain} from "@agent-webcad/cad-document";
import {documentMesh} from "../state/meshCommands";
import {checkWallPath} from "./architecturePath";
import {inspectMesh,inspectMeshEvaluation} from "./meshTools";
import {readArchitecture} from "./architectureTools";
import { featureContract, type CadDocument } from "@agent-webcad/cad-document";
import { measureDocumentObject } from "../state/documentQuery";
import { documentVersion } from "../state/documentSession";
import { resolveFaceWorkPlane } from "../state/attachedWorkPlane";
import { sourceMesh } from "../state/faceCutCommands";
import { CAD_TOOLS, CAD_TOOL_LIMITS, cadToolCatalog, cadToolIndex, validateCadToolCalls, type CadToolCall } from "./cadToolContract";
import { planCadModelingTools, cadModelReferenceIssue, type CadModelingContext } from "./cadModelingTools";
import { copilotSolidContract } from "./copilotSolid";
import { enumerateSolidTopology } from "../cad/kernelGeometryService";
import { getObjectTransform } from "../precision/objectTransform";
import {getWorldDrawingGeometry} from "../precision/worldGeometry";
import {inspectFittedCurve} from "./fittedCurveTools";
import { Matrix4, Vector3, Quaternion, Euler, MathUtils } from "three";

export type CadToolReadResult = { id: string; name: string; ok: boolean; version: ReturnType<typeof documentVersion>; result?: unknown; error?: string };
export type CadToolSession = ReturnType<typeof createCadToolSession>;
/** No writable document or full feature/raster payload crosses the tool boundary. */
export function createCadToolSession(context: CadModelingContext, options: { isCurrent?: () => boolean } = {}) {
  const version = documentVersion(context.document), source = context.document;
  const sceneSummaries=Object.fromEntries(Object.values(source.externalSceneAssets??{}).map(a=>[a.id,externalSceneSummary(a)]));
  const snapshot = structuredClone({ ...source, rasterAssets: undefined, externalSceneAssets:undefined });
  const captured = { ...context, document: snapshot, selectionIds: [...context.selectionIds] };
  const features = new Map(Object.values(snapshot.features).map(f => [f.output, f]));
  const assertCurrent = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const current = documentVersion(source);
    if (current.documentId !== version.documentId || current.revision !== version.revision || current.generation !== version.generation || options.isCurrent && !options.isCurrent()) throw new Error("The CAD context changed. Plan again before using tool results.");
  };
  const find = (id: string) => { const object = snapshot.objects[id], feature = features.get(id); if (!object || !feature) throw new Error(`Object ${id} does not exist.`); return { object, feature, layer: snapshot.layers[object.layerId] }; };
  async function read(value: unknown, signal?: AbortSignal): Promise<CadToolReadResult> {
    const call = validateCadToolCalls([value])[0];
    if (!CAD_TOOLS[call.name].readOnly) throw new Error("Modeling tools require a reviewed proposal.");
    assertCurrent(signal);
    let result: unknown;
    try {
      if(call.name.startsWith("reconstruction."))result=await readReconstructionTools(captured,call,signal);
      if(call.name==="assembly.motion.inspect")result=await inspectAssemblyMotion(snapshot,JSON.parse(String(call.arguments.optionsJson)),{signal,isCurrent:()=>{try{assertCurrent();return true;}catch{return false;}}});
      else if(call.name.startsWith("assembly."))result=readAssembly(captured,call);
      if(call.name.startsWith("hybrid."))result=readHybridTools(captured,call);
      if(call.name.startsWith("sculpt.")||call.name==="mesh.remesh.inspect")result=await readSculptTools(captured,call,signal);
      if(call.name.startsWith("nodes."))result=await readGeometryNodes(captured,call,signal);
      if(call.name==="mesh.provenance"){const mesh=documentMesh(snapshot,String(call.arguments.objectId));if(!mesh)throw Error("Editable mesh required.");result=resolveTopologyReference(mesh,call.arguments.domain as TopologyDomain,String(call.arguments.elementId),Number(call.arguments.fromRevision??0));}
      if(call.name==="mesh.evaluation")result=inspectMeshEvaluation(snapshot,call.arguments.objectId as string,call.arguments.mode as import("@agent-webcad/cad-document").MeshSelectionMode,call.arguments.offset as number|undefined,call.arguments.limit as number|undefined);
      if(call.name==="mesh.inspect")result=inspectMesh(snapshot,call.arguments.objectId as string,call.arguments.mode as import("@agent-webcad/cad-document").MeshSelectionMode,call.arguments.offset as number|undefined,call.arguments.limit as number|undefined);
      if(call.name==="cad.pathClearance")result=checkWallPath(snapshot,call.arguments as unknown as import("./architecturePath").WallPathInput);
      if(call.name==="cad.coordinationReview")result=await inspectCoordination(snapshot,call.arguments as unknown as CoordinationRequest,{signal,assertCurrent:()=>assertCurrent(signal)});
      if(call.name==="cad.architecture")result=readArchitecture(snapshot,call.arguments.objectIds as string[]);
      if (call.name === "cad.tools") {
        const names = call.arguments.names as string[] | undefined, unknown = names?.filter(name => !Object.hasOwn(CAD_TOOLS, name)) ?? [];
        if (unknown.length) throw new Error(`Unknown CAD tool names: ${unknown.join(", ")}. Call cad.tools without names for the index.`);
        result = names ? cadToolCatalog(names) : cadToolIndex();
      }
      if (call.name === "cad.parameters") result = copilotSolidContract(snapshot,captured.selectionIds);
      if (call.name === "cad.curve") result = inspectFittedCurve(snapshot,call.arguments.objectId as string);
      if (call.name === "cad.objects") {
        const search = String(call.arguments.search ?? "").toLowerCase(), limit = Math.floor(Number(call.arguments.limit ?? 20));
        const matches = Object.values(snapshot.objects).filter(object => `${object.id} ${object.name}`.toLowerCase().includes(search));
        result = { objects: matches.slice(0, limit).map(object => ({ id: object.id, name: object.name.slice(0, 200), type: features.get(object.id)?.type, selected: captured.selectionIds.includes(object.id), visible: object.visible && snapshot.layers[object.layerId]?.visible === true })), total: matches.length, truncated: matches.length > limit };
      }
      if (call.name === "cad.inspect") result = (call.arguments.objectIds as string[]).map(id => {
        const { object, feature, layer } = find(id), contract = featureContract(feature);
        return { id, externalAsset:feature.type==="external-scene"?sceneSummaries[String(feature.params.assetId)]:undefined, name: object.name.slice(0, 200), type: feature.type, representation: contract.representation, selected: captured.selectionIds.includes(id), visible: object.visible && layer?.visible === true, locked: !layer || layer.locked, referenceIssue:cadModelReferenceIssue(snapshot,id,features), layerId: object.layerId, sketchId: typeof feature.params.sketchId === "string" ? feature.params.sketchId : undefined, sources: feature.inputs.slice(0, 20), sourcesTruncated: feature.inputs.length > 20,
          ...feature.type==="loft"?{loft:{ruled:feature.params.ruled===true,sourceCount:feature.inputs.length,dependencyMode:feature.dependencyMode}}:{},
          parameters: contract.parameters.map(p => ({ name: p.key, quantity: p.quantity, unit: p.unit, value: typeof feature.params[p.key] === "number" ? feature.params[p.key] : undefined })) };
      });
      if (call.name === "cad.measure") {
        result = await Promise.all((call.arguments.objectIds as string[]).map(async id => { const {object,feature}=find(id);const issue=cadModelReferenceIssue(snapshot,id,features);if(issue)throw new Error(issue);const measurement=await measureDocumentObject(snapshot,id,features);if(!measurement.bounds&&feature.type==="drawing"&&![...(feature.params.bulges as number[]??[])].some(v=>v!==0)){const g=getWorldDrawingGeometry(object,feature);if(g&&["line","polyline","rectangle"].includes(g.kind)&&g.points?.length){const min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];for(const p of g.points)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}measurement.bounds={min,max};}}return {id,measurement}; }));
      }
      if (call.name === "cad.faces") {
        const id = call.arguments.objectId as string, { object, feature } = find(id);
        if (featureContract(feature).representation !== "brep") throw new Error("Face queries require a BRep solid.");
        const issue=cadModelReferenceIssue(snapshot,id,features);if(issue)throw new Error(issue);
        const mesh = await sourceMesh(feature), keys = [...new Set((mesh.faces ?? []).map(face => face.key))];
        const placement=getObjectTransform(object,feature),rotation=new Quaternion().setFromEuler(new Euler(...placement.rotation.map(MathUtils.degToRad) as [number,number,number],"XYZ"));
        const matrix=new Matrix4().compose(new Vector3(...placement.translation),rotation,new Vector3(...placement.scale));
        const faces = [];
        for (const key of keys.slice(0, 64)) {
          assertCurrent(signal);
          const resolution = await resolveFaceWorkPlane(snapshot, { kind: "brep-face", objectId: id, topologyId: key });
          const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
          for(const face of mesh.faces??[])if(face.key===key)for(let t=face.start;t<face.start+face.count;t++)for(let corner=0;corner<3;corner++){
            const index=mesh.indices[t*3+corner]*3,p=new Vector3(mesh.positions[index],mesh.positions[index+1],mesh.positions[index+2]).applyMatrix4(matrix).toArray();
            for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],p[axis]);max[axis]=Math.max(max[axis],p[axis]);}
          }
          faces.push({ key, status: resolution.status, ...(min.every(Number.isFinite)?{meshBounds:{min,max}}:{}), ...resolution.status === "resolved" ? { frame: resolution.frame } : { reason: resolution.reason } });
        }
        result = { objectId: id, faces, total: keys.length, truncated: keys.length > 64, coordinates: "world frames; hole center in face-local mm",boundsBasis:"world XYZ tessellation vertices; meshBounds aid face selection, not exact bounds or face containment" };
      }
      if (call.name === "cad.edges") {
        const id = call.arguments.objectId as string, { object, feature } = find(id);
        if (featureContract(feature).representation !== "brep") throw new Error("Edge queries require a BRep solid.");
        const issue = cadModelReferenceIssue(snapshot, id, features); if (issue) throw new Error(issue);
        const topology = await enumerateSolidTopology(feature.params, { signal });
        const placement = getObjectTransform(object, feature);
        const rotation = new Quaternion().setFromEuler(new Euler(...placement.rotation.map(MathUtils.degToRad) as [number,number,number], "XYZ"));
        const matrix = new Matrix4().compose(new Vector3(...placement.translation), rotation, new Vector3(...placement.scale));
        const edges = [...new Map(topology.edges.map(edge => [edge.key, edge])).values()];
        result = { objectId: id, edges: edges.slice(0,64).map(edge => ({ key:edge.key, points:edge.points.map(point => new Vector3(...point).applyMatrix4(matrix).toArray()) })), total:edges.length, truncated:edges.length>64, coordinates:"world XYZ mm; representative samples, not exact lengths" };
      }
      assertCurrent(signal);
      const response: CadToolReadResult = { id: call.id, name: call.name, ok: true, version, result };
      if (new TextEncoder().encode(JSON.stringify(response)).byteLength > CAD_TOOL_LIMITS.bytes) throw new Error("CAD query result exceeds 64 KiB. Request fewer objects.");
      return structuredClone(response);
    } catch (error) {
      assertCurrent(signal);
      return { id: call.id, name: call.name, ok: false, version: { ...version }, error: (error instanceof Error ? error.message : String(error)).slice(0, 1000) };
    }
  }
  return {
    version: { ...version },
    read,
    async plan(calls: CadToolCall[] | unknown, signal?: AbortSignal) { assertCurrent(signal); const plan = await planCadModelingTools(calls, captured, signal); assertCurrent(signal); return plan; },
    assertCurrent,
  };
}
