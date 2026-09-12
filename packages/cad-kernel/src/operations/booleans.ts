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
 * Fuse two shapes
 */
export async function fuse(a: any, b: any): Promise<any> {
  const engine = await CadEngine.create();
  const oc = engine.oc;
  
  // Perform boolean fusion using BRepAlgoAPI_Fuse
  const fuseOp = new oc.BRepAlgoAPI_Fuse_3(a, b, new oc.Message_ProgressRange_1());
  fuseOp.Build(new oc.Message_ProgressRange_1());
  
  // Check if the operation was successful
  if (!fuseOp.IsDone()) {
    throw new Error('Boolean fuse operation failed');
  }
  
  return fuseOp.Shape();
}

/**
 * Cut one shape from another
 */
export async function cut(target: any, tool: any): Promise<any> {
  const engine = await CadEngine.create();
  const oc = engine.oc;
  
  // Perform boolean cut using BRepAlgoAPI_Cut
  const cutOp = new oc.BRepAlgoAPI_Cut_3(target, tool, new oc.Message_ProgressRange_1());
  cutOp.Build(new oc.Message_ProgressRange_1());
  
  // Check if the operation was successful
  if (!cutOp.IsDone()) {
    throw new Error('Boolean cut operation failed');
  }
  
  return cutOp.Shape();
}

/**
 * Find intersection of two shapes
 */
export async function intersect(a: any, b: any): Promise<any> {
  const engine = await CadEngine.create();
  const oc = engine.oc;
  
  // Perform boolean intersection using BRepAlgoAPI_Intersection
  const intersectOp = new oc.BRepAlgoAPI_Common_3(a, b, new oc.Message_ProgressRange_1());
  intersectOp.Build(new oc.Message_ProgressRange_1());
  
  // Check if the operation was successful
  if (!intersectOp.IsDone()) {
    throw new Error('Boolean intersection operation failed');
  }
  
  return intersectOp.Shape();
}