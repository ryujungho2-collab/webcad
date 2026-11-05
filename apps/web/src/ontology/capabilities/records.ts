/**
 * WebCAD capability records (2026-11-06).
 *
 * Sources of truth, all re-checked by tests/ontologyCapabilities.test.ts:
 * - command types: packages/cad-commands validateCommand switch + a registered handler
 * - MCP tools: copilot/cadToolContract.ts CAD_TOOLS (readOnly flag must match `kind`)
 * - palette IDs: commands/paletteCommands.ts createPaletteCommands
 * - key routing: input/shortcutRouter.ts routeCadShortcut / routeHistoryShortcut
 * - every Evidence file exists and contains its symbol
 * The starting inventory was docs/verification/AUTOCAD-SHORTCUT-COVERAGE-2026-11-05.md.
 * "unconfirmed" keeps that document's meaning: no user path was found, which is not proof
 * that the capability is absent.
 */
import type { CapabilityRecord, Evidence, PriorVerification, UiAccess } from "./types";

const APP = "apps/web/src/App.tsx";
const ROUTER = "apps/web/src/input/shortcutRouter.ts";
const CATALOG = "apps/web/src/input/shortcutCatalog.ts";
const PALETTE = "apps/web/src/commands/paletteCommands.ts";
const TOOLS = "apps/web/src/copilot/cadModelingTools.ts";
const SCENE_TOOLS = "apps/web/src/copilot/sceneTools.ts";
const BUS = "apps/web/src/state/commandBus.ts";
const PILOT = "apps/web/src/state/cadPilotCommands.ts";
const PILOT_UI = "apps/web/src/viewport/CadPilotTool.tsx";
const POINTS = "apps/web/src/state/pointTransformCommands.ts";
const HISTORY = "apps/web/src/state/history.ts";
const CURVES = "apps/web/src/features/drawing-editing/ui/CurveWorkbench.tsx";
const CONTOUR = "apps/web/src/features/drawing-editing/ui/ContourTool.tsx";
const BASIC_EDIT = "apps/web/src/features/drawing-editing/ui/BasicEditTool.tsx";
const DRAFTING = "apps/web/src/properties/DraftingPanel.tsx";
const PROPERTIES = "apps/web/src/properties/PropertiesPanel.tsx";
const DIMENSIONS = "apps/web/src/state/dimensionCommands.ts";
const DIMENSION_HANDLERS = "apps/web/src/state/registerDimensionCommandHandlers.ts";
const LAYERS = "apps/web/src/explorer/views/LayersPanel.tsx";
const COMPONENTS = "apps/web/src/explorer/views/ComponentsPanel.tsx";
const FLOOR = "apps/web/src/precision/floorPlanWorkflow.ts";
const FLOOR_UI = "apps/web/src/interop/FloorPlanTaskPanel.tsx";
const SOLID_PLAN = "apps/web/src/copilot/copilotSolid.ts";
const COVERAGE = "docs/verification/AUTOCAD-SHORTCUT-COVERAGE-2026-11-05.md";

const ui = (paletteIds: string[] = [], shortcutActions: UiAccess["shortcutActions"] = [], surfaces: string[] = []): UiAccess =>
  ({ paletteIds, shortcutActions, surfaces });
const ev = (file: string, symbol?: string): Evidence => (symbol ? { file, symbol } : { file });
const prior = (file: string, scope: string): PriorVerification => ({ file, scope });
const COVERAGE_BROWSER = prior(COVERAGE, "2026-11-05 browser: shortcutGuide 13, cadPilots 30, draftingWorkflow 16 checks (not re-run here)");

/** Shared notes for the 2D drawing tools. */
const DRAW_2D_PRE = ["2D workspace", "active layer is visible and unlocked (routeCadShortcut drawingAvailable)"];

export const CAPABILITIES: readonly CapabilityRecord[] = Object.freeze([
  // ── Representative capabilities (contract-verified in tests/ontologyCapabilities.test.ts) ──
  {
    id: "draw-2d-curve", label: "Create 2D line / polyline / rectangle / circle / arc", kind: "document-edit", executor: "command-bus",
    commandTypes: ["create-drawing"], mcpTools: ["curve.polyline", "curve.circle"],
    targetKinds: ["analytic-curve:line", "analytic-curve:polyline", "analytic-curve:rectangle", "analytic-curve:circle", "analytic-curve:arc"],
    support: "supported",
    ui: ui(["draw-line", "draw-polyline", "draw-rectangle", "draw-circle", "draw-arc", "draw-circle-3point", "draw-arc-3point"], ["line", "polyline", "rectangle", "circle", "arc"], ["Ribbon → Draw"]),
    preconditions: [...DRAW_2D_PRE, "MCP: output layer visible and unlocked; new ID not in use"],
    limitations: [
      "MCP curve.polyline needs coplanar vertices parallel to its origin plane, distinct consecutive points, ≥3 points when closed",
      "MCP has no arc tool; arcs are created only through UI tools",
    ],
    evidence: [ev(APP, 'type: "create-drawing", drawing, params'), ev(ROUTER, "routeCadShortcut"), ev(TOOLS, 'call.name === "curve.circle" || call.name === "curve.polyline"')],
    priorVerification: [prior("apps/web/tests/shortcutRouter.test.ts", "key routing"), prior("apps/web/tests/cadToolsAdvanced.test.ts", "curve.polyline planning"), COVERAGE_BROWSER],
  },
  {
    id: "move", label: "Move selection", kind: "document-edit", executor: "command-bus",
    commandTypes: ["move-object", "move-in-ucs"], mcpTools: ["scene.objects"],
    targetKinds: ["analytic-curve", "brep", "annotation", "planar-region", "polygon-mesh", "external-reference"],
    support: "supported",
    ui: ui(["translate", "points-move"], ["move"], ["3D gizmo translate", "2D base-point move (planPointTransform)", "UCS Pilot → Move"]),
    preconditions: ["selection exists and is editable (routeCadShortcut: hasSelection && selectionEditable)"],
    limitations: [
      "assertEditableCommandTargets rejects derived outputs: model projections/sections, construction outputs, pattern instances, planar faces, published sheet geometry",
      "MCP scene.objects refuses one derived output: 'Move the owning sketch or drawing view, not one derived output.'",
      "Direct transforms are rejected while an exploded display offset applies to the part",
    ],
    evidence: [ev(APP, 'type: "move-object", objectId, translation'), ev(POINTS, "planPointTransform"), ev(BUS, "function assertEditableCommandTargets"), ev(SCENE_TOOLS, "Move the owning sketch or drawing view")],
    priorVerification: [prior("apps/web/tests/sceneTools.test.ts", "scene.objects move"), COVERAGE_BROWSER],
  },
  {
    id: "base-point-clipboard", label: "Base-point copy and paste (Clipboard pilot)", kind: "document-edit", executor: "command-bus",
    commandTypes: ["paste-drawing-snapshot"], mcpTools: [],
    targetKinds: ["analytic-curve:line", "analytic-curve:polyline", "analytic-curve:rectangle", "analytic-curve:circle", "analytic-curve:arc", "analytic-curve:point"],
    support: "partial",
    ui: ui(["base-point-clipboard"], [], ["UCS / Clipboard pilot → Copy base point, then Paste at target → Review/Apply"]),
    preconditions: [
      "copy: 1–64 objects and a finite world base point",
      "copy: each object visible on a visible layer, a `drawing` feature with no inputs (independent)",
      "paste: clipboard came from the same document ID; every member layer is visible and unlocked",
    ],
    limitations: [
      "only line, polyline, rectangle, circle, arc and point drawings",
      "rejects sketch-owned, model-projection, construction, pattern and parameter-bound drawings ('need X4-A2')",
      "same document only: copyDrawingClipboard stores documentId and both clipboardPasteCommand and the handler reject another document",
      "in-memory module clipboard, not the OS clipboard; it does not survive a reload and is per editor iframe",
      "pasted members are new independent drawings with new IDs and regenerated topology",
    ],
    evidence: [ev(PILOT, "export function copyDrawingClipboard"), ev(PILOT, "Clipboard pilot is limited to the same document"), ev(PILOT, 'bus.registerHandler("paste-drawing-snapshot"'), ev(PILOT_UI, "clipboardPasteCommand")],
    priorVerification: [prior("apps/web/tests/cadPilots.test.ts", "clipboard pilot Node tests"), prior("docs/verification/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.json", "pilot verification record"), COVERAGE_BROWSER],
    needsVerification: ["no Ctrl+Shift+C / Ctrl+V key routing found; only the pilot tool path"],
  },
  {
    id: "dimension-annotation", label: "Create dimension annotation (linear / aligned / radius)", kind: "document-edit", executor: "command-bus",
    commandTypes: ["create-dimension"], mcpTools: ["draft.linearDimension"],
    targetKinds: ["analytic-curve:line", "analytic-curve:circle", "annotation:dimension"],
    support: "supported",
    ui: ui(["dimension"], [], ["Properties → Add dimension", "Annotation → Orientation (Horizontal/Vertical/Aligned)"]),
    preconditions: ["one supported source selected (planDimensionFromSelection)"],
    limitations: ["MCP draft.linearDimension creates a static measured dimension and needs a nonzero span in its orientation"],
    evidence: [ev(DIMENSIONS, "export function planDimensionFromSelection"), ev(DIMENSION_HANDLERS, 'registerHandler("create-dimension"'), ev(TOOLS, 'call.name==="draft.linearDimension"')],
    priorVerification: [prior("apps/web/tests/dimensionWorkflow.test.ts", "dimension create/update")],
  },
  {
    id: "dimension-edit", label: "Edit dimension text, orientation, offset and style", kind: "document-edit", executor: "command-bus",
    commandTypes: ["update-dimension"], mcpTools: [],
    targetKinds: ["annotation:dimension"], support: "supported",
    ui: ui([], [], ["Properties → Annotation"]),
    preconditions: ["a dimension annotation is selected"],
    limitations: ["no named dimension-style manager (coverage item 032)", "angular dimensions use their own edit path"],
    evidence: [ev(DIMENSION_HANDLERS, 'registerHandler("update-dimension"'), ev(PROPERTIES, "update-dimension")],
    priorVerification: [prior("apps/web/tests/dimensionWorkflow.test.ts", "dimension create/update")],
  },
  {
    id: "driving-dimension-edit", label: "Change a driving dimension (solid parameter, sketch dimension, variable)", kind: "document-edit", executor: "command-bus",
    commandTypes: ["update-primitive", "update-extrude", "set-sketch-dimension", "set-variable"], mcpTools: ["solid.parameter"],
    targetKinds: ["brep", "sketch", "variable"], support: "supported",
    ui: ui(["variables"], [], ["Properties → numeric model edit", "Sketch Inspector → dimension", "Variables panel"]),
    preconditions: ["MCP solid.parameter: exactly one selected supported solid; standalone proposal"],
    limitations: ["dependent features regenerate inside the same transaction; a regeneration failure rejects the whole edit"],
    evidence: [ev(SOLID_PLAN, "export function solidParameterPlan"), ev(TOOLS, 'calls.some(call=>call.name==="solid.parameter")'), ev("apps/web/src/state/featureRegeneration.ts", "export async function regenerateDependentFeatures")],
    priorVerification: [prior("apps/web/tests/copilotSolid.test.ts", "solid.parameter planning")],
  },
  {
    id: "extrude", label: "Extrude closed profiles", kind: "document-edit", executor: "command-bus",
    commandTypes: ["create-extrude", "update-extrude"], mcpTools: ["solid.extrude"],
    targetKinds: ["analytic-curve", "planar-region", "brep"], support: "supported",
    ui: ui(["extrude"], ["extrude"], ["Properties → Extrude"]),
    preconditions: ["selected closed profile(s) (routeCadShortcut: canExtrude)", "MCP: profiles are selected visible unlocked sources or outputs of earlier steps"],
    limitations: [
      "MCP profile references must be unique",
      "an open profile passes MCP planning and is rejected at Preview by the create-extrude handler ('Selected geometry does not form a closed loop')",
      "the result must pass BRep measurement in prepareCadCommand",
    ],
    evidence: [ev(APP, 'type: "create-extrude"'), ev(TOOLS, 'call.name === "solid.extrude"'), ev("apps/web/src/state/dispatchCadCommand.ts", "Invalid solid geometry")],
    priorVerification: [prior("apps/web/tests/cadToolsAdvanced.test.ts", "tool planning incl. extrude")],
  },
  {
    id: "undo", label: "Undo", kind: "document-edit", executor: "history",
    commandTypes: [], mcpTools: [], targetKinds: ["document"], support: "supported",
    ui: ui(["undo"], ["undo"], ["Ctrl+Z / Cmd+Z"]),
    preconditions: ["no document command pending (isDocumentCommandPending)", "a past snapshot exists"],
    limitations: ["whole-document snapshots, at most 100 entries", "session only: cleared on document load, not saved", "not exposed to MCP/Copilot; remote Apply is also disallowed"],
    evidence: [ev(HISTORY, "export function undoDocument"), ev(ROUTER, "routeHistoryShortcut"), ev("packages/cad-history/src/HistoryStack.ts", "maxEntries = 100")],
    priorVerification: [prior("apps/web/tests/shortcutRouter.test.ts", "Ctrl+Z routing")],
  },
  {
    id: "redo", label: "Redo", kind: "document-edit", executor: "history",
    commandTypes: [], mcpTools: [], targetKinds: ["document"], support: "supported",
    ui: ui(["redo"], ["redo"], ["Ctrl+Y / Ctrl+Shift+Z"]),
    preconditions: ["no document command pending", "a future snapshot exists (cleared by any new edit)"],
    limitations: ["same as Undo"],
    evidence: [ev(HISTORY, "export function redoDocument"), ev(ROUTER, 'return key === "y" ? "redo" : null')],
    priorVerification: [prior("apps/web/tests/shortcutRouter.test.ts", "Ctrl+Y routing")],
  },

  // ── Capabilities reached from the 120 AutoCAD items (static mapping) ──
  { id: "trim", label: "Trim", kind: "document-edit", executor: "command-bus", commandTypes: ["trim-contour", "trim-drawing"], mcpTools: [], targetKinds: ["analytic-curve"], support: "supported",
    ui: ui(["trim"], ["trim"], ["Modify → Trim"]), preconditions: ["boundaries then target segment (routeCadShortcut: canTrim)"], limitations: [],
    evidence: [ev(CURVES, "trim-contour"), ev(ROUTER, 'case "x": return context.canTrim ? "trim" : null')], priorVerification: [] },
  { id: "extend", label: "Extend", kind: "document-edit", executor: "command-bus", commandTypes: ["extend-drawing"], mcpTools: [], targetKinds: ["analytic-curve"], support: "supported",
    ui: ui(["extend"], ["extend"], ["Modify → Extend"]), preconditions: ["boundary chosen (canTrim)"], limitations: [],
    evidence: [ev(ROUTER, 'return context.canTrim ? "extend" : null')], priorVerification: [] },
  { id: "curve-corner", label: "2D fillet / chamfer of curve corners", kind: "document-edit", executor: "command-bus", commandTypes: ["edit-drawing-corner"], mcpTools: [], targetKinds: ["analytic-curve"], support: "supported",
    ui: ui(["curve-workflow"], [], ["Curve workflow → Fillet / Chamfer"]), preconditions: [], limitations: ["F is Fit view, not fillet"],
    evidence: [ev(CURVES, "edit-drawing-corner")], priorVerification: [] },
  { id: "offset", label: "Offset", kind: "document-edit", executor: "command-bus", commandTypes: ["offset-drawing", "offset-sketch-geometry"], mcpTools: [], targetKinds: ["analytic-curve"], support: "supported",
    ui: ui(["offset"], ["offset"], []), preconditions: ["editable drawing selected (canOffset)"], limitations: [],
    evidence: [ev(CURVES, "offset-drawing"), ev(ROUTER, 'case "o": return context.canOffset ? "offset" : null')], priorVerification: [] },
  { id: "copy-by-points", label: "Copy by points / duplicate", kind: "document-edit", executor: "command-bus", commandTypes: ["duplicate-object"], mcpTools: [], targetKinds: ["analytic-curve", "brep", "annotation"], support: "supported",
    ui: ui(["points-copy", "duplicate"], ["copy"], ["Shift+C (2D)", "Ctrl+D duplicate in place"]), preconditions: ["2D workspace and editable selection for Shift+C"],
    limitations: ["sketch-owned geometry is not duplicated (handler returns without change)", "a duplicate is an independent snapshot with new topology IDs"],
    evidence: [ev(POINTS, '"duplicate-object"'), ev(BUS, "Sketch geometry is owned by its sketch")], priorVerification: [] },
  { id: "hatch", label: "Associative hatch create / edit", kind: "document-edit", executor: "command-bus", commandTypes: ["create-drafting", "update-drafting"], mcpTools: [], targetKinds: ["annotation:hatch"], support: "supported",
    ui: ui(["drafting"], [], ["Drafting → Associative hatch"]), preconditions: [], limitations: ["H is Hide selection"], evidence: [ev(DRAFTING, 'value="hatch"')], priorVerification: [COVERAGE_BROWSER] },
  { id: "scale", label: "Scale selection", kind: "document-edit", executor: "command-bus", commandTypes: ["scale-object"], mcpTools: [], targetKinds: ["analytic-curve", "brep"], support: "supported",
    ui: ui(["scale"], ["scale"], []), preconditions: ["editable selection"], limitations: ["S is Scale, not STRETCH"], evidence: [ev(ROUTER, 'case "s": return context.hasSelection')], priorVerification: [] },
  { id: "rotate", label: "Rotate selection", kind: "document-edit", executor: "command-bus", commandTypes: ["rotate-object"], mcpTools: [], targetKinds: ["analytic-curve", "brep"], support: "supported",
    ui: ui(["rotate", "points-rotate"], ["rotate"], []), preconditions: ["editable selection"], limitations: [], evidence: [ev(ROUTER, '"rotate"')], priorVerification: [] },
  { id: "pattern", label: "Mirror and linear / radial array (live pattern)", kind: "document-edit", executor: "command-bus", commandTypes: ["create-pattern", "update-pattern", "detach-pattern", "delete-pattern"], mcpTools: [], targetKinds: ["analytic-curve"], support: "partial",
    ui: ui(["pattern-linear", "pattern-radial", "pattern-mirror"], [], []), preconditions: [], limitations: ["no path array (coverage item 053)"],
    evidence: [ev("apps/web/src/state/patternCommands.ts", "create-pattern")], priorVerification: [] },
  { id: "delete", label: "Delete selection", kind: "document-edit", executor: "command-bus", commandTypes: ["delete-object"], mcpTools: [], targetKinds: ["analytic-curve", "brep", "annotation"], support: "supported",
    ui: ui(["delete"], [], ["Delete key", "Inspector → Delete"]), preconditions: ["selected editable object"], limitations: ["E is Extrude; no MCP delete tool"],
    evidence: [ev(APP, 'event.key === "Delete"')], priorVerification: [] },
  { id: "cancel-tool", label: "Cancel tool / clear selection", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["selection"], support: "supported",
    ui: ui(["cancel-tool"], [], ["Esc"]), preconditions: [], limitations: [], evidence: [ev(APP, 'event.key === "Escape"')], priorVerification: [] },
  { id: "selection", label: "Pick, Shift toggle and window / crossing selection", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["selection"], support: "supported",
    ui: ui(["object-select"], ["select"], ["left→right window, right→left crossing"]), preconditions: [], limitations: [],
    evidence: [ev("apps/web/src/state/selection.ts")], priorVerification: [] },
  { id: "repeat-command", label: "Repeat last command", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["selection"], support: "supported",
    ui: ui(["repeat-command"], [], ["Enter / Space on idle canvas"]), preconditions: ["a supported previous command"], limitations: [],
    evidence: [ev(PALETTE, '"repeat-command"')], priorVerification: [prior("apps/web/tests/paletteCommandIds.test.ts", "repeat-command runnable")] },
  { id: "double-click-edit", label: "Double-click to edit by object type", kind: "interaction", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["selection"], support: "unconfirmed",
    ui: ui(), preconditions: [], limitations: ["Inspector, F2 and Edit Sketch paths exist separately"], evidence: [ev(COVERAGE, "| 023 |")], priorVerification: [] },
  { id: "diameter-dimension", label: "Diameter dimension", kind: "document-edit", executor: "command-bus", commandTypes: ["create-dimension"], mcpTools: [], targetKinds: ["analytic-curve:circle", "analytic-curve:arc"], support: "supported",
    ui: ui([], [], ["Add diameter dimension"]), preconditions: ["circle or arc with uniform transform"], limitations: [], evidence: [ev(DIMENSIONS, "export function planDiameterFromSelection")], priorVerification: [prior("apps/web/tests/diameterDimension.test.ts", "diameter")] },
  { id: "angular-dimension", label: "Angular dimension between two edges", kind: "document-edit", executor: "command-bus", commandTypes: ["create-dimension", "update-dimension"], mcpTools: [], targetKinds: ["analytic-curve:line"], support: "supported",
    ui: ui(["angular-dimension"], [], ["Draw → Angular Dimension"]), preconditions: ["two straight edges"], limitations: [], evidence: [ev("apps/web/src/viewport/AngularDimensionTool.tsx", "create-dimension")], priorVerification: [prior("apps/web/tests/angularDimensionWorkflow.test.ts", "angular")] },
  { id: "continuous-dimension", label: "Continuous (chain) dimensions", kind: "document-edit", executor: "command-bus", commandTypes: ["create-drafting"], mcpTools: [], targetKinds: ["analytic-curve:line", "analytic-curve:polyline"], support: "partial",
    ui: ui(["drafting"], [], ["Drafting → Continuous dimensions"]), preconditions: [], limitations: ["chains line/polyline segments; continuing from an existing dimension end was not found"], evidence: [ev(DRAFTING, 'value="chain"')], priorVerification: [] },
  { id: "baseline-dimension", label: "Baseline dimensions", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["annotation:dimension"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 028 |")], priorVerification: [] },
  { id: "text", label: "Single-line text create / edit", kind: "document-edit", executor: "command-bus", commandTypes: ["create-drafting", "update-drafting"], mcpTools: ["draft.text"], targetKinds: ["annotation:text"], support: "partial",
    ui: ui(["add-text"], ["text"], ["T", "Draw → Text"]), preconditions: DRAW_2D_PRE, limitations: ["no MTEXT paragraph formatting or MT alias", "no named text styles (item 090)"], evidence: [ev(DRAFTING, 'value="text"'), ev(TOOLS, 'call.name==="draft.text"')], priorVerification: [] },
  { id: "layer-management", label: "Layer create / rename / visibility / lock / style / delete", kind: "document-edit", executor: "command-bus",
    commandTypes: ["create-layer", "rename-layer", "set-layer-visible", "set-layer-locked", "set-layer-style", "delete-layer"], mcpTools: ["scene.layer"], targetKinds: ["layer"], support: "supported",
    ui: ui(["panel-layers"], [], ["Explorer → Layers"]), preconditions: [], limitations: ["MCP scene.layer creates layers only", "no one-step 'turn all layers on' (item 100)"], evidence: [ev(LAYERS, "set-layer-visible")], priorVerification: [] },
  { id: "active-layer", label: "Set active drawing layer", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["layer"], support: "partial",
    ui: ui(["panel-layers"], [], ["Layers row click"]), preconditions: [], limitations: ["no 'pick an object to make its layer current'"], evidence: [ev(LAYERS)], priorVerification: [] },
  { id: "move-to-layer", label: "Move objects to a layer", kind: "document-edit", executor: "command-bus", commandTypes: ["move-object-to-layer"], mcpTools: ["scene.objects"], targetKinds: ["analytic-curve", "brep", "annotation"], support: "supported",
    ui: ui(["properties"], [], ["Properties → layer"]), preconditions: [], limitations: [], evidence: [ev(PROPERTIES, "move-object-to-layer")], priorVerification: [] },
  { id: "match-properties", label: "Match properties from a source object", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["selection"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: ["library style application is separate"], evidence: [ev(COVERAGE, "| 038 |")], priorVerification: [] },
  { id: "view-navigation", label: "Fit, pan, zoom and orbit the view", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["viewport"], support: "supported",
    ui: ui(["fit-all", "fit-selection", "fit-context", "wheel-pan", "wheel-zoom", "middle-pan", "middle-orbit", "wheel-rotate"], ["fit"], []), preconditions: [], limitations: ["P is Polyline, not pan"], evidence: [ev(CATALOG, '"middle-pan"')], priorVerification: [COVERAGE_BROWSER] },
  { id: "panel-visibility", label: "Show / hide Explorer and Properties", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["ui-panel"], support: "partial",
    ui: ui(["explorer", "properties"], [], []), preconditions: [], limitations: ["no single clean-screen toggle"], evidence: [ev(PALETTE, '"explorer"')], priorVerification: [] },
  { id: "command-line-toggle", label: "Command line show / hide", kind: "interaction", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["ui-panel"], support: "unconfirmed", ui: ui(["command-search"], [], []), preconditions: [], limitations: ["Ctrl+K opens the command search palette, not a command line"], evidence: [ev(COVERAGE, "| 044 |")], priorVerification: [] },
  { id: "library-browse", label: "Browse components and styles from the project and other files", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["component-instance", "block-definition"], support: "partial", ui: ui(), preconditions: [], limitations: ["not a DWG DesignCenter"], evidence: [ev("apps/web/src/library/LibraryPanel.tsx")], priorVerification: [] },
  { id: "regen", label: "Regenerate display (REGEN)", kind: "interaction", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["viewport"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 046 |")], priorVerification: [] },
  { id: "project-tabs", label: "Switch open project tabs", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["project"], support: "supported", ui: ui(["project-search", "project-tabs"], [], []), preconditions: [], limitations: ["Ctrl+Tab is left to the browser"], evidence: [ev(CATALOG, '"project-search"')], priorVerification: [] },
  { id: "block-define", label: "Define block / component from selection", kind: "document-edit", executor: "command-bus", commandTypes: ["define-block", "define-component-content"], mcpTools: [], targetKinds: ["block-definition"], support: "supported", ui: ui(["drafting", "panel-components"], [], ["Components → Create", "Drafting → Define block"]), preconditions: [], limitations: [], evidence: [ev(COMPONENTS, "define-block"), ev(DRAFTING, "define-block")], priorVerification: [] },
  { id: "block-insert", label: "Insert block / component", kind: "document-edit", executor: "command-bus", commandTypes: ["insert-block", "place-component-content"], mcpTools: [], targetKinds: ["block-instance", "component-instance"], support: "supported", ui: ui(["drafting", "panel-components"], [], ["Components → Insert", "Drafting → Insert block"]), preconditions: [], limitations: ["I is Measure distance"], evidence: [ev(DRAFTING, "insert-block")], priorVerification: [] },
  { id: "block-update", label: "Update block definition from selection", kind: "document-edit", executor: "command-bus", commandTypes: ["update-block"], mcpTools: [], targetKinds: ["block-definition"], support: "partial", ui: ui(["panel-components"], [], ["Components → Update from selection"]), preconditions: [], limitations: ["no in-place block editor session (items 105–106)"], evidence: [ev(COMPONENTS, "update-block")], priorVerification: [] },
  { id: "block-attributes", label: "Block attribute edit / sync", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["block-instance"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 107 |")], priorVerification: [] },
  { id: "block-editor-session", label: "Block editor open / close", kind: "interaction", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["block-definition"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 106 |")], priorVerification: [] },
  { id: "write-block-file", label: "Write selection / block to a separate file (WBLOCK)", kind: "io", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["file"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: ["WebCAD and DXF export of the whole document are separate"], evidence: [ev(COVERAGE, "| 051 |")], priorVerification: [] },
  { id: "explode", label: "Explode polyline / rectangle, disband block", kind: "document-edit", executor: "command-bus", commandTypes: ["explode-drawings", "explode-block"], mcpTools: [], targetKinds: ["analytic-curve:polyline", "analytic-curve:rectangle", "block-instance"], support: "supported", ui: ui(["contour-explode", "disband-block"], [], []), preconditions: [], limitations: ["X is Trim"], evidence: [ev(CONTOUR, "explode-drawings"), ev("apps/web/src/features/drawing-editing/commands/blockCommands.ts", "explode-block")], priorVerification: [] },
  { id: "paste-as-block", label: "Paste clipboard as block", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["block-definition"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 056 |")], priorVerification: [] },
  { id: "save-local", label: "Save local recovery checkpoint", kind: "io", executor: "file-io", commandTypes: [], mcpTools: [], targetKinds: ["project"], support: "partial", ui: ui(["save-local", "save"], [], ["Ctrl+S"]), preconditions: [], limitations: ["saves in this browser, not to the downloaded file"], evidence: [ev(APP, 'if (key === "s")')], priorVerification: [] },
  { id: "download-file", label: "Download WebCAD file", kind: "io", executor: "file-io", commandTypes: [], mcpTools: [], targetKinds: ["file"], support: "partial", ui: ui(["download-file", "save-as"], [], ["Ctrl+Shift+S"]), preconditions: [], limitations: ["no file name / format chooser like SAVEAS"], evidence: [ev(CATALOG, '"download-file"')], priorVerification: [] },
  { id: "dxf-reference-import", label: "Import DXF as a locked reference layer", kind: "io", executor: "file-io", commandTypes: ["record-dxf-source"], mcpTools: [], targetKinds: ["layer", "file"], support: "partial", ui: ui(["import-dxf"], [], []), preconditions: [], limitations: ["no reload / detach link to the source DWG"], evidence: [ev("apps/web/src/interop/DxfPreparationDialog.tsx")], priorVerification: [] },
  { id: "measure-distance", label: "Measure distance", kind: "inspection", executor: "read-only", commandTypes: [], mcpTools: ["cad.measure"], targetKinds: ["analytic-curve", "brep"], support: "supported", ui: ui(["measure"], ["measure"], []), preconditions: [], limitations: ["saving a measurement is a separate document edit (upsert-saved-measurement)"], evidence: [ev(ROUTER, 'case "i": return "measure"')], priorVerification: [] },
  { id: "inspect-properties", label: "Inspect selection type, geometry, area / perimeter", kind: "inspection", executor: "read-only", commandTypes: [], mcpTools: ["cad.inspect", "cad.objects"], targetKinds: ["analytic-curve", "brep", "annotation"], support: "supported", ui: ui(["inspect-selection", "properties"], [], ["Properties"]), preconditions: [], limitations: ["area is shown only for supported closed objects; no pick-points AREA tool (item 062)"], evidence: [ev(PROPERTIES)], priorVerification: [] },
  { id: "point-coordinate", label: "Point coordinate readout (ID)", kind: "inspection", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["work-plane"], support: "partial", ui: ui(["ucs-pilot"], [], ["UCS Pilot local U,V"]), preconditions: [], limitations: ["no dedicated XYZ point query"], evidence: [ev(PILOT_UI)], priorVerification: [] },
  { id: "variables-expressions", label: "Variables and unit-aware expressions", kind: "document-edit", executor: "command-bus", commandTypes: ["set-variable", "remove-variable", "set-parameter-binding", "remove-parameter-binding"], mcpTools: [], targetKinds: ["variable"], support: "partial", ui: ui(["variables"], [], ["Variables panel", "numeric fields"]), preconditions: [], limitations: ["no standalone CAL / quick calculator (items 066–067)"], evidence: [ev("apps/web/src/properties/VariablesPanel.tsx", "set-variable")], priorVerification: [] },
  { id: "quick-calculator", label: "Quick calculator panel", kind: "interaction", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["ui-panel"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 067 |")], priorVerification: [] },
  { id: "snap-settings", label: "Object snap settings and F3 toggle", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["viewport"], support: "supported", ui: ui(["snap"], [], ["Status bar → Snaps", "F3"]), preconditions: [], limitations: [], evidence: [ev("apps/web/src/status/SnapSettings.tsx"), ev(APP, 'event.key === "F3"')], priorVerification: [] },
  { id: "ortho-toggle", label: "Ortho mode (F8)", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["viewport"], support: "supported", ui: ui(["ortho"], [], ["F8"]), preconditions: [], limitations: [], evidence: [ev(APP, 'event.key === "F8"')], priorVerification: [] },
  { id: "tracking-dynamic-input", label: "Snap tracking, polar lock and dynamic numeric input", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["viewport"], support: "partial", ui: ui(["tab-context"], [], ["Shift+A tracking", "Shift+L axis", "Tab fields"]), preconditions: ["while a drawing tool is active"], limitations: ["no F10/F11/F12 toggles"], evidence: [ev("apps/web/src/viewport/CadViewport.tsx")], priorVerification: [] },
  { id: "regular-polygon", label: "Regular polygon", kind: "document-edit", executor: "command-bus", commandTypes: ["create-regular-polygon"], mcpTools: [], targetKinds: ["analytic-curve:polyline"], support: "supported", ui: ui(["regular-polygon"], [], []), preconditions: DRAW_2D_PRE, limitations: [], evidence: [ev("apps/web/src/state/regularPolygonCommands.ts", "create-regular-polygon")], priorVerification: [] },
  { id: "ellipse", label: "Ellipse draw / edit", kind: "document-edit", executor: "command-bus", commandTypes: ["create-drawing", "update-ellipse"], mcpTools: [], targetKinds: ["analytic-curve:ellipse"], support: "supported", ui: ui(["draw-ellipse"], [], []), preconditions: [], limitations: [], evidence: [ev("apps/web/src/viewport/EllipseTool.tsx", "update-ellipse")], priorVerification: [] },
  { id: "spline", label: "Spline / NURBS by fit or control points", kind: "document-edit", executor: "command-bus", commandTypes: ["create-drawing", "update-spline"], mcpTools: ["curve.fitted", "curve.reshape", "curve.adjust"], targetKinds: ["analytic-curve:spline"], support: "supported", ui: ui(["draw-spline"], [], []), preconditions: [], limitations: [], evidence: [ev("apps/web/src/viewport/SplineTool.tsx", "update-spline")], priorVerification: [] },
  { id: "construction-line", label: "Independent infinite construction line", kind: "document-edit", executor: "command-bus", commandTypes: ["create-construction", "create-drawing"], mcpTools: [], targetKinds: ["analytic-curve:infinite-line"], support: "supported", ui: ui(["construction"], [], ["Construction → Independent infinite line"]), preconditions: [], limitations: [], evidence: [ev("apps/web/src/viewport/ConstructionTool.tsx", "create-construction")], priorVerification: [] },
  { id: "make-face", label: "Make planar face from a selected closed boundary", kind: "document-edit", executor: "command-bus", commandTypes: ["create-drawing"], mcpTools: [], targetKinds: ["planar-region"], support: "partial", ui: ui(["floor-plan-tasks"], [], ["Floor plan tasks → Make face"]), preconditions: ["selected closed boundary"], limitations: ["not BOUNDARY's pick-inside-point polyline output"], evidence: [ev(FLOOR, 'kind:"face"')], priorVerification: [] },
  { id: "stretch", label: "Stretch vertices inside a crossing window", kind: "document-edit", executor: "command-bus", commandTypes: ["stretch-drawings"], mcpTools: [], targetKinds: ["analytic-curve"], support: "supported", ui: ui(["contour-stretch"], [], ["Modify → Stretch"]), preconditions: [], limitations: ["S key is Scale"], evidence: [ev(BASIC_EDIT, "stretch-drawings")], priorVerification: [] },
  { id: "join", label: "Join open curves", kind: "document-edit", executor: "command-bus", commandTypes: ["join-drawings", "connect-drawings"], mcpTools: [], targetKinds: ["analytic-curve"], support: "supported", ui: ui(["contour-join"], [], ["Modify → Join"]), preconditions: ["joinable open curves"], limitations: [], evidence: [ev(CONTOUR, "join-drawings")], priorVerification: [] },
  { id: "edit-polyline", label: "Edit polyline vertices, open/close, line↔arc", kind: "document-edit", executor: "command-bus", commandTypes: ["edit-polyline", "convert-contour-edge"], mcpTools: [], targetKinds: ["analytic-curve:polyline"], support: "supported", ui: ui(["contour-polyline", "contour-convert"], [], ["Modify → Edit polyline"]), preconditions: [], limitations: [], evidence: [ev(BASIC_EDIT, "edit-polyline")], priorVerification: [] },
  { id: "break-contour", label: "Break at one point or between two points", kind: "document-edit", executor: "command-bus", commandTypes: ["break-drawing"], mcpTools: [], targetKinds: ["analytic-curve"], support: "supported", ui: ui(["contour-break"], [], []), preconditions: [], limitations: [], evidence: [ev(CONTOUR, "break-drawing")], priorVerification: [] },
  { id: "lengthen", label: "Lengthen by total / delta / percent", kind: "document-edit", executor: "command-bus", commandTypes: ["lengthen-drawing"], mcpTools: [], targetKinds: ["analytic-curve"], support: "supported", ui: ui(["contour-lengthen"], [], ["Modify → Lengthen"]), preconditions: [], limitations: [], evidence: [ev(BASIC_EDIT, "lengthen-drawing")], priorVerification: [] },
  { id: "arrange-align", label: "Align and distribute selection", kind: "document-edit", executor: "command-bus", commandTypes: ["move-object"], mcpTools: [], targetKinds: ["analytic-curve", "brep"], support: "partial",
    ui: ui(["align-left", "align-center-x", "align-right", "align-top", "align-center-y", "align-bottom", "distribute-horizontal", "distribute-vertical"], [], []), preconditions: [], limitations: ["no point-pair ALIGN with rotate/scale"], evidence: [ev("apps/web/src/state/selectionCommands.ts", "export function planAlignment")], priorVerification: [] },
  { id: "duplicate-boundary-diagnosis", label: "Diagnose duplicate boundaries in floor plan tasks", kind: "inspection", executor: "read-only", commandTypes: [], mcpTools: [], targetKinds: ["analytic-curve"], support: "partial", ui: ui(["floor-plan-tasks"], [], []), preconditions: [], limitations: ["diagnosis only; no general OVERKILL cleanup"], evidence: [ev(FLOOR, "duplicate")], priorVerification: [] },
  { id: "image-draw-order", label: "Image bring forward / send back", kind: "document-edit", executor: "command-bus", commandTypes: ["reorder-image"], mcpTools: [], targetKinds: ["image"], support: "partial", ui: ui(["inspect-image"], [], ["Image Inspector"]), preconditions: [], limitations: ["images only; no general vector / hatch draw order (items 087, 089)"], evidence: [ev("apps/web/src/properties/ImageInspector.tsx", "reorder-image")], priorVerification: [] },
  { id: "general-draw-order", label: "Draw order for vectors and hatches (DRAWORDER / HATCHTOBACK)", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["annotation:hatch"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 089 |")], priorVerification: [] },
  { id: "text-style", label: "Named text styles (ST)", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["annotation:text"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: ["text height and rotation are editable per object"], evidence: [ev(COVERAGE, "| 090 |")], priorVerification: [] },
  { id: "model-note", label: "Model-linked leader note", kind: "document-edit", executor: "command-bus", commandTypes: ["upsert-model-note"], mcpTools: [], targetKinds: ["annotation", "brep"], support: "partial", ui: ui(["assembly-drawings"], [], ["Assembly and drawings → Model note"]), preconditions: [], limitations: ["no general multileader or leader styles (items 091–092)"], evidence: [ev("apps/web/src/viewport/ModelDrawingPanel.tsx", "upsert-model-note")], priorVerification: [] },
  { id: "leader-style", label: "Multileader style manager", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["annotation"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 092 |")], priorVerification: [] },
  { id: "dimension-spacing", label: "Re-space existing dimensions (DIMSPACE)", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["annotation:dimension"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 094 |")], priorVerification: [],
    needsVerification: ["candidate not checked: layout-saved-measurements spaces saved-measurement dimensions only (docs/implementation/MEAS-DIMENSION-LAYOUT-2026-10-18.md)"] },
  { id: "dimension-break", label: "Dimension break (DIMBREAK)", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["annotation:dimension"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: [], evidence: [ev(COVERAGE, "| 095 |")], priorVerification: [] },
  { id: "center-mark", label: "Center mark annotation (DIMCENTER)", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["annotation"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: ["center snap is a point-picking aid"], evidence: [ev(COVERAGE, "| 096 |")], priorVerification: [] },
  { id: "layer-isolate", label: "Layer isolate / unisolate", kind: "interaction", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["layer"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: ["Isolate selection works per object"], evidence: [ev(COVERAGE, "| 097 |")], priorVerification: [] },
  { id: "layer-freeze", label: "Layer freeze / thaw", kind: "document-edit", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["layer"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: ["visibility and lock exist; freeze state not found"], evidence: [ev(COVERAGE, "| 101 |")], priorVerification: [] },
  { id: "purge", label: "Purge unused blocks and empty layers", kind: "document-edit", executor: "command-bus", commandTypes: ["purge-unused"], mcpTools: [], targetKinds: ["block-definition", "layer"], support: "partial", ui: ui(["floor-plan-tasks"], [], ["Floor plan tasks → Review PURGE"]), preconditions: [], limitations: ["unused block definitions and empty unreferenced layers only"], evidence: [ev(FLOOR, 'type:"purge-unused"')], priorVerification: [] },
  { id: "document-audit", label: "Audit and repair a drawing (AUDIT)", kind: "inspection", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["document"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: ["output preflight and load validation are separate"], evidence: [ev(COVERAGE, "| 110 |")], priorVerification: [] },
  { id: "recover-file", label: "Open and repair a damaged file (RECOVER)", kind: "io", executor: "none", commandTypes: [], mcpTools: [], targetKinds: ["file"], support: "unconfirmed", ui: ui(), preconditions: [], limitations: ["restoring the previous valid local checkpoint is separate"], evidence: [ev(COVERAGE, "| 111 |")], priorVerification: [] },
  { id: "units", label: "Document units", kind: "document-edit", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["document"], support: "partial", ui: ui(), preconditions: [], limitations: ["the model is millimetres; per-field unit input and dimension display units exist; no document-wide UNITS setting"], evidence: [ev(COVERAGE, "| 112 |")], priorVerification: [] },
  { id: "ucs", label: "User coordinate system (saved work planes, UCS pilot)", kind: "document-edit", executor: "command-bus", commandTypes: ["upsert-work-plane", "create-ucs-drawing", "move-in-ucs"], mcpTools: [], targetKinds: ["work-plane"], support: "partial", ui: ui(["work-plane", "ucs-pilot"], [], ["Inspector → work plane", "UCS Pilot"]), preconditions: [], limitations: ["UCS pilot covers line, circle and move; it does not change every tool's coordinates"], evidence: [ev(PILOT, 'bus.registerHandler("create-ucs-drawing"')], priorVerification: [COVERAGE_BROWSER] },
  { id: "ucs-look-at", label: "Look at active UCS (PLAN)", kind: "interaction", executor: "ui-state", commandTypes: [], mcpTools: [], targetKinds: ["viewport", "work-plane"], support: "supported", ui: ui(["ucs-pilot"], [], ["UCS Pilot → Look at active UCS"]), preconditions: [], limitations: [], evidence: [ev(PILOT_UI)], priorVerification: [] },
  { id: "isolate-selection", label: "Isolate selection / exit isolation / show all", kind: "interaction", executor: "ui-state", commandTypes: ["show-all-objects"], mcpTools: [], targetKinds: ["selection", "viewport"], support: "supported", ui: ui(["isolate", "show-all", "hide"], ["hide"], []), preconditions: [], limitations: ["isolation is viewport-only React state; document visibility is untouched", "Show all objects is a document edit (show-all-objects)"],
    evidence: [ev(APP, "Temporary viewport-only isolation"), ev(APP, "async function handleIsolateObject")], priorVerification: [],
    needsVerification: ["isolate-object has a command handler but no UI caller was found"] },
  { id: "plot-pdf", label: "Plot / export PDF (active plane or artboards)", kind: "io", executor: "file-io", commandTypes: [], mcpTools: [], targetKinds: ["artboard", "file"], support: "partial", ui: ui(["plot", "export-artboard-pdf"], [], ["File → Plot PDF", "Artboard PDF"]), preconditions: [], limitations: ["no Ctrl+P routing", "no named page setups or plotter manager", "artboard PDF previews the first page"], evidence: [ev("apps/web/src/plot/PlotDialog.tsx"), ev("apps/web/src/export/ArtboardPdfDialog.tsx")], priorVerification: [] },
]);
