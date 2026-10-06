import type { CadDocument } from "./CadDocument";

/** Definitions own the relationship; evaluated drawing params are its cache. */
export type CadConstructionElement = { topologyId: string; endpoint?: "start" | "end"; span?: never } | { span: "endpoints"; topologyId?: never; endpoint?: never };
export type CadConstructionDefinition = (
  | { operation: "segment" | "line-through" | "ray-through"; firstId: string; secondId: string }
  | { operation: "midpoint"; segmentId: string }
  | { operation: "perpendicular-bisector"; segmentId: string; midpointId: string }
  | { operation: "intersection"; firstId: string; secondId: string; branch: "negative" | "positive" }
) & { elements?: Partial<Record<"segment" | "first" | "second", CadConstructionElement>> };

export function constructionInputs(d: CadConstructionDefinition): string[] {
  return [...new Set(d.operation === "midpoint" ? [d.segmentId] : d.operation === "perpendicular-bisector" ? [d.segmentId, d.midpointId] : [d.firstId, d.secondId])];
}
export function validConstructionDefinition(value: unknown): value is CadConstructionDefinition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const d = value as Record<string, unknown>, id = (v: unknown) => typeof v === "string" && v.length > 0;
  if (d.elements !== undefined) {
    if (!d.elements || typeof d.elements !== "object" || Array.isArray(d.elements)) return false;
    const roles = d.operation === "midpoint" || d.operation === "perpendicular-bisector" ? ["segment"] : ["first", "second"];
    if (!Object.entries(d.elements).every(([role, entry]) => {
      if (!roles.includes(role) || !entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const e = entry as CadConstructionElement;
      return e.span === "endpoints" ? role === "segment" && e.topologyId === undefined && e.endpoint === undefined : e.span === undefined && id(e.topologyId) && (e.endpoint === undefined || ["start", "end"].includes(String(e.endpoint)));
    })) return false;
  }
  if (d.operation === "midpoint") return id(d.segmentId);
  if (d.operation === "perpendicular-bisector") return id(d.segmentId) && id(d.midpointId) && d.segmentId !== d.midpointId;
  return ["segment", "line-through", "ray-through", "intersection"].includes(String(d.operation)) && id(d.firstId) && id(d.secondId) && d.firstId !== d.secondId && (d.operation !== "intersection" || d.branch === "negative" || d.branch === "positive");
}
export function constructionExpression(d: CadConstructionDefinition, label: (id: string) => string = id => id): string {
  const source = (id: string, role: "segment" | "first" | "second") => `${label(id)}${d.elements?.[role] ? d.elements[role]!.span ? "[endpoint-span]" : `[${d.elements[role]!.topologyId}${d.elements[role]!.endpoint ? `:${d.elements[role]!.endpoint}` : ""}]` : ""}`;
  if (d.operation === "midpoint") return `midpoint(${source(d.segmentId, "segment")})`;
  if (d.operation === "perpendicular-bisector") return `perpendicularBisector(${source(d.segmentId, "segment")}, midpoint=${label(d.midpointId)})`;
  if (d.operation === "intersection") return `intersection(${source(d.firstId, "first")}, ${source(d.secondId, "second")}, branch=${d.branch})`;
  return `${d.operation}(${source(d.firstId, "first")}, ${source(d.secondId, "second")})`;
}
export function validateConstructionGraph(document: CadDocument) {
  const features = new Map(Object.values(document.features).map(f => [f.output, f]));
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Cyclic construction dependency: ${id}`);
    if (visited.has(id)) return;
    const f = features.get(id); if (!f || !document.objects[id]) throw new Error(`Missing construction source: ${id}`);
    visiting.add(id);
    if (f.construction) {
      if (!validConstructionDefinition(f.construction) || f.type !== "drawing" || f.dependencyMode !== "live" || f.params.sketchId || f.pattern) throw new Error(`Invalid construction definition: ${id}`);
      const inputs = constructionInputs(f.construction);
      if (JSON.stringify(inputs) !== JSON.stringify(f.inputs)) throw new Error(`Invalid construction inputs: ${id}`);
      const expectedKind = f.construction.operation === "segment" ? "line" : f.construction.operation === "ray-through" ? "ray" : ["line-through", "perpendicular-bisector"].includes(f.construction.operation) ? "infinite-line" : "point";
      if (f.params.kind !== expectedKind) throw new Error(`Invalid construction result kind: ${id}`);
      const t = document.objects[id].transform;
      if (t && (t.translation.some(v => v !== 0) || t.rotation.some(v => v !== 0) || (Array.isArray(t.scale) ? t.scale.some(v => v !== 1) : t.scale !== 1))) throw new Error(`Derived construction cannot have an independent transform: ${id}`);
      for (const input of inputs) visit(input);
    } else if (f.dependencyMode !== "snapshot") for (const input of f.inputs) if (features.has(input)) visit(input);
    visiting.delete(id); visited.add(id);
  };
  for (const f of features.values()) if (f.construction) visit(f.output);
}
