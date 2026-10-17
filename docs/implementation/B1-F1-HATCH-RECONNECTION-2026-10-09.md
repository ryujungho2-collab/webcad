# B1-F1 source 교체 후 해치 재연결

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. **해치 소비자 범위를 구현했다.** 연속 치수·변수/수식 바인딩은 별도 검증 단위로 남긴다.

Hatch 재연결은 윤곽 교체 뒤 해치의 source 목록을 검토된 결과로 옮기고 영역을 다시 계산한다. 기존 trim/join/break/explode/convert/정점 편집의 참조 정책을 공유하며, 닫힌 루프를 만들 수 없으면 원본/History 변경 없이 실패한다.

## 사용과 검토

윤곽 편집에서 해치 행이 보이면 결과(필요하면 전체 조각)를 고른다. Explode·Curve workflow의 여러 조각에는 All 결과를, 단일 결과에는 Result 1을 지정한다. 미리보기는 원본·History를 바꾸지 않으며 유효 preview에서만 Apply/Enter를 허용한다.

Apply는 원본 교체, source 목록 재지정, 영역 재생성과 downstream 갱신을 하나의 transaction에 담는다. 해치 ID·레이어·간격·각도는 유지된다. Cancel/Escape는 detached plan만 폐기한다. 문서가 바뀐 stale plan은 적용할 수 없다. Undo/Redo는 관계와 결과 ID까지 복원한다.

## 공개 명령 계약

새 명령 없이 기존 `referenceRoutes`에 `hatch` 종류를 추가했다. 해치 route는 전체 결과 객체만 지정하며 점·변·branch 지정은 거부한다. 한 해치가 교체된 source를 여러 개 참조하면 각 requirement를 순서대로 적용하고, 모든 route가 모인 뒤 영역을 한 번에 재생성한다.

source 목록·입력은 검토된 결과 ID로 바뀌고, 영역은 스테이지 문서에서 `extractSketchLoops`로 다시 계산하며 `hatchLines` 행 한계를 검증한다. 잠긴 해치 레이어·루프 불가·행 초과는 원본/History 변경 없이 실패한다. 새 document field는 없다. serialization v14를 유지한다.

## 검수

새 Node 5개(`hatchReconnection.test.ts`): 닫힌 Trim+rejoin 유지, 두 source Join 병합, Explode 전체 조각, 스케치 정점 삽입과 구속 공존, 누락 route·부분 지정·잠금·F2/F3 소비자 실패. 독립 영역·행 기대값, detached preview 원본 불변, 한 History entry와 Undo/Redo·serialize/deserialize를 검사했다. 기존 break/explode의 해치 기대값은 새 실패 메시지로 갱신했다.

새 `hatchReconnection` native Edge/CDP workflow 14 checks: 실제 React/Worker에서 선택 게이트·미해결 참조 Apply 차단·양쪽 source 재연결·영역 재생성·한 Undo/Redo·열린 결과의 원자 거부·저장 재로드·팔레트 진입을 검사했다. fixture만 공개 명령으로 준비하며 실제 조작은 키·포인터를 사용한다.

최종 검수 수치와 로그는 [마감 증거](../verification/B1-F1-CLOSEOUT-2026-10-09.json), 통합 현재 상태는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다. 전체 Node 746개에는 같은 트리의 병렬 B1-E 강화 테스트 2개가 포함된다.

## 남은 경계

- 연속 치수 재연결은 B1-F2, 변수/수식 바인딩은 B1-F3 후속이며 기존 거부를 유지한다.
- 결과 부분집합만으로는 닫힌 루프를 만들 수 없으면 전체 명령이 실패한다. 조용한 부분 해치는 만들지 않는다.
- 새 대형 문서 latency·실무자·GPU/VRAM benchmark는 없다. 기존 large chunk warning은 유지한다.
