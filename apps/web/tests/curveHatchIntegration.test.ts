import test from "node:test";
import assert from "node:assert/strict";
import {cadDocument} from "../src/state/cadDocument";
import {previewCadCommand,applyCadPlan} from "../src/state/documentPlans";
import {undoDocument,redoDocument} from "../src/state/history";
import {documentState,resetTestDocument} from "./helpers/documentHarness";
import {curveApply,addCurveHatchFixture} from "./helpers/curveHatchFixture";
import {modelSheetSvg} from "../src/export/modelSheetExport";

test("real torus/box cap and elliptic ring retain exact source, owned hatch, regeneration and Undo",async()=>{
 resetTestDocument();await addCurveHatchFixture();const sections=()=>cadDocument.modelPresentation!.sections!,feature=(id:string)=>Object.values(cadDocument.features).find(f=>f.output===id)!;
 assert.ok(Object.values(sections()["h2-spline"].outputs).some(e=>e.kind==="spline"));assert.ok(Object.values(sections()["h2-spline"].outputs).some(e=>e.kind==="line"));
 for(const id of ["h2-ellipse","h2-spline"]){const v=sections()[id],before=documentState(),outputs=structuredClone(v.outputs),plan=await previewCadCommand({type:"upsert-model-section",view:{...v,presentation:{...v.presentation!,hatch:true}}});assert.ok(plan.result.ok,plan.result.reason);assert.deepEqual(documentState(),before);assert.ok((await applyCadPlan(plan.planId)).ok);assert.deepEqual(sections()[id].presentationWarnings,[]);assert.ok(Object.values(sections()[id].decorations!).some(e=>e.role==="hatch"));assert.deepEqual(sections()[id].outputs,outputs);}
 const curves=Object.values(sections()["h2-spline"].outputs).map(e=>structuredClone(feature(e.objectId).params)),before=documentState();
 await curveApply({type:"update-primitive",objectId:"h2-torus",params:{majorRadius:42,minorRadius:12}});
 assert.equal(sections()["h2-spline"].status,"unresolved");assert.ok(Object.values(sections()["h2-spline"].decorations!).every(e=>!cadDocument.objects[e.objectId].visible));
 assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());
 await curveApply({type:"upsert-model-section",view:{...sections()["h2-spline"]}});assert.equal(sections()["h2-spline"].status,"resolved");assert.deepEqual(sections()["h2-spline"].presentationWarnings,[]);assert.ok(Object.values(sections()["h2-spline"].outputs).some((e,i)=>JSON.stringify(feature(e.objectId).params)!==JSON.stringify(curves[i])));
 await curveApply({type:"upsert-model-sheet",id:"h2-sheet",name:"R5 curved sections",artboardId:"h2-paper",denominator:2,origin:[2000,-1000],size:[420,297],placements:{"h2-ellipse":[2060,-820],"h2-spline":[2280,-820]}});
 for(const id of ["h2-ellipse","h2-spline"]){assert.equal(sections()[id].presentation!.spacing,2);assert.deepEqual(sections()[id].presentationWarnings,[]);}
 const svg=modelSheetSvg("h2-sheet");assert.match(svg,/<ellipse /);assert.match(svg,/data-source-curve="nurbs"/);assert.match(svg,/stroke-width="0.13"/);
});
