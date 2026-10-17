import {classifyBlockStretch} from "../geometry/blockStretch";
import {getObjectTransform} from "../../../precision/objectTransform";
import type { CadDocument, CadFeature, CadObject, Sketch } from "@agent-webcad/cad-document";
import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import { editPolyline, lengthenDrawing, stretchDrawing } from "../geometry/basicDrawingEditing";
import { exactDrawingContour } from "../geometry/contourEditing";
import { planSketchStretch } from "../geometry/sketchStretch";
import { contourReferenceRequirements, reconnectContourReferences } from "./contourReferences";
import { drawingToSketchGeometry } from "../../../precision/sketchAdapter";
import { sketchGeometryToDrawingParams } from "../../../precision/sketchAdapter";
import { solveSketch, sketchPoint } from "../../../precision/sketchSolver";
import { geometryPointIds, constraintGeometryIds } from "../../../precision/sketchEditing";
import { SketchParameterConflictError } from "../../../precision/sketchConflict";
import { drawingTransformAfterEdit } from "../../../precision/worldGeometry";
import { WORK_PLANES, worldToPlane } from "../../../precision/workPlane";

export function registerBasicDrawingCommands(bus: CommandBus, document: CadDocument) {
  const source = (id: string, features?: Map<string, CadFeature>, allowSketch = false) => {
    const object = document.objects[id], feature = features ? features.get(id) : Object.values(document.features).find(f => f.output === id), layer = object && document.layers[object.layerId];
    if (!object || !feature || feature.type !== "drawing") throw new Error("Select standalone drawing geometry.");
    if (!object.visible || !layer?.visible || layer.locked) throw new Error(`Show and unlock '${object.name}' before editing.`);
    if (feature.params.sketchId && !allowSketch) throw new Error("Edit sketch-owned geometry through its sketch so constraints remain valid.");
    if (feature.pattern) throw new Error("Edit the pattern source or detach the instance before editing.");
    return { object, feature };
  };
  const commit = (entry: ReturnType<typeof source>, params: Record<string, unknown>) => {
    entry.object.transform = drawingTransformAfterEdit(entry.object, entry.feature, params);
    entry.feature.params = params;
  };
  bus.registerHandler("lengthen-drawing", (command: CadCommand) => {
    if (command.type !== "lengthen-drawing") return;
    const entry = source(command.objectId, undefined, true);
    const params = lengthenDrawing(entry.object, entry.feature, command);
    if (!entry.feature.params.sketchId) { commit(entry, params); document.revision++; return; }
    const sketchId=String(entry.feature.params.sketchId),current=document.sketches?.[sketchId];
    if(!current)throw Error("The owning sketch no longer exists.");
    if(current.facePlaneId)throw Error("Finish face sketch edits in the Sketch inspector before using Lengthen on an independent work plane.");
    if(document.layers[current.layerId]?.locked||!document.layers[current.layerId]?.visible)throw Error("Show and unlock the owning sketch layer.");
    const transform=getObjectTransform(entry.object,entry.feature);
    if(transform.translation.some(v=>v!==0)||transform.rotation.some(v=>v!==0)||transform.scale.some(v=>v!==1))throw Error("Reset the sketch drawing placement before Lengthen.");
    const original=current.geometry.find(g=>g.id===command.objectId);
    let replacement=drawingToSketchGeometry(current,String(params.kind),params,command.objectId);
    if(original?.kind==="line"&&replacement?.kind==="line")replacement={...replacement,startId:original.startId,endId:original.endId,segmentId:original.segmentId};
    else if(original?.kind==="arc"&&replacement?.kind==="arc")replacement={...replacement,centerId:original.centerId,startId:original.startId,endId:original.endId,curveId:original.curveId};
    else throw Error("Sketch Lengthen supports one line or circular arc. Use Edit polyline for mixed path configuration.");
    const proposal=structuredClone(current),constraints=structuredClone(current.constraints);
    proposal.geometry=proposal.geometry.map(g=>g.id===replacement!.id?replacement!:g);
    for(const pointId of geometryPointIds(replacement))proposal.constraints.push({id:`lengthen-target:${pointId}`,kind:"fixed-point",point:{geometryId:replacement.id,pointId},value:sketchPoint(replacement,pointId)!});
    let result=solveSketch(proposal);
    if(!result.ok)throw new SketchParameterConflictError(`Lengthen conflicts with sketch constraints: ${result.reason}`,{kind:"sketch-conflict",sketchId,constraintIds:result.conflictingConstraintIds.filter(id=>constraints.some(c=>c.id===id)),geometryIds:[command.objectId]});
    result.sketch.constraints=constraints;result=solveSketch(result.sketch);
    if(!result.ok)throw Error(result.reason);
    const projections=result.sketch.geometry.map(g=>{
      const feature=Object.values(document.features).find(f=>f.output===g.id);
      if(!feature)throw Error(`Missing sketch projection: ${g.id}.`);
      const projected=sketchGeometryToDrawingParams(result.sketch,g,feature.params);
      if(JSON.stringify(projected)!==JSON.stringify(feature.params)&&document.layers[document.objects[g.id].layerId]?.locked)throw Error(`Unlock '${document.objects[g.id].name}' before moving connected geometry.`);
      return {feature,params:projected};
    });
    document.sketches![sketchId]=result.sketch;
    for(const projection of projections)projection.feature.params=projection.params;
    document.revision++;
  });
  bus.registerHandler("edit-polyline", (command: CadCommand) => {
    if (command.type !== "edit-polyline") return;
    const entry = source(command.objectId, undefined, command.referenceRoutes !== undefined);
    if (!entry.feature.params.sketchId) {
      if (command.referenceRoutes !== undefined) throw new Error("Standalone vertex edits need no reference routes; omit them.");
      commit(entry, editPolyline(entry.object, entry.feature, command));
      document.revision++;
      return;
    }
    // Sketch-owned vertex edits keep the entity identity and re-solve its
    // constraints, driving dimensions and live solids in one transaction.
    const requirements = contourReferenceRequirements(document, [command.objectId]);
    if (requirements.some(r => r.kind === "pattern" || "throughPattern" in r && r.throughPattern)) throw new Error("Detach the pattern before editing sketch-owned vertices.");
    if (Object.values(document.scenes ?? {}).some(scene => scene.objectIds.includes(command.objectId))) throw new Error("This contour belongs to a scene. Reassign or remove that scene relationship before editing its vertices.");
    const sketchId = String(entry.feature.params.sketchId), sketch = document.sketches?.[sketchId];
    if (!sketch) throw new Error("The owning sketch no longer exists.");
    const before = exactDrawingContour(entry.object, entry.feature);
    if (!["polyline", "rectangle", "arc"].includes(String(entry.feature.params.kind)))
      throw new Error("Select a sketch polyline, rectangle or arc for configuration editing.");
    const params = editPolyline(entry.object, entry.feature, command);
    if (!drawingToSketchGeometry(sketch, String(params.kind), { ...params, sketchId }, command.objectId))
      throw new Error("The edited contour cannot be represented exactly on the owning sketch plane.");
    const prepared = { object: entry.object, feature: { ...entry.feature, params } };
    const reconnected = reconnectContourReferences(document, [command.objectId], [prepared], command.referenceRoutes ?? []);
    for (const f of reconnected.features) document.features[f.id] = f;
    for (const s of reconnected.sketches) document.sketches![s.id] = s;
    for (const s of reconnected.scenes) document.scenes![s.id] = s;
    for (const [id, binding] of Object.entries(reconnected.bindings)) { document.parameterBindings ??= {}; document.parameterBindings[id] = binding; }
    document.revision++;
  });
  bus.registerHandler("stretch-drawings", (command: CadCommand) => {
    if (command.type !== "stretch-drawings") return;
    const plane = WORK_PLANES[command.workPlane], a = worldToPlane(command.first, plane), b = worldToPlane(command.second, plane);
    if (a.some((v, i) => Math.abs(v - b[i]) <= 1e-6)) throw new Error("Choose a crossing rectangle with positive width and height.");
    if (Math.abs(command.second.reduce((sum, v, i) => sum + (v - command.first[i]) * plane.normal[i], 0)) > 1e-6 || Math.abs(command.delta.reduce((sum, v, i) => sum + v * plane.normal[i], 0)) > 1e-6) throw new Error("Stretch area and displacement must lie on the same work plane.");
    if (Math.hypot(...command.delta) <= 1e-6) throw new Error("Enter a nonzero Stretch displacement.");
    const features = new Map(Object.values(document.features).map(f => [f.output, f]));
    const blockMoves: {object: import("@agent-webcad/cad-document").CadObject; transform: import("@agent-webcad/cad-document").CadObjectTransform}[]=[];
    const sketchGroups = new Map<string, { object: CadObject; feature: CadFeature; plan: NonNullable<ReturnType<typeof planSketchStretch>> }[]>();
    const changes = command.objectIds.flatMap(id => {
      const object=document.objects[id],feature=features.get(id);
      if(object&&feature?.type==="drafting"&&feature.params.kind==="block"){
        const layer=document.layers[object.layerId];if(!object.visible||!layer?.visible||layer.locked)throw new Error(`Show and unlock '${object.name}' before Stretch.`);
        if(feature.pattern||feature.construction||feature.params.sketchId)throw new Error("Edit the block through its owning sketch or pattern source, or explicitly detach it first.");
        const included=classifyBlockStretch(document,object,feature,command);
        if(included==="partial")throw new Error(`'${object.name}' is partially included. Blocks move rigidly only when their complete bounds are inside. Edit its definition or explicitly Disband block, then Stretch the resulting members. No definition or sibling instance was changed.`);
        if(included==="inside"){const transform=getObjectTransform(object,feature);transform.translation=transform.translation.map((v,i)=>v+command.delta[i]) as [number,number,number];if(transform.translation.some(v=>!Number.isFinite(v)))throw new Error("Block displacement exceeds finite coordinates.");blockMoves.push({object,transform});}return [];
      }
      const entry = source(id, features, true);
      if (!entry.feature.params.sketchId) {
        const params = stretchDrawing(entry.object, entry.feature, command, command.delta);
        return params ? [{ entry, params }] : [];
      }
      const plan = planSketchStretch(document, entry.object, entry.feature, command, command.delta);
      if (plan) {
        const group = sketchGroups.get(plan.sketchId) ?? [];
        group.push({ object: entry.object, feature: entry.feature, plan });
        sketchGroups.set(plan.sketchId, group);
      }
      return [];
    });
    // Solve every sketch group on clones before committing anything, so a
    // conflicting group rejects the whole command without partial changes.
    const solved = new Map<string, Sketch>();
    for (const [sketchId, group] of sketchGroups) {
      const current = document.sketches?.[sketchId];
      if (!current) throw new Error("The owning sketch no longer exists.");
      const layer = document.layers[current.layerId];
      if (!layer?.visible || layer.locked) throw new Error("Sketch layer is hidden or locked.");
      const proposed = structuredClone(current);
      for (const item of group) {
        const replacement = item.plan.entities.find(e => e.id === item.object.id);
        if (!replacement) throw new Error(`Missing sketch projection: ${item.object.id}.`);
        const index = proposed.geometry.findIndex(g => g.id === replacement.id);
        if (index < 0) throw new Error(`Missing sketch projection: ${replacement.id}.`);
        proposed.geometry[index] = replacement;
      }
      const pins = group.flatMap(item => item.plan.moved);
      for (const pin of pins) {
        const geometry = proposed.geometry.find(g => g.id === pin.geometryId), value = geometry && sketchPoint(geometry, pin.pointId);
        if (!value) throw new Error("The requested sketch point no longer exists.");
        proposed.constraints.push({ id: `stretch-target:${pin.geometryId}:${pin.pointId}:${proposed.constraints.length}`, kind: "fixed-point", point: { geometryId: pin.geometryId, pointId: pin.pointId }, value });
      }
      const constraints = structuredClone(current.constraints);
      const conflict = (reason: string, ids: string[]): never => {
        const names = ids.filter(id => constraints.some(entry => entry.id === id)).map(id => `${constraints.find(entry => entry.id === id)!.kind} (${id})`);
        throw new SketchParameterConflictError(`${reason}${names.length ? ` Check constraints: ${names.join(", ")}.` : ""}`, {
          kind: "sketch-conflict" as const, sketchId,
          constraintIds: ids.filter(id => constraints.some(entry => entry.id === id)),
          geometryIds: [...new Set(constraints.filter(entry => ids.includes(entry.id)).flatMap(constraintGeometryIds))],
        });
      };
      let result = solveSketch(proposed);
      if (!result.ok) return conflict(result.reason, result.conflictingConstraintIds);
      result.sketch.constraints = constraints;
      result = solveSketch(result.sketch);
      if (!result.ok) return conflict(result.reason, result.conflictingConstraintIds);
      solved.set(sketchId, result.sketch);
    }
    const movedSketchPoints = [...sketchGroups.values()].flatMap(group => group.flatMap(item => item.plan.moved)).length;
    if (!changes.length&&!blockMoves.length&&!movedSketchPoints) throw new Error("No endpoints, vertices, circle centres or complete block bounds lie inside the crossing area. Enlarge or move the area.");
    const projections: {feature:CadFeature;params:Record<string,unknown>}[]=[];
    for (const [sketchId, sketch] of solved) {
      for (const geometry of sketch.geometry) {
        const projection = features.get(geometry.id);
        if (!projection || projection.params.sketchId !== sketchId) throw new Error(`Missing sketch projection: ${geometry.id}.`);
        const params = sketchGeometryToDrawingParams(sketch, geometry, projection.params);
        if (JSON.stringify(projection.params) === JSON.stringify(params)) continue;
        const object=document.objects[geometry.id],layer=object&&document.layers[object.layerId];
        if(!object||!layer||layer.locked)throw new Error(`Unlock '${object?.name??geometry.id}' before Stretch; the sketch solver would move this connected geometry.`);
        if(projection.pattern)throw new Error(`Detach the pattern containing '${object.name}' before Stretch; the sketch solver would move its source.`);
        projections.push({feature:projection,params});
      }
    }
    for (const { entry, params } of changes) commit(entry, params);
    for(const move of blockMoves)move.object.transform=move.transform;
    for(const [sketchId,sketch] of solved)document.sketches![sketchId]=sketch;
    for(const {feature,params} of projections)feature.params=params;
    document.revision++;
  });
}
