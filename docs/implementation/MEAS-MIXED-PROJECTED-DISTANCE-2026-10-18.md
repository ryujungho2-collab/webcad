# MEAS 후속: 면↔모서리 혼합과 투영·축별 거리

2026-10-18

Direct Select의 A/B 지정 측정에 면↔모서리 조합과 월드 XY/XZ/YZ 투영 및 X/Y/Z축 최소 간격을 추가했다. 기존 면↔면·모서리↔모서리와 동일 객체 내 서로 다른 요소도 모든 모드를 사용할 수 있다.

## 계산 계약

모든 모드는 선택한 두 유한 요소에서 독립적으로 최소화한다. 3D 최단점 쌍의 성분을 보고하는 방식이 아니다. 축 간격은 절댓값이며 투영이 겹치면 0이다. 작업 평면과 카메라에 독립적인 월드 좌표 기준이다. 참조는 기존과 같이 params-local 형상에서 재해석한 다음 전체 월드 transform을 적용한다.

3D는 기존 OCCT DistShapeShape 경로를 유지한다(커널 허용 오차 1e-6 mm). 투영은 singular BRep를 만들지 않도록 버리는 축에 양의 작은 가중치를 적용한다. 원본 선택 요소의 optimal native bounds로 공통 원점을 정하고 재중심화한 후 비특이 GTransform으로 가중 형상을 만든다. DistShapeShape로 점 쌍을 구하고 역변환한 점을 원본 요소에 native vertex-to-element distance로 재투영하여 실제 원본 위의 witness를 얻는다. 삼각형·AABB 거리를 결과로 대신하지 않는다. 면의 trim과 구멍도 원본 native 형상에서 유지된다.

가중치 epsilon은 최대 0.001, 최소 0.00001로 제한하며 최대 3회 정련한다. 각 탐색의 가중 최소거리 q와 두 요소 간 누락 축 최대 간격 H로 `max(0,q-epsilon*H-1e-7)`의 수치 하한 추정을 얻는다. 실제 원본 witness의 모드별 간격은 상한 추정에 사용한다. 이전 탐색의 더 좋은 원본 witness와 하한을 보존한다. 목표 오차 0.001 mm 안에 추정 폭이 들어오면 수치 수렴, 아니면 근사값으로 표시한다. 하한과 실제 간격의 모순 또는 원본 witness 복원이 목표 오차보다 크면 근사값으로 내려 경고한다.

이 추정은 OCCT extrema 및 GTransform의 수치 정확도에 의존하며 **보증 구간이 아니다**. 매우 큰 누락 축 간격은 epsilon floor 때문에 목표 오차에 도달하지 못할 수 있다. 이런 경우 근사값으로 명시한다. 모든 정련이 실패하면 오류를 반환하고 다른 metric 결과로 대체하지 않는다. signed clearance/penetration은 제공하지 않는다.

## UI와 수명 관리

- 동일 종류 제한을 제거하고 거리 모드 select를 추가했다.
- 모드를 결과 키에 포함한다. 전환·문서 변경 시 이전 결과는 즉시 숨기고 요청을 abort하며 새 결과만 게시한다.
- A/B는 원본 위의 실제 witness, P는 A 기준 선택 metric의 투영 보조점이다. 회색 연결선과 청록 metric segment를 구분한다.
- 상세에 모드별 목표 오차, 수치 추정 구간, 수렴/근사 상태, 원본 witness 복원 보정과 경고를 표시한다.
- 모든 native temporary handle은 finally에서 해제한다. Worker 취소·재시작, retained source cache, Undo 재검증과 문서 읽기 전용 계약을 유지한다.
- 모드 검증은 서비스와 커널 양쪽에서 수행한다. 솔리드 전체 hover의 projected metric은 이번 변경 대상이 아니다.

## 검증

- 관련 Node 회귀 60개 통과: 지정 측정 14, BRep 13, 유한 도형 18, Worker 15.
- 독립 투영 최소점 대조: 3D 최근접 점 쌍의 XY 성분은 2.5 mm이지만 별도 XY 최소값은 0 mm인 사례.
- 6개 모드의 해석 가능한 edge 거리, 양방향 혼합, 높이 차, 곡면 위 witness, survey 좌표, trimmed face 구멍, 큰 누락 축 범위의 근사 상태 검증.
- 실제 브라우저 모드 전환·혼합 지정·투영 보조선·높이·Undo·960px·Worker 취소와 재시도 검증.

사용법: [측정](../features/MEASUREMENTS.md).

최종 검증: 실제 브라우저 25개와 기존 BRep 16개 통과. 전체 패키지 build와 architecture 검사(683 modules) 통과.

검증 기록: [manifest](../verification/MEAS-MIXED-PROJECTED-2026-10-18.json).
