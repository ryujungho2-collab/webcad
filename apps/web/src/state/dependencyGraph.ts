import { sketchConstraintGeometryIds } from "@agent-webcad/cad-document";
import { evaluateExpression, evaluateVariables, type CadDocument, type SketchConstraint } from "@agent-webcad/cad-document";
import { liveFeatureInputs } from "./featureRegeneration";
import { constructionExpression } from "@agent-webcad/cad-document";

export type DependencyNode = { id: string; kind: "object" | "sketch" | "geometry" | "variable" | "binding" | "block" | "component"; sourceId: string; label: string; operation?: string; missing?: boolean };
export type DependencyEdge = { from: string; to: string; relation: "live-input" | "snapshot-source" | "annotation-source" | "sketch-owner" | "parameter-binding" | "variable-reference" | "block-instance" | "component-content" };
export type ConstraintGroup = { sketchId: string; members: string[]; constraints: { id: string; kind: SketchConstraint["kind"]; members: string[]; definition: SketchConstraint; value?: number | [number, number] }[]; degreesOfFreedom: number; residual: number };
export type CadDependencyGraph = { nodes: DependencyNode[]; edges: DependencyEdge[]; solveGroups: ConstraintGroup[]; diagnostics: string[] };
export const dependencyNodeId = (kind: DependencyNode["kind"], ...parts: string[]) => JSON.stringify([kind, ...parts]);

/** A detached read model of authoritative document relationships. Solver
 * equations are simultaneous groups, never invented directional DAG edges.
 * A recorded source of an independent copy is explicitly a snapshot. */
export function buildDependencyGraph(document: CadDocument): CadDependencyGraph {
  const nodes = new Map<string, DependencyNode>(), edges = new Map<string, DependencyEdge>(), solveGroups: ConstraintGroup[] = [], diagnostics: string[] = [];
  const add = (node: DependencyNode) => nodes.set(node.id, node);
  const edge = (from: string, to: string, relation: DependencyEdge["relation"]) => { const value = { from, to, relation }; edges.set(JSON.stringify(value), value); };
  const objectNode = (id: string) => {
    const key = dependencyNodeId("object", id);
    if (!nodes.has(key)) add({ id: key, kind: "object", sourceId: id, label: document.objects[id]?.name ?? id, missing: !document.objects[id] });
    return key;
  };
  for (const object of Object.values(document.objects)) objectNode(object.id);
  for(const def of Object.values(document.componentLibrary??{}))add({id:dependencyNodeId("component",def.id),kind:"component",sourceId:def.id,label:def.name});
  for (const block of Object.values(document.blocks ?? {})) add({ id: dependencyNodeId("block", block.id), kind: "block", sourceId: block.id, label: block.name });
  for (const sketch of Object.values(document.sketches ?? {})) {
    const sketchKey = dependencyNodeId("sketch", sketch.id);
    add({ id: sketchKey, kind: "sketch", sourceId: sketch.id, label: `Sketch ${sketch.id}`, operation: "solve constraints" });
    const key = (id: string) => dependencyNodeId("geometry", sketch.id, id);
    for (const geometry of sketch.geometry) add({ id: key(geometry.id), kind: "geometry", sourceId: geometry.id, label: document.objects[geometry.id]?.name ?? geometry.id, operation: geometry.kind });
    const references = sketchConstraintGeometryIds;
    solveGroups.push({ sketchId: sketch.id, members: sketch.geometry.map(g => key(g.id)), constraints: sketch.constraints.map(c => ({ id: c.id, kind: c.kind, members: [...new Set(references(c))].map(key), definition: structuredClone(c), ...("value" in c ? { value: structuredClone(c.value) } : {}) })), degreesOfFreedom: sketch.solveState.degreesOfFreedom, residual: sketch.solveState.residual });
    for (const geometry of sketch.geometry) { edge(key(geometry.id), sketchKey, "sketch-owner"); if (document.objects[geometry.id]) edge(sketchKey, objectNode(geometry.id), "sketch-owner"); }
  }
  for (const feature of Object.values(document.features)) {
    const output = objectNode(feature.output), node = nodes.get(output)!; node.operation = feature.construction ? constructionExpression(feature.construction) : String(feature.params.kind ?? feature.type);
    if (typeof feature.params.sketchId === "string") {
      const sketchId = feature.params.sketchId, key = dependencyNodeId("sketch", sketchId);
      if (!nodes.has(key)) add({ id: key, kind: "sketch", sourceId: sketchId, label: `Sketch ${sketchId}`, missing: true });
      edge(key, output, "sketch-owner");
    }
    const live = new Set(liveFeatureInputs(feature, document));
    const annotations = new Set<string>((feature.type === "dimension" || feature.type === "drafting" && feature.params.kind === "hatch")
      ? [...(typeof feature.params.sourceObjectId === "string" ? [feature.params.sourceObjectId] : []), ...(Array.isArray(feature.params.sourceObjectIds) ? feature.params.sourceObjectIds.filter((v): v is string => typeof v === "string") : [])] : []);
    for (const id of new Set([...feature.inputs, ...annotations])) edge(objectNode(id), output, annotations.has(id) ? "annotation-source" : live.has(id) ? "live-input" : "snapshot-source");
    const content=feature.params.componentContent as import("@agent-webcad/cad-document").ComponentContent|undefined;
    if(content)for(const id of new Set([content.definitionId,content.overrideDefinitionId].filter((s):s is string=>!!s))){const key=dependencyNodeId("component",id);if(!nodes.has(key))add({id:key,kind:"component",sourceId:id,label:id,missing:true});edge(key,output,"component-content");}
    if (typeof feature.params.blockId === "string") {
      const id = feature.params.blockId, key = dependencyNodeId("block", id);
      if (!nodes.has(key)) add({ id: key, kind: "block", sourceId: id, label: id, missing: true });
      edge(key, output, "block-instance");
    }
  }
  for (const variable of Object.values(document.variables ?? {})) add({ id: dependencyNodeId("variable", variable.name), kind: "variable", sourceId: variable.name, label: variable.name, operation: variable.expression });
  let variables: ReturnType<typeof evaluateVariables> = {};
  try {
    variables = evaluateVariables(document.variables);
    for (const variable of Object.values(variables)) for (const name of variable.dependencies) edge(dependencyNodeId("variable", name), dependencyNodeId("variable", variable.name), "variable-reference");
  } catch (e) { diagnostics.push(e instanceof Error ? e.message : String(e)); }
  for (const binding of Object.values(document.parameterBindings ?? {})) {
    const key = dependencyNodeId("binding", binding.id), target = binding.target.kind === "feature" ? objectNode(binding.target.objectId) : dependencyNodeId("sketch", binding.target.sketchId);
    add({ id: key, kind: "binding", sourceId: binding.id, label: binding.expression, operation: binding.target.kind === "feature" ? binding.target.parameter : binding.target.constraintId });
    if (!nodes.has(target)) add({ id: target, kind: "sketch", sourceId: binding.target.kind === "sketch-constraint" ? binding.target.sketchId : "", label: target, missing: true });
    edge(key, target, "parameter-binding");
    try {
      const result = evaluateExpression(binding.expression, name => { const v = variables[name]; if (!v) throw new Error(`Missing variable '${name}'.`); return { value: v.value, length: v.quantity === "length" ? 1 : 0, angle: v.quantity === "angle" ? 1 : 0 }; });
      for (const name of result.dependencies) edge(dependencyNodeId("variable", name), key, "variable-reference");
    } catch (e) { diagnostics.push(`Binding ${binding.id}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  for (const n of nodes.values()) if (n.missing) diagnostics.push(`Missing ${n.kind} source: ${n.sourceId}`);
  return structuredClone({ nodes: [...nodes.values()], edges: [...edges.values()], solveGroups, diagnostics });
}

export function createDependencyExplainer(graph: CadDependencyGraph) {
  const nodes = new Map(graph.nodes.map(n => [n.id, n])), incoming = new Map<string, DependencyEdge[]>(), outgoing = new Map<string, DependencyEdge[]>();
  for (const e of graph.edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    incoming.get(e.to)!.push(e); outgoing.get(e.from)!.push(e);
  }
  return (objectId: string) => {
  const id = dependencyNodeId("object", objectId);
  const immediate = (incoming.get(id) ?? []).map(e => ({ relation: e.relation, source: nodes.get(e.from)! }));
  const dependents = (outgoing.get(id) ?? []).map(e => ({ relation: e.relation, target: nodes.get(e.to)! }));
  const reachable = (direction: "from" | "to", liveOnly: boolean) => {
    const opposite = direction === "from" ? "to" : "from", found = new Set<string>(), queue = [id];
    // Editing a sketch-owned object can affect its simultaneous solve group.
    // This is a query expansion, not a fictitious directed geometry constraint.
    if (direction === "from") queue.push(...immediate.filter(e => e.relation === "sketch-owner").map(e => e.source.id));
    while (queue.length) { const current = queue.pop()!; for (const e of (direction === "from" ? outgoing : incoming).get(current) ?? []) if ((!liveOnly || e.relation !== "snapshot-source") && e[opposite] !== id && !found.has(e[opposite])) { found.add(e[opposite]); queue.push(e[opposite]); } }
    return [...found].map(key => nodes.get(key)!);
  };
  const upstream = reachable("to", false), affected = reachable("from", true);
  const sketchIds = reachable("to", true).filter(n => n.kind === "sketch").map(n => n.sourceId);
  return structuredClone({ object: nodes.get(id), immediate, dependents, upstream, affected, solveGroups: graph.solveGroups.filter(g => sketchIds.includes(g.sketchId)) });
  };
}
export const explainObjectDependencies = (graph: CadDependencyGraph, objectId: string) => createDependencyExplainer(graph)(objectId);

