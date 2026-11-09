import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {CadEngine,inspectShape} from "@agent-webcad/cad-kernel";

// Independently read the STEP emitted by the real browser/Worker acceptance task.
const directory=new URL("../../../output/verification/cad-tools-advanced/",import.meta.url);
const bytes=await readFile(new URL("model.step",directory));
const {oc:instance}=await CadEngine.create(),oc=instance as unknown as Record<string,any>;
const path="/advanced-tools-acceptance.step",reader=new oc.STEPControl_Reader_1(),progress=new oc.Message_ProgressRange_1();let shape:any;
try{
  oc.FS.writeFile(path,bytes);reader.ReadFile(path);reader.TransferRoots(progress);shape=reader.OneShape();
  const measured=await inspectShape(shape),expected=7152+3730*Math.PI;
  assert.equal(measured.validity,"valid");assert.ok(Math.abs(measured.volume-expected)<.005,`${measured.volume} vs ${expected}`);
  assert.ok(measured.bounds.min.every((v:number,i:number)=>Math.abs(v-[-40,-10,0][i])<.001));
  assert.ok(measured.bounds.max.every((v:number,i:number)=>Math.abs(v-[70,44,30][i])<.001));
  const report={status:"passed",basis:"Independent OCCT STEPControl_Reader of browser-exported BReps",validity:measured.validity,volumeMm3:measured.volume,expectedVolumeMm3:expected,toleranceMm3:.005,bounds:measured.bounds};
  await writeFile(new URL("step-inspection.json",directory),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{shape?.delete();progress.delete();reader.delete();oc.FS.unlink(path);}
