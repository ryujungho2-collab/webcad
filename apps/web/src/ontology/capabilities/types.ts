/**
 * WebCAD capability ontology · record types.
 *
 * Descriptive only. Whether a concrete request can run is decided by the existing
 * validators and command handlers (validateCommand, the CommandBus handlers, Copilot tool
 * planners). Nothing here executes `preconditions`; they are explanatory strings.
 *
 * Existing contracts are reused as types so a record cannot name something that does not
 * exist: `CadCommand["type"]` (packages/cad-commands), `CadToolName` (copilot/cadToolContract),
 * `CadShortcutAction` (input/shortcutRouter) and `GeometryRepresentation` (cad-document).
 * All imports are type-only; this module has no runtime dependency on UI, state or kernel.
 */
import type { CadCommand } from "@agent-webcad/cad-commands";
import type { GeometryRepresentation } from "@agent-webcad/cad-document";
import type { CadToolName } from "../../copilot/cadToolContract";
import type { CadShortcutAction } from "../../input/shortcutRouter";

export type CadCommandType = CadCommand["type"];

/** Draft kinds kept as requested. */
export type CapabilityKind = "document-edit" | "inspection" | "interaction" | "io";

/**
 * Added to the draft: which existing mechanism performs the capability.
 * Undo/Redo change the document through History snapshots, not CadCommand; view and
 * panel actions change only UI state. Without this field both would look like
 * "document-edit with no command", which is ambiguous.
 */
export type CapabilityExecutor =
  | "command-bus"   // a CadCommand through dispatchCadCommand / previewCadCommand
  | "history"       // state/history.ts undoDocument / redoDocument
  | "ui-state"      // viewport, panel, selection or tool state only
  | "file-io"       // save, download, import, export, plot
  | "read-only"     // queries that never change the document
  | "none";         // no execution path found (unconfirmed / unsupported)

/** Draft values kept. `unconfirmed` never means "not implemented". */
export type CapabilitySupport = "supported" | "partial" | "unconfirmed" | "unsupported";

type NonGeometricTarget =
  | "document" | "selection" | "viewport" | "layer" | "sketch" | "work-plane" | "variable"
  | "block-definition" | "block-instance" | "component-instance" | "artboard" | "image"
  | "wall" | "slab" | "project" | "file" | "ui-panel";

/** Geometry targets reuse cad-document's representation names, optionally narrowed by kind. */
export type TargetKind = GeometryRepresentation | `${GeometryRepresentation}:${string}` | NonGeometricTarget;

export type Evidence = {
  /** Repository-relative path. Checked to exist by tests/ontologyCapabilities.test.ts. */
  file: string;
  /** Text that must occur in the file (function, handler key or ID). */
  symbol?: string;
};

/** A verification that existed before this inventory; it is not re-run by this module. */
export type PriorVerification = { file: string; scope: string };

export type UiAccess = {
  /** IDs from createPaletteCommands (commands/paletteCommands.ts). */
  paletteIds: string[];
  /** Actions returned by routeCadShortcut / routeHistoryShortcut. */
  shortcutActions: (CadShortcutAction | "undo" | "redo")[];
  /** Free-text surfaces such as "Properties → Annotation". */
  surfaces: string[];
};

export type CapabilityRecord = {
  id: string;
  label: string;
  kind: CapabilityKind;
  executor: CapabilityExecutor;
  commandTypes: CadCommandType[];
  mcpTools: CadToolName[];
  targetKinds: TargetKind[];
  support: CapabilitySupport;
  ui: UiAccess;
  preconditions: string[];
  limitations: string[];
  evidence: Evidence[];
  priorVerification: PriorVerification[];
  /** Open questions that static reading could not settle. */
  needsVerification?: string[];
};

/** Verdicts copied verbatim from docs/verification/AUTOCAD-SHORTCUT-COVERAGE-2026-11-05.md. */
export type ShortcutVerdict = "same-input" | "different-input" | "partial" | "unconfirmed";

export type AutocadShortcutMapping = {
  no: number;
  autocadInput: string;
  verdict: ShortcutVerdict;
  /** Capability IDs this item exercises. Several items may share one capability. */
  capabilityIds: string[];
  note?: string;
};
