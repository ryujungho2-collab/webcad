# Assembly Phase A — Fixed / Revolute (2026-10-30)

## Reuse and ownership

CadObject.id remains the canonical physical part identity. Existing modelPresentation.parts maps presentation part IDs to those same object IDs; no second part registry was created. Existing presentation explosions, canvases/groups and library instances do not define mechanical parent transforms. Existing object world Transform, getObjectTransform, Three.js Matrix4/Quaternion/Euler, CadViewport roots, transaction-owned document executor, documentPlans, history and MCP shared planner are reused. No kernel, Transform engine, Scene Graph or CommandBus replacement.

CadDocument.assembly stores version1 grounded object IDs and Joint edges. A Joint contains id/type/parentId/childId, origin/axis, absolute angle, optional min/max and a captured rigid rest transform. Geometry/feature params and geometryId are untouched. One incoming Joint per child, no grounded child and no cycles; no multi-mate or closed-loop solver. Model-wide constraints use the existing publication/rollback boundary.

## Mathematics and units

Existing object Transform is world placement: translation mm, XYZ Euler degrees, unit scale. Joint origin o and unit axis a are in the parent's local frame. On creation, capture B = inverse(W_parent_bind) × W_child_bind. At zero Joint angle, B preserves current relative pose. Fixed uses angle0 only.

Revolute: W_child = W_parent × T(o) × R(a, angle) × T(-o) × B.
Fixed: W_child = W_parent × B.

A memoized recursive traversal evaluates absolute Joint states from free/grounded root world placements each time. Descendants are not incrementally rotated from the previous angle, reducing drift. Stored object poses are decomposition results compatible with the existing renderer/export APIs. Signed zero is canonicalized for stable JSON. Parent-local axis rotates into world space with its parent. Pose comparison guard is1e-7 per matrix element, not manufacturing accuracy certification.

Root transforms may be changed through existing Move/Rotate when not grounded. Grounded roots and dependent child transforms reject manual edits. Use Joint angles or unground the root. Source edits/deletes, conflicting topology, locked moving descendants and invalid refs reject the proposal; the live document stays unchanged.

## Preview and execution

UI Assembly joints section supplies parent/child IDs, Fixed/Revolute, origin/axis, optional limits, selected Joint metadata and0/90/180 controls. All edits first call previewCadCommand, then applyCadPlan. Cancel disposes the stored plan and preview. The preview publishes only detached poses to the existing viewport; clones share geometry and clone/dispose temporary materials. No live document mutation for preview. Document generation changes clear ghosts and stale Apply is rejected by existing plan receipts.

Joint commands: assembly-ground / assembly-joint-create / assembly-joint-update. Assembly evaluation occurs in the existing command executor before feature regeneration, so existing downstream CAD dependencies observe final part transforms. Existing regeneration and kernel validation remain active. Compound geometry inputs cannot be other Joint members: rejecting this mixed dependency avoids moving geometry twice.

## Persistence

Assembly-bearing documents use minimum file version62; no-assembly documents retain their previous version selection. v60 original laptop and existing v55/v56/v61 documents retain legacy handling. Old readers reject62 rather than lose constraints. History/load/publication paths copy or remove assembly alongside other optional document state. Data validation checks references, rigid bind frames, duplicate children, limits and cycles. The web file loader additionally rejects inconsistent persisted world poses instead of silently repairing constraints.

## MCP

assembly.inspect / assembly.joint.validate are read-only. assembly.joint.create takes jointJson; assembly.joint.update takes jointId/angle; assembly.ground takes objectId/grounded. Select both parent and child for create, child for update, root for grounding. Shared CadToolSession and tool planner generate canonical commands. Existing native Review/Apply remains mandatory: no remote direct publication. Structured tools/read/planner and server registration regression were tested; a live external AI/stdio Joint editing session was not run.

## Explicit limits

Unit-scale rigid independent BRep and editable Mesh only. Bake Nodes/datum-owned procedural output before assembly. No scale/shear, active exploded presentation, ambiguous/missing refs, duplicate parents, closed loops, assembly suppression, Joint deletion/reparent UI, gear/slider/ball, collision/contact, bearing friction, load or FEA. A Joint can be undone; explicit graph removal UI is outside Phase A. Max256 Joints; current implementation reevaluates the whole tree and uses existing whole-document snapshot history. No large-assembly performance/memory guarantee.

## Files

- packages/cad-document/src/Assembly.ts
- packages/cad-document/src/CadDocument.ts
- packages/cad-document/src/index.ts
- packages/cad-document/src/serialization.ts
- packages/cad-commands/src/commands.ts
- packages/cad-commands/src/validator.ts
- apps/web/src/state/assemblyCommands.ts
- apps/web/src/state/assemblyPreview.ts
- apps/web/src/state/commandBus.ts
- apps/web/src/state/history.ts
- apps/web/src/state/dispatchCadCommand.ts
- apps/web/src/state/documentPlans.ts
- apps/web/src/state/documentFile.ts
- apps/web/src/properties/AssemblyPanel.tsx
- apps/web/src/properties/PropertiesPanel.tsx
- apps/web/src/viewport/CadViewport.tsx
- apps/web/src/copilot/assemblyTools.ts
- apps/web/src/copilot/cadModelingTools.ts
- apps/web/src/copilot/cadToolSession.ts
- apps/web/src/copilot/cadToolContract.ts
- apps/web/tests/assembly.test.ts
- apps/web/tests/assembly.browser.tsx
- apps/web/tests/assembly.browser.html
- apps/web/tests/helpers/documentHarness.ts
- apps/web/scripts/browserChecks.mjs
