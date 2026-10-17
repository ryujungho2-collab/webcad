import type { CadCommand,CommandBus } from "@agent-webcad/cad-commands";
import type { CadDocument } from "@agent-webcad/cad-document";
import { floorPurgeCandidates } from "../precision/floorPlanWorkflow";
export function registerFloorPlanCommands(bus:CommandBus,document:CadDocument){
  bus.registerHandler("purge-unused",(command:CadCommand)=>{
    if(command.type!=="purge-unused")return;
    const candidates=floorPurgeCandidates(document);
    if(command.blockIds.some(id=>!candidates.blockIds.includes(id))||command.layerIds.some(id=>!candidates.layerIds.includes(id)))throw Error("A PURGE candidate is now used, locked or missing. Review again.");
    for(const id of command.blockIds)delete document.blocks![id];
    for(const id of command.layerIds)delete document.layers[id];
    document.rootLayers=document.rootLayers.filter(id=>!command.layerIds.includes(id));document.revision++;
  });
  bus.registerHandler("record-dxf-source",(command:CadCommand)=>{
    if(command.type!=="record-dxf-source")return;
    for(const [sourceIndex,id] of command.objectIds.entries()){
      const feature=Object.values(document.features).find(f=>f.output===id);
      const object=document.objects[id],layer=object&&document.layers[object.layerId];
      if(!feature||!["drawing","drafting"].includes(feature.type)||feature.params.floorPlanSource||!layer||layer.locked||!layer.visible)throw Error("Invalid, locked or already recorded import source.");
      feature.params.floorPlanSource={...structuredClone(command.receipt),sourceIndex,objectId:id};
    }
    document.revision++;
  });
}
