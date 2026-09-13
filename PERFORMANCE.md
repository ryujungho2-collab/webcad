# Web CAD performance baseline

Measured on 2026-09-13 in the local Vite development server and production build. Browser timings below used a warm local HTTP cache; they are useful for code-path comparisons, not network forecasts.

## Current bottlenecks

- OpenCascade is the dominant payload: `50,305.13 kB` WASM (`13,955.45 kB` gzip) plus `228.71 kB` of loader JavaScript.
- The first BRep operation initializes OpenCascade and then performs boolean/meshing work on the browser main thread. Measured OpenCascade initialization was `666.2–755.2 ms`; the seeded boolean-cut task took `739.7–826.1 ms` including initialization.
- `CadViewport` already preserves its renderer, scene, cameras, and controls and avoids remeshing unchanged feature signatures. It still performs O(n) document/scene scans for every document revision.
- History uses complete `CadDocument` snapshots. A synthetic 1,000-object/feature document (298,117 serialized bytes) took `2.392 ms` per `structuredClone`; the previous double-clone path took `5.311 ms`. Full snapshots remain a linear memory cost even with the bounded history depth.
- Explorer views still create one React element per matching item. CSS `content-visibility` now avoids off-screen layout/paint, but true windowed rendering is still needed for documents well beyond hundreds of rows.
- STEP, IGES, and STL functions in `cad-kernel` are placeholders, so there is no valid import path or sample import timing to report. Import performance must not be claimed until real parsers exist.

## Implemented in this milestone

- Split the application shell from `CadViewport` with React lazy loading. The previous single `808.12 kB` main JavaScript chunk is now a `267.11 kB` shell chunk plus a `539.18 kB` viewport chunk; the lazy kernel geometry client is `5.21 kB`.
- Added a narrow, asynchronous `kernelGeometryService` boundary. It defers its first kernel import until an idle opportunity, exposes kernel loading/working/error state, returns serializable mesh arrays, and is suitable for replacement by a Worker-backed client without changing viewport callers.
- Added a bounded 64-entry primitive mesh promise cache. Identical geometry and concurrent StrictMode requests share kernel/meshing work; duplicate 8×8×6 boxes measured a cache hit and reduced viewport synchronization from `7.8 ms` to `0.8 ms`.
- Hidden objects without an existing mesh no longer initialize or invoke the kernel until they become visible.
- Transform and visibility updates now use per-mesh signatures and avoid redundant Three.js matrix/visibility writes. A measured move command took `0.2 ms`; its viewport synchronization took `0.1 ms`, updated one transform, and remeshed zero objects.
- Added User Timing instrumentation for shell readiness, OpenCascade initialization, kernel tasks, command dispatch, document save/open, and viewport synchronization. Development logging includes affected/remeshed object counts.
- Removed the second clone of each history snapshot by transferring ownership of the already detached pre-command snapshot. History is now bounded to 100 entries to prevent unbounded growth.
- Added `content-visibility` containment to Explorer/history/layer rows and a real collapsible Model root.
- Guarded transform-control commits so one pointer drag produces one document command even if unrelated pointer-up events occur.

## Measurements

| Path | Result |
| --- | ---: |
| Shell React commit (local dev) | `8.8–8.9 ms` |
| OpenCascade initialization (warm local cache) | `666.2–755.2 ms` |
| Seeded boolean + mesh task, including init | `739.7–826.1 ms` |
| Warm 8×8×6 box creation + mesh | `5.4 ms` |
| First box viewport sync | `7.8 ms`, 1 remesh |
| Identical second box viewport sync | `0.8 ms`, cache hit |
| Move command dispatch/history snapshot | `0.2 ms` |
| Move viewport sync | `0.1 ms`, 0 remeshes, 1 transform update |
| 1,000-object single history clone (Node synthetic, 50-run mean) | `2.392 ms` |
| Previous double-clone equivalent | `5.311 ms` |
| 1,000-object compact serialization | `0.602 ms`, `298,117 bytes` |

## Remaining risks and next optimization

The highest-value next step is a real Worker-hosted kernel/import service with cancellable task IDs and progress events. STEP/IGES parsing, boolean operations, and meshing should remain together inside that worker so OpenCascade objects never cross the boundary; only document-safe metadata and transferable typed mesh buffers should return to the UI. Before that work, the placeholder import APIs need real, tested implementations and representative fixture files.

After worker isolation, add explicit dirty-object IDs to document change notifications so viewport synchronization and Explorer derivation do not scan the full document on every revision. Replace Explorer row rendering with measured windowing only when representative thousand-object documents demonstrate that CSS containment is insufficient. Longer term, replace full history snapshots with command deltas or periodic compressed checkpoints; the current 100-entry cap controls growth but does not change its O(document size) cost.
