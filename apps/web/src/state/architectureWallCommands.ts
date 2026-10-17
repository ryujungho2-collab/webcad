import type {CadDocument,ArchitectureWall,CadFeature} from "@agent-webcad/cad-document";
import {validArchitectureWall} from "@agent-webcad/cad-document";
import type {CadCommand,CommandBus} from "@agent-webcad/cad-commands";
import {wallFootprint} from "../precision/architectureWall";
import {buildBooleanMesh,buildExtrudeMesh,inspectSolid,meshPositionsBounds} from "../cad/kernelGeometryService";
export async function architectureWallParams(document:CadDocument,definition:ArchitectureWall){
 if(!validArchitectureWall(definition))throw Error("Invalid architectural wall definition.");
 const {params,frame}=wallFootprint(document,definition);if(definition.mode==="footprint"&&frame)(params.architecturalWall as ArchitectureWall).thickness=frame.thickness;
 const mesh=definition.openings.length?await buildBooleanMesh(params,true):await buildExtrudeMesh(params,true),measurement=await inspectSolid({params});
 if(measurement.validity!=="valid"||!measurement.volume||measurement.volume<=1e-6||!mesh.indices.length)throw Error("Wall or opening does not produce a valid nonempty solid.");
 return {...params,bounds:meshPositionsBounds(mesh.positions)};
}
export function registerArchitectureWallCommands(bus:CommandBus,d:CadDocument){
 bus.registerHandler("refresh-wall-drawings",async(c:CadCommand)=>{if(c.type!=="refresh-wall-drawings")return;const host=Object.values(d.features).find(f=>f.output===c.objectId&&f.params.architecturalWall);if(!host)throw Error("Architectural wall no longer exists.");const p=d.modelPresentation,parts=new Set(Object.values(p?.parts??{}).filter(part=>part.objectId===c.objectId).map(part=>part.id));
  for(const section of Object.values(p?.sections??{}))if(section.partIds.some(id=>parts.has(id))){const {status:_,reason:__,outputs:___,decorations:____,presentationWarnings:_____,...view}=section;await bus.dispatch({type:"upsert-model-section",view});}
  for(const view of Object.values(p?.projections??{}))if(view.partIds.some(id=>parts.has(id)))await bus.dispatch({type:"upsert-model-projection",id:view.id,name:view.name,partIds:view.partIds,basis:view.basis,origin:view.origin,scale:view.scale,layerId:view.layerId,...view.method?{method:view.method}:{},...view.direction?{direction:view.direction}:{},...view.hiddenLines?{hiddenLines:view.hiddenLines}:{}});
  d.revision++;
 });
 const editable=(id:string)=>{const o=d.objects[id],f=Object.values(d.features).find(f=>f.output===id),l=o&&d.layers[o.layerId];if(!o||!f?.params.architecturalWall||!o.visible||!l?.visible||l.locked)throw Error("Select one visible, unlocked architectural wall.");if(o.transform&&!o.transform.scale.every(v=>v===1))throw Error("Restore unit scale before editing architectural wall dimensions.");return {o,f};};
 const publish=async(f:CadFeature,definition:ArchitectureWall)=>{f.params=await architectureWallParams(d,definition);f.type=definition.openings.length?"boolean":"extrude";d.revision++;};
 bus.registerHandler("create-wall",async(c:CadCommand)=>{
  if(c.type!=="create-wall")return;const id=c.id??`wall-${crypto.randomUUID()}`,layerId=c.layerId??"layer-default",layer=d.layers[layerId];
  if(!layer?.visible||layer.locked||d.objects[id]||d.features[`feature-${id}`])throw Error("Wall output layer is locked/hidden or the ID already exists.");
  if(c.definition.sourceObjectIds.some(id=>!d.objects[id]||!d.layers[d.objects[id].layerId]?.visible||!d.objects[id].visible))throw Error("Wall sources must be visible; locked references are read only.");
  if(Object.values(d.features).some(f=>(f.params.architecturalWall as ArchitectureWall|undefined)?.openings.some(o=>c.definition.openings.some(next=>next.id===o.id))))throw Error("Opening ID already belongs to another host.");
  const params=await architectureWallParams(d,c.definition);
  d.objects[id]={id,name:"Wall",geometryId:`geometry-${id}`,visible:true,layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
  d.features[`feature-${id}`]={id:`feature-${id}`,type:c.definition.openings.length?"boolean":"extrude",dependencyMode:"live",inputs:[...c.definition.sourceObjectIds],output:id,params};d.rootObjects.push(id);layer.objectIds.push(id);d.revision++;return id;
 });
 bus.registerHandler("update-wall",async(c:CadCommand)=>{if(c.type!=="update-wall")return;const {f}=editable(c.objectId),previous=f.params.architecturalWall as ArchitectureWall;if(previous.mode==="footprint"&&c.thickness!==previous.thickness)throw Error("Footprint thickness follows its source outline; edit that outline instead.");const next={...previous,height:c.height,thickness:c.thickness,baseLevel:c.baseLevel};if(JSON.stringify(next)===JSON.stringify(previous))throw Error("Wall dimensions are unchanged.");await publish(f,next);});
 bus.registerHandler("upsert-wall-opening",async(c:CadCommand)=>{if(c.type!=="upsert-wall-opening")return;const {f}=editable(c.objectId),previous=f.params.architecturalWall as ArchitectureWall;
  if(Object.values(d.features).some(other=>other.output!==f.output&&(other.params.architecturalWall as ArchitectureWall|undefined)?.openings.some(o=>o.id===c.opening.id)))throw Error("Opening ID belongs to another host wall.");
  const next={...previous,openings:previous.openings.some(o=>o.id===c.opening.id)?previous.openings.map(o=>o.id===c.opening.id?structuredClone(c.opening):o):[...previous.openings,structuredClone(c.opening)]};if(JSON.stringify(next)===JSON.stringify(previous))throw Error("Opening is unchanged.");await publish(f,next);
 });
 bus.registerHandler("delete-wall-opening",async(c:CadCommand)=>{if(c.type!=="delete-wall-opening")return;const {f}=editable(c.objectId),previous=f.params.architecturalWall as ArchitectureWall;if(!previous.openings.some(o=>o.id===c.openingId))throw Error("Opening no longer belongs to this wall.");await publish(f,{...previous,openings:previous.openings.filter(o=>o.id!==c.openingId)});});
}
