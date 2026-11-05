# Phase 5C-1 — healing verification and before/after report

Date: 2026-10-29.

## Outcome

The recorded 0.000001 mm-height noisy fixture now generates a valid six-face OpenCascade solid within the existing tolerance, with its original Mesh unchanged. Shared boundaries use single vertex/edge identities and native edge reuse. Existing Cube, prism, sheared polyhedron and hollow-tube reconstruction cases remain successful.

This is geometry stabilization of the existing command/UI/MCP flow. No cylinder, NURBS, open-Shell publication or new modeling operation was added.

## Final verification

| Check | Final result | Evidence under `output/verification/hybrid-phase-5c1/` |
| --- | --- | --- |
| Geometry + reconstruction + existing Hybrid focused regression | **35 passed**, 0 failed/cancelled/skipped | `focused.log` |
| Full unit/integration suite, executed once at final stage | **1,753 passed / 54 suites**, 0 failed/cancelled/skipped; 87.66 seconds | `all-tests.log` |
| Native Edge reconstruction/healing/browser file flow | **25 checks passed** | `browser-planarReconstruction.log` |
| Existing Hybrid native Edge UI/MCP flow | **19 checks passed** | `browser-hybridGeometry.log` |
| Workspace build, executed once at final stage | **Passed**; existing >500 kB Vite chunk warning | `workspace-build.log` |
| Architecture / dependency / type boundaries | **Passed: 877 modules** | `architecture.log` |
| Quality fixtures | **5 passed**, including the previously rejected noisy fixture | `quality.json`, `quality.log` |

The full 172-page browser audit was excluded. The existing 53 unresolved browser items remain a separate backlog. No new unresolved failure was observed in the executed final scopes. Development checks were not added to final counts, and no test was skipped to obtain these results.

## Failure identification and controlled comparison

The original Phase 5B definition was frozen before changing the classifier: `apps/web/tests/fixtures/phase5b-noisy-definition.json`. The diagnostic reconstructs that definition through the legacy independent-wire path.

| Observation | Phase 5B frozen baseline | Phase 5C-1 |
| --- | --- | --- |
| Region count | 6 | 6 |
| Assignment of top fan triangles | `noise0` absorbed into wall `f2`, `noise3` into wall `f5` | All four top fan triangles remain in the top region |
| Individual Face checks | All valid | All valid |
| Sewing / Shell flag | No free/multiple/deleted edges; shell flagged closed | Closed shell; shared native edges retained |
| Positive signed volume | ≈999.999861111083 mm³ | ≈1000.0000333333335 mm³ |
| Aggregate solid validity | **Invalid** | **Valid**, plus small-edge/self-interference check passed |
| Effective plane tolerance | 1e-5 mm | **1e-5 mm**, unchanged |
| Sewing tolerance | 2e-5 mm | **2e-5 mm**, unchanged |

The old six-region count was insufficient to establish correct classification. The altitude-based normal relaxation allowed almost perpendicular tiny faces into wall regions. The new rule limits that exception to 45° while retaining the existing angle/distance checks. Initial shared-plane solving correctly refused the old assignments because they required excessive movement; the tolerance was not raised to avoid that rejection.

Exact boundary IDs were recovered from the frozen region's original source-face membership and checked against its projected loop coordinates. Maximum separation between copies of the **same source boundary vertex** was **1.0606600595e-5 mm**. The earlier 3.5355343213e-6 mm diagnostic estimated only original cube corners and omitted the fan vertex; the final baseline report replaces that estimate with exact source-ID correspondence.

**Ablation:** corrected classification with legacy independent wires also passes the native solid check (`quality.json: correctedClassificationOnly`). The primary demonstrated failure cause is therefore wrong region absorption. Shared topology additionally removes reliance on reconciling independently generated boundary copies. The report does not claim that edge sharing alone repaired the original classifier.

The diagnostic's individual/context status queries returned no more specific native error while the aggregate solid check was false. No unobserved kernel error code or degenerate-edge cause is asserted. The frozen definition remains covered by a negative test and is not silently healed when treated as an already stored legacy BRep.

## Healing metrics for the formerly failed fixture

| Metric | Measured value |
| --- | ---: |
| Corrected retained vertices | **4** |
| Corrected shared edges | **8** |
| Maximum retained vertex movement | **3.3333333249e-7 mm** |
| Maximum movement of incident input vertices to their fitted regions | **6.6666666676e-7 mm** |
| Effective-tolerance use | **6.6667%** |
| Maximum solved plane residual | **0 mm** in this fixture |
| Boundary gap before shared solving, after classification correction | 3.3333333249e-7 mm |
| Maximum sampled surface distance | **6.6666666676e-7 mm** |
| RMS sampled surface distance | **1.4650642539e-7 mm** |
| Absolute area difference | 1.2834576637e-5 mm² |
| Absolute volume difference | 1.1368683772e-13 mm³ |
| Native BRep faces | **6** |

Movement is measured against the source coordinates; the original Mesh is never edited. Removed interior fan vertices are included in the input-movement bound. Corrected counts exclude numerical roundoff below the precision threshold. Distances remain bidirectional samples to planar BRep tessellation, not certified Hausdorff bounds.

The other four accuracy fixtures remain within numerical roundoff: Cube/prism/tube maximum sampled distance ≤1.89e-15 mm; sheared polyhedron ≤3.67e-15 mm. All five native solids pass validity and self-interference checks. These small-fixture numerical observations are not physical-accuracy or large-model performance guarantees. Full values, timing observations, face correspondence and healing reports are in `quality.json`.

## Accepted and rejected cases

Accepted in tests:

- Triangle Cube, rectangular prism and transformed/sheared planar polyhedron.
- Hole-bearing tube with both annular face holes retained.
- A 0.001 mm square hole and a 0.001 mm tube wall, both keeping two hole loops and their expected analytic volumes.
- The original noisy fan case with bounded movement, true native validation, Preview/Cancel/Apply, source preservation, Undo/Redo and reload.
- Compatible redundant planes; no measurable correction is reported for already exact shared boundaries.

Explicitly rejected in tests:

- Exact T-junction and nonmanifold input.
- Inconsistent nearly parallel plane offsets.
- Orthogonal constraints each offset 8e-6 mm that jointly require movement greater than the 1e-5 mm budget.
- Excessive coordinate magnitude relative to requested numerical tolerance.
- A 0.00002 mm-thick prism at default tolerance: clearance is unsafe relative to the 4×-tolerance guard. No automatic tolerance increase or feature collapse occurs.
- Altered shared edge directions and invalid shared-topology definitions.
- The frozen old invalid BRep definition, through its legacy path.

Unsafe clearance can be addressed only with an explicit smaller tolerance and successful subsequent validation. Near-parallel/overdetermined rejection is conservative; no general least-squares surface healing or arbitrary topology repair is claimed.

## Native topology, persistence and UI/MCP

- Face construction enumerates its edges and requires the same `TopoDS_Edge` identities supplied from the shared map. Result tests independently count two occurrences per unique native edge.
- Existing region adjacency and source boundary IDs form the shared representation. Outer/hole loop orientation and counts are checked; there is no new global CAD dependency graph.
- Preview displays applied/validated status, corrected vertex/edge counts, maximum input movement, tolerance use and reason. Refusals return their constraint/kernel reason and publish no object.
- The native browser imports the actual noisy Mesh through the file-loading Worker, previews and discards it, applies it, exercises one Undo/Redo, compares its unchanged source data and verifies matching MCP healing metrics.
- Actual browser reload rebuilds the healed BRep and retains the healing report. New data uses **v61**; a generated legacy **v60** reconstruction fixture remains readable and valid. False v60 labeling of shared-topology data is rejected by version gating. No destructive migration occurs.

## Remaining numerical limits and Phase 5C-2

The normal exception's 45° bound is a conservative safeguard. Other ambiguous region assignments can still be rejected by shared-plane constraints or native validation. Nearly parallel intersections below the rank threshold, incompatible multi-plane corners, insufficient precision, and narrow clearances remain explicit limits. Source intersection, junction and clearance budgets can reject complex inputs; exhausted validation is not success.

Large-Mesh performance, peak memory, long-duration stress, a multi-browser matrix, remote external MCP/LLM clients and certified surface-distance bounds were not measured. Existing geometry/Sculpt limits and the old product-browser backlog remain in force.

**Phase 5C-2:** scoped cylinder reconstruction work can proceed with these regressions retained. It still needs axis/radius fitting, residual criteria, trim topology and cylinder/plane junction validation. This plane/plane stabilization is not evidence that those curved-surface conditions are solved.

Architecture: `docs/architecture/HYBRID-GEOMETRY-PHASE-5C1.md`.
