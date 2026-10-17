# B1-B Explode→편집→Join 의존 관계 복원

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. **일반 root 도형 범위를 구현했다.** 스케치·패턴 소유 adapter와 블록 구성 편집은 별도 검증 단위로 남긴다.

Explode는 정확한 선·호·bulge 윤곽 계산과 B1-A의 참조 재연결 정책을 공유한다. 일반 polyline/rectangle을 해석적인 line/arc 조각으로 분해하고, 분해한 조각을 직접 편집(Move·control 편집 등)한 뒤 Join으로 하나의 윤곽으로 되돌리면서 치수·작도·profile·scene 관계를 복원한다. `관계 제거 후 실행`을 기본값으로 만들지 않으며, 참조마다 reviewed result mapping을 요구한다.

## 사용과 검토

일반 윤곽을 선택해 Modify → Explode를 연다. 캔버스는 분해 결과를 번호(Result 1..n)와 선택 참조 하이라이트(파란색)로 표시한다. 각 치수는 결과와 필요한 edge/whole span을, 작도는 point/edge와 교차 branch를, live profile과 scene artwork는 전체 조각 집합을 지정한다. 참조가 모두 연결된 유효 preview에서만 Apply/Enter를 허용한다. 분해 뒤 조각을 편집해도 치수·작도·돌출·scene은 갱신되며, Join에서 다시 하나의 결과로 모을 때 같은 검토 절차로 참조를 복원한다.

Apply는 원본 교체, 새 topology, 관계 재연결과 downstream regeneration을 하나의 transaction에 담는다. Cancel/Escape는 detached plan만 폐기한다. 문서가 바뀐 stale plan은 적용할 수 없다. Undo/Redo는 관계와 결과 ID까지 복원한다.

## 공개 명령 계약

`explode-drawings`와 `join-drawings`는 `referenceRoutes?: ContourReferenceRoute[]`를 받는다. Explode 출력 순서는 원래 윤곽의 segment 순서이며, Join 출력은 연결된 하나의 윤곽이다. 치수는 정확히 하나의 결과에 edge 또는 열린 전체 끝점 구간을 지정하고, 반지름/지름은 정확한 원호를 지정한다. 각도 치수는 first/second 슬롯의 직선 변을 지정한다. 작도는 연산에 맞는 점·변을 지정하며 교차 작도는 저장된 signed branch를 유지하거나 명시적으로 변경한다. live profile은 분해 시 전체 조각 집합을 입력으로 받고 Join 시 하나의 입력으로 복귀한다. scene artwork는 전체 결과 객체로 확장·축소되며, 병합되는 조각의 hidden/track/link behavior가 다르면 거부한다.

부족·중복·extra·다중 모호·없는 변/결과·잠긴 dependent·사라진 교차 분기·충돌하는 scene behavior는 원본/History 변경 없이 실패한다. 새 document field는 없다. 기존 topology와 construction elements를 저장하며 serialization v14를 유지한다. 변경되지 않은 해석 edge는 `replacementTopology`가 기존 segment/control ID를 유지하고, 원호는 `tan(sweep/4)` bulge로 정확히 보존한다.

## 검수

새 Node 7개(`explodeReferences.test.ts`): 혼합 bulge Explode의 edge ID·정확한 반지름·참조·편집 후 Join roundtrip, live extrusion의 전체 조각 입력·공유 꼭짓점 연동 편집·Join 단일 입력 복귀, scene identity·hidden/link/track 확장·축소, 충돌·잠금 원자성, missing/duplicate/ambiguous/wrong-kind/locked 실패, sketch/pattern/unsupported/표현식 경계, stale preview·History 보존. 독립 좌표·길이·반지름·체적 기대값, detached preview 원본 불변, 한 History entry와 Undo/Redo·serialize/deserialize를 검사했다.

새 `explodeReferences` native Edge/CDP workflow 19 checks: 실제 React/Worker에서 5개 결과 번호·미해결 참조 Apply 차단·치수 측정 표시·참조 highlight·Cancel·한 Undo/Redo·분해 조각 Move 뒤 중점 재생성·Join 단일 profile/scene 복귀·저장 재로드를 검사했다. fixture만 공개 명령으로 준비하며 실제 조작은 키·포인터를 사용한다.

최종 검수 수치와 로그는 [마감 증거](../verification/B1-B-CLOSEOUT-2026-10-09.json), 통합 현재 상태는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다.

## 남은 경계

- 스케치 owner/constraint와 authored/generated pattern 관계의 Explode/Join은 명시적으로 거부한다. B1-B 전체 확대를 완료로 올리지 않는다.
- Hatch/chain 등 미지원 feature 관계는 기존 reconnect 정책으로 거부한다. 표현식으로 구동하는 원본의 교체도 거부한다. B1-F의 표현식·hatch/chain 소비자 확대는 미구현이다.
- Scene 병합 시 behavior(hidden/track/link)가 충돌하면 전체 명령이 실패한다. 잠긴 레이어·잠긴 아트보드의 scene 재연결도 거부한다.
- 블록 인스턴스 해체 B1-C와 nested artwork 전용 참조 adapter를 확대하지 않았다.
- 새 대형 문서 latency·실무자·GPU/VRAM benchmark는 없다. 기존 large chunk warning은 유지한다.
