# Human, Copilot and MCP handoff

The task is an 80 × 60 × 120 mm sensor wall bracket, with a 6 mm upright/foot, two Ø6.5 upright holes, two Ø8.5 foot holes, and a 20 × 12 mm top cable notch. This is a Boolean solid exercise; it does not claim sheet-metal bend development, manufacturing tolerances or structural verification.

## Shared execution

`SharedCadToolForm` offers human forms for four existing canonical tools: `solid.primitive`, `solid.parameter`, `solid.extrude`, `solid.boolean`. Forms validate calls with `validateCadToolCalls`, then pass them to the existing `handleCopilotSubmit` tool-call path. They do not create a second geometry executor or invoke an optional model. The selected gateway setting remains intact.

Natural-language shortcuts and MCP proposals reach the same captured `createCadToolSession`, native detached evaluation, ghost preview, UI Apply and atomic Undo. Existing edit inputs must remain selected. MCP reads do not grant edit selection; remote clients cannot Apply. The catalog remains 39 canonical tools plus the three MCP bridge tools. The rest of the manual CAD application is not automatically exposed as MCP tools, and these four forms do not cover the whole catalog.

The common Review is kept open and brought into view when a proposal is ready. A changed form input clears an uncommitted review. Boolean target/tool order is visible before review. Units and world placement are explicit.

## Face-selection gap found by the task

A union can retain multiple coplanar faces with the same normal. A normal and plane location alone do not identify the intended face for a hole. `cad.faces` now includes each face's transformed world `meshBounds` and an explicit tessellation basis. Clients can narrow candidate faces before requesting a native hole. These sampled bounds are neither exact BRep bounds nor proof that a circle lies inside a face; the native hole operation still validates containment, including holes and irregular boundaries.

## Reproducible exercise

Run `node scripts/browserChecks.mjs --page=sharedToolHandoff --artifacts` from `apps/web`. The isolated browser uses physical input and the real official MCP SDK stdio fixture, not a mocked model or direct document authoring.

1. Human form creates the upright and edits its height.
2. Internal natural language changes the same upright to 120 mm.
3. MCP reads that exact selection, adds/unites the foot and cuts four face-local holes.
4. MCP prepares a cutter; the human form cuts the cable notch with explicit ordered selection.
5. Native Undo/Redo crosses the human/MCP handoff.
6. MCP organizes the final part and derives actual linked front/foot BRep sections.
7. Native cache reload and STEP export verify persistence and kernel geometry.

Independent expected volume is `82080 − 343.5π mm³`. Outputs live in `output/projects/sensor-bracket`; `handoff.json` records proposal receipts and actual object IDs, without bridge credentials. The agent authored the task dimensions and tool sequence. This is evidence for handoff behavior, not autonomous design or unrestricted language understanding.

## Validation

38 cross-channel browser/Worker checks passed. Existing real MCP (24), common CAD tool (19) and constrained solid (18) browser checks also passed after the shared form and draft-preservation changes. Targeted tool/session/solid/context/MCP unit checks: 42 passed. Production build passed with the existing large-chunk warning; architecture check passed for 791 modules. [Artifact checksums and limits](../verification/SHARED-TOOL-HANDOFF-2026-10-24.json).
