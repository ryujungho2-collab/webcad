import { featureContract, type CadDocument, type CadFeature } from "@agent-webcad/cad-document";
import { buildDependencyGraph, dependencyNodeId, type DependencyNode } from "./dependencyGraph";

const codeEvidence = [
  { file: "apps/web/src/state/dependencyGraph.ts", symbol: "buildDependencyGraph" },
  { file: "apps/web/src/state/featureRegeneration.ts", symbol: "liveFeatureInputs" },
  { file: "packages/cad-document/src/FeatureContract.ts", symbol: "featureContract" },
] as const;

function isProfileExtrude(feature?: CadFeature): feature is CadFeature {
  return feature?.type === "extrude" && feature.params.kind === "extrude" &&
    !feature.params.hybridDatum && !feature.params.architecturalSlab && !feature.params.faceSketchId;
}

function isProfileRepresentation(representation: string | null) {
  return representation === "analytic-curve" || representation === "planar-region";
}

/** A JSON-ready projection of recorded direct inputs. A supplied graph must
 * have been built from this same document, as in the Inspector. */
export function queryProfileExtrudeRelations(document: CadDocument, objectId: string, graph = buildDependencyGraph(document)) {
  const selectedId = dependencyNodeId("object", objectId);
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const features = new Map(Object.values(document.features).map(feature => [feature.output, feature]));
  const owners = new Map<string, { sketchId: string; missing: boolean }[]>();
  for (const edge of graph.edges) {
    const owner = nodes.get(edge.from);
    if (edge.relation !== "sketch-owner" || owner?.kind !== "sketch") continue;
    const entry = { sketchId: owner.sourceId, missing: !!owner.missing };
    const list = owners.get(edge.to);
    if (list) list.push(entry);
    else owners.set(edge.to, [entry]);
  }

  const endpoint = (node: DependencyNode) => {
    const feature = features.get(node.sourceId);
    return {
      objectId: node.sourceId,
      label: node.label,
      featureId: feature?.id ?? null,
      representation: feature ? featureContract(feature).representation : null,
      missing: !!node.missing,
      layerId: document.objects[node.sourceId]?.layerId ?? null,
      sketchOwners: owners.get(node.id) ?? [],
    };
  };
  const selected = nodes.get(selectedId);
  const subject = selected ? endpoint(selected) : null;
  const role = !subject || subject.missing ? "missing"
    : isProfileExtrude(features.get(objectId)) ? "extrude"
    : isProfileRepresentation(subject.representation) ? "profile-candidate" : "unsupported";

  const relations = graph.edges.flatMap(edge => {
    if ((edge.from !== selectedId && edge.to !== selectedId) ||
        (edge.relation !== "live-input" && edge.relation !== "snapshot-source")) return [];
    const sourceNode = nodes.get(edge.from), targetNode = nodes.get(edge.to);
    if (sourceNode?.kind !== "object" || targetNode?.kind !== "object" || targetNode.missing) return [];
    const extrude = features.get(targetNode.sourceId);
    if (!isProfileExtrude(extrude)) return [];
    const source = endpoint(sourceNode);
    if (source.representation && !isProfileRepresentation(source.representation)) return [];
    // When the saved input is missing we retain the ID, without inferring
    // a shape or matching it to nearby geometry.
    const status = source.missing ? "missing-source"
      : source.featureId === null ? "missing-source-feature" : "resolved";
    return [{
      direction: "profile-to-extrude" as const,
      viewedFrom: edge.from === selectedId ? "outgoing" as const : "incoming" as const,
      mode: edge.relation === "live-input" ? "live" as const : "snapshot" as const,
      status,
      source,
      target: endpoint(targetNode),
      evidence: {
        graphRelation: edge.relation,
        extrudeFeatureId: extrude.id,
        recordedInputId: source.objectId,
        declaredDependencyMode: extrude.dependencyMode ?? null,
      },
    }];
  });
  return {
    schema: "webcad.profile-extrude-relations.v1" as const,
    document: { id: document.id, revision: document.revision },
    selectedObjectId: objectId,
    role,
    subject,
    relations,
    codeEvidence: codeEvidence.map(entry => ({ ...entry })),
  };
}

export type ProfileExtrudeRelationReport = ReturnType<typeof queryProfileExtrudeRelations>;
