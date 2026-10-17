# B3-C1 — 일반 각도 치수의 계산·표시 기하

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-08. 기준선 `22720aa`. 사용자가 각도 치수 구현을 우선 요청하여 G5-A2/A3는 대기 상태로 보존하고, 작은 세션의 첫 CAD 단계 B3-C1을 구현했다. **일반 각도 치수 UI/명령/저장 기능은 아직 미완료**다. [실행 분할](../WORK-SLICES-2026-10-06.md), [B3-C 하위 계약](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md)을 따른다.

## 계산과 측정 가지 계약

[angularDimension.ts](../../apps/web/src/precision/angularDimension.ts)의 `measureAngularDimension`은 두 직선 변과 명시적인 branch를 받아 문서 변경 없이 해석적 교점·각도를 반환한다. `resolveAngularDimension`은 같은 측정 결과에서 정확한 치수 원호와 표시 선분·접선 화살표·문자 위치를 만든다. 문서/React/Worker 의존성은 없다.

- 입력: 각 변의 `kind`, `workPlane`, ordered `start/end`. 직선만 허용한다. 원호/bulge 변 또는 다중선 전체를 chord로 바꾸지 않는다. C2a에서 기존 world/profile geometry의 **선택한 직선 변**을 이 입력으로 전달해야 한다.
- 같은 XY/XZ/YZ 평면이며 실제 elevation이 같아야 한다. 평면 이름만 같은, 높이가 다른 두 선이나 기울어진 선은 거부한다. 허용오차 내 좌표 반올림은 같은 평면으로 처리한다. 공통 elevation은 교점·호·문자·모든 선분에 보존된다.
- 교점은 유한 선분을 연장한 supporting line에서 구한다. 유한 구간 밖의 교점도 유효하며 `extensions.first/second`에 기록한다.
- `firstRay/secondRay = +1/-1`: 각각 원본의 start→end 방향 또는 반대 방향. `sweep = ccw/cw`: 선택한 첫 ray에서 두 번째 ray까지의 회전 방향이다. 자동으로 작은 각도를 고르지 않는다. 예를 들어 +X와 +30° 선은 같은 ray에서 CCW=30°, CW=330°이며, 두 번째 ray를 반대로 선택하면 CCW=210°/CW=150°다.
- source의 끝점 순서를 뒤집으면서 동일한 측정 영역을 보존하려면 해당 ray 부호도 반전해야 한다. 이 규칙의 순수 기하 검사는 완료했지만 **topology remap 자동 연결은 C2b**다. 별도의 기준점이나 화면상의 좌우로 branch를 자동 교체하지 않는다.
- `angleRadians`는 양수 측정값, `sweepRadians`는 방향을 가진 signed sweep이다. 기본 문자는 degree 소수 2자리이며 text override/주석 radius는 실제 angleRadians를 바꾸지 않는다. 스케치 solver의 구동 각도와 독립적이다.

## 실패와 정확도

기존 `CAD_PRECISION.angularTolerance = 1e-8 rad`와 `linearToleranceAt`을 사용한다. 평행·반평행·일치 선의 0°/180°에는 유일한 꼭짓점이 없으므로 치수호를 임의 위치에 만들지 않는다. 가까운 평행 관계도 각도 허용오차 이내면 거부하며 다른 교차 선 또는 선형 치수 선택을 안내한다.

오류 결과는 `code`, `target`, `reason`을 가진다. 잘못된 branch, curved edge, 다른 평면, 비유한 좌표, 허용오차 이하 선 길이, 평행/일치, 표현 범위를 넘거나 수치적으로 불안정한 교점, 잘못된 표시 radius/scale을 구분한다. 실패 시 NaN 선분이나 임의의 교점을 반환하지 않는다.

정확한 arc와 측정값을 원본으로 반환하고 최대 2° 간격의 arcPoints/segments는 표시 전용으로 만든다. source·측정·저장·후속 export를 이 샘플 점에서 역산하지 않는다. 표시 화살표는 좁은 영역에 맞춰 줄이되 문자 간격은 각도 크기에 따라 줄이지 않는다. [dimensionSymbols.ts](../../apps/web/src/precision/dimensionSymbols.ts)에 기존 치수와 같은 화살표 계산을 공유했고 선형/반지름/지름의 기존 수치·표시를 유지했다.

## 검수

[angularDimension.test.ts](../../apps/web/tests/angularDimension.test.ts)의 새 **10 tests**는 모든 ray/sweep 조합, 3개 작업면/elevation, 구간 밖 교점, 끝점 반전, atan2 경계 회전/반사, 1e9 좌표의 독립 3–4–5 기하, near-parallel/0/180°, unsupported/퇴화/비유한 입력, 호 반지름·끝점·접선 화살표·문자, 좁은 영역과 입력 불변성을 검사한다. 기존 치수·지름을 포함한 집중 **21 tests**가 통과했다.

첫 집중 검사에서 화살표를 줄일 때 문자 간격까지 작아지는 결함이 검출됐다. 두 크기를 분리해 문자를 일정한 거리로 배치하고 동일한 기대값 검사를 통과시켰다. 테스트를 구현에 맞춰 약화하지 않았다.

최종 전체 **628 Node / 54 suites / fail·skip 0**, **기존 browser 35 workflows / 734 checks**, 타입·architecture **304 modules**/문서 링크·workspace build 통과. [검증 요약](../verification/B3-C1-CLOSEOUT-2026-10-08.json)에 환경·명령·workflow별 수를 보존했다. 로컬 로그는 `output/b3-c1-*-2026-10-08.log`다. 이번 browser 검사는 기존 UI 회귀를 확인하며 각도 UI 사용 검증으로 보고하지 않는다. 새 browser workflow는 사용자에게 각도 도구를 연결하는 C3에서 추가한다. 새 기능의 사용자 성능 측정은 아직 하지 않았다. 기존 main/viewport의 >500 kB build 경고는 남아 있다.

## 다음: B3-C2a

두 source/edge의 stable 참조와 위 branch를 typed create/update command에 연결하고 refresh/history를 구현한다. 기존 `DimensionRender.value`는 길이(mm)만 의미하므로 각도(rad)를 같은 필드에 설명 없이 넣지 않는다. source 소멸/평면 변경/퇴화 정책과 atomic preview/한 Undo를 먼저 확정한다. 이어 C2b에서 Trim/Join·serialization을, C3에서 대상 선택·Review/Apply·출력과 실제 browser 사용자 흐름을 완료한다. C1의 순수 함수 결과를 영속 문서의 완료된 기능으로 표시하지 않는다.
