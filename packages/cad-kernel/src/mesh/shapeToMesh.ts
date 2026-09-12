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

      const nodeCount =
        triangulation.NbNodes();

      for (let i = 1; i <= nodeCount; i++) {
        const point =
          triangulation.Node(i);

        positions.push(
          point.X(),
          point.Y(),
          point.Z()
        );

        // Normals will be filled properly after the
        // basic smoke test is passing.
      }

      const triangleCount =
        triangulation.NbTriangles();

      const reversed =
        face.Orientation_1() ===
        oc.TopAbs_Orientation.TopAbs_REVERSED;

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