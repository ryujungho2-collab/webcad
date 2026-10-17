# B1-D 다중선 지정 변의 직선↔호 전환

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. **일반 root 도형 범위를 구현했다.** 스케치 소유 도형의 구성 편집은 B1-E 후속으로 남긴다.

Edge 전환은 접속점을 정확히 고정하고 한 변의 곡률만 바꾼다. 직선→호는 반지름과 bulge 방향을, 호→직선은 현을 사용한다. 치수·작도 참조는 B1-A/B와 같은 명시적 재연결 정책을 공유하며, 불가능한 길이·반지름 입력은 입력을 유지한 채 거부한다.

## 사용과 검토

일반 윤곽을 선택해 Modify → Convert를 연다. 캔버스에서 변을 고르거나 목록에서 번호를 고르면 amber 하이라이트로 표시한다. Treatment는 자동(반대 곡률)·직선·호를 고르고, 호에는 단위 있는 반지름과 윤곽 방향 기준 좌/우 bulge를 입력한다. 참조가 있으면 결과와 필요한 edge/span·point·branch를 지정해야 Apply/Enter가 열린다.

Apply는 원본 교체, 새 topology, 관계 재연결과 downstream regeneration을 하나의 transaction에 담는다. 바뀐 변은 새 topology ID를 받고 그대로인 변·점은 기존 ID를 유지한다. Cancel/Escape는 detached plan만 폐기한다. 문서가 바뀐 stale plan은 적용할 수 없다. Undo/Redo는 관계와 결과 ID까지 복원한다.

## 공개 명령 계약

`convert-contour-edge`에 `objectId`·`segmentIndex`·`target`과 호의 `radius`·`side`를 사용한다. 변 번호는 저장된 윤곽 순서의 0-based index다. 같은 곡률로의 전환·없는 변·0 이하 반지름·현 절반보다 작은 반지름은 거부한다. 스케치·패턴 관계와 scene 소속 윤곽은 별도 adapter·해제 뒤에 실행한다.

선형 치수는 직선 변 또는 열린 전체 끝점 구간, 반지름/지름은 정확한 원호, 각도 치수는 first/second 슬롯의 직선 변을 지정한다. 작도는 연산에 맞는 점·변을 지정하며 교차 작도는 저장된 signed branch를 유지하거나 명시적으로 변경한다. 부족·중복·extra·다중 모호·없는 변·잠긴 dependent는 원본/History 변경 없이 실패한다. 새 document field는 없다. serialization v14를 유지한다.

## 검수

새 Node 7개(`convertEdge.test.ts`): 직선→호의 정확한 중심·반지름·sweep·접속점 고정·이웃 보존, 호→직선과 단일 선의 양방향 전환, 불가능 반지름·같은 곡률·없는 변·누락 반지름 실패, 선형 치수의 span 재연결과 반지름 치수의 생존 호 추적, 스케치/패턴/scene 경계, stale apply. 독립 좌표·길이·반지름 기대값, detached preview 원본 불변, 한 History entry와 Undo/Redo·serialize/deserialize를 검사했다.

새 `convertEdge` native Edge/CDP workflow 16 checks: 실제 React/Worker에서 선택 게이트·미해결 참조 Apply 차단·단위 반지름·span 재연결·접속점 유지·한 Undo/Redo·변 하이라이트·저장 재로드·팔레트 진입을 검사했다. fixture만 공개 명령으로 준비하며 실제 조작은 키·포인터를 사용한다.

최종 검수 수치와 로그는 [마감 증거](../verification/B1-D-CLOSEOUT-2026-10-09.json), 통합 현재 상태는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다.

## 남은 경계

- 스케치 owner/constraint와 authored/generated pattern 관계의 변 전환은 명시적으로 거부한다. B1-E에서 solver와 함께 검증한다.
- Scene 소속 윤곽은 scene 관계를 먼저 해제해야 한다. B1-A와 같은 정책이다.
- 반지름·길이 입력 오류는 값을 유지하며 다시 고칠 수 있다. 자동 치수 스타일·공통 style 편집은 B3-D 후속이다.
- 새 대형 문서 latency·실무자·GPU/VRAM benchmark는 없다. 기존 large chunk warning은 유지한다.
