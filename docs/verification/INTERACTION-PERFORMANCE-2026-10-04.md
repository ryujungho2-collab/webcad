# Interaction plan performance

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

Measured 2026-10-04 with `pnpm --filter @agent-webcad/web exec tsx scripts/benchmarkInteraction.ts`. The same script, fixtures and nine trials per size were used before and after the index change. Each fixture has 127 generated pattern instances plus 0, 250 or 1,000 background lines. Repeated edits change the spacing, obtain every affected path, apply, undo and redo. Preview JSON immutability and serialization are checked in the script.

These are Node command-path timings, not browser input-to-paint or practitioner task times. Nine samples make p95 the largest sample; treat the numbers as local evidence, not a universal latency guarantee. `enter` and `hover` measure candidate filtering and target description, not native pointer latency.

## Evidence and change

`getCadPlanDrawingPaths` previously searched the complete feature table four times per affected object. Preview measurement searched it again per changed object. Detached plans now retain their before/after feature indexes, keyed by output object ID; document objects already have an ID index. Measurements use those same indexes. World paths are cached lazily inside each immutable plan and returned as detached clones. Discarding/evicting the plan discards its indexes and paths. Atomic Apply still publishes the original prepared proposal after checking document version and baseline.

The Pattern overlay also avoids React state updates when projected paths have not changed. Its separate render benefit was not isolated in this benchmark.

## Results

Milliseconds, median / p95:

| Background | Operation | Before | After |
| --- | --- | --- | --- |
| 0 | Preview | 9.421 / 12.915 | 8.827 / 11.986 |
| 0 | Path retrieval | 1.808 / 2.677 | 1.151 / 1.845 |
| 250 | Preview | 15.208 / 18.888 | 14.836 / 17.251 |
| 250 | Path retrieval | 2.283 / 2.976 | 1.063 / 2.028 |
| 1,000 | Candidate filtering | 0.374 / 0.436 | 0.335 / 0.400 |
| 1,000 | Target description | 0.347 / 0.371 | 0.387 / 0.438 |
| 1,000 | Reference requirements | 0.621 / 0.905 | 0.583 / 0.814 |
| 1,000 | Preview | 65.467 / 117.457 | 39.343 / 43.925 |
| 1,000 | Path retrieval | 49.318 / 78.931 | 1.210 / 1.565 |
| 1,000 | Apply | 20.610 / 28.781 | 18.544 / 23.600 |
| 1,000 | Undo | 19.435 / 26.706 | 18.871 / 24.825 |
| 1,000 | Redo | 19.020 / 30.609 | 19.495 / 30.271 |

The targeted path-retrieval p95 fell about 98%; preview p95 fell about 63%. Small fluctuations in unrelated stages are not attributed to the optimization. Local raw logs: `tmp/interaction-benchmark-before.log`, `tmp/interaction-benchmark-after.log`.

## Remaining costs

Full-document cloning, JSON diff/staleness checks and snapshot history remain. Next profiling should separate these costs from solver/regeneration, Explorer reconciliation and browser paint on large connected sketches. Initial bundle download and Worker initialization require separate measurements. Existing native browser regressions establish workflow correctness; they do not establish usability gains for professional users.
