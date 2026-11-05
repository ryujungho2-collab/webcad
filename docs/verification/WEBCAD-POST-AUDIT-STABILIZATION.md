# WebCAD Post-Audit Stabilization — 2026-10-29

## Outcome

Partial completion: legacy Cut, public IO contracts and browser scheduling corrected. b5WorkPlanes remains unresolved. No new modeling capability, kernel/CommandBus rewrite, skipped test, full browser audit or full unit suite. Existing dirty working tree was preserved.

## Retained changes

- apps/web/src/state/commandBus.ts: boolean-cut delegates to the registered boolean-operation(cut), keeping its kernel/validation path and outer transaction.
- packages/cad-commands/src/validator.ts: legacy Cut rejects identical target/tool, matching the normal operation.
- packages/cad-kernel/src/io/{step,stl,iges}.ts: all six legacy import/export entry points throw explicit unsupported errors; no false true/null success. Real application STEP/STL export paths remain separate.
- apps/web/scripts/browserChecks.mjs: default schedule deduplicates page names; selected page and benchmark cases unchanged.
- apps/web/tests/postAuditContracts.test.ts: facade rejection, actual 500 mm³ Cut equivalence, single Undo entry and Undo/Redo state restoration.

## Roots and before/after evidence

| Issue | Before | Retained correction / after |
|---|---|---|
| Work Plane | Isolated original reproduces native UI readiness timeout after user plane create/save/Undo | Unresolved. Camera capture and settling experiments did not isolate a root cause; all experimental fixture changes reverted. Do not label product selection/camera/selector as proven cause. |
| Legacy Cut | Validator accepts payload; executor has no handler (audit isolated diagnosis) | Alias delegates to normal Boolean handler; native-kernel volume and transaction history test passes. |
| IO facade | Exports return true without output; imports return null | All six public legacy APIs explicitly reject; facade tests pass. |
| Browser runner | 192 registrations, 174 unique names; cases directly mapped duplicates. Repeated group has no distinct parameters or labels; benchmark repetition is separately explicit. | Default schedule174/174 unique; selected1; benchmark6 retained. Actual scheduling expression evaluated without full browser execution. |

## Tests this sprint

- Final focused command: pnpm exec tsx --test tests/postAuditContracts.test.ts tests/b5WorkPlanes.test.ts tests/featureRegeneration.test.ts — 21 passed, 0 failed/skipped.
- b5FaceSketch browser — 5 checks passed.
- mcpBridge browser — 24 checks passed.
- b5WorkPlanes original browser — failed after3 passing checks. Diagnostic variants also failed; they are not final fixes or successful validation. Further debugging stopped.
- New contract test development initially failed because the test supplied STL triangles to a MeshData oracle, then compared document objects by reference. Corrected to native Boolean MeshData volume and deep state equality; assertions were not removed or weakened. Final focused run is clean.
- node --check scripts/browserChecks.mjs passed; actual schedule-expression checks passed.
- No workspace build/full suite/full174-page audit executed.

Evidence: output/verification/webcad-feature-audit/stabilization-workplanes-before.log; stabilization-workplanes-after.log; stabilization-workplanes-settled.log; stabilization-workplanes-final.log (diagnostic run, not successful); stabilization-unit.log (development failure); stabilization-unit-final.log (final21 passed); stabilization-contracts-final.log; stabilization-b5FaceSketch.log; stabilization-mcpBridge.log; stabilization-runner.json.

## Next gate

Existing supported modeling can continue under its known constraints. Full stabilization and work-plane-dependent new development are not approved as verified: one independent native face-selection/plane workflow remains unresolved. Next effort should isolate the precise failing input/viewport/selection state in b5WorkPlanes, without changing the existing assertions or implementing a new selection system.
