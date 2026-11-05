# AI Design Agent Phase 0 — End-to-End Capability Evaluation

실행일: 2026-10-30 KST. **실제 Ollama 연결과 의도 해석은 성공했지만 자연어 간섭 감소 작업은 실패했다.** 두 계획 모두 현재 높이를 그대로 제안하여 기존 검증에서 거부됐다. 실제 문서를 읽고 수정·검증하는 AI 전체 흐름은 이번 실행에서 달성하지 못했다.

제품 코드·설정·의존성은 변경하지 않았다. output/verification/ai-agent-phase-0/evaluate.mts는 평가 하네스이며 새 제품 기능이 아니다. 전체 suite·브라우저 감사·빌드·파인튜닝은 실행하지 않았다.

## 1. 현재 Copilot / MCP 아키텍처

Copilot 입력 → 문서/선택/작업면/Layer/Revision 캡처 → copilotRequest / requestCopilotPlan → HTTP Gateway → Ollama JSON 제안 → CadToolSession read 또는 plan → 기존 Tool Planner → CadCommand → validateCopilotEdit → detached Preview → 사용자 Review/Apply/Cancel → 기존 CommandBus·History.

Read 결과는 제한된 후속 요청으로 모델에 돌아간다. MCP는 별도 진입점으로 공식 SDK stdio → loopback broker → editor bridge → 같은 CadToolSession을 사용한다. 이번 모델은 외부 MCP 프로토콜을 경유하지 않았다.

| 기능 | 실제 구현 근거 | 이번 검증 |
|---|---|---|
| Copilot 입력/연결 | apps/web/src/copilot/CopilotPanel.tsx:65, App.tsx:1010 | 실제 HTTP 모델 요청, 브라우저 입력 조작은 미실행 |
| Ollama/Gateway | apps/web/server/localCopilot.ts:57,103,128; vite.config.ts | 실제 설치 모델·응답. Mock 없음 |
| Design Intent | copilot/designIntent.ts:3,14; designStudy.ts:14; designStudyGateway.ts:13 | 실제 brief/questions 수신 |
| 도구 계약/계획 | copilot/cadToolContract.ts; copilotConnection.ts:141 | 95개 catalog와 실제 제안 검증 |
| CadToolSession | copilot/cadToolSession.ts:29 | snapshot, stale 검사, read/plan 분리 |
| MCP | server/cadMcpServer.ts:10; copilot/cadMcpRuntime.ts; server/cadMcpBroker.ts | 코드 감사. 외부 client pairing은 미실행 |
| Proposal/Review | App.tsx:1016; state/documentPlans.ts | Proposal 거부. Preview/Apply까지 미도달 |
| Geometry/Assembly/Motion | cadToolSession.ts; state/assemblyMotion.ts | 평가자 baseline에서 실제 실행 |
| 피드백 | CopilotQuestions.tsx; copilotPlanning.ts:35; designStudyGateway.ts:33 | 합성 피드백 1회. 실사용자 추가 응답 없음 |

Design Intent는 goal/requirements/assumptions/questions 문자열, qualities, object anchors와 design-study sidecar다. 모든 설계 제약을 실행 가능한 형태로 표현한 의미 모델은 아니다. 이번 anchors는 비어 있었다.

기본 연결은 rules이며 명시적으로 Gateway를 선택해야 모델을 호출한다(copilotSettings.ts). rules 문법·템플릿은 LLM으로 계산하지 않았다. design-explore에는 별도의 제한된 tool scope가 있으나 이번 ordinary 간섭 개선 경로의 성공을 뜻하지 않는다.

## 2. 실제 모델·연결·원본 보존

- 모델 qwen3-coder-32k:latest, Ollama http://127.0.0.1:11434.
- 기존 Vite Gateway http://127.0.0.1:5188/api/copilot/plan. status ready=true, vision=false.
- /api/tags·/api/show 설치 확인 후 /api/chat 실제 호출. 이미지 전송 없음.
- 서버 옵션 num_ctx=16384, temperature=0.15, intent num_predict=1600 / 일반 계획4096(localCopilot.ts:103).
- 모델 이름의32k가 실제 context 보장을 뜻하지 않는다. 런타임 로그에서 일반 계획 prompt가8194토큰으로 잘렸다.

v63 원본 output/verification/assembly-b25/annotated-laptop.webcad.json을 input-copy.webcad.json으로 복사했다. 두 파일 SHA-256은 d0936d1165146066adb43d96e2ece7a20bd93ddb3eca5d84d3d173eac2fbcd8f. 실행 후 원본/복사본 hash, 메모리 문서 직렬화가 그대로이며 history entries=0이다.

평가자가 stand-support 하나를 editable selection으로 사전 선택했다. 모델의 자율 대상 선택 성과가 아니다. 최초 일반 계획에는 평가자 baseline 결과를 몰래 주입하지 않았다.

## 3. 자연어 요구 분석

원문: “회전 기능은 유지하면서 지지대와 받침판 사이의 관통을 줄여줘. 다른 부품은 최대한 그대로 두고 싶어.”

사용자 지시서의 네 조건을 requirements에 제공했다: Revolute 유지, 회전축 위치 유지, support/plate 관통 감소, 비대상 부품 변경 최소화. 제조 공차·하중·재료·체결 방식은 미확정이고 Apply 금지임도 제공했다.

모델 brief는 네 조건을 문자열로 유지했고 미확정 제조 사항을 확정하지 않았다. **4/4는 제공된 조건의 텍스트 보존이며 자율 추출 정확도나 설계 이해 성공률이 아니다.**

질문3개 중 관통 위치와 축 위치·방향은 문서에서 조회할 사실인데 사용자에게 물었다. 허용 수정 질문에는 “회전 축의 재배치” 선택지가 있어 축 보존 요구와 충돌했다. 답변을 자동 선택하거나 의도를 확정하지 않았다.

검증 기준은 체적 감소, Joint/axis 보존, 0/90/180 검사, 비대상 변경 최소화, 승인 전 문서 불변이다. 이번에는 원본 보존만 충족했고 개선 목표는 달성하지 못했다.

## 4. 실제 도구 조회 기록

평가자 baseline: cad.objects → cad.inspect → cad.measure → assembly.inspect → assembly.motion.inspect. 실제 공유 ToolSession에서 모두 성공했다. Mock 형상이 아니다.

**모델 read 호출은0회였다.** 평가자5회 조회를 AI 성과로 계산하지 않는다. 모델은 두 번 모두 바로 solid.parameter를 호출했다.

| Object ID | 이름 | 원본 world Transform |
|---|---|---|
| stand-base | Cylinder | {"translation":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1]} |
| stand-shaft | Cylinder | {"translation":[0,0,8],"rotation":[0,0,0],"scale":[1,1,1]} |
| stand-turntable | Turntable D120x6 | {"translation":[0,0,20],"rotation":[0,0,180],"scale":[1,1,1]} |
| stand-support | Support H100 tilt15 | {"translation":[25,6,26],"rotation":[-14.999999999999998,-5.29668755766019e-31,180],"scale":[1,1,1]} |
| stand-plate | Laptop plate 240x200x6 | {"translation":[119.99999999999999,73.20508099999999,126.00000000000001],"rotation":[1.1179326710683829e-47,1.8257226031974783e-31,180],"scale":[1,1,1]} |
| stand-lip | Front lip H15 | {"translation":[120,73.205081,132],"rotation":[-3.3764806552727446e-63,-1.96016816025331e-47,180],"scale":[1,1,1]} |

전체 source params와 Transform은 analysis.json과 input-copy.webcad.json에 있다. cad.inspect는 관계와 기본 파라미터를 반환하지만 일반 world Transform 필드를 직접 반환하지 않는다. cad.measure bounds, cad.faces world frame 등의 추가 조회 경로는 있으며 이번 모델은 사용하지 않았다.

Ground는 stand-base. bearing은 base→turntable Revolute, parent-local origin [0,0,20]mm, axis [0,0,1], angle0°. Fixed 관계는 base→shaft, turntable→support, support→plate, plate→lip이다.

support/plate 주석은 intentional-overlap, 설명은 “Designed mounting insertion”이다. 이 주석은 실제 관통을 제거하지 않는다.

실제 0/90/180 검사 결과는45 rows, state=finished, kernel calls19, 약270.5ms의 작은 warm 검사다. support/plate 체적은 각도마다 **964.6170736148283mm³**, relativeMotion=invariant, exception=false이다. 대형 조립체 성능 보장이 아니다.

## 5. 계획 및 수정안

| 시도 | 입력 | 실제 모델 도구 제안 | 결과 |
|---|---|---|---|
| 최초 | 원문과 보존 조건 | solid.parameter {key:"height",value:103.527618} | 현재 높이와 같아 거부 |
| 재계획1 | 합성 “받침판 크기는 유지하고 지지대 위치만 바꿔줘.” + 이전 오류 | 동일 height=103.527618 | 동일 거부, 위치 변경 요구 미반영 |

solidParameterPlan(copilotSolid.ts:65)이 “The dimension is unchanged. Enter a different value.”로 거부했다. 등록된 도구2/2를 사용했지만 유효하게 컴파일된 CadCommand는0개다. 각 계획은1개 tool이며 관통 감소 효과가 없다.

평가자가 대신 유효한 수정안을 작성하지 않았다. 합성 피드백은 실제 사용자가 보낸 추가 지시가 아니다. 허용 최대2회보다 적은1회 재계획에서 중단했다.

## 6. 승인·Review 경로

실제 앱은 App.tsx:1016에서 validateCopilotEdit와 previewCadCommand를 통과한 안만 Review에 표시한다. Apply 시 최신 context와 검토 command를 재확인한다. 외부 MCP도 pending-review 영수증만 만들며 직접 publish하지 않는다.

이번에는 ToolSession.plan에서 거부되어 **Review 가능한 Preview에 도달하지 못했다.** applyCadPlan 호출0회, 사용자 승인 합성 없음. 브라우저에서 Preview를 보았다고 주장하지 않는다.

## 7. 변경 전후 검증

| 항목 | 이전 | 이후 |
|---|---|---|
| 관통 | 0/90/180 모두964.6170736148283mm³ | 새 형상·적용 없음. 개선 후 측정은 미실행 |
| Joint/axis | 원본 유효성·축 확인 | 문서 전체 동일, 보존 |
| 다른 형상/Transform/의도 | baseline 원본 | 전체 직렬화 동일 |
| 파일 | v63 원본/복사본 hash 동일 | 두 파일 hash 보존 |
| History | 0 | 0. 새 변경에 대한 Undo/Redo는 해당 없음 |

이전 B2/B2.5 테스트 성공을 이번 변경 적용 성공으로 기록하지 않았다. 승인된 변경이 없어 개선량을0%나 성공으로 꾸며 계산하지 않는다.

## 8. 실패 원인·미지원

### 입력 유실: 확인됨

Ollama 로그:

    limit=8194 prompt=17418 keep=4 new=8194
    limit=8194 prompt=17490 keep=4 new=8194

95개 catalog는61,460자, 첫 요청은65,685자였다. 런타임 입력 잘림은 확정이다. **어느 요구가 잘렸는지, 왜 limit이8194였는지, 잘림이 no-op의 유일한 원인인지는 미확인**이다. context 수정 A/B는 하지 않았다.

### 후속 검사 결과 수용 한계: 확인됨

평가자가 최초 요청에 실제45-row motion 결과 하나만 붙여 계약 probe를 수행했다. 75,744자로 HTTP422 “Model context is too large. Select fewer objects, shorten notes or reduce the tool transcript.” 응답이다. 기존70,000자 한도에서 추론 전에 거부됐다(localCopilot.ts:91). 이것은 AI의 자율 조회나 추가 LLM 호출이 아니다.

연결은 성공, 출력 의미는 no-op2회 실패, context 설정/계약 문제는 위 두 증거로 확인됐다. 커널 baseline은 성공하여 이번 실패를 커널 결함으로 볼 근거가 없다.

위치만 변경하는 요청도 현재 노출 경로의 한계가 있다. gateway legacy move는 finite2D용(copilotEdit.ts), Joint-owned child 직접 Transform 변경은 evaluateAssembly가 거부한다. assembly.joint.edit는 origin/axis/limits만 노출하고 arbitrary Rest translation setter는 아니다. “support만 이동하고 하위 plate world pose 보존”의 원자적 성공 경로는 이번에 확인하지 못했다. 이를 지원하는 것처럼 흉내 내지 않았다.

## 9. 평가 지표

| 지표 | 관측 |
|---|---|
| 조건 보존 | 제공된4조건 문자열4/4, 단 축 재배치 선택지1개 모순 |
| 등록 tool 사용 | 2/2, 유효하게 컴파일된 수정 command0 |
| 잘못된 호출 | schema 오류0, 의미상 no-op 거부2 |
| 모델 조회 / 평가자 조회 | 0 / 5 |
| 계획 / 재계획 | 최초1 + 합성 재계획1, 각1tool |
| 승인 전 문서 변경 | 없음 |
| Apply 성공 | 미실행: 승인·유효 계획 없음 |
| 관통 변화 | 새 형상이 없어 미측정 |
| Joint 보존 | 전체 문서 불변 |
| 자동 실험 런 시간 | 53,525ms. 감사·보고 작성은 별도 미계측 |
| 모델 호출 | 3: intent1+planning2, 별도 추론 없는 계약 probe1 |
| 토큰 | intent input1015/output633. 일반 계획 원 입력17418/17490, retained8194씩. completion/전체 합계 미측정 |
| 실패 후 수정 | 합성 피드백1회 실패, 실제 추가 사용자 응답0 |

일반 계획 응답은 usage를 노출하지 않는다(localCopilot.ts:125는 task가 있고 toolCalls가 없을 때 run 반환). 미측정을0으로 처리하지 않았다.

미실행: 전체/집중 테스트 suite 재실행, 브라우저 클릭·렌더·screenshot, 외부 MCP client pairing, 새 변경의 저장/Undo/Redo. 기존 테스트 기록과 이번 live 결과는 별개다.

## 10. 누락 기능과 다음 최소 단계

기존 커널·ToolSession·Review·CommandBus를 교체할 근거는 없다. 먼저 기존 경로의 작은 개선 후 같은 실험을 재측정하는 것이 적절하다.

1. 작업별 tool catalog scope와 실제 token budget 검증. 해당 작업의 조회/치수/Assembly 도구만 제공하고 runtime truncation을 감지한다. num_ctx만 늘려 해결됐다고 간주하지 않는다.
2. Motion 결과의 예산 내 요약·분할. pair/각도/수치/불확실성/의도/provenance를 유지하면서 실제 검사 결과가 후속 요청에 들어가도록 한다.
3. 조회 선행과 native 검증 오류의 제한된 재계획 연결. 기존 ordinary loop는 read 결과를 전달하지만 local plan/preview 오류를 모델로 자동 환류하지 않는다.
4. 유지 요구를 기존 Preview diff와 Assembly 검사에 결합. brief 문자열만으로 Joint/axis/비대상 변경이 검증되지는 않는다.
5. 위치만 변경이 필요하면 별도 작업에서 기존 Joint rest/lifecycle API의 표현 가능성을 먼저 확인한다. 이번에는 새 이동 명령·solver를 구현하지 않았다.

새 프레임워크나 파인튜닝보다 현재 Gateway가 실제 CAD 상태를 읽고 검증 피드백을 활용하도록 만드는 것이 우선이다.

원시 근거: output/verification/ai-agent-phase-0/evaluation.json, analysis.json, payload-size-probe.json, ollama-truncation.log, input-copy.webcad.json, evaluate.mts, evaluate.log.

**종료 판단:** 실제 AI 연결은 검증됐지만 이 설계 작업의 End-to-End 능력은 미달이다. 기존 검사와 안전한 거부는 작동했다. 무승인 Apply나 새 기능으로 성공 사례를 만들지 않고 종료한다.
