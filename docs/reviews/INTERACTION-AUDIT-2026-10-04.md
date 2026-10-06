# Command interaction audit

Date: 2026-10-04. The tables below preserve the Phase 0 findings before implementation. The follow-up section records the implemented changes and their verification; the original findings are not the current support matrix.

## Existing routes and inconsistencies

| Tool | Discover / enter | Select / input | Preview / validate / apply | Handoff |
| --- | --- | --- | --- | --- |
| Trim / Join | Ribbon curve workflow, separate legacy Trim and contour Join, palette legacy commands | Workbench local target IDs, canvas branch picks, unit distance; sketches excluded | Detached public plan; local duplicated button/Enter gate and projected-plan check | Select results, repeat / bridge Join / downstream actions |
| Sketch Edit | Inspector and canvas grips; palette only create/finish | Stable point/segment references; shared solver, separate drafts | Extended relations preview; basic relations and Inspector dimensions dispatch immediately; canvas dimensions preview | Same sketch stays active; relation review is cleared on selection/revision |
| Construction | Ribbon only | Saved inputs, coordinate parser including relative coordinates, branch dropdown; initial eligible input auto-selected | Detached plan; local busy/ready gate; canvas Enter separately guarded | Apply selects result and closes editor |
| Pattern Edit | Ribbon create, Inspector edit; absent from palette | Immutable session source list; unit/angle drafts | Detached plan; local busy/ready gate; every animation frame re-renders projected paths | Apply closes; editing can return no created IDs, leaving current selection |
| Dimension | Ribbon/palette and canvas label | Linear/radius annotations versus driving sketch dimensions | Public plan for canvas editing, immediate Inspector commits | Driving solve projects geometry and regenerates live solids |
| Extrusion | Ribbon/palette/Inspector | Closed profile region selection; default 10 mm command | Shared document executor, detached preparation; no universal command panel | Created solid selection / Inspector |

## Reusable architecture

- `state/selection.ts`: object IDs and document-owned topology references; eligibility pruning includes hidden/locked layers. Selection is UI state, not part of document snapshots.
- `viewport/directSelection.ts`, `DirectTargetInspector`, `directTargetDescription`: persistent topology targets and readable labels. Reuse semantic labels; internal IDs belong in expandable diagnostics.
- `state/documentPlans.ts`: immutable reviewed proposal, version checking, explicit disposal and same-proposal Apply. `dispatchCadCommand.ts` prepares on a cloned document and publishes one history snapshot only on success.
- `state/commandBus.ts`, `featureRegeneration.ts`, `dimensionRefresh.ts`: common execution and regeneration path. No new UI geometry executor is needed.
- `precision/units.ts`, `pointInput.ts`, `sketchSolver.ts`, `sketchAdapter.ts`: shared numeric parsing, relative/polar coordinates, constraints, and projection. Existing numeric widgets vary (HTML number versus unit text).
- `packages/cad-document`: sketch point/segment identity, construction graph, pattern recipes/slots, serialization gates. New topology-aware construction elements need a format gate.
- `features/drawing-editing/geometry`: analytic contour operations. `commands/contourReferences.ts` and `sketchContourReferences.ts` are unfinished adapters, typechecked previously but not integration-tested.
- `scripts/browserChecks.mjs`: isolated Chromium/Edge, real input through local CDP helper, full workflow pages; `benchmark:edit` measures warmed mechanical/drawing workloads at 0/250/1000 background objects.

## Defects to address

1. Apply conditions are repeated in handlers and JSX. An old successful preview can briefly coexist with newly entered input until effects dispose it. Share a draft-key-aware authoritative interaction result.
2. Tools expose different status, missing-input, recovery and handoff grammar. Add a small common status/review presentation, while retaining specialized canvas renderers and parameter editors.
3. Discovery is incomplete: construction, patterns and relationship-aware curve workflow are absent from command search. Preserve existing commands and expose the reviewed workflows consistently.
4. Contour reference UI only understands dimension edges. Sketch point/edge constraints, construction spans, and nested pattern references require explicit semantic choices and highlights.
5. Sketch angle constraints reference whole lines only; Join into a polyline requires stable segment-aware angle references. Closed circular sketch contours also need exact normalization.
6. Construction and pattern adapters must prove identity, branch validity, locked downstream rejection, save/reload, Undo/Redo and zero mutation on failure.
7. Preview diff/path access repeatedly scans feature tables; pattern projection updates React on every frame even with a stationary view. Measure representative costs before optimizing.

## Implementation boundary

Promote state/validation gating, precision field presentation, review summary and recovery guidance. Keep transaction, solver, topology policy, geometry and specialized picking in their existing modules. Do not replace the whole UI. Track uncompleted cross-tool transitions and browser coverage in the final implementation record.

## Implemented follow-up

1. `state/commandInteraction.ts` derives stage, authoritative `canApply`, input/reference errors and result/impact data. Exact draft keys and document versions prevent applying an earlier review after input changes. Curve, Construction, Pattern, SketchInspector and Canvas Dimension consume this state. Direct Edit, basic/contour editing, variables, Drafting and Copilot Apply gates also use it; their specialized presentations remain.
2. `CommandReview` shares target, next-input, impact, unresolved-reference and recovery presentation. `PrecisionField` uses the existing unit/coordinate parsers with range validation. Counts now use the same parsing rule in the Pattern field and command parameters. Not every existing numeric widget has been converted.
3. Sketch Inspector basic constraints and driving dimensions now create detached previews before Apply. Its reviewed key includes the actual command, drafts, edges, selection and revision. Node readiness tests and a native browser edit-after-review test guard the stale-input gap.
4. Search and context Workflow use `interactionTools` terminology/order and the same selection/active-sketch/layer entry reasons. Native right-click tests verify active-sketch and locked-layer explanations. The CDP test harness now accepts right-button events; no synthetic context event substitutes for that check.
5. Curve references expose points/endpoints, straight edges, curves and whole endpoint spans. Chosen points/edges are blue; removed segments remain red. Impact includes constraints, dimensions, construction, pattern instances, projections and extrusion changes. Apply selects new geometry, with conditional Edit Sketch / Inspect Construction / Edit Pattern / Extrude handoff. Pattern edits select surviving affected members when no new ID was created.
6. Curve/Pattern/Construction contain a scrollable body and separate non-scrolling Fit/Apply/Cancel footer. This fixes the observed native pointer hit-test failure on Pattern's Fit preview after review content increased the panel height. Existing labels and selectors remain.
7. Sketch/Construction/Pattern reconnection is integrated into the existing atomic proposal, solver and regeneration path. Twelve dedicated Node scenarios cover the chain and a combined closed-sketch→construction→nested-pattern→child-dimension→two-extrusions transaction, save/reload v6, history and failure atomicity. See the [implementation record](../implementation/CONTOUR-TRIM-REFERENCES-2026-10-04.md).
8. Plans retain before/after feature indexes and privately cached world paths; measurement reuses the indexes. Repeated reads return detached clones. See [before/after measurements](../verification/INTERACTION-PERFORMANCE-2026-10-04.md): at 1,000 background objects path p95 78.931→1.565 ms; preview p95 117.457→43.925 ms. The Pattern overlay skips unchanged projected-path state updates.

Verification: the latest complete Node/browser/build/type/architecture evidence is recorded in [PROJECT-STATE](../../PROJECT-STATE.md). The runner includes `interactionRelations` rather than leaving it as an unregistered test page. Its native workflow covers search→owned source→Trim→missing/invalid reference→repair→Apply→Join→Edit Sketch, Undo/Redo, JSON reload, driving input and context recovery reasons.

## 2026-10-05 artboard follow-up

G0 recovered execution using the installed Node/pnpm under authorized host permissions, without reinstalling dependencies. Artboard deletion publication, separate created/modified/deleted impact counts, rollback, stale/double Apply and persistence/history are covered by 10 passing Node workflow tests. The real Artboards panel now uses shared PrecisionField and authoritative commandInteraction review readiness, exact unit conversion, detached value preview and Cancel. Creation/deletion/visibility/lock remain immediate commands; they are not described as reviewed edits.

The registered artboardsWorkflow page passes 25 native pointer/keyboard checks including save and actual reload. Screenshot review caught unstyled fields; a sticky-footer attempt obscured review and failed hit-testing. Separate scrolling body and fixed action area now preserve access to summary and Apply/Cancel/Delete. Viewport frames, board-scoped Fit and per-board export remain absent. See [ARTBOARDS-2026-10-05](../implementation/ARTBOARDS-2026-10-05.md) and [G0 evidence](../verification/G0-ARTBOARDS-2026-10-05.md) for current full-suite results and limitations. October 4 counts above remain historical.

## Remaining boundaries

October 5 G1 follow-up: native `Duplicate → Pattern → Fit preview → Ctrl+Z` reproduced a document-history shortcut that remained blocked by tool/editor ownership. Shared history capture now preserves native text/modal scope, routes buttons and chords through the same transition, cancels extrusion on tool switches, and restores canvas focus. Existing handle/dimension stale-input recovery remains intact; the original 43 direct-edit checks passed after preserving that contract. The registered `sessionContinuity` workflow covers 24 checks, also run with 1,000 background objects. See [G1 evidence](../verification/G1-SESSION-CONTINUITY-2026-10-05.md) for final regression/latency evidence and remaining long/branched History-selection boundaries. This is the first G1 slice, not completion of every interaction boundary below.

October 5 subsequent G1 review reproduced incorrect selected objects after 105 native duplicates and Undo: the document was correct but depth-keyed UI metadata pointed at an older state. History now owns a stable in-memory state token and App keys selection by that token in a WeakMap. Native `historySelection` adds 23 checks for bounded history, branching, changed selection before Redo, batch primary selection, grip reference → Explode → Undo/Redo, Hide, and same-ID file reopening. Seven Node checks verify stack identity and publication/preview/failure/file contracts. JSON and topology identities are unchanged. [Follow-up evidence](../verification/G1-HISTORY-IDENTITY-2026-10-05.md) separates these results from earlier latency observations. External practitioner timing remains unmeasured; it is a follow-up track, not an indefinite prerequisite for G2 artboard frames/Fit/individual SVG.

## 2026-10-05 G2 Artboard / Vector / Component workflow

The Artboards, Components and Properties surfaces now share the document's work-plane, selection, command preview, Review/Apply and History. Artboard frames are visible and pointer-selectable; board Fit actions use their true plane coordinates; board-specific SVG output carries exact page bounds, background and clipping. Drawing appearance edits use the same detached command plan and exact input review as the CAD editor. The Components view creates definitions from selected drawings, inserts through the precision Drafting placement UI, updates a definition and refreshes all placed instances with stable identities.

The native `artboardsWorkflow` adds four checks over the prior G0 page (29 total): active-frame switching, Fit-all, physical frame hit-test and SVG download through the File menu with the saved viewBox/background. `componentsWorkflow` has 13 actual React/Worker/browser checks from drawing selection through style preview, definition, two placements, source replacement, save/reload and Undo/Redo. Nested graph resolution and cycle rejection are Node-integration tested; a dedicated nested-component browser scenario is still absent. The G2 implementation and exact scope are in [G2 implementation record](../implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md).

The full suite now passes at 567 Node tests/53 suites and 25 browser workflows/518 checks; TypeScript, the architecture guard (258 modules) and production build pass. Two added Node regressions verify component source vector style in instance rendering and SVG export, including rendered style after serialization/reload. The production bundle still warns for >500 kB chunks (main 928.54 kB, viewport 597.20 kB), and the OpenCascade WASM is 50.3 MB raw / 13.96 MB gzip. No G2-specific before/after frame, export or memory benchmark was measured, and native automation does not establish practitioner task-time or retry improvements.

- This shares validation/review grammar, not a replacement of every specialized session or canvas renderer. App/Viewport lifecycle extraction, full precision-widget migration and broader hover semantics remain.
- Recovery includes a reason-text classifier; not every backend error identifies an exact topology target. No general-purpose construction-definition editor or branch repair wizard was added.
- Construction and Pattern creation still close into the selected object's Inspector. Curve has explicit next actions. Full original/result navigation and relationship-count history summaries are not universal yet.
- Unsupported mixed sketch bulges, mixed ownership and unresolved/ambiguous references reject atomically. Hatch, continuous-dimension, block and variable-binding source replacement need additional adapters.
- Native regression success does not establish professional task-time/retry improvements, mobile/narrow-screen usability or browser p95. Full-document snapshot/diff/history costs and bundle size remain.

## 2026-10-06 Scene / DXF / diameter follow-up

Scene source revisions now regenerate review without replacing unsaved inputs; simultaneous changes to the saved scene require explicit recovery. Hidden state members collapse Auto Layout space. The editor exposes state/time preview, target-state links and original-object selection, and saved clean scenes export the same evaluated static SVG. Finite nested vector components retain definition/instance identity; unsupported artwork rejects rather than producing a partial scene.

DXF file operations now expose units, finite geometry preview and named exclusions, require acknowledgement of a supported subset, and reject stale documents before Apply/download. Analytic bulge/control vertices replace sampled output. General diameter annotations use PrecisionField and authoritative commandInteraction review. Native locking tests exposed a disappearing review when Properties lost its selection; the dialog lifecycle is now independent of that selection, preserving the input and error until recovery or Cancel.

Registered native checks: Scene 24, DXF 18, diameter 17. Latest full-suite evidence and remaining boundaries are in [G4/CAD implementation](../implementation/G4-CAD-BASICS-2026-10-06.md) and [PROJECT-STATE](../../PROJECT-STATE.md). Component variants, direct layout/annotation handles, general angular annotations, additional OCS, PPTX/GIF, live LLM and external adapters remain separate work.
