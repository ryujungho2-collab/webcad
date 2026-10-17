# B1-E2 호·혼합 스케치 구성 편집

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-11 구현·검수 완료.

## 실제 변경

기존에는 스케치 polyline이 직선 정점만 저장했고, 혼합 line/arc 경로는 스케치 소유 편집에서 거부됐다. Edit polyline 버튼도 호와 bulge 경로에서는 비활성화됐다. 이제 SketchGeometry.polyline의 bulges가 각 안정 segmentId에 대응하는 원호 곡률을 저장한다. bulge는 tan(방향 있는 포함각/4)이며 0은 직선이다. drawing cache와 solver가 이 원본을 사용한다.

- Modify → Edit polyline에서 스케치 호·혼합 경로를 선택한다. Insert vertex는 정확한 원호 위의 점에서 반지름과 방향을 보존하며 둘로 나눈다. Delete vertex는 같은 원의 같은 방향 호를 다시 합친다. 다른 원/직선과 호가 만나는 정점은 암묵적으로 펴지 않고 거부한다. Open/Close는 기존 곡률을 유지하며 마지막 변을 제거하거나 직선 닫기 변을 추가한다.
- Convert edge to arc는 부호 있는 deg/rad sweep으로 선택한 변만 바꾼다. Convert edge to line은 해당 bulge만 0으로 바꾼다. 정점·살아남은 segmentId와 소유 geometryId는 유지한다. 독립 analytic arc는 두 정점의 곡선 polyline으로 정규화하고 기존 끝점/curve ID를 유지한다.
- 기존 구속·구동 치수·construction·profile 참조는 기존 Review의 명시적 재연결을 거친다. 혼합 경로의 각 호 변이 개별 선택지로 표시된다. 같은 원 위의 분할된 호를 UI에서 다시 한 호로 합쳐 보여주지 않는다.
- 반지름/지름과 B4 점-호·선-호·호-호 관계는 geometryId와 선택적 stable segmentId로 혼합 경로를 참조한다. Solver는 비영 bulge를 변수로 포함한다. 직선 변은 원호의 chord로 선 관계에 잘못 포함되지 않는다.
- Sketch inspector는 혼합 경로의 Arc edge 선택과 Radius/Diameter, 외부 곡선과의 관계 추가를 제공한다. 치수 표시·관계 preview·스케치 강조 경로도 원호의 실제 중심·반지름·sweep을 사용한다.
- 구성 편집의 첫 solve에는 일시적 정점/반지름 조건을 걸고 검토한 sweep과 일치하는지 검사한다. 이 조건은 영구 구속으로 남지 않는다. 이후 구동값을 바꾸면 실제 곡률과 live extrusion이 다시 생성된다.
- 혼합 스케치 원본/호 변 참조는 문서 v23으로 저장한다. 이전 버전으로 표시를 낮춘 파일과 잘못된 bulge 배열은 거부한다. 기존 직선 스케치의 파일 버전은 불필요하게 올리지 않는다.

## 구현 위치

- packages/cad-document/src/Sketch.ts, SketchCurves.ts, SketchRelations.ts, serialization.ts: 저장·곡선 해석·참조·버전.
- packages/cad-commands/src/commands.ts, validator.ts: 변 전환 명령 계약·검증.
- apps/web/src/precision/sketchAdapter.ts, sketchSolver.ts, sketchRelations.ts, sketchAnnotations.ts: 원본/투영·solver·표시.
- apps/web/src/features/drawing-editing/geometry/basicDrawingEditing.ts 및 commands/sketchContourReferences.ts: 원호 분할/병합·변 전환·원자적 재연결.
- App.tsx, BasicEditTool.tsx, contourReferenceChoices.ts, SketchInspector.tsx: 활성화·sweep 입력·호 변 선택·구속 생성.

## 검증

전체 Node **961 tests / 54 suites / fail·skip 0**, 신규 동작 검증 **6 tests**. 저장 원본과 렌더용 곡률·major arc·CW 호 분할/병합·stable ID·Undo/Redo·반지름 구동·live extrusion·접선 표시·충돌 원자성·v23 왕복을 검사했다. 독립 원호 → 둘로 분할된 스케치 polyline → 치수 참조 재연결을 검증했고 기존 Join 경로도 혼합 소유 스케치를 지원한다. 돌출 mesh 체적은 독립 원호 segment 면적 식과 tessellation 오차 범위에서 비교했다.

실제 Chromium 물리 입력: editSketchVertices **22 checks** (원호 삽입, 혼합 변 전환, inspector의 선택한 호 반지름 Review/Apply 포함), b4ArcWorkflow **11 checks**. 타입, architecture **438 modules**, production build 통과. 기존의 혼합 경로 거부 기대 두 곳은 지원 확대에 맞춰 실제 성공 동작/무효 연산 거부를 검사하도록 바꿨다.

## 지원 경계

- 타원/스플라인, full-turn 단일 bulge, 다른 곡선을 강제로 합치는 Delete는 지원하지 않는다.
- 호의 저장 종류를 바꾸면 독립 center control은 polyline 정점이 아니다. 그 점을 참조하던 구속은 유효한 결과 점으로 명시적으로 재연결해야 하며 검토 결과와 충돌하면 원본을 변경하지 않는다. 구속을 자동 제거하지 않는다.
- 패턴/Scene 소유 관계의 구성 편집은 기존의 명시적 분리/인계 경계를 유지한다. 구속·driver 유지가 불가능한 호→직선 전환도 원자적으로 거부한다.
- legacy drawing의 스케치 migration 확대, 스케치 Lengthen(B2-F2), 혼합 경로 내부의 두 곡선 선택 UI 확장은 별도이다.

[검수 기록](../verification/B1-E2-CLOSEOUT-2026-10-11.json)
