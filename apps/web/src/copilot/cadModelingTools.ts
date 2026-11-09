import {planReconstructionTools} from "./reconstructionTools";
import {assertHybridFeatureResolved} from "../state/hybridReferences";
import {planAssembly} from "./assemblyTools";
import {planHybridTools} from "./hybridTools";
import {planSculptTools} from "./sculptTools";
import {planGeometryNodeTools} from "./geometryNodeTools";
import {planMeshTools} from "./meshTools";
import type {FitSpace} from "../precision/fittedCurveSpace";
import type {FitContinuity} from "../precision/fitSpline";
import {validSpline} from "@agent-webcad/cad-document";
import {splineClosed} from "../precision/splineGeometry";
import {planArchitectureTools} from "./architectureTools";
import {planSceneTools} from "./sceneTools";
import { featureContract, type CadDocument, type SketchWorkPlane } from "@agent-webcad/cad-document";
import { validateCommand, type CadCommand } from "@agent-webcad/cad-commands";
import { resolveFaceWorkPlane } from "../state/attachedWorkPlane";
import { planeToWorld, WORK_PLANES } from "../precision/workPlane";
import { CAD_TOOLS, validateCadToolCalls, type CadToolCall } from "./cadToolContract";
import type { CopilotGhost, CopilotPlan } from "./copilotPlan";
import { copilotSolidContract, solidParameterPlan } from "./copilotSolid";
import { enumerateSolidTopology } from "../cad/kernelGeometryService";
import { shellFaceStatus } from "../state/shellCommands";
import {fittedPoints,reshapeFittedCurve,inspectFittedCurve} from "./fittedCurveTools";

export type CadModelingContext = { document: CadDocument; selectionIds: string[]; layerId: string; workPlane: SketchWorkPlane };
/** Retained geometry from a failed attachment is reviewable, but is not a current modeling source. */
export function cadModelReferenceIssue(document:CadDocument,id:string,features=new Map(Object.values(document.features).map(f=>[f.output,f])),seen=new Set<string>()):string|undefined{
  try{assertHybridFeatureResolved(document,id);}catch(e){return e instanceof Error?e.message:String(e);}
  if(seen.has(id))return;seen.add(id);
  const feature=features.get(id);if(!document.objects[id]||!feature)return `Source ${id} is missing.`;
  if(feature.params.faceHole&&feature.params.faceHoleStatus!=="resolved")return `Source ${id} has an unresolved hole face. Inspect and rebind its work plane.`;
  if(feature.type==="shell"&&feature.params.referenceStatus!=="resolved")return `Source ${id} has unresolved shell faces.`;
  const sketchId=feature.params.faceSketchId??(feature.params.faceCut as {sketchId?:string}|undefined)?.sketchId;
  if(typeof sketchId==="string"&&document.sketches?.[sketchId]?.faceStatus!=="resolved")return `Source ${id} has an unresolved face sketch.`;
  for(const input of feature.inputs){const issue=cadModelReferenceIssue(document,input,features,seen);if(issue)return issue;}
}
/** Compile tools to canonical commands. Only selected existing sources and outputs from earlier steps are writable inputs. */
export async function planCadModelingTools(value: unknown, context: CadModelingContext, signal?: AbortSignal): Promise<CopilotPlan> {
  const calls = validateCadToolCalls(value), { document, layerId } = context;
  if (calls.some(call => CAD_TOOLS[call.name].readOnly)) throw new Error("Separate read tools from a modeling proposal.");
  const reconstructionPlan=planReconstructionTools(calls,context);if(reconstructionPlan)return reconstructionPlan;
  const assemblyPlan=planAssembly(calls,context);if(assemblyPlan)return assemblyPlan;
  const hybridPlan=planHybridTools(calls,context);if(hybridPlan)return hybridPlan;
  const sculptPlan=planSculptTools(calls,context);if(sculptPlan)return sculptPlan;
  const graphPlan=planGeometryNodeTools(calls,context);if(graphPlan)return graphPlan;
  const meshPlan=planMeshTools(calls,context);if(meshPlan)return meshPlan;
  const scene=calls.filter(c=>c.name==="scene.layer"||c.name==="scene.objects");if(scene.length){const geometry=calls.filter(c=>c.name!=="scene.layer"&&c.name!=="scene.objects");if(calls.some((c,i)=>scene.includes(c)&&calls.slice(i+1).some(next=>geometry.includes(next))))throw Error("Put all scene presentation calls after geometry calls.");return planSceneTools(scene,context,geometry.length?await planCadModelingTools(geometry,context,signal):undefined);}
  const architecture=planArchitectureTools(calls,context);if(architecture)return architecture;
  if(calls.some(c=>c.name==="solid.loft.update")){
    if(calls.length!==1)throw Error("Loft editing must be a standalone proposal.");
    const a=calls[0].arguments,id=a.objectId as string,o=document.objects[id],f=Object.values(document.features).find(f=>f.output===id),layer=o&&document.layers[o.layerId];
    if(context.selectionIds.length!==1||context.selectionIds[0]!==id||!o?.visible||!layer?.visible||layer.locked||f?.type!=="loft"||f.dependencyMode!=="live"||f.pattern||f.construction||f.params.componentContent||!document.rootObjects.includes(id))throw Error("Select exactly one visible unlocked independent live loft. A read is not an edit grant.");
    const issue=cadModelReferenceIssue(document,id);if(issue)throw Error(issue);
    if((f.params.ruled===true)===a.ruled)throw Error("Loft connection is unchanged.");
    return {command:{type:"update-loft",objectId:id,ruled:a.ruled as boolean},ghosts:[],resultObjectIds:[id],summary:[`${o.name}: ${a.ruled?"단면 사이 직선 연결":"부드러운 곡면 연결"}로 변경합니다.`,`${f.inputs.length}개 원본 단면의 순서, 객체 ID, 배치와 마감을 유지합니다. 연관 형상·도면 영향은 실제 미리보기에서 확인하세요.`],toolSteps:[CAD_TOOLS["solid.loft.update"].label]};
  }
  if(calls.some(c=>c.name==="curve.reshape"||c.name==="curve.adjust")){
    if(calls.length!==1)throw Error("A fitted curve reshape must be a standalone proposal.");
    const a=calls[0].arguments;
    if(calls[0].name==="curve.adjust"){
      const curve=inspectFittedCurve(document,a.objectId as string),index=a.pointIndex as number,delta=a.delta as [number,number,number];
      if(!Number.isInteger(index)||index>=curve.points.length||!delta.some(v=>v!==0))throw Error("Choose an existing integer fit-point index and a nonzero delta.");
      const points=curve.points.map((p,i)=>i===index?p.map((v,j)=>v+delta[j]) as [number,number,number]:p);
      return reshapeFittedCurve(document,context.selectionIds,a.objectId as string,points,curve.tension);
    }
    return reshapeFittedCurve(document,context.selectionIds,a.objectId as string,a.points as [number,number,number][],a.tension as number,a.continuity as FitContinuity|undefined,a.space as FitSpace|undefined);
  }
  if(calls.some(call=>call.name==="solid.parameter")){
    if(calls.length!==1)throw new Error("A selected solid parameter edit must be a standalone proposal.");
    const plan=solidParameterPlan(copilotSolidContract(document,context.selectionIds),calls[0].arguments.key as string,calls[0].arguments.value as number);
    return {...plan,toolSteps:[CAD_TOOLS["solid.parameter"].label]};
  }
  const layer = document.layers[layerId];
  if (!layer?.visible || layer.locked) throw new Error("Choose a visible, unlocked output layer.");
  const features = new Map(Object.values(document.features).map(f => [f.output, f]));
  const allowed = new Map<string, "profile" | "solid">(), sketches = new Map<string, SketchWorkPlane>();
  const openPaths = new Set<string>();
  for (const id of context.selectionIds) {
    const object = document.objects[id], feature = features.get(id), sourceLayer = object && document.layers[object.layerId];
    if (!object?.visible || !sourceLayer?.visible || sourceLayer.locked || !feature || feature.pattern) continue;
    const representation = featureContract(feature).representation;
    if (representation === "brep"&&!cadModelReferenceIssue(document,id,features)) allowed.set(id, "solid");
    if (representation === "analytic-curve" && !feature.construction) {
      const owner=typeof feature.params.sketchId==="string"?document.sketches?.[feature.params.sketchId]:undefined;
      if(owner?.facePlaneId)continue;
      allowed.set(id, "profile");
      if(feature.type === "drawing" && (["line","arc"].includes(String(feature.params.kind)) || feature.params.kind === "polyline" && feature.params.closed !== true || validSpline(feature.params)&&!splineClosed(feature.params))) openPaths.add(id);
      const sketchId = feature.params.sketchId;
      if (typeof sketchId === "string" && document.sketches?.[sketchId]) sketches.set(sketchId, document.sketches[sketchId].workPlane);
    }
  }
  const occupied = new Set([...Object.keys(document.objects), ...Object.keys(document.features), ...Object.keys(document.sketches ?? {}), ...Object.keys(document.workPlanes ?? {})]);
  const reserve = (id: string) => { if ([id, `feature-${id}`].some(key => occupied.has(key))) throw new Error(`Output ID ${id} already exists. Use a new ID.`); occupied.add(id); occupied.add(`feature-${id}`); };
  const source = (id: string, kind: "profile" | "solid") => { if (allowed.get(id) !== kind) throw new Error(context.selectionIds.includes(id)&&cadModelReferenceIssue(document,id,features)||`Source ${id} must be a selected, visible, unlocked ${kind}, or an earlier result in this proposal.`); };
  const commands: Exclude<CadCommand, { type: "batch" }>[] = [], outputs = new Set<string>(), ghosts: CopilotGhost[] = [];
  for (const call of calls) {
    signal?.throwIfAborted();
    const a = call.arguments, id = a.id as string;
    reserve(id);
    if (call.name === "sketch.create") {
      sketches.set(id, a.plane as SketchWorkPlane);
      commands.push({ type: "create-sketch", id, workPlane: a.plane as SketchWorkPlane, layerId });
    } else if (call.name === "sketch.rectangle" || call.name === "sketch.circle") {
      const sketchId = a.sketchId as string, plane = sketches.get(sketchId);
      if (!plane) throw new Error("Create the sketch first, or select a profile in its owner sketch.");
      const base = { type: "add-sketch-geometry" as const, sketchId };
      if (call.name === "sketch.rectangle") {
        const origin = a.origin as [number, number], width = a.width as number, height = a.height as number;
        commands.push({ ...base, geometry: { id, kind: "rectangle", origin, width, height, cornerIds: ["a", "b", "c", "d"], edgeIds: ["ab", "bc", "cd", "da"] }, constraints: [
          { id: `${id}-origin`, kind: "fixed-point", point: { geometryId: id, pointId: "a" }, value: origin },
          { id: `${id}-width`, kind: "distance", first: { geometryId: id, pointId: "a" }, second: { geometryId: id, pointId: "b" }, value: width },
          { id: `${id}-height`, kind: "distance", first: { geometryId: id, pointId: "b" }, second: { geometryId: id, pointId: "c" }, value: height },
        ] });
        const points = [[origin[0], origin[1]], [origin[0] + width, origin[1]], [origin[0] + width, origin[1] + height], [origin[0], origin[1] + height]].map(p => planeToWorld(p as [number, number], WORK_PLANES[plane]));
        ghosts.push({ kind: "drawing", key: id, drawing: "rectangle", params: { kind: "rectangle", workPlane: plane, points, closed: true } });
      } else {
        const center = a.center as [number, number], radius = a.radius as number;
        commands.push({ ...base, geometry: { id, kind: "circle", center, radius, centerId: "center", curveId: "curve" }, constraints: [
          { id: `${id}-center`, kind: "fixed-point", point: { geometryId: id, pointId: "center" }, value: center },
          { id: `${id}-radius`, kind: "radius", geometryId: id, value: radius },
        ] });
        ghosts.push({ kind: "drawing", key: id, drawing: "circle", params: { kind: "circle", workPlane: plane, center: planeToWorld(center, WORK_PLANES[plane]), radius } });
      }
      allowed.set(id, "profile"); outputs.add(id);
    } else if(call.name==="draft.text"){
      commands.push({type:"create-drafting",id,layerId,params:{kind:"text",workPlane:a.plane,point:a.point,text:a.text,height:a.height}});outputs.add(id);
    } else if(call.name==="draft.linearDimension"){
      const points=a.points as [number,number][];
      if(Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])<1e-7||a.orientation==="horizontal"&&Math.abs(points[1][0]-points[0][0])<1e-7||a.orientation==="vertical"&&Math.abs(points[1][1]-points[0][1])<1e-7)throw Error("Dimension needs a nonzero measured span in its orientation.");
      commands.push({type:"create-dimension",id,dimension:"linear",layerId,params:{workPlane:a.plane,points,orientation:a.orientation,offset:a.offset,style:{paperScale:a.paperScale,lengthUnit:"mm",precision:0}}});outputs.add(id);
    } else if (call.name === "curve.fitted") {
      const spline=fittedPoints(a.points as [number,number,number][],a.plane as SketchWorkPlane,a.closed as boolean,a.tension as number,a.continuity as FitContinuity|undefined,a.space as FitSpace|undefined);
      commands.push({type:"create-drawing",id,drawing:"spline",params:{...spline,workPlane:a.plane},layerId});
      allowed.set(id,"profile");outputs.add(id);if(a.closed===false)openPaths.add(id);
    } else if (call.name === "curve.circle" || call.name === "curve.polyline") {
      const plane = a.plane as SketchWorkPlane;
      let params: Record<string,unknown>;
      if (call.name === "curve.circle") params = {kind:"circle",workPlane:plane,center:a.center,radius:a.radius};
      else {
        const points = a.points as [number,number,number][], normal = WORK_PLANES[plane].normal;
        const elevations = points.map(p => p.reduce((sum,v,index) => sum+v*normal[index],0));
        if (elevations.some(z => Math.abs(z-elevations[0])>1e-6)) throw new Error("Polyline vertices must lie on one plane parallel to the specified origin plane.");
        if (a.closed && points.length<3 || points.some((p,i) => i>0 && Math.hypot(...p.map((v,j)=>v-points[i-1][j]))<1e-7) || Math.hypot(...points[0].map((v,j)=>v-points.at(-1)![j]))<1e-7) throw new Error("Use distinct consecutive vertices and omit a repeated closing point; closed profiles need at least 3 vertices.");
        params = {kind:"polyline",workPlane:plane,points,closed:a.closed};
      }
      const drawing = call.name === "curve.circle" ? "circle" : "polyline";
      commands.push({type:"create-drawing",id,drawing,params,layerId});
      ghosts.push({kind:"drawing",key:id,drawing,params});
      allowed.set(id,"profile"); outputs.add(id);
      if(call.name === "curve.polyline" && a.closed === false) openPaths.add(id);
    } else if (["solid.revolve","solid.sweep","solid.loft"].includes(call.name)) {
      const ids = a.profileObjectIds as string[];
      if (new Set(ids).size !== ids.length) throw new Error("Profile references must be unique and ordered.");
      ids.forEach(key => source(key,"profile"));
      if (call.name === "solid.revolve") commands.push({type:"create-revolve",id,profileObjectIds:ids,axis:a.axis as "x"|"y",angle:a.angle as number,layerId});
      if (call.name === "solid.loft") commands.push({type:"create-loft",id,profileObjectIds:ids,ruled:a.ruled as boolean,layerId});
      if (call.name === "solid.sweep") {
        const path = a.pathObjectId as string; source(path,"profile");
        if(!openPaths.has(path)) throw new Error(`Sweep path '${path}' must be an open line, arc, polyline or spline. Select a closed section first, then an open path; swap the two inputs if their roles are reversed.`);
        if(ids.includes(path)) throw new Error("Sweep profile and path must be distinct.");
        commands.push({type:"create-sweep",id,profileObjectIds:ids,pathObjectId:path,layerId,...a.alignToPath!==undefined?{alignToPath:a.alignToPath as boolean}:{}}); outputs.delete(path);
      }
      ids.forEach(key=>outputs.delete(key)); allowed.set(id,"solid"); outputs.add(id);
    } else if (["solid.fillet","solid.chamfer","solid.shell"].includes(call.name)) {
      const targetId = a.targetId as string; source(targetId,"solid");
      const feature = features.get(targetId);
      if(!feature) throw new Error("Apply the new solid before querying its topology and finishing it.");
      const keys = (call.name === "solid.shell" ? a.faceKeys : a.edgeKeys) as string[];
      if(new Set(keys).size!==keys.length) throw new Error("Topology references must be unique.");
      if(call.name === "solid.shell") {
        if(await shellFaceStatus(feature,keys)!=="resolved") throw new Error("Shell faces are missing or ambiguous. Query faces again.");
        commands.push({type:"create-shell",id,targetId,faceKeys:keys,thickness:a.thickness as number});
      } else {
        const topology = await enumerateSolidTopology(feature.params,{signal});
        if(keys.some(key=>!topology.edges.some(edge=>edge.key===key))) throw new Error("An edge key is missing. Query edges again.");
        if(call.name === "solid.fillet") commands.push({type:"fillet",id,target:targetId,edges:keys,radius:a.radius as number});
        else commands.push({type:"chamfer",id,target:targetId,edges:keys,distance:a.distance as number});
      }
      signal?.throwIfAborted();
      allowed.delete(targetId); outputs.delete(targetId); allowed.set(id,"solid"); outputs.add(id);
    } else if(call.name==="solid.primitive"){
      const primitive=a.primitive as "box"|"cylinder"|"sphere"|"cone"|"torus",params=a.params as Record<string,number>;
      const fields=featureContract({id:"check",type:"primitive",output:id,inputs:[],params:{kind:primitive}}).parameters.map(p=>p.key);
      if(Object.keys(params).sort().join()!==fields.sort().join())throw new Error("Supply exactly the advertised parameters for this primitive kind.");
      commands.push({type:"create-primitive",id,primitive,params,position:a.position as [number,number,number],layerId});
      allowed.set(id,"solid");outputs.add(id);
    } else if (call.name === "solid.extrude") {
      const ids = a.profileObjectIds as string[];
      if (new Set(ids).size !== ids.length) throw new Error("Extrusion profile references must be unique.");
      ids.forEach(key => source(key, "profile"));
      commands.push({ type: "create-extrude", id, profileObjectIds: ids, distance: a.distance as number, layerId });
      ids.forEach(key => outputs.delete(key)); allowed.set(id, "solid"); outputs.add(id);
    } else if (call.name === "solid.boolean") {
      const target = a.targetId as string, tool = a.toolId as string;
      source(target, "solid"); source(tool, "solid");
      if (target === tool) throw new Error("Boolean needs two distinct solid sources.");
      commands.push({ type: "boolean-operation", id, operation: a.operation as "union" | "cut" | "intersect", target, tool });
      for (const key of [target, tool]) { allowed.delete(key); outputs.delete(key); }
      allowed.set(id, "solid"); outputs.add(id);
    } else if (call.name === "solid.hole") {
      const targetId = a.targetId as string;
      source(targetId, "solid");
      if (!document.objects[targetId]) throw new Error("Apply the new solid before querying its faces and adding a face-bound hole.");
      if (!a.through && a.depth === undefined) throw new Error("A blind hole requires an explicit depth in mm.");
      if (a.through && a.depth !== undefined) throw new Error("A through hole derives its travel from the solid. Omit depth, or choose a blind hole.");
      const planeId = `plane-${id}`; reserve(planeId);
      const sourceFace = { kind: "brep-face" as const, objectId: targetId, topologyId: a.faceKey as string };
      const resolved = await resolveFaceWorkPlane(document, sourceFace);
      signal?.throwIfAborted();
      if (resolved.status !== "resolved") throw new Error(`Hole face is ${resolved.status}. Read faces and choose an existing planar face.`);
      commands.push({ type: "attach-work-plane-face", id: planeId, name: "Hole source face", source: sourceFace });
      commands.push({ type: "create-face-hole", id, planeId, center: a.center as [number, number], diameter: a.diameter as number, depth: (a.depth as number | undefined) ?? 1, through: a.through as boolean });
      allowed.delete(targetId); outputs.delete(targetId); allowed.set(id, "solid"); outputs.add(id);
    }
  }
  const command: CadCommand = commands.length === 1 ? commands[0] : { type: "batch", label: "Copilot: model with CAD tools", commands };
  if (!validateCommand(command)) throw new Error("CAD tools produced an invalid command proposal.");
  return { command, resultObjectIds: [...outputs], ghosts, summary: calls.map(call => describe(call)), toolSteps: calls.map(call => CAD_TOOLS[call.name].label) };
}
function describe(call: CadToolCall): string {
  const a = call.arguments;
  if(call.name==="draft.text")return `Static CAD text: ${a.text}; height ${a.height} mm, plane ${a.plane}.`;
  if(call.name==="draft.linearDimension")return `Static measured dimension in ${a.plane}; ${a.orientation}, paper scale ${a.paperScale}. Recheck after geometry edits.`;
  if (call.name === "sketch.create") return `Sketch ${a.id} on ${a.plane}.`;
  if (call.name === "sketch.rectangle") return `Rectangle ${a.width} × ${a.height} mm in sketch ${a.sketchId}, origin [${a.origin}].`;
  if (call.name === "sketch.circle") return `Circle radius ${a.radius} mm in sketch ${a.sketchId}, center [${a.center}].`;
  if (call.name === "solid.extrude") return `Extrude ${a.profileObjectIds} by ${a.distance} mm along the profile plane's +normal.`;
  if (call.name === "solid.boolean") return `${a.operation}: target ${a.targetId}, tool ${a.toolId}. Input order is significant for cut.`;
  if (call.name === "curve.circle") return `Circle radius ${a.radius} mm, world center [${a.center}], plane ${a.plane}.`;
  if (call.name === "curve.fitted") return `Fitted spline through ${(a.points as unknown[]).length} points on ${a.plane}; ${a.closed?"closed":"open"}, tangent ${a.tension}.`;
  if (call.name === "curve.polyline") return `${a.closed?"Closed profile":"Open path"}: ${(a.points as unknown[]).length} world XYZ vertices in mm, plane ${a.plane}.`;
  if (call.name === "solid.revolve") return `Revolve ${a.profileObjectIds} by ${a.angle}° around plane-local ${a.axis} through world origin.`;
  if (call.name === "solid.sweep") return `Sweep ${a.profileObjectIds} along path ${a.pathObjectId}; ${a.alignToPath===true?"align section to the initial tangent":"preserve original section orientation"}; spline paths retain exact world-space NURBS, arcs use stored samples.`;
  if (call.name === "solid.loft") return `Loft sections in order: ${a.profileObjectIds}; ${a.ruled?"ruled":"smooth"}.`;
  if (call.name === "solid.fillet" || call.name === "solid.chamfer") return `${call.name === "solid.fillet" ? `Fillet radius ${a.radius}` : `Symmetric chamfer distance ${a.distance}`} mm on ${(a.edgeKeys as string[]).length} exact edges of ${a.targetId}.`;
  if (call.name === "solid.shell") return `Shell ${a.targetId} inward ${a.thickness} mm; remove ${(a.faceKeys as string[]).length} exact faces.`;
  if(call.name==="solid.primitive")return `${a.primitive} at world [${a.position}] mm: ${Object.entries(a.params as Record<string,number>).map(([key,value])=>`${key} ${value} mm`).join(", ")}.`;
  return `Hole Ø${a.diameter} mm, ${a.through ? "through" : `depth ${a.depth} mm`}, target ${a.targetId}, face-local center [${a.center}].`;
}
