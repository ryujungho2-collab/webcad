# G6-A2 모델 뷰 저장·호출 UI

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. [G6-A1 저장 계약](G6-A1-MODEL-VIEWS-2026-10-09.md)에 실제 Ribbon·검색·카메라 연결을 구현했다.

## 사용자 작업

View 탭 → **Model views**에서 현재 카메라에 이름을 붙여 **Save current view**로 저장한다. 저장 목록에서 선택한 뒤 **Recall view**, **Rename view**, **Update view from camera**, **Delete view**를 실행한다. 새 저장의 기본 이름은 기존 이름과 겹치지 않는다. 중복 이름이나 실패는 입력과 기존 데이터를 보존하고 오류를 보여준다. Escape/Close는 저장 작업을 추가하지 않고 닫는다.

Ctrl+K에서 Model views 관리 창을 열거나 `Recall view · 이름`으로 저장 뷰를 직접 호출한다. 기존 Top/Front/Right/Isometric과 Fit도 유지하며 관리 창 안에서도 실행할 수 있다. Top/Front/Right는 3D에서 정투영으로 전환하고 Isometric은 선택한 투영을 유지한다. Perspective/Orthographic 전환은 기존 View 탭을 사용한다.

Recall은 저장한 projection·world eye/target/up·zoom·near/far·프레이밍을 복원하고 3D workspace를 연다. 저장할 당시 2D 카메라도 정투영 snapshot으로 저장되며 Recall 시 작업면을 바꾸지 않는다. 활성 스케치가 있으면 Recall/표준 모델 뷰 변경을 막고 먼저 Finish sketch를 안내한다. 저장은 현재 카메라의 snapshot이다.

생성/이름 변경/카메라 갱신/삭제는 A1의 공통 CadCommand·transaction·History로 기록한다. Rename은 저장 카메라를 바꾸지 않으며 Update는 현재 카메라로 명시적으로 교체한다. Recall·표준 뷰·Fit·창 열기/닫기는 문서나 History를 바꾸지 않는다. 파일의 v15·이전 문서 호환은 A1을 유지한다.

## 카메라 연결과 수정

CadViewport는 현재 OrbitControls target에서 카메라 snapshot을 캡처한다. Recall은 App의 workspace/projection과 실제 카메라·OrbitControls·TransformControls의 camera 참조를 함께 맞춘다. React의 투영/작업 모드 변경 후 한 번만 적용하며, workspace 전환 애니메이션을 취소하고 남은 orbit/pan 관성을 지운다. 이후 일반 pan/orbit/zoom과 picking도 같은 활성 카메라를 사용한다.

Top의 up 축이 보기 방향과 평행하던 기존 구성을 Y up으로 바꿔 정확한 평면 방향을 사용한다. resize는 정투영의 수직 프레이밍과 프레임 중심을 유지해 비대칭 저장 프러스텀을 가운데로 덮어쓰지 않는다. 새 aspect의 수평 범위 변경은 A1 adapter 계약을 따른다.

변경 위치: `App.tsx`, `AppShell.tsx`, `Ribbon.tsx`, `paletteCommands.ts`, `CadViewport.tsx`, `ModelViewsDialog.tsx`, `modelViews.css`. 모델 객체 transform/geometry·작업면·레이어 표시를 저장 뷰 UI로 수정하지 않는다.

## 실제 검수

신규 native Edge/CDP **modelViews 24 checks**는 실제 App/React/Worker에서 Ribbon 진입·원근 저장·Top/Front/Right/Isometric·Fit·정투영 저장·Recall·이름 변경·중복 실패·Undo/Redo·2D에서 검색 Recall·원근 복원·Update·파일 재열기·Delete/Undo·검색 관리 진입을 실행한다. 조작은 native 키/포인터이며 저장/호출 결과의 실제 카메라 world→NDC를 독립 좌표와 비교한다. Recall 뒤 여러 rendered frame을 기다려 애니메이션/관성 덮어쓰기도 검출한다.

매 단계 최종 모델의 모든 persisted modeling field를 비교해 geometry/배치/스케치/레이어가 불변임을 확인했다. 이전 wheelNavigation 11, sessionContinuity 24, commandExperience 27을 함께 재실행해 **4 workflows / 86 checks**가 통과했다. 전체 Node **764개 / 54 suites / fail·skip 0**, 타입·architecture **362 modules**·문서 링크·workspace production build 통과. 전체 browser suite나 실무자/GPU benchmark를 실행한 것은 아니다. [마감 증거·로그](../verification/G6-A2-CLOSEOUT-2026-10-09.json)를 따른다.

## 후속

Section/crop·layer visibility preset, 3D 조립/분해, 모델 연관 도면·출력, RVT/IFC·외부 adapter는 후속이다. 다음 1차 CAD 후보는 [건축·기계 목표](../product/ARCHITECTURE-MECHANICAL-MILESTONE.md)의 수치 편집 pilot이며 자동 시작하지 않는다. 저장 뷰 UI는 외부 provider 환경 없이 동작한다.
