import { validateCommand, failedResult, type CadCommand, type CommandResult } from "@agent-webcad/cad-commands";
import {featureContract,evaluateVariables,type CadParameterBinding,type CadVariable,type EvaluatedVariable,type CadDocument,type GeometryMeasurement,type Sketch} from "@agent-webcad/cad-document";
import { cadDocument } from "./cadDocument";
import { prepareCadCommand,publishCadProposal,type PreparedCadCommand } from "./dispatchCadCommand";
import { enqueueDocumentCommand } from "./documentCommandQueue";
import { documentVersion,sameDocumentVersion,type DocumentVersion } from "./documentSession";
import { measureDocumentObject } from "./documentQuery";
import { publishCommandResult } from "./commandFeedback";
import { getWorldDrawingGeometry } from "../precision/worldGeometry";

export type PlanChange={objectId:string;kind:"created"|"modified"|"deleted";name:string;before?:GeometryMeasurement;after?:GeometryMeasurement;measurementError?:string};
export type PlanImpact = { kind: string; before: number; after: number; modified: number; created?: number; deleted?: number };
export type CadPlanPreview={planId:string;baseVersion:DocumentVersion;result:CommandResult;changes:PlanChange[];impact?:PlanImpact[];stale:boolean;variables:{before:Record<string,EvaluatedVariable>;after:Record<string,EvaluatedVariable>};variableChanges:{name:string;before?:CadVariable;after?:CadVariable}[];bindingChanges:{id:string;before?:CadParameterBinding;after?:CadParameterBinding}[]};
type FeatureIndex=Map<string,import("@agent-webcad/cad-document").CadFeature>;
type DrawingPaths={before?:[number,number,number][];after?:[number,number,number][];beforeClosed:boolean;afterClosed:boolean};
type StoredPlan={before:CadDocument;version:DocumentVersion;prepared:PreparedCadCommand;beforeFeatures:FeatureIndex;afterFeatures:FeatureIndex;paths:Map<string,DrawingPaths>;applied?:CommandResult};
const plans=new Map<string,StoredPlan>();

export async function previewCadCommand(payload:unknown,options:{signal?:AbortSignal}={}):Promise<CadPlanPreview> {
  if(!validateCommand(payload))throw new Error("Invalid CAD command payload.");
  options.signal?.throwIfAborted();
  const started=performance.now();
  const before=structuredClone(cadDocument),version=documentVersion();
  const prepared=await prepareCadCommand(before,payload);
  const preparedAt=performance.now();
  performance.measure("agent-webcad:preview-prepare",{start:started,end:preparedAt});
  options.signal?.throwIfAborted();
  const changes:PlanChange[]=[];
  const beforeFeatures=new Map(Object.values(before.features).map(f=>[f.output,f]));
  const afterFeatures=new Map(Object.values(prepared.proposed.features).map(f=>[f.output,f]));
  let comparisonMs=0;
  if(prepared.result.ok)for(const id of new Set([...Object.keys(before.objects),...Object.keys(prepared.proposed.objects)])){
    const compareStart=performance.now();
    const a=before.objects[id],b=prepared.proposed.objects[id];
    const af=beforeFeatures.get(id),bf=afterFeatures.get(id);
    const same=JSON.stringify([a,af])===JSON.stringify([b,bf]);comparisonMs+=performance.now()-compareStart;
    if(same)continue;
    const change:PlanChange={objectId:id,name:(b??a).name,kind:!a?"created":!b?"deleted":"modified"};
    if(af||bf)try{
      if(af&&["brep","analytic-curve"].includes(featureContract(af).representation))change.before=await measureDocumentObject(before,id,beforeFeatures);
      if(bf&&["brep","analytic-curve"].includes(featureContract(bf).representation))change.after=await measureDocumentObject(prepared.proposed,id,afterFeatures);
    }catch(e){change.measurementError=e instanceof Error?e.message:String(e);}
    changes.push(change);
  }
  options.signal?.throwIfAborted();
  performance.measure("agent-webcad:preview-compare",{start:0,duration:comparisonMs});
  performance.measure("agent-webcad:preview-diff",{start:preparedAt,end:performance.now()});
  const planId=crypto.randomUUID();
  if(plans.size>=16)plans.delete(plans.keys().next().value!);
  plans.set(planId,{before,version,prepared,beforeFeatures,afterFeatures,paths:new Map()});
  const {raw:_,...result}=prepared.result;
  const variableChanges=[...new Set([...Object.keys(before.variables??{}),...Object.keys(prepared.proposed.variables??{})])].filter(name=>JSON.stringify(before.variables?.[name])!==JSON.stringify(prepared.proposed.variables?.[name])).map(name=>({name,before:before.variables?.[name],after:prepared.proposed.variables?.[name]}));
  const bindingChanges=[...new Set([...Object.keys(before.parameterBindings??{}),...Object.keys(prepared.proposed.parameterBindings??{})])].filter(id=>JSON.stringify(before.parameterBindings?.[id])!==JSON.stringify(prepared.proposed.parameterBindings?.[id])).map(id=>({id,before:before.parameterBindings?.[id],after:prepared.proposed.parameterBindings?.[id]}));
  const impact: PlanImpact[] = [];
  const category = (f: import("@agent-webcad/cad-document").CadFeature) => f.pattern ? "Pattern instances" : f.construction ? "Constructions" : f.params.sketchId ? "Sketch projections" : f.type === "dimension" ? "Dimensions" : f.type === "extrude" ? "Extrusions" : f.type === "image" ? "Images" : "Geometry";
  for (const change of changes) {
    const a = beforeFeatures.get(change.objectId), b = afterFeatures.get(change.objectId);
    for (const kind of new Set([a && category(a), b && category(b)].filter((v): v is string => !!v))) {
      let row = impact.find(r => r.kind === kind); if (!row) { row = { kind, before: 0, after: 0, modified: 0 }; impact.push(row); }
      if (a && category(a) === kind) row.before++; if (b && category(b) === kind) row.after++; if (a && b) row.modified++;
    }
  }
  for (const [id, sketch] of Object.entries(prepared.proposed.sketches ?? {})) {
    const old = before.sketches?.[id]; if (JSON.stringify(old) === JSON.stringify(sketch)) continue;
    impact.push({ kind: `Constraints · ${id}`, before: old?.constraints.length ?? 0, after: sketch.constraints.length, modified: sketch.constraints.filter(c => JSON.stringify(old?.constraints.find(p => p.id === c.id)) !== JSON.stringify(c)).length });
    impact.push({ kind: `Driving dimensions · ${id}`, before: old?.dimensions.length ?? 0, after: sketch.dimensions.length, modified: 0 });
  }
  const beforeArtboards = before.artboards ?? {};
  const oldAssets = before.rasterAssets ?? {}, newAssets = prepared.proposed.rasterAssets ?? {};
  const assetIds = new Set([...Object.keys(oldAssets), ...Object.keys(newAssets)]);
  const changedAssets = [...assetIds].filter(id => {
    const a = oldAssets[id], b = newAssets[id];
    return !a || !b || a.contentHash !== b.contentHash || a.name !== b.name || a.mimeType !== b.mimeType || a.width !== b.width || a.height !== b.height || a.byteLength !== b.byteLength || a.dataUrl !== b.dataUrl;
  });
  if (changedAssets.length) impact.push({ kind: "Image sources", before: Object.keys(oldAssets).length, after: Object.keys(newAssets).length, created: changedAssets.filter(id => !oldAssets[id]).length, deleted: changedAssets.filter(id => !newAssets[id]).length, modified: changedAssets.filter(id => oldAssets[id] && newAssets[id]).length });
  const afterArtboards = prepared.proposed.artboards ?? {};
  const artboardIds = new Set([...Object.keys(beforeArtboards), ...Object.keys(afterArtboards)]);
  const createdArtboards = [...artboardIds].filter(id => !beforeArtboards[id] && afterArtboards[id]).length;
  const deletedArtboards = [...artboardIds].filter(id => beforeArtboards[id] && !afterArtboards[id]).length;
  const modifiedArtboards = [...artboardIds].filter(id => beforeArtboards[id] && afterArtboards[id] && JSON.stringify(beforeArtboards[id]) !== JSON.stringify(afterArtboards[id])).length;
  if (createdArtboards || modifiedArtboards || deletedArtboards) {
    impact.push({ kind: "Artboards", before: Object.keys(beforeArtboards).length, after: Object.keys(afterArtboards).length, created: createdArtboards, modified: modifiedArtboards, deleted: deletedArtboards });
  }
  const sceneIds = new Set([...Object.keys(before.scenes ?? {}), ...Object.keys(prepared.proposed.scenes ?? {})]);
  const sceneChanges = [...sceneIds].filter(id => JSON.stringify(before.scenes?.[id]) !== JSON.stringify(prepared.proposed.scenes?.[id]));
  if (sceneChanges.length) impact.push({kind: "Scenes", before: Object.keys(before.scenes ?? {}).length, after: Object.keys(prepared.proposed.scenes ?? {}).length, modified: sceneChanges.filter(id=>before.scenes?.[id] && prepared.proposed.scenes?.[id]).length, created: sceneChanges.filter(id=>!before.scenes?.[id]).length, deleted: sceneChanges.filter(id=>!prepared.proposed.scenes?.[id]).length});
  const beforeBlocks = before.blocks ?? {};
  const afterBlocks = prepared.proposed.blocks ?? {};
  const blockIds = new Set([...Object.keys(beforeBlocks), ...Object.keys(afterBlocks)]);
  const createdBlocks = [...blockIds].filter(id => !beforeBlocks[id] && afterBlocks[id]).length;
  const deletedBlocks = [...blockIds].filter(id => beforeBlocks[id] && !afterBlocks[id]).length;
  const modifiedBlocks = [...blockIds].filter(id => beforeBlocks[id] && afterBlocks[id] && JSON.stringify(beforeBlocks[id]) !== JSON.stringify(afterBlocks[id])).length;
  if (createdBlocks || modifiedBlocks || deletedBlocks) impact.push({ kind: "Components", before: Object.keys(beforeBlocks).length, after: Object.keys(afterBlocks).length, created: createdBlocks, modified: modifiedBlocks, deleted: deletedBlocks });
  return structuredClone({planId,baseVersion:version,result,changes,impact,variableChanges,bindingChanges,variables:{before:evaluateVariables(before.variables),after:evaluateVariables(prepared.proposed.variables)},stale:!sameDocumentVersion(version)||JSON.stringify(before)!==JSON.stringify(cadDocument)});
}

export function discardCadPlan(planId:string){plans.delete(planId);}

/** Detached solved sources for canvas review; callers cannot alter the applied proposal. */
export function getCadPlanSketchPreview(planId:string,sketchId:string):{before:Sketch;after:Sketch}|undefined {
  const stored=plans.get(planId);
  const before=stored?.before.sketches?.[sketchId],after=stored?.prepared.proposed.sketches?.[sketchId];
  if(!stored?.prepared.result.ok||!before||!after)return;
  return structuredClone({before,after});
}

export function getCadPlanDrawingPaths(planId:string,objectId:string){
  const stored=plans.get(planId);if(!stored?.prepared.result.ok)return;
  let paths=stored.paths.get(objectId);
  if(!paths){
    const path=(document:CadDocument,index:FeatureIndex)=>{const object=document.objects[objectId],feature=index.get(objectId);return object&&feature?getWorldDrawingGeometry(object,feature)?.points:undefined;};
    const closed=(index:FeatureIndex)=>{const feature=index.get(objectId);return feature?.params.closed===true||feature?.params.kind==="rectangle"||feature?.params.kind==="circle";};
    paths={before:path(stored.before,stored.beforeFeatures),after:path(stored.prepared.proposed,stored.afterFeatures),beforeClosed:closed(stored.beforeFeatures),afterClosed:closed(stored.afterFeatures)};
    stored.paths.set(objectId,paths);
  }
  // Cached geometry remains private to this immutable proposal.
  return structuredClone(paths);
}

export function getCadPlanDimensionParams(planId:string,objectId:string) {
  const stored=plans.get(planId);if(!stored?.prepared.result.ok)return;
  const params=(index:FeatureIndex)=>{const feature=index.get(objectId);return feature?.type==="dimension"?feature.params:undefined;};
  return structuredClone({before:params(stored.beforeFeatures),after:params(stored.afterFeatures)});
}

/** Applying a preview uses the very same evaluated proposal and IDs, once. */
export async function applyCadPlan(planId:string):Promise<CommandResult&{alreadyApplied?:boolean}> {
  return enqueueDocumentCommand(async()=>{
    const stored=plans.get(planId);
    if(!stored)throw new Error("Preview expired; preview the edit again.");
    if(stored.applied)return structuredClone({...stored.applied,changed:false,alreadyApplied:true});
    const {prepared,before,version}=stored;
    if(!sameDocumentVersion(version)||JSON.stringify(before)!==JSON.stringify(cadDocument))return failedResult(prepared.command,"The document changed; preview the edit again.");
    if(!prepared.result.ok)return structuredClone(prepared.result);
    publishCadProposal(prepared,before);
    const {raw:_,...result}=prepared.result;
    stored.applied=structuredClone(result);
    publishCommandResult(result);
    return structuredClone(result);
  });
}
