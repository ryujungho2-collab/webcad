# G5-A1 gateway 응답 검증 보완

> **현재 기능 설명:** [Copilot](../features/COPILOT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. 기존 [G5-A1 구현](G5-A1-GATEWAY-BOUNDARY-2026-10-06.md)의 응답 검증·취소·timeout·late response 경로를 유지하고 응답 디코딩 경계를 보완했다.

## 구현

Content-Type의 media type을 정확히 비교한다. `application/jsonp`, `text/application/json`, `application/json-extra`는 JSON 응답으로 수락하지 않는다. 대소문자 차이와 `application/json; charset=utf-8`은 허용한다.

UTF-8 decoder를 fatal 모드로 사용한다. 잘못되거나 중간에서 끊긴 바이트를 대체 문자로 바꿔 제안에 넣지 않고 재시도 가능한 오류를 반환한다. 정상 한글이 여러 chunk에 나뉘는 응답, 64 KiB byte 상한과 stream 정리·취소·deadline은 유지한다.

두 결함은 새 회귀 검사 2개가 수정 전 실패하고 수정 후 통과하는 것으로 확인했다. `copilotConnection.test.ts`는 총 10개이며 context·Apply·Move를 포함한 대상 Copilot Node 검사는 24개다. gateway browser는 실제 React/Worker에서 13 checks를 실행하며 transport만 mock이다.

통합 검수에서 공유 `contourReferenceRequirements`가 미정의 `bindings`를 참조하는 오류도 발견했다. 이미 존재하는 `bindingRequirements(document, sourceIds)` 조회 함수로 연결했다. 바인딩 기능의 전체 지원 확대를 이 작업의 완료로 주장하지 않는다.

최종 실행 결과와 로그는 [검증 기록](../verification/G5-A1-RECHECK-2026-10-09.json)을 따른다. 최초 마감 수치는 기존 기록에 보존한다.

## 지원 경계

실제 LLM provider·서버·인증 환경은 연결하지 않았다. G5-A1의 gateway 응답 계약 완료와 실제 provider 연결 완료를 구분한다. 자연어 Move 해석·다중 대상·추가 편집 명령은 G5-B2 후속이다. 새 document field나 serialization 변경은 없다.
