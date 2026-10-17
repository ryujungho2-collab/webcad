# Web CAD performance baseline

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

> 단계 기록: 아래 구현·검수 수치는 해당 시점의 근거다. 최신 지원 범위는 [CAD-BASICS](../product/CAD-BASICS.md), 최근 전체 검수는 [PROJECT-STATE](../../PROJECT-STATE.md), 다음 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다.

## Repeated editing benchmark (2026-10-03)

The current measured baseline and improvement are in
[CAD-EDIT-BENCHMARK-2026-10-03.md](CAD-EDIT-BENCHMARK-2026-10-03.md).
Six native keyboard edits in each mechanical/ordinary 2D fixture at 0/250/1,000
reference entities use the real App/Worker, before/after preview and exact Apply.
This is a warm local development/SwiftShader benchmark, not practitioner timing.
The 1,000-reference mechanical preview median fell from 521.4 to 344.9 ms and
repeat edit time from 1,022.8 to 747.9 ms. Exact complete-operand inspection reuse,
snapshot lookup Maps and world-path/impact preparation outside animation frames
remove repeated work while preserving actual solver/kernel validation.
Small ordinary 2D timing and frame-gap tails did not uniformly improve.
First response, proposal preparation and Apply long tasks remain the next
profiling target; bundle loading is a separate cold-start task. Frame-cost User
Timing is opt-in during the benchmark to avoid accumulating idle-frame entries.

## Parametric transaction update (2026-10-03)

Source edits now regenerate affected feature chains before publishing the
document. Kernel work remains in the browser Worker and unchanged branches skip
rebuilding, but graph validation scans the document and detached transaction
snapshots copy it in full. Batch children each validate/regenerate before the next child;
large batches incur additional cloning and traversal. Retained source features
and nested solid operand snapshots also increase document/history storage.
The earlier timings below predate this transaction path and are not benchmarks
for the current implementation. See PARAMETRIC-REGENERATION.md for verification.

## Kernel Worker update (2026-09-30)

- Browser geometry now runs in a lazily created module Worker: WASM loading,
  primitives, composed solids, mesh generation and topology enumeration.
  The Node adapter runs the same runtime for existing numerical tests;
  browsers never fall back to main-thread geometry when a Worker fails.
- Each request has a monotonically increasing task ID. The client sends one
  request at a time and reports queued/loading/building/meshing/topology phases
  plus the outstanding request count. These are actual stages, not percentages
  or time estimates. The status bar subscribes to these progress events.
- Only serialized parameters enter the Worker. Task-owned Float64 position,
  Float32 normal and Uint32 index buffers transfer back; BRep handles remain in
  the Worker. Bounded UI caches retain the received buffers for reuse.
- Worker errors reject all outstanding requests; later uncached work starts a
  new Worker. Individual invalid operations reject only their own task. Worker
  disposal during hot reload releases its WASM heap and rejects its waiters.
- Document commands, including entire batches and their history snapshots,
  execute sequentially. Undo/Redo and file replacement/save are guarded while
  document commands are pending; camera and other viewport controls remain live.
- Browser verification: `/tests/kernelWorker.browser.html` on the dev server
  passed 8 checks, including typed-buffer transfer, precision, topology, cache
  reuse, phase events and recovery after a rejected operation. A 10 ms main
  thread timer fired 106 times during fresh Worker initialization and geometry
  work (local cached assets). This demonstrates yielding, not a speedup benchmark.
- Payload size and snapshot-history memory costs below remain relevant. Active
  OCCT calls are synchronous inside the Worker; per-task cancellation and real
  kernel-internal progress percentages are not implemented in this milestone.

## Historical measurements (before Worker isolation)

Measured on 2026-09-13 in the local Vite development server and production build. Browser timings below used a warm local HTTP cache; they are useful for code-path comparisons, not network forecasts.

## Historical bottlenecks (2026-09-13; superseded paths noted above)

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

Kernel Worker isolation and phase events are implemented; the recommendation
to introduce that boundary is complete. Remaining kernel work includes
per-task cancellation and real STEP/IGES import implementations with representative
fixtures. Keep parsing and shape construction inside the Worker so OpenCascade
objects never cross the boundary. Only document-safe metadata and transferable
mesh buffers should return to the UI. Current product priorities and acceptance
criteria are in [NEXT-STEPS.md](../../NEXT-STEPS.md); the historical measurements above
do not establish their performance priority.

After worker isolation, add explicit dirty-object IDs to document change notifications so viewport synchronization and Explorer derivation do not scan the full document on every revision. Replace Explorer row rendering with measured windowing only when representative thousand-object documents demonstrate that CSS containment is insufficient. Longer term, replace full history snapshots with command deltas or periodic compressed checkpoints; the current 100-entry cap controls growth but does not change its O(document size) cost.
