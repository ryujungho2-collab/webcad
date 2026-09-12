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

export async function filletEdges(
  shape: any,
  radius: number,
  edgeIndices: number[]
): Promise<any> {
  const engine = await CadEngine.create();
  const oc = engine.oc;

  type FilletShapeArg =
    ConstructorParameters<typeof oc.BRepFilletAPI_MakeFillet>[1];

  type ExplorerToFindArg =
    ConstructorParameters<typeof oc.TopExp_Explorer_2>[1];

  type ExplorerToAvoidArg =
    ConstructorParameters<typeof oc.TopExp_Explorer_2>[2];

  const filletMode = (
    oc.ChFi3d_FilletShape.ChFi3d_Rational
  ) as unknown as FilletShapeArg;

  const edgeEnum = (
    oc.TopAbs_ShapeEnum.TopAbs_EDGE
  ) as unknown as ExplorerToFindArg;

  const shapeEnum = (
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  ) as unknown as ExplorerToAvoidArg;

  const filletMaker = new oc.BRepFilletAPI_MakeFillet(
    shape,
    filletMode
  );

  const explorer = new oc.TopExp_Explorer_2(
    shape,
    edgeEnum,
    shapeEnum
  );

  let edgeIndex = 1;

  while (explorer.More()) {
    if (edgeIndices.includes(edgeIndex)) {
      const edge = oc.TopoDS.Edge_1(explorer.Current());
      filletMaker.Add_2(radius, edge);
    }

    explorer.Next();
    edgeIndex++;
  }

  filletMaker.Build(
    new oc.Message_ProgressRange_1()
  );

  if (!filletMaker.IsDone()) {
    throw new Error("Fillet operation failed");
  }

  return filletMaker.Shape();
}