# Phase 5A verification — 2026-10-27

## Result

The bounded Mesh surface → reference → datum → exact rectangular OpenCascade extrusion → source regeneration → Review/Apply → save/reload workflow is implemented and verified in Edge. Planar BRep box/Hybrid-prism conversion is implemented. General Mesh-to-BRep reconstruction is **not** a shipped feature; only a small installed-kernel feasibility experiment was performed.

This does not declare the whole product stabilized. The previous 53 unresolved product-browser cases remain a separate backlog. No tests were removed or skipped to obtain the result.

## Executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| New Hybrid unit/integration tests | 13 passed | `output/verification/hybrid-phase-5a/hybrid-unit.log` |
| Focused Hybrid + Sculpt + Polygon + Nodes tests | 54 passed, 0 failed/skipped | `output/verification/hybrid-phase-5a/focused.log` |
| Full unit/integration suite after implementation | **1,731 passed / 54 suites**, 0 failed/cancelled/skipped; 88.10 s | `output/verification/hybrid-phase-5a/all-tests.log` |
| Hybrid native browser vertical slice | **19 passed**; initial run and final focused rerun both passed | `output/verification/hybrid-phase-5a/browser-hybridGeometry.log` |
| Existing Sculpt native browser/Worker checks | **37 passed** | `output/verification/hybrid-phase-5a/browser-sculpt.log` |
| Existing Face Sketch browser checks | **5 passed** | `output/verification/hybrid-phase-5a/browser-b5FaceSketch.log` |
| Existing Work Planes browser page | **Failed** at `b5WorkPlanes.browser.tsx:88`, UI wait after Undo; same location/symptom as Phase 4 audit | `output/verification/hybrid-phase-5a/browser-b5WorkPlanes.log` |
| Workspace build (`pnpm build`) | Passed; existing Vite >500 kB chunk warning remains | `output/verification/hybrid-phase-5a/workspace-build.log` |
| Architecture boundary/document check | Passed, 869 modules | `output/verification/hybrid-phase-5a/architecture.log` |
| Bounded Mesh → BRep feasibility probe | Two valid cube solids, open input refused | `output/verification/hybrid-phase-5a/brep-feasibility.json` |

The focused and full suites, and the final native browser reruns, used the final product implementation. The full run also includes the explicit analytic BRep validity/volume assertion. Prior Phase 4 verification was inspected before running new tests; the full 172-page product-browser audit was not repeated.

## Verified behaviour

- Real ray picking in a perspective viewport on a translated, rotated, nonuniformly scaled baked-and-sculpted Mesh. The hit path verifies current render/control-mesh identity, placement and visible occlusion.
- Reference preview shows datum axes without publishing. Discard leaves the document unchanged.
- Datum + 4 × 6 × 5 mm rectangular prism is an actual OpenCascade solid; independent triangle-volume and analytic BRep validity/volume checks verify 120 mm³.
- Geometry Nodes graph is preserved; explicit Bake produces the independently sculpted reference source.
- Another Sculpt stroke updates the material point and precise prism together. One Undo/Redo restores both source and dependent output.
- Topology edits invalidate references; the last valid shape is retained, export/conversion is blocked, explicit reselection repairs the reference.
- Nonuniform transforms keep a unit orthogonal frame and exact world-mm dimensions. Direct mutation of the owned prism is refused.
- A locked dependent output makes the source Sculpt transaction roll back atomically.
- Remesh retains original objects and references; substituting the new Remesh object ID into an old reference is invalid.
- Planar BRep conversion produces 8 welded vertices / 12 triangle faces / 6 source face-key groups for the prism fixture, with closed manifold incidence. Original BRep is unchanged.
- Converted Mesh remains independently editable; the conversion map is a historical receipt, and its target-topology match becomes false after topology editing.
- Unsupported cylinder conversion, corrupted face ranges and conversion budget overflow are rejected.
- v59 serializes and reloads references, precise BRep, editable Mesh and conversion receipts. Hybrid data mislabeled as v58 and malformed barycentric coordinates are rejected. Legacy Polygon data without Hybrid records still saves as v56.
- Actual browser reload invokes the file-loading Worker and preserves the full feature state. New capture-session identity does not make a same-document persisted reference unusable.
- MCP tool-session reads are nonmutating; tool plans and native UI commands produce identical reviewed geometry. This validates the shared MCP tool/compiler/CommandBus path, **not** a new external LLM/provider or remote MCP network-client session.

## Failures and classification

- Initial new tests exposed a real reference defect: an unedited mesh had no provenance base yet; its first Sculpt event introduced the base and was incorrectly treated as lost lineage. The resolver now normalizes the initial topology inventory. Source Sculpt/regeneration and history tests pass.
- Initial test-contract issues were corrected: exact floating-point equality, JSON negative zero, missing mandatory tool call IDs, and expecting invalid-command exceptions to be returned as normal results. No validation was weakened.
- Initial runtime import failed on a new wildcard package export. Explicit named exports fix the package's existing module interop; subsequent tests/build pass.
- The final related browser failure is **existing UI wait timeout; root cause unconfirmed**, not classified as a newly established Hybrid regression. The earlier `final-browser-audit.json` already records the same Work Planes page failure at line 88. Three checks preceding that wait pass, but the page remains failed. It was neither modified nor skipped and was not repeatedly retried.

## Support/accuracy and unmeasured areas

- BRep → Mesh: boxes and this phase's validated planar rectangular prisms only. Curved/general/imported BRep conversion is unsupported. Tessellation settings are recorded as fixed existing-kernel settings, not user-configurable new tolerances.
- Zero analytic chord error applies only to the supported planar subset. Seam displacement is measured with a 1e-7 mm weld tolerance. Certified Hausdorff distance and arbitrary curved tessellation error are not implemented.
- References track the **same ordered triangle** and compatible topology/provenance. Split/merge, changed triangulation, remesh, source replacement and active evaluated modifiers require reselection/Bake. No generalized topological naming solution is claimed.
- Exact feature UI is a rectangular extrusion. Generic constrained sketch authoring, Hole attachment, arbitrary feature placement and dimension-edit UI for existing Hybrid prisms are not new delivered features.
- Sculpt production budgets remain 5,000 vertices / 10,000 faces / 20,000 render triangles / 128 samples. The earlier lack of a real-time guarantee remains. This phase adds no larger-mesh throughput or memory guarantee.
- No full product browser audit, multi-browser matrix, remote MCP/LLM session, long-duration memory test, large reverse-conversion benchmark, or analytic-cylinder fitting experiment was performed.

## Feasibility observations and next gate

Installed OpenCascade construction/sewing/solid-validation bindings successfully reconstructed a controlled 10 mm cube as 12 planar triangle faces and as 6 already-known planar regions. Both report valid BRep, volume 1000.0000000000003 mm³ and area 600 mm². Open cube input is refused with four boundary edges. These are faceted construction fixtures, **not** automatic region recognition, analytic fitting or recovered parametric design history. See the architecture document for the approach comparison.

Phase 5B scoped work can proceed on this vertical foundation. Curved conversion and generalized reference tracking must remain gated on explicit accuracy/tolerance acceptance, provenance tests, closure validation and measured Worker budgets. Product-wide stabilization remains gated by the separate 53 unresolved browser cases.
