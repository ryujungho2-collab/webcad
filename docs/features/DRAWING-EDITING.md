# 정밀 작도와 편집

[기능 가이드](README.md) · [단축키](../product/SHORTCUTS-AND-NAVIGATION.md) · [확장 계획](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md)

이 문서는 2D 도형·곡선·스케치·치수와 참조 편집의 지원 범위를 모은다. 입체를 만드는 과정은 [솔리드 모델링](SOLID-MODELING.md), 파일 교환은 [도면과 출력](DRAWINGS-OUTPUT.md)을 따른다.

## 작성과 정밀 입력

선·다중선·사각형·원·호 외에 3점 원/호, 두 끝점+반지름 호, 정다각형, 접선 작성 pilot, 타원/타원호, nonperiodic spline/NURBS를 지원한다. 각 작성 방식은 입력 조건과 유한 구간이 맞아야 한다.

좌표·길이/각도·단위, 상대/극좌표·Ortho와 스냅을 사용한다. 끝점·중점·중심·교점·수직·접선·최근점·그리드·사분점·연장 등의 스냅은 지속되는 스케치 구속과 다르다. 추적점은 Shift+A, 방향 잠금은 Shift+L, 복수 후보 전환은 Shift+N, 해제는 Shift+R, 일시 스냅 억제는 Alt다. 상세 키 적용 범위는 단축키 문서를 따른다.

XY/XZ/YZ 외에 저장 작업면을 활성 UCS로 사용한 Line/Circle·로컬 Move pilot이 있다. 모든 작도 도구의 임의 UCS 지원을 뜻하지 않는다. 문서 재열기는 WCS에서 시작한다.

## 곡선을 이어서 편집하기

**Modify → Curve workflow**에서 선택한 도형을 가져오거나 대상을 고른다.

1. Offset/Trim/Extend/Fillet/Chamfer/Join과 거리·반지름을 선택한다.
2. 필요한 구간·끝점·남길 가지를 고르고 결과 preview를 확인한다.
3. 참조가 있는 경우 치수·작도·해치·구동 바인딩 등의 결과 대응을 검토한다.
4. Apply 후 Join result/Offset result/Trim·Extend result로 작업을 이어간다. 적용된 결과에 Enter를 반복해도 중복 적용하지 않는다.

| 편집 | 현재 범위와 제한 |
| --- | --- |
| Fillet/Chamfer | 직선·line–arc·arc–arc 및 지원되는 닫힌/열린 mixed 코너. D1/D2·유지 가지·bounded 접점 조건을 확인한다. 모든 소유 객체·곡선 조합을 지원하지 않는다. |
| Break/Explode/Join | 일반 root 도형의 분할/정확한 선·호 분해와 재결합, 명시적 참조 재연결. 스케치/패턴 소유 Break는 별도 제한이 있다. |
| 정점·변 편집 | 일반 다중선과 지원 스케치의 삽입/삭제·열기/닫기, 일반 도형의 직선↔호 전환. 스케치에는 solver/구동 치수·참조 계약을 적용한다. |
| Lengthen/Stretch | 열린 선/호/다중선 길이·원호 포함각, 영역에 들어온 정점/끝점 편집. 완료된 스케치 Stretch는 solver를 유지한다. 블록은 전체 envelope 포함 시 이동하고 부분 포함은 해체/정의 편집으로 인계한다. |
| 블록 해체·복사 | 단일 instance의 1단계/재귀 해체. 기준점 Copy/Paste는 독립 drawing pilot이며 모든 객체의 범용 문서 간 복사는 아니다. |

**Modify → Edit polyline / Lengthen / Stretch**가 해당 편집 진입점이다. active sketch의 Stretch는 Finish 후 사용한다. 잠금·참조 충돌이나 모호한 대응은 전체 변경을 거부할 수 있다.

## 타원·스플라인

타원은 정확한 축·유한 domain 원본을 사용한다. **Draw → Spline / NURBS**에서는 degree·control points·knots·weights·domain을 입력한다. 기존 원본의 pole/weight/domain을 편집할 수 있으며 degree/knot structure/pole 수 변경은 새 원본으로 만든다.

스플라인 첫 범위는 degree 1–8, 최대 256 poles, 양수 weights, nonperiodic finite domain이다. 닫힌 비주기 곡선도 포함한다. periodic/fit-only 입력, 범용 Bezier node editor나 전체 spline solver 완료가 아니다. 정확 원본과 화면/출력 근사는 [도면과 출력](DRAWINGS-OUTPUT.md#형식별-지원과-손실)에서 구분한다.

## 구속·치수·작도 관계

스케치 구동 치수·변수는 원본을 바꾸고, 일반 선형/반지름/지름/각도·연속 치수는 측정 원본을 표시한다. 각도 치수는 측정 가지를 명시한다. 저장된 작도점/선·원호 교점·중점/수직이등분선은 원본 관계를 유지하며 필요한 경우 정의를 다시 지정한다. 관계를 끊거나 옮기는 편집은 Review의 대응과 오류 이유를 확인한다.

## 구현·검증 근거

- [기본 편집](../implementation/BASIC-CAD-CORE-EDITING-2026-10-04.md), [Curve workflow](../implementation/CURVE-WORKFLOW-2026-10-04.md), [구간 Trim·참조](../implementation/CONTOUR-TRIM-REFERENCES-2026-10-04.md).
- [line–arc/열린 코너](../implementation/B2-C2-OPEN-END-CORNERS-2026-10-11.md), [arc–arc](../implementation/B2-C-ARC-CORNERS-2026-10-10.md), [스케치 Stretch](../implementation/B2-E-SKETCH-STRETCH-2026-10-10.md), [혼합 스케치](../implementation/B1-E2-MIXED-SKETCH-EDITING-2026-10-11.md).
- [접선·기준점 복사·UCS](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md), [타원](../implementation/X2-A-EXACT-ELLIPSE-2026-10-11.md), [spline/NURBS](../implementation/SPLINE-NURBS-OUTPUT-2026-10-13.md).
- 세부 B0–B4/X1–X5 카드별 실패/검증은 [구현 기록 색인](../implementation/README.md), 변수·구속의 개발 계약은 [변수/수식](../architecture/VARIABLES-AND-EXPRESSIONS.md)과 [스케치](../architecture/PARAMETRIC-SKETCH.md)를 따른다.
