# B3-G1 스냅 정밀도 · B3-D3 PDF 치수 스타일

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. [B계열 보충 검토](../product/CAD-B-SUPPLEMENT-REVIEW-2026-10-10.md)의 두 우선 카드를 순서대로 완료했다. [마감 증거](../verification/B3-G1-D3-CLOSEOUT-2026-10-10.json).

## B3-G1

`snapEngine`의 선–원 교점은 작도에서 사용하는 투영 기반 `linearCircleBranches`, 원–원 교점은 `circularIntersections`를 사용한다. 선분·무한선·ray의 정의역과 CW/CCW 유한 원호 범위를 공통 정밀도 계약으로 판정한다. 접선의 signed branch 두 개는 작도 참조에서 유지하고, 스냅에서는 같은 물리 위치를 하나로 합친다. 선분 매개변수 차이로 중복을 제거하지 않아 긴 선의 서로 다른 교점을 유지한다. 스냅 우선순위·화면 픽셀 취득 반경·원본 ID와 topology metadata는 유지한다.

길이 1e9의 선, 중심 x=5e8·반지름 5인 원의 교점은 x=499999995와 500000005다. 이전 약 1.074 mm 반지름 잔차를 제거했으며 독립 좌표·반지름 잔차를 검사한다. 반지름 5인 두 원의 중심 거리 10±1e-8은 공통 tolerance 안에서 접선 한 위치로 처리한다. 잘못된 반지름·비유한 입력과 퇴화 선은 교점 스냅 대상에서 제외한다.

## B3-D3

일반 치수의 PDF 글자 높이는 고정 3.5 mm 대신 `resolveDimension().textHeight`를 사용한다. 일반·반지름·지름·각도·연속 치수와 drafting 문자는 모델 mm 크기로 수집한 뒤 같은 출력 ratio로 종이 mm에 변환한다. viewport와 활성 평면 SVG가 사용하는 치수 스타일이 PDF에도 적용된다.

출력 높이 = `textHeight × paperScale × plot ratio`. 높이 6·paperScale 2는 1:1에서 12 mm, 1:10에서 1.2 mm다. fit에서는 계산된 실제 ratio를 사용한다. 기본 일반 치수 높이 4는 1:1에서 4 mm, 1:2에서 2 mm다. 제목만 종이 높이 5 mm를 유지한다. 원하는 종이 높이를 축척과 독립적으로 유지하려면 paperScale에 축척 분모를 지정한다. 스타일은 측정값·원본 기하·구동 치수를 변경하지 않는다.

## 검증과 경계

- 신규 회귀 18개: 큰 좌표·이동된 3-4-5 교점·긴 선의 두 해·접선 경계·원호 endpoint·CW/CCW·XY/XZ/YZ·ray 방향·실제 query metadata·픽셀 반경, PDF 1:1/1:10/fit·SVG 비교·PDF font operator·Undo/Redo·CAD 왕복.
- 통합 Node **946 / 54 suites**, 실패·건너뜀 0. 타입·architecture **435 modules**·production build 통과.
- 실제 브라우저 회귀 **70 checks**: precisionInput 15, angularWorkflow 24, draftingWorkflow 16, x1EndpointRadiusArc 15. 첫 precisionInput 실행은 입력 전달 timeout으로 실패했고 단독 재실행은 통과했다.

문서 스키마와 작도 branch 의미는 변경하지 않았다. 아트보드 주석 포함(B0-C1), DXF 치수 연관성, 전역 스타일 프리셋은 후속이다. 전체 브라우저 suite·대형 도면 성능 측정·외부 PDF 뷰어의 시각 검수는 이번 검수에 포함하지 않는다. 다음 B 보충 권장은 B0-C1이다.
