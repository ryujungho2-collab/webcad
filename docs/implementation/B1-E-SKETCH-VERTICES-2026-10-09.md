# B1-E 스케치 정점·변 구성 편집·구속/치수/돌출 갱신

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-11 후속 갱신: **B1-E2 호·혼합 스케치 구성 편집**을 실제 저장·solver·편집 명령·UI 범위에서 확대했다. [최신 지원·검수](B1-E2-MIXED-SKETCH-EDITING-2026-10-11.md)를 따른다. 아래의 이전 호·혼합 미지원 설명은 최초 마감 당시의 경계이다.

2026-10-09. **직선 스케치 폴리라인 범위를 구현했다.** 호·혼합 bulge 구성과 패턴·scene 관계는 별도 검증 단위로 남긴다.

Vertex 편집은 스케치 소유 도형의 정점 삽입·삭제·열기·닫기를 solver와 함께 실행한다. 기존 `edit-polyline` 기하 계산을 재사용하되, 스케치 소유에는 명시적 참조 routing을 요구한다. 스케치 구속·구동 치수는 ID를 보존한 채 다시 풀고, live 돌출은 같은 transaction에서 재생성한다.

## 사용과 검토

직선 스케치 다중선을 선택해 Modify → Edit polyline을 연다. 캔버스에서 변·정점을 고르거나 목록·좌표로 지정한다. 스케치 구속·구동 치수·작도·profile이 걸려 있으면 결과와 필요한 점·변을 지정해야 Apply/Enter가 열린다. 미리보기는 원본·History를 바꾸지 않는다.

Apply는 스케치 entity 교체, 구속 재연결, solver 재검증, 투영 재생성과 downstream 갱신을 하나의 transaction에 담는다. entity ID는 유지되며 결과 선택도 그대로 이어진다. Cancel/Escape는 detached plan만 폐기한다. 문서가 바뀐 stale plan은 적용할 수 없다. Undo/Redo는 스케치·제약·결과까지 복원한다.

## 공개 명령 계약

`edit-polyline`에 선택 필드 `referenceRoutes?: ContourReferenceRoute[]`를 추가했다. 독립 도형은 기존처럼 route 없이 직접 적용하며 route가 오면 거부한다. 스케치 소유는 route 검토를 요구하고, 스케치 구속 슬롯은 점·직선 변으로, 작도·치수는 point/edge/span으로, profile은 전체 결과로 지정한다.

직선 polyline/rectangle만 지원한다. 원호·혼합 bulge 구성, 패턴 member, scene 소속 윤곽은 원본/History 변경 없이 실패한다. 부족·중복·extra·다중 모호·없는 정점/결과·잠긴 dependent·충돌 solver는 전체 거부한다. 새 document field는 없다. serialization v14를 유지한다.

## 검수

최초 Node 6개(`editSketchVertices.test.ts`): 검토 spike 유지·구동 width·live extrusion 체적과 후속 치수 편집, 삭제 병합과 중점 작도 추적, 열기/닫기와 구동 치수·ID 보존, 원호·누락 route·잘못된 portion 실패, 독립 직접 편집과 패턴/scene 경계, stale apply. 독립 좌표·체적 기대값, detached preview 원본 불변, 한 History entry와 Undo/Redo·serialize/deserialize를 검사했다.

같은 날 재검증에서 잠긴 원본·작도 dependent 거부와 구동 치수 재연결이 검토 형상과 충돌하는 경우를 2개 회귀 검사로 추가했다. 실패 시 문서 전체와 History가 그대로 유지됨을 검사한다. B1-E 대상 Node 8개, 전체 Node 746개와 대상 native browser 16 checks, 타입·architecture 353 modules·workspace build가 통과했다. 이번에는 전체 browser 52개를 재실행하지 않았다. [재검증 증거](../verification/B1-E-RECHECK-2026-10-09.json)를 따른다.

새 `editSketchVertices` native Edge/CDP workflow 16 checks: 실제 React/Worker에서 선택 게이트·미해결 참조 Apply 차단·정점 입력·구속/점/profile 재연결·spike·구동 치수·돌출 인계·한 Undo/Redo·원호 게이트·독립 직접 편집·저장 재로드·팔레트 진입을 검사했다. fixture만 공개 명령으로 준비하며 실제 조작은 키·포인터를 사용한다.

최종 검수 수치와 로그는 [마감 증거](../verification/B1-E-CLOSEOUT-2026-10-09.json), 통합 현재 상태는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다. 전체 Node 739개에는 같은 트리의 병렬 B1-C shear 테스트 2개가 포함된다.

## 남은 경계

- 원호·혼합 bulge 스케치 구성의 정점 편집은 명시적으로 거부한다. 별도 지원 단계로 검증한다.
- 패턴 member와 scene 소속 스케치 윤곽의 구성 편집은 관계를 먼저 해제해야 한다.
- 이 카드 마감 당시 Stretch는 후속이었다. 이후 [B2-E](B2-E-SKETCH-STRETCH-2026-10-10.md)에서 스케치 Stretch를 구현·검수했다. 스케치 Lengthen은 후속이며 기존 거부를 유지한다.
- 새 대형 문서 latency·실무자·GPU/VRAM benchmark는 없다. 기존 large chunk warning은 유지한다.
