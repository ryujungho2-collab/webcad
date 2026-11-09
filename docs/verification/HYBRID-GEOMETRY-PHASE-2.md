# Hybrid Geometry Phase 2 — 실행 검증 보고

2026-10-25, Windows / Node v24.19.0 / pnpm. 사용자 작업 트리의 기존 변경을 유지했다. 커밋/배포/대용량 다운로드/파괴적 문서 마이그레이션을 수행하지 않았다.

구현 계약과 지원 제한: [Phase 2 아키텍처](../architecture/HYBRID-GEOMETRY-PHASE-2.md).

## 실행 결과

| 검사 | 명령 / 범위 | 결과 |
|---|---|---|
| 웹 전체 단위·통합 회귀 | `apps/web`에서 `TSX_DISABLE_CACHE=1`, `node --import tsx --test --test-concurrency=4 tests/*.test.ts` | **1,456 tests / 50 suites, 모두 통과**, fail/skip/cancel 0, 152.813초 |
| Mesh 집중 검사 | `node --import tsx --test tests/polygonMesh.test.ts tests/editableMesh.test.ts tests/polygonMeshMcp.test.ts tests/meshMcp.test.ts` | **29개 통과** |
| Polygon 실제 브라우저 | `pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=polygonEditing` | **27개 통과**, isolated headless Microsoft Edge, 실제 native mouse/keyboard + React/Three.js + BRep Worker |
| 기존 v55 실제 브라우저 | 동일 runner의 `--page=meshEditing` | **13개 통과** |
| 웹 production | `pnpm --filter @agent-webcad/web build` | TypeScript + Vite 통과. 500 kB 초과 chunk 경고는 남아 있음 |
| 공통 패키지 | `pnpm --filter './packages/**' -r build` | cad-document / cad-commands / cad-history / cad-geometry / cad-kernel 5개 통과 |
| 구조 검사 | `pnpm --filter @agent-webcad/web check:architecture` | geometry / command / type 경계와 문서 링크 통과 |

최종 전체 테스트 로그에 매우 얇은 v55 triangle 렌더링 회귀 사례도 포함되어 통과한 것을 확인했다. 기존 kernel smoke 이름의 테스트 파일 존재를 실제 검증 성공으로 계산하지 않았다. `packages/cad-kernel/src/test/smoke.test.ts`는 dummy 구현이며 이 보고서의 BRep 검증 근거가 아니다. 실제 BRep 검증은 웹 전체 테스트의 OpenCascade 연산·의존성·STEP/측정 검사 및 두 브라우저 시나리오의 BRep 생성/공존 검사다.

## 주요 검증 근거

- Triangle / Quad / convex·concave N-gon triangulation, signed area oracle, 편집 edge에 render diagonal이 포함되지 않음.
- Half-edge twin/next/previous, 공유 edge incidence, boundary loop, winding/non-manifold/degenerate 거부.
- 여러 공면 triangle Extrude의 공유 정점·외곽 wall, inset의 실제 edge offset 좌표, cube bevel, complete-loop bridge, quad ring factor 전파, merge/dissolve/delete.
- 각 편집 종류의 잘못된 입력을 CommandBus로 제출했을 때 문서 snapshot 불변. Batch의 중간 성공 뒤 실패도 rollback.
- Cube Catmull–Clark 첫 단계 26V/24F, corner `(20/9,20/9,20/9)` 수치 oracle, level 2의 96F, 원본 vertex weight sum 및 위치 재구축.
- Boundary fixed/smooth 차이, infinitely sharp crease, stack 순서에 따른 결과 차이, disabled entry no-op, 삼각형/N-gon→Quad 평가.
- Selection-only cache reuse, source geometry 변경 invalidation, detached cache 반환, budget 초과 시 원본/캐시 성공 수 유지.
- Crease edge 분할 대응 및 소실 거부. 잘못된 modifier type/level/edge reference와 조작한 serialized evaluation 거부.
- v55 저장·로드·기존 편집, 명시적 v2 upgrade와 Undo, v56 저장 및 downgrade 위장 거부, source/selection/stack 재로드.
- Official MCP SDK의 InMemoryTransport를 거쳐 8종 편집 결과를 UI Preview/Apply 결과와 비교. 새 생성/upgrade/modifier 및 제어/평가 읽기 검사. 임의 generated IDs는 달라질 수 있어 geometry와 oriented face loop의 동등성을 비교한다.
- 실제 브라우저의 8종 편집 UI, Polygon 및 subdivision control-cage face picking, invalid inset 오류, modifier level 변경/Undo, BRep 공존, 실제 browser reload와 file open.

## 미실행 범위와 남은 제한

- **전체 브라우저 suite는 실행하지 않았다.** `meshEditing`, `polygonEditing` 두 페이지만 실행했다. 나머지 BRep 전용 모델링, drawing/sketch, project/recovery, export, Copilot 제품 화면 등 browser pages는 이번 단계에서 재실행하지 않았다. 해당 모듈의 단위·통합 테스트 통과가 전체 UI 회귀 통과를 의미하지 않는다.
- 별도 standalone legacy kernel test runner, 외부 LLM 실호출, 외부 MCP 프로세스의 OS stdio 전송, 모바일/다른 브라우저, WebGPU/GPU별 검증은 하지 않았다. MCP는 실제 공식 SDK와 프로토콜 서버를 사용하되 InMemoryTransport다.
- Full product launch flow 대신 실제 CadViewport + MeshPanel을 장착한 browser harness를 사용했다. Modifier reorder/crease/toggle/remove 각각의 native UI 버튼은 독립 browser case가 아니며, stack 순서/crease/disabled semantics는 단위 테스트로 검증했다.
- Preview는 기존의 임시 transaction 검증과 surface measurement 비교다. viewport의 별도 변경 형상 ghost overlay는 추가하지 않았다.
- 전체 face 간 self-intersection, solid volume certification, semi-sharp/limit subdivision, 큰 mesh 성능/장시간 메모리/Worker cancellation, 임의 복합 topology의 exhaustive robustness는 보장하지 않는다.
- 중간 browser 검사에서 새 객체 전환 후 이전 operation UI 상태가 남는 문제를 확인해 object ID별 controls를 분리했고 최종 27개가 통과했다. 중간 실패를 최종 성공 수에 포함하지 않았다.

## 산출물 상태

완료: Polygon v2, derived half-edge, rendering triangulation 분리, 제한된 8종 편집, stable reference mapping, modifier stack과 실제 Catmull–Clark evaluator/cache/provenance, UI/MCP/CommandBus/Undo/file integration, 위 표의 tests/build.

미완료: 일반 multi-edge bevel, region/concave inset, unequal-loop bridge, 모든 종류의 merge/dissolve, 누적 전역 topology naming, 자기 교차 검사, limit/세미 sharp/attribute subdivision, Geometry Nodes/sculpt/remesh/Mesh-to-BRep. Phase 3 진입 gate는 아키텍처 문서 8절에 명시했다.
