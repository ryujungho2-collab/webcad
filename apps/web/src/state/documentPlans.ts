import type {SheetSetReport} from "./modelSheetSetService";
import type {SheetLayoutReport} from "../precision/modelSheetLayout";
import {getObjectTransform} from "../precision/objectTransform";
import {explodedDisplayOffset} from "../precision/modelPresentation";
import {blockStretchEnvelope} from "../features/drawing-editing/geometry/blockStretch";
import {worldDraftingGeometry} from "../precision/draftingGeometry";
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
export type CadPlanPreview={frameStitch?:import("../precision/frameStitch").FrameStitchReport;frameSheets?:ReturnType<typeof import("../precision/frameSheetLayout").layoutFrameSheets>;frameLayout?:import("../precision/frameLinks").FrameLinkLayout;sheetSet?:SheetSetReport;sheetLayout?:SheetLayoutReport;planId:string;baseVersion:DocumentVersion;result:CommandResult;changes:PlanChange[];impact?:PlanImpact[];stale:boolean;variables:{before:Record<string,EvaluatedVariable>;after:Record<string,EvaluatedVariable>};variableChanges:{name:string;before?:CadVariable;after?:CadVariable}[];bindingChanges:{id:string;before?:CadParameterBinding;after?:CadParameterBinding}[]};
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
      if(af&&["brep","analytic-curve","planar-region"].includes(featureContract(af).representation))change.before=await measureDocumentObject(before,id,beforeFeatures);
      if(bf&&["brep","analytic-curve","planar-region"].includes(featureContract(bf).representation))change.after=await measureDocumentObject(prepared.proposed,id,afterFeatures);
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
  const frameStitch=(_ as {frameStitch?:CadPlanPreview["frameStitch"]}|undefined)?.frameStitch;
  const frameSheets=(_ as {frameSheets?:CadPlanPreview["frameSheets"]}|undefined)?.frameSheets;
  const frameLayout=(_ as {frameLayout?:import("../precision/frameLinks").FrameLinkLayout}|undefined)?.frameLayout;
  const sheetSet=(_ as {sheetSet?:SheetSetReport}|undefined)?.sheetSet;
  const sheetLayout=(_ as {sheetLayout?:SheetLayoutReport}|undefined)?.sheetLayout;
  const variableChanges=[...new Set([...Object.keys(before.variables??{}),...Object.keys(prepared.proposed.variables??{})])].filter(name=>JSON.stringify(before.variables?.[name])!==JSON.stringify(prepared.proposed.variables?.[name])).map(name=>({name,before:before.variables?.[name],after:prepared.proposed.variables?.[name]}));
  const bindingChanges=[...new Set([...Object.keys(before.parameterBindings??{}),...Object.keys(prepared.proposed.parameterBindings??{})])].filter(id=>JSON.stringify(before.parameterBindings?.[id])!==JSON.stringify(prepared.proposed.parameterBindings?.[id])).map(id=>({id,before:before.parameterBindings?.[id],after:prepared.proposed.parameterBindings?.[id]}));
  const impact: PlanImpact[] = [];
  const oldLibrary=before.componentLibrary??{},newLibrary=prepared.proposed.componentLibrary??{},changedDefinitions=[...new Set([...Object.keys(oldLibrary),...Object.keys(newLibrary)])].filter(id=>JSON.stringify(oldLibrary[id])!==JSON.stringify(newLibrary[id]));
  if(changedDefinitions.length)impact.push({kind:"Component definitions",before:Object.keys(oldLibrary).length,after:Object.keys(newLibrary).length,created:changedDefinitions.filter(id=>!oldLibrary[id]).length,deleted:changedDefinitions.filter(id=>!newLibrary[id]).length,modified:changedDefinitions.filter(id=>oldLibrary[id]&&newLibrary[id]).length});
  const category = (f: import("@agent-webcad/cad-document").CadFeature) => f.pattern ? "Pattern instances" : f.construction ? "Constructions" : f.params.sketchId ? "Sketch projections" : f.type === "dimension" ? "Dimensions" : f.type === "extrude" ? "Extrusions" : f.type === "image" ? "Images" : "Geometry";
  for (const change of changes) {
    const a = beforeFeatures.get(change.objectId), b = afterFeatures.get(change.objectId);
    for (const kind of new Set([a && category(a), b && category(b)].filter((v): v is string => !!v))) {
      let row = impact.find(r => r.kind === kind); if (!row) { row = { kind, before: 0, after: 0, modified: 0 }; impact.push(row); }
      if (a && category(a) === kind) row.before++; if (b && category(b) === kind) row.after++; if (a && b) row.modified++;
    }
  }
  if(JSON.stringify(before.modelPresentation?.clipping)!==JSON.stringify(prepared.proposed.modelPresentation?.clipping))impact.push({kind:"Model display clipping",before:before.modelPresentation?.clipping?.enabled?1:0,after:prepared.proposed.modelPresentation?.clipping?.enabled?1:0,modified:1});
  for(const field of ["parts","explosions","projections","sections","sheets"] as const){const a=before.modelPresentation?.[field]??{},b=prepared.proposed.modelPresentation?.[field]??{};const ids=[...new Set([...Object.keys(a),...Object.keys(b)])],updated=ids.filter(id=>JSON.stringify(a[id])!==JSON.stringify(b[id]));if(updated.length)impact.push({kind:`Model ${field}`,before:Object.keys(a).length,after:Object.keys(b).length,modified:updated.filter(id=>a[id]&&b[id]).length,created:updated.filter(id=>!a[id]).length,deleted:updated.filter(id=>!b[id]).length});}
  for (const [id, sketch] of Object.entries(prepared.proposed.sketches ?? {})) {
    const old = before.sketches?.[id]; if (JSON.stringify(old) === JSON.stringify(sketch)) continue;
    impact.push({ kind: `Constraints · ${id}`, before: old?.constraints.length ?? 0, after: sketch.constraints.length, modified: sketch.constraints.filter(c => JSON.stringify(old?.constraints.find(p => p.id === c.id)) !== JSON.stringify(c)).length });
    impact.push({ kind: `Driving dimensions · ${id}`, before: old?.dimensions.length ?? 0, after: sketch.dimensions.length, modified: 0 });
  }
  const oldSections=before.workspaceSections??{},newSections=prepared.proposed.workspaceSections??{};
  const sectionChanges=[...new Set([...Object.keys(oldSections),...Object.keys(newSections)])].filter(id=>JSON.stringify(oldSections[id])!==JSON.stringify(newSections[id]));
  if(sectionChanges.length)impact.push({kind:"Workspace sections",before:Object.keys(oldSections).length,after:Object.keys(newSections).length,created:sectionChanges.filter(id=>!oldSections[id]).length,deleted:sectionChanges.filter(id=>!newSections[id]).length,modified:sectionChanges.filter(id=>oldSections[id]&&newSections[id]).length});
  const oldLinks=before.frameLinks??{},newLinks=prepared.proposed.frameLinks??{},linkChanges=[...new Set([...Object.keys(oldLinks),...Object.keys(newLinks)])].filter(id=>JSON.stringify(oldLinks[id])!==JSON.stringify(newLinks[id]));
  if(linkChanges.length)impact.push({kind:"Frame connections",before:Object.keys(oldLinks).length,after:Object.keys(newLinks).length,created:linkChanges.filter(id=>!oldLinks[id]).length,deleted:linkChanges.filter(id=>!newLinks[id]).length,modified:linkChanges.filter(id=>oldLinks[id]&&newLinks[id]).length});
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
  const importsBefore = Object.keys(before.exchangeImports ?? {}).length, importsAfter = Object.keys(prepared.proposed.exchangeImports ?? {}).length;
  if (importsBefore !== importsAfter) impact.push({ kind: "Exchange source receipts", before: importsBefore, after: importsAfter, modified: 0, created: importsAfter - importsBefore });
  const viewIds = new Set([...Object.keys(before.modelViews ?? {}), ...Object.keys(prepared.proposed.modelViews ?? {})]);
  const viewChanges = [...viewIds].filter(id => JSON.stringify(before.modelViews?.[id]) !== JSON.stringify(prepared.proposed.modelViews?.[id]));
  if (viewChanges.length) impact.push({ kind: "Model views", before: Object.keys(before.modelViews ?? {}).length, after: Object.keys(prepared.proposed.modelViews ?? {}).length, modified: viewChanges.filter(id => before.modelViews?.[id] && prepared.proposed.modelViews?.[id]).length, created: viewChanges.filter(id => !before.modelViews?.[id]).length, deleted: viewChanges.filter(id => !prepared.proposed.modelViews?.[id]).length });
  const planeIds = new Set([...Object.keys(before.workPlanes ?? {}), ...Object.keys(prepared.proposed.workPlanes ?? {})]);
  const planeChanges = [...planeIds].filter(id => JSON.stringify(before.workPlanes?.[id]) !== JSON.stringify(prepared.proposed.workPlanes?.[id]));
  if(planeChanges.length)impact.push({kind:"Work planes",before:Object.keys(before.workPlanes??{}).length,after:Object.keys(prepared.proposed.workPlanes??{}).length,modified:planeChanges.filter(id=>before.workPlanes?.[id]&&prepared.proposed.workPlanes?.[id]).length,created:planeChanges.filter(id=>!before.workPlanes?.[id]).length,deleted:planeChanges.filter(id=>!prepared.proposed.workPlanes?.[id]).length});
  const afterBlocks = prepared.proposed.blocks ?? {};
  const blockIds = new Set([...Object.keys(beforeBlocks), ...Object.keys(afterBlocks)]);
  const createdBlocks = [...blockIds].filter(id => !beforeBlocks[id] && afterBlocks[id]).length;
  const deletedBlocks = [...blockIds].filter(id => beforeBlocks[id] && !afterBlocks[id]).length;
  const modifiedBlocks = [...blockIds].filter(id => beforeBlocks[id] && afterBlocks[id] && JSON.stringify(beforeBlocks[id]) !== JSON.stringify(afterBlocks[id])).length;
  if (createdBlocks || modifiedBlocks || deletedBlocks) impact.push({ kind: "Components", before: Object.keys(beforeBlocks).length, after: Object.keys(afterBlocks).length, created: createdBlocks, modified: modifiedBlocks, deleted: deletedBlocks });
  return structuredClone({frameStitch,frameSheets,frameLayout,sheetSet,sheetLayout,planId,baseVersion:version,result,changes,impact,variableChanges,bindingChanges,variables:{before:evaluateVariables(before.variables),after:evaluateVariables(prepared.proposed.variables)},stale:!sameDocumentVersion(version)||JSON.stringify(before)!==JSON.stringify(cadDocument)});
}

export function discardCadPlan(planId:string){plans.delete(planId);}
/** Detached architectural solids from the actual evaluated proposal, for viewport ghosts. */
export function getCadPlanWallGhosts(planId:string){const stored=plans.get(planId);if(!stored?.prepared.result.ok)return [];return [...stored.afterFeatures.values()].filter(f=>(f.params.architecturalWall||f.params.architecturalSlab||f.params.componentContent&&featureContract(f).representation==="brep")&&JSON.stringify([f,stored.prepared.proposed.objects[f.output]])!==JSON.stringify([stored.beforeFeatures.get(f.output),stored.before.objects[f.output]])).map(f=>({kind:"solid" as const,featureType:f.type,key:`wall-review-${f.output}`,params:structuredClone(f.params),transform:getObjectTransform(stored.prepared.proposed.objects[f.output],f)}));}

/** Detached solved sources for canvas review; callers cannot alter the applied proposal. */
export function getCadPlanSketchPreview(planId:string,sketchId:string):{before:Sketch;after:Sketch}|undefined {
  const stored=plans.get(planId);
  const before=stored?.before.sketches?.[sketchId],after=stored?.prepared.proposed.sketches?.[sketchId];
  if(!stored?.prepared.result.ok||!before||!after)return;
  return structuredClone({before,after});
}

export function getCadPlanDrawingPaths(planId:string,objectId:string,space:"world"|"authoring"="world"){
  const stored=plans.get(planId);if(!stored?.prepared.result.ok)return;
  const cacheKey=space==="world"?objectId:`authoring:${objectId}`;
  let paths=stored.paths.get(cacheKey);
  if(!paths){
    const path=(document:CadDocument,index:FeatureIndex)=>{const object=document.objects[objectId],feature=index.get(objectId);return object&&feature?getWorldDrawingGeometry(space==="authoring"?{...object,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}}:object,feature)?.points:undefined;};
    const closed=(index:FeatureIndex)=>{const feature=index.get(objectId);return feature?.params.closed===true||feature?.params.kind==="rectangle"||feature?.params.kind==="circle";};
    paths={before:path(stored.before,stored.beforeFeatures),after:path(stored.prepared.proposed,stored.afterFeatures),beforeClosed:closed(stored.beforeFeatures),afterClosed:closed(stored.afterFeatures)};
    stored.paths.set(cacheKey,paths);
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
export async function applyCadPlan(planId:string,options:{signal?:AbortSignal;validate?:()=>string|undefined}={}):Promise<CommandResult&{alreadyApplied?:boolean}> {
  return enqueueDocumentCommand(async()=>{
    options.signal?.throwIfAborted();
    const stored=plans.get(planId);
    if(!stored)throw new Error("Preview expired; preview the edit again.");
    if(stored.applied)return structuredClone({...stored.applied,changed:false,alreadyApplied:true});
    const {prepared,before,version}=stored;
    if(!sameDocumentVersion(version)||JSON.stringify(before)!==JSON.stringify(cadDocument))return failedResult(prepared.command,"The document changed; preview the edit again.");
    if(!prepared.result.ok)return structuredClone(prepared.result);
    // Recheck the owner's authoritative review after queueing. No await may
    // separate this check from publication; Cancel can abort until this point.
    const reason=options.validate?.();
    if(reason)return failedResult(prepared.command,reason);
    options.signal?.throwIfAborted();
    publishCadProposal(prepared,before);
    const {raw:_,...result}=prepared.result;
    stored.applied=structuredClone(result);
    publishCommandResult(result);
    return structuredClone(result);
  });
}

/** Block Stretch renders each member path separately, plus the measured envelope. */
export function getCadPlanBlockPaths(planId:string,objectId:string){
 const stored=plans.get(planId);if(!stored?.prepared.result.ok)return [];
 return [{document:stored.before,index:stored.beforeFeatures,before:true},{document:stored.prepared.proposed,index:stored.afterFeatures,before:false}].flatMap(({document,index,before})=>{
  const object=document.objects[objectId],feature=index.get(objectId);if(!object||feature?.type!=="drafting"||feature.params.kind!=="block")return [];
  const data=worldDraftingGeometry(document,object,feature),envelope=blockStretchEnvelope(document,object,feature);
  return [...data.lines.map(line=>({points:line.points,closed:line.closed,before})),{points:envelope.segments.map(s=>s.start),closed:true,before}];
 });
}

/** Read-only drafting preview for exchange reviews, including nested labels. */
export function getCadPlanDraftingGeometry(planId:string,objectId:string){
 const stored=plans.get(planId);if(!stored?.prepared.result.ok)return;
 const document=stored.prepared.proposed,object=document.objects[objectId],feature=stored.afterFeatures.get(objectId);
 if(!object||feature?.type!=="drafting")return;
 return structuredClone(worldDraftingGeometry(document,object,feature));
}

/** Exact circular-domain classification from the detached construction proposal. */
export function getCadPlanConstructionStatus(planId:string,objectId:string):string|undefined{
  const stored=plans.get(planId);if(!stored?.prepared.result.ok)return;
  const value=stored.afterFeatures.get(objectId)?.params.intersectionStatus;return typeof value==="string"?value:undefined;
}

/** Read-only placement review: model and exploded coordinates remain explicit. */
export function getCadPlanPartPlacements(planId:string){const stored=plans.get(planId);if(!stored?.prepared.result.ok)return [];const d=stored.prepared.proposed;return Object.values(d.modelPresentation?.parts??{}).map(part=>{const object=d.objects[part.objectId],feature=stored.afterFeatures.get(part.objectId);if(!object||!feature)return {partId:part.id,name:part.name,missing:true};const model=getObjectTransform(object,feature).translation,offset=explodedDisplayOffset(d,part.objectId);return {partId:part.id,name:part.name,missing:false,model,display:model.map((v,i)=>v+offset[i]),offset};});}

export function getCadPlanFrameDocument(planId:string):CadDocument|undefined {const p=plans.get(planId);return p?.prepared.result.ok?structuredClone(p.prepared.proposed):undefined;}



