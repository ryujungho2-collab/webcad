# 솔리드 모델링

원본 단면이 유지된 로프트 하나를 선택하면 **Sweep / Loft → 부드러운 곡면으로 / 직선 연결로**에서 같은 모델을 다시 편집한다. 실제 미리보기와 Apply를 거치며 원본 단면 순서·배치·마감을 보존한다. `선택한 로프트를 부드러운 곡면으로 바꿔줘`와 MCP `solid.loft.update`도 같은 기능이다. [사용법·검증·지원 경계](../implementation/LOFT-EDIT-HANDOFF-2026-10-25.md).

[기능 가이드](README.md) · [정밀 작도](DRAWING-EDITING.md) · [건축 벽/콘텐츠](FLOOR-PLANNING.md)

이 문서는 평면 작업면·면 스케치와 기존 솔리드의 수치 편집을 관리한다. 원본·종속 형상을 같은 문서 관계로 유지하며, 표시 측정값을 임의로 모델 driver로 바꾸지는 않는다.

## 재료 보기와 GLB

View 메뉴의 **Material view / CAD edge view**는 솔리드의 모서리 표시를 전환한다. 저장 형상과 Undo는 바뀌지 않는다. 재료는 기존 **Solid finish** 값을 사용한다.

File의 **Export GLB**는 선택한 보이는 솔리드 또는 전체 보이는 솔리드를 정확한 CAD 형상에서 메시로 변환해 PBR 재료와 함께 내보낸다. CAD ID를 node extras에 보존하며 glTF 표준인 m/Y-up으로 변환한다. STEP은 mm/Z-up BRep를 유지한다. 두 출력 모두 조립 좌표를 사용하며 화면 클리핑·분해 위치는 굽지 않는다.

실제 도면→3D 기능 검증 사례는 [2층 카페 3D 변환](../implementation/CAFE-2F-02-2026-10-20.md)과 [열기/편집 안내](../../output/projects/large-cafe/3d/README.md)를 따른다. 역할·높이를 명시한 변환이며 범용 도면 추론이나 양방향 BIM 변환을 뜻하지 않는다.

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

면 기반 Cut/Hole의 양의 깊이는 선택한 BRep 면의 바깥쪽 법선 반대로 재료 안쪽을 절삭한다. 몸체 평균 위치로 방향을 추측하지 않으므로 열린 케이스의 내부 바닥에도 적용한다. 면 경계·실제 재료 제거·유효성을 검사하며, [케이스 검증](../implementation/COPILOT-ENCLOSURE-01-2026-10-19.md)에서 관련 사례를 확인했다.
