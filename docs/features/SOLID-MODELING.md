# 솔리드 모델링

[기능 가이드](README.md) · [정밀 작도](DRAWING-EDITING.md) · [건축 벽/콘텐츠](FLOOR-PLANNING.md)

이 문서는 평면 작업면·면 스케치와 기존 솔리드의 수치 편집을 관리한다. 원본·종속 형상을 같은 문서 관계로 유지하며, 표시 측정값을 임의로 모델 driver로 바꾸지는 않는다.

## 작업면에서 시작하기

Inspector의 **Work planes**에서 이름·원점·X/Y 방향을 입력해 자유 작업면을 만든다. 솔리드의 평면 면을 선택한 뒤 **Attach selected face**로 면 연결 작업면을 만들 수 있다.

원본 변경으로 면 참조가 사라지거나 모호해지면 `missing/ambiguous`를 표시한다. 원본을 다시 표시하고 의도한 새 면을 선택해 **Rebind selected face**로 복구한다. 가까운 면으로 자동 연결하지 않는다. 활성 UCS의 제한된 작성은 정밀 작도 가이드를 따른다.

## 면 스케치·돌출·절삭

1. 평면 면에 작업면을 연결하고 **Sketch on face**를 시작한다.
2. 로컬 2D에서 구속·구동 치수를 사용해 지원되는 닫힌 프로파일을 만든다.
3. **Extrude face sketch**에서 거리를 지정하거나 **Face cut**에서 깊이/Through all을 지정한다.
4. Review의 체적·영향을 확인하고 Apply한다. 절삭은 원본을 숨기고 연결된 Boolean 결과를 만든다.

면 스케치 프로파일 첫 범위는 하나의 닫힌 선/직사각형/다중선 루프 또는 원이다. 다중 영역·홀, 면 스케치의 Offset/Trim/Extend·자유 grip/stretch·자유 회전은 지원 범위 밖이다. **평면도 Make face의 홀 지원과 별개 계약**이다. 면 참조가 끊긴 돌출/절삭은 재연결 전 STEP/STL 출력을 거부한다.

## Hole·Shell·수치 편집

평면 면 기반 Hole은 중심·지름·깊이/관통을, Shell은 제거할 면과 안쪽 두께를 검토한다. 재생성 후 면이 소멸하면 명시적 재지정이 필요하다. 기능별 허용 형상과 거부 조건은 아래 근거를 따른다.

단일 cylinder의 Inspector **Dimensions**에서 Diameter/Radius와 Length를 입력하고 Review한다. 단일 extrusion의 distance도 같은 수치 Review를 사용한다. 스케치의 radius/diameter driver와 변수는 기존 구속/Variables 흐름을 사용하며, 변수에 바인딩된 값을 직접 덮지 않는다.

수치 편집 pilot은 cylinder·기존 sketch driver/변수·extrusion distance 범위다. 여러 primitive의 수치를 한꺼번에 검토하거나 임의 BRep 측정값을 driver로 승격하는 기능은 아니다. 원본 변경으로 잠긴 종속 형상을 바꿔야 하면 전체 편집이 거부된다.

모델을 부품/분해도·단면·시트로 연결하는 방법은 [도면과 출력](DRAWINGS-OUTPUT.md), 벽·문·창의 의미를 유지하는 편집은 [평면도와 건축 콘텐츠](FLOOR-PLANNING.md)를 따른다.

## 구현·검증 근거

- [작업면과 면 참조](../implementation/B5-A-WORK-PLANES-2026-10-10.md), [면 스케치/절삭](../implementation/B5-B-C-FACE-SKETCH-CUT-2026-10-10.md).
- [Hole](../implementation/B5-D-FACE-HOLE-2026-10-10.md), [Shell](../implementation/B5-E-SHELL-2026-10-10.md), [수치 편집](../implementation/B5-F12-NUMERIC-PILOT-2026-10-11.md).
- 개발 시 원본 재생성·rollback 계약은 [파라메트릭 재생성](../architecture/PARAMETRIC-REGENERATION.md)을 따른다.
