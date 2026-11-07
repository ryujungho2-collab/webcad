/**
 * WebCAD capability ontology · query API.
 *
 * Read-only lookups over CAPABILITIES and AUTOCAD_SHORTCUT_MAPPINGS. A match here means
 * "this capability is described for that command / tool / object kind"; it does not mean a
 * concrete request will be accepted. Execution and rejection stay with validateCommand,
 * the CommandBus handlers and the Copilot tool planners.
 *
 * Runtime imports: @agent-webcad/cad-document (pure package) and sibling files only.
 */
import { featureContract, type CadDocument } from "@agent-webcad/cad-document";
import type { CadToolName } from "../../copilot/cadToolContract";
import { AUTOCAD_SHORTCUT_MAPPINGS } from "./autocadShortcuts";
import { CAPABILITIES, CAPABILITY_UPDATES } from "./records";
import type {
  AutocadShortcutMapping, CadCommandType, CapabilityExecutor, CapabilityKind, CapabilityRecord, CapabilitySupport, ShortcutVerdict, TargetKind,
} from "./types";

export * from "./types";
export { CAPABILITIES, CAPABILITY_UPDATES } from "./records";
export { AUTOCAD_SHORTCUT_MAPPINGS } from "./autocadShortcuts";

export const CAPABILITY_ONTOLOGY_VERSION = "webcad-capability-ontology-v1";

const byId = new Map(CAPABILITIES.map(record => [record.id, record]));

export function getCapability(id: string): CapabilityRecord | undefined {
  return byId.get(id);
}

export function capabilitiesByCommandType(type: CadCommandType): CapabilityRecord[] {
  return CAPABILITIES.filter(record => record.commandTypes.includes(type));
}

export function capabilitiesByMcpTool(tool: CadToolName): CapabilityRecord[] {
  return CAPABILITIES.filter(record => record.mcpTools.includes(tool));
}

export function capabilitiesByPaletteId(paletteId: string): CapabilityRecord[] {
  return CAPABILITIES.filter(record => record.ui.paletteIds.includes(paletteId));
}

export function shortcutMapping(no: number): AutocadShortcutMapping | undefined {
  return AUTOCAD_SHORTCUT_MAPPINGS.find(item => item.no === no);
}

export function shortcutItemsForCapability(id: string): AutocadShortcutMapping[] {
  return AUTOCAD_SHORTCUT_MAPPINGS.filter(item => item.capabilityIds.includes(id));
}

/** `analytic-curve` matches `analytic-curve:line`; an exact narrowed kind matches only itself or its base. */
export function targetKindMatches(declared: TargetKind, actual: TargetKind): boolean {
  if (declared === actual) return true;
  const [declaredBase, declaredSub] = declared.split(":");
  const [actualBase] = actual.split(":");
  return declaredSub === undefined && declaredBase === actualBase;
}

export type CapabilityQuery = {
  kind?: CapabilityKind;
  support?: CapabilitySupport;
  executor?: CapabilityExecutor;
  targetKind?: TargetKind;
  /** Case-insensitive match against id, label, limitations and preconditions. */
  text?: string;
};

export function findCapabilities(query: CapabilityQuery): CapabilityRecord[] {
  const text = query.text?.toLocaleLowerCase();
  return CAPABILITIES.filter(record =>
    (!query.kind || record.kind === query.kind)
    && (!query.support || record.support === query.support)
    && (!query.executor || record.executor === query.executor)
    && (!query.targetKind || record.targetKinds.some(declared => targetKindMatches(declared, query.targetKind!)))
    && (!text || [record.id, record.label, ...record.limitations, ...record.preconditions].some(value => value.toLocaleLowerCase().includes(text))));
}

// ── Bridge to an object / relation ontology ───────────────────────────────────

/**
 * The seam a future object/relation ontology implements: classify one document object into
 * capability target kinds. Capability candidates for that object are then a pure lookup.
 */
export interface ObjectOntologyBridge {
  targetKindsOf(objectId: string): TargetKind[];
}

/** Minimal bridge from stored document data via cad-document's featureContract. */
export function documentObjectBridge(document: CadDocument): ObjectOntologyBridge {
  const producers = new Map(Object.values(document.features).map(feature => [feature.output, feature]));
  return {
    targetKindsOf(objectId) {
      const feature = producers.get(objectId);
      if (!document.objects[objectId] || !feature) return [];
      const kinds: TargetKind[] = [];
      if (feature.params.architecturalWall) kinds.push("wall");
      if (feature.params.architecturalSlab) kinds.push("slab");
      if (feature.params.componentContent) kinds.push("component-instance");
      if (feature.type === "image") kinds.push("image");
      if (feature.type === "drafting" && feature.params.kind === "block") kinds.push("block-instance");
      let representation: string;
      try {
        representation = featureContract(feature).representation;
      } catch {
        return kinds;
      }
      const subkind = typeof feature.params.kind === "string" ? feature.params.kind : undefined;
      kinds.push((subkind ? `${representation}:${subkind}` : representation) as TargetKind);
      return kinds;
    },
  };
}

/** Capabilities described for an object. Candidates only: validators still decide. */
export function candidateCapabilitiesForObject(bridge: ObjectOntologyBridge, objectId: string, query: Omit<CapabilityQuery, "targetKind"> = {}): CapabilityRecord[] {
  const kinds = bridge.targetKindsOf(objectId);
  return findCapabilities(query).filter(record => record.targetKinds.some(declared => kinds.some(kind => targetKindMatches(declared, kind))));
}

// ── Serializable inventory (docs/verification/WEBCAD-CAPABILITY-INVENTORY.json) ──

export function capabilityInventory() {
  const count = <K extends string>(values: K[]) => values.reduce((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {} as Record<K, number>);
  return {
    version: CAPABILITY_ONTOLOGY_VERSION,
    source: "apps/web/src/ontology/capabilities",
    note: "Current capability support; shortcut verdicts are the historical 2026-11-05 audit. Execution is decided by validateCommand, CommandBus handlers and Copilot planners.",
    shortcutBaselineDate: "2026-11-05",
    supportUpdates: CAPABILITY_UPDATES,
    summary: {
      capabilities: CAPABILITIES.length,
      bySupport: count(CAPABILITIES.map(record => record.support)),
      byKind: count(CAPABILITIES.map(record => record.kind)),
      byExecutor: count(CAPABILITIES.map(record => record.executor)),
      shortcutItems: AUTOCAD_SHORTCUT_MAPPINGS.length,
      shortcutVerdicts: count(AUTOCAD_SHORTCUT_MAPPINGS.map(item => item.verdict)) as Record<ShortcutVerdict, number>,
      commandTypesReferenced: [...new Set(CAPABILITIES.flatMap(record => record.commandTypes))].sort().length,
      mcpToolsReferenced: [...new Set(CAPABILITIES.flatMap(record => record.mcpTools))].sort().length,
    },
    capabilities: CAPABILITIES,
    autocadShortcuts: AUTOCAD_SHORTCUT_MAPPINGS,
  };
}
