import type { CadDocument } from "@agent-webcad/cad-document";
/** Shared discovery terminology and order across ribbon, search and canvas. */
export const interactionTools = [
  { id: "curve-workflow", label: "Curve workflow", icon: "⌁", hint: "Trim / Join · select targets, reconnect relationships, review and continue" },
  { id: "edit-sketch", label: "Edit Sketch", icon: "◇", hint: "Edit the selected curve's owning sketch and driving constraints" },
  { id: "construction", label: "Construction", icon: "⊥", hint: "Points, lines, rays and saved construction relationships" },
  { id: "pattern-linear", label: "Linear Array", icon: "▦", hint: "Repeat source curves in rows and columns" },
  { id: "pattern-radial", label: "Radial Array", icon: "◌", hint: "Repeat source curves about a center" },
  { id: "pattern-mirror", label: "Mirror", icon: "⇆", hint: "Reflect source curves about an axis" },
] as const;
export type InteractionToolId = typeof interactionTools[number]["id"];

/** Entry eligibility only; the detached command plan authoritatively validates Apply. */
export function interactionToolReason(id:InteractionToolId,document:CadDocument,selectedIds:string[],activeSketchId:string|undefined|null,layerId:string):string|undefined {
  if(activeSketchId)return "Finish the active sketch first.";
  const selected=Object.values(document.features).filter(f=>selectedIds.includes(f.output));
  if(id==="edit-sketch"){
    const owners=new Set(selected.map(f=>f.params.sketchId).filter(Boolean));
    if(owners.size!==1||selected.length!==selectedIds.length||selected.some(f=>!f.params.sketchId))return "Select curves belonging to one sketch.";
    const sketch=document.sketches?.[String([...owners][0])],layer=sketch&&document.layers[sketch.layerId];
    if(!layer?.visible||layer.locked)return "Show and unlock the sketch layer first.";
    return;
  }
  if(id==="construction"||id.startsWith("pattern-")){
    const layer=document.layers[layerId];
    if(!layer?.visible||layer.locked)return "Show and unlock the active layer first.";
  }
  if(id==="curve-workflow"&&selected.length&&selected.every(f=>{
    const object=document.objects[f.output],layer=object&&document.layers[object.layerId];
    return !object?.visible||!layer?.visible||layer.locked;
  }))return "Show and unlock a selected curve layer, or clear the selection to choose another target.";
  if(id.startsWith("pattern-")&&selectedIds.length&&(!selected.length||selected.some(f=>f.type!=="drawing")))return "Select drawing or sketch curves, or clear the selection to choose sources in the tool.";
  if(id.startsWith("pattern-")&&new Set(selected.map(f=>f.params.workPlane??"XY")).size>1)return "Select pattern sources on the same work plane.";
}
