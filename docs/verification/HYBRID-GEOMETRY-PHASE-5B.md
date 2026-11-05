# Phase 5B verification and reconstruction accuracy

Date: 2026-10-28.

## Completion assessment

The requested minimum exact-planar vertical slice is implemented: triangle Cube / rectangular prism → coplanar regions → real OpenCascade faces/closed shell/solid → measured Preview → native Apply → independent BRep → Undo/Redo → actual browser file reload. Source Mesh geometry is preserved.

This is a **bounded planar MVP**, not general reverse engineering. An approximate-planar tiny-face noise case recognizes the correct regions but is rejected by the final kernel solid check. Cylinder fitting is deferred; general NURBS reconstruction is outside scope. No claim is made that the whole CAD product is stabilized.

## Final checks

| Scope | Result | Evidence under `output/verification/hybrid-phase-5b/` |
| --- | --- | --- |
| Focused new analyzer/command + existing Hybrid regression | **29 passed**, 0 failed/skipped; includes 16 new Phase 5B tests | `focused.log` |
| Final full unit/integration suite, run once | **1,747 passed / 54 suites**, 0 failed/cancelled/skipped; 86.30 s | `all-tests.log` |
| Final native Edge reconstruction page | **18 checks passed** | `browser-planarReconstruction.log` |
| Final existing Phase 5A Hybrid Edge page | **19 checks passed** | `browser-hybridGeometry.log` |
| Workspace build, run once at final stage | **Passed**; Vite >500 kB chunk warning remains | `workspace-build.log` |
| Architecture boundaries/document references | **Passed: 876 modules** | `architecture.log` |
| Quality experiment | **4 successful fixtures, 1 kernel-rejected fixture**; script exits nonzero to preserve the rejection | `quality.json`, `quality.log` |

The final browser reruns include the native small-edge/self-interference validation. Earlier successful development runs are not added to the final check counts. `unit.log` is an earlier development snapshot, not the final total. No tests were deleted or skipped to obtain these results.

The prior Phase 5A 1,731-test record and browser results were inspected before development. The entire 172-page product-browser suite was **not** rerun. The existing 53 unresolved browser cases remain a separate backlog; their status is not changed by these two focused pages.

## Accuracy experiment

`apps/web/scripts/reconstructionQuality.ts` evaluates the actual analyzer, Kernel Worker-compatible shape service and quality pipeline. Units below: distance mm, area difference mm², volume difference mm³. Values are rounded here; the JSON retains full numbers and region/face correspondence.

| Fixture | BRep faces | Sampled max distance | Sampled RMS distance | Absolute area difference | Absolute volume difference | Outcome |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Triangle Cube, 10 mm | 6 | 1.88e-15 | 3.60e-16 | 0 | 4.55e-13 | Valid closed solid; volume ≈1000 |
| Rectangular prism, 4×6×5 mm | 6 | 6.28e-16 | 1.27e-16 | 0 | 2.84e-14 | Valid closed solid; volume ≈120 |
| Sheared planar polyhedron | 6 | 2.04e-15 | 4.81e-16 | 0 | 4.55e-13 | Valid closed solid; volume ≈1000 |
| Square tube, two planar faces with holes | 10 | 1.26e-15 | 2.88e-16 | 0 | 1.71e-13 | Valid closed solid; volume ≈420 |
| Tiny-face normal noise, height perturbation 1e-6 mm | No published solid | Not reported | Not reported | Not reported | Not reported | Region analysis recognizes 6 planes; final OpenCascade solid validity/outward-volume check rejects |

The first three successful fixtures used 128 total distance samples; the tube used 320. Sampling is bidirectional and includes vertices, triangle centroids and edge midpoints. Distances are to the planar BRep's triangulation. These values are **not certified Hausdorff bounds or physical precision guarantees**. They reflect numerical agreement on these exact fixtures.

Default tolerances: absolute 1e-5 mm, relative 1e-8 times model diagonal, angle 1°. Effective plane tolerance is their scale-aware maximum with a 1e-7 mm floor; sewing uses twice this value. Sampled acceptance is four times effective tolerance plus 1e-7 mm. The raw report includes requested/effective tolerances, forward/reverse max/RMS/sample counts, area and volume, closure/manifold/orientation, native validity/self-interference status and unique face mapping.

Observed Node timings: cold Cube 2558.88 ms including WASM startup; warm prism 47.65 ms, sheared polyhedron 43.96 ms, tube 82.80 ms. The noisy case was rejected in 12.09 ms. These are one small-fixture run, not a sustained benchmark, peak-memory measurement or UI responsiveness guarantee.

## What the tests establish

- A triangle Cube/prism becomes **six merged plane faces**, rather than twelve triangle faces disguised as a recovered model.
- Area-weighted normal handling accepts bounded tiny-face normal noise during analysis; stable face/vertex permutations produce the same recognized definition.
- Fixed-seed plane growing does not chain local tolerances across a curved strip. Region residuals remain bounded.
- Connected component count, boundary count, inward orientation, face planarity, adjacency and loop orientation are checked. Multiple closed components and open inputs remain analysis-only unsupported solid candidates.
- Planar ring regions extract one exterior plus a hole; the actual hollow solid preserves the 420 mm³ volume. Hole loops are not automatically filled.
- Degenerate, nonmanifold, intersecting and invalid-tolerance cases fail explicitly in the executed tests. Kernel face validity, shell closure, positive solid volume, face count and small-edge/self-interference checks are real operations.
- Preview is detached, Discard does not mutate the document, Apply preserves the original Mesh, and one Undo/Redo restores the independent BRep and receipt.
- A source or result placement change makes quality historical; source editing does not silently regenerate the snapshot.
- The known noisy-case kernel rejection is covered by an atomic rollback test. It does not produce a document object or a false successful report.
- World-coordinate transformations are reflected in the analysis and true dimensions; the transformed sheared fixture retains the expected analytic volume.
- v60 persistence preserves the definition and receipt, rejects mislabeled older versions and altered definition fingerprints, and detects nested reconstruction operands. Old Mesh-only fixtures retain their previous version.
- MCP plans compile to exactly the native command, read tools do not mutate, and the same shared command/evaluation path supplies quality results. The actual browser's MCP tool-session report agrees with the UI.
- Native browser input exercises Analyze, Preview, Cancel, Apply, BRep canvas selection, history and actual page/file reload. Reopened geometry is rebuilt into six OpenCascade faces and remeasured analytically.

## Failures, exclusions and limits

**Known geometric limitation:** independent projection of nearly coplanar regions does not yet guarantee mutually compatible face junctions. The noisy fixture fails the combined final OpenCascade solid-validity/outward-volume gate. The precise native subdiagnostic was not further isolated; no automatic tolerance relaxation or healing was attempted. Its region analysis success is not counted as reconstruction success.

**No unresolved test failures in the executed final test suites.** The quality experiment deliberately retains its one rejected case and nonzero exit code; this is not relabeled as successful geometry. The existing product-browser 53-case backlog was neither repaired nor reclassified here.

Not implemented or not measured:

- General approximate-planar junction repair, multi-shell/cavity construction, published open Shell objects, nested planar islands.
- Cylinder segmentation/fitting, recovered analytic curved surfaces, generic NURBS reconstruction, recovered feature/constraint history.
- Certified surface deviation, adaptive exact distance maximization, large-Mesh throughput, peak memory or long-duration stress tests.
- External remote MCP client / LLM-provider session and a multi-browser matrix. Tested MCP scope is the shared in-app tool session/compiler/command path.
- Full product browser audit. Existing Phase 5A BRep→Mesh support remains limited to its prior Box/Hybrid-prism subset.

Input budgets remain explicit: 1,000 vertices / 2,000 triangles, 128 regions, 4,096 boundary-loop edges. A 2-second / 2,000,000-pair source intersection budget may reject complex data; exceeding it is not a successful validation. Analysis is synchronous and bounded; kernel operations use the existing Worker. Existing Sculpt limits are unchanged.

## Phase 5C decision

Scoped Phase 5C work can begin on this exact-planar foundation. The first geometry gate should be shared edge/vertex consistency across fitted planes, with the noisy rejection fixture retained as a regression. Cylinder fitting should follow explicit residual/trim/junction criteria and closure validation. Larger budgets and stronger accuracy claims require additional measurements. Product-wide stabilization remains separate from this MVP's completion.

Architecture and support policy: `docs/architecture/HYBRID-GEOMETRY-PHASE-5B.md`.
