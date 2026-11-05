import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {deserializeDocument} from "@agent-webcad/cad-document";
import {CadEngine,inspectShape} from "@agent-webcad/cad-kernel";
const dir=resolve("../../output/projects/large-cafe/3d"),d=deserializeDocument(await readFile(resolve(dir,"large-cafe-3d.webcad.json"),"utf8")),solids=Object.values(d.features).filter(f=>["primitive","extrude"].includes(f.type));
const polygon=(p:any)=>Math.abs(p.segments.reduce((sum:number,s:any)=>{assert.equal(s.kind,"line");return sum+s.start[0]*s.end[1]-s.end[0]*s.start[1];},0)/2);
const profileArea=(p:any):number=>polygon(p)-(p.holes??[]).reduce((s:number,h:any)=>s+polygon(h),0);
let expectedVolume=0;for(const f of solids){const p=f.params as any,t=d.objects[f.output].transform!,det=Math.abs(t.scale.reduce((a,b)=>a*b,1));let volume=0;if(f.type==="extrude")volume=((p.profiles??[p.profile]) as any[]).reduce((s:number,profile:any)=>s+profileArea(profile),0)*Math.abs(p.distance);else if(p.kind==="box")volume=p.width*p.depth*p.height;else if(p.kind==="cylinder")volume=Math.PI*p.radius*p.radius*p.height;else if(p.kind==="sphere")volume=4/3*Math.PI*p.radius**3;else throw Error("Unverified primitive");expectedVolume+=volume*det;}
const glb=await readFile(resolve(dir,"large-cafe.glb")),glbView=new DataView(glb.buffer,glb.byteOffset,glb.byteLength),gltf=JSON.parse(glb.subarray(20,20+glbView.getUint32(12,true)).toString("utf8"));assert.equal(gltf.nodes.length-1,solids.length);assert.equal(gltf.extras.units,"m");assert.equal(new Set(gltf.nodes.slice(1).map((n:any)=>n.extras.cadObjectId)).size,solids.length);
for(const n of gltf.nodes.slice(1))assert.ok(d.objects[n.extras.cadObjectId]);
const {oc:instance}=await CadEngine.create(),oc=instance as any,reader=new oc.STEPControl_Reader_1(),progress=new oc.Message_ProgressRange_1(),path="/large-cafe-read.step";let shape:any,explorer:any;
try{
 oc.FS.writeFile(path,await readFile(resolve(dir,"large-cafe.step")));reader.ReadFile(path);reader.TransferRoots(progress);shape=reader.OneShape();explorer=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);let count=0;while(explorer.More()){count++;explorer.Next();}assert.equal(count,solids.length);
 const m=await inspectShape(shape);assert.equal(m.validity,"valid");const delta=Math.abs(m.volume-expectedVolume);assert.ok(delta<1,`Exported STEP volume ${m.volume} vs analytical ${expectedVolume}`);
 // R0 entrance leaves are open outward: pivot Y200 minus 900 mm leaf = Y-700.
 for(let i=0;i<3;i++){assert.ok(Math.abs(m.bounds.min[i]-[0,-700,-250][i])<.001,JSON.stringify(m.bounds));assert.ok(Math.abs(m.bounds.max[i]-[15000,15000,7800][i])<.001,JSON.stringify(m.bounds));}
 const report={status:"passed",meaning:"Exported STEP reread with OCCT; separate analytical primitive/profile volumes, all solids including hidden roof and ceilings",stepSolids:count,validity:m.validity,boundsMm:m.bounds,volumeMm3:m.volume,analyticalVolumeMm3:expectedVolume,volumeDeltaMm3:delta,glb:{nodes:solids.length,meshes:gltf.meshes.length,materials:gltf.materials.length,units:gltf.extras.units,up:gltf.extras.up},sourceGraphPreserved:Object.keys(d.blocks??{}).length===20};await writeFile(resolve(dir,"independent-report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{explorer?.delete();shape?.delete();reader.delete();progress.delete();oc.FS.unlink(path);}
