import test from "node:test";
import assert from "node:assert/strict";
import { validateCommand } from "@agent-webcad/cad-commands";
import { importStep, exportStep, importStl, exportStl, importIges, exportIges } from "@agent-webcad/cad-kernel";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { cadHistory, undoDocument, redoDocument } from "../src/state/history";
import { buildBooleanMesh } from "../src/cad/kernelGeometryService";
import { resetTestDocument, restoreTestDocument, documentState, meshVolume } from "./helpers/documentHarness";

test("public legacy file APIs reject explicitly instead of reporting fake success", () => {
  for (const fn of [importStep, importStl, importIges]) assert.throws(() => fn("unused"), /unsupported/);
  for (const fn of [exportStep, exportStl, exportIges]) assert.throws(() => fn(null, "unused"), /unsupported/);
});

test("legacy cut uses the normal kernel transaction with identical volume and reversible history", async () => {
  const original = structuredClone(cadDocument);
  try {
    assert.equal(validateCommand({type:"boolean-cut",target:"a",tool:"a"}),false);
    const volumes:number[]=[];
    for (const legacy of [true,false]) {
      resetTestDocument(); cadHistory.clear();
      for (const [id,width] of [["a",10],["b",5]] as const) {
        const r=await dispatchCadCommand({type:"create-primitive",id,primitive:"box",params:{width,depth:10,height:10},position:[0,0,0]});
        assert.equal(r.ok,true,r.reason);
      }
      const before=documentState(),past=cadHistory.getPastLabels().length;
      const r=await dispatchCadCommand(legacy?{type:"boolean-cut",target:"a",tool:"b"}:{type:"boolean-operation",operation:"cut",target:"a",tool:"b"});
      assert.equal(r.ok,true,r.reason);assert.equal(r.changed,true);
      const after=documentState();assert.equal(cadHistory.getPastLabels().length,past+1);
      const output=Object.values(cadDocument.features).find(f=>f.type==="boolean")!;
      volumes.push(meshVolume(await buildBooleanMesh(output.params)));
      await undoDocument();assert.deepEqual(documentState(),before);
      await redoDocument();assert.deepEqual(documentState(),after);
    }
    assert.ok(Math.abs(volumes[0]-500)<1e-6);assert.ok(Math.abs(volumes[0]-volumes[1])<1e-6);
  } finally {restoreTestDocument(original);cadHistory.clear();}
});
