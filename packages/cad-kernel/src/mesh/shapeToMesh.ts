// Mesh conversion functions
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
import { fingerprintFace } from "../operations/topology";

export type MeshedFaceRange = {
  key: string;
  /** First triangle ordinal (index into indices / 3). */
  start: number;
  /** Number of triangles belonging to this face. */
  count: number;
};

export const BASE_LINEAR_DEFLECTION = 0.1;

/** Absolute deflection for small parts, relative for large ones. */
export function meshDeflection(oc: any, shape: any): number {
  const box = new oc.Bnd_Box_1();
  let min: any, max: any;
  try {
    oc.BRepBndLib.AddOptimal(shape, box, false, false);
    if (box.IsVoid()) return BASE_LINEAR_DEFLECTION;
    min = box.CornerMin(); max = box.CornerMax();
    const diagonal = Math.hypot(max.X() - min.X(), max.Y() - min.Y(), max.Z() - min.Z());
    return Number.isFinite(diagonal) ? Math.max(BASE_LINEAR_DEFLECTION, diagonal / 2000) : BASE_LINEAR_DEFLECTION;
  } catch {
    return BASE_LINEAR_DEFLECTION;
  } finally {
    min?.delete?.(); max?.delete?.(); box.delete();
  }
}

/**
 * `deflection` lets a caller mesh one face with the deflection of its parent solid.
 * Face keys fingerprint the triangulation, so a face re-meshed alone at its own
 * (smaller) size would not match the key published for the whole solid.
 */
export async function shapeToMesh(shape: any, deflection?: number): Promise<{
  positions: number[];
  normals: number[];
  indices: number[];
  faces: MeshedFaceRange[];
}> {
  const engine = await CadEngine.create();
  const oc = engine.oc;

  // Tessellate the BRep shape. Parts up to ~200 mm keep the 0.1 mm absolute
  // deflection; larger shapes use 1/2000 of their bounding diagonal so a 27 m
  // torus or cylinder does not explode into hundreds of thousands of triangles.
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape,
    deflection ?? meshDeflection(oc, shape),
    false,
    0.5,
    false
  );

  const progress = new oc.Message_ProgressRange_1();
  try {
    mesher.Perform(progress);
  } finally {
    progress.delete();
    mesher.delete();
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const faces: MeshedFaceRange[] = [];

  type ExplorerFindArg =
    ConstructorParameters<typeof oc.TopExp_Explorer_2>[1];

  type ExplorerAvoidArg =
    ConstructorParameters<typeof oc.TopExp_Explorer_2>[2];

  type MeshPurposeArg =
    Parameters<typeof oc.BRep_Tool.Triangulation>[2];

  const faceEnum = (
    oc.TopAbs_ShapeEnum.TopAbs_FACE
  ) as unknown as ExplorerFindArg;

  const shapeEnum = (
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  ) as unknown as ExplorerAvoidArg;

  // Poly_MeshPurpose_NONE == 0.
  const meshPurpose =
    0 as unknown as MeshPurposeArg;

  const explorer = new oc.TopExp_Explorer_2(
    shape,
    faceEnum,
    shapeEnum
  );

  let globalVertexOffset = 0;

  try {
  while (explorer.More()) {
    const owned: any[] = [];
    const keep = <T>(value: T): T => { owned.push(value); return value; };
    try {
    const current = keep(explorer.Current());
    const face = keep(oc.TopoDS.Face_1(current));

    const location =
      keep(new oc.TopLoc_Location_1());

    const triHandle =
      keep(oc.BRep_Tool.Triangulation(
        face,
        location,
        meshPurpose
      ));

    if (!triHandle.IsNull()) {
      // Convert Handle_Poly_Triangulation to the concrete
      // Poly_Triangulation wrapper exposed by opencascade.js.
      const triangulation =
        keep(new oc.Poly_Triangulation_5(
          triHandle
        ));

      const nodeCount = triangulation.NbNodes();
      const faceNodes: number[] = [];
      const faceTriangles: number[] = [];

      const reversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;

      const transform = location.IsIdentity()
        ? null
        : keep(location.Transformation());

      const hasNormals = triangulation.HasNormals();

      for (let i = 1; i <= nodeCount; i++) {
        const point = triangulation.Node(i);
        let worldPoint = point;
        try {

        worldPoint = transform
          ? point.Transformed(transform)
          : point;

        faceNodes.push(
          worldPoint.X(),
          worldPoint.Y(),
          worldPoint.Z()
        );
        positions.push(
          worldPoint.X(),
          worldPoint.Y(),
          worldPoint.Z()
        );

        if (hasNormals) {
          const normal = triangulation.Normal_1(i);
          let worldNormal = normal;
          try {

          worldNormal = transform
          ? normal.Transformed(transform)
          : normal;

          const sign = reversed ? -1 : 1;

          normals.push(
            worldNormal.X() * sign,
            worldNormal.Y() * sign,
            worldNormal.Z() * sign
          );
          } finally {
            if (worldNormal !== normal) worldNormal.delete();
            normal.delete();
          }
        }
        } finally {
          if (worldPoint !== point) worldPoint.delete();
          point.delete();
        }
      }

      const triangleCount =
        triangulation.NbTriangles();
      const faceStart = indices.length / 3;

      for (
        let i = 1;
        i <= triangleCount;
        i++
      ) {
        const triangle =
          triangulation.Triangle(i);
        try {

        const i1 =
          triangle.Value(1) - 1;
        const i2 =
          triangle.Value(2) - 1;
        const i3 =
          triangle.Value(3) - 1;

        faceTriangles.push(i1, i2, i3);
        if (reversed) {
          indices.push(
            globalVertexOffset + i3,
            globalVertexOffset + i2,
            globalVertexOffset + i1
          );
        } else {
          indices.push(
            globalVertexOffset + i1,
            globalVertexOffset + i2,
            globalVertexOffset + i3
          );
        }
        } finally { triangle.delete(); }
      }

      faces.push({
        key: fingerprintFace({ nodes: faceNodes, triangles: faceTriangles }),
        start: faceStart,
        count: triangleCount,
      });

      globalVertexOffset += nodeCount;
    }

    } finally {
      for (let i = owned.length - 1; i >= 0; i--) owned[i].delete();
    }
    explorer.Next();
  }
  } finally { explorer.delete(); }

  // Fallback: generate vertex normals when OpenCascade
  // triangulation does not provide them.
  if (normals.length !== positions.length && positions.length > 0) {
    normals.length = 0;

    for (let i = 0; i < positions.length; i++) {
      normals.push(0);
    }

    for (let i = 0; i < indices.length; i += 3) {
      const ia = indices[i] * 3;
      const ib = indices[i + 1] * 3;
      const ic = indices[i + 2] * 3;

      const ax = positions[ia];
      const ay = positions[ia + 1];
      const az = positions[ia + 2];

      const bx = positions[ib];
      const by = positions[ib + 1];
      const bz = positions[ib + 2];

      const cx = positions[ic];
      const cy = positions[ic + 1];
      const cz = positions[ic + 2];

      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;

      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      normals[ia] += nx;
      normals[ia + 1] += ny;
      normals[ia + 2] += nz;

      normals[ib] += nx;
      normals[ib + 1] += ny;
      normals[ib + 2] += nz;

      normals[ic] += nx;
      normals[ic + 1] += ny;
      normals[ic + 2] += nz;
    }

    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i];
      const ny = normals[i + 1];
      const nz = normals[i + 2];

      const length = Math.hypot(nx, ny, nz);

      if (length > 0) {
        normals[i] = nx / length;
        normals[i + 1] = ny / length;
        normals[i + 2] = nz / length;
      }
    }
  }

  if (
    positions.length === 0 ||
    indices.length === 0
  ) {
    throw new Error(
      "Failed to generate mesh from shape"
    );
  }

  return {
    positions,
    normals,
    indices,
    faces
  };
}