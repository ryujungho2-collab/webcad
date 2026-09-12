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

import { CadEngine } from '../runtime/CadEngine';

/**
 * Create a box shape
 */
export async function createBox(width: number, depth: number, height: number): Promise<any> {
  const engine = await CadEngine.create();
  const oc = engine.oc;
  
  // Create a box using BRepPrimAPI_MakeBox
  const boxMaker = new oc.BRepPrimAPI_MakeBox_2(
    width,
    depth,
    height
  );
  
  return boxMaker.Shape();
}

/**
 * Create a cylinder shape
 */
export async function createCylinder(radius: number, height: number): Promise<any> {
  const engine = await CadEngine.create();
  const oc = engine.oc;
  
  // Create a cylinder using BRepPrimAPI_MakeCylinder
  const cylMaker = new oc.BRepPrimAPI_MakeCylinder_1(
    radius,
    height
  );
  
  return cylMaker.Shape();
}

/**
 * Create a sphere shape
 */
export async function createSphere(radius: number): Promise<any> {
  const engine = await CadEngine.create();
  const oc = engine.oc;
  
  // Create a sphere using BRepPrimAPI_MakeSphere
  const sphMaker = new oc.BRepPrimAPI_MakeSphere_1(
    radius
  );
  
  return sphMaker.Shape();
}