# Experimental poseable figure authoring scripts

Publication note: 2026-11-10 (preparation began 2026-11-09).

`design.ts` holds synthetic proportions, section definitions and joint ranges.
`buildModel.ts` uses existing CAD commands and OpenCascade operations to attempt
a native model and assembly. `proto.ts`, `proto2.ts` and `proto3.ts` are standalone
geometry probes. These are development scripts, not new product features or
automated evidence that the complete figure/rig builds successfully.

The publishing session inspected the source and checked syntax; it did not run
these authoring scripts or validate their resulting geometry, joints or export.
They can reset the in-process test document and write generated project files.
Run deliberately in isolation, from `apps/web`, with existing dependencies:

```sh
pnpm exec tsx scripts/spiderMan/buildModel.ts
```

The intended output is `output/projects/spider-man/`. It is distinct from the
[native CAD study](../../../../output/projects/spider-native-cad/README.md),
whose saved proposals and screenshots document a different UI authoring session.
That study's own README records its limits, including the absence of a verified
downloaded WebCAD file and its static pose rather than a validated joint rig.

No external reference artwork, personal source drawings, model credentials or
local browser-project storage are included with these scripts. Character names
and reference attribution do not imply ownership of the underlying character.
