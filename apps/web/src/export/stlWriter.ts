export type StlTriangle = {
  normal: [number, number, number];
  vertices: [[number, number, number], [number, number, number], [number, number, number]];
};

function sub(a: ArrayLike<number>, b: ArrayLike<number>): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Indexed mesh to per-facet triangles with geometric normals. Degenerate facets get a zero normal. */
export function meshToTriangles(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
): StlTriangle[] {
  const triangles: StlTriangle[] = [];
  for (let face = 0; face + 2 < indices.length; face += 3) {
    const a = indices[face] * 3;
    const b = indices[face + 1] * 3;
    const c = indices[face + 2] * 3;
    const pa: [number, number, number] = [positions[a], positions[a + 1], positions[a + 2]];
    const pb: [number, number, number] = [positions[b], positions[b + 1], positions[b + 2]];
    const pc: [number, number, number] = [positions[c], positions[c + 1], positions[c + 2]];
    const normal = cross(sub(pb, pa), sub(pc, pa));
    const length = Math.hypot(normal[0], normal[1], normal[2]);
    triangles.push({
      normal: length > 1e-12 ? [normal[0] / length, normal[1] / length, normal[2] / length] : [0, 0, 0],
      vertices: [pa, pb, pc],
    });
  }
  return triangles;
}

const HEADER_TEXT = "agent-webcad binary STL";

export function encodeBinaryStl(triangles: StlTriangle[]): Uint8Array {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  for (let index = 0; index < HEADER_TEXT.length; index++) {
    view.setUint8(index, HEADER_TEXT.charCodeAt(index));
  }
  view.setUint32(80, triangles.length, true);
  let offset = 84;
  for (const triangle of triangles) {
    for (const component of triangle.normal) {
      view.setFloat32(offset, component, true);
      offset += 4;
    }
    for (const vertex of triangle.vertices) {
      for (const component of vertex) {
        view.setFloat32(offset, component, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}
