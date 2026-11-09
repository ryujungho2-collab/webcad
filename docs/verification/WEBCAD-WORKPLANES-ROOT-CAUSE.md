# b5WorkPlanes Root Cause Isolation — 2026-10-29

## Outcome

Confirmed fixture/environment layout assumption. The runner omitted an explicit desktop window size for b5WorkPlanes. Its observed 306×300 canvas had the projected face center covered by the interactive Direct measurement panel. The native click reached that panel, not the CAD canvas. No Work Plane, Sketch, Selection, Hit Test or CommandBus implementation was replaced.

## First mismatch

`apps/web/tests/b5WorkPlanes.browser.tsx:23` projects world point [15,10,10] to screen (373,255.99997). The camera is orthographic, eye [15,9.99994387,61.1248608], with NDC approximately [0,0,−0.981785]. The canvas rect is x220,y106,width306,height300.

Both `document.elementFromPoint` and the captured native pointerdown identify `<p>A: 미지정</p>`, not the canvas. Raycaster setFromCamera/intersectObjects calls are zero. This precedes hit testing and React selection updates. Camera stability cannot make a click intercepted by another DOM element reach the viewport.

The subsequent wait at test line28 expects a button whose text is `Create plane from selected face`. That DOM node is absent, not hidden or disabled. `WorkPlanePanel.tsx:24,38` renders it only for one selected brep-face. The readiness predicate is correct; its preceding input assumption is false.

`SelectedDistance` is mounted in Direct mode by CadViewport. `hoverDistance.css` positions its interactive panel at right12px/bottom68px, width270px and z-index18. In the observed narrow canvas, it covers the center. The runner already specifies1440×1000 for many native workflows but omitted this B5 page. Compact-window overlay usability is a real observed limitation, separate from a CAD selection defect; this task does not redesign it.

## Failure state

- Document: test-document, revision5, session generation5, unchanged from before hit through timeout.
- User Datum: restored by Redo and resolved. No attached source yet, as expected.
- Selection: no selected face in UI; native viewport receives no pick. Private React SelectionState was not directly inspected.
- React panel: Work planes mounted; conditional attach button absent. No Face ID was produced by the blocked input.
- Render: completed viewport sync revision5, one scene mesh, remeshedCount0. Kernel status ready. Queue depth was not separately exposed/read.
- Errors: captured window error events0. Exhaustive console.error tracing and screenshots were not captured.

Exact event targets, camera, DOM rectangles, Work Plane objects and render receipts are preserved in `output/verification/webcad-feature-audit/workplanes-isolation-1.json` and its log.

## Comparison with b5FaceSketch

1. They do not exercise the same selection path. FaceSketch computes a kernel top-face key and dispatches attach-work-plane-face during setup, before rendering App. It bypasses the native surface click.
2. Both use object body and its top face, but the failed WorkPlanes run produces no selected Face ID. The successful resized run creates the native attachment and later asserts exact equality with the rebuilt top-face key on Rebind.
3. Work Plane UI is shared. FaceSketch consumes a saved plane; WorkPlanes must first produce App selection.subObjects through CadViewport pickBrepSubObject → App.selectSubObject.
4. Revision/session and restored Datum remain stable during the failed wait. No selected face existed before the blocked click, so document restoration invalidation is not the cause supported by this evidence.
5. The button predicate/text match current product behavior. After successful native selection, the button mounts enabled and the original attach assertions pass.
6. FaceSketch's previous5-check successful stabilization result was reused, not reported as a new execution.

## Minimal retained changes

- `apps/web/scripts/browserChecks.mjs:113`: add b5WorkPlanes to the existing1440×1000 native-browser group.
- `apps/web/tests/b5WorkPlanes.browser.tsx:23`: assert that the projected native hit target is the canvas before pressing. This strengthens the fixture and reports future occlusion at its actual origin.

All original eight assertions remain. No overlay was hidden, pointer event synthesized, click-through forced, or product source changed. Temporary diagnostic wrappers and runner metrics printing were removed.

## Validation

| Check | Result |
|---|---|
| Browser diagnostic run1, original sizing | Original timeout reproduced; overlay target and zero raycasts recorded |
| Browser run2, explicit1440×1000 + visibility assertion | All8 original checks passed |
| Successful canvas |852.09375×720; native pointer hits canvas; raycasts hit body triangles |
| Complete flow |User frame, save, Undo, native face Attach, transaction history, Undo/Redo face identity, source resize/missing status, exact native Rebind |
| Final state |Revision10/generation10; viewport sync10; kernel ready; button exists and enabled |
| Related b5WorkPlanes.test.ts |4 passed,0 failed/skipped |
| Runner node --check |Passed |

Exactly two browser executions were made. Run2 included read-only diagnostic wrappers; they were removed afterwards, retaining the tested window setting and visibility assertion. No third post-cleanup browser execution, full suite, full browser audit or large build was started.

Evidence under `output/verification/webcad-feature-audit/`: workplanes-isolation-1.log/.json, workplanes-isolation-2.log/.json, workplanes-isolation-unit.log and workplanes-root-cause.json. Original fixture and runner snapshots are retained as workplanes-isolation-original.txt and workplanes-isolation-runner-original.txt. Earlier audit/stabilization failures remain historical records rather than being overwritten as successes.

## Follow-up gate

The specific desktop b5WorkPlanes blocker is resolved. Work Plane follow-up can proceed within that verified scope. Compact-window overlay usability, every screen size and whole-product stability remain outside this conclusion.
