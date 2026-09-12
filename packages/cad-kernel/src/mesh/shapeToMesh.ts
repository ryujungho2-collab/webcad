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

export async function shapeToMesh(shape: any): Promise<{
  positions: number[];
  normals: number[];
  indices: number[];
}> {
  const engine = await CadEngine.create();
  const oc = engine.oc;

  // Tessellate the BRep shape.
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape,
    0.1,
    false,
    0.5,
    false
  );

  mesher.Perform(
    new oc.Message_ProgressRange_1()
  );

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

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

  while (explorer.More()) {
    const face = oc.TopoDS.Face_1(
      explorer.Current()
    );

    const location =
      new oc.TopLoc_Location_1();

    const triHandle =
      oc.BRep_Tool.Triangulation(
        face,
        location,
        meshPurpose
      );

    if (!triHandle.IsNull()) {
      // Convert Handle_Poly_Triangulation to the concrete
      // Poly_Triangulation wrapper exposed by opencascade.js.
      const triangulation =
        new oc.Poly_Triangulation_5(
          triHandle
        );

      const nodeCount = triangulation.NbNodes();

      const reversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;

      const transform = location.IsIdentity()
        ? null
        : location.Transformation();

      const hasNormals = triangulation.HasNormals();

      for (let i = 1; i <= nodeCount; i++) {
        const point = triangulation.Node(i);

        const worldPoint = transform
          ? point.Transformed(transform)
          : point;

        
        positions.push(
          worldPoint.X(),
          worldPoint.Y(),
          worldPoint.Z()
        );

        if (hasNormals) {
          const normal = triangulation.Normal_1(i);

          const worldNormal = transform
          ? normal.Transformed(transform)
          : normal;

          const sign = reversed ? -1 : 1;

          normals.push(
            worldNormal.X() * sign,
            worldNormal.Y() * sign,
            worldNormal.Z() * sign
          );
        }
      }

      const triangleCount =
        triangulation.NbTriangles();

      for (
        let i = 1;
        i <= triangleCount;
        i++
      ) {
        const triangle =
          triangulation.Triangle(i);

        const i1 =
          triangle.Value(1) - 1;
        const i2 =
          triangle.Value(2) - 1;
        const i3 =
          triangle.Value(3) - 1;

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
      }

      globalVertexOffset += nodeCount;
    }

    explorer.Next();
  }

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
    indices
  };
}