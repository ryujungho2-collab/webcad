import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {CadEngine,inspectShape} from "@agent-webcad/cad-kernel";
const directory=new URL("../../../output/projects/curve-lamp/",import.meta.url),bytes=await readFile(new URL("lamp.step",directory)),handoff=JSON.parse(await readFile(new URL("handoff.json",directory),"utf8"));
const {oc:instance}=await CadEngine.create(),oc=instance as unknown as Record<string,any>,path="/curve-lamp.step",reader=new oc.STEPControl_Reader_1(),progress=new oc.Message_ProgressRange_1();let shape:any,explorer:any;
try{
 oc.FS.writeFile(path,bytes);reader.ReadFile(path);reader.TransferRoots(progress);shape=reader.OneShape();explorer=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
 const expected=[...Object.values(handoff.expectedVolumesMm3) as number[],handoff.shadeMeasurement.volume].sort((a,b)=>a-b),actual:any[]=[];while(explorer.More()){const solid=explorer.Current();try{const m=await inspectShape(solid);assert.equal(m.validity,"valid");actual.push(m);}finally{solid.delete();}explorer.Next();}
 assert.equal(actual.length,5);actual.sort((a,b)=>a.volume-b.volume);actual.forEach((m,i)=>assert.ok(Math.abs(m.volume-expected[i])<Math.max(.1,expected[i]*1e-5),`${m.volume} / ${expected[i]}`));
 const report={status:"passed",basis:"Fresh OCCT STEPControl_Reader and per-solid BRep validity / volume; tube oracle independently integrates cardinal-Hermite speed",partCount:actual.length,expectedVolumesMm3:expected,actual,limits:"Shade volume compared to the source BRep; stem, base, diffuser and torus use independent formulas."};await writeFile(new URL("step-inspection.json",directory),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,partCount:actual.length,actualVolumesMm3:actual.map(v=>v.volume)}));
}finally{explorer?.delete();shape?.delete();progress.delete();reader.delete();oc.FS.unlink(path);}
