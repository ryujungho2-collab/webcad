# X3-B1 원/호 live 교점

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. 원–원·원–호·호–호 교점을 기존 Construction 작성과 Inspector 재지정 흐름에 연결했다.

## 저장과 계산

- 두 원본의 순서를 보존한다. 첫 중심→둘째 중심의 왼쪽은 positive, 오른쪽은 negative이며 `branchBasis: center-line`으로 선 방향 branch와 구별한다. 새 basis를 쓰는 문서만 v22로 저장하고 기존 문서 버전은 유지한다. v21 이하에 이 basis를 넣은 문서는 거부한다.
- 정확한 world 원/호의 중심·반지름·signed 각도 구간으로 계산한다. 정규화한 Heron 인수로 두 해를 구하고 유한 호 구간 두 개를 모두 필터한다. 렌더 샘플과 후보 배열 순서는 해 identity를 결정하지 않는다.
- 분리·포함·동심·일치 원을 구별한다. 성공 cache/Review는 two-points, tangent, one-domain-point를 표시한다. 일치하는 지지 원의 호도 중심 축이 정의되지 않으므로 거부한다. 일치 호의 endpoint-only 특수 해는 이번 지원 범위에 포함하지 않는다.
- 접선에서는 두 signed branch가 같은 위치를 갖지만 기존 결과 ID/topology를 보존한다. 다시 분리되면 저장된 branch로 돌아간다. 선택한 해가 사라지는 원본 편집은 종속 갱신 전체를 원자적으로 취소하며 명시적 재지정을 요구한다.
- 자동 원본 kind 변경에서 선 방향 branch가 중심선 branch로 바뀌지 않는다. 명시적 작성/재지정만 basis를 정규화한다. 같은 교점 operation의 원본/요소/branch 수정은 X3-A 경로를 사용한다.

## UI와 기존 파이프라인

Draw → Construction → Intersection of lines / circles / arcs에서 원본·좌/우 가지를 선택하고 자동 Review 후 Apply한다. Inspector는 저장된 정의/전후 좌표/분류를 Review하고 Apply로 갱신한다. 기존 drawing point를 출력하므로 viewport와 종속 작도 갱신은 기존 drawing/graph 경로를 따른다. 교점에 종속된 유한 segment는 아트보드 출력에 갱신된 좌표를 전달한다. 점 자체의 SVG 표식 출력은 기존 미지원 경계를 유지하며 이번 카드에서 추가하지 않았다.

XY/XZ/YZ·공통 높이와 균일 평면 배율의 정확한 원/호를 지원한다. 타 평면/높이·비균일 원·없는 topology·cycle·잠긴 종속 결과는 거부한다. 자유 UCS·새 곡선 교점은 후속 범위다.

## 검수

신규 Node 14개: 독립 3-4-5 잔차·큰 좌표·불균등 반지름·원본 순서·내/외접·CW/CCW/랩/끝점·양쪽 호 domain·접선 병합/분리·해 소멸 rollback·종속/잠금·평면/높이·재지정·cache 진단·v22 저장/복원·legacy 호환·종속 segment 아트보드 출력.

통합 Node **914 / 54 suites / fail·skip 0**, 대상 실제 브라우저 **14 checks**, 작도 재지정 회귀 **12 checks**. 타입 검사·architecture **428 modules** 통과. production build 및 기존 작도 작성 회귀 **25 checks** 통과. 상세 결과는 [마감 증거](../verification/X3-B1-CLOSEOUT-2026-10-10.json)를 따른다.

상위 X3-B는 부분 완료다. [다음 구현 검토](../product/CAD-X-NEXT-IMPLEMENTATION-REVIEW-2026-10-10.md)의 권장은 X1-B1이며 X3-B2/B3는 해당 X2 원본이 선행한다.
