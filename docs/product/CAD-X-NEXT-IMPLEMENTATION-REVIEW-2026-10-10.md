# CAD X 다음 구현 검토 — X1-B1 완료 이후

2026-10-10. X3-B1에 이어 [X1-B1 두 끝점+반지름 원호](../implementation/X1-B1-ENDPOINT-RADIUS-ARC-2026-10-10.md)를 구현·검수했다. 당시 다음 권장은 **X1-B2: 시작점+시작 접선 방향+끝점 원호**였다. 아래는 당시 검토다. 2026-10-11 X1-B2/B3·X4-A1·X5-A/B pilot을 [구현·검수](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md)했으며 다음 제품 실행은 G6-D1이다.

| 후보 | 현재 기반 / 필요한 작업 | 판단 |
| --- | --- | --- |
| X1-B1 | exact chord/radius 계산·중심/방향 선택·단위/상대좌표/스냅·Review·기존 arc 저장·일반/면 sketch 연결 | 완료 |
| X1-B2 | 이번 [작성 도구](../../apps/web/src/viewport/EndpointRadiusArcTool.tsx)의 세션/스냅/Review와 [명령의 arc 변환](../../apps/web/src/state/endpointRadiusArcCommands.ts)을 재사용. oriented tangent 계산·퇴화 판정·입력 UI 필요 | 2026-10-11 완료 |
| X1-B3 | B2 fillet 원/접점 계산을 참고. 두 직선 도메인·지정 반지름·복수 중심 후보의 독립 작성 도구 필요 | 2026-10-11 완료 |
| X3-C | live graph/명시적 재지정은 있다. 이등분선·외접원·내접원별 정의·검증·cache·문서 버전·Inspector 역할 추가 필요 | 별도 하위 카드 |
| X3-B2/B3 | CAD ellipse/Bezier/spline exact 원본과 parameter domain·중근/overlap·잔차·영구 해 identity가 필요 | 해당 X2 이후 |

## X1-B2 권장 범위와 계산 계약

입력은 시작점 S, 끝점 E, **방향 있는 시작 접선** 단위 벡터 T다. 첫 범위는 deg/rad 접선 각도 수치와 두 끝점 좌표/포인터로 제공한다. 선택 직선에서 방향을 읽는 기능을 추가한다면 직선 방향/반대 방향을 명시하며, 원본 이동을 따라가는 live 접선 관계로 저장하지 않는다.

N을 T의 왼쪽 법선, D=E−S로 놓으면 중심은 C=S+kN, k=(D·D)/(2D·N)이다. 큰 좌표는 S 기준 이동 후 길이를 정규화해 계산한다. D·N이 tolerance 안에서 0이면 유한 원이 없고 직선 극한이므로 오류를 표시한다. 일치 끝점·비유한 입력·잔차/각도 정밀도 초과도 draft를 유지하며 거부한다.

k>0이면 CCW, k<0이면 CW로 시작 접선의 **전진 방향**을 만족하는 signed sweep을 고른다. B1의 중심 좌/우와 CW/CCW dropdown을 그대로 복사하지 않는다. 선택한 접선 방향을 유지하면 진행 방향은 계산 결과다. 접선을 반대로 뒤집으면 같은 지지 원에서 반대 방향의 complementary sweep이 된다. Review는 중심·반지름·실제 시작 접선·끝점·signed 각도와 minor/major를 표시해야 한다.

## 구현과 완료 조건

1. 순수 `startTangentArc` 계산을 추가하고, 시작 tangent가 입력 T와 같은 방향인지와 두 끝점/반지름 잔차를 독립 검증한다.
2. 기존 arc 작성 명령의 plane/sketch/face/layer 분기를 공통화할지 검토한다. 추가 작성 방식은 center/radius/startAngle/endAngle로 환원하고 geometry kind·파일 버전을 늘리지 않는다.
3. 접선 각도 deg/rad, 단위·상대/극좌표 끝점, 공통 스냅을 연결한다. 수치/포인터 draft 변경·외부 문서 변경은 Review를 취소하고 Apply는 한 Undo다.
4. CW/CCW·minor/major·반원·역방향 접선·회전/큰 좌표·접선과 chord 평행·일치 끝점·근퇴화를 검증한다.
5. standalone XY/XZ/YZ·일반/면 sketch·잠금/미해결 면·저장/복원·grip/반지름 driver·닫힌 profile 돌출·DXF·아트보드 출력과 기존 B1/3점 작성 UI를 검수한다.

X1-B1/B2/B3 세 카드가 모두 끝나야 X1-B 전체 완료다. X1-B2를 신규 곡선(X2)이나 live 3점 참조 작도(X3-C)와 함께 구현할 필요는 없다.
