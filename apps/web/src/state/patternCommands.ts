import type {CadDocument,CadFeature,CadPatternInstance,CadPatternSpec} from "@agent-webcad/cad-document";
import {patternSlots,MAX_PATTERN_OUTPUTS} from "@agent-webcad/cad-document";
import type {CommandBus,CadCommand} from "@agent-webcad/cad-commands";
import {buildPatternDrawingParams} from "../precision/patternGeometry";

export const patternMembers=(document:CadDocument,id:string)=>Object.values(document.features).filter(f=>f.pattern?.id===id);
export function registerPatternCommandHandlers(bus:CommandBus,document:CadDocument){
  const editableLayer=(id:string)=>{const layer=document.layers[id];if(!layer||layer.locked||!layer.visible)throw new Error("Pattern layer must be visible and unlocked.");return layer;};
  const remove=(f:CadFeature)=>{
    delete document.features[f.id];delete document.objects[f.output];
    document.rootObjects=document.rootObjects.filter(id=>id!==f.output);
    for(const layer of Object.values(document.layers))layer.objectIds=layer.objectIds.filter(id=>id!==f.output);
  };
  const write=(id:string,sources:string[],spec:CadPatternSpec,layerId:string,existing:CadFeature[])=>{
    if(sources.length*(patternSlots(spec)-1)>MAX_PATTERN_OUTPUTS)throw new Error(`Patterns support at most ${MAX_PATTERN_OUTPUTS} generated objects.`);
    const layer=editableLayer(layerId),features=new Map(Object.values(document.features).map(f=>[f.output,f]));
    for(const f of existing){const object=document.objects[f.output];if(!object)throw new Error("Missing pattern member.");editableLayer(object.layerId);}
    for(const sourceId of sources){if(!document.objects[sourceId])throw new Error("Missing pattern source.");const sourceLayer=document.layers[document.objects[sourceId].layerId];if(!sourceLayer||sourceLayer.locked)throw new Error("Pattern source layer is locked.");}
    if(existing.length&&existing[0].pattern!.spec.kind!==spec.kind)throw new Error("Create a new pattern to use a different pattern kind.");
    // Grid identity belongs to a row/column, not a row-major array offset:
    // changing columns must not rebind a dimension to another row's instance.
    const slot=(recipe:CadPatternSpec,index:number)=>recipe.kind==="linear"?`r${Math.floor(index/recipe.columns)}:c${index%recipe.columns}`:String(index);
    const old=new Map(existing.map(f=>[JSON.stringify([f.pattern!.sourceId,slot(f.pattern!.spec,f.pattern!.index)]),f]));
    // Prepare all geometry before touching the transaction document.
    const prepared:Array<{output:string;pattern:CadPatternInstance;params:Record<string,unknown>;previous?:CadFeature}>=[];
    for(let index=1;index<patternSlots(spec);index++)for(const sourceId of sources){
      const previous=old.get(JSON.stringify([sourceId,slot(spec,index)]));
      const output=previous?.output??`${id}:${sourceId}:${slot(spec,index)}`;
      if(!previous&&(document.objects[output]||document.features[`feature-${output}`]))throw new Error("Pattern output ID already exists.");
      const pattern:CadPatternInstance={id,sourceObjectIds:[...sources],sourceId,index,spec:structuredClone(spec),layerId};
      prepared.push({output,pattern,params:buildPatternDrawingParams(document,pattern,output,features),previous});
    }
    const keep=new Set(prepared.map(p=>p.output));for(const f of existing)if(!keep.has(f.output))remove(f);
    for(const p of prepared){
      if(p.previous){p.previous.params=p.params;p.previous.pattern=p.pattern;continue;}
      document.objects[p.output]={id:p.output,geometryId:`geometry-${p.output}`,name:`${spec.kind} · ${document.objects[p.pattern.sourceId].name} ${p.pattern.index+1}`,visible:true,layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
      const featureId=`feature-${p.output}`;
      document.features[featureId]={id:featureId,type:"drawing",output:p.output,inputs:[p.pattern.sourceId],dependencyMode:"live",params:p.params,pattern:p.pattern};
      layer.objectIds.push(p.output);document.rootObjects.push(p.output);
    }
    document.revision++;return {patternId:id,createdIds:prepared.filter(p=>!p.previous).map(p=>p.output)};
  };
  bus.registerHandler("create-pattern",(command:CadCommand)=>{
    if(command.type!=="create-pattern")return;
    const id=command.id??`pattern-${crypto.randomUUID()}`;if(patternMembers(document,id).length)throw new Error("Pattern ID already exists.");
    return write(id,command.sourceObjectIds,command.spec,command.layerId??document.objects[command.sourceObjectIds[0]]?.layerId??"layer-default",[]);
  });
  bus.registerHandler("update-pattern",(command:CadCommand)=>{
    if(command.type!=="update-pattern")return;
    const members=patternMembers(document,command.patternId),recipe=members[0]?.pattern;if(!recipe)throw new Error("Pattern not found.");
    if(JSON.stringify(recipe.spec)===JSON.stringify(command.spec))return;
    return write(recipe.id,recipe.sourceObjectIds,command.spec,recipe.layerId,members);
  });
  for(const type of ["detach-pattern","delete-pattern"] as const)bus.registerHandler(type,(command:CadCommand)=>{
    if(command.type!==type)return;
    const members=patternMembers(document,command.patternId);if(!members.length)return;
    for(const f of members)editableLayer(document.objects[f.output].layerId);
    for(const f of members)if(type==="delete-pattern")remove(f);else{delete f.pattern;f.inputs=[];f.dependencyMode="snapshot";}
    document.revision++;
  });
}
