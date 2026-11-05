import type {CadCommand} from "@agent-webcad/cad-commands";
import type {CadDocument} from "@agent-webcad/cad-document";

/** Defer regeneration only when geometry edits target newly allocated model resources. */
export function appendOnlyModelBatch(d:CadDocument,c:CadCommand):boolean{
 if(c.type!=="batch")return false;
 const objects=new Set<string>(),layers=new Set<string>(),parts=new Set<string>(),consumedSources=new Set<string>();let solids=0;
 const allocate=(id:string|undefined,set:Set<string>,existing:object)=>!!id&&!set.has(id)&&!Object.hasOwn(existing,id)&&!!set.add(id);
 for(const s of c.commands)switch(s.type){
  case "create-layer":if(!allocate(s.id,layers,d.layers))return false;break;
  case "create-drawing":if(!s.layerId||!layers.has(s.layerId)||!allocate(s.id,objects,d.objects))return false;break;
  case "create-primitive":case "create-extrude":case "create-architectural-slab":
   if(!s.layerId||!layers.has(s.layerId)||!allocate(s.id,objects,d.objects))return false;
   if(s.type==="create-extrude")s.profileObjectIds.forEach(id=>consumedSources.add(id));
   if(s.type==="create-architectural-slab")s.definition.sourceObjectIds.forEach(id=>consumedSources.add(id));
   solids++;break;
  case "move-object":case "rotate-object":if(consumedSources.has(s.objectId))return false;
   if(!objects.has(s.objectId))return false;break;
  case "rename-object":case "set-solid-finish":
   if(!objects.has(s.objectId))return false;break;
  case "register-model-part":if(!objects.has(s.part.objectId)||!allocate(s.part.id,parts,d.modelPresentation?.parts??{}))return false;break;
  case "set-layer-visible":if(!layers.has(s.layerId)&&!d.layers[s.layerId])return false;break;
  case "update-artboard":if(Object.keys(s).some(k=>!["type","artboardId","visible"].includes(k))||!d.artboards?.[s.artboardId])return false;break;
  case "upsert-model-view":if(d.modelViews?.[s.view.id])return false;break;
  case "upsert-exploded-view":if(d.modelPresentation?.explosions[s.view.id]||Object.keys(s.view.offsets).some(id=>!parts.has(id)))return false;break;
  default:return false;
 }
 return solids>0;
}
