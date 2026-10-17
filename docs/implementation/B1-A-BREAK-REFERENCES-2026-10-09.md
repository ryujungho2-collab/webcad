# B1-A 일반 도형 Break 조각·참조 보존

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. **일반 root 도형 범위를 구현했다.** 스케치·패턴 확대는 별도 검증 단위로 남긴다.

Break는 기존 정확한 선·호·bulge 윤곽 계산과 Trim/Join의 참조 재연결을 공유한다. 한 점 분할, 두 점 사이 제거, 닫힌 윤곽의 방향과 Reverse points는 기존 동작을 유지한다. `Keep Break pieces`에서 모든 남은 조각 또는 한 조각만 남길 수 있다. 제거할 부분은 실제 문서에서 사라지며, 참조는 남긴 조각으로 명시적으로 옮겨야 한다.

## 사용과 검토

일반 윤곽을 선택해 Modify → Break를 연다. 단위·절대/상대 U,V 또는 캔버스 pick으로 분할 위치를 지정한다. 남은 조각을 고르고 각 치수·작도에 Result와 필요한 point/edge/whole endpoint span을 지정한다. 캔버스는 결과 번호와 선택 참조를 파란색으로 표시한다. 치수 값의 전후 변화도 검토할 수 있다. 모든 관계를 정한 유효 preview에서만 Apply/Enter를 허용한다. 남길 조각을 바꾸면 참조 선택을 초기화한다. 좌표 오류는 입력을 유지하며 다시 고칠 수 있다.

Apply는 원본 교체, 새 topology, 관계 재연결과 downstream regeneration을 하나의 transaction에 담는다. 남긴 결과가 선택되며 다시 Break하거나 다른 CAD 편집을 이어갈 수 있다. Cancel/Escape는 detached plan만 폐기한다. 문서가 바뀐 stale plan은 적용할 수 없다. Undo/Redo는 관계와 결과 ID까지 복원한다.

## 공개 명령 계약

`break-drawing`에 선택 필드 `keepResultIndices?: number[]`, `referenceRoutes?: ContourReferenceRoute[]`를 추가했다. keep 필드는 원래 Break가 반환하는 0-based 조각 번호이며 생략하면 모두 남긴다. 비어 있거나 중복·존재하지 않는 번호는 거부한다. 출력 순서는 원래 윤곽 순서다. `referenceRoutes.resultIndices`는 **남긴 조각으로 필터링한 출력 목록**을 가리킨다. 예를 들어 원래 두 번째 조각만 남기면 reference result index는 0이다.

선형 치수는 정확한 직선 변 또는 열린 전체 끝점 구간, 반지름/지름은 정확한 원호, 각도 치수는 first/second 슬롯의 직선 변을 지정한다. 작도는 연산에 맞는 점·변·전체 끝점 구간을 지정하며 교차 작도는 저장된 signed branch를 유지하거나 명시적으로 변경한다. 부족·중복·extra·다중 모호·없는 변/결과·잠긴 dependent·사라진 교차 분기는 원본/History 변경 없이 실패한다. 공개 명령의 기존 호출에서 referenceRoutes를 생략하면 기존 참조 거부 정책과 안내를 유지한다.

새 document field는 없다. 기존 topology와 construction elements를 저장하며 serialization v14를 유지한다.

## 검수

새 Node 10개: 선형 치수·midpoint→bisector, 점 작도·후속 Join, signed intersection 실패/변경, 정확한 원호의 반지름, missing/extra/duplicate/ambiguous/없는 edge/keep, 잠금·없는 source, sketch/pattern 거부, stale apply, 같은 polyline의 두 angular 슬롯, 미지원 hatch·열린 live solid·scene 교체 원자성. 독립 좌표·길이·반지름 기대값, detached preview 원본 불변, 한 History entry와 Undo/Redo·serialize/deserialize를 검사했다.

새 `breakReferences` native Edge/CDP workflow 16 checks: 실제 React/Worker에서 단위/상대 좌표, 조각 수·번호, 불완전 참조 Apply 차단, dimension extent 표시, reference highlight, 취소·focus, 한 조각 보존·참조 초기화, invalid 복구, canvas Enter, 한 Undo/Redo, 저장 재로드, 결과 재분할. fixture만 공개 명령으로 준비하며 실제 조작은 키·포인터를 사용한다.

최종 검수 수치와 로그는 [마감 증거](../verification/B1-A-CLOSEOUT-2026-10-09.json), 통합 현재 상태는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다.

## 남은 경계

- 스케치 owner/constraint와 authored/generated pattern 관계의 Break는 명시적으로 거부한다. B1-A 전체 확대를 완료로 올리지 않는다.
- Hatch/chain 등 미지원 feature 관계는 기존 reconnect 정책으로 거부한다. live solid가 열린 결과를 받을 수 없으면 전체 명령이 실패한다. Scene 소속 원본도 scene 재지정 전 거부한다.
- 표현식으로 구동하는 원본은 기존 정책대로 교체를 거부한다. B1-F의 표현식·hatch/chain 소비자 확대는 미구현이다.
- Explode 관계 보존 B1-B, block 구성 편집, nested artwork 전용 참조 adapter를 확대하지 않았다.
- 새 대형 문서 latency·실무자·GPU/VRAM benchmark는 없다. 기존 large chunk warning은 유지한다.
