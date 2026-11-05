import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {CadEngine,inspectShape} from "@agent-webcad/cad-kernel";
import {Box3,Vector3} from "three";
import {deserializeDocument,serializeDocument,type CadDocument} from "@agent-webcad/cad-document";
import {createKineticPavilion} from "./kineticPavilionModel";
import {assemblyMatrix,assertAssemblyPose} from "../src/state/assemblyCommands";
import {assemblyMotionGroups,motionPose,inspectAssemblyMotion,type MotionRequest} from "../src/state/assemblyMotion";
import {exportStepFile,inspectSolid,measureSolidDistance} from "../src/cad/kernelGeometryService";
import type {SerializedOperand} from "../src/cad/kernelProtocol";

const directory=resolve(process.cwd().endsWith("web")?"../../output/projects/kinetic-pavilion":"output/projects/kinetic-pavilion");
await mkdir(directory,{recursive:true});
const source=createKineticPavilion(),ids=Object.keys(source.objects),groups=assemblyMotionGroups(source,"louver-drive-1"),request:MotionRequest={jointId:"louver-drive-1",start:0,end:75,step:37.5,partIds:["louver-1","louver-2","door-left","door-right","canopy-inner-0","canopy-outer-0","column-0-0","slab"],exceptions:[],tolerance:1e-6};
const operand=(d:CadDocument,id:string):SerializedOperand=>({params:d.features["f-"+id].params,transform:d.objects[id].transform});
const validBodies=[];for(const id of ids){const m=await inspectSolid(operand(source,id));assert.equal(m.validity,"valid");assert.ok(m.volume!>0);validBodies.push({id,volume:m.volume});}
await writeFile(resolve(directory,"body-validation.json"),JSON.stringify(validBodies,null,2));
const invariant=new Map<string,any>(),summary=[],stepValidation=[];
for(const [label,value]of [["closed",0],["middle",37.5],["open",75]] as const){
 const pose=motionPose(source,request,value);assertAssemblyPose(pose);const saved=serializeDocument(pose),reopened=deserializeDocument(saved);assertAssemblyPose(reopened);assert.deepEqual(reopened.assembly,pose.assembly);assert.deepEqual(reopened.objects,pose.objects);
 await writeFile(resolve(directory,label+".webcad.json"),saved);
 const bounds=new Map(ids.map(id=>{const p=operand(pose,id).params;return [id,new Box3(new Vector3(),new Vector3(Number(p.width),Number(p.depth),Number(p.height))).applyMatrix4(assemblyMatrix(pose.objects[id].transform!)).expandByScalar(request.tolerance)];}));
 const rows=[];let brep=0,reused=0;
 for(let i=0;i<ids.length;i++)for(let k=i+1;k<ids.length;k++){
  const a=ids[i],b=ids[k],key=JSON.stringify([a,b]),constant=groups.get(a)===groups.get(b),cached=constant&&invariant.get(key);
  let row:any={pair:[a,b],relativeMotion:constant?"invariant":"motion-dependent"};
  if(cached){row={...cached,method:"reuse"};reused++;}
  else if(!bounds.get(a)!.intersectsBox(bounds.get(b)!))row={...row,status:"no-penetration",method:"aabb"};
  else {const result=await measureSolidDistance(operand(pose,a),operand(pose,b),request.tolerance);brep++;row={...row,status:result.classificationError||result.commonVolume===undefined?"unknown":result.commonVolume>result.volumeTolerance?"penetration":result.relationship==="contact"?"contact":"no-penetration",method:"brep",commonVolume:result.commonVolume,distance:result.boundaryDistance,volumeTolerance:result.volumeTolerance,...result.classificationError?{reason:result.classificationError}:{}};}
  if(constant&&!cached)invariant.set(key,row);rows.push(row);
 }
 const counts=Object.fromEntries(["penetration","contact","no-penetration","unknown"].map(status=>[status,rows.filter(r=>r.status===status).length])),result={pose:label,driver:value,parts:ids.length,pairs:rows.length,counts,brepCalls:brep,invariantReuse:reused,warning:"Discrete poses only. AABB separation rejects pairs; overlapping boxes use OCCT Common/distance. All contacts and penetrations retained; no hidden exceptions.",rows};
 await writeFile(resolve(directory,"interference-"+label+".json"),JSON.stringify(result,null,2));
 const step=await exportStepFile(ids.map(id=>operand(pose,id)));assert.ok(new TextDecoder().decode(step.subarray(0,100)).includes("ISO-10303-21"));await writeFile(resolve(directory,label+".step"),step);
 // Reopen the exported bytes through the actual OCCT STEP reader, including topology and volume checks.
 const oc=(await CadEngine.create()).oc as any,path="/kinetic-roundtrip.step",reader=new oc.STEPControl_Reader_1(),progress=new oc.Message_ProgressRange_1();let shape:any,explorer:any;
 try{oc.FS.writeFile(path,step);reader.ReadFile(path);assert.equal(reader.NbRootsForTransfer(),ids.length);assert.equal(reader.TransferRoots(progress),ids.length);shape=reader.OneShape();const measured=await inspectShape(shape);assert.equal(measured.validity,"valid");let solids=0;explorer=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);while(explorer.More()){solids++;explorer.Next();}assert.equal(solids,ids.length);const expectedVolume=validBodies.reduce((sum,b)=>sum+b.volume!,0);assert.ok(Math.abs(measured.volume-expectedVolume)/expectedVolume<1e-8);stepValidation.push({pose:label,solids,expectedVolume,...measured});}
 finally{explorer?.delete();shape?.delete();progress.delete();reader.delete();oc.FS.unlink(path);}
 summary.push({pose:label,driver:value,counts,brepCalls:brep,invariantReuse:reused,stepBytes:step.length,reopened:true});console.log(JSON.stringify(summary.at(-1)));
}
await writeFile(resolve(directory,"step-validation.json"),JSON.stringify(stepValidation,null,2));
const motion=await inspectAssemblyMotion(source,request);assert.equal(motion.state,"finished",motion.reason);assert.equal(motion.rows.length,84);await writeFile(resolve(directory,"motion-sampling.json"),JSON.stringify(motion,null,2));
await writeFile(resolve(directory,"kinetic-pavilion.webcad.json"),serializeDocument(source));
await writeFile(resolve(directory,"summary.json"),JSON.stringify({parts:ids.length,joints:Object.keys(source.assembly!.joints).length,coupled:Object.values(source.assembly!.joints).filter(j=>j.coupling).length,poses:summary,motion:{state:motion.state,rows:motion.rows.length,stats:motion.stats}},null,2));
