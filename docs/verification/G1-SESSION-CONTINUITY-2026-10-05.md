# G1 명령 전환·History·포커스 검증

> **현재 기능 설명:** [프로젝트와 저장](../features/PROJECTS.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

검증일: 2026-10-05. G1의 첫 구현 묶음이다. 전체 interaction model이나 실무 사용자 평가 완료를 의미하지 않는다. 이전 [G0](G0-ARTBOARDS-2026-10-05.md)의 아트보드·관계 검증을 보존한다.

## Before와 선정 근거

App의 keydown 경로는 Pattern/Contour/Extrusion 세션에서 조기에 반환했다. `data-cad-editor` 패널·직접 핸들은 일반 단축키를 막았고 도구 form은 버블링도 중단했다. 따라서 같은 Ctrl+Z가 캔버스·패널·도구별로 달랐다. `Duplicate → Linear Array → Fit preview → Ctrl+Z`를 네이티브 Edge 입력으로 실행한 새 검사에서 12초 조건 대기 후 실패했다. 문서 History는 1에 머물렀고 Fit preview에 포커스가 남았다. 근거는 `tmp/g1-before-session-browser.log`다. 실무자의 과제 시간이나 이전 순수 계산 지연을 측정한 수치는 아니다.

`clearCommandTools`에는 돌출이 포함되지 않았고 Extrude 진입도 모든 기존 도구를 정리하지 않았다. Construction에서 Extrude로 전환하면 두 편집 세션이 함께 남을 수 있었다.

## 변경과 유지한 복구

- `input/shortcutRouter.ts`: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y를 공통 라우팅한다. 숫자·텍스트·select·contenteditable와 modal dialog의 자체 키보드 범위는 유지한다.
- `App.tsx`: capture에서 문서 History를 처리해 개별 form의 버블링 차이를 제거한다. 버튼·단축키가 동일한 Undo/Redo 함수를 사용한다. 실제 History 변경이 성공했을 때 도구 초안·돌출을 정리하고 선택·캔버스 포커스와 읽을 수 있는 다음 행동을 복원한다. pending 문서 명령이면 기존 busy guard를 사용한다.
- 도구 전환은 돌출도 취소하며 이전 workspace로 복귀한다. Extrude 진입은 이전 도구를 정리한다. Pattern Cancel과 Object/Direct 전환 후 캔버스에 포커스를 돌린다.
- `CadViewport.tsx`: History 이동 시 잡고 있던 pointer capture와 선택 chooser를 취소한다. 살아 있는 source의 직접 편집·치수 review는 입력을 유지한 stale 복구 경로를 보존한다. Apply와 ghosts는 document version 검사로 차단하며 `Start a new drag` 또는 `Refresh preview`를 명시적으로 사용한다. source가 제거되면 기존 selection invalidation으로 review를 닫는다.

처음 전체 회귀에서 직접 편집의 stale review를 닫는 변경이 기존 복구 검사를 깨뜨렸다. 해당 동작을 보존하도록 구현을 수정했고 기존 43개 직접 편집 검사가 통과했다. 기존 테스트의 의도를 약화하지 않았다. geometry·solver·reference remap·serialization·History snapshot 원본 구조는 바꾸지 않았다.

## 실제 사용자 workflow

`기존 profile 선택 → Duplicate → Pattern 미리보기 → Fit → Undo → 원본 선택·캔버스 포커스 → Redo → 복제 결과 선택`을 실행한다. 숫자 입력창 안의 Undo는 입력값만 복원하며 Cancel은 원본/History를 유지한다.

같은 흐름을 Curve workflow / Break / Construction / Extrude의 실제 패널과 Tab으로 선택한 실행 컨트롤에서 반복한다. 이어서 `Construction → Extrude → Line`, 그리기 중 Undo, 숫자를 입력한 Scale 중 Undo, `Direct → Tab → grip → Undo/Redo`, 살아 있는 원본의 review → Undo → stale 복구를 검증한다. Modal 컨트롤의 Ctrl+Z가 배경 도면을 변경하지 않는지도 확인한다. setup fixture를 제외한 작업 입력은 `/__browser_input`의 실제 CDP pointer/keyboard 입력이다.

`sessionContinuity`는 정식 runner에 등록되어 있으며 24개 검사다. 동일 과제를 배경 1,000개 문서에서도 실행한다. 큰 fixture는 기존 editPerformance 방식처럼 JSON serialize/deserialize로 검증한 load fixture이며 생성 비용은 작업 지연에서 제외한다.

## 검증

최종 전체 Node **546개/50 suites**, browser **23과제/478검사**, architecture **248모듈**이 통과했다. 소스와 G1 추가 테스트의 strict 타입 검사 및 전체 production build가 통과했다. main 902.85kB / Viewport 593.25kB minified의 >500kB 경고는 유지한다. 배경 1,000개 집중 검사 24개는 전체 browser 수에 중복 합산하지 않는다. [PROJECT-STATE](../../PROJECT-STATE.md)의 G1 로그를 따른다. 핵심 증거:

- `tmp/g1-before-session-browser.log`: 수정 전 네이티브 실패.
- `tmp/g1-session-browser.log`: 작은 문서의 집중 검사.
- `tmp/g1-large-session-browser-final.log`: 배경 1,000개 문서의 24개 검사.
- `tmp/g1-direct-browser.log`: 기존 직접 편집 43개.
- `tmp/g1-final-node.log`, `tmp/g1-final-browser.log`: 전체 회귀.
- `tmp/g1-types.log`, `tmp/g1-test-types.log`, `tmp/g1-final-build.log`, `tmp/g1-final-architecture.log`: 타입·빌드·구조.

```sh
pnpm --filter @agent-webcad/web test:browser -- --page=sessionContinuity
pnpm --filter @agent-webcad/web test:browser -- --page=sessionContinuity --session-count=1000
pnpm --filter @agent-webcad/web exec tsc -b
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web test:browser -- --artifacts
pnpm --filter @agent-webcad/web check:architecture
pnpm build
```

Production tsconfig는 src만 포함한다. 새 `sessionContinuity.browser.tsx`와 `shortcutRouter.test.ts`는 별도 strict tsc로 확인했다. 모든 기존 테스트의 타입 검사로 확대했다고 주장하지 않는다.

## 측정 조건과 한계

Edge headless / SwiftShader / 로컬 Vite에서 동일한 작은 profile+복제와 배경 0/1,000개 fixture를 사용했다. runner는 `output/benchmarks/g1-session-0.json`, `g1-session-1000.json`에 각 도구 enter/Undo/Redo 관측 지연을 저장하며 재실행 시 갱신한다. 아래 첫 검수 표본의 원본은 `tmp/g1-final-browser.log`, `tmp/g1-large-session-browser-final.log`다. 당시 최종 표본은 각 runner를 순차 실행했으며 fixture 생성·App startup은 측정 밖이다. 네이티브 입력 전송·25ms polling/settling이 포함되며 네 가지 서로 다른 작업을 각각 한 번 측정했다. p95·순수 계산 시간·input-to-paint·실무 과제 시간으로 해석하지 않는다.

| 배경 객체 | 도구 진입 범위 | Undo 범위 | Redo 범위 |
| --- | --- | --- | --- |
| 0 | 124.5–131.9ms | 69.0–75.0ms | 68.9–72.4ms |
| 1,000 | 209.3–274.9ms | 196.9–225.3ms | 173.5–213.3ms |

Before는 Undo 자체가 완료되지 않았으므로 “지연 N% 개선”을 산출하지 않는다. 큰 문서의 전체 clone/restore와 Explorer 재렌더링 병목을 분리 측정하거나 최적화한 작업도 아니다.

## 첫 묶음 당시의 G1 경계와 후속 상태

- 실제 기계/건축 사용자의 작업 시간·예상 밖 재시도·오류 복구 성공률은 아직 측정하지 않았다. 자동 회귀의 성공을 전문 작업 경험 완료로 취급하지 않는다.
- 첫 묶음은 selectionMemory가 History 깊이를 키로 쓰는 제한을 남겼다. 같은 날 [G1 후속 검수](G1-HISTORY-IDENTITY-2026-10-05.md)에서 105회 복제 뒤 잘못된 선택 복원을 재현하고 상태 토큰·WeakMap으로 수정했다. 분기·다중 선택·topology 변경·같은 ID 파일 open을 검증한 결과와 최신 전체 수치는 후속 문서를 따른다.
- 모든 도구의 공통 session owner, 정밀 필드 전환, 구조화된 오류 대상, original/result navigation, 관계 수량 History는 남는다. 이번 capture 라우팅은 기존 architecture의 작은 공통화다.
- 좁은 화면·접근성 전반·작도 정의 재편집·branch repair와 unsupported 관계 adapters는 기존 audit의 제한을 유지한다.
- G2는 아트보드 프레임/배경·Fit·개별 출력이다. 후속 History 기술 검수 뒤 G2 첫 묶음으로 진행하며 실무자 평가는 별도로 남긴다. 이 첫 세션 작업에서 벡터·이미지·LLM·외부 adapter를 시작하지 않았다.
