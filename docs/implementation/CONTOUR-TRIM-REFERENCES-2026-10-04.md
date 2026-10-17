# 구간 Trim과 참조 재연결

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-04. `자르기 → 재결합 → 치수·돌출 갱신`을 같은 공개 명령과 검토 세션으로 연결했다. 최신 전체 검수는 [PROJECT-STATE](../../PROJECT-STATE.md), 후속 작업은 [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다.

## 사용 흐름

Modify → **Curve workflow** → Trim에서 대상과 경계를 고른다. 닫힌 대상은 **Picked interval / bounded boundary**를 자동 선택한다. 열린 윤곽의 중간을 없앨 때도 이 범위를 선택한다. **Free ends / supporting boundary**는 기존 자유 끝부분 Trim을 유지한다.

1. **Pick target branch**로 없앨 구간 안쪽을 클릭한다. 실제 경계의 교점 사이 구간을 제거한다. 경계의 무한 연장이나 단순 접촉은 구간을 자르지 않는다.
2. 캔버스에서 황색 원본, 초록 결과, 빨강 제거 구간을 확인한다. 직선 재연결을 선택하면 제거되는 면적도 반투명 빨강으로 표시한다.
3. **Reconnect references**에서 스케치 구속·치수·작도·패턴·솔리드가 사용할 결과와 참조 부분을 지정한다. 점/끝점, 직선 모서리, 해석 곡선, 열린 윤곽의 끝점 간 span을 구분한다. 교점은 저장된 branch를 유지하거나 명시적으로 바꾼다. 선택한 점·모서리는 파랑으로 표시된다. 검토에서 구속·치수·작도·중첩 패턴 인스턴스·투영·돌출의 영향과 치수/부피 변화를 확인한다.
4. Apply는 검토한 제안과 ID를 한 번 적용하고 결과를 선택한다. 독립 윤곽을 열거나 두 조각으로 나눈 경우 **Reconnect gap and Join result**로 잘린 끝점을 직선으로 연결하고 결합한다. Join에서도 치수·솔리드의 참조를 다시 지정한다. 각 단계는 한 Undo다.
5. 살아 있는 돌출 원본은 닫혀 있어야 한다. 이 경우 **Reconnect a closed source with a straight edge in this edit**를 선택해 자르기·끝점 연결·참조 갱신·솔리드 재생성을 한 제안과 한 Undo로 적용한다. 열린 원본과 오래된 솔리드를 함께 저장하는 중간 상태는 허용하지 않는다.

Esc는 점을 고르는 단계만 종료하고 캔버스 포커스를 유지한다. Cancel은 기하·참조·History를 바꾸지 않는다. 재연결 방식이나 대상/클릭 위치가 바뀌면 참조 선택을 초기화하여 다른 결과에 이전 모서리 번호가 적용되지 않게 한다.

## 계산과 저장 계약

- `trim-contour`는 하나의 일반 선·호·원·사각형·선/호 다중선과 여러 경계를 받는다. 열린 경로는 한두 조각, 닫힌 경로는 하나의 열린 조각을 만든다. 닫힌 경로의 시작점을 가로지르는 제거 구간도 정확한 원호로 계산한다. UI는 한 경계 객체를 받으며 여러 구간의 다중선을 경계로 쓸 수 있다.
- 교점·구간 분할·직선 재연결은 해석 기하에서 계산한다. 모델 허용오차와 화면 픽셀 선택 반경을 구분한다. 겹치는 경계, 거의 접하는 정점, 교점 자체의 클릭, 다른 평면/높이, 퇴화 결과와 재연결 선의 자기 교차·접촉은 거부한다. 한 Trim은 최대 65,536 구간 쌍을 검사한다.
- `join-drawings.bridges`는 연결할 객체의 start/end를 명시한다. 가까운 끝점을 추측하지 않는다. 기존 Join은 브리지가 없으면 연결된 두 개 이상의 열린 윤곽을 요구한다.
- `referenceRoutes`는 교체 전 객체와 종속 객체, 결과 조각과 선택 모서리를 지정한다. 누락·중복·오래된 결과·잘못된 치수 방향·잠긴 종속 객체는 전체 편집을 거부한다. 공개 입력에서 모서리를 선택한 뒤 저장에는 안정된 `sourceSegmentId`를 사용한다. 배열 위치를 영구 참조로 쓰지 않는다.
- 변경되지 않은 해석 모서리의 ID는 재배열·방향 반전에도 유지한다. 잘린 모서리와 연결선에는 새 위상을 부여한다. 치수의 방향·간격·문자/반지름 지시각과 객체의 레이어·보조 형상 설정을 보존한다.
- 선형/반지름 치수와 live Extrude/Revolve/Sweep/Loft 입력의 재연결을 지원한다. Extrude는 공개 API에서 여러 조각으로 연결할 수 있으며 최종 닫힘 검증을 통과해야 한다. 다른 솔리드 입력은 역할과 순서를 보존하는 한 결과를 요구한다. 원본 재생성은 공용 트랜잭션에서 수행하며 실패는 문서와 History에 남지 않는다.

## 스케치·작도·패턴 관계 연속성

- 같은 소유 스케치의 Trim/Join은 새 기하를 소유 스케치에 교체하고 구속 슬롯의 point/segment/curve 참조를 다시 연결한다. 기존 constraint/dimension ID와 유지 가능한 topology ID를 보존한다. 결과를 임시 고정해 solve하고, 임시 구속을 제거한 정상 DOF로 다시 계산한다. 구동 치수 변경은 투영과 live 솔리드를 갱신한다.
- 선의 각도 관계는 Join 뒤 같은 polyline 안의 서로 다른 안정된 segment ID를 참조할 수 있다. 호 조각이 허용오차 안에서 같은 원을 이루면 analytic arc/circle로 정규화한다. 혼합 선/호 bulge 결과를 표현할 수 없는 스케치 경로는 전체를 거부한다.
- Construction은 객체 ID에 더해 참조 부분과 endpoint-span 의미를 저장한다. 중점→수직이등분선→교점은 재연결 후 연쇄 재계산되며, signed branch를 잃으면 전체 제안이 실패한다. 의미를 임의의 가까운 점으로 바꾸지 않는다.
- Linear/Radial/Mirror 및 중첩 패턴의 recipe/spec/slot/instance ID를 유지하며 최종 root source에 연결한다. 자식 치수·작도 참조는 같은 결과 의미를 따라가고 live 돌출은 유지된 instance ID에서 재생성된다. 서로 다른 두 source가 같은 결과로 합쳐져 instance identity가 모호해지거나 잠긴 종속 레이어가 바뀌면 거부한다.
- 위 과정은 detached proposal 안에서 실행된다. 검토→Apply가 같은 준비 결과를 게시하고 한 Undo를 만든다. 구속/치수/작도/패턴/투영/돌출 중 필수 참조 하나라도 해결되지 않으면 원본과 History를 변경하지 않는다.
- JSON v6는 Construction element/span 및 polyline 내부 angle segment 참조가 필요할 때 사용한다. 이전 v1–v5 파일을 계속 읽으며, 새 참조가 없는 문서는 필요한 이전 버전으로 저장한다. v6 의미를 v5로 낮춰 읽는 것은 거부한다.

## 공통 검토 UX

Curve/Pattern/Construction은 내부 스크롤과 고정된 하단 실행 영역을 사용한다. Fit/Apply/Cancel이 영향 검토 아래에 가려지지 않는다. `commandInteraction`이 현재 draft와 검토 key, 문서 version, 필요한 입력, unresolved 관계, validation 및 preview 표시 준비를 판정한다. 버튼과 Enter는 같은 `canApply`를 사용한다. SketchInspector의 구동 치수도 검토 후 Apply하며, 검토한 값을 수정하면 이전 계획을 적용할 수 없다.

명령 검색과 우클릭 Workflow는 같은 명칭/순서와 진입 불가 사유를 사용한다. 결과를 선택하고 조건에 맞는 Edit Sketch / Inspect Construction / Edit Pattern / Extrude 동작을 제공한다. 오류 시 도구와 입력을 유지하고 복구 안내를 표시한다. 일반 오류 문구에서 복구 안내를 분류하는 경로도 있어 모든 오류가 구조화된 topology 진단을 제공하는 상태는 아니다.

## 지원 경계

Trim/Join 결과는 적용 당시의 편집 가능한 기하다. 영구 Trim 정의나 절삭 피처를 추가한 것은 아니다. 재연결은 직선이며 원호 코너 처리와 곡률 연결은 후속이다.

완료된 소유 스케치의 Trim/Join은 지원하지만, active sketch의 편집은 먼저 마친다. 패턴 인스턴스·파생 작도 좌표의 직접 덮어쓰기와 변수 바인딩 source 교체, 해치/연속 치수·블록 관계 재연결은 지원하지 않으며 안전하게 거부한다. 다른 소유 스케치나 독립 곡선과 소유 곡선의 Join도 거부한다. 일반 곡선, 작도 정의의 전용 재편집기, 모든 도구의 통일된 정밀 입력/hover 세부 진단은 후속이다. 단독 삭제의 기존 치수 동결 정책은 유지한다.

## 검수와 구현 위치

새 Node 17개는 공개 페이로드, 중간 Trim→명시적 Join→치수 갱신, 닫힌 모서리의 면적·돌출/회전 부피, Sweep 입력 순서와 스파인 갱신, 정확한 선/원·원/원 교점, 원 시작점의 순환 구간, XY/XZ/YZ·높이·측량 좌표·회전/스케일/반전, 접선·정점 접촉·재연결 자기 접촉, 실패 원자성, 같은 제안/ID, Undo/Redo와 재열기 후 다음 편집을 검사한다.

브라우저 과제는 실제 React/Worker와 네이티브 마우스/키보드로 중간 제거→참조 선택→취소/재실행→재결합, 열린 돌출 원본 거부→직선 재연결→치수/부피 검토→적용→Undo/Redo·저장·후속 편집을 확인한다. 자동 통과는 실무자의 작업 시간/재시도 평가를 대신하지 않는다.

- 계산: [trimContour](../../apps/web/src/features/drawing-editing/geometry/trimContour.ts), [contourBridges](../../apps/web/src/features/drawing-editing/geometry/contourBridges.ts), [contourTopology](../../apps/web/src/features/drawing-editing/geometry/contourTopology.ts).
- 정책·명령: [contourReferences](../../apps/web/src/features/drawing-editing/commands/contourReferences.ts), [contourCommands](../../apps/web/src/features/drawing-editing/commands/contourCommands.ts).
- 공통 치수: [dimensionSource](../../apps/web/src/precision/dimensionSource.ts), [dimensionRefresh](../../apps/web/src/state/dimensionRefresh.ts).
- 화면·회귀: [CurveWorkbench](../../apps/web/src/features/drawing-editing/ui/CurveWorkbench.tsx), [Node 회귀](../../apps/web/tests/drawing-editing/contourTrim.test.ts), [브라우저 흐름](../../apps/web/tests/contourTrimWorkflow.browser.tsx).

후속 관계 통합 검사는 [contourRelations](../../apps/web/tests/drawing-editing/contourRelations.test.ts) 12개다. 마지막 검사는 닫힌 스케치·Construction chain·중첩 패턴·자식 치수·원본/자식의 두 live 돌출을 한 Trim/직선 재연결 transaction으로 갱신하고, 한 Undo/Redo·v6 재로드·후속 구동 치수 변경을 검증한다. [interactionRelations](../../apps/web/tests/interactionRelations.browser.tsx)는 실제 명령 검색→Trim→잘못된 참조→오류 수정→Apply→Join→스케치 인계와 이후 치수 변경을 runner에서 실행한다.

2026-10-06 B3-B 후속: 일반 **지름 주석**도 circular reference 선택·Trim/Join 재연결·source scale에서 같은 dimension ID를 유지한다. [diameterDimension](../../apps/web/tests/diameterDimension.test.ts)은 원→Trim→원호 edge→Join→지름 갱신·v13·Undo/Redo·실패 원자성을 검증한다. 기존 v6 관계 계약은 유지하고, 일반 지름이 포함된 파일만 v13을 사용한다. [장면·DXF·지름 실제 기록](G4-CAD-BASICS-2026-10-06.md)을 따른다.

이전 검토 이미지: `output/images/cad-trim-middle.png`, `output/images/cad-trim-closed.png`. `tmp/trim-final-*`은 이전 519 Node / 20 browser 결과다. 최신 전체 결과는 PROJECT-STATE를 따른다. 경로 index 최적화 전후 수치와 측정 한계는 [성능 기록](../verification/INTERACTION-PERFORMANCE-2026-10-04.md)에 보존한다.
