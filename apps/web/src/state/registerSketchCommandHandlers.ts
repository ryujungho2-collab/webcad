import type { CadDocument, Sketch, SketchGeometry, SketchPointRef } from "@agent-webcad/cad-document";
import { CommandBus, type CadCommand } from "@agent-webcad/cad-commands";
import { SKETCH_TOLERANCE, solveSketch, sketchPoint } from "../precision/sketchSolver";
import { drawingToSketchGeometry, sketchGeometryToDrawingParams } from "../precision/sketchAdapter";
import { constraintGeometryIds, geometryPointIds, transformSketchGeometry } from "../precision/sketchEditing";
import { editSketchPointGeometry, editSketchSegmentGeometry } from "../precision/sketchGripEditing";
import { offsetDrawingParams } from "../features/drawing-editing/geometry/drawingOperations";
import { resolveLineEdit } from "../features/drawing-editing/geometry/lineEditing";

/** All sketch edits solve a detached proposal before touching the live document. */
export function registerSketchCommandHandlers(bus: CommandBus, document: CadDocument) {
  const edit = (sketchId: string, propose: (sketch: Sketch) => boolean | string, pinGeometryIds: string[] = [], pinPoints: SketchPointRef[] = []) => {
    const current = document.sketches?.[sketchId];
    if (!current) return { accepted: false, reason: "Sketch not found." };
    const layer = document.layers[current.layerId];
    if (!layer?.visible || layer.locked) return { accepted: false, reason: "Sketch layer is hidden or locked." };
    const proposed = structuredClone(current);
    const proposal = propose(proposed);
    if (proposal !== true) return { accepted: false, reason: typeof proposal === "string" ? proposal : "No change or invalid sketch edit." };
    // Temporary targets prevent the solver from silently undoing a requested
    // drag/transform. They never become persisted constraints or consume DOF.
    const constraints = structuredClone(proposed.constraints);
    const conflict = (reason: string, ids: string[]) => ({ accepted: false, reason, diagnostic: {
      kind: "sketch-conflict" as const, sketchId,
      constraintIds: ids.filter((id) => constraints.some((entry) => entry.id === id)),
      geometryIds: [...new Set(constraints.filter((entry) => ids.includes(entry.id)).flatMap(constraintGeometryIds))],
    } });
    for (const geometry of proposed.geometry.filter((entry) => pinGeometryIds.includes(entry.id))) {
      for (const pointId of geometryPointIds(geometry)) proposed.constraints.push({ id: `edit-target:${geometry.id}:${pointId}`, kind: "fixed-point", point: { geometryId: geometry.id, pointId }, value: sketchPoint(geometry, pointId)! });
    }
    for (const point of pinPoints) {
      const geometry = proposed.geometry.find(g => g.id === point.geometryId), value = geometry && sketchPoint(geometry, point.pointId);
      if (!value) return { accepted: false, reason: "The requested sketch point no longer exists." };
      proposed.constraints.push({ id: `edit-target:${point.geometryId}:${point.pointId}`, kind: "fixed-point", point, value });
    }
    let solved = solveSketch(proposed);
    if (!solved.ok) {
      const ids = solved.conflictingConstraintIds.filter((id) => constraints.some((entry) => entry.id === id));
      const names = ids.map((id) => `${constraints.find((entry) => entry.id === id)!.kind} (${id})`);
      return conflict(`${solved.reason}${names.length ? ` Check constraints: ${names.join(", ")}.` : ""}`, ids);
    }
    solved.sketch.constraints = constraints;
    solved = solveSketch(solved.sketch);
    if (!solved.ok) return conflict(solved.reason, solved.conflictingConstraintIds);
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
    return { accepted: true, sketch: solved.sketch, createdIds: [...nextIds].filter((id) => !previousIds.has(id)) };
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
      if (new Set(command.constraints?.map((entry) => entry.id)).size !== (command.constraints?.length ?? 0)) return "Duplicate automatic constraint IDs.";
      if (command.constraints?.some((entry) => sketch.constraints.some((current) => current.id === entry.id) || !constraintGeometryIds(entry).includes(command.geometry.id))) return "Invalid automatic constraint references.";
      sketch.constraints.push(...structuredClone(command.constraints ?? []));
      sketch.dimensions.push(...(command.constraints ?? []).filter((entry) => ["distance", "radius", "diameter", "angle"].includes(entry.kind)).map((entry) => ({ id: `dimension:${entry.id}`, constraintId: entry.id })));
      return true;
    }, command.constraints?.length ? [command.geometry.id] : []);
  });

  bus.registerHandler("set-sketch-construction", async (command: CadCommand) => {
    if (command.type !== "set-sketch-construction") return;
    return edit(command.sketchId, (sketch) => {
      if (command.geometryIds.some((id) => !sketch.geometry.some((entry) => entry.id === id))) return false;
      if (command.geometryIds.every((id) => Boolean(sketch.geometry.find((entry) => entry.id === id)!.construction) === command.construction)) return false;
      for (const entity of sketch.geometry.filter((entry) => command.geometryIds.includes(entry.id))) entity.construction = command.construction;
      return true;
    });
  });

  bus.registerHandler("remove-sketch-geometry", async (command: CadCommand) => {
    if (command.type !== "remove-sketch-geometry") return;
    return edit(command.sketchId, (sketch) => {
      if (!sketch.geometry.some((entry) => entry.id === command.geometryId)) return false;
      sketch.constraints = sketch.constraints.filter((entry) => !constraintGeometryIds(entry).includes(command.geometryId));
      sketch.dimensions = sketch.dimensions.filter((entry) => sketch.constraints.some((constraint) => constraint.id === entry.constraintId));
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
      if (command.behavior === "solve-connected" && !["line", "polyline"].includes(sketch.geometry[index].kind)) return "Connected-point editing currently supports lines and polylines.";
      const updated = editSketchPointGeometry(sketch.geometry[index], command.point.pointId, command.position);
      if (!updated || JSON.stringify(updated) === JSON.stringify(sketch.geometry[index])) return false;
      sketch.geometry[index] = updated;
      return true;
    }, command.behavior === "solve-connected" ? [] : [command.point.geometryId], command.behavior === "solve-connected" ? [command.point] : []);
  });

  bus.registerHandler("move-sketch-segment", async (command: CadCommand) => {
    if (command.type !== "move-sketch-segment") return;
    return edit(command.sketchId, (sketch) => {
      const index = sketch.geometry.findIndex((entry) => entry.id === command.geometryId);
      if (index < 0 || Math.hypot(...command.delta) <= SKETCH_TOLERANCE) return false;
      const entity = sketch.geometry[index];
      const edited=editSketchSegmentGeometry(entity,command.segmentId,command.delta);
      if(!edited)return entity.kind==="rectangle"?"Rectangle edges cannot cross their opposite edge.":false;
      sketch.geometry[index]=edited;
      return true;
    }, [command.geometryId]);
  });

  bus.registerHandler("transform-sketch-geometry", async (command: CadCommand) => {
    if (command.type !== "transform-sketch-geometry") return;
    return edit(command.sketchId, (sketch) => {
      if (!command.geometryIds.every((id) => sketch.geometry.some((entry) => entry.id === id))) return "Select geometry in this sketch.";
      if (!command.translation.some((value) => Math.abs(value) > SKETCH_TOLERANCE) && Math.abs(command.angle) < 1e-12 && Math.abs(command.scale - 1) < 1e-12) return false;
      sketch.geometry = sketch.geometry.map((entry) => command.geometryIds.includes(entry.id) ? transformSketchGeometry(entry, command.translation, command.center, command.angle, command.scale) : entry);
      return true;
    }, command.geometryIds);
  });

  bus.registerHandler("duplicate-sketch-geometry", async (command: CadCommand) => {
    if (command.type !== "duplicate-sketch-geometry") return;
    return edit(command.sketchId, (sketch) => {
      if (!command.geometryIds.every((id) => sketch.geometry.some((entry) => entry.id === id))) return "Select geometry in this sketch.";
      const ids = new Map<string, string>();
      const remap = (id: string) => { if (!ids.has(id)) ids.set(id, `copy-${crypto.randomUUID()}`); return ids.get(id)!; };
      const mapIds = (value: unknown, key = ""): unknown => {
        if (typeof value === "string" && (key === "id" || key.endsWith("Id"))) return remap(value);
        if (Array.isArray(value)) return value.map((entry) => typeof entry === "string" && key.endsWith("Ids") ? remap(entry) : mapIds(entry));
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapIds(entry, key)]));
        return value;
      };
      const copies = sketch.geometry.filter((entry) => command.geometryIds.includes(entry.id)).map((entry) => {
        const copy = mapIds(transformSketchGeometry(entry, command.offset, [0, 0], 0, 1)) as SketchGeometry;
        // Circle radius handles are implicit, but can be referenced by constraints.
        if (entry.kind === "circle") ids.set(`${entry.id}:radius:0`, `${copy.id}:radius:0`);
        return copy;
      });
      const constraints = sketch.constraints.filter((entry) => constraintGeometryIds(entry).every((id) => command.geometryIds.includes(id))).map((entry) => {
        const copy = mapIds(entry) as typeof entry;
        if (copy.kind === "fixed-point") copy.value = [copy.value[0] + command.offset[0], copy.value[1] + command.offset[1]];
        return copy;
      });
      const dimensions = sketch.dimensions.filter((entry) => constraints.some((copy) => copy.id === ids.get(entry.constraintId))).map((entry) => mapIds(entry) as typeof entry);
      sketch.geometry.push(...copies); sketch.constraints.push(...constraints); sketch.dimensions.push(...dimensions);
      return true;
    });
  });

  bus.registerHandler("offset-sketch-geometry", async (command: CadCommand) => {
    if (command.type !== "offset-sketch-geometry") return;
    return edit(command.sketchId, (sketch) => {
      const entity = sketch.geometry.find((entry) => entry.id === command.geometryId);
      if (!entity) return false;
      const params = offsetDrawingParams(entity.kind, sketchGeometryToDrawingParams(sketch, entity), command.distance * (command.side === "right" ? -1 : 1));
      const geometry = params && drawingToSketchGeometry(sketch, entity.kind, params, `offset-${crypto.randomUUID()}`);
      if (!geometry) return "Offset would collapse or intersect the sketch geometry. Reduce the distance or change side.";
      sketch.geometry.push(geometry);
      return true;
    });
  });

  for (const mode of ["trim", "extend"] as const) bus.registerHandler(`${mode}-sketch-geometry`, async (command: CadCommand) => {
    if (command.type !== "trim-sketch-geometry" && command.type !== "extend-sketch-geometry") return;
    return edit(command.sketchId, (sketch) => {
      if (![command.targetId, command.cutterId].every((id) => sketch.geometry.some((entry) => entry.id === id))) return "Select a target and boundary in the same sketch.";
      const target = document.objects[command.targetId], cutter = document.objects[command.cutterId];
      const targetFeature = Object.values(document.features).find((entry) => entry.output === target.id)!;
      const cutterFeature = Object.values(document.features).find((entry) => entry.output === cutter.id)!;
      const result = resolveLineEdit(mode, target, targetFeature, cutter, cutterFeature, command.pickPoint);
      if (!result) return "No valid intersection at the picked segment. Select a crossing boundary.";
      const index = sketch.geometry.findIndex((entry) => entry.id === command.targetId), previous = sketch.geometry[index];
      let replacement = drawingToSketchGeometry(sketch, String(result.params.kind), result.params, previous.id);
      if (!replacement) return "This edit cannot be represented by sketch geometry.";
      if (previous.kind === "line" && replacement.kind === "line") replacement = { ...replacement, startId: previous.startId, endId: previous.endId, segmentId: previous.segmentId };
      if (previous.kind === "arc" && replacement.kind === "arc") replacement = { ...replacement, centerId: previous.centerId, startId: previous.startId, endId: previous.endId, curveId: previous.curveId };
      if (previous.kind === "circle" && replacement.kind === "arc") replacement = { ...replacement, centerId: previous.centerId, curveId: previous.curveId };
      if (previous.kind === "polyline" && replacement.kind === "polyline") {
        if (previous.vertices.length !== replacement.vertices.length && sketch.constraints.some((entry) => constraintGeometryIds(entry).includes(previous.id))) return "Remove constraints on this polyline before changing its vertex count.";
        if (previous.vertices.length === replacement.vertices.length) replacement = { ...replacement, vertices: replacement.vertices.map((vertex, index) => ({ ...vertex, id: previous.vertices[index].id })), segmentIds: previous.segmentIds };
      }
      sketch.geometry[index] = replacement;
      return true;
    }, [command.targetId]);
  });
}
