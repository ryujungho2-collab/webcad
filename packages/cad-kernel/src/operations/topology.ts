// MIT License
// Copyright (c) 2023 Cascade Studio
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { CadEngine } from "../runtime/CadEngine";

export type TopologyPoint = [number, number, number];

export type FaceFingerprintInput = {
  /** Flat xyz coordinates of this face's triangulation nodes, in shape-local frame. */
  nodes: number[];
  /** Local (face-relative) vertex indices, triples. */
  triangles: number[];
};

export type EdgeFingerprint = {
  key: string;
  /** Representative points along the edge in shape-local frame, for picking. */
  points: TopologyPoint[];
  /**
   * 1-based explorer position of the first occurrence. Matches the indexing
   * used by filletEdges, which counts the same explorer sequence — including
   * orientation duplicates. Never persisted: callers resolve stable keys to
   * fresh indices on every operation.
   */
  index: number;
};

/**
 * Quantized number formatting for topology keys. Six decimals absorb float
 * noise while keeping millimeter geometry exact well below tolerance.
 */
function quantized(value: number): string {
  if (!Number.isFinite(value)) return "nan";
  const rounded = Math.round(value * 1e6) / 1e6;
  return (rounded === 0 ? 0 : rounded).toFixed(6);
}

function formatPoint(point: TopologyPoint): string {
  return `${quantized(point[0])},${quantized(point[1])},${quantized(point[2])}`;
}

/**
 * Geometric face identity derived from a face's own triangulation: node and
 * triangle counts plus centroid, area-weighted normal and area. Deliberately
 * independent of explorer order or transient indices, so the same face keeps
 * its key across deterministic rebuilds. Two geometrically coincident faces
 * could theoretically collide; faces of one solid are disjoint, which bounds
 * the risk in practice (documented limitation).
 */
export function fingerprintFace(input: FaceFingerprintInput): string {
  const { nodes, triangles } = input;
  const vertexCount = nodes.length / 3;
  const triangleCount = triangles.length / 3;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < nodes.length; i += 3) {
    cx += nodes[i];
    cy += nodes[i + 1];
    cz += nodes[i + 2];
  }
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let area = 0;
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i] * 3;
    const b = triangles[i + 1] * 3;
    const c = triangles[i + 2] * 3;
    const abx = nodes[b] - nodes[a];
    const aby = nodes[b + 1] - nodes[a + 1];
    const abz = nodes[b + 2] - nodes[a + 2];
    const acx = nodes[c] - nodes[a];
    const acy = nodes[c + 1] - nodes[a + 1];
    const acz = nodes[c + 2] - nodes[a + 2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const crossLength = Math.hypot(crossX, crossY, crossZ);
    area += crossLength / 2;
    nx += crossX;
    ny += crossY;
    nz += crossZ;
  }
  const normalLength = Math.hypot(nx, ny, nz);
  const count = Math.max(1, vertexCount);
  const centroid: TopologyPoint = [cx / count, cy / count, cz / count];
  const normal: TopologyPoint =
    normalLength > 1e-12
      ? [nx / normalLength, ny / normalLength, nz / normalLength]
      : [0, 0, 0];
  return `face:${vertexCount}:${triangleCount}:${formatPoint(centroid)}|${formatPoint(normal)}|${quantized(area)}`;
}

const EDGE_SAMPLES = 9;

function sampleCurvePoints(
  adaptor: any,
  first: number,
  last: number
): TopologyPoint[] | null {
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const points: TopologyPoint[] = [];
  for (let i = 0; i < EDGE_SAMPLES; i += 1) {
    const point = adaptor.Value(first + ((last - first) * i) / (EDGE_SAMPLES - 1));
    const coords: TopologyPoint = [point.X(), point.Y(), point.Z()];
    if (!coords.every(Number.isFinite)) return null;
    points.push(coords);
  }
  return points;
}

function orderPoints(points: TopologyPoint[]): TopologyPoint[] {
  const first = points[0];
  const last = points[points.length - 1];
  const forward = `${formatPoint(first)}|${formatPoint(last)}`;
  const backward = `${formatPoint(last)}|${formatPoint(first)}`;
  return backward < forward ? points.slice().reverse() : points;
}

/**
 * Stable edge identity from curve geometry sampled through the adaptor, never
 * from explorer order or transient indices (a box explorer yields 24 entries
 * for 12 edges, so raw indices are unfit as references). Orientation
 * duplicates canonicalize to the same key and are deduped by the caller via
 * key equality.
 */
export function fingerprintEdge(samples: TopologyPoint[]): { key: string; points: TopologyPoint[] } | null {
  if (samples.length < 2) return null;
  const ordered = orderPoints(samples);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const chord = Math.hypot(last[0] - first[0], last[1] - first[1], last[2] - first[2]);
  if (chord <= 1e-9) {
    return { key: `edge:point:${formatPoint(first)}`, points: [first] };
  }
  let deviation = 0;
  for (const point of ordered) {
    const t = ((point[0] - first[0]) * (last[0] - first[0]) +
      (point[1] - first[1]) * (last[1] - first[1]) +
      (point[2] - first[2]) * (last[2] - first[2])) / (chord * chord);
    const projected: TopologyPoint = [
      first[0] + (last[0] - first[0]) * t,
      first[1] + (last[1] - first[1]) * t,
      first[2] + (last[2] - first[2]) * t,
    ];
    deviation = Math.max(
      deviation,
      Math.hypot(point[0] - projected[0], point[1] - projected[1], point[2] - projected[2])
    );
  }
  if (deviation <= 1e-7 * Math.max(chord, 1)) {
    return {
      key: `edge:line:${formatPoint(first)}|${formatPoint(last)}|${quantized(chord)}`,
      points: [first, ordered[Math.floor(ordered.length / 2)], last],
    };
  }
  return {
    key: `edge:curve:${ordered.map(formatPoint).join("|")}`,
    points: ordered,
  };
}

/**
 * Enumerates deduplicated stable edge references of a solid, in
 * shape-local frame (no placement applied). Orientation duplicates produced
 * by the explorer collapse to identical keys.
 */
export async function enumerateSolidEdges(shape: any): Promise<EdgeFingerprint[]> {
  const engine = await CadEngine.create();
  const oc = engine.oc;
  type ExplorerFindArg = ConstructorParameters<typeof oc.TopExp_Explorer_2>[1];
  type ExplorerAvoidArg = ConstructorParameters<typeof oc.TopExp_Explorer_2>[2];
  const edgeEnum = oc.TopAbs_ShapeEnum.TopAbs_EDGE as unknown as ExplorerFindArg;
  const shapeEnum = oc.TopAbs_ShapeEnum.TopAbs_SHAPE as unknown as ExplorerAvoidArg;
  const byKey = new Map<string, EdgeFingerprint>();
  const explorer = new oc.TopExp_Explorer_2(shape, edgeEnum, shapeEnum);
  let position = 0;
  while (explorer.More()) {
    position += 1;
    try {
      const edge = oc.TopoDS.Edge_1(explorer.Current());
      const adaptor = new oc.BRepAdaptor_Curve_2(edge);
      const samples = sampleCurvePoints(adaptor, adaptor.FirstParameter(), adaptor.LastParameter());
      if (samples) {
        const fingerprinted = fingerprintEdge(samples);
        if (fingerprinted && !byKey.has(fingerprinted.key)) {
          byKey.set(fingerprinted.key, { ...fingerprinted, index: position });
        }
      }
    } catch {
      // Unreadable edges are skipped; absence of a reference can never
      // fabricate a false selection.
    }
    explorer.Next();
  }
  return [...byKey.values()];
}
