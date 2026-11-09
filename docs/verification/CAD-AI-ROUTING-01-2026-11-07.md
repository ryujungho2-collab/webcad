# CAD-AI-ROUTING-01 — Selected-object Tool Scope and Context

2026-11-07. **완료 — 선택한 편집 가능한 live Loft의 연결 변경 범위.** 기존 실패와 동일한 source hash 및 한국어 요청으로 실제 로컬 모델이 조회 → 기존 편집 도구 제안 → Native Preview에 도달했다. 입력 한도·Native 권한 검증·사용자 Apply 정책을 완화하지 않았다. 다른 카드는 시작하지 않았다.

## 변경과 재사용

제품 변경은 4개 파일이다.

- `apps/web/src/copilot/copilotTaskScope.ts`: 기존 `CAD_TOOLS`를 필터링하는 함수에 선택 상태를 추가했다. 실제 feature type이 loft이고 연결 변경 요청일 때 전용 범위를 선택한다. 정확히 하나의 visible/unlocked/independent/live loft 및 2–10개 입력인 경우만 `solid.loft.update`를 안내한다. 나머지는 read-only다. 객체 이름은 조건이 아니다.
- `apps/web/src/copilot/copilotConnection.ts`: 현재 문서로부터 선택 요약을 만들고 같은 scope를 사용한다. 대상 loft의 실제 `cad.inspect`가 성공해야 write를 계획할 수 있다. 다른 객체의 조회는 이를 충족하지 않는다. 해당 범위의 raw command/recipe/다른 도구 응답은 거부한다.
- `apps/web/server/localCopilot.ts`: 클라이언트가 보낸 도구 정의를 사용하지 않고 기존 서버 카탈로그에서 동일한 scope를 구성한다. 최초 도구는 `cad.inspect`, `cad.measure`, `solid.loft.update` 3개이며 대상 조회 후에는 편집 도구 1개로 좁힌다. Loft 전용 요청에서는 불필요한 recipe·scalar contract·Assembly 안내를 제외한다.
- `apps/web/src/copilot/cadToolSession.ts`: 기존 `cad.inspect`의 Loft 결과에 실제 저장된 `loft.ruled`, sourceCount, dependencyMode를 추가했다. 원본 BRep이나 임의 쓰기 권한은 제공하지 않는다.

기존 `createCadToolSession.plan`, `solid.loft.update`, `update-loft`, `prepareCadCommand`, Native 유효성 검사, Preview/Review/Apply와 History를 재사용했다. 커널·CommandBus·재생성·모델을 추가하거나 교체하지 않았다. 새 온톨로지 저장소나 도구 레지스트리는 없다.

평가 보조 변경:

- `apps/web/evaluation/loftIntentEvaluation.ts`: 현재 실제 요청의 선택 요약을 사용해 route를 감사한다. 감사 자체가 읽기 전용임을 `auditIsReadOnly`로 표현한다.
- `apps/web/scripts/evaluateCadDesign.ts`: `--replay`로 과거 합성 fixture를 읽고 이전 source hash와 직렬화 hash를 확인한 뒤 실행한다. 다른 task/문서/개수/변경된 hash는 거부한다.
- `apps/web/tests/copilotRouting.test.ts`: 범위·컨텍스트·Native 보호·입력 예산·read-before-write·오류 회복·우회 거부 7개 검사.
- `apps/web/tests/loftIntentEvaluation.test.ts`: 변경된 감사 필드에 맞춰 읽기 전용 계약을 확인한다.

기존 사용자 변경과 이전 카드 산출물을 보존했다. commit/push는 하지 않았다.

## 권한과 오류 계약

선택 요약은 **라우팅 힌트**다. Gateway가 원본 CAD 문서를 보유해 독립적으로 권한을 인증하는 구조가 아니다. 실제 캡처된 문서·선택·revision은 기존 CadToolSession이 검증하고, Native planner가 잠금·visible·소유·live·참조·no-op 조건을 다시 확인한다. 위조된 안내 정보가 Native 편집 권한을 만들지 않는다.

최대 read-round/replan 횟수와 timeout, `num_ctx=16384`, `num_predict=1024`, `truncate=false`, 기존 바이트 예산 검사 및 관측 토큰 예약 검사는 유지했다. 바이트를 토큰으로 해석하지 않는다.

Loft 실패 피드백에는 실패한 제안·이유·필요 조회·지원 범위만 추가한다. 같은 요청에 이미 있는 요구사항과 scalar contract를 반복 복사하지 않는다. 원본 요청은 매 요청에 유지한다. 다른 parameter/interference 경로의 피드백 계약은 변경하지 않았다.

집중 테스트에서 기존 반복 차단과 새 read-before-write의 상호작용을 발견했다. 조회 전에 거부된 제안을 실제 대상 조회 후 다시 제출해도 같은 실패로 처리했다. **Loft의 READ_REQUIRED 선행 조건이 실제로 충족된 경우에만** 해당 이전 거부를 해소하도록 수정했다. Native 거부·no-op의 반복 차단과 최대 2회 재계획은 유지한다. 조회 없이 같은 제안을 반복하는 우회는 허용하지 않는다.

## 동일 입력 실제 모델 결과

이전 근거:

`output/verification/cad-eval-03/2026-11-07T07-31-19.088Z/`

이번 실행:

`output/verification/cad-ai-routing-01/2026-11-07T07-47-25.375Z/`

두 실행의 한국어 사용자 prompt가 문자열 단위로 동일하고, source hash도 같다:

`7fb094206ee0388206352c63ad5bf7d07d9c6177a205f742708c976d6e56f1f9`

이번에도 source hash 전후 동일, Editor Apply 0, 원본/editor/History 불변이다. 과거 파일을 덮어쓰거나 성공 사례로 수정하지 않았다.

| 항목 | 이전 CAD-EVAL-03 | 이번 실행 |
|---|---|---|
| 입력 형상/요구 | 동일 fixture와 prompt | 동일 |
| 최초 일반 카탈로그 | 13개, loft 편집 도구 누락 | 전용 3개 |
| 대상 조회 후 카탈로그 | 추론 전 중단 | 편집 도구 1개 |
| 실제 모델 호출 | 0 | **2** |
| 실제 모델 조회 | 0 | `cad.inspect(intent-loft)` 1회 |
| 실제 제안 | 없음 | `solid.loft.update({objectId:"intent-loft",ruled:false})` |
| Native 모델 후보 | 없음 | 1개, **9/9 조건 통과** |
| 결과 | UTF-8 입력 예산 사전 거부 | **Native Preview 성공, 미적용** |

모델은 기존 Ollama `qwen3-coder-32k:latest`다. engine 보고 입력 tokens 1,155/1,083, 출력 60/64, 합계 입력 2,238·출력 124다. 모델 messages의 UTF-8 bytes는 4,826/4,437이며 tokens와 구분한다. 두 응답 모두 `done_reason=stop`, repair 0이다. 별도의 정확한 내부 유지 토큰 계측이나 일반적 성공률 추정은 하지 않았다.

Gateway 시간은 17,168/1,048 ms, fixture replay·Native 대조·투영 생성까지 포함한 runner 총 시간은 21.123초다. 첫 호출의 준비 비용을 분리 측정하지 않았고 일정 속도를 보장하지 않는다.

실제 모델 제안으로 OpenCascade 유효성, 원본 3단면·순서·live 관계·객체·월드 배치·마감·보호 블록 보존, 형상의 실제 변화, 직렬화 왕복을 확인했다. smooth 모드의 체적은 40,623.705017269036 mm³, 원래 ruled 체적은 52,621.676947629036 mm³다. G1/G2나 물리 성능 인증이 아니다.

raw `tool-route-audit.json`의 `productRoutingChanged:false`는 이전 평가기가 고정 기록하던 필드다. 이번 제품 변경 여부의 판정으로 사용하지 않는다. 현재 보조 함수는 `auditIsReadOnly`로 의미를 명확히 했고, 실제 카드 변경과 실행 전후 요약은 `routing-verification.json`에 구분했다. raw 실행 증거는 보존했다.

## 이번 검증

- 집중 회귀 8개 파일 **48/48 통과**, fail/skip 0.
- 마지막 raw-command/recipe 우회 방지 테스트 추가 및 감사 메타데이터 정리 후, routing/loft 평가 **10/10 재통과**. 이 중 9개는 앞선 회귀와 중복이다. 합계 **49종**의 검사이며 58개로 합산하지 않는다.
- strict TypeScript 검사 통과. 제품 web build에서도 `tsc -b` 통과.
- 대표 Edge `loftEdit`: **13/13 통과**. Inspector Preview/Apply, Undo/Redo, 규칙 기반 자연어, 실제 stdio MCP와 공유 폼의 편집 전환, cache 저장·페이지 재열기/Native 체적 재현을 확인했다.
- `pnpm --filter @agent-webcad/web build`: **통과**. 큰 chunk와 Zod 주석 처리 경고가 발생했다. 이번 카드에서 번들 최적화는 하지 않았다.
- 아키텍처 검사 **968 모듈 통과**.
- `git diff --check` 통과. 기존 작업 트리의 CRLF 안내가 있다.

실제 LLM 성공은 격리된 평가 runner의 결과다. 브라우저 13개 검사는 **기존 UI/Native/MCP 회귀**이며 브라우저 채팅에서 실제 LLM까지 연결한 E2E로 보고하지 않는다. 전체 unit suite, 전체 브라우저 감사, workspace 전체 build, STEP 독립 엔진 검사는 미실행이다. 이전 통풍 과제의 실제 LLM 실패가 해결됐다고 주장하지 않는다.

대표 브라우저 runner의 기존 출력 `output/verification/loft-edit/browser-report.json`은 실행 전 백업하고 새 결과를 이번 실행 디렉터리에 복사한 뒤 원본 bytes로 복원했다. hash 일치를 확인했다. 기존 이미지·CAD 파일은 덮어쓰지 않았다.

초기 추가 테스트 18개 중 2개가 READ_REQUIRED 이후 재제안 차단으로 실패했고 위 제한된 수정 후 통과했다. 최초 별도 타입 검사는 새 테스트가 `construction=true`라는 잘못된 타입의 fixture를 쓴 문제로 실패했다. 실제 pattern/construction 정의를 사용하도록 테스트를 수정했고 이후 strict 검사와 build가 통과했다. 실패를 skip하거나 assertion을 제거하지 않았다.

## 재현과 한계

Workspace root에서:

```powershell
pnpm --filter @agent-webcad/web exec tsx scripts/evaluateCadDesign.ts --task=loft-connection --replay=<workspace>/output/verification/cad-eval-03/2026-11-07T07-31-19.088Z --live --max-model-calls=4
pnpm --filter @agent-webcad/web exec tsx --test tests/copilotRouting.test.ts tests/agentContext.test.ts tests/loftEdit.test.ts tests/loftIntentEvaluation.test.ts tests/mountingPlateEvaluation.test.ts tests/cadDesignEvaluation.test.ts tests/copilotPlanning.test.ts tests/localCopilot.test.ts
```

이번 실제 증거는 `task.json`, `input.webcad.json`, `model-trace.json`, `gateway-trace.json`, `events.json`, `report.json`, `routing-verification.json`, `preview.webcad.json`, `model-preview-*.svg`, `loftEdit-browser-report.json`이다. SVG는 실제 Native tessellation 투영이며 브라우저 스크린샷과 구분한다.

이번 전용 경로는 **선택한 기존 live loft의 연결 방식 변경**까지다. 전체 CAD 기능에 대한 의미 기반 라우팅, 모든 일반 요청의 컨텍스트 압축, 여러 피처를 연속 생성하는 에이전트, 학습 시스템을 구현한 것은 아니다. 향후 다른 도구를 노출할 때도 실제 도구 계약·대상 상태·Native 권한과 개별 회귀를 먼저 확인해야 한다.
