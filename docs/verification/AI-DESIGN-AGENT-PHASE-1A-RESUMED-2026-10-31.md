# AI Design Agent Phase 1A 재개 — 실제 평가 (2026-10-31)

**완료 기준 달성:** 실제 `qwen3-coder-32k:latest`가 현재 폭50mm를 조회하고 폭60mm로 바꾸는 명령을 만들어 기존 Native Preview까지 전달했다. Apply 호출은0이며 문서와 History는 불변이다. Test B의 위치 전용 변경은 현 작업의 미지원 기능으로 종료했다. 새 framework/kernel/solver/학습은 없다. SimReady GLB/B1 로더·Renderer 자원 코드는 수정하지 않았다.

## 실제 실행 결과

| 실험 | 모델 호출 | 모델 read 실행 | native 계획 시도 | 결과 | 입력 tokens | 출력 tokens |
|---|---:|---:|---:|---|---|---|
| A | 2 | 1 | 1 | valid-native-preview-not-applied | 1262,1056 | 58,61 |
| B (최종) | 5 | 5 | 0 | clarification | 1481,1974,2089,2386,2651 | 63,29,34,152,238 |
| C 오류 환류 | 3 | 1 | 2 | valid-native-preview-not-applied | 1289,1083,1363 | 58,32,61 |
| D 반복 중단 | 3 | 1 | 1 | rejected | 1282,1076,1349 | 58,32,32 |

- **A:** 모델 cad.inspect(box) → solid.parameter(width60) → update-primitive → validateCopilotEdit → previewCadCommand. Preview의 width60/depth30/height20, 객체 ID/Transform 보존 확인. 원본 (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/A-input.webcad.json`), Preview 문서 (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/A-preview.webcad.json`).
- **B:** 모델이 실제 assembly.inspect / cad.inspect / assembly.motion.inspect 등을 실행했다. 실제 bearing ID와 명시적 step90, exceptions[], tolerance1e-6를 사용했다. 최종 summary는 “지지대 위치 편집은 지원되지 않습니다”라고 응답했다. 치수·받침판 pose·Joint/축 보존 조건 아래 위치만 바꾸는 write 도구는 제공하지 않는다. 관통 감소를 달성했다고 집계하지 않는다.
- **C:** 평가자가 의도적으로 “먼저 현재 값50을 제안하고 native no-op 거부 후60으로 재계획”하는 오류 경로를 요청했다. 실제 모델이 width50을 제출하여 기존 planner의 `The dimension is unchanged`를 받고, 후속 모델 응답 width60이 Native Preview를 통과했다. 자연 발생 오류 복구와 구분하는 **명시적 오류 주입 실험**이다.
- **D:** 평가자가 실패 후에도50만 반복하도록 요청했다. 실제 모델의 같은 제안을 call ID/인자 순서와 무관하게 식별하여 두 번째 native 계획 실행 전에 중단했다. 실제 모델3회(조회/첫 제안/반복), native 계획 시도1회다. 승인·적용으로 우회하지 않았다.

최종 B의 후속 질문은 tool 이름/이미 읽은 정보를 다시 보여주는 등 품질이 낮다. summary의 미지원 판단과 질문 품질을 구분하며 완전한 자율 설계 Agent라고 주장하지 않는다.

## 16,384 설정에서 8,194가 남은 이유

현재 설치 버전은 **0.40.13**, 과거 실패 때는0.40.12다. [Ollama0.40.12 소스](https://github.com/ollama/ollama/blob/v0.40.12/llm/llama_server.go#L300), [0.40.13 소스](https://github.com/ollama/ollama/blob/v0.40.13/llm/llama_server.go)에서 확인했다.

초과 입력에 대해 fullPromptLimit=numCtx−1을 검사한 다음 context-shift 정책 `numCtx − max((numCtx−numKeep)/2,1)`을 사용한다. numCtx16384, numKeep4이면 **8194**다. Phase0의 입력17418/17490은16383을 넘어서 이 정책을 발동시켰다. num_ctx 무시나 모델 이름32k의 고정 한도, 출력4096 예약 때문으로 설명하지 않는다.

이번 실제 runner는 `-c 16384 -np 1 --context-shift --keep 4`, `/api/ps.context_length=16384`다. 런타임 기록 (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/runtime.json`)에 모델·버전·process args를 보관했다. 요청은 truncate:false, num_predict1024, task별 server-owned catalog/schema, 보수적 UTF-8 ceiling을 사용한다. 바이트를 정확한 tokens로 표시하지 않는다.

이번 최종 근거18회 호출의 실제 prompt_eval_count는 1056–2651 tokens, 입력 합30,561 / 출력 합1,271 tokens다. 모든 응답 done=true이고 입력이15360보다 작았다. 정확한 요청/응답이 live.json (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/live.json`), B-position-live.json (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/B-position-live.json`), repeat-live.json (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/repeat-live.json`)에 있다. 실행 중 서버 stdout 로그는 수집하지 못했으므로 “truncation warning0”이라는 로그 계측 수치는 주장하지 않는다. truncate:false 요청·작은 실제 입력·runner context를 근거로 판단했다.

## 재사용과 변경

기존 Copilot → Gateway → Ollama → CadToolSession → CommandBus detached Preview → Review/Apply 경로를 유지했다. 기존 Phase1A 보완을 조사한 뒤 다음 부분만 추가했다.

| 코드 | 변경 |
|---|---|
| `copilotTaskScope.ts` | 성공한 Assembly read로부터 실제 Joint·의도 target pair에 대한 Motion options 예시를 만든다. 사용한 call ID도 안내한다. Motion 모델 요약을 대상 pair로 제한한다. 명시적 위치 전용 요구와 축 보존에 어긋나는 clarification 옵션 검사를 추가한다. |
| `server/localCopilot.ts` | 치수 작업은5개 초기 tool → 조회 성공 후 write1개로 좁힌다. 간섭은 Assembly 조회 전 Motion을 노출하지 않으며, 필수 read 완료 후 불필요한 read를 제거한다. 위치 전용 요청에는 scalar write를 제거하고 미지원 설명을 안내한다. 작은 작업에 전체 recipe schema도 끼워 넣지 않는다. |
| `copilotConnection.ts` | 사용자가 조회를 명시한 치수 작업의 read gate. 검증 거부 내용을 기존 피드백으로 반환한다. 재정렬된 같은 제안과 call ID만 다른 제안도 반복 중단한다. 보존 조건에 반하는 axis/origin 편집 질문은 환류한다. |
| `validateAgentProposal.ts` | 위치만 바꾸라는 요청에서 update-primitive/update-extrude/set-variable로 치수를 바꾸는 충돌을 Preview 이전에 거부한다. 기존 Assembly/intent/non-target 보존 및 실제 Common 감소 gate를 유지한다. |
| 집중 tests | 실제45-row source의 target 요약, 위치 전용 보존 충돌 및 축 편집 clarification의 거부를 검사한다. |

MCP 전체 registry, CadToolSession의 bounded cad.inspect, v64 포맷, GLB 원본 바이트, 자원 캐시/Texture 품질 옵션은 변경하지 않았다. 모델에 GLB base64 또는 전체 노드 JSON을 보내지 않았다. 현재 source 정보만 필요한 경우 기존 externalAsset bounded inspect를 그대로 사용할 수 있다.

## Motion과 Test B의 기능 제약

평가자 별도 read에서 이전과 같은6개 부품/0·90·180도를 실제 커널로 재조회했다. native report45 rows / 10,018 bytes → 대상 support/plate3 rows / 1,377 bytes. 모델용 복사본만 투영하고 Native 원본은 불변이다. 원본 report (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/native-motion-full.json`), 제한된 요약 (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/native-motion-summary.json`).

이45-row 검사1회는 **평가자의 검사이며 모델의 read 성과에 더하지 않았다**. 실제 B 모델은 처음부터2개 부품으로 Motion을 좁혀 조회했고 그 summary를 후속 요청에서 받았다. 상태·각도·Common 체적·tolerance·상대 운동·의도·source version·생략 row 수를 유지한다.

support/plate의 Common은 원본0/90/180에서964.6170736148283mm³다. 의도 주석은 intentional-overlap / Designed mounting insertion이며 물리적 무관통을 의미하지 않는다. 실제 support는 Fixed Joint-owned child이고, bearing Revolute와 그 axis를 보존해야 한다. 현 scope에는 selected scalar dimension edit만 있고 Joint rest translation setter나 position-only 재배치 명령이 없다. axis/reparent를 대신 사용하거나 받침판 치수를 바꿔 성공으로 만들지 않는다.

원본 v63와 평가 복사본 SHA-256: `d0936d1165146066adb43d96e2ece7a20bd93ddb3eca5d84d3d173eac2fbcd8f`. 모든 실험에서 source 직렬화 불변/History0/Apply0을 기록했다. SimReady 원본 hash도 `ea517115d26fa35270eea13d7a612813d19612aac80230bd3bc1a34331ada356` 그대로다.

## 진단 중 발견과 실패도 보존

- 첫 재개 실행은 작은 catalog만으로 반복 조회가 멈추지 않아 A read-round limit, B context ceiling에서 종료했다. 진단 로그 (local-only, not in repository: `output/verification/ai-agent-phase-1a-resume/live.json`). 이것을 성공 횟수에 포함하지 않았다.
- 다음 진단에서 모델의 B height95 수정이 실제 관통을 줄여 Preview까지 갔지만 “위치만, 치수 유지”와 충돌했다. 해당 Preview를 성공으로 인정하지 않고 진단 자료 (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/conflict-diagnostic/live.json`)에 격리한 뒤 Native 보존 gate를 추가했다. 최종 B Preview는 생성하지 않았다.
- 미지원 설명의 후속 옵션에 Joint axis/origin 변경을 끼우는 문제도 발견해 native clarification 충돌 검사를 추가했다. 원 응답은 진단 자료로 유지했다.
- 전체 호출·token 비용은 summary.json의 diagnosticAndFinalLedger (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/summary.json`)에 별도로 적었다. 최종 근거18회 중 이전 B 질문 품질이 낮은5회가 포함되며, 최종 채택 A/C/D/B는13회다. 이전 시도의 실제 모델 비용을 숨기지 않는다.

## 집중 회귀와 제한

- agentContext / agentNativePreview / localCopilot / copilotPlanning / simready / projectBundle / historyState: **49 tests 통과**.
- `tsc -b`: 통과.
- SimReady B1 대표 hardware 브라우저: **57 checks 통과**. 실제 자원·공유·삭제·저장·Unmount 회귀를 재실행했다. 로그 (local-only, not in repository: `output/verification/ai-agent-phase-1a-final/simready-b1-browser.log`).
- 전체 suite와 전체 브라우저 감사는 실행하지 않았다. 이번 모델 제안의 Native Preview는 API/분리 문서에서 검증했으며, Copilot UI Review 버튼의 새 브라우저 클릭을 했다고 주장하지 않는다.
- A는 한 종류 Box 치수 변경 사례다. 일반 CAD 과제 성공률이나 완전한 자연어 보존 의미 해석을 뜻하지 않는다. 위치 전용 감지와 질문 충돌 검사는 명시적 문구에 대한 제한된 검사이며 모든 자연어를 포괄하지 않는다.
- 다음 최소 단계는 이미 조회한 사실을 사용자 질문으로 다시 내보내는 clarification 품질을 개선하고, 기존 inspect의 world pose 설명과 편집 가능 범위를 더 명확하게 하는 것이다. Joint rest 위치 편집을 지원할지는 별도 구현 결정이며 이번에 새 커널·solver를 만들지 않았다.
