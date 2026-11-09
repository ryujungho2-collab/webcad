# Assembly B1 — Joint Lifecycle & Inspector (2026-10-30)

## Delivered scope

Extended Phase A rather than replacing it. Existing Joint records/validation, grounded roots, fixed/revolute kinematics, world Transform renderer, command executor, Preview plans, native Apply, history, persistence and MCP session/planner remain authoritative. No second Scene Graph, Part Registry, solver, manipulator or geometry kernel.

New commands:
- assembly-joint-delete (Joint ID)
- assembly-joint-reparent (Joint ID, parentId, explicit preserveWorld boolean)
- assembly-joint-edit (Joint ID, origin/axis/min/max patch, explicit preserveWorld boolean)

Existing create and absolute angle-update commands are unchanged. Joint type conversion, child-ID replacement and type/angle changes through edit are intentionally unsupported, avoiding overlapping APIs.

## Lifecycle policy

Delete removes only the named edge. Child becomes an ungrounded independent Root at the current world transform. Descendant Joints and their Rest frames remain. Original object/geometry IDs, geometry features and all current world poses are retained. The detached root can subsequently use existing Move/Rotate. Ground status is never added implicitly.

For reparent/edit, write P = parent world frame, A = T(origin) R(axis,angle) T(-origin), B = stored Rest. The existing evaluator computes C = P A B.

- preserveWorld=true: at current angle, recapture Bnew = inverse(Anew) inverse(Pnew) Ccurrent. Child and its complete downstream subtree stay at current world poses.
- preserveWorld=false: keep existing numeric Rest B. Evaluate Cnew = Pnew Anew B, deliberately moving the subtree. UI explicitly warns of movement.
- Reparent keeps origin/axis numbers in the NEW parent's local frame; preserving part World Pose does not promise to preserve the Joint anchor's world coordinates.
- Edit changes only origin/axis/limits. origin is parent-local mm, axis must be unit length. null min/max clears a limit. The current angle must fit new limits; no automatic clamping or angle reset.
- Cycle, self-parent, duplicate child ownership, grounded child, invalid axis/limits, missing refs and locked involved parts are rejected through existing transaction rollback. Reparent cannot change child ID.
- Files remain version62 / assembly version1 with unchanged data fields. Existing v62 Phase A readers can evaluate resulting saved state; no destructive migration.

## Inspector and hierarchy

AssemblyPanel now shows grounded roots, derived independent roots, Parent → [Joint/type] → Child relations, axes/angles, selectable Joint IDs and validity. Lifecycle controls share the existing Review/Apply/Cancel implementation. Before/after Joint metadata and detached proposed geometry poses are shown; the live document is unchanged until Apply.

The existing Explorer remains the source object/presentation tree. Mechanical relations are derived for Assembly Inspector from the existing Joint records, not copied into another registry or implicit object-parent transform hierarchy.

## Selected-only viewport Gizmo

Only selected Joint draws:
- World origin marker;
- axis arrow;
- positive right-hand revolution arc/direction for Revolute;
- parent-origin-to-Joint and Joint-to-child-origin lines.

Parent world Transform and proposed Preview transforms are reused to place it. During delete Preview the selected edge's Gizmo disappears; Cancel restores it. Joint selection is cleared when the Joint is deleted. The Gizmo is not registered as a CAD pick root and cannot manipulate parts or write document state. Geometry/materials are disposed on changes/unmount; ArrowHelper shared geometry is cloned before owned disposal.

## MCP

assembly.joint.delete / assembly.joint.reparent / assembly.joint.edit extend existing shared tool contract and CadToolSession planner. Select child for delete/edit, child plus new parent for reparent. Tools only prepare native Review; no remote direct Apply. Edit uses editJson for the same strict patch. Existing create/update APIs are reused.

## Focused validation

Final focused run:34 passed,0 failed/cancelled/skipped:
- assemblyLifecycle.test.ts (6 cases)
- assembly.test.ts (6 existing Phase A cases)
- postAuditContracts.test.ts
- cadMcpServer.test.ts
- featureRegeneration.test.ts

Lifecycle cases cover full world matrices at nonzero angle, delete and downstream free-root motion, reparent/frame-edit with both pose policies, clearing limits, cycle/grounded/duplicate-parent/reference/axis/limit/locked rejection, atomic public transaction rollback, Preview/Cancel, Apply, Undo/Redo, reload, and identical UI/MCP command plus detached proposal results. Gizmo geometry is checked independently and does not mutate document state.

An initial new history assertion incorrectly expected revision to rewind. Existing history deliberately advances revision to invalidate stale proposals. The corrected test compares every non-revision document field AND asserts monotonically advancing revisions; existing history behavior/assertions were not weakened.

Final browser:26 checks passed. The assemblyLifecycle page reuses the complete Phase A laptop browser scenario: native Ground/create Fixed/create Revolute,0/90/180 full pose matrices, Preview cancellation, Undo/Redo and file load. It additionally selects/edits/reparents/deletes via native Inspector controls, checks an actual cycle error before continuing, and verifies detached-root reload and cleared selection. Plate/lip/shaft initial Fixed edges remain canonical fixture setup as documented in Phase A.

The browser verifies preserveWorld=true lifecycle paths; preserveWorld=false is covered by unit tests rather than a native click run. Gizmo screenshot is actual CadViewport output and was visually inspected. No full-App Explorer navigation test or live external MCP client edit run is claimed. UI/MCP parity is checked via shared planner and proposed documents; MCP server regression is included.

TypeScript noEmit check and browser runner syntax check passed. No whole-unit suite, full browser audit, large build or physics validation executed. Combined architecture check was not rerun; prior Phase A document-link failures remain unresolved, not reclassified as success.

## Evidence and assets

Under output/verification/assembly-b1:
- focused.log — final34 tests
- unit.log — initial focused12 after correcting history expectation
- browser-final.log / browser-report.json — final26 checks
- types.log — noEmit success
- assembly-joint-gizmo.png — selected edited-axis Gizmo
- assembly-0.png / assembly-90.png / assembly-180.png — existing stand motion regression

The raw original laptop file was not modified. Browser reload uses an in-memory native File through the actual product loader; a browser-process restart is not claimed. No new save format or geometry was introduced.

## Reused vs added files

All edited/new implementation files for this step:
- packages/cad-document/src/Assembly.ts
- packages/cad-document/src/index.ts
- packages/cad-commands/src/commands.ts
- packages/cad-commands/src/validator.ts
- apps/web/src/state/assemblyCommands.ts
- apps/web/src/state/assemblyPreview.ts
- apps/web/src/copilot/assemblyTools.ts
- apps/web/src/copilot/cadToolContract.ts
- apps/web/src/properties/AssemblyPanel.tsx
- apps/web/src/viewport/CadViewport.tsx
- apps/web/src/viewport/assemblyJointGizmo.ts
- apps/web/tests/assemblyLifecycle.test.ts
- apps/web/tests/assembly.browser.tsx
- apps/web/tests/assemblyLifecycle.browser.html
- apps/web/scripts/browserChecks.mjs

## Remaining limits / B2 gate

Still bounded rigid, unit-scale tree joints. No multi-parent or closed-loop solver, physics/collision, gear/slider/ball, direct Gizmo dragging, child replacement or Joint type conversion. No large-assembly responsiveness or memory guarantee. Root/hierarchy presentation is in Assembly Inspector; Explorer's document hierarchy was not replaced.

B2 can proceed within the tested lifecycle scope. Before widening scope, decide B2's explicit interaction/solver requirements and test selected-only overlay across full-App navigation and larger models. General Assembly Solver completion is not claimed.
