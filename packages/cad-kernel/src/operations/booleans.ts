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

/** Constructors already perform the Boolean in this OCCT binding. A second
 * Build repeats the exact operation and leaves additional native work behind.
 * Result Shape() owns its handle independently of the builder/progress scope.
 */
async function booleanShape(kind:"fuse"|"cut"|"intersect",a:any,b:any):Promise<any>{
 const {oc}=await CadEngine.create(),progress=new oc.Message_ProgressRange_1();let operation:any;
 try{
  operation=kind==="fuse"?new oc.BRepAlgoAPI_Fuse_3(a,b,progress):kind==="cut"?new oc.BRepAlgoAPI_Cut_3(a,b,progress):new oc.BRepAlgoAPI_Common_3(a,b,progress);
  if(!operation.IsDone())operation.Build(progress);
  if(!operation.IsDone())throw Error(`Boolean ${kind} operation failed`);
  return operation.Shape();
 }finally{operation?.delete();progress.delete();}
}
export async function fuse(a:any,b:any):Promise<any>{return booleanShape("fuse",a,b);}
export async function cut(a:any,b:any):Promise<any>{return booleanShape("cut",a,b);}
export async function intersect(a:any,b:any):Promise<any>{return booleanShape("intersect",a,b);}
