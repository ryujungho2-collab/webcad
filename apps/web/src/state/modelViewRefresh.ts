import type {CadDocument,CadModelProjection,ModelSection} from "@agent-webcad/cad-document";
import {getObjectTransform} from "../precision/objectTransform";

const sourceParams=(p:Record<string,unknown>)=>{const {solidFinish:_,componentContent:__,...geometry}=p;return geometry;};
/** Compare geometry and owned outputs, never document revision or UI visibility.
 * Detached previews, Undo and reopened documents therefore share the same rule. */
export function unchangedModelView(d:CadDocument,before:CadDocument|undefined,view:CadModelProjection|ModelSection):boolean {
 if(!before)return false;
 const old=before.modelPresentation?.sections?.[view.id]??before.modelPresentation?.projections[view.id];
 if(!old||JSON.stringify(old)!==JSON.stringify(view))return false;
 const current=new Map(Object.values(d.features).map(f=>[f.output,f])),prior=new Map(Object.values(before.features).map(f=>[f.output,f]));
 for(const id of view.partIds){const p=d.modelPresentation?.parts[id],q=before.modelPresentation?.parts[id],o=p&&d.objects[p.objectId],a=q&&before.objects[q.objectId],f=o&&current.get(o.id),g=a&&prior.get(a.id);
  if(!p||!q||p.objectId!==q.objectId||!o||!a||!f||!g||JSON.stringify([f.type,sourceParams(f.params),getObjectTransform(o,f)])!==JSON.stringify([g.type,sourceParams(g.params),getObjectTransform(a,g)]))return false;
 }
 for(const e of Object.values(view.outputs)){const o=d.objects[e.objectId],a=before.objects[e.objectId];if(!o||!a||o.visible!==a.visible||o.layerId!==a.layerId||JSON.stringify(current.get(o.id))!==JSON.stringify(prior.get(a.id)))return false;}
 return true;
}

