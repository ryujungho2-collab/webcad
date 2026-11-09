import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {restoreTestDocument,documentState} from "../tests/helpers/documentHarness";
import {largeCafeModelDesign,CAFE_OPENINGS} from "./largeCafeModelDesign";
import {exportGlbBytes} from "../src/export/glbExport";
import {exportStepBytes} from "../src/export/exportModel";
import {measureDocumentObject} from "../src/state/documentQuery";

const out=resolve("../../output/projects/large-cafe/3d");await mkdir(out,{recursive:true});
const source=await readFile(resolve(out,"../large-cafe.webcad.json"),"utf8"),original=deserializeDocument(source);
restoreTestDocument(original);cadDocument.id="common-ground-cafe-3d";cadHistory.clear();
const before=documentState(),design=largeCafeModelDesign(cadDocument);
console.log(`Converting issued R0: ${design.allIds.length} BRep solids / ${design.receipts.length} assemblies / ${design.commands.length} commands`);
const result=await dispatchCadCommand({type:"batch",label:"Convert issued cafe plans to 3D",commands:design.commands});assert.ok(result.ok,result.reason);
for(const id of design.allIds)assert.ok(cadDocument.objects[id],`Missing model output ${id}`);
assert.equal(cadHistory.getPastLabels().length,1);const after=documentState();assert.ok(undoDocument());assert.deepEqual(documentState(),before);assert.ok(redoDocument());assert.deepEqual(documentState(),after);
const encoded=serializeDocument(cadDocument);assert.equal(serializeDocument(deserializeDocument(encoded)),encoded);
await writeFile(resolve(out,"large-cafe-3d.webcad.json"),encoded);
const slab=await measureDocumentObject(cadDocument,"cafe3d-2f-slab"),area=225000000-CAFE_OPENINGS.reduce((n,h)=>n+h.w*h.d,0),expected=area*250;
assert.equal(slab.validity,"valid");assert.ok(Math.abs(slab.volume!-expected)<1,`Slab holes: ${slab.volume} vs ${expected}`);
assert.ok(Math.abs(slab.bounds!.min[2]-3650)<.001&&Math.abs(slab.bounds!.max[2]-3900)<.001);
const wall=design.receipts.find(r=>r.mode==="live-profile"&&r.role==="walls")!,wallFeature=Object.values(cadDocument.features).find(f=>f.output===wall.objectIds[0])!;
assert.deepEqual(wallFeature.inputs,wall.sourceObjectIds);
const oldHeight=Number(wallFeature.params.distance);const edit=await dispatchCadCommand({type:"update-extrude",objectId:wall.objectIds[0],distance:oldHeight+100});assert.ok(edit.ok,edit.reason);assert.ok(undoDocument());assert.deepEqual(documentState(),after);cadHistory.clear();
console.log("Native source links, slab holes, height edit, Undo/Redo and save/reopen passed. Exporting full model…");
// Export the complete assembly. The saved CAD opening state hides roof/ceilings for inspection.
const full=structuredClone(cadDocument);for(const id of design.layers)if(!id.endsWith("profiles"))full.layers[id].visible=true;
await writeFile(resolve(out,"large-cafe.glb"),await exportGlbBytes(design.allIds,full));
for(const id of design.layers)if(!id.endsWith("profiles"))cadDocument.layers[id].visible=true;
try{await writeFile(resolve(out,"large-cafe.step"),await exportStepBytes(design.allIds));}finally{restoreTestDocument(deserializeDocument(encoded));}
const report={status:"passed",sourceFile:"../large-cafe.webcad.json",sourceSha256:createHash("sha256").update(source).digest("hex"),units:"mm",modelFile:"large-cafe-3d.webcad.json",modelSolids:design.allIds.length,assemblies:design.receipts.length,layers:design.layers,floors:design.floors,slab:{openings:CAFE_OPENINGS,volumeMm3:slab.volume,expectedVolumeMm3:expected,bounds:slab.bounds},undoRedoExact:true,saveReopenExact:true,editableExtrusion:true,sourceMapping:design.receipts,assumptions:["R0 XY layout retained; floor 1 source origin 0,0, floor 2 source origin 22000,0 maps to the same XY footprint.","FFL 0/3900; roof 7800; slab 250; ceiling 3200; wall/column 3650 from R0 section.","Glazed elevations interpreted from R0 notes/elevations: sill150, glass2650; mullion positions assumed.","Furniture, equipment heights, doors 2100, handrails and stair tread construction are generic modeling assumptions.","Wall extrusions and slab profiles are live. Multi-part furniture and interpreted facade recipes are snapshots, mapped to their 2D source IDs.","CAD solids are individually valid. An assembly may contain touching/intersecting parts; this is not a structural/MEP clash-free or construction-approved model.","STEP is exact assembled BRep in mm. GLB is tessellated assembled geometry with PBR finishes in metres/Y up; display explosions/clipping are not baked."]};
await writeFile(resolve(out,"conversion-report.json"),JSON.stringify(report,null,2));console.log(`DONE: ${design.allIds.length} editable solids; STEP + material GLB + native document.`);
