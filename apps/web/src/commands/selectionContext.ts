import type {CadDocument} from "@agent-webcad/cad-document";
export type SelectionContext={kind:"image"|"create"|"curve"|"solid"|"annotation"|"frame"|"mixed"|"unsupported"|"sketch";label:string;reason?:string;primary:string[];more:string[]};
/** Discovery only: registry eligibility and command Apply remain authoritative. */
export function selectionContext(document:CadDocument,ids:string[],options:{workspace:"2d"|"3d";sketch?:string|null;artboard?:string|null;frameBusy?:boolean}):SelectionContext{
  const common=["duplicate","rotate","scale","delete","fit-selection","inspect-selection"];
  if(options.sketch)return {kind:"sketch",label:"Sketch editing",reason:"Finish the active sketch to use object tools.",primary:["sketch"],more:["inspect-selection"]};
  const frame=options.workspace==="2d"&&!ids.length&&options.artboard?document.artboards?.[options.artboard]:undefined;
  if(frame?.frame?.stitch)return {kind:"unsupported",label:`Stitched frame · ${frame.name}`,reason:"Use Frames & sheets to edit stitched frames.",primary:["inspect-frame","fit-active-frame"],more:[]};
  if(frame?.frame)return {kind:"frame",label:`Frame · ${frame.name}`,reason:options.frameBusy?"Finish or cancel the current frame tool first.":frame.locked?"Unlock this frame before editing crop or scale.":!frame.visible?"Show this frame before editing.":undefined,primary:["frame-edit","frame-links","frame-sheets"],more:["fit-active-frame","inspect-frame"]};
  if(!ids.length)return {kind:"create",label:"Create",primary:options.workspace==="2d"?["draw-line","draw-rectangle","add-text"]:["box","cylinder","sketch"],more:options.workspace==="2d"?["draw-circle","draw-arc","draw-spline","draw-ellipse","drafting"]:["sphere","cone","torus","model-views"]};
  const features=new Map(Object.values(document.features).map(f=>[f.output,f])),objects=ids.map(id=>document.objects[id]);
  const kinds=ids.map(id=>{const f=features.get(id);return f?.type==="drawing"?"curve":f?.type==="dimension"||f?.type==="drafting"?"annotation":f?.type==="image"?"image":f?"solid":"unsupported";});
  const kind=new Set(kinds).size>1?"mixed":kinds[0] as SelectionContext["kind"];
  const reason=objects.some(o=>!o)?"Some selected objects no longer exist.":objects.some(o=>document.layers[o.layerId]?.locked)?"Selection includes a locked layer. Unlock it before editing.":objects.some(o=>!o.visible||!document.layers[o.layerId]?.visible)?"Selection includes hidden objects or layers.":undefined;
  const move=options.workspace==="2d"?"points-move":"translate";
  if(kind==="mixed")return {kind,label:`Mixed selection · ${ids.length}`,reason:reason??"Different object types selected. Only shared tools are shown; select one type for specialized edits.",primary:[move,"duplicate","inspect-selection"],more:["fit-selection"]};
  if(kind==="curve"){
    const f=features.get(ids[0]),curveEdit=f?.params.sketchId?"edit-sketch":f?.params.kind==="spline"?"draw-spline":f?.params.kind==="ellipse"||f?.params.kind==="elliptic-arc"?"draw-ellipse":ids.length===1&&["line","arc"].includes(String(f?.params.kind))?"contour-lengthen":"curve-workflow";
    return {kind,label:`Curves · ${ids.length}`,reason,primary:[move,options.workspace==="2d"?"points-copy":"duplicate",curveEdit],more:["dimension","offset","trim","extend","contour-polyline","contour-join","extrude",...common]};
  }
  if(kind==="image")return {kind,label:`Images · ${ids.length}`,reason,primary:["inspect-image",move,"duplicate"],more:["fit-selection","delete"]};
  if(kind==="solid")return {kind,label:`Solids · ${ids.length}`,reason,primary:["translate","rotate","inspect-selection"],more:common};
  if(kind==="annotation")return {kind,label:`Annotations · ${ids.length}`,reason,primary:["inspect-selection",move,"duplicate"],more:["fit-selection","delete"]};
  return {kind:"unsupported",label:`Selection · ${ids.length}`,reason:reason??"Specialized context tools are unavailable for this object type. Use Properties to inspect it.",primary:["inspect-selection","fit-selection"],more:[]};
}
