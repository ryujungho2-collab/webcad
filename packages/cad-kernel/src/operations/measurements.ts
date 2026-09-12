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

export async function volume(shape: any): Promise<number> {
  const engine = await CadEngine.create();
  const oc = engine.oc;

  const props = new oc.GProp_GProps_1();

  oc.BRepGProp.VolumeProperties_1(
    shape,
    props,
    false,
    false,
    false
  );

  return props.Mass();
}

export async function surfaceArea(shape: any): Promise<number> {
  const engine = await CadEngine.create();
  const oc = engine.oc;

  const props = new oc.GProp_GProps_1();

  oc.BRepGProp.SurfaceProperties_1(
    shape,
    props,
    false,
    false
  );

  return props.Mass();
}