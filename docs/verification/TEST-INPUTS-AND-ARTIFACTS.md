# Test inputs and optional local artifacts

Date: 2026-11-07. This is a packaging/CI repair, not a new CAD capability.

## Required inputs

Files statically imported by tests are required in a clean checkout. This includes
historical fixtures under `output/`: location alone does not make them disposable.
The [input inventory](TEST-INPUT-INVENTORY-2026-11-07.json) records the retained
static output imports, their consumers, sizes and hashes. Dynamic `readFile`
fixtures are outside that inventory's stated scope and have not been removed.

The candidate-review browser's synthetic source is now
`apps/web/tests/fixtures/assembly/candidate-synthetic.webcad.json` (9,093 bytes).
It is a byte-for-byte copy of the former local `B-input.webcad.json`, not a smaller
replacement model. Its hash and required part IDs are tested. The 144,197-byte synthetic oracle used by the ranking tests is also retained under `tests/fixtures/assembly/`, separate from generated reports. The original local
file remains untouched. Saved model results are replay evidence, not new LLM runs.

## Optional project-delivery inputs

These large, generated inputs remain local and are **required when their specific
project browser check is selected**. They are not required by unit/architecture/
product-build CI. Selecting a check without its input fails setup; it is never
silently skipped, passed, or run using substitute geometry.

| Browser page | Local input | How the existing pipeline produces it |
|---|---|---|
| courtyardPresentation | `output/projects/courtyard-pavilion/mesh-scene.json`, `pavilion.webcad.json` | Run `courtyardPavilion` with `--artifacts` before presentation |
| houseFacade | `output/projects/lightwell-house/base-house.webcad.json` | Existing `gardenHouse` browser authoring task |
| houseLayout | `output/projects/lightwell-house/review-house.webcad.json` | Existing `houseFacade` authoring task |
| externalCivil / externalCivilSpeed / externalCivilStyle | `output/external/civil-projects/converted.dxf` | Local external-drawing import preparation; excluded from publication |
| residentialRestoration | `output/external/civil-projects/restoration-01/baseline.webcad.json` | Local restoration preparation; original user source is not uploaded |
| largeCafe3d | `output/projects/large-cafe/3d/viewer.html` | Existing cafe 3D export, then `pnpm exec tsx scripts/buildCafeViewer.ts` in `apps/web` |

The original 50,406,730-byte courtyard tessellation is deliberately not uploaded.
The [explicit manifest](../../apps/web/scripts/localTestArtifacts.json) is the
allowlist for a loopback browser-runner-only endpoint. It streams exact local
bytes, has no write endpoint, accepts no arbitrary path and disables caching.
The product Vite configuration/runtime does not register this endpoint.
The full browser runner also fails preflight if one of these inputs is missing.
The existing assertions and page registrations remain intact.

## Optional historical evidence

252 links in 69 documents referred to 230 excluded local outputs. They are now
plain labeled local paths rather than broken repository download links. The
[reference inventory](LOCAL-ARTIFACT-REFERENCES-2026-11-07.json) preserves the old
link, document and target. Historical test verdicts are preserved; a reference
does not imply the artifact ships in Git or that a test ran again today.
There is no general exception for broken `output/` links in the architecture
checker. Repository links and static imports must still exist.

## CI repair and validation

Initial PR run `42361438105`: 235 tests passed, then architecture failed with
6 missing imports and 252 missing documentation references. Build was not reached.
The six audit findings were addressed by patching Vite 7.3.6 → 7.3.7 and
source-map-js 1.2.1 → 1.2.2; no audit suppression or policy change was added.

`test:fixtures` explicitly selects the input, ranking and architecture tests in CI
independently of platform shell glob behavior. In a snapshot containing only
staged/tracked files (installed dependencies reused), all 12 passed with zero
skips; the product TypeScript/Vite 7.3.7 build passed. An HTTP/Vite smoke check
transformed all five affected browser modules and streamed the five local inputs
with byte hashes matching their originals (10 checks). This was not a rendered
browser workflow. `pnpm audit` reported zero known vulnerabilities.

Remote CI results for this repair are recorded in the PR and final chat report.
Unit/architecture/build CI is not a full product-browser audit or a live AI run.
The existing shell-expanded test glob is also not evidence that every root-level
unit test ran on Linux; only the actual CI test count should be reported.
