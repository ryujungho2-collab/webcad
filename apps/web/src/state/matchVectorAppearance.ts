import type { CadCommand } from "@agent-webcad/cad-commands";
import type { CadDocument, CadVectorStyle } from "@agent-webcad/cad-document";
import { DEFAULT_VECTOR_STYLE } from "@agent-webcad/cad-document";
import { dxfVectorStyle } from "../precision/dxfStyle";
import { layerStyle } from "../precision/layerStyle";

export const MATCH_VECTOR_FIELDS = {
  stroke: "Stroke color",
  fill: "Fill",
  opacity: "Opacity",
  strokeWidth: "Stroke width",
} as const;

export type MatchVectorField = keyof typeof MATCH_VECTOR_FIELDS;

function isSupportedDrawing(params: Record<string, unknown>) {
  return params.workPlane === "XY" && !params.facePlaneId && !params.construction
    && !params.dxfStyle && !params.projectionVisibility && params.sectionLineWeight === undefined
    && ["line", "polyline", "rectangle", "circle", "arc"].includes(String(params.kind));
}

export function planMatchVectorAppearance(document: CadDocument, sourceId: string, targetIds: string[], fields: MatchVectorField[]) {
  if (!targetIds.length) throw Error("Choose at least one target.");
  if (!fields.length || fields.some(field => !Object.hasOwn(MATCH_VECTOR_FIELDS, field))) {
    throw Error("Choose at least one supported appearance property.");
  }
  const features = new Map(Object.values(document.features).map(feature => [feature.output, feature]));
  const roots = new Set(document.rootObjects);

  function inspect(id: string, role: "Source" | "Target") {
    const object = document.objects[id];
    const feature = features.get(id);
    const layer = object && document.layers[object.layerId];
    const label = `${role} ${object?.name ?? id}`;
    if (!object?.visible || !layer?.visible) throw Error(`${label} is missing or hidden.`);
    if (role === "Target" && layer.locked) throw Error(`${label} is on a locked layer.`);
    if (!roots.has(id) || feature?.type !== "drawing" || !isSupportedDrawing(feature.params)) {
      throw Error(`${label} is not a supported native XY drawing.`);
    }
    const closed = feature.params.kind === "rectangle" || feature.params.kind === "circle"
      || feature.params.kind === "polyline" && feature.params.closed === true;
    if (fields.includes("fill") && !closed) throw Error(`${label} needs a closed outline to copy fill.`);
    const base = layerStyle(layer);
    const overrides = feature.params.vectorStyle as Partial<CadVectorStyle> | undefined;
    const style = dxfVectorStyle(feature.params, base)
      ?? { ...DEFAULT_VECTOR_STYLE, stroke: base.color, strokeWidth: base.lineWeight };
    return { label, style, overrides };
  }

  const source = inspect(sourceId, "Source");
  if (fields.includes("fill") && source.style.fillGradient) {
    throw Error("Gradient fill on the source is unsupported. Deselect Fill to copy the other properties.");
  }
  const style: Partial<CadVectorStyle> = {};
  for (const field of fields) {
    Object.assign(style, { [field]: source.style[field] });
    if (field === "fill") style.fillGradient = null;
  }

  const commands: Extract<CadCommand, { type: "set-vector-style" }>[] = [];
  const rows = [];
  for (const objectId of new Set(targetIds)) {
    if (objectId === sourceId) throw Error("Choose targets other than the source.");
    const target = inspect(objectId, "Target");
    if (Object.entries(style).every(([key, value]) => Object.is(target.overrides?.[key as keyof CadVectorStyle], value))) continue;
    commands.push({ type: "set-vector-style", objectId, style, merge: true });
    rows.push({ objectId, label: target.label, before: target.style });
  }
  if (!commands.length) throw Error("Targets already have these explicit appearance values.");
  const command: CadCommand = { type: "batch", label: "Match vector appearance", commands };
  return { command, rows, style };
}
