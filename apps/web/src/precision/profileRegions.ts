import type { ExtrudeProfile } from "@agent-webcad/cad-kernel";
import { angleOnSweep, circleCircleIntersections, segmentCircleIntersections } from "./snapEngine";
import { worldToPlane, WORK_PLANES, type WorkPlaneId } from "./workPlane";

type P = [number, number];
type Boundary = { kind: "line"; a: P; b: P } | { kind: "curve"; c: P; r: number; start: number; sweep: number };
const TAU = Math.PI * 2, EPS = 1e-6;
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const positive = (a: number) => (a % TAU + TAU) % TAU;

function boundaries(profile: ExtrudeProfile, plane: WorkPlaneId): Boundary[] {
  const local = (p: [number, number, number]) => worldToPlane(p, WORK_PLANES[plane]);
  return profile.segments.map(segment => {
    if (segment.kind === "line") return { kind: "line", a: local(segment.start), b: local(segment.end) };
    if (segment.kind === "circle") return { kind: "curve", c: local(segment.center), r: segment.radius, start: 0, sweep: TAU };
    const a = local(segment.start), m = local(segment.mid), b = local(segment.end);
    const u = sub(m, a), v = sub(b, a), d = 2 * cross(u, v);
    const u2 = u[0] ** 2 + u[1] ** 2, v2 = v[0] ** 2 + v[1] ** 2;
    const c: P = [a[0] + (v[1] * u2 - u[1] * v2) / d, a[1] + (u[0] * v2 - v[0] * u2) / d];
    const start = Math.atan2(a[1] - c[1], a[0] - c[0]), mid = Math.atan2(m[1] - c[1], m[0] - c[0]), end = Math.atan2(b[1] - c[1], b[0] - c[0]);
    const ccw = positive(end - start);
    return { kind: "curve", c, r: dist(a, c), start, sweep: positive(mid - start) < ccw ? ccw : ccw - TAU };
  });
}

function on(edge: Boundary, p: P) {
  if (edge.kind === "curve") return Math.abs(dist(edge.c, p) - edge.r) <= EPS && angleOnSweep(Math.atan2(p[1] - edge.c[1], p[0] - edge.c[0]), edge.start, edge.start + edge.sweep);
  const v = sub(edge.b, edge.a), w = sub(p, edge.a), length = dist(edge.a, edge.b);
  return Math.abs(cross(v, w)) <= EPS * length && w[0] * v[0] + w[1] * v[1] >= -EPS * length && w[0] * v[0] + w[1] * v[1] <= length ** 2 + EPS * length;
}

function meet(a: Boundary, b: Boundary) {
  if (a.kind === "line" && b.kind === "line") {
    const u = sub(a.b, a.a), v = sub(b.b, b.a), w = sub(b.a, a.a), d = cross(u, v);
    if (Math.abs(d) < EPS) return on(a, b.a) || on(a, b.b) || on(b, a.a) || on(b, a.b);
    const t = cross(w, v) / d, s = cross(w, u) / d;
    return t >= -EPS / dist(a.a, a.b) && t <= 1 + EPS / dist(a.a, a.b) && s >= -EPS / dist(b.a, b.b) && s <= 1 + EPS / dist(b.a, b.b);
  }
  if (a.kind === "curve" && b.kind === "curve") {
    if (dist(a.c, b.c) <= EPS && Math.abs(a.r - b.r) <= EPS) {
      // Coincident circular supports: test endpoints and midpoints for overlapping sweeps.
      return [a, b].some((edge, i) => [0, 0.5, 1].some(t => on(i ? a : b, [edge.c[0] + edge.r * Math.cos(edge.start + edge.sweep * t), edge.c[1] + edge.r * Math.sin(edge.start + edge.sweep * t)])));
    }
    return circleCircleIntersections(a.c, a.r, b.c, b.r).some(p => on(a, p) && on(b, p));
  }
  const line = (a.kind === "line" ? a : b) as Extract<Boundary, {kind:"line"}>;
  const curve = (a.kind === "curve" ? a : b) as Extract<Boundary, {kind:"curve"}>;
  return segmentCircleIntersections(line.a, line.b, curve.c, curve.r).some(p => on(curve, p));
}

export function profilesTouch(a: ExtrudeProfile, b: ExtrudeProfile, plane: WorkPlaneId) {
  return boundaries(a, plane).some(first => boundaries(b, plane).some(second => meet(first, second)));
}

/** Exact contacts, including coincident overlap witnesses; no sampled segment-pair explosion. */
function contacts(a:Boundary,b:Boundary):P[]{
  if(a.kind==="line"&&b.kind==="line"){
    const u=sub(a.b,a.a),v=sub(b.b,b.a),w=sub(b.a,a.a),d=cross(u,v);
    if(Math.abs(d)<EPS)return [a.a,a.b,b.a,b.b,[(a.a[0]+a.b[0])/2,(a.a[1]+a.b[1])/2] as P,[(b.a[0]+b.b[0])/2,(b.a[1]+b.b[1])/2] as P].filter(p=>on(a,p)&&on(b,p));
    const t=cross(w,v)/d,p:P=[a.a[0]+t*u[0],a.a[1]+t*u[1]];return on(a,p)&&on(b,p)?[p]:[];
  }
  if(a.kind==="curve"&&b.kind==="curve"){
    if(dist(a.c,b.c)<EPS&&Math.abs(a.r-b.r)<EPS)return [a,b].flatMap(e=>[0,.25,.5,.75,1].map(t=>[e.c[0]+e.r*Math.cos(e.start+e.sweep*t),e.c[1]+e.r*Math.sin(e.start+e.sweep*t)] as P)).filter(p=>on(a,p)&&on(b,p));
    return circleCircleIntersections(a.c,a.r,b.c,b.r).filter(p=>on(a,p)&&on(b,p));
  }
  const line=(a.kind==="line"?a:b) as Extract<Boundary,{kind:"line"}>,curve=(a.kind==="curve"?a:b) as Extract<Boundary,{kind:"curve"}>;
  return segmentCircleIntersections(line.a,line.b,curve.c,curve.r).filter(p=>on(curve,p));
}
export function profileSelfCrosses(profile:ExtrudeProfile,plane:WorkPlaneId){const edges=boundaries(profile,plane);return edges.some((a,i)=>edges.some((b,j)=>{
  if(j<=i)return false;const adjacent=j===i+1||i===0&&j===edges.length-1;
  const ends=(e:Boundary):P[]=>e.kind==="line"?[e.a,e.b]:[e.start,e.start+e.sweep].map(angle=>[e.c[0]+e.r*Math.cos(angle),e.c[1]+e.r*Math.sin(angle)] as P);
  const allowed=adjacent?ends(a).filter(p=>ends(b).some(q=>dist(p,q)<=EPS)):[];
  return contacts(a,b).some(p=>!allowed.some(q=>dist(p,q)<=EPS));
}));}

/** Exact horizontal-ray winding parity for line/circular boundaries. Boundary points are excluded. */
export function profileContainsPoint(profile: ExtrudeProfile, p: P, plane: WorkPlaneId): boolean {
  const edges = boundaries(profile, plane);
  if (edges.some(edge => on(edge, p))) return false;
  let hits = 0;
  for (const edge of edges) {
    if (edge.kind === "line") {
      if ((edge.a[1] > p[1]) !== (edge.b[1] > p[1]) && edge.a[0] + (p[1] - edge.a[1]) * (edge.b[0] - edge.a[0]) / (edge.b[1] - edge.a[1]) > p[0]) hits++;
    } else {
      const y = (p[1] - edge.c[1]) / edge.r;
      if (Math.abs(y) >= 1) continue; // Tangency never crosses the ray.
      const first = Math.asin(y);
      for (const angle of [first, Math.PI - first]) {
        if (edge.c[0] + edge.r * Math.cos(angle) <= p[0]) continue;
        if (Math.abs(edge.sweep) >= TAU - 1e-9) { hits++; continue; }
        const progress = edge.sweep > 0 ? positive(angle - edge.start) : positive(edge.start - angle);
        const derivative = Math.cos(angle) * edge.sweep;
        if (progress < 1e-9) { if (derivative > 0) hits++; }
        else if (Math.abs(progress - Math.abs(edge.sweep)) < 1e-9) { if (derivative < 0) hits++; }
        else if (progress < Math.abs(edge.sweep)) hits++;
      }
    }
  }
  return hits % 2 === 1;
}

export function profileBoundaryPoints(profile: ExtrudeProfile, plane: WorkPlaneId, tolerance?:number,maxPoints=200000): P[] {
  let samples=0;
  return boundaries(profile, plane).flatMap(edge => {
    if (edge.kind === "line") {if(++samples>maxPoints)throw Error("Face display exceeds its point budget.");return [edge.a];}
    const step=tolerance?Math.min(Math.PI/90,2*Math.acos(Math.max(-1,1-tolerance/edge.r))):Math.PI/90;
    const count = Math.max(8, Math.ceil(Math.abs(edge.sweep) / Math.max(step,1e-6)));
    if((samples+=count)>maxPoints)throw Error("Curve display exceeds its point budget at the requested tolerance.");
    return Array.from({length: count}, (_, i) => {
    const angle = edge.start + edge.sweep * i / count;
    return [edge.c[0] + edge.r * Math.cos(angle), edge.c[1] + edge.r * Math.sin(angle)] as P;
    });
  });
}

export function regionContainsPoint(profile: ExtrudeProfile, p: P, plane: WorkPlaneId) {
  return profileContainsPoint(profile, p, plane) && !(profile.holes ?? []).some(hole => profileContainsPoint(hole, p, plane) || boundaries(hole, plane).some(edge => on(edge, p)));
}

/** Green's theorem on exact lines/circular arcs, independent of display tessellation. */
export function profileRegionMeasurement(profile:ExtrudeProfile,plane:WorkPlaneId):{area:number;length:number}{
  const measure=(boundary:ExtrudeProfile)=>{let signed=0,length=0;const edges=boundaries(boundary,plane),first=edges[0],origin=first.kind==="line"?first.a:first.c;for(const edge of edges){
    if(edge.kind==="line"){signed+=cross(sub(edge.a,origin),sub(edge.b,origin))/2;length+=dist(edge.a,edge.b);}
    else {const end=edge.start+edge.sweep,c=sub(edge.c,origin); signed+=(c[0]*edge.r*(Math.sin(end)-Math.sin(edge.start))+c[1]*edge.r*(Math.cos(edge.start)-Math.cos(end))+edge.r**2*edge.sweep)/2;length+=edge.r*Math.abs(edge.sweep);}
  }return {area:Math.abs(signed),length};};
  const result=measure(profile);for(const hole of profile.holes??[]){const inner=measure(hole);result.area-=inner.area;result.length+=inner.length;}return result;
}
