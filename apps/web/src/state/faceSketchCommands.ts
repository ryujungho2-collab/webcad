import type { CadDocument } from "@agent-webcad/cad-document";
import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import { buildExtrudeMesh, meshPositionsBounds } from "../cad/kernelGeometryService";
import { faceSketchExtrusionProfile } from "../precision/faceSketchProfile";
import { sketchGeometryToDrawingParams } from "../precision/sketchAdapter";
import { resolveStoredWorkPlane } from "./attachedWorkPlane";

export function registerFaceSketchCommands(bus:CommandBus,document:CadDocument){
  bus.registerHandler("create-face-extrude",async(command:CadCommand)=>{
    if(command.type!=="create-face-extrude")return;
    const sketch=document.sketches?.[command.sketchId],layerId=command.layerId??sketch?.layerId??"layer-default",layer=document.layers[layerId];
    const id=command.id??`face-extrude-${crypto.randomUUID()}`;
    if(!sketch?.facePlaneId||!layer?.visible||layer.locked||document.objects[id]||document.features[`feature-${id}`])return {accepted:false,reason:"Choose a face sketch and an unlocked visible output layer."};
    const sourceLayer=document.layers[sketch.layerId];
    if(!sourceLayer?.visible||sourceLayer.locked)return {accepted:false,reason:"Face sketch layer is hidden or locked."};
    const plane=document.workPlanes?.[sketch.facePlaneId],resolved=plane&&await resolveStoredWorkPlane(document,plane);
    if(!resolved||resolved.status!=="resolved")return {accepted:false,reason:"The source face is unresolved. Rebind its work plane first."};
    if(JSON.stringify(sketch.faceFrame)!==JSON.stringify(resolved.frame)){
      sketch.faceFrame=resolved.frame;sketch.faceStatus="resolved";
      for(const geometry of sketch.geometry){const projection=Object.values(document.features).find(feature=>feature.output===geometry.id);if(!projection||projection.params.sketchId!==sketch.id)return {accepted:false,reason:`Missing face sketch projection ${geometry.id}.`};projection.params=sketchGeometryToDrawingParams(sketch,geometry,projection.params);}
    }
    const result=faceSketchExtrusionProfile(sketch);
    if(!result)return {accepted:false,reason:sketch.faceStatus!=="resolved"?"The source face is unresolved. Rebind it first.":"Face sketch needs exactly one closed, non-construction profile."};
    const params:Record<string,unknown>={kind:"extrude",distance:command.distance,profile:result.profile,faceSketchId:sketch.id};
    try{const mesh=await buildExtrudeMesh(params,true);const bounds=meshPositionsBounds(mesh.positions);if(!bounds||!mesh.indices.length)throw Error("Empty solid.");params.bounds=bounds;}
    catch(cause){return {accepted:false,reason:`Face extrusion failed: ${cause instanceof Error?cause.message:String(cause)}`};}
    document.objects[id]={id,geometryId:`geometry-${id}`,name:"Face extrude",visible:true,layerId,transform:{translation:[0,0,0],rotation:[0,0,0],scale:[1,1,1]}};
    document.features[`feature-${id}`]={id:`feature-${id}`,type:"extrude",dependencyMode:"live",inputs:result.sourceObjectIds,output:id,params};
    document.rootObjects.push(id);layer.objectIds.push(id);document.revision++;
    return id;
  });
}
