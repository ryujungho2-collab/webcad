import type { Sketch, SketchConstraint, SketchGeometry, SketchPoint, SketchPointRef, SketchSolveState } from "@agent-webcad/cad-document";
import { CAD_PRECISION, linearToleranceAt, sketchConstraintGeometryIds as constraintGeometryIds, validSketchConstraint } from "@agent-webcad/cad-document";
import { relationAngleTargets, sketchSegment, sketchAngleEdge } from "./sketchRelations";

export const SKETCH_TOLERANCE = CAD_PRECISION.linearTolerance;
export const SKETCH_ANGULAR_TOLERANCE = CAD_PRECISION.angularTolerance;
const MAX_ITERATIONS = 64;

export type SketchSolveResult =
  | { ok: true; sketch: Sketch }
  | { ok: false; reason: string; conflictingConstraintIds: string[] };

/** Transient grip semantics (opposite point, rigid edge, etc.), never document constraints. */
export type SketchMotionRestriction = { geometryId: string; residual: (geometry: SketchGeometry) => number[] };

const pointKey = (reference: SketchPointRef) => `${reference.geometryId}/${reference.pointId}`;
const finitePoint = (point: SketchPoint) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

function translateGeometry(geometry: SketchGeometry, delta: SketchPoint): SketchGeometry {
  const point = (p: SketchPoint): SketchPoint => [p[0]+delta[0],p[1]+delta[1]];
  if(geometry.kind === "line") return {...geometry,start:point(geometry.start),end:point(geometry.end)};
  if(geometry.kind === "polyline") return {...geometry,vertices:geometry.vertices.map(v=>({...v,point:point(v.point)}))};
  if(geometry.kind === "rectangle") return {...geometry,origin:point(geometry.origin)};
  return {...geometry,center:point(geometry.center)};
}

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
      const [u, v] = [[0, 0], [geometry.width, 0], [geometry.width, geometry.height], [0, geometry.height]][corner];
      const c = Math.cos(geometry.angle ?? 0), s = Math.sin(geometry.angle ?? 0);
      return [x + u * c - v * s, y + u * s + v * c];
    }
  }
}

function validateGeometry(geometry: SketchGeometry): boolean {
  if (!geometry.id || !geometryVariables(geometry).every(Number.isFinite) || (geometry.kind === "rectangle" && !Number.isFinite(geometry.angle ?? 0))) return false;
  if (geometry.kind === "line") return Boolean(geometry.startId && geometry.endId && geometry.segmentId && geometry.startId !== geometry.endId && finitePoint(geometry.start) && finitePoint(geometry.end) && Math.hypot(geometry.end[0] - geometry.start[0], geometry.end[1] - geometry.start[1]) > SKETCH_TOLERANCE);
  if (geometry.kind === "polyline") return geometry.vertices.length >= (geometry.closed ? 3 : 2) && new Set(geometry.vertices.map((vertex) => vertex.id)).size === geometry.vertices.length && geometry.vertices.every((vertex) => Boolean(vertex.id) && finitePoint(vertex.point)) && geometry.segmentIds.length === geometry.vertices.length - (geometry.closed ? 0 : 1) && new Set(geometry.segmentIds).size === geometry.segmentIds.length && geometry.vertices.every((vertex, index) => index === 0 && !geometry.closed || Math.hypot(vertex.point[0] - geometry.vertices[(index - 1 + geometry.vertices.length) % geometry.vertices.length].point[0], vertex.point[1] - geometry.vertices[(index - 1 + geometry.vertices.length) % geometry.vertices.length].point[1]) > SKETCH_TOLERANCE);
  if (geometry.kind === "rectangle") return geometry.cornerIds.length === 4 && new Set(geometry.cornerIds).size === 4 && geometry.edgeIds.length === 4 && new Set(geometry.edgeIds).size === 4 && geometry.width > SKETCH_TOLERANCE && geometry.height > SKETCH_TOLERANCE;
  if (geometry.kind === "arc") return Boolean(geometry.centerId && geometry.startId && geometry.endId && geometry.curveId && geometry.radius > SKETCH_TOLERANCE && Math.abs(geometry.endAngle - geometry.startAngle) > SKETCH_ANGULAR_TOLERANCE);
  return geometry.centerId.length > 0 && geometry.curveId.length > 0 && geometry.radius > SKETCH_TOLERANCE;
}

function constraintResidual(constraint: SketchConstraint, geometry: Map<string, SketchGeometry>, angleTargets = relationAngleTargets([constraint], geometry)): number[] | null {
  const point = (reference: SketchPointRef) => {
    const entity = geometry.get(reference.geometryId);
    return entity ? sketchPoint(entity, reference.pointId) : null;
  };
  const segment = (ref: import("@agent-webcad/cad-document").SketchSegmentRef) => sketchSegment(geometry.get(ref.geometryId), ref);
  const circle = (id: string, full = false) => { const g = geometry.get(id); return g?.kind === "circle" || !full && g?.kind === "arc" ? g as Extract<SketchGeometry, {kind:"circle"|"arc"}> : null; };
  const signedDistance = (p: SketchPoint, edge: [SketchPoint, SketchPoint]) => { const dx = edge[1][0] - edge[0][0], dy = edge[1][1] - edge[0][1]; return (dx * (p[1] - edge[0][1]) - dy * (p[0] - edge[0][0])) / Math.max(SKETCH_TOLERANCE, Math.hypot(dx, dy)); };
  if ("firstSegment" in constraint) {
    const a = segment(constraint.firstSegment), b = segment(constraint.secondSegment); if (!a || !b) return null;
    const ax = a[1][0] - a[0][0], ay = a[1][1] - a[0][1], bx = b[1][0] - b[0][0], by = b[1][1] - b[0][1];
    if (constraint.kind === "equal-length") return [Math.hypot(ax, ay) - Math.hypot(bx, by)];
    const delta = Math.atan2(ax * by - ay * bx, ax * bx + ay * by) - angleTargets.get(constraint.id)!;
    return [Math.atan2(Math.sin(delta), Math.cos(delta))];
  }
  if ("firstCurveId" in constraint) {
    const a = circle(constraint.firstCurveId, constraint.kind === "tangent-circles"), b = circle(constraint.secondCurveId, constraint.kind === "tangent-circles"); if (!a || !b) return null;
    if (constraint.kind === "concentric") return [b.center[0] - a.center[0], b.center[1] - a.center[1]];
    if (constraint.kind === "equal-radius") return [a.radius - b.radius];
    if (constraint.kind !== "tangent-circles") return null;
    const contact = constraint.contact === "external" ? a.radius + b.radius : Math.abs(a.radius - b.radius);
    return [Math.hypot(b.center[0] - a.center[0], b.center[1] - a.center[1]) - contact];
  }
  if (constraint.kind === "tangent-line") { const line = segment(constraint.line), c = circle(constraint.curveId, true); return line && c ? [signedDistance(c.center, line) - constraint.side * c.radius] : null; }
  if (constraint.kind === "point-on-line") { const p = point(constraint.point), line = segment(constraint.line); return p && line ? [signedDistance(p, line)] : null; }
  if (constraint.kind === "point-on-circle") { const p = point(constraint.point), c = circle(constraint.curveId, true); return p && c ? [Math.hypot(p[0] - c.center[0], p[1] - c.center[1]) - c.radius] : null; }
  if (constraint.kind === "symmetric") {
    const a = point(constraint.first), b = point(constraint.second), axis = segment(constraint.axis); if (!a || !b || !axis) return null;
    const dx = axis[1][0] - axis[0][0], dy = axis[1][1] - axis[0][1], length = Math.max(SKETCH_TOLERANCE, Math.hypot(dx, dy));
    return [signedDistance([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], axis), ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / length];
  }
  if (constraint.kind === "radius" || constraint.kind === "diameter") {
    const circle = geometry.get(constraint.geometryId);
    return circle && (circle.kind === "circle" || circle.kind === "arc") ? [(constraint.kind === "diameter" ? 2 : 1) * circle.radius - constraint.value] : null;
  }
  if (constraint.kind === "angle") {
    const first = sketchAngleEdge(geometry.get(constraint.firstLineId), constraint.firstSegmentId);
    const second = sketchAngleEdge(geometry.get(constraint.secondLineId), constraint.secondSegmentId);
    if (!first || !second) return null;
    const ax = first[1][0] - first[0][0], ay = first[1][1] - first[0][1];
    const bx = second[1][0] - second[0][0], by = second[1][1] - second[0][1];
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
    if (!validSketchConstraint(constraint)) return "Invalid constraint definition.";
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

/** Freedom of this grip, including its operation anchors; unrelated free entities do not count. */
export function sketchGripFreedom(input: Sketch, motion: SketchMotionRestriction, pointOf: (geometry: SketchGeometry) => SketchPoint) {
  const ids=new Set([motion.geometryId]);let changed=true;
  while(changed){changed=false;for(const c of input.constraints){const linked=constraintGeometryIds(c);if(linked.some(id=>ids.has(id)))for(const id of linked)if(!ids.has(id)){ids.add(id);changed=true;}}}
  const originals=input.geometry.filter(g=>ids.has(g.id)),source=originals.find(g=>g.id===motion.geometryId)!;
  const origin=pointOf(source),entities=originals.map(g=>translateGeometry(g,[-origin[0],-origin[1]]));
  const constraints=input.constraints.filter(c=>constraintGeometryIds(c).every(id=>ids.has(id))).map(c=>c.kind==="fixed-point"?{...c,value:[c.value[0]-origin[0],c.value[1]-origin[1]] as SketchPoint}:c);
  const lengths=entities.map(g=>geometryVariables(g).length),values=entities.flatMap(geometryVariables);
  const angleTargets=relationAngleTargets(constraints,new Map(entities.map(g=>[g.id,g])));
  // Express angular columns as comparable physical travel, so a large arc's
  // tangential speed cannot hide its independent radial degree of freedom.
  const scales=entities.flatMap(g=>g.kind==="arc"?[1,1,1,1/Math.max(1,g.radius),1/Math.max(1,g.radius)]:geometryVariables(g).map(()=>1));
  const map=(v:number[])=>{let offset=0;return new Map(entities.map((g,i)=>{const result=withVariables(g,v.slice(offset,offset+lengths[i]));offset+=lengths[i];return [g.id,result];}));};
  const evaluate=(v:number[])=>{const geometry=map(v);return [...constraints.flatMap(c=>constraintResidual(c,geometry,angleTargets)??[]),...motion.residual(translateGeometry(geometry.get(source.id)!,origin))];};
  const rows=evaluate(values).map(()=>new Array<number>(values.length).fill(0)),target=[new Array<number>(values.length).fill(0),new Array<number>(values.length).fill(0)];
  for(let column=0;column<values.length;column++){
    const step=scales[column]!==1?1e-5:1e-5*Math.max(1,Math.abs(values[column])),plus=values.slice(),minus=values.slice();plus[column]+=step;minus[column]-=step;
    const a=evaluate(plus),b=evaluate(minus),pa=pointOf(map(plus).get(source.id)!),pb=pointOf(map(minus).get(source.id)!);
    rows.forEach((row,i)=>row[column]=(a[i]-b[i])/(2*step)*scales[column]);target.forEach((row,i)=>row[column]=(pa[i]-pb[i])/(2*step)*scales[column]);
  }
  const basis:number[][]=[];
  for(const row of rows){const norm=Math.hypot(...row);if(norm<1e-12)continue;const v=row.map(x=>x/norm);
    for(let pass=0;pass<2;pass++)for(const unit of basis){const dot=v.reduce((sum,x,i)=>sum+x*unit[i],0);v.forEach((_,i)=>v[i]-=dot*unit[i]);}
    const length=Math.hypot(...v);if(length>1e-7)basis.push(v.map(x=>x/length));
  }
  const free=target.map(row=>{const v=row.slice();for(const unit of basis){const dot=row.reduce((sum,x,i)=>sum+x*unit[i],0);v.forEach((_,i)=>v[i]-=dot*unit[i]);}return v;});
  const dot=(a:number[],b:number[])=>a.reduce((sum,x,i)=>sum+x*b[i],0),xx=dot(free[0],free[0]),yy=dot(free[1],free[1]),xy=dot(free[0],free[1]);
  const discriminant=Math.hypot(xx-yy,2*xy),large=(xx+yy+discriminant)/2,small=Math.max(0,(xx+yy-discriminant)/2),cutoff=1e-8*Math.max(1,large);
  const dof:0|1|2=large<cutoff?0:small<cutoff?1:2;
  const angle=.5*Math.atan2(2*xy,xx-yy),direction:SketchPoint=[Math.cos(angle),Math.sin(angle)];
  return {dof,direction,constraintIds:constraints.map(c=>c.id)};
}

/** Pure, deterministic solve. The caller commits only an `ok` result. */
export function solveSketch(input: Sketch, motion?: SketchMotionRestriction): SketchSolveResult {
  const sketch = structuredClone(input);
  const invalid = validateSketch(sketch);
  if (invalid) return { ok: false, reason: invalid, conflictingConstraintIds: [] };
  const tolerance = linearToleranceAt(...sketch.geometry.flatMap(geometryVariables));
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
  for (const [componentId, originalEntities] of components) {
    const first = originalEntities[0];
    const origin: SketchPoint = first.kind === "line" ? first.start : first.kind === "polyline" ? first.vertices[0].point : first.kind === "rectangle" ? first.origin : first.center;
    const entities = originalEntities.map(entity=>translateGeometry(entity,[-origin[0],-origin[1]]));
    const constraints = sketch.constraints.filter((entry) => root(constraintGeometryIds(entry)[0]) === componentId)
      .map(entry=>entry.kind === "fixed-point" ? {...entry,value:[entry.value[0]-origin[0],entry.value[1]-origin[1]] as SketchPoint} : entry);
    const lengths = entities.map((entry) => geometryVariables(entry).length);
    const initial = entities.flatMap(geometryVariables);
    const angleTargets = relationAngleTargets(constraints, new Map(entities.map(g=>[g.id,g])));
    variableCount += initial.length;
    const restriction = motion && entities.some(g=>g.id===motion.geometryId) ? motion : undefined;
    if (!constraints.length && !restriction) continue;
    const evaluate = (values: number[]) => {
      const geometry = new Map<string, SketchGeometry>();
      let offset = 0;
      entities.forEach((entry, index) => {
        geometry.set(entry.id, withVariables(entry, values.slice(offset, offset + lengths[index])));
        offset += lengths[index];
      });
      return [...constraints.flatMap((entry) => (constraintResidual(entry, geometry, angleTargets) ?? []).map(value=>
        ["angle", "parallel", "perpendicular"].includes(entry.kind) ? value*tolerance/SKETCH_ANGULAR_TOLERANCE : value)),
        ...(restriction ? restriction.residual(translateGeometry(geometry.get(restriction.geometryId)!,origin)) : [])];
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
    for (let iteration = 0; iteration < MAX_ITERATIONS && Math.max(...residual.map(Math.abs)) > tolerance; iteration += 1) {
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
    if (!Number.isFinite(error) || error > tolerance) {
      let offset = 0;
      const conflicts = constraints.filter((constraint) => {
        const count = constraintResidual(constraint, new Map(entities.map(g=>[g.id,g])), angleTargets)!.length;
        const failed = residual.slice(offset, offset + count).some((value) => Math.abs(value) > tolerance);
        offset += count;
        return failed;
      }).map((constraint) => constraint.id);
      return { ok: false, reason: "Sketch constraints conflict or did not converge.", conflictingConstraintIds: conflicts };
    }
    const solved = new Map<string, SketchGeometry>();
    let offset = 0;
    entities.forEach((entry, index) => {
      solved.set(entry.id, translateGeometry(withVariables(entry, values.slice(offset, offset + lengths[index])),origin));
      offset += lengths[index];
    });
    if ([...solved.values()].some((entry) => !validateGeometry(entry))) return { ok: false, reason: "Solved geometry is degenerate.", conflictingConstraintIds: constraints.map((entry) => entry.id) };
    const collapsedContacts = constraints.filter(c=>c.kind === "tangent-circles" && c.contact === "internal" && Math.abs((solved.get(c.firstCurveId) as {radius:number}).radius - (solved.get(c.secondCurveId) as {radius:number}).radius) <= tolerance);
    if (collapsedContacts.length) return { ok: false, reason: "Internal tangency requires distinct circle radii.", conflictingConstraintIds: collapsedContacts.map(c=>c.id) };
    rank += matrixRank(jacobian(values, residual), values.length);
    sketch.geometry = sketch.geometry.map((entry) => solved.get(entry.id) ?? entry);
  }
  const state: SketchSolveState = {
    status: variableCount - rank === 0 ? "fully-constrained" : "under-constrained",
    degreesOfFreedom: variableCount - rank,
    rank,
    residual: maximumResidual,
    tolerance,
    angularTolerance: SKETCH_ANGULAR_TOLERANCE,
  };
  sketch.solveState = state;
  return { ok: true, sketch };
}
