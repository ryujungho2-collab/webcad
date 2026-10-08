# G5-B1 Query 연결 — 중간 정리

2026-10-09. 사용자의 “여기까지 하고 정리해” 요청으로 추가 구현을 멈췄다. **B1은 진행 중이며 완료 검수가 끝나지 않았다.** 기준선은 G5-A3 커밋 `7df88c2`다. B2·실제 provider·G6는 시작하지 않았다.

## 구현된 부분

기존 `queryCadDocument`는 기하 실측·dependency graph를 제공했지만 Copilot에서 명시적으로 선택을 읽는 UI는 없었다. 다음 경로를 연결했다.

`Canvas/Model tree 선택 → Copilot / Read selection → 측정·원본·영향·구속·잠금 설명 → Inspect object/source 또는 Edit Sketch`

- [공통 Query](../../apps/web/src/state/documentQuery.ts): 선택 ID 중복 제거, 선택 한도/AbortSignal, feature output index, layer와 편집 제한 이유. detached snapshot에서 원본 raster bytes를 제외한다. 기존 Query 호출과 측정 엔진을 재사용한다.
- [읽기 DTO](../../apps/web/src/copilot/copilotQuery.ts): 명시적 선택만 조회하고 feature params·이미지 bytes·전체 graph를 결과에 넣지 않는다. 선택 최대 50개, ID 길이 최대 200, 결과 UTF-8 64 KiB, 기본 deadline 30초다. 원본/영향 목록은 각각 20개, solve group은 10개까지 표시하면서 전체 수를 유지한다. 긴 표시 문자열은 200자로 줄이고 알리며 참조 ID는 자르지 않는다. 크기 초과는 대상을 조용히 버리지 않고 재선택 오류로 반환한다.
- [읽기 세션](../../apps/web/src/copilot/useCopilotQuery.ts): App 소유 상태로 activity 이동과 독립적으로 유지한다. 선택·문서 revision/generation 변경은 결과를 무효화한다. Cancel과 sequence token으로 이전 응답이 새 상태를 덮지 못하게 한다.
- [패널](../../apps/web/src/copilot/CopilotQueryPanel.tsx): 단위 포함 실측, 저장 원본/영향, 스케치 구속 수·DOF·잔차, 잠금과 복구 안내, 선택 대상/원본 검사와 Edit Sketch 인계. `App`, `CopilotPanel`, `ExplorerPanel`에 연결했다.

읽기는 local 동작이며 gateway 요청을 보내지 않는다. Plan/Apply allowlist와 prompt payload는 확대하지 않았다. 읽기 결과를 LLM 설명 입력으로 전송하는 기능도 추가하지 않았다.

## 실행한 검증

- `pnpm --filter @agent-webcad/web exec tsc -b`: 통과.
- `pnpm --filter @agent-webcad/web check:architecture`: **317 modules**, geometry/command/type 경계와 문서 링크 통과.
- [새 Query Node 검사](../../apps/web/tests/copilotQuery.test.ts) **7개**: 원의 독립 수치와 BRep 체적, 스케치 관계·잠금, 선택 한도, raster payload 미접근, 누락 대상/참조와 nonuniform curve 측정 오류, bounded DTO, Cancel/late completion, deadline, 같은 ID/revision의 generation 변경. 문서 JSON과 past/future 이력 불변성을 검사한다.
- `pnpm --filter @agent-webcad/web exec tsx --test tests/copilotQuery.test.ts tests/dependencyGraph.test.ts tests/copilotContext.test.ts`: **15 tests, fail·skip 0**. 새 7개와 기존 관계/context 회귀를 함께 실행했다.

이번 변경의 **새 browser fixture·runner 등록, 실제 pointer 검수, 전체 Node/browser, production build는 미실행**이다. A3의 **643 Node / 38 workflows·799 checks**는 이전 기준선의 전체 결과이며 현재 변경의 전체 통과 수로 사용하지 않는다. 현재 검증 요약은 [checkpoint JSON](../verification/G5-B1-CHECKPOINT-2026-10-09.json)에 기록한다.

## 아직 확인하거나 개선할 경계

- 실제 browser에서 empty/잘못된 선택, 측정·관계 표시, locked/누락 참조, 선택·문서 변경, pending Cancel/late response, activity 왕복, 재조회·수동 도구 인계를 검증해야 한다. 현재 UI를 완료 검증했다고 보고하지 않는다.
- Query 결과가 길어졌을 때 Read/Cancel과 기존 Plan/Apply의 내부 스크롤·pointer hit-test·가독성을 확인해야 한다. 현재 스타일은 기존 PropertySection을 사용한다.
- 관계 오류 요약은 현재 immediate source의 누락을 감지한다. 더 깊은 upstream 누락과 변수/binding 오류의 대상별 진단 전달은 후속 검토가 필요하다. 상세 graph를 읽기 결과에 무제한 넣지 않는다.
- Cancel/deadline은 해당 reader의 대기를 끝낸다. 공유 중인 kernel measurement/cache 작업을 강제로 종료하지 않는다. 동기 snapshot/graph 계산 중에는 timer가 실행될 수 없으므로 30초는 hard CPU interrupt가 아니다.
- 반환 대상/bytes를 제한했지만 공통 Query는 raster를 제외한 전체 문서 snapshot·graph를 만든다. 전체 문서 크기에 비례하는 CPU/메모리 비용은 남으며 이번에 latency/heap benchmark를 하지 않았다.
- 저장 모델과 serialization v14는 변경하지 않았다. 새로운 저장 필드는 없다. 기존 A1–A3·문서/이력 회귀를 최종 전체 검수에서 다시 실행해야 한다.

## 다음 재시작

1. 이 checkpoint와 `PROJECT-STATE`, `NEXT-STEPS`, 작업 트리 상태를 읽는다. 기존 변경을 reset/checkout/clean으로 지우지 않는다.
2. `apps/web/tests/copilotQuery.browser.html/.tsx`를 만들고 `apps/web/scripts/browserChecks.mjs`에 등록한다. 실제 React·Worker·native pointer로 위의 Query workflow를 검증한다. fixture에서 결정적으로 지연을 제어하고 실제 provider 지연과 구별한다.
3. 실패한 UI/세션을 수정한 뒤 집중 Node/browser, 전체 Node/browser, 타입·architecture/import·문서 링크, workspace build를 실행한다.
4. 검증 결과와 지원 경계를 문서에 갱신하고 **B1만 마감**한다. B2 allowlist 편집 확대는 별도 요청으로 둔다.
