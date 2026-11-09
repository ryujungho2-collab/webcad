import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {parseDxf} from "../src/interop/dxfParser";
import {planDxfImport} from "../src/interop/dxfImport";
const output=process.argv.includes("--phase=2")?"../../output/external/civil-projects/phase-02":"../../output/external/civil-projects";mkdirSync(output,{recursive:true});
const s=readFileSync("../../output/external/civil-projects/converted.dxf","utf8"),p=parseDxf(s),r=planDxfImport(s,new Map(),"external-civil");
const count=(a:any[])=>a.reduce((r,v)=>(r[v.kind]=(r[v.kind]??0)+1,r),{});
const warnings=p.warnings.reduce((r:any,w)=>(r[w]=(r[w]??0)+1,r),{});
const report={root:count(p.entities),blocks:Object.keys(p.blocks).length,blockEntities:count(Object.values(p.blocks).flatMap(b=>b.entities)),layers:p.layers,units:p.unitName,warnings,import:r.ok?{ok:r.ok,created:r.stats.created,skipped:r.stats.skipped}:r};
writeFileSync(output+"/improved.json",JSON.stringify(report,null,2));console.log(JSON.stringify({...report,import:r.ok?{ok:true,created:r.stats.created,warnings:r.stats.skipped.length,conversions:r.stats.curveConversions?.length,commands:r.command.type==="batch"?r.command.commands.length:1}:r},null,2));

import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {resetTestDocument,documentState,restoreTestDocument} from "../tests/helpers/documentHarness";
import {cadDocument} from "../src/state/cadDocument";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {collectExportDrawings,collectExportAnnotations} from "../src/export/exportModel";
import {encodeSvg} from "../src/export/svgWriter";
import assert from "node:assert/strict";
if(r.ok){resetTestDocument();const before=documentState(),start=performance.now(),applied=await dispatchCadCommand(r.command);assert.ok(applied.ok,applied.reason);const ms=performance.now()-start;assert.equal(cadHistory.getPastLabels().length,1);const imported=documentState();undoDocument();assert.deepEqual(documentState(),before);redoDocument();assert.deepEqual(documentState(),imported);const portable=serializeDocument(cadDocument);restoreTestDocument(deserializeDocument(portable));const annotations=collectExportAnnotations("XY"),lines=collectExportDrawings("XY");assert.ok(annotations.texts.some(t=>t.text==="BEDROOM"));assert.ok(annotations.texts.some(t=>t.text.includes("60'")));writeFileSync(output+"/imported.webcad.json",portable);writeFileSync(output+"/imported.svg",encodeSvg([...lines,...annotations.lines],{texts:annotations.texts,background:"#ffffff"}));writeFileSync(output+"/application-report.json",JSON.stringify({status:"passed",importMs:ms,roots:cadDocument.rootObjects.length,objects:Object.keys(cadDocument.objects).length,blocks:Object.keys(cadDocument.blocks??{}).length,lines:lines.length+annotations.lines.length,texts:annotations.texts.length,undoRedo:true,reopen:true},null,2));console.log("Applied / Undo / Redo / reopened",ms,"ms",annotations.texts.length,"labels");}
