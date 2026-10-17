import type { CadDocument, CadScene } from "@agent-webcad/cad-document";
import type { ContourReferenceRoute } from "@agent-webcad/cad-commands";
import { evaluateScene } from "../../../scenes/sceneEvaluation";

export type SceneContourRequirement = { dependentId:string; sourceId:string; name:string; kind:"scene"; sceneId:string };
const sceneKey = (id:string) => `scene-reference:${id}`;
export function sceneContourRequirements(document:CadDocument, sourceIds:string[]):SceneContourRequirement[] {
  const selected = new Set(sourceIds);
  return Object.values(document.scenes ?? {}).flatMap(scene => scene.objectIds.filter(id=>selected.has(id)).map(sourceId=>({dependentId:sceneKey(scene.id),sourceId,name:`${scene.name} · artwork`,kind:"scene" as const,sceneId:scene.id})));
}

/** Scene identity and behavior survive one-to-many replacements. Many-to-one
 * merges are accepted only when every merged member has the same behavior. */
export function reconnectContourScenes(document:CadDocument, stage:CadDocument, sourceIds:string[], outputs:string[], routes:ContourReferenceRoute[]):CadScene[] {
  const requirements = sceneContourRequirements(document,sourceIds), ids = new Set(requirements.map(r=>r.sceneId));
  return [...ids].map(id=>{
    const original = document.scenes![id];
    if (document.artboards?.[original.artboardId]?.locked) throw new Error(`Unlock scene '${original.name}' artboard before reconnecting its artwork.`);
    const mapping = new Map<string,string[]>();
    for (const r of requirements.filter(r=>r.sceneId===id)) {
      const route = routes.find(q=>q.dependentId===r.dependentId && q.sourceId===r.sourceId)!;
      if (!route || route.pointIndex!==undefined || route.segmentIndex!==undefined || route.branch!==undefined) throw new Error("Reconnect scene artwork to whole result objects.");
      const targets = route.resultIndices.map(i=>outputs[i]);
      if (!targets.length || targets.some(t=>!t)) throw new Error("Choose existing result objects for the scene.");
      mapping.set(r.sourceId,targets);
    }
    const groups = new Map<string,string[]>();
    for (const member of original.objectIds) for (const result of mapping.get(member) ?? [member]) groups.set(result,[...(groups.get(result) ?? []),member]);
    const behavior = (member:string) => JSON.stringify({
      hidden:original.states.map(s=>s.hiddenObjectIds.includes(member)),
      track:original.tracks.find(t=>t.objectId===member) && {...original.tracks.find(t=>t.objectId===member),objectId:undefined},
      link:original.links.find(l=>l.objectId===member) && {...original.links.find(l=>l.objectId===member),objectId:undefined},
    });
    for (const members of groups.values()) if (new Set(members.map(behavior)).size>1) throw new Error(`Scene '${original.name}' has conflicting states, tracks or links on merged artwork. Choose distinct results or edit its behavior first.`);
    const scene = structuredClone(original); scene.objectIds = [...groups.keys()];
    const remap = (members:string[]) => [...new Set(members.flatMap(member=>mapping.get(member) ?? [member]))];
    scene.states = scene.states.map(s=>({...s,hiddenObjectIds:remap(s.hiddenObjectIds)}));
    const expand = <T extends {objectId:string}>(entries:T[]) => [...new Map(entries.flatMap(entry=>(mapping.get(entry.objectId) ?? [entry.objectId]).map(objectId=>[objectId,{...entry,objectId}] as const))).values()];
    scene.links = expand(scene.links); scene.tracks = expand(scene.tracks);
    // Check finite artwork and current layout, including hidden-state artwork.
    evaluateScene(stage,scene,scene.durationMs);
    return scene;
  });
}
