import {readFileSync,writeFileSync} from "node:fs";
import assert from "node:assert/strict";
import {deserializeDocument,type CadDocument} from "@agent-webcad/cad-document";
import {encodeDxf} from "../src/interop/dxfWriter";
import {planDxfImport} from "../src/interop/dxfImport";
import {prepareCadCommand} from "../src/state/dispatchCadCommand";
import {collectExportDrawings} from "../src/export/exportModel";
const dir="../../output/external/civil-projects/restoration-01",baseline=deserializeDocument(readFileSync(dir+"/baseline.webcad.json","utf8")),restored=deserializeDocument(readFileSync(dir+"/restored.webcad.json","utf8"));
const encoded=encodeDxf(restored);assert.equal(encoded.text,encodeDxf(baseline).text,"Restored full DXF differs from baseline DXF");
const plan=planDxfImport(encoded.text,new Map(),"geometry-roundtrip");assert.ok(plan.ok);
const empty:CadDocument={id:"geometry-roundtrip",revision:0,objects:{},features:{},sketches:{},layers:{"layer-default":{id:"layer-default",name:"Default",visible:true,locked:false,objectIds:[]}},rootObjects:[],rootLayers:["layer-default"]};
const prepared=await prepareCadCommand(empty,plan.command);assert.ok(prepared.result.ok,prepared.result.reason);
// Independent normalized line-segment multiset; ignores regenerated source IDs and closed-path duplication.
const segments=(d:CadDocument)=>{const records:string[]=[];for(const line of collectExportDrawings("XY",d)){const pts=line.closed?[...line.points,line.points[0]]:line.points;for(let i=1;i<pts.length;i++){const a=pts[i-1].map(v=>Number(v.toFixed(4))),b=pts[i].map(v=>Number(v.toFixed(4)));if(JSON.stringify(a)===JSON.stringify(b))continue;const ends=[a,b].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));records.push(JSON.stringify([ends,line.color,line.lineWeight,line.dash??[],line.fill??null,line.opacity??1]));}}return records.sort();};
const before=segments(baseline),after=segments(prepared.proposed);writeFileSync(dir+"/geometry-roundtrip-report.json",JSON.stringify({status:JSON.stringify(before)===JSON.stringify(after)?"passed":"mismatch",baselineSegments:before.length,reimportSegments:after.length,coordinateQuantizationMm:.0001,fullDxfByteIdentical:true,meaning:"Multiset of rendered path segments, stroke color/width/dash and fill; sampled circular curves, not a BRep equivalence proof"},null,2));
assert.deepEqual(after,before);console.log("Complete rendered segment multiset retained:",before.length);
