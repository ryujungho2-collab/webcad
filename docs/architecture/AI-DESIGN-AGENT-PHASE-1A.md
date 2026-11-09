# AI Design Agent Phase 1A — Context, Scope & Native Feedback

2026-10-30. 기존 Copilot → Gateway → Ollama → CadToolSession → Preview 경로를 보완했다. 새 프레임워크·커널·CAD 편집 도구·Assembly Solver는 없다.

## 기존 기능 재사용

- cadToolCatalog에 선택적 이름 필터만 추가. CAD_TOOLS가 단일 정의이고 MCP는 인자 없는 기존 전체 catalog를 그대로 사용한다.
- 기존 design-explore의 전용 scope는 유지. 일반 계획의 scope 선택은 같은 registry의 이름을 필터링한다.
- 기존 readRounds=4, callsPerRound=8, transcript64KiB, 취소·문서 generation·선택 권한을 유지한다.
- CadToolSession과 원본 MotionReport 형식은 변경하지 않았다. 기존 native read/plan 및 B2 inspectAssemblyMotion을 재사용한다.
- App의 기존 validateCopilotEdit, captured Layer 정규화, detached Preview, 사용자 Apply, History를 사용한다.

## 실제 context 정책

설치 버전은 Ollama0.40.12. [공식 같은 버전 소스](https://github.com/ollama/ollama/blob/v0.40.12/llm/llama_server.go#L300)를 확인했다.

num_ctx=16384는 실제 runner의 n_ctx/n_ctx_slot에 적용됐다. Phase0의8194는 영구적인 컨텍스트 한도가 아니다. 입력17418/17490이 fullPromptLimit=16383을 넘었을 때 contextShiftPromptLimit가 numCtx-max((numCtx-numKeep)/2,1)을 적용했다. numKeep=4이면8194이다. 이는 출력4096 예약과 별개의 초과 입력 절단 정책이다.

일반 계획은 num_ctx=16384 유지, 출력 예약 num_predict=1024, truncate=false를 사용한다. 긴 입력을 반으로 잘라 성공 응답처럼 처리하도록 두지 않는다. 적용 버전의 no-truncate 요청을 사용하고 engine prompt_eval_count/eval_count를 반환한다.

사전 검사에서는 system/user 메시지의 UTF-8 바이트 합계+256의 보수적 ceiling을 context-output 예약과 비교한다. **문자/바이트를 정확한 토큰 수로 보고하지 않는다.** 별도 tokenizer는 설치하지 않았다. 모델 template/media에 대한 보편적인 exact tokenizer 보장이 아니며 engine의 거부와 실제 사용량이 최종 근거다. 이번 scope는 텍스트 요청이며 실제 입력은4178토큰 이하로 충분히 작았다.

기존512KB request /70,000자 보조 한도도 유지한다. 출력 예약을 남기지 못한 observed prompt_eval_count도 실패로 처리한다. 일반 계획에도 run metadata를 반환하고 client가 계획과 분리해 소비한다. run.context에 요청 numCtx, outputReserved, utf8Bytes, truncate, inferenceCalls를 기록한다.

## Task scope

copilotTaskScope.ts의 taskToolScope가 기존 등록 이름을 필터링한다.

| 작업 | Read | Write |
|---|---|---|
| 선택 솔리드 치수 수정 | cad.objects / cad.inspect / cad.measure / cad.parameters | solid.parameter |
| 간섭·관통 감소 | 위4개 + assembly.inspect / assembly.motion.inspect | 선택 가능한 solid contract가 있을 때 solid.parameter |
| 일반 작업 | 기존 core 생성·기하 조회·피처 도구 일부와 recipe | 기존 등록·선택 검증 범위 |

이번 간섭 작업에 Joint-owned 이동, axis 편집, reparent, Joint 삭제를 적절한 수단처럼 노출하지 않는다. 전체 registry나 MCP 권한을 삭제한 것이 아니다. 복잡한 일반 CAD 작업의 완전한 자연어 라우팅은 이번 범위가 아니다. 솔리드가 선택됐다는 이유만으로 fillet 같은 다른 요청을 치수 작업으로 분류하지 않는다.

Gateway가 클라이언트의 tools 정의를 실행 계약으로 신뢰하지 않고 서버 소유 registry에서 scope와 JSON 응답 schema를 다시 구성한다. scope 밖 모델 tool은 거부된다. selection, layer lock, snapshot/stale 검사는 기존 CadToolSession이 계속 담당한다.

## Read-before-write와 요약

간섭 작업은 선택 대상의 cad.inspect, assembly.inspect, 성공한 assembly.motion.inspect 근거가 없으면 write를 native planning으로 보내지 않는다. scalar 현재 값은 신뢰 가능한 captured solid contract를 재사용한다. 모든 치수 작업에 중복 read를 강제하지 않는다. Test A는 사용자가 명시한 조회 요청을 모델이 실제 수행했다.

modelReadEvidence는 LLM으로 보내는 복사본만 투영한다. 원본 JSON/MCP report는 유지한다.

- Motion은 motion-summary-v1: pair, 모든 reported row의 검사 각도, raw/policy status, Common 체적·공차, 구조적 상대운동, exception/unknown/reason, intent, 요청·revision·완료 상태·경고를 유지한다.
- 값이 같은 관측만 묶는다. 같은 측정값을 근거로 구조적 불변을 추론하지 않는다.
- 각도 사이의 미검사 구간이나 partial/unknown을 성공으로 바꾸지 않는다.
- assembly 모델 요약에서는 Rest 배열을 생략하고 graph/origin/axis/angle/intent를 유지한다. 원본 read result는 Native 검사에 남는다.
- 상세 pair/angle은 기존 optionsJson의 partIds와 start=end 등으로 좁혀 조회한다. 새 중복 검사 도구는 없다.

## 제한된 검증 피드백

requestCopilotPlan은 기존 loop에 최대2회 native 재계획을 추가했다. 실패 tool/command, NO_OP / READ_REQUIRED / NATIVE_VALIDATION 이유, 현재 solid 값·지원 범위, 원래 요구를 validationFeedback으로 전달한다. 같은 거부 제안은 call ID와 무관하게 비교하여 조기 종료한다. 읽기 call ID 중복은 여전히 오류다.

모델 response의 run을 검증하여 분리하고 read 결과만 다음 요청으로 전달한다. 실제 read가 실패한 경우 기존 ToolSession 오류도 transcript에 남긴다. 이번 실모델 B에서는 이 정보만으로 Motion 요청을 복구하지 못했다.

App의 validatePlan callback은 validateAgentProposal을 실행한다. 성공 Preview는 재사용하므로 같은 안을 UI 검토용으로 다시 계산하지 않는다. callback 오류는 같은 제한된 피드백 경로로 돌아간다.

간섭 목표의 Native gate:
- 동일 source revision/generation의 baseline 근거 요구.
- 기존 Assembly 전체와 intent annotation 보존.
- 선택 밖 객체/피처 변경 거부.
-0/90/180 baseline 및 제안 형상의 실제 BRep 검사.
- unknown/미완료 또는 Common 최대체적이 감소하지 않으면 거부.

이 gate는 해당 작업의 보수적인 scalar 수정 범위다. 모든 합법적인 Assembly 재설계 방식의 완전성이나 제조·하중 적합성을 주장하지 않는다. 기존 intentional-overlap은 새 감소 목표와 별도로 표시하며 자동 제거하지 않는다. Apply 권한은 여전히 사용자에게 있다.

## 변경 파일

- server/localCopilot.ts: scope/schema, context 거부, 사용량.
- copilot/copilotTaskScope.ts (신규): 기존 catalog 필터와 모델용 read 투영.
- copilot/cadToolContract.ts: 선택적 catalog 필터.
- copilot/copilotConnection.ts: 작은 요청, 근거·피드백 loop, usage callback.
- copilot/designIntent.ts: 선택적 runtime 사용량 타입/파싱.
- copilot/validateAgentProposal.ts (신규): 기존 Native Preview와 목표 보존 비교.
- App.tsx: 동일 Native 검증 callback·Preview 재사용, captured Layer 유지.
- tests/agentContext.test.ts, tests/agentNativePreview.test.ts (신규).
- tests/copilotPlanning.test.ts: 기존 proposal의 완전 동일성과 새 run 계약을 함께 검증.

문서 저장 포맷, v63 원본, 커널, 원본 MotionReport, MCP tool registry/권한은 변경하지 않았다. 결과는 [검증 보고](../verification/AI-DESIGN-AGENT-PHASE-1A.md)에 기록한다.
