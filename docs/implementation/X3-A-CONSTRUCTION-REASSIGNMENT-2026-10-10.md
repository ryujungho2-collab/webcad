# X3-A 저장된 작도 정의 재지정

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10 구현·검수 완료. 현재 상태와 다음 실행은 [NEXT-STEPS](../../NEXT-STEPS.md)가 소유한다.

## 사용 경로

Explorer나 viewport에서 기존 작도 결과를 선택하면 Inspector의 **Construction definition**이 나타난다. 저장된 operation과 현재 정의를 읽고 각 역할의 원본 객체와 참조 요소를 선택한다.

- segment / line-through / ray-through: first/second 원본 점 또는 저장된 꼭짓점·끝점.
- midpoint: 유한 선분·polyline/rectangle의 저장된 직선 변 또는 열린 경로의 전체 끝점 구간.
- perpendicular-bisector: 선분/변/구간과 해당 위치에 있는 midpoint 객체.
- intersection: 기존 선–선·선–원·선–호 원본/요소와 선 방향의 positive/negative branch.

요소 선택은 명령 실행과 동일한 `drawingReferenceGeometry` 해석기를 사용한다. 원본 객체를 바꾸면 이전 객체의 topology ID를 버리고 새 객체에서 사용할 수 있는 첫 요소를 선택한다. 타 작업 평면과 결과 자신은 선택 후보에서 제외한다. 읽기 전용 원본은 숨김/잠금 상태에서도 좌표를 참조할 수 있다.

**Review construction reassignment**는 분리된 문서에서 정의와 종속 결과를 계산한다. 저장된 정의와 draft, world mm 전후 좌표, 영향 받은 작도/치수를 확인한다. **Apply construction reassignment**가 한 History 항목으로 적용한다. Cancel은 저장된 정의로 돌아가고, 입력/문서 변경·선택 변경은 이전 review를 폐기한다. 늦게 도착한 review 결과도 적용하지 않는다. 앱은 잠긴 결과의 편집 선택을 제한하고 명령은 잠긴 결과를 별도로 거부한다.

## 명령과 갱신 계약

`update-construction { objectId, definition }`은 기존 live 작도만 대상으로 한다. operation과 결과 kind를 유지하고 다음을 함께 처리한다.

1. definition을 복제하고 `constructionInputs`로 inputs를 갱신한다.
2. 평가 전에 `validateConstructionGraph`로 자기/간접 cycle과 없는 원본을 검사한다.
3. 저장된 작업 평면에서 새 참조를 평가하고 기존 params의 좌표 cache를 갱신한다.
4. 기존 공통 regeneration과 associative dimension refresh가 종속 작도·live feature·주석을 계산한다.
5. 분리된 트랜잭션이 전부 성공했을 때만 문서와 History를 공개한다.

객체/feature ID, 이름, layer, construction 표시, vector style과 topology IDs는 보존한다. 이전 원본은 더 이상 결과를 구동하지 않으며 새 원본 편집은 새 inputs를 통해 결과를 재생성한다. 문서 schema/version을 추가하지 않는다. 기존 expression·Dependencies·query·viewport와 유한 도면의 아트보드 SVG 경로가 갱신된 정의와 좌표를 읽는다.

없는 요소, 퇴화/중복 점, 타 평면/높이, 없는 교점 가지, 불일치 midpoint, cycle, 잠긴 결과·변경해야 하는 종속 결과/치수는 전체 트랜잭션을 거부한다. 임의 다른 원본이나 다른 교점 해로 자동 대체하지 않는다. 동일 정의는 변경과 History를 생성하지 않는 기존 no-op 거부 계약을 따른다.

## 검증

- 대상 Node 13개: 정의/inputs/cache/종속 작도/치수, 정확한 전후 좌표와 query expression, 요소·branch 재지정, 이름·스타일·topology 보존, 이전/새 원본 추종, 모든 기존 operation, cycle/누락/타 평면/높이/없는 해, 결과/종속/치수 잠금, readonly 원본, stale plan, 저장·Undo/Redo, 아트보드 export.
- 실제 브라우저 12 checks: Inspector source·edge·endpoint-span·branch 선택, transient Review, 정확 좌표·영향 범위, draft 무효화, Cancel, Apply·한 Undo/Redo, cycle 오류 복구, 외부 문서 변경, 잠긴 결과의 선택 제한.
- 기존 작도 UI 회귀 25 checks. 통합 Node 900개 / 54 suites / fail·skip 0, 타입·architecture 425 modules·production build 통과.

Inspector의 새 패널 키는 기존 vector style 패널과 구분해 native select 입력 뒤 draft 상태가 보존되도록 했다. [마감 증거](../verification/X3-A-CLOSEOUT-2026-10-10.json).

## 지원 경계

하나의 기존 작도의 source/element/branch 재지정이다. operation 또는 결과 kind 변환, 새 원–원/원–호/호–호 교점은 포함하지 않는다. 교점 확장은 X3-B1 후속이다. 여러 작도 정의의 결합 재지정 전용 UI와 임의 UCS 작도는 별도 범위다. 유한 도면 SVG 검증은 기존 export 계약을 따르며 독립 point/infinite-line/ray의 SVG 지원을 확장하지 않는다.
