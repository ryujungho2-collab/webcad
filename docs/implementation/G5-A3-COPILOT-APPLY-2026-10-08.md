# G5-A3 — Copilot Apply·잠금·경합 검수

2026-10-08. 기준선 `7541fd3`. A1의 응답/취소 경계와 A2의 패널 draft/요청 context를 유지하면서 Apply 게시와 결과 인계를 검수했다. 실제 provider·gateway 서버·키는 연결하지 않았다. 전체 실행 결과는 [검증 요약](../verification/G5-A3-CLOSEOUT-2026-10-08.json), 현재 누적 결과는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다.

## 발견 → 변경

- 기존 `applyCadPlan`은 mutation queue에 들어간 뒤 문서 baseline만 확인했다. Cancel signal과 UI의 검토 context를 받지 않아, 대기 중인 Apply를 취소하거나 선택을 바꿔도 적용될 수 있었다. 신규 Node regression 두 개가 수정 전 `Missing expected rejection`과 validation 호출 0회로 실패했다. 공통 plan API에 선택적 signal과 owner validation callback을 추가했다. queue 실행 직후 취소를 확인하고, 게시 직전 동일한 `commandInteraction` 검증·plan ID·context를 다시 검사한다. 그 검사와 동기식 게시 사이에 await는 없다. 기존 호출과 한 번 적용한 plan의 idempotence를 보존한다.
- App의 Apply에는 React 갱신 전에 재진입을 막는 guard가 없었고, 이전 Apply의 완료/finally가 새 계획·pending 상태를 지울 수 있었다. 요청별 sequence와 AbortController, 동기 ref guard를 사용한다. Clear·입력 수정·새 Plan은 이전 Apply를 취소하며, 자신의 sequence를 소유한 작업만 완료 UI를 바꾼다. 문서 변경 무시는 실제 동기 게시 동안에만 적용한다. queue 대기 동안의 변경은 정상 폐기한다. 만료된 plan/비동기 예외도 catch해 안내와 재계획 경로로 돌린다.
- Gateway가 명시한 출력 layer를 그대로 보존하면 검토 context의 활성 layer와 실제 결과 layer가 달라졌다. 요청 layer를 검토 전에 바인딩하고 모든 batch member의 명시적 layer가 일치하는지 확인한다. 다르면 해당 layer를 선택하거나 응답을 수정한 뒤 Plan하도록 안내한다. 다른 layer로 조용히 변경하지 않는다.
- 성공 뒤에는 공통 review의 `completed` 상태와 결과 수, `Inspect result` 인계를 추가했다. 생성 ID를 선택하고 Model tree/Properties에서 다음 편집을 이어 간다. Undo/Redo의 geometry·selection 복원도 검수했다.

## 실제 workflow와 증거

`Gateway 제안 → layer 불일치 오류 → 응답 수정 → Review → queue 대기 Apply → Cancel → 같은 prompt 재시도 → 새 요청으로 교체 → Apply → Inspect result → Undo/Redo`를 실제 CDP pointer/React/Worker에서 검증했다. queue hold는 테스트에서 제어하는 결정적 대기 fixture이고 네트워크 transport는 mock이다. CAD preview·게시·History는 실제 코드다.

- [새 Node 검사](../../apps/web/tests/copilotApply.test.ts) **4개**: 동시 Apply 한 번 게시, queued Cancel의 전체 JSON/history 불변, 게시 시 owner 재검증, 잠긴 대상·레이어와 batch 부분 실패 및 Undo future 보존. 잠긴 대상은 현재 모델의 layer lock으로 보호한다.
- [planner 검사](../../apps/web/tests/copilotPlan.test.ts) 신규 **1개**: 명시적 output layer·batch 불일치 거부와 입력 불변. 기존 local rule profile/extrusion 경로를 유지한다.
- [새 browser 검사](../../apps/web/tests/copilotApply.browser.tsx) **26 checks**: 실제 중복 pointer, Cancel Apply, replacement request, 선택/문서 경합, lock·unlock 재시도, 부분 실패, 실제 plan cache 만료 후 prompt 유지/재계획, active Sketch 차단, result handoff, local rules·gateway Apply/Undo/Redo 및 unhandled rejection 0. 실제 runner에 등록했다.
- 기존 [document plan 검사](../../apps/web/tests/documentPlans.test.ts)의 만료/discard·stale·abort와 A1/A2 browser 검사를 유지한다. browser 만료 검사는 detached proposal을 17개 준비해 실제 bounded cache를 비우며 원본 문서는 변경하지 않는다.

전체 Node **643 tests / 54 suites / fail·skip 0**, browser **38 workflows / 799 checks**가 통과했다. `tsc -b`, architecture/import·문서 링크 **313 modules**, workspace `pnpm build`도 통과했다. 원시 로그는 로컬 `output/g5-a3-*-2026-10-08.log`, 보존하는 수치/경계는 [검증 요약](../verification/G5-A3-CLOSEOUT-2026-10-08.json)에 있다. Main 1,040.79 kB / viewport 618.81 kB의 기존 >500 kB 경고는 남는다. A1 13개와 A2 15개의 browser 회귀도 실제 전체 runner에서 다시 통과했다.

## 지원 경계

Cancel은 아직 게시하지 않은 자신의 Apply를 취소한다. 이미 완료된 게시를 취소하지 않으며 Undo를 사용한다. Cancel 뒤에도 앞선 다른 document 작업의 계산은 계속되고, 취소된 queue 항목은 앞 작업이 끝난 뒤 종료한다. 다른 도구의 장시간 Worker 연산을 중단하는 기능을 추가한 것은 아니다.

Gateway의 finite drawing/primitive 생성 1–20개 allowlist는 유지한다. Local rule의 기존 profile/extrusion은 유지하지만 gateway에 새 편집/Query 명령을 개방하지 않았다. G5-A 검수 완료는 실제 공급자 연결·인증·실서비스 지연·보안 검수 완료를 뜻하지 않는다. 이번에 G5 지연/메모리 benchmark는 수행하지 않았고 기존 큰 build chunk 경고는 남는다. 다음 독립 범위는 **G5-B의 Query와 기존 편집 명령 한 종류**다.
