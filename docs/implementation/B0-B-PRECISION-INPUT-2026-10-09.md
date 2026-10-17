# B0-B — 정밀 입력과 포인터 확정의 일치

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

갱신일: 2026-10-09. 기본 작도와 점 기반 Move/Copy/Rotate의 입력 일관성을 구현했다. 최종 검수 상태는 [마감 증거](../verification/B0-B-CLOSEOUT-2026-10-09.json), 실행 큐는 [NEXT-STEPS](../../NEXT-STEPS.md)가 소유한다.

## 지원 범위와 수정

- `resolvePointInput`은 길이/각도 활성 필드를 구분한다. 길이는 mm/cm/m/in/ft, 각도는 deg/°/rad를 기존 parser로 변환한다. 절대 `U,V`/`#U,V`, 상대 `@ΔU,ΔV`, 극좌표 `distance<angle`/`@distance<angle`는 명시적 입력으로 처리한다.
- 점 기반 Move/Copy의 숫자 preview, Enter, 클릭 확정은 같은 endpoint를 계산한다. Tab으로 길이를 잠근 뒤 입력한 각도를 길이로 해석하던 결함과, 포인터 클릭이 숫자 endpoint를 덮어쓰던 결함을 수정했다. Rotate의 숫자 각도도 클릭 시 보존하며 잘못된 각도로 포인터 값에 fallback하지 않는다.
- Line/Polyline/Rectangle/Circle/Arc는 `resolveDrawingPointInput`으로 숫자 preview와 확정 계산을 공유한다. Rectangle의 접두어 없는 `폭,높이`/`폭x높이`와 명시적 좌표를 구분한다. Arc의 시작점 입력과 다음 반지름/회전각 입력을 구분하며 변경된 반지름도 preview에 사용한다.
- 작도 중 잘못된 Tab 입력은 buffer·활성 필드·잠금을 유지한다. 미완성 부호·잘못된 단위·음수 길이·잘못된 좌표는 적용하지 않는다. Backspace로 고칠 수 있고 오류 draft를 정상 preview로 표시하지 않는다. 입력 중 포인터 이동은 숫자 draft를 덮어쓰지 않는다.
- Polyline의 다음 변과 Arc의 다음 입력 단계에서는 필드와 잠금을 초기화한다. 수치를 표시용 자릿수로 반올림해 모델에 다시 저장하지 않는다. XY/XZ/YZ의 동일한 world/plane 변환을 사용한다.
- 상대 좌표 덧셈 overflow, 비유한 polar 값, `#길이`처럼 의미가 잘못된 입력을 거부한다. Arc의 잘못된 새 반지름을 이전 반지름으로 대체하지 않는다.

모델·공개 명령·serialization schema는 변경하지 않았다. Preview/오류 입력은 원본·History를 바꾸지 않으며 게시와 잠금·구속·재생성 검증은 기존 공개 CAD 명령을 사용한다. 기존 휠/단축키 작업의 수정은 보존했고 이번 변경으로 취소하거나 되돌리지 않았다.

## 검수

새 Node 검사 8개는 세 작업면의 unit/polar/pointer-lock 일치, unrounded 좌표, 활성 angle 필드, 미완성/잘못된 입력, overflow, 사각형 치수/좌표 의미, 호 반지름/회전각을 독립 수치로 대조한다.

`precisionInput`은 실제 App/React/Worker와 Edge headless CDP 키·포인터를 사용한 새 workflow다. 15 checks로 오류 Tab의 draft/History 보존→수정→Enter, 길이 잠금과 각도 Enter, Undo, 포인터 이동 후 숫자 클릭 확정, invalid Enter, 상대 극좌표, XZ/YZ 작성/Move, Rectangle 클릭 확정, Arc 오류 반지름·수정, Copy를 검사한다. 검사용 시작 버튼은 실행 후 숨겨 실제 상태바 조작을 가리지 않게 했다. runner의 native 키 허용 목록에 상대·극좌표 기호를 추가했다.

최초 전체 browser 실행의 `interactionRelations`가 line-circle tangent 다음 UI 조건에서 timeout했다. 실패 로그는 `output-b0-b-browser.log`에 보존한다. 같은 workflow의 독립 재실행은 17 checks를 통과했다. 최종 전체 재실행 결과와 타입·architecture·build 근거는 마감 JSON에 기록한다.

## 경계

이 완료 범위는 기본 작도와 점 기반 변환이다. primitive 속성의 지름/길이 reviewed editing pilot, 사용자 UCS/면 작업면, 일반 곡선·호 구속 확대, B0-C 표시/잠금/출력은 별도 카드다. Rectangle의 기존 폭/높이와 Arc의 기존 sweep 문법을 좌표 문법으로 재해석하지 않는다. 신규 대형 문서 latency, 실무자 입력 장치 평가, GPU/VRAM benchmark는 실행하지 않았다.
