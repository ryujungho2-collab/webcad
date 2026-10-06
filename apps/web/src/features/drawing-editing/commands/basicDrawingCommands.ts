import type { CadDocument, CadFeature } from "@agent-webcad/cad-document";
import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import { editPolyline, lengthenDrawing, stretchDrawing } from "../geometry/basicDrawingEditing";
import { drawingTransformAfterEdit } from "../../../precision/worldGeometry";
import { WORK_PLANES, worldToPlane } from "../../../precision/workPlane";

export function registerBasicDrawingCommands(bus: CommandBus, document: CadDocument) {
  const source = (id: string, features?: Map<string, CadFeature>) => {
    const object = document.objects[id], feature = features ? features.get(id) : Object.values(document.features).find(f => f.output === id), layer = object && document.layers[object.layerId];
    if (!object || !feature || feature.type !== "drawing") throw new Error("Select standalone drawing geometry.");
    if (!object.visible || !layer?.visible || layer.locked) throw new Error(`Show and unlock '${object.name}' before editing.`);
    if (feature.params.sketchId) throw new Error("Edit sketch-owned geometry through its sketch so constraints remain valid.");
    if (feature.pattern) throw new Error("Edit the pattern source or detach the instance before editing.");
    return { object, feature };
  };
  const commit = (entry: ReturnType<typeof source>, params: Record<string, unknown>) => {
    entry.object.transform = drawingTransformAfterEdit(entry.object, entry.feature, params);
    entry.feature.params = params;
  };
  for (const type of ["edit-polyline", "lengthen-drawing"] as const) bus.registerHandler(type, (command: CadCommand) => {
    if (command.type !== type) return;
    const entry = source(command.objectId);
    commit(entry, command.type === "edit-polyline" ? editPolyline(entry.object, entry.feature, command) : lengthenDrawing(entry.object, entry.feature, command));
    document.revision++;
  });
  bus.registerHandler("stretch-drawings", (command: CadCommand) => {
    if (command.type !== "stretch-drawings") return;
    const plane = WORK_PLANES[command.workPlane], a = worldToPlane(command.first, plane), b = worldToPlane(command.second, plane);
    if (a.some((v, i) => Math.abs(v - b[i]) <= 1e-6)) throw new Error("Choose a crossing rectangle with positive width and height.");
    if (Math.abs(command.second.reduce((sum, v, i) => sum + (v - command.first[i]) * plane.normal[i], 0)) > 1e-6 || Math.abs(command.delta.reduce((sum, v, i) => sum + v * plane.normal[i], 0)) > 1e-6) throw new Error("Stretch area and displacement must lie on the same work plane.");
    if (Math.hypot(...command.delta) <= 1e-6) throw new Error("Enter a nonzero Stretch displacement.");
    const features = new Map(Object.values(document.features).map(f => [f.output, f]));
    const changes = command.objectIds.flatMap(id => { const entry = source(id, features), params = stretchDrawing(entry.object, entry.feature, command, command.delta); return params ? [{ entry, params }] : []; });
    if (!changes.length) throw new Error("No endpoints, vertices or circle centres lie inside the crossing area. Enlarge or move the area.");
    for (const { entry, params } of changes) commit(entry, params);
    document.revision++;
  });
}
