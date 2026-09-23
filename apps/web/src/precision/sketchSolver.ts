import type { Sketch, SketchConstraint, SketchGeometry, SketchPoint, SketchPointRef, SketchSolveState } from "@agent-webcad/cad-document";

export const SKETCH_TOLERANCE = 1e-6; // internal millimetres
const MAX_ITERATIONS = 64;

export type SketchSolveResult =
  | { ok: true; sketch: Sketch }
  | { ok: false; reason: string; conflictingConstraintIds: string[] };

const pointKey = (reference: SketchPointRef) => `${reference.geometryId}/${reference.pointId}`;
const finitePoint = (point: SketchPoint) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

function geometryVariables(geometry: SketchGeometry): number[] {
  switch (geometry.kind) {
    case "line": return [...geometry.start, ...geometry.end];
    case "polyline": return geometry.vertices.flatMap((vertex) => vertex.point);
    case "rectangle": return [...geometry.origin, geometry.width, geometry.height];
    case "circle": return [...geometry.center, geometry.radius];
    case "arc": return [...geometry.center, geometry.radius, geometry.startAngle, geometry.endAngle];
  }
}

function withVariables(geometry: SketchGeometry, values: number[]): SketchGeometry {
  switch (geometry.kind) {
    case "line": return { ...geometry, start: [values[0], values[1]], end: [values[2], values[3]] };
    case "polyline": return { ...geometry, vertices: geometry.vertices.map((vertex, index) => ({ ...vertex, point: [values[index * 2], values[index * 2 + 1]] })) };
    case "rectangle": return { ...geometry, origin: [values[0], values[1]], width: values[2], height: values[3] };
    case "circle": return { ...geometry, center: [values[0], values[1]], radius: values[2] };
    case "arc": return { ...geometry, center: [values[0], values[1]], radius: values[2], startAngle: values[3], endAngle: values[4] };
  }
}

export function sketchPoint(geometry: SketchGeometry, pointId: string): SketchPoint | null {
  switch (geometry.kind) {
    case "line": return pointId === geometry.startId ? geometry.start : pointId === geometry.endId ? geometry.end : null;
    case "polyline": return geometry.vertices.find((vertex) => vertex.id === pointId)?.point ?? null;
    case "circle": return pointId === geometry.centerId ? geometry.center : pointId === `${geometry.id}:radius:0` ? [geometry.center[0] + geometry.radius, geometry.center[1]] : null;
    case "arc": return pointId === geometry.centerId ? geometry.center : pointId === geometry.startId ? [geometry.center[0] + geometry.radius * Math.cos(geometry.startAngle), geometry.center[1] + geometry.radius * Math.sin(geometry.startAngle)] : pointId === geometry.endId ? [geometry.center[0] + geometry.radius * Math.cos(geometry.endAngle), geometry.center[1] + geometry.radius * Math.sin(geometry.endAngle)] : null;
    case "rectangle": {
      const corner = geometry.cornerIds.indexOf(pointId);
      if (corner < 0) return null;
      const [x, y] = geometry.origin;
      return [[x, y], [x + geometry.width, y], [x + geometry.width, y + geometry.height], [x, y + geometry.height]][corner] as SketchPoint;
    }
  }
}

function validateGeometry(geometry: SketchGeometry): boolean {
  if (!geometry.id || !geometryVariables(geometry).every(Number.isFinite)) return false;
  if (geometry.kind === "line") return Boolean(geometry.startId && geometry.endId && geometry.segmentId && geometry.startId !== geometry.endId && finitePoint(geometry.start) && finitePoint(geometry.end) && Math.hypot(geometry.end[0] - geometry.start[0], geometry.end[1] - geometry.start[1]) > SKETCH_TOLERANCE);
  if (geometry.kind === "polyline") return geometry.vertices.length >= (geometry.closed ? 3 : 2) && new Set(geometry.vertices.map((vertex) => vertex.id)).size === geometry.vertices.length && geometry.vertices.every((vertex) => Boolean(vertex.id) && finitePoint(vertex.point)) && geometry.segmentIds.length === geometry.vertices.length - (geometry.closed ? 0 : 1) && new Set(geometry.segmentIds).size === geometry.segmentIds.length && geometry.vertices.every((vertex, index) => index === 0 && !geometry.closed || Math.hypot(vertex.point[0] - geometry.vertices[(index - 1 + geometry.vertices.length) % geometry.vertices.length].point[0], vertex.point[1] - geometry.vertices[(index - 1 + geometry.vertices.length) % geometry.vertices.length].point[1]) > SKETCH_TOLERANCE);
  if (geometry.kind === "rectangle") return geometry.cornerIds.length === 4 && new Set(geometry.cornerIds).size === 4 && geometry.edgeIds.length === 4 && new Set(geometry.edgeIds).size === 4 && geometry.width > SKETCH_TOLERANCE && geometry.height > SKETCH_TOLERANCE;
  if (geometry.kind === "arc") return Boolean(geometry.centerId && geometry.startId && geometry.endId && geometry.curveId && geometry.radius > SKETCH_TOLERANCE && Math.abs(geometry.endAngle - geometry.startAngle) > SKETCH_TOLERANCE);
  return geometry.centerId.length > 0 && geometry.curveId.length > 0 && geometry.radius > SKETCH_TOLERANCE;
}

function constraintGeometryIds(constraint: SketchConstraint): string[] {
  if (constraint.kind === "fixed-point") return [constraint.point.geometryId];
  if (constraint.kind === "angle") return [constraint.firstLineId, constraint.secondLineId];
  if (constraint.kind === "radius" || constraint.kind === "diameter") return [constraint.geometryId];
  if ("first" in constraint) return [...new Set([constraint.first.geometryId, constraint.second.geometryId])];
  return [];
}

function constraintResidual(constraint: SketchConstraint, geometry: Map<string, SketchGeometry>): number[] | null {
  const point = (reference: SketchPointRef) => {
    const entity = geometry.get(reference.geometryId);
    return entity ? sketchPoint(entity, reference.pointId) : null;
  };
  if (constraint.kind === "radius" || constraint.kind === "diameter") {
    const circle = geometry.get(constraint.geometryId);
    return circle && (circle.kind === "circle" || circle.kind === "arc") ? [(constraint.kind === "diameter" ? 2 : 1) * circle.radius - constraint.value] : null;
  }
  if (constraint.kind === "angle") {
    const first = geometry.get(constraint.firstLineId);
    const second = geometry.get(constraint.secondLineId);
    if (first?.kind !== "line" || second?.kind !== "line") return null;
    const ax = first.end[0] - first.start[0], ay = first.end[1] - first.start[1];
    const bx = second.end[0] - second.start[0], by = second.end[1] - second.start[1];
    if (Math.hypot(ax, ay) <= SKETCH_TOLERANCE || Math.hypot(bx, by) <= SKETCH_TOLERANCE) return null;
    const angle = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    const delta = angle - constraint.value;
    return [Math.atan2(Math.sin(delta), Math.cos(delta))];
  }
  if (constraint.kind === "fixed-point") {
    const actual = point(constraint.point);
    return actual ? [actual[0] - constraint.value[0], actual[1] - constraint.value[1]] : null;
  }
  if (!("first" in constraint)) return null;
  const first = point(constraint.first);
  const second = point(constraint.second);
  if (!first || !second) return null;
  const dx = second[0] - first[0];
  const dy = second[1] - first[1];
  switch (constraint.kind) {
    case "coincident": return [dx, dy];
    case "horizontal": return [dy];
    case "vertical": return [dx];
    case "distance": return [Math.hypot(dx, dy) - constraint.value];
  }
}

function validateSketch(sketch: Sketch): string | null {
  if (!sketch.id || !sketch.layerId || !["XY", "XZ", "YZ"].includes(sketch.workPlane)) return "Invalid sketch identity, layer or work plane.";
  const geometry = new Map(sketch.geometry.map((entry) => [entry.id, entry]));
  if (geometry.size !== sketch.geometry.length || !sketch.geometry.every(validateGeometry)) return "Invalid or duplicate sketch geometry.";
  if (new Set(sketch.constraints.map((entry) => entry.id)).size !== sketch.constraints.length) return "Duplicate constraint ID.";
  const dimensional = new Set(sketch.constraints.filter((entry) => ["distance", "radius", "diameter", "angle"].includes(entry.kind)).map((entry) => entry.id));
  if (new Set(sketch.dimensions.map((entry) => entry.id)).size !== sketch.dimensions.length ||
    new Set(sketch.dimensions.map((entry) => entry.constraintId)).size !== sketch.dimensions.length ||
    sketch.dimensions.some((entry) => !dimensional.has(entry.constraintId))) return "Invalid driving dimension reference.";
  for (const constraint of sketch.constraints) {
    if (!constraint.id || !constraintGeometryIds(constraint).every((id) => geometry.has(id))) return `Invalid constraint ${constraint.id}.`;
    if ("value" in constraint && (typeof constraint.value === "number" ? !Number.isFinite(constraint.value) || (constraint.kind === "angle" ? Math.abs(constraint.value) > Math.PI : constraint.value <= SKETCH_TOLERANCE) : !finitePoint(constraint.value))) return `Invalid value for ${constraint.id}.`;
    if (!constraintResidual(constraint, geometry)) return `Invalid topology reference in ${constraint.id}.`;
    if ("first" in constraint && pointKey(constraint.first) === pointKey(constraint.second)) return `Constraint ${constraint.id} references one point twice.`;
  }
  return null;
}

function linearSolve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const rows = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-14) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let c = column; c <= n; c += 1) rows[column][c] /= divisor;
    for (let row = column + 1; row < n; row += 1) {
      const factor = rows[row][column];
      for (let c = column; c <= n; c += 1) rows[row][c] -= factor * rows[column][c];
    }
  }
  const result = new Array<number>(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let value = rows[row][n];
    for (let c = row + 1; c < n; c += 1) value -= rows[row][c] * result[c];
    result[row] = value;
  }
  return result;
}

function matrixRank(rows: number[][], columns: number): number {
  const basis: number[][] = [];
  for (const source of rows) {
    const vector = source.slice();
    for (const unit of basis) {
      const projection = vector.reduce((sum, value, index) => sum + value * unit[index], 0);
      for (let index = 0; index < columns; index += 1) vector[index] -= projection * unit[index];
    }
    const magnitude = Math.hypot(...vector);
    if (magnitude > 1e-7) basis.push(vector.map((value) => value / magnitude));
  }
  return basis.length;
}

/** Pure, deterministic solve. The caller commits only an `ok` result. */
export function solveSketch(input: Sketch): SketchSolveResult {
  const sketch = structuredClone(input);
  const invalid = validateSketch(sketch);
  if (invalid) return { ok: false, reason: invalid, conflictingConstraintIds: [] };
  const parent = new Map(sketch.geometry.map((entry) => [entry.id, entry.id]));
  const root = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return id;
    const resolved = root(current);
    parent.set(id, resolved);
    return resolved;
  };
  for (const constraint of sketch.constraints) {
    const ids = constraintGeometryIds(constraint);
    for (const id of ids.slice(1)) parent.set(root(id), root(ids[0]));
  }
  const components = new Map<string, SketchGeometry[]>();
  for (const geometry of sketch.geometry) {
    const key = root(geometry.id);
    components.set(key, [...(components.get(key) ?? []), geometry]);
  }
  let rank = 0;
  let variableCount = 0;
  let maximumResidual = 0;
  for (const [componentId, entities] of components) {
    const constraints = sketch.constraints.filter((entry) => root(constraintGeometryIds(entry)[0]) === componentId);
    const lengths = entities.map((entry) => geometryVariables(entry).length);
    const initial = entities.flatMap(geometryVariables);
    variableCount += initial.length;
    if (!constraints.length) continue;
    const evaluate = (values: number[]) => {
      const geometry = new Map<string, SketchGeometry>();
      let offset = 0;
      entities.forEach((entry, index) => {
        geometry.set(entry.id, withVariables(entry, values.slice(offset, offset + lengths[index])));
        offset += lengths[index];
      });
      return constraints.flatMap((entry) => constraintResidual(entry, geometry) ?? []);
    };
    const jacobian = (values: number[], residual: number[]) => {
      const rows = residual.map(() => new Array<number>(values.length).fill(0));
      for (let column = 0; column < values.length; column += 1) {
        const shifted = values.slice();
        const step = 1e-5 * Math.max(1, Math.abs(values[column]));
        shifted[column] += step;
        const changed = evaluate(shifted);
        residual.forEach((value, row) => { rows[row][column] = (changed[row] - value) / step; });
      }
      return rows;
    };
    let values = initial.slice();
    let residual = evaluate(values);
    let damping = 1e-4;
    for (let iteration = 0; iteration < MAX_ITERATIONS && Math.max(...residual.map(Math.abs)) > SKETCH_TOLERANCE; iteration += 1) {
      const rows = jacobian(values, residual);
      const normal = values.map((_, row) => values.map((__, column) =>
        rows.reduce((sum, equation) => sum + equation[row] * equation[column], row === column ? damping : 0)));
      const rhs = values.map((_, column) => -rows.reduce((sum, equation, row) => sum + equation[column] * residual[row], 0));
      const delta = linearSolve(normal, rhs);
      if (!delta) break;
      const candidate = values.map((value, index) => value + delta[index]);
      const next = evaluate(candidate);
      const oldError = residual.reduce((sum, value) => sum + value * value, 0);
      const newError = next.reduce((sum, value) => sum + value * value, 0);
      if (newError < oldError) { values = candidate; residual = next; damping = Math.max(1e-10, damping / 4); }
      else damping = Math.min(1e12, damping * 8);
      if (Math.max(...delta.map(Math.abs)) < 1e-10 && newError >= oldError) break;
    }
    const error = Math.max(...residual.map(Math.abs));
    maximumResidual = Math.max(maximumResidual, error);
    if (!Number.isFinite(error) || error > SKETCH_TOLERANCE) {
      let offset = 0;
      const conflicts = constraints.filter((constraint) => {
        const count = constraint.kind === "coincident" || constraint.kind === "fixed-point" ? 2 : 1;
        const failed = residual.slice(offset, offset + count).some((value) => Math.abs(value) > SKETCH_TOLERANCE);
        offset += count;
        return failed;
      }).map((constraint) => constraint.id);
      return { ok: false, reason: "Sketch constraints conflict or did not converge.", conflictingConstraintIds: conflicts };
    }
    const solved = new Map<string, SketchGeometry>();
    let offset = 0;
    entities.forEach((entry, index) => {
      solved.set(entry.id, withVariables(entry, values.slice(offset, offset + lengths[index])));
      offset += lengths[index];
    });
    if ([...solved.values()].some((entry) => !validateGeometry(entry))) return { ok: false, reason: "Solved geometry is degenerate.", conflictingConstraintIds: constraints.map((entry) => entry.id) };
    rank += matrixRank(jacobian(values, residual), values.length);
    sketch.geometry = sketch.geometry.map((entry) => solved.get(entry.id) ?? entry);
  }
  const state: SketchSolveState = {
    status: variableCount - rank === 0 ? "fully-constrained" : "under-constrained",
    degreesOfFreedom: variableCount - rank,
    rank,
    residual: maximumResidual,
    tolerance: SKETCH_TOLERANCE,
  };
  sketch.solveState = state;
  return { ok: true, sketch };
}
