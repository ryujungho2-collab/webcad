# Assembly B2 — Discrete Motion & Interference (2026-10-30)

## Scope and reuse

Read-only inspection of one Revolute driver, unit-scale rigid Assembly trees and independent valid closed BRep bodies. Other Joints retain current angles. Existing Phase A/B1 assemblyMatrix/evaluateAssembly/assertAssemblyPose, liveFeatureInputs, getObjectTransform and feature/reference validation are reused. No new Joint solver, physics engine, shape kernel, CommandBus or persistence format.

Existing kernelGeometryService.inspectSolid supplies analytic local bounds/validity/volume. Existing measureSolidDistance already validates closed solid topology, computes boundary witnesses, OpenCascade Boolean Common and common volume. Its existing Worker RPC, retained source cache, cancellation and error paths are reused without changing cad-kernel or kernel worker implementation.

## Evaluation and broad phase

Validate the request and every sample against driver limits before kernel work. Snapshot the document and use absolute Joint angles on detached copies. The original geometry, transforms, driver angle, document revision and history remain unchanged.

Each listed part must be a supported BRep feature with valid parameters, unit scale and resolved refs. Existing live geometry dependencies on driven parts are rejected as unsupported: B2 is rigid inspection, not geometry regeneration through a sweep.

Preflight measures a local BRep AABB and validates the same body against itself through the strict existing closed-solid distance/Common path. A self-check must yield positive-volume coincidence. This prevents AABB pruning from declaring malformed/open input clear.

Per angle, transform local analytic bounds to conservative world AABBs and expand by requested linear tolerance. Disjoint boxes yield no-penetration at that sample; overlapping boxes are only candidates. No triangle rendering mesh is treated as exact geometry.

Deleting the driver edge divides the tree into a moving subtree and stationary parts. With other Joint angles fixed, pairs within either group retain their relative rigid placement. Their initial result can be reused, including unknown or unsupported results. Cross-group pairs are recomputed per sample. Connected Joint pairs are NOT automatically excluded.

## Narrow phase and tolerance

Reuse measureSolidDistance:
- commonVolume > volumeTolerance → penetration, including containment/coincidence;
- commonVolume=0 with boundary distance ≤ tolerance → contact within tolerance;
- no Common and positive distance beyond tolerance → no-penetration;
- nonzero volume beneath numerical classification threshold, indeterminate Common, failed validity/distance or kernel errors → unknown.

Existing volumeTolerance = max(1e-12 mm³, min(sourceVolume,targetVolume) ×1e-9). Linear tolerance is explicit, default1e-6mm, allowed1e-7..0.01mm. It is not a universal error certificate or certified Hausdorff value.

Every row retains baseStatus, method, common volume/gap when measured, volume tolerance and failure reason. AABB-filtered rows do not invent an intersection volume.

## Intentional exceptions

Exceptions are explicit unordered object-ID pairs inside the selected scope. They do not skip inspection. status becomes intentional-exception but baseStatus and measured values remain intact. Raw and post-policy penetration counts are shown separately. An exception never converts unknown into verified clearance.

## Bounds and cancellation

Limits:8 parts,13 samples,128 rows,160 kernel calls,30s overall,5s per task,8MiB estimated serialized input and48,000 bytes of estimated UTF-16 JSON report budget. Start=end inspects one pose; descending ranges work with positive step; the end angle is included even if not an exact step multiple.

Existing browser Worker cancellation terminates an active request; queued/late results cannot publish into the document. Engine checks time/current-generation after awaits. A document change aborts and discards stale rows; the UI immediately clears previous results and preview. Cancel/deadline/result-budget stop retains available partial rows and cannot mark the unvisited sample range complete.

WASM capacity ceiling256MiB is checked after tasks using existing worker metrics. It is not a hard instantaneous native heap limit. Node fallback cannot preempt synchronous native WASM and reports unavailable Worker memory as null; late tasks are rejected by post-checks. JSON estimates are not process RSS/peak/GPU memory measurements.

samplingFinished means all requested pair/sample slots were visited, not that collision-free motion was certified. finished can contain confirmed penetration/contact. Unknown/unsupported rows yield partial verification even when traversal finished.

## UI and preview

Existing AssemblyPanel contains a small Motion Inspection disclosure with driver, range, step, explicit part IDs, exception JSON and tolerance. Results list raw/policy status and budgets. Preview sample calls the same detached evaluator and existing Assembly preview renderer. Pair ghosts are highlighted red; actual Joint angle and document stay unchanged. The UI labels preview versus authoring angle. Clear preview removes it. No automatic Apply, animation timeline or correction.

## MCP

One new read-only tool: assembly.motion.inspect(optionsJson). Start=end also performs current/single-pose interference inspection, so no duplicate assembly.interference.inspect API was added. Existing CadToolSession captures immutable context, invokes the same engine and rejects stale/oversized responses. No command generation or auto-Apply is available through this tool.

## Files

- apps/web/src/state/assemblyMotion.ts
- apps/web/src/properties/AssemblyMotionPanel.tsx
- apps/web/src/properties/AssemblyPanel.tsx
- apps/web/src/state/assemblyPreview.ts
- apps/web/src/viewport/CadViewport.tsx
- apps/web/src/copilot/cadToolSession.ts
- apps/web/src/copilot/cadToolContract.ts
- apps/web/tests/assemblyMotion.test.ts
- apps/web/tests/assemblyMotion.browser.html
- apps/web/tests/assembly.browser.tsx
- apps/web/scripts/browserChecks.mjs

## Remaining scope

Mesh, free faces/open Shell, non-unit scale/shear, live deforming geometry, multiple simultaneous driver axes, continuous collision detection, collision response and contact/friction/load analysis are unsupported. Existing bounded rigid-tree limitations remain. Compact-screen UI issues and prior architecture document-link debt are not addressed here.
