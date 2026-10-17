# B2-E 스케치 Stretch 구속 유지·충돌 복구

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. 기존 영역 Stretch에 스케치 소유 도형의 계획·solver·Review·Apply와 live dependent 재생성을 연결했다. 별도 명령이나 문서 버전 없이 기존 `stretch-drawings`와 sketch/transform/History 계약을 사용한다.

## 사용

작도 중인 스케치는 먼저 Finish한다. 완료된 스케치의 선·직선 다중선·직사각형·원·원호를 선택하고 Modify → **Stretch**를 연다. 선택 없이 시작하면 활성 작업면의 표시·잠금 해제된 일반 도형, 완료된 스케치 도형과 기존 지원 블록을 후보로 사용한다. 동일 작업면의 일반 도형·여러 스케치·블록을 혼합할 수 있다. crossing area의 두 코너와 displacement를 포인터 또는 U,V 숫자로 지정하며 mm/cm 입력·반대 코너 순서·canvas Enter를 지원한다.

영역 안 끝점/정점과 원의 중심이 요청 대상으로 선택된다. 요청 대상의 실제 이동 좌표를 임시 fixed-point constraint로 pin하고 각 소유 스케치를 복제하여 전체 관계를 푼다. **영역 밖이라도 구속으로 연결된 자유점은 따라 움직일 수 있다.** 구동 치수 값을 바꾸거나 구속을 자동 삭제하지 않는다. 고정되지 않은 구동 폭 100 mm 직사각형의 오른쪽 변을 20 mm 옮기면, 폭은 100 mm를 유지하고 왼쪽 변도 solver를 따라 20 mm 움직일 수 있다. 독립 자유점은 유지한다. Review가 실제 solved 결과와 변경된 연결 도형/작도점의 before/after를 보여준다.

직사각형 한 변의 축 방향 이동은 폭/높이를 바꾸면서 corner/edge IDs와 rectangle 표현을 유지한다. 회전각 기준 축에 맞지 않는 shear나 한 모서리만 움직여 rectangle을 깨는 요청은 명시적으로 거부하며 Edit polyline 구성 편집으로 인계한다. 원은 중심으로 이동하며, 원호의 일부 끝점은 기존 analytic Stretch 계산을 사용한다. 구속은 solver가 다시 검증한다.

## 충돌과 복구

고정점·구동 치수와 요청 좌표를 동시에 만족할 수 없거나 solver가 수렴하지 않으면 Apply를 차단한다. 메시지와 `Stretch constraint conflict` 안내에 스케치 ID, 기존 constraint 종류/ID와 관련 geometry IDs를 제공한다. 사용자는 displacement/영역을 조정해 다시 Preview하거나 Cancel → Edit Sketch에서 명명된 구속을 검토한다. 이 과정에서 원본과 History는 변하지 않으며 구속을 자동 제거하지 않는다.

예: 원점이 고정되고 폭 100 mm인 직사각형의 오른쪽 변을 20 mm 옮기면 width/anchor 충돌로 거부한다. 위쪽 변의 높이를 10 mm 늘리도록 입력을 바꾸면 폭·원점을 유지한 채 복구된다. 여러 스케치 중 하나가 충돌하거나 연결 projection/live solid layer가 잠겨 있으면 일반 도형·다른 스케치·블록을 포함한 전체 batch를 거부한다.

## 보존·재생성

모든 스케치 group을 clone에서 푼 뒤 임시 pin을 제거하고 원래 constraints를 그대로 복원하여 재검증한다. 영구 geometry/point/segment/curve IDs, dimensions, bindings와 소유 관계를 유지한다. 변경 projection과 잠금/패턴 정책을 먼저 검사하고 전체 결과를 한 번 게시한다. 원래 스케치 전체의 solved geometry에서 drawing cache를 갱신하므로 요청에 직접 포함되지 않은 연결 geometry도 Preview/Apply가 일치한다.

기존 common transaction이 construction·연관 치수·profile·돌출과 live solid를 재생성하고 실패 시 원자적으로 복구한다. Preview·Cancel은 immutable proposal만 사용하며 stale baseline은 Apply를 거부한다. 한 Undo/Redo와 JSON 저장·재열기는 geometry·구속·종속 형상을 함께 복원한다. 임시 Stretch pin은 파일에 남지 않는다.

## 지원 경계

- XY/XZ/YZ의 기존 스케치 로컬 좌표와 동일 작업면의 crossing area/displacement를 사용한다. 사용자 UCS·기울어진 스케치 평면은 별도 작업이다.
- 현재 active sketch는 Finish 후 Stretch한다. 직접 드래그의 허용 자유도 투영과 달리 Stretch는 입력한 displacement를 정확한 요청으로 사용하므로 충돌 시 명시적으로 거부한다.
- placement transform이 적용된 스케치 projection, pattern instance, construction 소유 파생 도형은 원본/owner 편집 또는 명시적 reset/detach가 필요하다.
- rectangle의 shear/종류 변경, 스케치 mixed bulge 구성, 독립 주석 Stretch와 스케치 Lengthen 확대는 포함하지 않는다. B2-D 블록의 전체 포함/부분 포함 의미는 유지한다.

## 검수

새 Node 10개는 자유 끝점·coincident 이웃·독립점·stable topology, rectangle edge 변경·midpoint·실제 extrusion volume, width/anchor 충돌과 자유 높이 복구, 혼합/여러 스케치 원자성, XY/XZ/YZ, circle/arc, shear/transform/잠금/빈 영역, stale·임시 pin 제거·Undo/Redo·JSON, 고정되지 않은 구동 폭의 solver 이동과 live solid 잠금을 확인한다.

native Edge/CDP 실제 App/Worker **sketchStretch 19 checks**는 스케치 선택 게이트·solver 정책·detached preview·연쇄 작도점·영역 마커·단위 오류/복구·Cancel/포커스·반대 코너/canvas Enter·topology·구속·live solid 관계·한 Undo/Redo·JSON·명명된 충돌/Apply 차단·자유 높이 복구를 검사한다. 기존 **blockStretch 18 + basicEditWorkflow 24**도 통과했다. 전체 browser suite·대형 스케치 latency·GPU benchmark는 재실행하지 않았다. 최종 **819 Node / 54 suites / fail·skip 0**, 대상 native browser **3 workflows / 61 checks**, architecture/import·문서 링크 **384 modules**·workspace 타입/production build 통과. main **1,143.83 kB / gzip 346.08 kB**, viewport **655.54 kB / gzip 178.04 kB**, 기존 large chunk 경고 유지. 최종 수치와 build/architecture/import·문서 링크 결과는 [마감 증거](../verification/B2-E-CLOSEOUT-2026-10-10.json)를 따른다.
