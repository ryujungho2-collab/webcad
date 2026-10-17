import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {deserializeDocument,serializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {restoreTestDocument} from "../tests/helpers/documentHarness";
import {modelSheetSvg,modelSheetDxf} from "../src/export/modelSheetExport";
const out=resolve('../../output/projects/courtyard-commons/h1-expression');await mkdir(out,{recursive:true});restoreTestDocument(deserializeDocument(await readFile(resolve(out,'../p01-fixed/courtyard-commons.webcad.json'),'utf8')));
const metrics:{id:string;ms:number;cuts:number;background:number;hatch:number;warnings:string[]}[]=[];let p=cadDocument.modelPresentation!;
for(const view of Object.values(p.sections!)){
 const {outputs,status,reason,decorations,presentationWarnings,...source}=view,depth=view.basis==='XY'?1500:20000;
 const start=performance.now(),r=await dispatchCadCommand({type:'upsert-model-section',view:{...source,presentation:{background:true,keep:view.basis==='XZ'?'positive':'negative',depth,hatch:true,spacing:2,angle:45,cutWeight:.5,backgroundWeight:.18,hatchWeight:.13,label:true}}});assert.ok(r.ok,r.reason);p=cadDocument.modelPresentation!;
 const v=p.sections![view.id],values=Object.values(v.decorations??{}),m={id:v.id,ms:Math.round(performance.now()-start),cuts:Object.keys(v.outputs).length,background:values.filter(e=>e.role==='background').length,hatch:values.filter(e=>e.role==='hatch').length,warnings:v.presentationWarnings??[]};metrics.push(m);console.log(JSON.stringify(m));
}
const s=p.sheets!['studio-set'],b=cadDocument.artboards![s.artboardId],start=performance.now(),r=await dispatchCadCommand({type:'layout-model-sheet-set',id:s.id,name:'Courtyard Commons',artboardId:s.artboardId,viewIds:[...Object.keys(p.sections!),...Object.keys(p.projections)],fixedViewIds:[],denominators:[100],origin:[...b.origin],size:[...b.size],margin:12,gap:10,maxPages:8,alignment:'none',template:'standard',fields:{...s.publication!.fields,revision:'R3 architectural expression'}});assert.ok(r.ok,r.reason);p=cadDocument.modelPresentation!;const layoutMs=Math.round(performance.now()-start);
const pages=Object.values(p.sheets!).sort((a,b)=>a.publication!.page-b.publication!.page);for(const page of pages){const i=page.publication!.page;await writeFile(resolve(out,`sheet-${i}.svg`),modelSheetSvg(page.id));const dxf=modelSheetDxf(page.id);assert.equal(dxf.skipped,0);await writeFile(resolve(out,`sheet-${i}.dxf`),dxf.text);}
const data=serializeDocument(cadDocument);assert.deepEqual(deserializeDocument(data),cadDocument);await writeFile(resolve(out,'courtyard-commons.webcad.json'),data);await writeFile(resolve(out,'report.json'),JSON.stringify({date:'2026-10-13',parts:Object.keys(p.parts).length,views:7,pages:pages.length,schema:34,metrics,layoutMs,limits:['Retained depth is explicit; no inferred architectural floor semantics.','No material inference, window/door/stair symbols or filled surface hatch.','Program-note anchors remain the earlier study placement.','Ellipse/spline rejects the whole unsupported background; no sampled export.']},null,2)+'\n');console.log(`Saved ${out}: ${pages.length} pages`);
