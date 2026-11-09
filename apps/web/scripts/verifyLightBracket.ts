import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {CadEngine,inspectShape} from '@agent-webcad/cad-kernel';
import {deserializeDocument,featureContract} from '@agent-webcad/cad-document';
import {collectExportDrawings} from '../src/export/exportModel';
import {encodeSvg} from '../src/export/svgWriter';
import {encodeDxf} from '../src/interop/dxfWriter';

const directory=new URL('../../../output/projects/light-sensor-bracket/',import.meta.url);
const document=deserializeDocument(await readFile(new URL('bracket.webcad.json',directory),'utf8'));
const clean=deserializeDocument(await readFile(new URL('bracket-model.webcad.json',directory),'utf8'));
const visibleSolids=clean.rootObjects.filter(id=>{const o=clean.objects[id],f=Object.values(clean.features).find(f=>f.output===id);return o.visible&&clean.layers[o.layerId].visible&&f&&featureContract(f).representation==='brep';});
assert.equal(visibleSolids.length,1,'Clean native project has exactly one visible model body.');
const holes:Record<string,unknown>={};
for(const[id,centers]of [['bracketFront',[[-75,28],[-45,28]]],['bracketTop',[[15,-43],[45,-43]]]] as const){
 const view=document.modelPresentation!.sections![id];assert.equal(view.status,'resolved');
 const ids=Object.values(view.outputs).map(o=>o.objectId),circles=ids.map(id=>Object.values(document.features).find(f=>f.output===id)!).filter(f=>f.params.kind==='circle');
 assert.equal(circles.length,2,`${id} contains two actual bore intersections.`);
 for(const center of centers)assert.ok(circles.some(f=>{const p=f.params.center as number[];return Math.abs(Number(f.params.radius)-2.25)<1e-6&&Math.hypot(p[0]-center[0],p[1]-center[1])<1e-5;}),`${id}: actual Ø4.5 bore at paper ${center}.`);
 holes[id]=circles.map(f=>({center:f.params.center,radius:f.params.radius}));
 const dxf=encodeDxf(document,ids);assert.equal(dxf.skipped,0);await writeFile(new URL(`${id}.dxf`,directory),dxf.text);await writeFile(new URL(`${id}.svg`,directory),encodeSvg(collectExportDrawings('XY',document,ids)));
}
const expectedVolume=60*3*45+60*40*3-60*3*3-4*Math.PI*(4.5/2)**2*3-8*3*6;
const {oc:instance}=await CadEngine.create(),oc=instance as unknown as Record<string,any>,path='/light-bracket.step',reader=new oc.STEPControl_Reader_1(),progress=new oc.Message_ProgressRange_1();let shape:any,explorer:any;
try{oc.FS.writeFile(path,await readFile(new URL('bracket.step',directory)));reader.ReadFile(path);reader.TransferRoots(progress);shape=reader.OneShape();explorer=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);const actual:any[]=[];while(explorer.More()){const solid=explorer.Current();try{const m=await inspectShape(solid);assert.equal(m.validity,'valid');assert.ok(Math.abs(m.volume!-expectedVolume)<.003);actual.push(m);}finally{solid.delete();}explorer.Next();}assert.equal(actual.length,1);const report={status:'passed',dimensionsMm:[60,40,45],thicknessMm:3,expectedVolumeMm3:expectedVolume,formula:'60×3×45 + 60×40×3 − 60×3×3 − 4π(4.5/2)²×3 − 8×3×6',freshStepSolidCount:1,actual,actualSectionBores:holes,cleanModelSolidId:visibleSolids[0],limits:'Small Boolean modeling and cross-channel workflow validation. Not a sheet-metal unfolding, tolerance or load-rating test.'};await writeFile(new URL('step-inspection.json',directory),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'passed',solidCount:1,volumeMm3:actual[0].volume,actualBoresChecked:4}));}
finally{explorer?.delete();shape?.delete();progress.delete();reader.delete();oc.FS.unlink(path);}
