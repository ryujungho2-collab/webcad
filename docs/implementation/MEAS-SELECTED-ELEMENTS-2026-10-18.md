# MEAS 후속: 면·모서리 지정 측정

2026-10-18

Direct Select의 기존 topology key를 기준 A와 대상 B에 고정한다. 두 유한 면 또는 두 유한 모서리의 3D 최단거리와 원본 BRep 위의 실제 측정점을 표시한다. 같은 솔리드 안의 서로 다른 요소도 허용한다. 기존 whole-solid hover 측정은 유지한다.

## 구현

- `selectedDistance.ts` 커널 연산은 원본 params-local 형상에서 키를 해석한 다음 각 객체의 전체 world transform을 적용한다. 면은 기존 shapeToMesh fingerprint와 일치해야 하고, 모서리는 기존 9점 curve fingerprint를 해석한다. 탐색 순번은 저장하지 않는다. orientation 중복은 IsSame으로 제거하고 누락·모호한 키는 거부한다. 참조 탐색은 16384개로 제한한다.
- 삼각형·표본은 기존 선택 참조 해석에만 사용한다. 거리와 witness는 BRepExtrema_DistShapeShape가 trimmed native face/edge에서 계산한다. Boolean 교집합이나 솔리드 재료 분류는 수행하지 않는다. 동일 객체의 다른 요소를 허용하고, 동일 요소 중복·혼합 종류는 UI 상태 서비스에서 거부한다.
- Worker protocol `selectedDistance`와 서비스 `measureSelectedDistance`를 추가했다. 임시 native handle은 finally에서 해제하고 원본 retained shape 캐시는 재사용한다. 입력·출력은 복제한다. 호출별 AbortSignal은 기존 Worker 취소·재시작 경로를 사용한다.
- Direct 모드 패널에서 선택을 A/B에 고정한다. 선택 면·모서리는 청록/보라색으로 강조하고 실제 A/B 위치와 좌표를 표시한다. overlay는 카메라 이동을 추적한다. 한 면당 4096개 이하의 표시 삼각형을 강조한다.
- 문서 generation 변경은 결과를 즉시 숨기고 참조 재해석·재계산을 시작한다. 이전 요청은 abort하고 결과 게시를 차단한다. Undo/Redo에서도 같은 경로를 사용한다. Direct 종료·프로젝트 전환은 컴포넌트와 고정을 해제한다. 초기화/Escape도 고정을 지운다.
- 숨김·잠금·분해 표시·클리핑은 거부한다. BRep edge pick도 숨김·잠금 레이어를 제외하도록 보완했다.

## 제한

지원은 면↔면 및 모서리↔모서리의 3D 최단거리다. 혼합 종류, 투영·축별 거리, signed penetration, 지속 문서 저장은 제공하지 않는다. 기존 geometry fingerprint는 영구 위상 명명 체계가 아니다. 형상 편집으로 키가 변경되거나 서로 다른 형상이 같은 키를 가지면 추측하지 않고 재선택을 요청한다. 닫힌 곡선의 기존 edge fingerprint 충돌도 모호성 검사로 거부한다. 커널 허용 오차 1e-6 mm는 보증 오차 구간이 아니다.

## 검증

- Node 관련 회귀 52개 통과: 선택 거리 6, BRep 13, 유한 도형 18, Worker 15.
- 실제 브라우저 11개 통과: Direct Select 면·모서리 선택·고정·강조·측정점, 문서/이력 불변, 이동·Undo, 형상 변경 후 참조 거부·Undo 복구, 초기화, Escape, 960px 화면.
- 기존 BRep 브라우저 회귀 16개 통과. 전체 패키지 빌드 및 architecture 검사(683 modules) 통과.
- `output/verification/selected-distance/native-report.json`과 면·모서리 화면 PNG 두 장 저장, 960px 화면 육안 확인.
- 원본 곡면, 비균일 scale, 잘못된 참조 후 재시도, 취소, 동일 객체 측정 및 혼합·중복 거부 검증.

사용법: [측정](../features/MEASUREMENTS.md).

검증 기록: [manifest](../verification/MEAS-SELECTED-ELEMENTS-2026-10-18.json).
