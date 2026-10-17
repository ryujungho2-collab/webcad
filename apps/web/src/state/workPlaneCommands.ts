import type { CadDocument, CadWorkPlaneFaceSource } from "@agent-webcad/cad-document";
import { validCadWorkPlane, validateCadWorkPlanes } from "@agent-webcad/cad-document";
import type { CadCommand, CommandBus } from "@agent-webcad/cad-commands";
import { resolveFaceWorkPlane } from "./attachedWorkPlane";

const reserved=new Set(["XY","XZ","YZ"]);
async function faceFrame(document:CadDocument,source:CadWorkPlaneFaceSource){
  const object=document.objects[source.objectId],layer=object&&document.layers[object.layerId];
  if(!object||!object.visible||!layer?.visible||layer.locked)return {ok:false as const,reason:"Select a visible, unlocked solid face."};
  const resolution=await resolveFaceWorkPlane(document,source);
  return resolution.status==="resolved"?{ok:true as const,frame:resolution.frame}:{ok:false as const,reason:resolution.reason};
}

export function registerWorkPlaneCommands(bus:CommandBus,document:CadDocument){
  bus.registerHandler("upsert-work-plane",(command:CadCommand)=>{
    if(command.type!=="upsert-work-plane")return;
    if(reserved.has(command.plane.id)||command.plane.source||document.workPlanes?.[command.plane.id]?.source)return {accepted:false,reason:"Use a distinct free work plane ID; face-bound planes require explicit rebinding."};
    if(JSON.stringify(document.workPlanes?.[command.plane.id])===JSON.stringify(command.plane))return {accepted:false,reason:"Work plane is unchanged."};
    if(!validCadWorkPlane(command.plane))return {accepted:false,reason:"Invalid orthonormal work plane frame."};
    const next={...document.workPlanes,[command.plane.id]:structuredClone(command.plane)};validateCadWorkPlanes(next);document.workPlanes=next;document.revision++;
  });
  bus.registerHandler("attach-work-plane-face",async(command:CadCommand)=>{
    if(command.type!=="attach-work-plane-face")return;
    if(reserved.has(command.id)||document.workPlanes?.[command.id])return {accepted:false,reason:"Work plane ID already exists."};
    const resolved=await faceFrame(document,command.source);if(!resolved.ok)return {accepted:false,reason:resolved.reason};
    const next={...document.workPlanes,[command.id]:{id:command.id,name:command.name.trim(),...resolved.frame,source:structuredClone(command.source)}};
    validateCadWorkPlanes(next);document.workPlanes=next;document.revision++;
  });
  bus.registerHandler("rebind-work-plane-face",async(command:CadCommand)=>{
    if(command.type!=="rebind-work-plane-face")return;
    const current=document.workPlanes?.[command.planeId];if(!current)return {accepted:false,reason:"Work plane not found."};
    const resolved=await faceFrame(document,command.source);if(!resolved.ok)return {accepted:false,reason:resolved.reason};
    const nextPlane={...current,...resolved.frame,source:structuredClone(command.source)};
    if(JSON.stringify(current)===JSON.stringify(nextPlane))return {accepted:false,reason:"Face binding is unchanged."};
    document.workPlanes![command.planeId]=nextPlane;document.revision++;
  });
  bus.registerHandler("delete-work-plane",(command:CadCommand)=>{
    if(command.type!=="delete-work-plane")return;
    if(!document.workPlanes?.[command.planeId])return {accepted:false,reason:"Work plane not found."};
    if(Object.values(document.sketches??{}).some(sketch=>sketch.facePlaneId===command.planeId))return {accepted:false,reason:"Delete the dependent face sketch before deleting its work plane."};
    if(Object.values(document.features).some(feature=>(feature.params.faceHole as {planeId?:string}|undefined)?.planeId===command.planeId))return {accepted:false,reason:"Delete the dependent Hole before deleting its work plane."};
    delete document.workPlanes[command.planeId];if(!Object.keys(document.workPlanes).length)delete document.workPlanes;document.revision++;
  });
}
