# Assembly B2 — Verification (2026-10-30)

## Delivered and tests

Read-only discrete BRep motion inspection, explicit exception policy, detached angle preview/highlighting and shared MCP read path implemented. No original project file was changed; no inspection command or Undo snapshot is created.

- Focused regression:51 tests passed,0 failed/skipped (assemblyMotion6 initial cases + Assembly A/B1 + BRep distance + Worker client + MCP server).
- Final Motion tests:8 passed,0 failed/skipped after adding rigid-input and incomplete-report budget cases. The six repeated cases are not counted as additional unique tests:53 distinct tested cases across these runs.
- Representative native browser:22 checks passed. Includes existing Phase A13 checks plus actual inspection, Common volume, document/history invariance, detached highlighted preview, UI/MCP classification parity, raw exceptions, real BRep Worker request cancellation and document-change invalidation.
- TypeScript noEmit and browser runner syntax checks passed.
- Full unit suite, whole browser audit, large build and architecture command were not run. Earlier architecture document-link errors remain separate debt.
- Mid-inspection cancel/deadline/stale/budget outcomes have deterministic engine tests; the native browser directly cancels a real BRep Worker request rather than claiming every UI timing race was tested.

## Native numerical examples

### Rotating arm fixture

A4×1×1mm arm revolves around Z; an independent1×1×1mm obstacle is placed in its90° footprint.

0°: AABB excluded;90°: exact positive Common1mm³;180°: AABB excluded. Three rows, two AABB rejections, one narrow candidate. Observed first cold Node inspection 2297.8ms including WASM startup.

### Original laptop, v62 assembled copy

Six original visible BRep parts at0/90/180:45 pair/sample rows; all visited. Raw counts:12 contact,30 no-penetration,3 penetration. Node warm observation 210.5ms;19 kernel calls (including preflight),24 AABB rejections,7 new narrow candidates,14 invariant reuses.

stand-support / stand-plate has Common≈964.6170736148mm³ at all three angles, volume tolerance≈6.21165708e-5mm³. This positive overlap is reported despite the Fixed connection. It is not automatically excused.

Only stand-base / stand-shaft was explicitly excepted in this test: each raw result remains contact, Common0. The raw support/plate penetration remains visible and active. This does not establish that a manufacturing joint is physically acceptable.

### Native UI obstacle fixture

A10×10×2mm box at[-115,-5,127] is explicitly created and grounded as test setup beside the original stand. Source state/history are captured AFTER setup.

0° and180°: stand-plate / motion-obstacle Common200.00000000000006mm³; volume tolerance2e-7mm³.90°: conservative AABB exclusion. A separate sphere case has intersecting AABBs but native BRep separation, proving AABB overlap is not treated as collision.

Final UI/MCP parity request:3 rows,1 AABB rejection,2 narrow candidates,6 kernel calls; observed engine time 188.4ms in an already-warm browser. Worker WASM capacity 100.0MiB, not live/peak allocation. Node Worker memory is unavailable/null. No larger-model throughput or peak-memory guarantee.

## Errors, missing scope and development findings

Invalid source feature parameters yield unknown even if OCCT can build a geometrically valid reversed box. Mesh and pose-dependent geometry are unsupported, never clear. Limits/sample count reject invalid requests. Timeout, cancellation, changed generation and result budget retain/discard data according to the documented policy.

A first browser fixture incorrectly assumed a smaller plate depth; the real240×200 plate also intersected the initial obstacle at90°. The engine correctly returned three penetrations. The obstacle was relocated using actual dimensions so the intended clear90° case is genuine; no kernel assertion was weakened. A negative-width test also showed the need to reject invalid CAD feature parameters before using a permissive native builder.

Open Shell is explicitly rejected by the existing strict closed-solid path. No new serialized open-Shell constructor/browser fixture was created to manufacture unsupported geometry. Time/cancel/stale engine tests use deterministic failure dependencies; real Native Common/contact/separation and real browser Worker cancellation are separately tested.

Native browser uses the actual CadViewport/AssemblyPanel fixture, not full-App navigation. It loads v62 through the actual loader during Phase A regression; a browser-process restart is not claimed. No live external model/remote stdio session was run; CadToolSession/planner/server regression and browser read parity are the stated MCP evidence.

## Artifacts

output/verification/assembly-b2:
- focused.log (51)
- motion-final.log (8)
- browser-final.log / browser-report.json (22)
- types.log
- obstacle.json / laptop.json (native numerical reports)
- assembly-motion-180.png (actual detached highlight, visually inspected)
- assembly-0.png / assembly-90.png / assembly-180.png (transform regression)

## B3 gate

B2 meets the bounded sampled rigid-BRep inspection goal. B3 is needed for continuous swept collision guarantees, mesh/open-surface support, scalable broad-phase indexing, richer progress/paging, large-model memory instrumentation or simultaneous multi-axis motion. Those are separate features, not consequences of these passing samples. No automatic interference repair or physics solver is claimed.
