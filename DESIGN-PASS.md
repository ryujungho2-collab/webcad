# First workstation presentation pass

## Direction
Graphite surfaces, restrained teal interaction states, compact typography, explicit engineering units. The viewport remains dominant. No CAD model, command, history, kernel or renderer architecture changed.

Reference principles: [Fusion's browser/canvas/navigation separation](https://help.autodesk.com/cloudhelp/ENU/Fusion-GetStarted/files/GS-THE-FUSION-INTERFACE.htm), [SOLIDWORKS contextual PropertyManager](https://help.solidworks.com/2025/english/SolidWorks/sldworks/r_pm_overview.htm), [Onshape's browser CAD organization](https://cad.onshape.com/help/Content/Home/user_interface_basics.htm), and [VS Code panel layout](https://code.visualstudio.com/docs/configure/custom-layout).

## Implemented
- Reusable color, typography, density and panel-size tokens; separate workstation presentation stylesheet.
- NumericField presentation primitive with unique accessible names, monospaced exact values, axis accents and unit suffixes. Existing command dispatch/commit behavior retained; values are not rounded.
- Shared lightweight SVG tool icons for implemented actions.
- Removed unavailable workspace tabs and nonfunctional Snap status; Grid and transform pressed states are explicit.
- Real View menu panel toggles. Every activity icon now toggles Explorer visibility and selects that activity, as explicitly requested during this pass. Switching activities while open therefore closes the panel; the next click opens it.
- Improved tree selection, readable labels, keyboard focus, sticky Inspector header; removed viewport label backdrop blur.

## Actual runtime checks
Used the app before edits and inspected the redesigned app at its actual 1786 x 1272 browser size. Box creation, Explorer selection, dimension edit before redesign, Position X edit after redesign (14 to 20), undo (14), redo (20), Fit All, Top, orthographic switching, grid off, Move tool active state/gizmo, layer locking and resulting disabled tools, unlock, different/same activity icon collapse/reopen, and History entries were observed.

Not verified comprehensively: alternate desktop sizes, empty document creation, save/open, numeric rotation/scale after redesign, gizmo drag commits, search, all menu actions, all view directions. Do not treat this as a full regression sign-off. The user was interacting with the same browser during QA; ambiguous interactions were not counted as passes.

## Deliberately remaining
- Cylinder/sphere and more practical CAD types are requested but NOT implemented by this presentation pass. They need real kernel geometry, serializable feature parameters, commands, undo/redo and parameter editing, not decorative toolbar entries.
- True camera-aware ViewCube/axis indicator, hover/edge selection styling, resizable persisted panels, menu dismissal/keyboard navigation, full theme coverage and large-document tree UX need further work.
- Existing static axis triad is not camera-aware; changing its styling cannot fix that engineering limitation.
- Existing base CSS remains; new tokens/primitives are a migration boundary, not a completed stylesheet decomposition.
- Browser startup currently frames the existing demo body; newly created off-center objects can require Fit All. No auto-framing behavior changed.

## Builds
cad-commands and cad-history: actual `tsc` builds passed. Web production build passed. Initial sandbox retries failed with EPERM reading TypeScript; the authorized outside-sandbox rerun passed. Existing pnpm configuration and >500 kB chunk warnings remain. cad-kernel was not modified.

## Raw validation output

### `git status --short`

```text
 M apps/web/src/app/AppShell.tsx
 M apps/web/src/main.tsx
 M apps/web/src/menu/MenuBar.tsx
 M apps/web/src/properties/PropertiesPanel.tsx
 M apps/web/src/ribbon/Ribbon.tsx
 M apps/web/src/status/StatusBar.tsx
 M apps/web/tsconfig.tsbuildinfo
?? DESIGN-PASS.md
?? apps/web/src/ui/

```

### `git diff --name-only`

```text
warning: in the working copy of 'apps/web/src/app/AppShell.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/main.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/menu/MenuBar.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/properties/PropertiesPanel.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/ribbon/Ribbon.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/status/StatusBar.tsx', LF will be replaced by CRLF the next time Git touches it
apps/web/src/app/AppShell.tsx
apps/web/src/main.tsx
apps/web/src/menu/MenuBar.tsx
apps/web/src/properties/PropertiesPanel.tsx
apps/web/src/ribbon/Ribbon.tsx
apps/web/src/status/StatusBar.tsx
apps/web/tsconfig.tsbuildinfo

```

### `git diff --stat`

```text
warning: in the working copy of 'apps/web/src/app/AppShell.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/main.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/menu/MenuBar.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/properties/PropertiesPanel.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/ribbon/Ribbon.tsx', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'apps/web/src/status/StatusBar.tsx', LF will be replaced by CRLF the next time Git touches it
 apps/web/src/app/AppShell.tsx               | 10 +++++-----
 apps/web/src/main.tsx                       |  2 ++
 apps/web/src/menu/MenuBar.tsx               | 12 +++++++++++-
 apps/web/src/properties/PropertiesPanel.tsx | 11 ++++++-----
 apps/web/src/ribbon/Ribbon.tsx              | 26 +++++++-------------------
 apps/web/src/status/StatusBar.tsx           |  1 -
 apps/web/tsconfig.tsbuildinfo               |  2 +-
 7 files changed, 32 insertions(+), 32 deletions(-)

```

### `pnpm --filter @agent-webcad/web build`

```text
[WARN] The "pnpm" field in package.json is no longer read by pnpm. The following keys were ignored: "pnpm.onlyBuiltDependencies". See https://pnpm.io/settings for the new home of each setting.
$ tsc -b && vite build
vite v7.3.6 building client environment for production...
transforming...
✓ 80 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                  0.40 kB │ gzip:      0.27 kB
dist/assets/opencascade.full-BROZOezB.wasm  50,305.13 kB │ gzip: 13,955.45 kB
dist/assets/index-q4Rcpb8O.css                  23.69 kB │ gzip:      5.64 kB
dist/assets/opencascade.full-6ofQA2u6.js         0.07 kB │ gzip:      0.09 kB
dist/assets/index-Cudns0VL.js                    5.21 kB │ gzip:      2.03 kB
dist/assets/opencascade.full-BUFqgUGn.js       228.71 kB │ gzip:     51.09 kB
dist/assets/index-B_w4vGiL.js                  268.55 kB │ gzip:     81.74 kB
dist/assets/CadViewport-D2C6aEnA.js            539.18 kB │ gzip:    136.07 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 2.16s

```
