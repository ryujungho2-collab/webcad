# G5-A2 — Copilot 패널 draft와 요청 context 수명

> **현재 기능 설명:** [Copilot](../features/COPILOT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-08. 기준선 `d1cce60`. G5-A1의 gateway 응답 검증·취소 경계와 공통 CAD detached Preview/Apply를 유지하면서, 패널 탐색과 요청 시점의 입력 수명만 검수했다. 실제 LLM 공급자·API 키·서버는 연결하지 않았다.

## 발견과 변경

- Copilot 패널은 다른 Explorer activity를 열면 언마운트되었다. 패널 내부 `useState`에 있던 prompt·planner mode·gateway URL이 재진입 시 초기화되어, App에 남아 있는 계획과 화면의 입력이 달라졌다. 세 입력을 App 수명의 제어 상태로 옮겼다. 문서나 브라우저 저장소에는 gateway URL 또는 키를 기록하지 않는다.
- 기존 요청은 문서 버전만 비교했다. 요청 중 선택, 작업면, 활성 레이어가 바뀌면 이전 대상과 설정으로 받은 답을 새 화면에서 Apply할 여지가 있었다. 요청 시작 시 문서 ID/revision/generation, 선택 ID와 표시 이름, 작업면, 레이어, prompt, planner mode/endpoint를 복사한다. 검토 패널에 문서·작업면·레이어·선택 대상을 표시한다. 변경을 감지하면 요청을 중단하고 기존 plan/ghost를 버리며 이유와 Plan 재시도를 안내한다. 응답 수신 후와 detached preview 완료 후에도 같은 context를 다시 비교한다.
- 사용자가 다른 activity를 보는 동안 context가 그대로라면 응답은 App에 보존된다. Copilot으로 돌아오면 같은 prompt·URL·검토 결과를 이어서 볼 수 있다. 문서 교체·수정, 선택·작업면·활성 레이어·prompt·planner 설정 변경은 late response가 Apply 상태를 되살리지 못한다. Apply 직전에도 context를 검사한다.

공통 `commandInteraction.canApply`와 `previewCadCommand`/`applyCadPlan`을 그대로 사용한다. 로컬 규칙과 mock gateway 모두 같은 결과 경로로 간다. 응답 allowlist(최대 20개 finite drawing/primitive), 기존 검증·원자성·Undo/Redo는 넓히지 않았다.

## 실제 사용자 흐름과 검증 경계

`Gateway 설정 → Prompt → Plan → 다른 activity 탐색 → Copilot 복귀 → 영향 검토 → Apply → Undo/Redo`를 실제 React/Worker/헤드리스 브라우저에서 확인한다. 별도 검사는 요청 중 선택·작업면·레이어·모드·문서 교체와 늦은 응답을 재현한다. 기존 gateway 검사는 잘못된 응답, prompt 수정, 명시적 Cancel, 멈춘 body 해제와 복구를 유지한다. 기존 trust 검사는 문서 교체 뒤 단위 없는 stale Apply 대신 plan이 즉시 폐기되고 prompt·오류 안내가 유지되는 결과를 확인한다.

집중 결과: [context Node](../../apps/web/tests/copilotContext.test.ts) 2개, [context browser](../../apps/web/tests/copilotContext.browser.tsx) 15개, 기존 gateway browser 13개, trust browser 15개가 통과했다. 전체 검증 수치는 [PROJECT-STATE](../../PROJECT-STATE.md)와 [검증 요약](../verification/G5-A2-CLOSEOUT-2026-10-08.json)에 기록한다.

이번 묶음은 앱 실행 중의 draft 보존이다. 브라우저 재시작 간 gateway 설정 저장, 실제 공급자 연결, Apply 중 중복/경합·잠금·부분 실패는 포함하지 않는다. 이는 **G5-A3**에서 검수한다. 성능 지연 측정도 수행하지 않았다.
