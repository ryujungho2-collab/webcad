# B1-F3 source 교체 후 변수/수식 바인딩 재연결

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. **변수 바인딩 소비자 범위를 구현했다.** 이로써 B1-F 해치·연속 치수·바인딩 재연결이 모두 끝났다.

Binding 재연결은 윤곽 교체 뒤 변수 바인딩의 target을 검토된 결과 하나로 옮긴다. 결과에 같은 바인딩 가능 파라미터가 있어야 하며, 의미가 바뀌면 명시적 재지정을 요구한다. 스케치 구속 바인딩은 ID가 보존되므로 route 없이 유지된다.

## 사용과 검토

윤곽 편집에서 바인딩 행이 보이면 결과를 하나 고른다. 여러 조각·점·변 지정은 받지 않으며, 미리보기는 원본·History를 바꾸지 않고 유효 preview에서만 Apply/Enter를 허용한다.

Apply는 원본 교체, 바인딩 target 재지정, 수식값 적용과 downstream 재생성을 하나의 transaction에 담는다. 바인딩 ID·수식·변수는 유지되며, 교체 뒤에도 수식이 값을 계속 구동한다. Cancel/Escape는 detached plan만 폐기한다. 문서가 바뀐 stale plan은 적용할 수 없다. Undo/Redo는 관계와 결과 ID까지 복원한다.

## 공개 명령 계약

새 명령 없이 기존 `referenceRoutes`에 `binding` 종류를 추가했다. feature 바인딩 requirement는 교체 대상을 직접 가리킬 때만 생기며, route는 정확히 하나의 전체 결과를 지정한다. 스테이지 문서의 바인딩 가능 목록에 같은 파라미터가 없으면 원본/History 변경 없이 실패한다.

바인딩 편집분은 features/sketches/scenes와 함께 반환되어 같은 transaction에 반영된다. 새 document field는 없다. serialization v14를 유지한다.

## 검수

새 Node 4개(`bindingReconnection.test.ts`): 분할 arc의 구동 반지름 인계와 값 유지, 의미 변경 시 Break/Convert/Join 거부, Trim 분할 인계와 분할 지정 실패, 스케치 구속 바인딩의 route 없는 유지. 독립 값 기대값, detached preview 원본 불변, 한 History entry와 Undo/Redo·serialize/deserialize를 검사했다. 기존 해치·연속 치수 테스트의 바인딩 기대값은 새 메시지로 갱신했다.

새 `bindingReconnection` native Edge/CDP workflow 13 checks: 실제 React/Worker에서 선택 게이트·미해결 참조 Apply 차단·단일 조각 인계·수식 구동 유지·한 Undo/Redo·의미 변경 거부·저장 재로드·팔레트 진입을 검사했다. fixture만 공개 명령으로 준비하며 실제 조작은 키·포인터를 사용한다.

최종 검수 수치와 로그는 [마감 증거](../verification/B1-F3-CLOSEOUT-2026-10-09.json), 통합 현재 상태는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다. 전체 Node 755개에는 같은 트리의 병렬 세션 테스트 2개가 포함된다.

## 남은 경계

- 패턴 생성 member 위의 바인딩은 별도 route 없이 오늘과 같이 유지된다. 패턴 자체의 분리·편집 정책을 따른다.
- 결과에 같은 파라미터가 없으면 조용히 끊지 않고 전체 명령이 실패한다.
- 새 대형 문서 latency·실무자·GPU/VRAM benchmark는 없다. 기존 large chunk warning은 유지한다.
