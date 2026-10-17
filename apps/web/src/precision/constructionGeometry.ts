import { linearToleranceAt, type CadConstructionDefinition, type CadDocument, type CadFeature } from "@agent-webcad/cad-document";
import { type WorldDrawingGeometry } from "./worldGeometry";
import { drawingReferenceGeometry } from "./drawingReference";
import { WORK_PLANES, planeToWorld, worldToPlane, type Vec3, type WorkPlaneId } from "./workPlane";

import {circularIntersections,pointOnCircularDomain} from "./circularIntersection";

type Vec2 = [number, number];
export type LinearDomain = "line" | "infinite-line" | "ray";
export const linearParameterAllowed = (kind: LinearDomain, t: number, tolerance = 1e-9) => kind === "infinite-line" || t >= -tolerance && (kind === "ray" || t <= 1 + tolerance);

/** Projection-based roots avoid subtracting large survey-coordinate quadratics.
 * Branch is signed along the authored line direction, never a candidate index. */
export function linearCircleBranches(a: Vec2, b: Vec2, center: Vec2, radius: number, kind: LinearDomain) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy), tolerance = linearToleranceAt(...a, ...b, ...center, radius);
  if (length <= tolerance || !(radius > 0)) throw new Error("Degenerate linear or circle source.");
  const ux = dx / length, uy = dy / length, cx = center[0] - a[0], cy = center[1] - a[1];
  const along = cx * ux + cy * uy, perpendicular = cx * uy - cy * ux;
  let square = (radius - Math.abs(perpendicular)) * (radius + Math.abs(perpendicular));
  if (square < -tolerance * Math.max(1, radius) * 2) return [];
  square = Math.max(0, square);
  const half = Math.sqrt(square);
  return (["negative", "positive"] as const).flatMap(branch => {
    const offset = along + (branch === "negative" ? -half : half), t = offset / length;
    return linearParameterAllowed(kind, t, tolerance / length) ? [{ branch, point: [a[0] + ux * offset, a[1] + uy * offset] as Vec2, t }] : [];
  });
}
export function intersectLinear(a: Vec2, b: Vec2, firstKind: LinearDomain, c: Vec2, d: Vec2, secondKind: LinearDomain): Vec2 | null {
  const x = b[0] - a[0], y = b[1] - a[1], u = d[0] - c[0], v = d[1] - c[1], determinant = x * v - y * u;
  if (Math.abs(determinant) <= 1e-10 * Math.hypot(x, y) * Math.hypot(u, v)) return null;
  const t = ((c[0] - a[0]) * v - (c[1] - a[1]) * u) / determinant, s = ((c[0] - a[0]) * y - (c[1] - a[1]) * x) / determinant;
  return linearParameterAllowed(firstKind, t) && linearParameterAllowed(secondKind, s) ? [a[0] + t * x, a[1] + t * y] : null;
}

export function evaluateConstruction(document: CadDocument, definition: CadConstructionDefinition, planeId: WorkPlaneId, features = new Map(Object.values(document.features).map(f => [f.output, f]))): Record<string, unknown> {
  const plane = WORK_PLANES[planeId], sources: WorldDrawingGeometry[] = [];
  const source = (id: string, role?: "segment" | "first" | "second") => {
    const f = features.get(id), o = document.objects[id], geometry = f && o && drawingReferenceGeometry(o, f, role ? definition.elements?.[role] : undefined);
    if (!geometry || !geometry.planeAligned || geometry.workPlane !== planeId) throw new Error(`Construction source ${id} is missing or on another work plane.`);
    sources.push(geometry); return geometry;
  };
  const point = (g: WorldDrawingGeometry) => { if (g.kind !== "point" || g.points?.length !== 1) throw new Error("Select independent or derived points."); return g.points[0]; };
  const linear = (g: WorldDrawingGeometry) => {
    if (!["line", "infinite-line", "ray"].includes(g.kind) || g.points?.length !== 2) throw new Error("Select a straight segment, infinite line or ray.");
    if (Math.hypot(...g.points[1].map((v, i) => v - g.points![0][i])) <= linearToleranceAt(...g.points.flat())) throw new Error("Coincident source points cannot define a line.");
    return g.points as [Vec3, Vec3];
  };
  let result: Record<string, unknown>;
  if (["segment", "line-through", "ray-through"].includes(definition.operation) && "firstId" in definition) {
    const a = point(source(definition.firstId, "first")), b = point(source(definition.secondId, "second"));
    if (Math.hypot(...b.map((v, i) => v - a[i])) <= linearToleranceAt(...a, ...b)) throw new Error("Coincident source points cannot define a line.");
    result = { kind: definition.operation === "segment" ? "line" : definition.operation === "ray-through" ? "ray" : "infinite-line", points: [a, b] };
  } else if (definition.operation === "midpoint" || definition.operation === "perpendicular-bisector") {
    const segment = source(definition.segmentId, "segment"); if (segment.kind !== "line") throw new Error("A midpoint or bisector requires a finite segment.");
    const [a, b] = linear(segment), midpoint = a.map((v, i) => v + (b[i] - v) / 2) as Vec3;
    if (definition.operation === "midpoint") result = { kind: "point", points: [midpoint] };
    else {
      const m = point(source(definition.midpointId));
      if (Math.hypot(...m.map((v, i) => v - midpoint[i])) > linearToleranceAt(...a, ...b, ...m)) throw new Error("The selected midpoint does not bisect this segment.");
      const a2 = worldToPlane(a, plane), b2 = worldToPlane(b, plane), length = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
      const direction = planeToWorld([-(b2[1] - a2[1]) / length, (b2[0] - a2[0]) / length], { ...plane, origin: [0, 0, 0] });
      result = { kind: "infinite-line", points: [m, m.map((v, i) => v + direction[i])] };
    }
  } else if (definition.operation === "intersection") {
    const first=source(definition.firstId,"first"),second=source(definition.secondId,"second"),circular=(g:WorldDrawingGeometry)=>g.kind==="circle"||g.kind==="arc";
    const exactCircle=(g:WorldDrawingGeometry)=>{if(!g.center||!g.radius||!g.uniformScale)throw Error("Intersection requires an exact circular source.");return {center:worldToPlane(g.center,plane),radius:g.radius};};
    const inDomain=(g:WorldDrawingGeometry,hit:Vec2)=>{if(g.kind!=="arc")return true;const c=exactCircle(g);return pointOnCircularDomain(hit,c.center,c.radius,g.startAngle,g.endAngle);};
    let hit:Vec2|undefined,heightPoint:Vec3,intersectionStatus:string|undefined;
    if(circular(first)&&circular(second)){
      if(definition.branchBasis!=="center-line")throw Error("Circular source pair requires explicit centre-line branch reassignment.");
      const a=exactCircle(first),b=exactCircle(second),solutions=circularIntersections(a.center,a.radius,b.center,b.radius);
      if(!solutions.branches.length)throw Error(`Circular intersection is ${solutions.status}; no isolated signed intersection exists.`);
      const domain=solutions.branches.filter(p=>inDomain(first,p.point)&&inDomain(second,p.point));
      intersectionStatus=solutions.status==="tangent"?"tangent":domain.length===1?"one-domain-point":"two-points";
      hit=domain.find(p=>p.branch===definition.branch)?.point;
      heightPoint=first.center!;
    }else{
      if(definition.branchBasis)throw Error("The centre-line branch requires two circular sources. Reassign the definition explicitly.");
      const line=circular(first)?second:first,other=circular(first)?first:second,[a,b]=linear(line);heightPoint=a;
      if(circular(other)){
        const c=exactCircle(other);hit=linearCircleBranches(worldToPlane(a,plane),worldToPlane(b,plane),c.center,c.radius,line.kind as LinearDomain).find(p=>p.branch===definition.branch&&inDomain(other,p.point))?.point;
      }else{
        const [c,d]=linear(other);hit=intersectLinear(worldToPlane(a,plane),worldToPlane(b,plane),line.kind as LinearDomain,worldToPlane(c,plane),worldToPlane(d,plane),other.kind as LinearDomain)??undefined;
      }
    }
    if(!hit)throw Error(`The selected intersection (${definition.branch}) does not exist in the source domains. Reassign the branch explicitly.`);
    const h=heightPoint.reduce((sum,v,i)=>sum+v*plane.normal[i],0);
    result={kind:"point",points:[planeToWorld(hit,plane).map((v,i)=>v+h*plane.normal[i])],...(intersectionStatus?{intersectionStatus}:{})};
  } else throw new Error("Unsupported construction operation.");
  const points = sources.flatMap(g => g.center ? [g.center] : g.points ?? []), height = (p: Vec3) => p.reduce((sum, v, i) => sum + v * plane.normal[i], 0);
  if (points.some(p => Math.abs(height(p) - height(points[0])) > linearToleranceAt(...p, ...points[0]))) throw new Error("Construction sources have different elevations.");
  return { ...result, workPlane: planeId };
}

/** Validate evaluated caches on load; never silently accept tampered coordinates. */
export function assertConstructionEvaluation(document: CadDocument) {
  const features = new Map(Object.values(document.features).map(f => [f.output, f]));
  for (const f of features.values()) if (f.construction) {
    const result = evaluateConstruction(document, f.construction, f.params.workPlane as WorkPlaneId, features);
    if(result.intersectionStatus!==undefined&&result.intersectionStatus!==f.params.intersectionStatus)throw Error(`Stale construction intersection status: ${f.output}`);
    const expected = result.points as Vec3[], actual = f.params.points as Vec3[];
    if (!actual || actual.length !== expected.length || expected.some((p, i) => p.some((v, j) => Math.abs(v - actual[i][j]) > linearToleranceAt(v, actual[i][j])))) throw new Error(`Stale construction geometry: ${f.output}`);
  }
}

/** Only explicit create/reassign actions may choose a new branch basis. */
export function normalizeConstructionDefinition(document:CadDocument,definition:CadConstructionDefinition):CadConstructionDefinition{
  const next=structuredClone(definition);if(next.operation!=="intersection")return next;
  const get=(id:string,role:"first"|"second")=>{const object=document.objects[id],feature=Object.values(document.features).find(f=>f.output===id);return object&&feature?drawingReferenceGeometry(object,feature,next.elements?.[role]):undefined;};
  const first=get(next.firstId,"first"),second=get(next.secondId,"second"),circular=(kind:string|undefined)=>kind==="circle"||kind==="arc";
  if(circular(first?.kind)&&circular(second?.kind))next.branchBasis="center-line";
  else if(next.branchBasis)throw Error("The centre-line branch requires two circular sources.");
  return next;
}
