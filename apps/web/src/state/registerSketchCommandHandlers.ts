import type { CadDocument, Sketch, SketchGeometry } from "@agent-webcad/cad-document";
import { CommandBus, type CadCommand } from "@agent-webcad/cad-commands";
import { SKETCH_TOLERANCE, solveSketch } from "../precision/sketchSolver";
import { sketchGeometryToDrawingParams } from "../precision/sketchAdapter";

function changedPoint(geometry: SketchGeometry, pointId: string, position: [number, number]): SketchGeometry | null {
  if (geometry.kind === "line") {
    if (pointId === geometry.startId) return { ...geometry, start: position };
    if (pointId === geometry.endId) return { ...geometry, end: position };
  }
  if (geometry.kind === "polyline" && geometry.vertices.some((vertex) => vertex.id === pointId)) {
    return { ...geometry, vertices: geometry.vertices.map((vertex) => vertex.id === pointId ? { ...vertex, point: position } : vertex) };
  }
  if (geometry.kind === "circle" && pointId === geometry.centerId) return { ...geometry, center: position };
  if (geometry.kind === "circle" && pointId === `${geometry.id}:radius:0`) return { ...geometry, radius: Math.hypot(position[0] - geometry.center[0], position[1] - geometry.center[1]) };
  if (geometry.kind === "arc") {
    if (pointId === geometry.centerId) return { ...geometry, center: position };
    if (pointId === geometry.startId || pointId === geometry.endId) {
      const angle = Math.atan2(position[1] - geometry.center[1], position[0] - geometry.center[0]);
      const radius = Math.hypot(position[0] - geometry.center[0], position[1] - geometry.center[1]);
      return { ...geometry, radius, ...(pointId === geometry.startId ? { startAngle: angle } : { endAngle: angle }) };
    }
  }
  // Rectangle corners are derived from origin/width/height; arbitrary single
  // corner dragging needs a defined anchor policy and is intentionally rejected.
  return null;
}

/** All sketch edits solve a detached proposal before touching the live document. */
export function registerSketchCommandHandlers(bus: CommandBus, document: CadDocument) {
  const edit = (sketchId: string, propose: (sketch: Sketch) => boolean) => {
    const current = document.sketches?.[sketchId];
    if (!current) return { accepted: false, reason: "Sketch not found." };
    const layer = document.layers[current.layerId];
    if (!layer?.visible || layer.locked) return { accepted: false, reason: "Sketch layer is hidden or locked." };
    const proposed = structuredClone(current);
    if (!propose(proposed)) return { accepted: false, reason: "No change or invalid sketch edit." };
    const solved = solveSketch(proposed);
    if (!solved.ok) return { accepted: false, reason: solved.reason, conflictingConstraintIds: solved.conflictingConstraintIds };
    if (JSON.stringify(current.geometry) === JSON.stringify(solved.sketch.geometry) &&
      JSON.stringify(current.constraints) === JSON.stringify(solved.sketch.constraints)) {
      return { accepted: false, reason: "Sketch geometry and constraints are unchanged." };
    }
    // Stage the entire derived projection before committing any document data.
    const previousIds = new Set(current.geometry.map((entry) => entry.id));
    const nextIds = new Set(solved.sketch.geometry.map((entry) => entry.id));
    for (const id of nextIds) {
      if (!previousIds.has(id) && (document.objects[id] || document.features[`feature-${id}`]))
        return { accepted: false, reason: `Object ID ${id} already exists.` };
    }
    const projections = solved.sketch.geometry.map((geometry) => ({ geometry, params: sketchGeometryToDrawingParams(solved.sketch, geometry) }));
    for (const id of previousIds) if (!nextIds.has(id)) {
      delete document.objects[id];
      delete document.features[`feature-${id}`];
      document.rootObjects = document.rootObjects.filter((entry) => entry !== id);
      const layer = document.layers[current.layerId];
      if (layer) layer.objectIds = layer.objectIds.filter((entry) => entry !== id);
    }
    for (const { geometry, params } of projections) {
      const id = geometry.id;
      if (!previousIds.has(id)) {
        document.objects[id] = { id, geometryId: `geometry-${id}`, name: `Sketch ${geometry.kind[0].toUpperCase()}${geometry.kind.slice(1)}`, visible: true, layerId: current.layerId,
          transform: { translation: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } };
        document.features[`feature-${id}`] = { id: `feature-${id}`, type: "drawing", inputs: [], output: id, params };
        document.rootObjects.push(id);
        document.layers[current.layerId].objectIds.push(id);
      } else {
        const feature = document.features[`feature-${id}`];
        if (feature && JSON.stringify(feature.params) !== JSON.stringify(params)) feature.params = params;
      }
    }
    document.sketches![sketchId] = solved.sketch;
    document.revision += 1;
    return { accepted: true, sketch: solved.sketch };
  };

  bus.registerHandler("create-sketch", async (command: CadCommand) => {
    if (command.type !== "create-sketch" || document.sketches?.[command.id]) return { accepted: false };
    const layerId = command.layerId ?? "layer-default";
    const layer = document.layers[layerId];
    if (!layer?.visible || layer.locked) return { accepted: false, reason: "Sketch layer is hidden or locked." };
    const sketch: Sketch = {
      id: command.id, workPlane: command.workPlane, layerId, geometry: [], constraints: [], dimensions: [],
      solveState: { status: "fully-constrained", degreesOfFreedom: 0, rank: 0, residual: 0, tolerance: SKETCH_TOLERANCE },
    };
    document.sketches ??= {};
    document.sketches[command.id] = sketch;
    document.revision += 1;
    return { accepted: true, sketch };
  });

  bus.registerHandler("add-sketch-geometry", async (command: CadCommand) => {
    if (command.type !== "add-sketch-geometry") return;
    return edit(command.sketchId, (sketch) => {
      if (sketch.geometry.some((entry) => entry.id === command.geometry.id)) return false;
      sketch.geometry.push(structuredClone(command.geometry));
      return true;
    });
  });

  bus.registerHandler("remove-sketch-geometry", async (command: CadCommand) => {
    if (command.type !== "remove-sketch-geometry") return;
    return edit(command.sketchId, (sketch) => {
      if (!sketch.geometry.some((entry) => entry.id === command.geometryId)) return false;
      if (sketch.constraints.some((entry) =>
        "firstLineId" in entry ? entry.firstLineId === command.geometryId || entry.secondLineId === command.geometryId :
        "geometryId" in entry ? entry.geometryId === command.geometryId :
        "point" in entry ? entry.point.geometryId === command.geometryId :
        entry.first.geometryId === command.geometryId || entry.second.geometryId === command.geometryId)) return false;
      sketch.geometry = sketch.geometry.filter((entry) => entry.id !== command.geometryId);
      return true;
    });
  });

  bus.registerHandler("add-sketch-constraint", async (command: CadCommand) => {
    if (command.type !== "add-sketch-constraint") return;
    return edit(command.sketchId, (sketch) => {
      if (sketch.constraints.some((entry) => entry.id === command.constraint.id)) return false;
      sketch.constraints.push(structuredClone(command.constraint));
      if (["distance", "radius", "diameter", "angle"].includes(command.constraint.kind)) sketch.dimensions.push({ id: `dimension:${command.constraint.id}`, constraintId: command.constraint.id });
      return true;
    });
  });

  bus.registerHandler("remove-sketch-constraint", async (command: CadCommand) => {
    if (command.type !== "remove-sketch-constraint") return;
    return edit(command.sketchId, (sketch) => {
      if (!sketch.constraints.some((entry) => entry.id === command.constraintId)) return false;
      sketch.constraints = sketch.constraints.filter((entry) => entry.id !== command.constraintId);
      sketch.dimensions = sketch.dimensions.filter((entry) => entry.constraintId !== command.constraintId);
      return true;
    });
  });

  bus.registerHandler("set-sketch-dimension", async (command: CadCommand) => {
    if (command.type !== "set-sketch-dimension") return;
    return edit(command.sketchId, (sketch) => {
      const constraint = sketch.constraints.find((entry) => entry.id === command.constraintId);
      if (!constraint || !("value" in constraint) || typeof constraint.value !== "number" || constraint.value === command.value ||
        (constraint.kind === "angle" ? Math.abs(command.value) > Math.PI : command.value <= SKETCH_TOLERANCE)) return false;
      (constraint as { value: number }).value = command.value;
      return true;
    });
  });

  bus.registerHandler("move-sketch-point", async (command: CadCommand) => {
    if (command.type !== "move-sketch-point") return;
    return edit(command.sketchId, (sketch) => {
      const index = sketch.geometry.findIndex((entry) => entry.id === command.point.geometryId);
      if (index < 0) return false;
      const updated = changedPoint(sketch.geometry[index], command.point.pointId, command.position);
      if (!updated || JSON.stringify(updated) === JSON.stringify(sketch.geometry[index])) return false;
      sketch.geometry[index] = updated;
      return true;
    });
  });

  bus.registerHandler("move-sketch-segment", async (command: CadCommand) => {
    if (command.type !== "move-sketch-segment") return;
    return edit(command.sketchId, (sketch) => {
      const index = sketch.geometry.findIndex((entry) => entry.id === command.geometryId);
      if (index < 0 || Math.hypot(...command.delta) <= SKETCH_TOLERANCE) return false;
      const entity = sketch.geometry[index];
      const translate = (point: [number, number]): [number, number] => [point[0] + command.delta[0], point[1] + command.delta[1]];
      if (entity.kind === "line" && entity.segmentId === command.segmentId) sketch.geometry[index] = { ...entity, start: translate(entity.start), end: translate(entity.end) };
      else if (entity.kind === "polyline") {
        const segment = entity.segmentIds.indexOf(command.segmentId);
        if (segment < 0) return false;
        const second = (segment + 1) % entity.vertices.length;
        sketch.geometry[index] = { ...entity, vertices: entity.vertices.map((vertex, pointIndex) => segment === pointIndex || second === pointIndex ? { ...vertex, point: translate(vertex.point) } : vertex) };
      } else return false;
      return true;
    });
  });
}
