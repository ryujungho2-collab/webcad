import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {serializeDocument,deserializeDocument} from "@agent-webcad/cad-document";
import {cadDocument} from "../src/state/cadDocument";
import {dispatchCadCommand} from "../src/state/dispatchCadCommand";
import {cadHistory,undoDocument,redoDocument} from "../src/state/history";
import {resetTestDocument,documentState} from "../tests/helpers/documentHarness";
import {flowCourtDesign} from "./flowCourtDesign";
import {collectArtboardExportItems} from "../src/export/exportModel";
import {encodeSvg} from "../src/export/svgWriter";
import {encodeFrameDxf} from "../src/export/frameDxf";
import {encodeDxf} from "../src/interop/dxfWriter";
import {planCurveLayout} from "../src/state/curveLayoutPlan";
import {curveStations} from "../src/precision/curveStations";
import {getObjectWorldBounds} from "../src/precision/worldBounds";
import {flowBoundary,inside,flowFloorOpenings,roofHeight} from "./flowCourtGeometry";
const dir=resolve("../../output/projects/flow-court");await mkdir(dir,{recursive:true});resetTestDocument();cadDocument.id="flow-court-advanced-2d";
const design=flowCourtDesign(),apply=async(c:Parameters<typeof dispatchCadCommand>[0])=>{const r=await dispatchCadCommand(c);assert.ok(r.ok,`${c.type}: ${r.reason}`);return r;};
console.log(`Creating ${design.commands.length} editable native operations`);
await apply({type:"batch",label:"FLOW COURT / source design",commands:design.commands.filter(c=>c.type!=="create-dimension")});
await apply({type:"batch",label:"FLOW COURT / dimensions",commands:design.commands.filter(c=>c.type==="create-dimension")});
for(const floor of [1,2]){
 const sourceId=`flow-${floor}-outline`,layout=planCurveLayout(cadDocument,sourceId,{id:`flow-facade-${floor}`,layerId:"flow-guides",count:96,start:.14,end:.98,offset:0,tickLength:300});const result=await apply(layout.command);design.frames.find(f=>f.id===`flow-plan-${floor}`)!.ids.push(...result.createdIds);
 // A built-in banquette follows the same source curve at two normal offsets.
 const edgeA=curveStations(cadDocument,sourceId,{count:40,start:.66,end:.79,offset:550}),edgeB=curveStations(cadDocument,sourceId,{count:40,start:.66,end:.79,offset:1100}),id=`flow-bench-${floor}`;
 await apply({type:"create-drawing",id,drawing:"polyline",layerId:"flow-furniture",params:{workPlane:"XY",closed:true,points:[...edgeA.stations.map(s=>s.point),...edgeB.stations.map(s=>s.point).reverse()],vectorStyle:{stroke:"#827052",strokeWidth:.18,fill:"#d5b895",opacity:1,fillGradient:null}}});design.frames.find(f=>f.id===`flow-plan-${floor}`)!.ids.push(id);
}
assert.deepEqual(design.seatCounts,[6,12]);
const placementChecks=design.placements.filter(p=>p.seats>0).map(p=>{const b=getObjectWorldBounds(cadDocument,p.id)!,origin=(p.floor-1)*34000,ring=flowBoundary(p.floor).map(p=>[p[0],p[1]] as [number,number]),points=[[b.min[0]-origin,b.min[1]],[b.min[0]-origin,b.max[1]],[b.max[0]-origin,b.min[1]],[b.max[0]-origin,b.max[1]]] as [number,number][];return {id:p.id,symbol:p.symbol,floor:p.floor,bounds:b,insideEnvelope:points.every(p=>inside(p,ring)),outsideVoids:points.every(p=>!flowFloorOpenings(p.floor).some(r=>inside(p,r)))};});
const bad=placementChecks.filter(p=>!p.insideEnvelope||!p.outsideVoids);console.log("Seat envelope review",JSON.stringify(bad));assert.equal(bad.length,0,"Seating leaves the building or intersects a courtyard opening");
for(const [i,f]of design.frames.entries())await apply({type:"create-artboard",id:f.id,name:f.name,workPlane:"XY",origin:[i*900,-2000],size:f.size,frame:{memberIds:f.ids,sourceOrigin:f.origin,denominator:f.scale}});
for(const id of ["flow-plan-1","flow-plan-2"]){const board=cadDocument.artboards![id];await writeFile(resolve(dir,`${id}.svg`),encodeSvg([],{items:collectArtboardExportItems(id),viewBox:board,background:"#ffffff"}));}
const pages:string[]=[],ordered=[...design.sheets].sort((a,b)=>a.id==="G001"?-1:b.id==="G001"?1:a.id.localeCompare(b.id));
for(const [i,sheet]of ordered.entries()){
 console.log(`Issuing ${sheet.id}`);await apply({type:"layout-frame-sheet-set",id:`flow-${sheet.id}`,name:sheet.name,frameIds:sheet.frames,sectionIds:[],fixedFrameIds:[],denominators:[1],origin:[i*900,-4000],size:sheet.size,margin:10,gap:6,maxPages:1,alignment:"none",template:"compact",fields:{drawingName:`${sheet.id} / ${sheet.name}`,author:"FLOW COURT / ADVANCED 2D",revision:"R1 / 2026-10-22"}});
 const page=Object.values(cadDocument.artboards!).find(b=>b.frameSheet?.setId===`flow-${sheet.id}`)!;pages.push(page.id);const items=collectArtboardExportItems(page.id);await writeFile(resolve(dir,`${sheet.id}.svg`),encodeSvg([],{items,viewBox:page,background:"#ffffff"}));await writeFile(resolve(dir,`${sheet.id}.dxf`),encodeFrameDxf(page,items));
}
for(const f of design.frames)await apply({type:"update-artboard",artboardId:f.id,visible:false});
const original=documentState();await apply({type:"move-object",objectId:"flow-bar",translation:[0,50,0]});assert.ok(undoDocument());assert.deepEqual(documentState(),original);assert.ok(redoDocument());assert.ok(undoDocument());assert.deepEqual(documentState(),original);
const native=serializeDocument(cadDocument);assert.equal(serializeDocument(deserializeDocument(native)),native);await writeFile(resolve(dir,"flow-court.webcad.json"),native);const dxf=encodeDxf(cadDocument);assert.equal(dxf.skipped,0,dxf.warnings.join(";"));await writeFile(resolve(dir,"flow-court-model.dxf"),dxf.text);
await writeFile(resolve(dir,"placements.json"),JSON.stringify(design.placements,null,2));
const report={date:"2026-10-22",status:"design-development",areas:design.areas,program:"Design and media exhibition pavilion",seats:design.seatCounts,objects:Object.keys(cadDocument.objects).length,splines:Object.values(cadDocument.features).filter(f=>f.params.kind==="spline").length,pages:pages.map(id=>({id,name:cadDocument.artboards![id].name,size:cadDocument.artboards![id].size})),facadeStations:192,wallProfileToleranceMm:2,roofDatums:{crossing:roofHeight(12000,8000),source:"Shared height function, same X/Y input in sections and elevation studies; no 3D surface is generated"},stair:{rise:4200,risers:28,riser:150,mainGoing:280,rearGoing:250},dxf:{entities:dxf.entities,skipped:dxf.skipped},placementChecks,undoRedoExact:true,saveReloadExact:true,limits:["Authored advanced 2D design, not surveyed/approved construction documentation.","Spline source curves exact; wall polyline chord bound2mm and curve stations chord bound0.05mm.","Curve layouts and banquette derivatives are explicit snapshots, not live source dependencies.","Closed spline-to-solid currently requires a reviewed polyline approximation; exact spline BRep extrusion is outside this task.","Roof profile is shared 2D design data. Elevations remain design studies pending 3D surface development.","Areas are outer-envelope minus courtyard, stair and lift openings, including wall footprints; not certified usable area."]};await writeFile(resolve(dir,"report.json"),JSON.stringify(report,null,2));console.log(`DONE: ${pages.length} sheets / ${design.seatCounts.join("+")} seats / ${report.objects} objects`);cadHistory.clear();
