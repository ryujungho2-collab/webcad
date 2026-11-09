import type {CadCommand} from "@agent-webcad/cad-commands";
import type {CadDocument} from "@agent-webcad/cad-document";
/** Only independent, newly allocated drawing resources can defer regeneration. */
export function appendOnlyDrawingBatch(d:CadDocument,c:CadCommand):boolean{
 if(c.type!=="batch")return false;
 const objects=new Set<string>(),layers=new Set<string>(),blocks=new Set<string>();
 const allocate=(id:string|undefined,set:Set<string>,existing:object)=>!!id&&!set.has(id)&&!Object.hasOwn(existing,id)&&!!set.add(id);
 for(const s of c.commands){
  switch(s.type){
   case "create-layer":if(!allocate(s.id,layers,d.layers))return false;break;
   case "set-layer-style":if(!layers.has(s.layerId))return false;break;
   case "create-drawing":case "create-drafting":
    if(s.type==="create-drafting"&&s.params.kind!=="text"||!s.layerId||!layers.has(s.layerId)||!allocate(s.id,objects,d.objects))return false;break;
   case "insert-block":if(!blocks.has(s.blockId)||!s.layerId||!layers.has(s.layerId)||!allocate(s.id,objects,d.objects))return false;break;
   case "define-block":if(!s.objectIds.every(id=>objects.has(id))||!allocate(s.id,blocks,d.blocks??{}))return false;break;
   case "move-object":case "rotate-object":case "scale-object":case "set-object-visible":if(!objects.has(s.objectId))return false;break;
   case "record-dxf-source":if(!s.objectIds.every(id=>objects.has(id)))return false;break;
   case "set-layer-locked":if(!layers.has(s.layerId))return false;break;
   default:return false;
  }
 }
 return objects.size>0;
}
