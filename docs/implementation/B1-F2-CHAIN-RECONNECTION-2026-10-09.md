# B1-F2 source 교체 후 연속 치수 재연결

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. **연속 치수 소비자 범위를 구현했다.** 변수/수식 바인딩은 B1-F3 후속으로 남긴다.

Chain 재연결은 윤곽 교체 뒤 연속 치수의 source를 검토된 결과 하나로 옮기고 측정점을 다시 읽는다. 기존 trim/join/break/explode/convert/정점 편집의 참조 정책을 공유하며, 단일 결과·측정 가능 검증에 실패하면 원본/History 변경 없이 거부한다.

## 사용과 검토

윤곽 편집에서 연속 치수 행이 보이면 결과를 하나 고른다. 여러 조각·점·변 지정은 받지 않으며, 미리보기는 원본·History를 바꾸지 않고 유효 preview에서만 Apply/Enter를 허용한다.

Apply는 원본 교체, source 재지정, 측정점 갱신과 downstream 재생성을 하나의 transaction에 담는다. 치수 ID·레이어·offset·높이·방향은 유지된다. Cancel/Escape는 detached plan만 폐기한다. 문서가 바뀐 stale plan은 적용할 수 없다. Undo/Redo는 관계와 결과 ID까지 복원한다.

## 공개 명령 계약

새 명령 없이 기존 `referenceRoutes`에 `chain` 종류를 추가했다. chain route는 정확히 하나의 전체 결과를 지정한다. source 목록은 단일 ID로 바뀌고, 측정점은 결과의 world 점열로 갱신하며 drafting 유효성을 검증한다.

잠긴 치수 레이어·측정 불가 결과·부분 지정은 원본/History 변경 없이 실패한다. 새 document field는 없다. serialization v14를 유지한다.

## 검수

새 Node 3개(`chainReconnection.test.ts`): Join 단일 결과 인계와 미리보기 원자성, Explode·Trim·스케치 정점 편집의 한 조각 갱신, 부분 지정·잠금·F3 바인딩 실패. 독립 점열 기대값, detached preview 원본 불변, 한 History entry와 Undo/Redo·serialize/deserialize를 검사했다. 기존 해치 테스트의 chain 기대값은 새 단일 결과 메시지로 갱신했다.

새 `chainReconnection` native Edge/CDP workflow 12 checks: 실제 React/Worker에서 선택 게이트·미해결 참조 Apply 차단·단일 결과 재연결·점열 갱신·한 Undo/Redo·저장 재로드·팔레트 진입을 검사했다. fixture만 공개 명령으로 준비하며 실제 조작은 키·포인터를 사용한다.

최종 검수 수치와 로그는 [마감 증거](../verification/B1-F2-CLOSEOUT-2026-10-09.json), 통합 현재 상태는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다.

## 남은 경계

- 변수/수식 바인딩 재연결은 B1-F3 후속이며 기존 거부를 유지한다.
- 여러 조각에 걸친 연속 치수는 단일 결과로만 인계한다. 분할 추적은 지원하지 않는다.
- 새 대형 문서 latency·실무자·GPU/VRAM benchmark는 없다. 기존 large chunk warning은 유지한다.
