import type { CadDocument } from "./CadDocument";

/** A frame/slide references editable document objects; evaluated motion never edits CAD geometry. */
export type CadScene = {
  id: string; name: string; artboardId: string; objectIds: string[]; notes: string;
  layout: { direction: "free" | "row" | "column"; gap: number; padding: number };
  durationMs: number; autoAdvance: boolean;
  states: { id: string; name: string; hiddenObjectIds: string[] }[];
  links: { objectId: string; targetSceneId: string; targetStateId?: string }[];
  tracks: { objectId: string; startMs: number; endMs: number; from: [number,number,number]; to: [number,number,number]; easing: "linear" | "ease-in-out" }[];
};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const name=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=200;
const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=500&&v.every(name)&&new Set(v).size===v.length;
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
const pose=(v:unknown)=>Array.isArray(v)&&v.length===3&&v.every(finite)&&Math.abs(v[0])<=1e6&&Math.abs(v[1])<=1e6&&v[2]>=0&&v[2]<=1;
export function validScene(v:unknown):v is CadScene {
 if(!record(v)||!name(v.id)||!name(v.name)||!name(v.artboardId)||!ids(v.objectIds)||typeof v.notes!=="string"||v.notes.length>4000||typeof v.autoAdvance!=="boolean")return false;
 if(!finite(v.durationMs)||v.durationMs<100||v.durationMs>600000||!record(v.layout)||!["free","row","column"].includes(String(v.layout.direction))||![v.layout.gap,v.layout.padding].every(x=>finite(x)&&x>=0&&x<=1e6))return false;
 const objectIds=v.objectIds,durationMs=v.durationMs;
 if(!Array.isArray(v.states)||v.states.length>32||!v.states.every(s=>record(s)&&name(s.id)&&name(s.name)&&ids(s.hiddenObjectIds)&&s.hiddenObjectIds.every(id=>objectIds.includes(id)))||new Set(v.states.map(s=>s.id)).size!==v.states.length)return false;
 if(!Array.isArray(v.links)||v.links.length>500||!v.links.every(l=>record(l)&&name(l.objectId)&&objectIds.includes(l.objectId)&&name(l.targetSceneId)&&(l.targetStateId===undefined||name(l.targetStateId)))||new Set(v.links.map(l=>l.objectId)).size!==v.links.length)return false;
 return Array.isArray(v.tracks)&&v.tracks.length<=500&&v.tracks.every(t=>record(t)&&name(t.objectId)&&objectIds.includes(t.objectId)&&finite(t.startMs)&&finite(t.endMs)&&t.startMs>=0&&t.startMs<t.endMs&&t.endMs<=durationMs&&pose(t.from)&&pose(t.to)&&["linear","ease-in-out"].includes(String(t.easing)))&&new Set(v.tracks.map(t=>t.objectId)).size===v.tracks.length;
}
export function validateSceneGraph(document:CadDocument) {
 if(document.scenes!==undefined&&!record(document.scenes))throw new Error("Invalid scene collection.");
 for(const [id,scene] of Object.entries(document.scenes??{})) {
  if(!validScene(scene)||scene.id!==id)throw new Error(`Invalid scene ${id}.`);
  if(!document.artboards?.[scene.artboardId])throw new Error(`Scene ${scene.name} references a missing artboard. Reassign or remove the scene first.`);
  for(const child of scene.objectIds)if(!document.objects[child])throw new Error(`Scene ${scene.name} references missing object ${child}. Remove it from the scene before deleting its source.`);
  for(const link of scene.links){const target=document.scenes?.[link.targetSceneId];if(!target||link.targetStateId&&!target.states.some(s=>s.id===link.targetStateId))throw new Error(`Scene ${scene.name} has a missing navigation target. Reconnect the link first.`);}
 }
}
