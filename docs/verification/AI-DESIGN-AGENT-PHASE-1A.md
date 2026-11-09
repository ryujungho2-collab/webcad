# AI Design Agent Phase 1A — 실제 평가 결과

2026-10-30. **Test A의 완료 기준은 달성했다. Test B는 미완료다.** 실제 모델 호출6회를 모두 사용했으며 추가 호출하지 않았다. 제품 변경은 context·tool routing·validation feedback과 기존 Preview 연결에 한정했다.

## 1. 결과 비교

| 지표 | Phase0 | Test A | Test B |
|---|---|---|---|
| 실제 모델 | qwen3-coder-32k:latest | 동일 | 동일 |
| 모델 호출 | intent1+planning2 | 2 | 4 |
| catalog | 95 tools /61,460자 | 5 /2,091자 | 7 /3,159자 |
| 실제 엔진 입력 token | 일반 계획17418/17490 입력이8194로 절단 | 1143,1283 | 1511,2511,3934,4178 |
| 출력 token | intent 외 전체 미측정 | 58,61 | 228,202,44,44 |
| 이번 실행 잘림 | Phase0 두 번 확인 | 없음 | 없음 |
| 실제 모델 Read 실행 | 0 | 1 성공 | 11 실행:10 성공·1 실패 |
| Write 제안 | no-op2 | 1/1 유효 | 0, 비율 해당 없음 |
| Write no-op | 2 | 0 | 0; 개선했다고 해석하지 않음 |
| Native Preview | 미도달 | 성공 | 미도달 |
| native validation 재계획 | Phase0 수동 합성1회 | 발생 안 함 | 발생 안 함; read 반복 후 중단 |
| 추가 합성 사용자 피드백 | 1회 | 0 | 0 |
| 승인 전 문서 변경 | 없음 | 없음 | 없음 |
| Undo 이력 | 0 | 0 | 0 |

모델이 생성한 B read 호출은12개다. 마지막 중복 ID 호출은 실행 전에 거부하여11개만 native read로 실행했다. 평가자가 실행한 조회를 AI read로 합산하지 않았다.

실제 provider 누적시간: A 약7.106초, B 약8.357초. Fixture 설정·Native Preview·기록을 포함한 자동 실험 런은18.193초다. warm/cached 실행이며 성능 보장이 아니다. 실제 입력 총14,560tokens, 출력637tokens를 엔진 응답에서 측정했다.

## 2. 실제 context 원인과 개선

Ollama0.40.12를 설치 버전으로 확인했다. num_ctx=16384는 실제 runner n_ctx_slot에도 적용됐다. 이전의8194는 고정 한도나 설정 무시가 아니다.

[공식 같은 버전 구현](https://github.com/ollama/ollama/blob/v0.40.12/llm/llama_server.go#L300)은 입력이 NumCtx-1을 넘을 때, NumKeep를 보존하고 남은 context의 약 절반을 비우는 산식을 사용한다. numCtx16384 / keep4에서8194이다. Phase0의17.4K 입력이 이 정책을 발동시켰다. 출력4096 예약과는 별개다.

이번 일반 계획은 num_ctx16384를 유지했다. 출력 num_predict1024, truncate=false, 작은 서버 소유 prompt와 schema, 보수적 UTF-8 byte ceiling을 적용했다. 이를 정확한 tokenizer 계산으로 표시하지 않는다. 실제 token 수는 engine prompt_eval_count/eval_count와 runner task.n_tokens를 근거로 한다.

별도 tokenizer는 설치하지 않았다. 실제 컨텍스트를 넘기는 경우 engine no-truncate 거부를 사용하며, 사전 byte ceiling과 observed output 예약 검사도 실패를 성공으로 바꾸지 않는다. 실제6회는 입력4178tokens 이하이며 실행 UTC 구간의 truncation warning0개였다. 로그의 KST/UTC를 epoch로 정규화해 Phase0의 예전 경고를 제외했다.

각 요청의 model/options/truncate/system/data/schema, actual token·응답·지연은 output/verification/ai-agent-phase-1a/live.json에 남겼다. 잘림 로그 필터는 runtime-truncation-since-live.log, runner 근거는 runtime-token-evidence.log에 있다.

## 3. 기존 기능 재사용과 코드 변경

[아키텍처 문서](../architecture/AI-DESIGN-AGENT-PHASE-1A.md)에 전체 통합 위치를 기록했다.

| 파일 | 변경 |
|---|---|
| apps/web/server/localCopilot.ts:78 | 서버 소유 task scope, 같은 JSON schema scope, 명시적 context 거부, 일반 계획 usage |
| apps/web/src/copilot/cadToolContract.ts:118 | 기존 catalog의 optional 이름 필터. MCP 전체 registry 유지 |
| apps/web/src/copilot/copilotTaskScope.ts:3 | 작업 라우팅, modelReadEvidence / motionEvidenceSummary |
| apps/web/src/copilot/copilotConnection.ts:145 | 기존 read-loop에 근거 gate·최대2회 검증 재계획·반복 거부 stop |
| apps/web/src/copilot/designIntent.ts | ModelRun.context 추가·검증 |
| apps/web/src/copilot/validateAgentProposal.ts:10 | 기존 Native Preview·Assembly·Motion 검사를 통한 보존·감소 검증 |
| apps/web/src/App.tsx:1011 | 기존 captured Layer 정규화 후 callback 검증, 성공 Preview 재사용 |

CadToolSession, CommandBus, 커널, Geometry Solver, 원본 MotionReport/MCP JSON과 v63 저장 포맷은 변경하지 않았다. 새로운 write tool도 없다.

## 4. Test A — 실제 작은 Box 수정 성공

별도 Fixture: width50 / depth30 / height20mm, 원점·단위 scale. 평가자는 이 독립 Box를 선택하고 “cad.inspect로 현재 치수를 조회한 후 width60mm, 다른 치수/위치 유지, Apply 금지”를 요청했다.

실제 모델:
1. cad.inspect(objectIds:[box]) → 성공.
2. solid.parameter(key:width,value:60) → 기존 planner가 update-primitive 생성.
3. 실제 validateCopilotEdit → Native Preview 성공.

A-preview.webcad.json의 width60 / depth30 / height20, 원래 object ID/Transform 보존을 확인했다. live authoring 문서와 history는 그대로다. Apply 호출은 없다. Review 가능한 기하를 API 수준에서 검증한 것이며 브라우저 UI 클릭/렌더 검증은 이번에 하지 않았다.

이는 규칙 생성이나 Mock 모델 결과가 아니다. provider의 실제 출력과 Native Preview frame을 별도 보존했다. 기존 원본을 수정하여 성공을 만든 것이 아니다.

## 5. Test B — 실제 거치대 조회 진입, 계획 실패

기존 v63 원본을 B-input-copy.webcad.json으로 복사했다. source와 copy SHA-256:

d0936d1165146066adb43d96e2ece7a20bd93ddb3eca5d84d3d173eac2fbcd8f

평가 후 두 hash와 live document가 보존됐다. 기존 intentional-overlap 및 사용자 설명은 삭제하지 않았다.

첫 모델 응답은 assembly.inspect, cad.objects2회, cad.inspect, assembly.motion.inspect를 요청했다. 이전 Phase0과 달리 실제 조회를 수행했다. 그러나 Motion optionsJson은 다음과 같이 잘못됐다:

    {jointId:"joint-1",start:0,end:90,partIds:["stand-plate","stand-support"]}

실제 Joint ID는 bearing이고 step / exceptions / tolerance도 필수다. native validator가 실패를 반환했다. 동일 response 안에 assembly.inspect가 먼저 있어도, 모델은 그 실행 결과를 보기 전에 뒤의 motion call 인자를 이미 작성한 상태였다.

후속 응답은 실제 bearing·현재 치수·의도와 실패 메시지를 받았지만 Motion을 다시 구성하지 않았다. 추가 assembly/geometry/parameter 조회 후 cad.parameters(call_1)를 동일 ID로 반복했다. 기존 전역 read ID 중복 검증에서 중단했다. Write나 Preview는 없었다.

이 실패를 “CAD 표현력 때문에 불가능” 또는 “정당한 설계 질문 종료”로 포장하지 않는다. **실제 모델의 구조화된 Motion read 계약 사용과 실패 복구가 아직 부족하다.**

이번 B는 성공한 Motion read가 없어 최소 요약을 실제 모델에 전달하는 단계도 실증하지 못했다. 요약 구현의 검증은 아래 집중 테스트 결과와 구분한다.

## 6. Motion 요약·Read-before-write

기존 registry에서 필요한7개 도구만 사용한다. 선택된 scalar parameter만 write에 포함하며 Joint-owned 이동/axis/reparent 등을 사용 가능한 해법처럼 제시하지 않는다.

간섭 write 전에는 선택 대상 cad.inspect, assembly.inspect, 성공한 motion read가 있어야 한다. current parameter 값은 captured solid contract를 재사용하여 불필요한 중복 조회를 일반적으로 강제하지 않는다. B는 이 gate를 통과하는 write를 만들지 못했다.

LLM transcript에만 motion-summary-v1 투영을 사용한다. pair별 관측을 묶되 모든 보고 row의 각도·raw/policy status·Common 체적·volume tolerance·구조적 관계·unknown/exception/reason·intent·source/revision·완료/경고를 남긴다. 같은 체적을 구조적 불변의 증거로 사용하지 않는다.

45-row 실제 Phase0 report를 이용한 단위 검사에서 누락 없는 압축을 확인했다. unknown/exception을 삽입한 합성 경계 사례도 별도로 확인했다. 원래 report가 변경되지 않고 요약 길이는 원문80% 미만임을 검사했다. 상세 pair/angle은 같은 기존 Motion 도구에서 partIds와 각도 범위를 좁혀 요청한다.

## 7. Native 오류 환류와 제약 보존

ToolSession.plan 또는 Native Preview 오류를 failed call/command, 현재 값·지원 범위, NO_OP/READ_REQUIRED/NATIVE_VALIDATION 이유, 원래 요청과 함께 모델에 반환한다. 최대2회이고 같은 거부 제안은 ID를 바꿔도 중단한다. 실제 source/selection/stale 검증은 그대로다.

이번 실모델 A는 첫 write가 유효해 복구가 필요 없었고, B는 read 단계에서 실패했다. 따라서 **실모델의 native 오류 복구 성공은 미검증**이다. 다음은 Mock provider/집중 테스트 결과다:
- no-op → 현재 값과 실패 tool 전달 → 다른 값으로 수정 성공.
- 같은 거부 반복 조기 종료.
- 서로 다른 오류 제안도 최대2회 재계획 후 중단.
- oversized context는 추론 전 거부, observed output 예약 초과도 성공 처리하지 않음.

추가 Native 단위 검사에서는 사람이 명시한 support width40 안이 Common 최대체적 약964.617→771.694mm³로 감소하고 Joints/axis/주석/비대상/History를 보존했다. 폭 증가, Joint frame 변경, stale baseline은 거부했다.

이 수동 Native 안을 B의 AI 성과로 세지 않는다. 오히려 원래 요청의 치수 수정에는 기존 CAD 명령 표현력이 존재함을 보여준다. 위치만 변경하는 별도 요구는 이번 scalar scope에서 미지원이고, 기존 Joint-owned 직접 이동 거부를 우회하지 않았다.

## 8. 집중 검증

최종 명령: apps/web에서 아래7개 test file을 tsx --test로 실행했다.

- agentContext.test.ts / agentNativePreview.test.ts (신규8 tests)
- localCopilot.test.ts / copilotConnection.test.ts / copilotPlanning.test.ts
- assemblyMotion.test.ts / cadMcpServer.test.ts

**49/49 통과, 실패0, skip0, 약4.30초. TypeScript --noEmit 통과.**

초기 실패는 추가 metadata에 대한 기존 exact-response assertion과 신규 Mock 응답의 Content-Type 누락이었다. proposal의 완전 동일성 assertion을 유지하면서 새 run 계약 검사를 추가했고 Mock HTTP 헤더를 바로잡았다. Recipe의 기존 의미/placement 안전 지침도 유지했다. 실패 테스트 삭제·skip·assertion 완화는 없다.

초기 로그와 최종 focused-final.log를 구분해 남겼다. 전체 unit suite, 전체 browser audit, 실제 브라우저 UI, workspace build는 미실행이다. 과거 테스트 통과를 이번 성공으로 합산하지 않았다.

## 9. 미해결과 다음 최소 단계

1. 먼저 기존 Motion read의 optionsJson 필수 필드·실제 Joint ID에 대한 상세 검증 피드백 또는 구조화된 인자 노출을 보완한다. 새 기하 연산은 필요 없다.
2. 한 응답에서 아직 모르는 Joint ID를 가정해 종속 read를 묶지 않도록 단계 라우팅을 보완한다. 성공한 현재 근거와 반복 조회를 구분하고, 중복 read ID는 현재처럼 명시적으로 거부한다.
3. 다음 예산이 주어진 별도 실행에서 B의 정상 Motion→최소 요약→write/질문까지 재측정한다. 이번6회 한도 때문에 추가 호출하지 않았다.
4. 실제 native-error 복구와 복잡한 UI Review/Cancel은 후속 대표 검증 과제다. Unit 성공만으로 실모델 복구가 입증됐다고 하지 않는다.

새 모델 학습·새 Solver보다 현재 도구 호출 계약의 실행 신뢰성을 높이는 작업이 우선이다. A의 완료 기준은 달성했지만 일반적인 자율 간섭 설계 Agent 완성을 선언하지 않는다.

## 10. 산출물

- 설계: ../architecture/AI-DESIGN-AGENT-PHASE-1A.md
- 실제 요청·모델 응답·native read·usage: output/verification/ai-agent-phase-1a/live.json
- 기계 판독 비교: output/verification/ai-agent-phase-1a/summary.json
- A-input.webcad.json / A-preview.webcad.json / B-input-copy.webcad.json
- live.mts / live.log: 실제 HTTP Gateway+Ollama 평가 하네스, provider 호출 수를6회로 제한
- focused-final.log / types.log / runtime-token-evidence.log / runtime-truncation-since-live.log

모든 파일은 원본과 별개이며 승인 없는 Apply는 수행하지 않았다.
