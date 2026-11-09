# Assembly Phase A — Verification (2026-10-30)

## Result

Implemented bounded Fixed/Revolute vertical integration. The supplied v60 laptop-stand.webcad.json is compatible and remains unchanged; byte preservation is asserted by the laptop test and a SHA-256 receipt is under output/verification/assembly-phase-a/source-receipt.json. Independent v62 assembled copy: output/verification/assembly-phase-a/laptop-stand-assembly.webcad.json.

Ground stand-base. Revolute bearing connects base→turntable with parent-local origin[0,0,20], axis[0,0,1]. Fixed edges: base→shaft, turntable→support, support→plate, plate→lip. Changing bearing.angle moves every upper member, including full orientation, without changing feature geometry or object/geometry IDs.

## Actual observations

| Angle | Maximum upper-part position error(mm) vs independent rotation oracle | Native Review→Apply elapsed |
|---|---|---|
| 90° | 3.4809e-14 | 299.8 ms |
| 180° | 2.4614e-14 | 295.1 ms |
| 0° | 2.4614e-14 | 308.3 ms |

Both unit and final browser check the full world orientation matrices as well as positions at0/90/180; Fixed rest transforms and circular base-axis alignment are retained within numerical tolerance. These small-model values are floating-point observations, not physical/manufacturing accuracy. UI elapsed includes browser input/helper waits and existing shape validation, not raw solver time or throughput. No large-model memory benchmark.

## Final tests

- Focused unit/integration:32 passed,0 failed/skipped. assembly.test + postAuditContracts + b5WorkPlanes + featureRegeneration + cadMcpServer. Evidence focused.log.
- Following final math/test checks: assembly.test6 passed,0 failed/skipped. Evidence assembly-final.log. Do not add these six rerun results to32 as unique tests.
- Native isolated browser:13 checks passed, including native Ground, Revolute create, Fixed create, Review/Cancel,0/90/180, Undo/Redo, file load and geometry preservation. Final browser also checks full orientation matrices. Evidence browser-final.log and browser-report.json.
- Actual browser file load preserves5 Joints and v62 document. It exercises file loading in the product harness; a complete browser-process restart is not claimed.
- UI creates the bearing/support Joints; plate/lip/shaft Fixed connections are canonical command fixture setup, using the same engine. No claim that all five were individually authored by native clicks.
- TypeScript noEmit check passed; runner syntax check passed.
- Architecture command FAILED:1070 missing-doc-link reports, all from the pre-existing WEBCAD-FEATURE-AUDIT.md absolute-link syntax. No code-graph violation was reported, but the combined command is not marked passed. Existing audit document was not rewritten to force success.
- No full unit/integration suite, whole browser audit or large build.

Development failures: generated browser source initially had a string-escape syntax error; corrected. Initial equality assertions exposed signed-zero JSON differences; engine values were canonicalized. Final results above are successful runs, not ignored failures.

## Screenshots and artifact locations

All under output/verification/assembly-phase-a:
- assembly-0.png
- assembly-90.png
- assembly-180.png
- laptop-stand-assembly.webcad.json
- browser-report.json / browser-final.log
- focused.log / assembly-final.log / types.log / architecture.log
- source-receipt.json

Screenshots are actual native browser captures of the original fixture geometry in the product CadViewport+AssemblyPanel harness, not rendered mockups. The90-degree image was visually inspected. The full App Property Inspector also mounts AssemblyPanel; a separate full-App navigation run was not performed.

## Supported / unsupported and gate

Fixed and Revolute, grounded roots, free-root propagation, offsets/arbitrary unit axes, limit rejection, cycle/missing-ref rejection, unit-scale Mesh placement, Preview cancellation, atomic invalid-command rollback, stale Apply, Undo/Redo, JSON version migration guards, stored-pose rejection and shared MCP planner/read path are covered by focused tests.

No bearing contact/friction/load verification. No collision, closed-loop assembly, scale/shear, physics or new CAD geometry. Generic Joint delete/reparent UI and larger-assembly performance remain unimplemented.

Phase A is usable within the documented desktop rigid-tree MVP. Follow-up can extend usability/tests within that scope; do not call it a general-purpose Assembly Solver or certify all CAD representations. Existing architecture document-link failures remain a separate verification limitation.
