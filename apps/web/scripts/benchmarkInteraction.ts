import { performance } from "node:perf_hooks";
import { cadDocument } from "../src/state/cadDocument";
import { dispatchCadCommand } from "../src/state/dispatchCadCommand";
import { previewCadCommand, getCadPlanDrawingPaths, applyCadPlan, discardCadPlan } from "../src/state/documentPlans";
import { undoDocument, redoDocument } from "../src/state/history";
import { contourReferenceRequirements } from "../src/features/drawing-editing/commands/contourReferences";
import { describeDirectTarget } from "../src/viewport/directTargetDescription";
import { resetTestDocument } from "../tests/helpers/documentHarness";
import { createDrawingTopology } from "../src/precision/drawingTopology";
import { serializeDocument, deserializeDocument } from "@agent-webcad/cad-document";
const stats=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return {medianMs:+sorted[Math.floor(sorted.length/2)].toFixed(3),p95Ms:+sorted[Math.ceil(sorted.length*.95)-1].toFixed(3)};};
for(const background of [0,250,1000]) {
  resetTestDocument();
  await dispatchCadCommand({type:"create-drawing",id:"source",drawing:"line",params:{points:[[0,0,0],[100,0,0]],workPlane:"XY"}});
  await dispatchCadCommand({type:"create-pattern",id:"pattern",sourceObjectIds:["source"],spec:{kind:"linear",workPlane:"XY",columns:128,rows:1,spacing:[120,0]}});
  for(let i=0;i<background;i++) {
    const id=`background-${i}`,params={kind:"line",workPlane:"XY",points:[[i,100,0],[i+1,101,0]]};
    cadDocument.objects[id]={id,geometryId:`g-${id}`,name:id,visible:true,layerId:"layer-default"};
    cadDocument.features[id]={id,type:"drawing",output:id,inputs:[],params:{...params,topology:createDrawingTopology("line",params,id)}};
    cadDocument.rootObjects.push(id);cadDocument.layers["layer-default"].objectIds.push(id);
  }
  deserializeDocument(serializeDocument(cadDocument));
  const samples:Record<string,number[]>={enter:[],hover:[],references:[],preview:[],paths:[],apply:[],undo:[],redo:[]};
  for(let trial=0;trial<9;trial++) {
    let start=performance.now(); Object.values(cadDocument.features).filter(f=>f.type==="drawing"&&cadDocument.objects[f.output]?.visible); samples.enter.push(performance.now()-start);
    start=performance.now(); describeDirectTarget(cadDocument,{kind:"segment",objectId:"source",topologyId:(Object.values(cadDocument.features).find(f=>f.output==="source")!.params.topology as any).segments[0].id}); samples.hover.push(performance.now()-start);
    start=performance.now(); contourReferenceRequirements(cadDocument,["source"]); samples.references.push(performance.now()-start);
    const baseline=JSON.stringify(cadDocument);
    start=performance.now(); const p=await previewCadCommand({type:"update-pattern",patternId:"pattern",spec:{kind:"linear",workPlane:"XY",columns:128,rows:1,spacing:[121+trial,0]}}); samples.preview.push(performance.now()-start);
    if(!p.result.ok)throw new Error(p.result.reason);
    start=performance.now(); for(const change of p.changes)getCadPlanDrawingPaths(p.planId,change.objectId); samples.paths.push(performance.now()-start);
    if(JSON.stringify(cadDocument)!==baseline)throw new Error("Preview mutated the baseline");
    start=performance.now(); await applyCadPlan(p.planId); samples.apply.push(performance.now()-start);
    start=performance.now(); undoDocument(); samples.undo.push(performance.now()-start);
    start=performance.now(); redoDocument(); samples.redo.push(performance.now()-start); discardCadPlan(p.planId);
  }
  console.log(JSON.stringify({background,instances:127,trials:9,metrics:Object.fromEntries(Object.entries(samples).map(([key,values])=>[key,stats(values)]))}));
}
