# X1-B1 두 끝점 + 반지름 원호

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. Draw Ribbon의 **Endpoint Radius Arc**와 명령 검색의 **Draw endpoint radius arc**를 추가했다.

## 사용과 결과

시작/끝 U,V와 반지름을 입력하거나 viewport에서 끝점을 스냅한다. 끝점은 `@x,y`와 `@distance<angle`, 길이는 mm/cm/m/in/ft를 지원한다. 시작→끝 chord 기준 중심의 왼쪽/오른쪽과 CCW/CW 방향은 별도 선택이며 minor/major·반원·중심·반지름·signed sweep을 표시한다. 직경 조건은 하나의 중심으로 합쳐지고 CW/CCW 반원은 구별한다.

Review는 detached 명령 계획으로 문서와 history를 바꾸지 않는다. Apply는 한 Undo에 정확한 기존 arc 원본을 저장한다. draft 수정과 외부 문서 변경은 이전 Review를 무효화한다. Cancel/Escape는 생성하지 않는다. 해 없음·일치 끝점·각도/좌표 정밀도 한계는 이유와 편집 가능한 입력을 유지한다. 포인터는 실제 ray/작업면 교차와 공통 snapEngine을 사용하며 Alt로 스냅을 우회한다. 작성 중 기존 객체 선택/hover가 세션을 가로채지 않는다.

## 계산·저장·지원 경계

[endpointRadiusArc](../../apps/web/src/precision/endpointRadiusArc.ts)는 chord 중점과 정규화·인수 분해한 중심 높이를 계산하고, signed 진행각을 정한다. 선택 후보 배열이나 화면 샘플로 중심을 역산하지 않는다. endpoint 거리 >2R, 일치/비유한 입력·분해 불가능한 각도·잔차 초과는 거부한다. 모델링 tolerance 안의 직경 경계는 같은 중심으로 처리한다.

공개 `create-endpoint-radius-arc` 명령은 두 world 끝점·반지름·centreSide·direction과 workPlane/선택 sketch/layer를 검증한다. standalone XY/XZ/YZ는 기본 작업면 높이 0, 일반 sketch와 resolved face sketch는 해당 frame을 사용한다. 타 평면·missing/unresolved sketch·숨김/잠금 layer를 원자적으로 거부한다.

저장은 기존 center/radius/startAngle/endAngle arc 형식이며 문서 버전을 올리지 않는다. acquired 끝점은 작성 당시의 값이다. 끝점 원본·중심 후보·반지름 입력 방식의 영구 live 관계는 저장하지 않는다. 이후 기존 grip/스케치 반지름 driver/치수·DXF·아트보드 SVG 경로를 사용한다. 호 자체는 열린 곡선이므로 돌출은 선분 등으로 닫힌 profile을 구성해야 한다.

## 검수

- 신규 Node **14개**: 독립 3-4-5 양쪽 중심·CW/CCW/minor/major·반원·큰 좌표·퇴화·명령 검증·Review/단일 Undo·저장/복원·XY/XZ/YZ·layer 잠금·일반/면 sketch·반지름 driver/topology·닫힌 profile live 돌출 체적·grip·major CW DXF 왕복·아트보드 SVG·stale Review.
- 전체 **928 Node / 54 suites / fail·skip 0**.
- 실제 브라우저 **15 checks**: 단위/상대좌표·중심/방향·preview·해 없음/일치 입력 유지·직경·Cancel·Undo/Redo·외부 변경·실제 포인터 끝점 스냅·sketch·Escape.
- 기존 3점 원/호 **10 checks**, 정다각형 **13 checks** 회귀 통과.
- 타입 검사·architecture **433 modules**·production build 통과. [마감 증거](../verification/X1-B1-CLOSEOUT-2026-10-10.json).

상위 X1-B는 부분 완료다. 다음 권장은 [X1-B2 시작 접선+끝점 원호](../product/CAD-X-NEXT-IMPLEMENTATION-REVIEW-2026-10-10.md)이며, 이번 요청에서 다음 카드를 구현하지 않았다.
