# Hybrid CAD Phase 3 — 실행 검증과 성능 기준선

2026-10-25, Windows, Node v24.19.0. 구현 범위: [Phase 3 아키텍처](../architecture/HYBRID-GEOMETRY-PHASE-3.md).

## 자동 테스트와 빌드

| 검사 | 결과 / 실행 명령 |
|---|---|
| 웹 전체 단위·통합 회귀 | **1,470 tests / 50 suites, 전부 통과**, 실패·skip·cancel 0. 123.870초. `apps/web`에서 `TSX_DISABLE_CACHE=1`, `node --import tsx --test --test-concurrency=4 tests/*.test.ts` |
| Geometry Nodes 핵심 단위·통합 | `tests/geometryNodes.test.ts`: 13개, 전체 suite에도 포함 |
| 최종 집중 회귀 | Worker 전송 전 메모리 검사 보완 후 Graph/Mesh/MCP 6개 test 파일 **43개 재실행 통과** |
| 공식 MCP SDK | `tests/geometryNodesMcp.test.ts`: 통과. 실제 protocol server + official SDK/InMemoryTransport, UI transaction과 출력 비교 |
| Polygon 브라우저 회귀 | `--page=polygonEditing`: **27개 통과** |
| v55 triangle 브라우저 회귀 | `--page=meshEditing`: **13개 통과** |
| Geometry Nodes 실제 브라우저 | `--page=geometryNodes`: **27개 통과**. 최종 native UI/Worker 결과는 아래 machine-readable 보고서 참조 |
| 웹 production | `pnpm --filter @agent-webcad/web build`: TypeScript + Vite 통과. 별도 Geometry Evaluation Worker bundle 생성. 큰 chunk 경고는 유지 |
| 전체 workspace 최종 build | `pnpm -r build`: 웹 + 공통 패키지 5개 모두 통과 |
| 공통 패키지 5개 | `pnpm --filter './packages/**' -r build`: document/commands/history/geometry/kernel 통과 |
| 구조 검사 | `pnpm --filter @agent-webcad/web check:architecture`: 850 modules의 geometry/command/type 경계 및 문서 링크 통과 |

브라우저 실행 명령: `pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=<page>`.

## 검증한 실제 시나리오

1. Mesh Primitive → Subdivision: 26 vertices / 24 faces, 실제 Catmull–Clark 결과.
2. Curve Primitive → Curve to Mesh: straight path tube와 bent 3D polyline profile Sweep.
3. Resample Curve → Instance on Points → Realize Instances: 실제 독립 정점·면을 가진 반복 형상.
4. Transform Geometry와 Join Geometry의 실제 좌표·face provenance, positive scale/rotation.
5. 파라미터 변경 시 별도 curve branch cache hit, 변경 node와 downstream 재계산. 최종 intersection check는 계속 수행.
6. 미지원 node/field, type mismatch, cycle, duplicate socket, required input 미연결 거부.
7. mesh source → procedural feature live dependency, source 변경/Undo/Redo, 삭제·cycle·locked dependent의 원자적 거부. selection-only 변경은 locked dependent를 재생성하지 않음.
8. Preview에 params가 그대로인 procedural dependent의 형상/측정 변화도 표시.
9. 누적 split/merge/delete 참조, revision-aware edge recreation, malformed ledger 거부.
10. Region Inset, disjoint multiple Bevel, unequal-loop Bridge의 실제 geometry와 참조 기록.
11. 면 교차/copolanar overlap 검출, pair budget 거부, 작은 decimal Loop Cut과 큰 좌표의 정상 공유 경계 회귀.
12. 실제 browser Worker 취소 후 문서 불변, stale result 거부, persistent Worker cache reuse. 별도 injected-port 단위 테스트에서 Worker failure/deadline/old Worker의 late message·error도 확인.
13. v55/v56 baseline, v57 graph/provenance 파일 roundtrip 및 구버전 위장 거부. 실제 browser reload와 file open.
14. 공식 MCP의 graph create/add/remove/connect/disconnect/parameters/edit/read/validate/evaluate/catalog, 선택 권한과 새 외부 input 권한 검사.

## 브라우저 근거

[Geometry Nodes browser-report.json](../../output/verification/geometry-nodes-phase-3/browser-report.json)은 실제 실행된 checks와 Worker timing metrics를 기록한다. Headless Microsoft Edge + SwiftShader + native CDP mouse/keyboard + 실제 React/Three.js/Worker를 사용했다.

Graph 편집 UI, derived mesh native viewport hit, 파라미터 Review/Apply, typed connection 교체/실패, draft node 삭제·해제, Sweep, instance count 변경, live external Mesh binding, 취소/stale 결과, BRep 공존, reload를 확인한다.

중간 Polygon browser 검사에서 40 mm cube의 factor 0.3 Loop Cut 공유 경계가 coplanar overlap으로 오인되는 수치 문제가 드러났다. local-origin area와 길이·좌표 크기를 고려한 tolerance로 수정하고 단위 테스트 및 최종 Polygon browser 27개를 통과했다. 실패 실행을 성공 수에 포함하지 않는다.

## 성능 벤치마크

실행: `pnpm --filter @agent-webcad/web exec tsx scripts/benchmarkGeometryNodes.ts`.

[benchmark.json](../../output/verification/geometry-nodes-phase-3/benchmark.json)에 각 case당 15회 cold/warm/parameter-change 샘플의 median/p95, vertex/face 수, 추정 값 크기, 실제 재계산 node 목록을 저장한다. 그래프 전체 평가와 최종 교차 검사를 포함한 synchronous evaluator 측정이며 Worker startup/transfer/GPU rendering은 제외한다. 공유 개발 머신에서 실행한 작은 fixture 기준선으로, 실시간 대형 모델 성능을 보증하지 않는다.

| Fixture | V/F | cold median | warm median | 변경 후 median |
|---|---:|---:|---:|---:|
| Mesh + Subdivision | 26 / 24 | 7.13 ms | 4.92 ms | 7.02 ms |
| Bent profile Sweep | 24 / 18 | 5.26 ms | 3.55 ms | 4.66 ms |
| Realized instances | 24 / 18 | 3.38 ms | 2.74 ms | 3.15 ms |

브라우저 Worker timing은 browser-report.json의 단일 warm round-trip 표본이며 위 Node 분포와 합쳐 비교하지 않는다. 작은 fixture에서는 cache lookup, structured clone, output validation 비용이 상대적으로 커서 부분 재평가의 wall-clock 개선이 작거나 없을 수 있다. cache hit와 실제 재계산 node 목록을 함께 확인해야 한다.

## 미실행·미보장 범위

- **전체 제품 browser suite는 실행하지 않았다.** Geometry Nodes, Polygon, 기존 Mesh 세 페이지만 실행했다. 그 외 sketch/drawing/project/recovery/export/Copilot 및 BRep 전용 제품 화면의 browser pages는 이번 실행 범위 밖이다.
- Browser는 실제 viewport와 inspector를 장착한 harness이며 전체 App launch/session flow 검사가 아니다. 실제 native UI로 수행한 범위와 코드/단위 테스트 검사를 구분한다.
- 외부 LLM 실호출, 외부 MCP process의 OS stdio transport, 다른 브라우저/모바일/GPU, production 배포 검증은 수행하지 않았다.
- 기존 kernel dummy smoke 파일의 존재를 BRep 검증 성공으로 세지 않았다. BRep 근거는 전체 웹 회귀의 실제 OpenCascade 연산과 세 browser 시나리오의 실제 BRep 생성·공존이다.
- Worker crash/deadline은 injected-port 테스트, 실제 browser에서는 취소/stale/cache를 검사했다. 브라우저 프로세스 강제 crash/OOM recovery는 미실행이다.
- memory budget은 직렬화 크기 추정이다. peak RSS/heap/GPU memory, 장시간 leak, 10k/20k 한도 근처 대규모 복합 장면과 exact self-intersection oracle corpus는 아직 검증하지 않았다.
- Worker 없는 환경과 cold deserialize/measure 경로에 동기 평가가 남아 있다. 이 경로의 hard preemption을 주장하지 않는다.

## 파일·이력 호환성

v55/v56 문서를 읽기만 해서는 강제 업그레이드하지 않는다. 누적 이력을 기록하는 새 Polygon 편집 또는 Geometry Nodes 생성이 v57 저장을 유발한다. 기존 파일의 파괴적 migration/대량 다운로드는 없었다. 누적 이력은 첫 recorded edit 이전의 설계 이력을 복구하지 않는다. Edge 문자열 재사용은 revision으로 구분한다.

## 후속 gate

Phase 4 진입 조건은 아키텍처 문서 10절에 있다. 우선순위는 cold 경로 비동기화, spatial index/부분 갱신, provenance compaction와 remesh correspondence, 대형 장면 성능·메모리 기준선, exact/approximate validity 구분, 전체 제품 browser regression이다. Sculpting/Remeshing 자체는 이번 단계에서 구현하지 않았다.
