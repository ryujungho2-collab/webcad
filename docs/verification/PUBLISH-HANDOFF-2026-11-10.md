# Handoff publication — 2026-11-10

Preparation began on 2026-11-09; publication was finalized on 2026-11-10
(Asia/Seoul).

This publication preserves the [Claude handoff](../../CLAUDE.md), small native CAD
study proposals and selected screenshots, and experimental authoring scripts.
It adds no new CAD engine, agent framework or claim of autonomous design success.

## Selected material

- `CLAUDE.md`: product direction, code map, known validation limits, ontology and
  specialist-agent contracts, workflow priorities, and a first-task prompt.
- `apps/web/scripts/spiderMan/`: synthetic authoring source and probes, explicitly
  marked experimental. They were not executed during publication.
- [Native CAD study](../../output/projects/spider-native-cad/README.md): existing
  proposals, generator scripts, design notes, transform records and actual CAD
  screens. Its historical statements are preserved as historical evidence;
  no browser workflow was rerun during publication.

The study does not include a verified downloadable native document. It records
local application storage/reload and independent BRep solids, with static pose
edits rather than a verified joint rig. The separate external-mesh presentation
and its reference artwork are not included in this publication.

## Privacy and preservation

- Private account/workspace paths were replaced with `<workspace>` or
  `<user-home>` in the handoff and affected current tracked text evidence.
  Numerical results, test verdicts, IDs and input hashes were not changed.
- The old kettle layout probe now accepts an explicit input-file argument
  instead of embedding a private temporary directory.
- Original local bytes were backed up under ignored `tmp/` before redaction.
  Unselected local files remain untouched. External original drawings, reference
  artwork, large intermediates, caches, credentials and local logs are excluded.
- Privacy redaction applies to the newly published tree. **Existing Git history
  was not rewritten**, so this is not a claim that earlier published paths were
  erased from historical commits. No assertion is made about third-party copies.
- License and upstream attribution are retained. No personal values or credentials
  are printed in the publication scan report.
- The new commit uses the public GitHub account's noreply email rather than the
  locally configured personal email. Existing commit attribution is unchanged.

Local validation: 12/12 focused fixture/ranking/architecture tests passed with
zero failures/skips; architecture checked 970 modules and documentation links.
Six TypeScript files and four CommonJS files passed syntax-only checks, and
25 study JSON files parsed. Six selected screenshots were visually inspected.
These checks do not execute the new authoring scripts or certify their geometry.

Remote validation is recorded in the PR/CI and final handoff message. Prior CI
`42375506122` belongs to commit `8566dd8`; it is not a test of these additions.
Full unit, full browser and live-model evaluations are outside this publication.
