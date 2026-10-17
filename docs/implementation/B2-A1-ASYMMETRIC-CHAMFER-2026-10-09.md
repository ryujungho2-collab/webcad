# CAD B2-A1 — 두 독립 윤곽의 비대칭 모따기

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. `2475221` 기준선에서 사용자의 “캐드공백 매꾸자” 요청으로 기본 수정 공백 하나를 구현했다. 이 카드는 **CAD B2-A의 두 객체 직선 끝부분**이며 Copilot G5-B2와 다른 범위다. 전체 B2나 전체 CAD 기능 동등성 완료가 아니다.

## Before → 발견 → 변경

기존 2D `connect-drawings`는 한 `distance`만 받아 두 변에서 같은 길이를 물렸다. 기계 도면의 서로 다른 모따기 거리와 건축 윤곽의 비대칭 접속은 정확한 두 거리 입력으로 만들 수 없었다. Curve workflow에도 거리 하나만 있고 그 값이 어느 변에 적용되는지 구분할 표시가 없었다.

기존 명령에 optional `secondDistance`를 추가했다. `distance`는 target D1, `secondDistance`는 second curve D2이며 **월드 mm로 supporting-line 교점에서 남기는 가지를 따라 측정**한다. D2 생략은 기존 대칭 동작과 동일하다. Fillet의 한 반지름 및 3D Chamfer 계약은 바꾸지 않았다. Fillet에 D2를 보내거나 0/음수/비유한 값을 보내면 공개 validator가 거부한다.

[connectDrawings](../../apps/web/src/features/drawing-editing/geometry/connectDrawings.ts)의 두 setback을 각각 검증·계산한다. 어떤 값이 어느 retained segment를 소모하는지 D1/target 또는 D2/second curve로 알려준다. 두 source 수정과 새 연결 선은 기존 detached plan·치수 갱신·dependency regeneration·atomic Apply를 그대로 사용한다. 원본 object/topology identity와 고정된 반대 끝은 유지하며 connector는 독립 편집 가능한 선이다.

[CurveWorkbench](../../apps/web/src/features/drawing-editing/ui/CurveWorkbench.tsx)는 PrecisionField 두 개, 대상 이름, Swap D1/D2 및 Use equal distances를 제공한다. 기존 `Workflow distance` selector는 D1에 유지한다. D2 입력은 `Workflow second distance`다. 초기에는 대칭 입력을 유지하고 D2를 직접 입력하면 독립 값으로 편집한다. Swap은 값만 교환하고 대상·선택된 가지는 교환하지 않는다.

캔버스에는 보라색 교점→접속점 거리선과 D1/D2 값을 표시한다. 표시도 명령의 순수 기하 계산을 사용하며 문서를 변경하지 않는다. 수치는 draftKey/reviewedKey에 들어가 이전 preview를 적용할 수 없다. 공통 `commandInteraction.canApply`가 패널과 canvas Enter를 함께 제어한다. 기존 내부 스크롤과 고정 footer를 유지한다.

## 실제 사용자 workflow

1. 두 독립 line 또는 열린 polyline의 직선 끝부분 선택 → Modify → Curve workflow → Chamfer.
2. Target/Second curve 확인. 필요하면 캔버스에서 남길 가지를 각각 선택.
3. D1 `3mm`, D2 `.7cm` 입력 → Fit workflow preview → 대상 이름·보라색 거리선·녹색 결과 검토.
4. Swap 또는 Equal로 같은 계산 경로에서 재검토. D2 `20mm`로 20 mm 끝부분을 소모하면 Apply가 비활성화되고 D2/second curve 오류와 더 작은 값/다른 가지 안내가 나온다. 잘못된 입력에서도 도구는 유지된다.
5. Apply 또는 canvas Enter → 두 수정 source와 connector 선택 → Join result → 정확한 하나의 polyline. 필요하면 Offset/Pattern 등 기존 결과 인계를 계속 사용한다.
6. Cancel은 원본과 History를 보존한다. Apply·Join은 각각 한 Undo이며 Redo 및 JSON 재로드 후 동일 topology와 기하를 유지한다.

## 테스트 증거

신규 Node **8개**와 기존 Curve Node **15개**를 함께 통과했다. 직각/35° 예각/125° 둔각, source 방향 반전·음의 가지·거리 교환, 독립 `sqrt(D1²+D2²−2 D1 D2 cosθ)` 길이 oracle, XY/XZ/YZ의 elevation·회전·반사·스케일을 검증했다. 좌표는 렌더러의 bounds-centre pivot 의미에 맞춰 독립적으로 계산한다.

치수와 중점의 동시 갱신, 원본 topology 유지, preview 원본/History 불변성, 하나의 Undo/Redo, 저장/재로드, D1/D2 소모, 잠긴 downstream dimension, 사라지는 intersection 및 stale Apply의 원자성을 검사한다. 새 [asymmetricChamfer browser](../../apps/web/tests/asymmetricChamfer.browser.tsx)는 runner에 등록되었고 실제 Edge/CDP pointer **18 checks**가 단독 통과했다. 대상/단위/캔버스 거리 비율, Swap·Equal, invalid/stale draft·Cancel·lock/Enter, Apply·Join·선택·Undo/Redo·저장을 포함한다. 전체 검수 결과는 [마감 증거](../verification/B2-A1-CLOSEOUT-2026-10-09.json)와 [PROJECT-STATE](../../PROJECT-STATE.md)에 기록한다.

## 남은 공백

최종 전체 **667 Node / 54 suites**, **41 browser workflows / 877 checks**와 타입·architecture/import/doc links **323 modules**, workspace production build를 통과했다. 기존 40 browser/859 checks를 유지한 채 새 18 checks를 추가했다. main **1,058.73 → 1,059.15 kB**, viewport **619.05 → 621.03 kB**이며 이는 bundle 크기 비교로서 편집 지연 성능 개선 측정이 아니다. 아래 미지원 항목은 그대로 남는다.

- **B2-A2:** 단일 polyline/rectangle의 내부 코너 D1/D2. 현재 Properties의 기존 코너 도구는 대칭 거리만 받는다. 기존 topology/annotation/preview 및 live extrusion 흐름을 조사한 뒤 별도로 확장해야 한다.
- sketch 소유/파생 construction/pattern instance, 인접 호, closed contours와 3D asymmetric chamfer는 이번 두 객체 명령에서 지원하지 않는다. 일반 construction 목적의 독립 두 직선은 기존 동일 layer/purpose 계약을 유지한다.
- source가 다른 layer/소유권/높이/작업면이거나 필요한 downstream reference를 잃으면 전체 거부한다. 모호한 가지를 자동 선택하거나 지원 밖 곡선을 평탄화하지 않는다.
- v14 document 형식은 유지한다. D1/D2는 편집 명령의 입력이며 저장 모델은 기존 두 source 및 정확한 connector 결과다. 별도의 live chamfer recipe나 재편집 feature는 만들지 않았다.
- 대형 문서 성능 benchmark·실무자 평가·실사용 GPU 측정은 이번에 하지 않았다. preview 전체 snapshot 비용, 메인/viewport의 기존 >500 kB 경고와 OpenCascade 전체 WASM은 남는다.
- 기존 G6-A1 저장 뷰 및 건축·기계 전체 도면 목표는 아직 미구현이다.
