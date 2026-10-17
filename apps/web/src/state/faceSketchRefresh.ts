import type { CadDocument } from "@agent-webcad/cad-document";
import { sketchGeometryToDrawingParams } from "../precision/sketchAdapter";
import { resolveStoredWorkPlane } from "./attachedWorkPlane";

/** Refresh face-bound projections after their exact source face or placement changes. */
export async function refreshFaceSketches(document:CadDocument,_before:CadDocument):Promise<boolean>{
  let changed=false;
  const featureFor=(candidate:CadDocument,id:string)=>Object.values(candidate.features).find(feature=>feature.output===id);
  for(const sketch of Object.values(document.sketches??{})){
    if(!sketch.facePlaneId)continue;
    const plane=document.workPlanes?.[sketch.facePlaneId];
    if(!plane?.source)throw Error(`Face work plane ${sketch.facePlaneId} is missing.`);
    const result=await resolveStoredWorkPlane(document,plane);
    if(result.status!=="resolved"){
      sketch.faceStatus=result.status;
      continue;
    }
    sketch.faceStatus="resolved";
    if(JSON.stringify(sketch.faceFrame)===JSON.stringify(result.frame))continue;
    const layer=document.layers[sketch.layerId];
    if(layer?.locked)throw Error(`Unlock the layer of face sketch ${sketch.id} before moving its source.`);
    sketch.faceFrame=result.frame;
    for(const geometry of sketch.geometry){
      const projection=featureFor(document,geometry.id);
      if(!projection||projection.params.sketchId!==sketch.id)throw Error(`Missing face sketch projection ${geometry.id}.`);
      projection.params=sketchGeometryToDrawingParams(sketch,geometry,projection.params);
    }
    changed=true;
  }
  return changed;
}
