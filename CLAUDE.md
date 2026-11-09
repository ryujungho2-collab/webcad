# WebCAD — Claude 개발·제품 인수인계 지침

작성·현황 확인: **2026-11-08, Asia/Seoul**. 이 문서는 이전 대화 없이 작업을 이어가기 위한 지침이다. 이후 사용자의 명시적 요청과 실제 코드·실행 증거를 우선한다. 이 파일을 읽었다는 이유로 구현·테스트·외부 모델 호출·병합을 자동 시작하지 않는다.

## 1. 사용자가 만들고자 하는 것

**다양한 실제 제품·기계·구조물의 복잡한 설계를 끝까지 수행할 수 있는 CAD를 만들고, 검증된 설계 능력을 전문 에이전트로 묶어 오케스트레이션한다.** 오픈소스 기반으로 장기적으로 물리 해석까지 연결한다.

- 사용자가 보여준 [ARM 프로젝트](https://github.com/ZED0XBIT/ARM/)의 로봇팔은 원하는 결과물의 복잡도와 설계 수준을 설명하는 예시다. 다음 제품을 반드시 로봇팔로 정했다는 뜻이 아니다.
- 특정 데모에만 맞는 생성기보다 서로 다른 프로젝트에서 재사용되는 부품 설계·수정·조립·검증·출력 능력을 쌓는다.
- 벡터 기반 2D, 파라메트릭 BRep, Mesh/자유형상, Assembly, 연관 도면을 이어야 한다. 형상을 처음 만드는 것과 후속 설계 변경을 일관되게 처리하는 것을 함께 평가한다.
- 사용자가 지향하는 흐름: **설계 요청 → 요구·제약 확인 → 도구 계획 → 격리 문서 실행 → Native 검증 → Preview/Review → 사용자 승인 Apply → 결과·실패 이유 기록 → 제한적 재계획**.
- 온톨로지는 기능 구현과 함께 구축한다. 객체의 역할·관계·설계 의도·사용 가능한 도구·검증 근거를 연결하고, 에이전트가 실제 CAD를 사용할 수 있게 한다.
- 기하·편집·검증은 모델 학습이나 LLM 연결 없이도 동작해야 한다. 실제 외부 모델을 사용한 성공은 별도로 측정한다.
- 제조·구조·해석으로 확장할 때 재료·하중·경계조건·단위·허용 오차를 명시한다. 사용자가 제공하지 않은 설계 조건을 확정하지 않는다.

**진척도의 기준은 “기능 몇 개, 테스트 몇 개”가 아니라 “어떤 수준의 설계 작업을 어디까지 완주하고 수정할 수 있는가”다.** 코드 품질·CI·안전한 저장은 그 능력을 유지하는 기반이다.

### 사용자와 일하는 방식

- 한국어로 명확하고 솔직하게 설명한다. 실제 결과를 먼저 말하고 근거·한계를 붙인다.
- 사용자는 기능 카드·온톨로지·검증의 연결을 원하며, 반복 승인 질문과 끝없는 계획 작성에 피로를 느낀다. 승인된 범위의 일상적·가역적 작업은 스스로 완료한다.
- 구현 요청이면 실제 코드·관련 검증까지 수행한다. 조사 요청이면 구현을 시작하지 않는다. “카드 하나만”이면 후속 카드를 자동 시작하지 않는다.
- 복잡한 CAD를 만드는 최종 경험과 현재 작업의 관계를 설명한다. 테스트 수나 큰 부품 수를 미적 품질·산업적 완성도·AI 자율성으로 바꾸어 말하지 않는다.
- 막혔을 때 이유를 특정하고 작동 범위·미해결 항목을 보고한다. 미확인 결과를 성공이나 기존 결함으로 단정하지 않는다.

## 2. 인수 시점의 정확한 기준선

아래는 **작성 시점의 관측값**이다. 새 세션에서는 다시 확인한다.

| 항목 | 2026-11-08 확인 내용 |
|---|---|
| 로컬 작업 경로 | `<workspace>` — 다른 장비에서는 실제 checkout 경로 사용 |
| 저장소 | `https://github.com/ryujungho2-collab/webcad` |
| 현재 브랜치 | `codex/checkpoint-2026-11-07` |
| 현재 HEAD | `8566dd8deaef31a6cf90e245706d8aa9291c08c3` |
| 앞선 체크포인트 | `eae2099`, `7f6e26a` — 개발 이력이며 되돌릴 대상 아님 |
| PR | [#1](https://github.com/ryujungho2-collab/webcad/pull/1), OPEN, 당시 MERGEABLE/CLEAN. **main 병합은 하지 않음** |
| 원격 검증 | [CI 42375506122](https://github.com/ryujungho2-collab/webcad/actions/runs/42375506122), HEAD `8566dd8`, QA·Dependency audit SUCCESS |
| CI 실제 실행 | 명시적 fixture/순위/architecture 검사 12개, 기존 QA 검사 238개, 모두 fail/skip 0. 두 묶음에 중복 있으므로 고유 검사 수로 합산하지 않음 |
| CI 나머지 결과 | architecture 970 모듈·문서 링크, TypeScript/Vite build 통과. `pnpm audit` 당시 알려진 취약점 0 |
| 최근 보안 패치 | Vite 7.3.7, source-map-js 1.2.2. 취약점 정책·검사를 우회하지 않음 |
| 미포함 검증 | 위 CI는 전체 root-level unit suite·전체 browser audit·실제 AI 설계 능력·물리 해석의 통과 증거가 아님 |

기존 tracked 변경은 인수 지침 작성 전 없었다. `output/`에는 대형 프로젝트·개인 원본·과거 실행 결과 등 많은 **미추적 로컬 파일**이 남아 있다. Git에 없다는 이유로 삭제하거나 새로 생성한 파일로 취급하지 않는다. 이 지침서 자체는 위 커밋 이후의 문서 추가이며 위 CI로 검증됐다고 주장하지 않는다.

`PROJECT-STATE.md`, `NEXT-STEPS.md`, 오래된 실행 가이드는 많은 이력이 누적돼 있다. 첫 문단이나 “다음” 목록이 최신 제품 우선순위를 뜻한다고 가정하지 않는다. 사용자 최신 방향·실제 HEAD·날짜별 근거를 대조한다.

## 3. 새 세션 시작 절차

처음부터 모든 문서·전체 저장소를 다시 감사하지 않는다. 5–10분 안에 작업 범위를 잡는다.

```powershell
git status --short
git branch --show-current
git log -5 --oneline
git diff --stat
git diff --cached --stat
```

1. 적용되는 `AGENTS.md`, `CLAUDE.md`, 사용자 최신 요청을 확인한다. 기존 변경의 소유와 작업 경계를 구분한다.
2. 아래 최소 문서를 읽고, 이번 대상 기능의 소스·기존 테스트·최신 보고서만 추가로 읽는다.
3. 기대하는 사용자 결과, 유지할 불변조건, 변경 예상 모듈, 관련 검증과 예산을 짧게 알린다.
4. 읽기 전용 조회로 확인할 수 있는 문서 사실은 사용자에게 다시 묻지 않는다. 재료·제조 공차 같은 실제 설계 결정은 필요하면 묻는다.
5. 기존 구현으로 가능한지 먼저 시도한다. 기능이 부족하다는 결론에는 실제 실패 지점·호출 계약·재현 근거가 있어야 한다.

우선 읽을 자료:

- [최근 개발 체크포인트](docs/verification/CHECKPOINT-2026-11-07.md)
- [필수 테스트 입력과 선택 산출물 정책](docs/verification/TEST-INPUTS-AND-ARTIFACTS.md)
- [기능 온톨로지](docs/architecture/WEBCAD-CAPABILITY-ONTOLOGY.md)
- [기존 카드 실행 가이드](docs/implementation/CAD-FEATURE-ONTOLOGY-EXECUTION-GUIDE-2026-11-06.md)
- [수정 위치 지도](docs/architecture/CHANGE-GUIDE.md), [의존 방향](docs/architecture/DIRECTORY-STRUCTURE.md)
- [현재 기능 안내](docs/features/README.md) — 문서 갱신일과 실제 코드의 차이를 확인

기존 가이드의 특정 모델명·과거 시작 브랜치·첫 카드 이름은 역사적 실행 조건이다. 이를 따라 완료된 CAD-LAYER-01부터 재실행하거나 모델을 고정하지 않는다.

## 4. 실제 아키텍처와 재사용 위치

현재 주력은 **TypeScript + React + Three.js + OpenCascade/WASM + Worker**다. Rust 기반 제품이라고 전제하지 않는다. Node/Vite 서버, Ollama/Gateway, MCP가 연결된다. 독립 headless CAD 패키지와 범용 에이전트 오케스트레이터가 완성됐다고 가정하지 않는다.

명시된 디렉터리 경로는 저장소 루트 기준이고, 같은 행의 짧은 파일명은 직전에 명시한 디렉터리에 속한다. 현재 심벌을 검색해서 확인하며 예전 줄 번호를 그대로 믿지 않는다.

| 책임 | 먼저 조사할 구현 |
|---|---|
| 문서·객체·파일 | `packages/cad-document/src/CadDocument.ts`, `CadObject.ts`, `FeatureContract.ts`, `serialization.ts`; `apps/web/src/state/documentFile.ts` |
| 명령 계약·검증 | `packages/cad-commands/src/commands.ts`, `validator.ts` |
| 트랜잭션·실행 | `apps/web/src/state/commandBus.ts`, `dispatchCadCommand.ts` |
| Preview/Apply·History | `apps/web/src/state/documentPlans.ts`, `history.ts`, `documentSession.ts` |
| 의존성과 재생성 | `apps/web/src/state/dependencyGraph.ts`, `featureRegeneration.ts` (`liveFeatureInputs`) |
| 스케치·수치 연산 | `apps/web/src/precision/` (`sketchSolver.ts` 등), `packages/cad-document/src/`의 스케치 계약 |
| BRep 커널·Worker | `packages/cad-kernel/src/operations/`, `apps/web/src/cad/kernelGeometryService.ts`, `kernel.worker.ts` |
| 렌더·선택·입력 | `apps/web/src/viewport/CadViewport.tsx`, `apps/web/src/features/drawing-editing/`, `apps/web/src/properties/`, `apps/web/src/commands/paletteCommands.ts` |
| Mesh 위상·편집 | `packages/cad-document/src/EditableMesh.ts`, `MeshTopology.ts`, `PolygonMeshOperations.ts`, `MeshProvenance.ts`; `apps/web/src/state/meshCommands.ts` |
| Nodes·비동기 평가 | `packages/cad-document/src/GeometryNodes.ts`; `apps/web/src/state/geometryNodeCommands.ts`; `apps/web/src/cad/geometryEvaluationClient.ts`, `geometryEvaluation.worker.ts`, `geometryEvaluationProtocol.ts` |
| Sculpt·Remesh | `packages/cad-document/src/MeshSculpt.ts`, `MeshRemesh.ts`; `apps/web/src/state/sculptCommands.ts`, `sculptSession.ts`; `apps/web/src/viewport/sculptInteraction.ts` |
| Hybrid·재구성 | `packages/cad-document/src/HybridReference.ts`, `PlanarReconstruction.ts`, `PlanarHealing.ts`; `apps/web/src/state/hybridCommands.ts`, `hybridReferences.ts`; `packages/cad-kernel/src/operations/planarReconstruction.ts` |
| Assembly·간섭 | `packages/cad-document/src/Assembly.ts`, `InterferenceIntent.ts`; `apps/web/src/state/assemblyCommands.ts`, `assemblyMotion.ts`, `interferenceTriage.ts`, `assemblyDrive.ts`; `apps/web/src/properties/AssemblyPanel.tsx` |
| 공통 도구·세션 | `apps/web/src/copilot/cadToolContract.ts`, `cadToolSession.ts`, `cadModelingTools.ts`, 도메인별 `*Tools.ts` |
| 자연어·계획·의도 | `apps/web/src/copilot/copilotConnection.ts`, `copilotPlanning.ts`, `copilotTaskScope.ts`, `designIntent.ts`, `designStudy.ts`, `validateAgentProposal.ts` |
| Gateway·MCP | `apps/web/server/localCopilot.ts`, `cadMcpServer.ts`, `cadMcpBroker.ts`; `apps/web/src/copilot/cadMcpRuntime.ts` |
| 온톨로지·관계 | `apps/web/src/ontology/capabilities/`; `apps/web/src/state/profileExtrudeRelations.ts`, `apps/web/src/properties/DependencyNotice.tsx` |
| NVIDIA 읽기 전용 파일럿 | `apps/web/server/autoOntologyPilot.ts`, `apps/web/src/ontology/profileExtrudePilot.ts`, `apps/web/src/properties/AutoOntologyRelationPilot.tsx` |
| 출력 | `apps/web/src/export/`, `apps/web/src/interop/`의 실제 format별 경로 |
| 설계 평가 | `apps/web/evaluation/`, `apps/web/scripts/evaluateCadDesign.ts` |

커널 공개 API 이름이나 패키지 export만으로 지원 완료를 판단하지 않는다. STEP/STL/IGES 등의 실제 앱 경로와 명시적 미지원 API를 구분하고, 이미 있는 구현을 다시 작성하지 않는다.

## 5. 현재 성과와 지원 경계

아래는 재사용할 자산 목록이다. 각 영역의 모든 옵션·성능·회귀가 검증됐다는 선언이 아니다.

| 영역 | 보유 자산과 주의할 경계 |
|---|---|
| 2D CAD | 작도·구속·편집·해치·치수·블록·레이어·표시 순서. 최근 CAD-LAYER/STYLE/ORDER/DIMSTYLE/COMPONENT 카드 완료 범위는 개별 보고서를 따름. AutoCAD 전체 호환을 뜻하지 않음 |
| 3D | BRep 피처·live 원본·연관 도면·기존 설계 변경 경로. 스냅샷과 live, 표시 치수와 구동 치수를 구분 |
| Hybrid | Polygon Mesh, 제한된 modifier/Nodes/Sculpt/Remesh, 표면 참조·Datum·Bake·평면 재구성 자산. 범용 자유곡면 역설계와 동급으로 취급하지 않음 |
| Assembly | Fixed/Revolute, lifecycle·Inspector·gizmo, 이산 운동 간섭·설계 의도 주석 자산. 코드에는 이후 확장도 있으므로 두 타입만 있다고 단정하지 않음. 범용 구속 solver·접촉 물리·연속 충돌 완성은 아님 |
| 온톨로지 | capability 설명 모델, 직접 Profile ↔ Extrude 근거 조회, 소형 합성 외부 파일럿. 전체 설계 의미·물리 해석 온톨로지 완성은 아님 |
| AI | 공통 도구·세션·권한 검증·제한적 read/replan·격리 Native 평가. 일반적인 복잡 프로젝트 자율 생성과 전문 에이전트 협업은 미입증 |

### 실제 AI 증거를 정확히 이어받기

- [CAD-EVAL-01](docs/verification/CAD-EVAL-01-2026-11-07.md): 통풍 설계 목표를 위한 실제 모델 실행은 목표 달성 실패. 평가 harness가 작동한다는 사실과 모델 성공을 구분한다.
- [CAD-EVAL-02](docs/verification/CAD-EVAL-02-2026-11-07.md): 기존 장착판 폭 변경, 보존 조건 20/20, 실제 모델 2회 호출 후 Native Preview. 승인 Apply나 전체 모델의 AI 생성 성공이 아니다.
- [CAD-EVAL-03](docs/verification/CAD-EVAL-03-2026-11-07.md): 이전 Loft 요청은 Gateway context budget에서 차단돼 모델 추론 0회였다.
- [CAD-AI-ROUTING-01](docs/verification/CAD-AI-ROUTING-01-2026-11-07.md): 같은 원본 hash·한국어 요청으로 선택 live Loft 범위를 3개 도구→조회 후 1개로 좁혀 실제 Ollama 2회 호출, Native 9/9 Preview 성공. 기존 다른 과제의 실패까지 해결된 것은 아니다.
- 위 모델은 당시 `qwen3-coder-32k:latest`. 현재 연결·모델·digest·설정은 재확인한다. 당시 모델이 오늘 사용 가능하다고 가정하지 않는다.
- 평가자 대조안, 고정 recipe, 저장된 응답 replay, 합성 피드백, 실제 모델 응답을 trace에서 별도로 식별한다. 정답·oracle은 채점 때만 사용한다.

## 6. 지켜야 할 상태·기하 계약

1. **CadDocument가 영속 설계 상태의 권위 있는 원본**이다. 두 번째 문서 원본·Scene Graph·Part Registry·CommandBus·solver를 편의상 만들지 않는다.
2. 영속 편집은 기존 검증 가능한 명령·트랜잭션을 통과한다. 사용자에게 한 작업인 다중 편집은 기존 배치 계약에 따라 한 Undo 단위로 처리한다. 임의로 History snapshot을 덮어쓰지 않는다.
3. 임시 선택·격리·카메라·미리보기·검사 결과는 기존 UI/세션 정책을 쓴다. 가짜 문서 편집이나 Undo 항목을 만들지 않는다. 검사 도구가 원본을 변경하지 않아야 한다.
4. AI/MCP는 기존 planner·권한·Native 검증을 따른다. 모델이 직접 live singleton, JSON 내부, 커널 객체를 임의 변경하게 하지 않는다. 사용자 승인 없는 AI Apply를 하지 않는다.
5. 문서 ID만으로 비동기 응답을 수락하지 않는다. 기존 `documentVersion`, session identity, revision/generation을 사용한다. 같은 ID 파일 재열기·문서 전환·Undo/Redo 뒤에도 현재 상태로 검증하고 stale 결과를 폐기한다.
6. 원본/평가 결과/렌더 메시를 구분한다. Nodes·modifier 출력의 편집 권한과 명시적 Bake, 원본 변경 시 stale 상태, 변환 손실을 보존한다.
7. ID와 소유 관계, 기하 참조, 표시 순서, 피처 의존성은 서로 다른 개념이다. ID가 같다고 같은 의미·표면 참조라고 간주하지 않는다. Trim/Join/Remesh 이후 대응이 불명확하면 invalid/unresolved/lost로 기록한다.
8. `unknown`, `unsupported`, `error`, `budget-exceeded`, `cancelled`는 유효/성공/충돌 없음이 아니다. AABB는 후보 필터이며 실제 관통 검증을 대체하지 않는다. 이산 각도 사이의 무충돌은 보장하지 않는다.
9. intentional overlap 주석은 실제 Common 체적과 raw 간섭 결과를 지우지 않는다. 사용자 새 요구와 기존 의도의 충돌을 표시하고 근거 없이 주석을 삭제하지 않는다.
10. 공차를 무작정 늘리거나 커널 검사를 우회해 통과시키지 않는다. 단위·모델 크기·최대 이동량·허용 오차·샘플링 한계를 기록한다. Shell과 Solid, faceted와 해석적 재구성을 구분한다.
11. Worker 취소·timeout·실패·오래된 결과에서 문서 불변과 자원 정리를 보장한다. 예산 변경에는 측정 근거가 필요하다.
12. `MeshSculpt.ts`의 현재 Sculpt 예산은 5,000 vertices / 10,000 faces / 20,000 render triangles, stroke samples 128, 평가 시간 예산 3,500ms다. 실시간 성능 보장이 아니다. 형상 전체 검증 비용과 제한은 따로 확인한다.
13. 직렬화는 문서 내용에 따른 기존 버전 선택을 따른다. 현재 코드의 형식 분기는 최대 v65까지 있으나 모든 문서를 v65로 저장하는 것은 아니다. 새 필드는 loader·구버전·unknown field·손실 정책을 조사한 뒤 추가한다.
14. 표시·카메라만 바뀐 테스트와 실제 기하가 바뀐 테스트를 구분한다. 성공 UI만 붙이고 계산이 없는 기능을 제공하지 않는다.

## 7. 온톨로지 구축 방향

기존 구현을 기반으로 다음 층을 연결한다. **현재 구현**과 **앞으로 설계할 층**을 보고서에서 구분한다.

| 층 | 목적 | 현재 기준 |
|---|---|---|
| 기능·도구 | 할 수 있는 작업, 대상, 실행 주체, 지원 범위, UI/MCP 경로, 근거 | 기존 `capabilities/` 재사용 |
| 설계 구조 | 객체·피처·입력·소유·live/snapshot·위상/provenance·참조 상태 | 기존 문서·dependency graph·조회 계약 재사용, 미지원 관계를 추정하지 않음 |
| 설계 의도·요구 | 목적, 유지할 조건, 변경 허용 범위, 가정·미정 사항, 검증 기준 | 기존 DesignStudy/designIntent/의도 주석 조사 후 필요한 최소 확장 |
| 해석·제작 의미 | 재료, 접합, 하중, 지지, 단위 변환, solver 입력·결과·유효 범위 | 장기 목표. 구현됐다고 전제하지 않음 |

- 현재 Capability Ontology는 **설명·탐색 모델**이다. `support: supported`나 precondition 문자열이 실행 권한·검증 엔진을 대신하지 않는다.
- `records.ts`, `types.ts`, `autocadShortcuts.ts`, `index.ts`를 재사용한다. 같은 목적의 카탈로그나 그래프 저장소를 새로 만들기 전에 중복을 확인한다.
- 현재 기능 인벤토리는 `capabilityInventory()`에서 생성한다. [생성 JSON](docs/verification/WEBCAD-CAPABILITY-INVENTORY.json)을 수작업으로 따로 유지하지 않는다.
- [120개 감사](docs/verification/AUTOCAD-SHORTCUT-COVERAGE-2026-11-05.md)의 당시 합계 16/50/31/23과 판정은 보존한다. 현행 지원 범위는 날짜·ID·실제 경로·검증 증거를 덧붙인다. `unconfirmed`를 미구현으로 단정하지 않는다.
- Profile ↔ Extrude는 `buildDependencyGraph`·`liveFeatureInputs`·`featureContract`의 직접 근거를 사용한다. 독립 복사본이나 미지원 간접 관계를 이름/거리로 추정하지 않는다.
- NVIDIA Auto Ontology는 이미 합성 SQLite·Inspector 읽기 전용 파일럿 이력이 있다. 전체 제품의 권위 있는 모델이나 기하 판단 엔진으로 도입 완료된 상태가 아니다. 제품 데이터 전송·환경 설정·timeout/stale 정책을 실제 코드로 확인한다.
- 사용자 도면·저장소 데이터를 외부 모델·서비스·학습으로 보내는 것은 별도 명시적 범위가 필요하다. 합성 fixture 실험과 구분한다. 온톨로지·평가 기록을 만들었다고 학습/RL을 수행했다고 보고하지 않는다.

## 8. 전문 에이전트와 오케스트레이션의 목표 구조

이 절은 **합의된 제품 방향**이며, 전체 런타임이 이미 구현됐다는 설명이 아니다. 새 프레임워크를 먼저 만드는 작업 지시도 아니다.

에이전트의 단위는 목표·입력·출력·검증 기준이 있는 설계 작업이다. 순수 계산·기하 검사·정해진 변환은 기존 코드로 실행하고, 판단·계획·모호성 해소가 필요한 곳에 모델을 사용한다.

| 역할 | 책임과 경계 |
|---|---|
| 설계 계획 | 요구 분해, 근거 조회, 미확정 조건과 보존 제약 정리 |
| 부품 모델링 | 실제 지원 도구로 형상·치수·피처 생성/수정 제안 |
| 조립·운동 | 기존 Assembly 계약에 따른 연결·자세·간섭 검사 |
| 검증·해석 | 기하·참조·설계 의도 검증, 준비된 경우 외부 해석 호출과 유효 범위 확인 |
| 제작 문서 | 연관 도면·시트·부품 목록·교환 파일과 출력 손실 점검 |
| 오케스트레이터 | 의존 작업 배정, 예산·취소·revision·충돌 관리, 근거 수집·재계획·검토안 통합 |

에이전트 작업 계약에 필요한 최소 정보:

- `taskId`, 목표·성공 기준, 문서/session/revision 근거, 대상 객체 ID, 읽은 사실의 출처.
- 변경 가능·보호 대상, 허용된 기존 도구, 단위·공차·호출/시간/메모리 예산.
- 제안 명령·영향 대상, Native 검증 결과, raw 상태와 실패 코드, 결과/trace 경로.
- `needs-input`, `unsupported`, `failed`, `cancelled`, `stale`, `preview-ready` 같은 구분. 형식은 기존 타입을 조사한 후 결정하고 중복 status 체계를 만들지 않는다.

작업은 버전이 고정된 스냅샷·격리 문서에서 계획/검증한다. 병렬 작업의 live 문서 쓰기는 중앙에서 직렬화한다. 선행 작업이 바뀌면 후속 근거를 다시 확인한다. 각 에이전트가 문서 JSON을 합치는 방식으로 충돌을 처리하지 않는다. 기존 CadToolSession/CommandBus/Review/Apply가 최종 경계다.

프롬프트에 모든 도구를 넣지 않는다. 현재 대상과 실제 계약에 맞게 scope를 좁히고, 근거가 없으면 필요한 read를 수행한다. 검증 오류는 제한적으로 환류하며 동일 no-op/동일 거부를 반복하지 않는다. 새 평가의 기본 상한은 명시된 작업 예산을 따르고 재계획은 보통 최대 2회로 제한한다.

오케스트레이터는 geometry kernel·파라메트릭 dependency graph·Nodes dataflow executor를 대체하지 않는다. 기존 deterministic 실행기를 조합하고 결과를 관리한다.

## 9. 앞으로의 우선순위 결정법

사용자가 새 카드를 지정하면 그것을 수행한다. 다음 일을 자율적으로 제안해야 할 때는 아래 순서로 판단한다.

1. **실제 설계 완주를 막는 결함·단절**: 선택/편집, 참조 유지, 저장·재열기, 형상 검증, UI 접근성, 공통 도구로의 인계 등 최초로 막히는 지점을 찾는다.
2. **여러 프로젝트가 공유하는 CAD 능력**: 한 데모 전용 기능보다 서로 다른 과제의 병목을 줄이는 기능을 우선한다. 기존 기능 연결만으로 해결되면 새 연산을 만들지 않는다.
3. **그 기능의 도구 계약·온톨로지·Native 검증**을 함께 완성한다. 모든 UI 기능에 즉시 MCP/LLM 연결을 추가할 필요는 없다. 사용자 작업 범위와 도구 수요를 따른다.
4. 검증된 작업부터 **좁은 전문 에이전트**로 묶고, 적은 수의 협업 경로로 효과를 평가한다. 복잡한 역할 분할을 먼저 완성하려 하지 않는다.
5. 물리 해석은 요구·모델·재료·경계조건·단위·해석용 형상과 결과 검증 계약을 갖춘 뒤 작은 공개 solver 연동부터 검토한다. 특정 엔진을 이미 채택한 것으로 취급하지 않는다.

권장 첫 작업은 **DESIGN-WORKFLOW-BASELINE-01 (제안, 미착수)**이다. 새 기능 구현보다 현재 능력을 사용자 관점으로 다시 잇는 작은 기준선 작업이다.

- 기존 결과물 중 서로 다른 성격의 대표 프로젝트 2개를 고른다. 후보는 정밀 외함/부품, 운동 조립체, 모델–도면 연결 건축 과제다. 로봇팔은 필수 과제가 아니다.
- 작은 Box만으로 검증을 끝내지 않는다. 부품 간 관계·후속 치수 변경·유지해야 할 설계 의도·도면 또는 조립 결과가 있는 과제를 고른다. 외부 사용자 데이터를 임의로 수집하지 않는다.
- 각 과제에서 열기 → 원본/관계 확인 → 중요한 변경 1회 → 영향 결과 검증 → Undo/Redo → 저장·재열기 → 필요한 출력까지 최소 흐름을 확인한다.
- “사람 UI 가능 / 기존 도구 가능 / 실제 모델 가능”을 분리한다. 부족한 CAD 기능과 AI 라우팅 문제를 구분한다. 실제 모델 평가는 연결·예산을 확인한 뒤 별도 실행한다.
- 최초로 막히는 지점과 기존 코드 근거를 기록해 다음 **작은 수정 카드 하나**를 선정한다. 새 종합 감사·새 로봇팔 제작·새 프레임워크 구현으로 범위를 넓히지 않는다.

## 10. 완료 기준과 정량 평가

“완료”는 지정된 지원 범위에서 사용 가능한 결과와 증거가 있을 때만 쓴다. UI를 만들었거나 mock이 통과했다는 이유로 완료 처리하지 않는다.

기능별 최소 계약:

- 실제 접근 경로·선택 조건·잠금/소유/의존성 정책을 확인한다.
- 정상 입력뿐 아니라 잘못된 입력·누락 참조·취소·오래된 응답·실패 원자성을 검증한다.
- 영속 편집은 Undo/Redo와 저장·재열기에서 결과·참조가 일치해야 한다. 화면 전용/읽기 전용 작업은 문서·revision·History 불변을 검증한다.
- viewport / SVG / PDF / DXF / STEP 등 **관련 형식별**로 실제 지원·손실·미검증을 나눈다. 한 출력의 성공을 다른 출력의 성공으로 확장하지 않는다.
- 도구·온톨로지·사용법·검증 문서가 실제 구현과 일치해야 한다. 관련 테스트만 추가하고 구현을 그대로 따라 쓰는 무의미한 검사는 만들지 않는다.

프로젝트·AI 평가에서 기록할 지표:

| 관점 | 기록할 값 |
|---|---|
| 설계 완주 | 요구별 pass/fail/unknown, 완료 단계/전체 정의 단계, 실제 막힌 지점, 사람 개입 횟수 |
| 변경 품질 | 유지한 ID·원본 관계·Joint·보호 객체, 원하지 않은 변경, 형상/공차·간격·간섭의 전후 실측 |
| 신뢰성 | 롤백·stale 거부·Undo/재열기, 실제 검증 엔진과 독립 검증 범위 |
| AI | 실제 모델 read/write 호출, 없는 도구 호출·no-op, Native Preview/Apply 구분, 재계획·토큰·지연·실패 이유 |
| 성능 | 객체/정점/면/샘플 수, cold/warm, CPU 단계·Worker 전송·메모리·렌더의 측정 범위와 예산 |
| 재현 | 코드 SHA, 모델/설정, 입력 hash, prompt·trace·결과·채점 규칙의 경로와 버전 |

전체 완성률을 임의로 계산하지 않는다. 프로젝트 난도와 요구사항의 분모를 정의하지 않은 “80% 완성” 같은 수치는 쓰지 않는다. 단일 fixture 성공은 범용 성공률이 아니다.

## 11. 검증 명령과 실행 비용

환경은 로컬 PowerShell, CI Node 22와 pnpm 고정 버전을 사용한다. 루트 `package.json`의 packageManager는 현재 `pnpm@11.26.0`이며 실제 manifest를 다시 확인한다. 의존성이 준비돼 있으면 매 세션 설치·업그레이드하지 않는다.

```powershell
# 필요한 경우에만, lockfile을 보존하여 설치
pnpm install --frozen-lockfile

# 개발 UI
pnpm --filter @agent-webcad/web dev

# 명시적인 필수 입력/순위/architecture 집중 검사
pnpm --filter @agent-webcad/web test:fixtures

# 관련 파일을 직접 지정하는 예. 작업과 무관하면 실행하지 않는다.
pnpm --filter @agent-webcad/web exec tsx --test tests/profileExtrudeRelations.test.ts tests/dependencyGraph.test.ts

# 대표 브라우저 한 페이지. Chromium 경로와 필요한 입력을 먼저 확인한다.
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=profileExtrudeRelations

# 최종 영향 범위에 따라 선택
pnpm --filter @agent-webcad/web check:architecture
pnpm --filter @agent-webcad/web build
pnpm build
git diff --check
```

- **테스트 탐색 주의:** 기존 `test`는 `tsx --test tests/**/*.test.ts`다. shell glob 차이 때문에 Linux CI가 root-level 전체를 실행한다고 가정할 수 없다. 실제 count·파일 범위를 확인한다. `test:fixtures`는 명시 목록으로 이를 보완한 좁은 검사이며 전체 해결은 아니다. 탐색 문제 수정은 별도 작은 작업으로 다룬다.
- `pnpm qa`는 web test → architecture → web build다. root `pnpm build`는 workspace build다. 두 범위를 구분한다. CI audit는 현재 `continue-on-error: true`이므로 전체 check의 겉 상태만 보고 취약점 0이라고 판단하지 않는다.
- 먼저 이전 로그를 재사용하고 바뀐 모듈의 집중 검사를 수행한다. 대표 UI를 이어 확인하고, 필요한 최종 빌드·아키텍처를 실행한다. 전체 unit/browser suite는 필요성과 비용이 있을 때만 수행한다.
- 과거 172/174페이지 전체 브라우저 감사는 기본 작업이 아니다. 현재 페이지 수를 하드코딩하지 않고 러너를 확인한다. 큰 변경이라 전체 검사가 필요하면 근거·예상 비용을 먼저 알린다.
- 반복 실패는 원인을 좁힌 뒤 같은 조건에서 최대 2회 재시도한다. 긴 세션은 보통 45–60분의 검토 가능한 작업으로 나누고 남은 범위를 기록한다. 시간 한도를 넘기기 위해 무한 재시도하지 않는다.
- 테스트가 `output/`의 기존 보고서·스크린샷·fixture를 덮어쓰는지 먼저 읽는다. 고유 실행 디렉터리나 기존 bytes 백업·hash 확인·복원 방식으로 보존한다. test 입력과 test가 생성하는 결과를 섞지 않는다.
- 로컬 untracked 파일 때문에 통과한 검사가 깨끗한 checkout에서 실패할 수 있다. 새 필수 fixture는 저장소에 포함하고 clean-checkout 재현성을 확인한다.
- 일부 대형 프로젝트 검사는 `apps/web/scripts/localTestArtifacts.json`의 로컬 입력이 필요하다. 없으면 setup 실패이며 skip/통과가 아니다. 개인 원본을 무단 업로드하거나 축소 mock으로 바꾸지 않는다.
- 실제 모델 호출은 보통 한 평가에서 4–6회 이하의 명시 예산을 정한다. `evaluateCadDesign.ts`의 옵션·입력 정책을 읽고 실행한다. API/key/서버 준비 실패는 모델의 설계 실패와 구분한다.
- 단순 문서 변경이면 링크·경로·diff 검사를 우선한다. 기능 테스트·대규모 빌드를 의례적으로 다시 실행하지 않는다.

## 12. Git·파일·외부 의존성 관리

- 사용자 변경·이전 카드의 미커밋 변경·미추적 산출물을 작업 기준선으로 보존한다. `reset --hard`, `clean`, 임의 stash·강제 checkout·force push로 정리하지 않는다.
- 새 브랜치는 기존 저장소 관례에 따라 `codex/`를 기본으로 하되 사용자의 지정이 우선한다. 브랜치를 바꾸기 전에 작업 트리와 로컬 파일 충돌을 확인한다.
- commit/push/PR/main 병합은 해당 사용자 요청 범위에서 수행한다. 기존 PR이 열렸다는 사실만으로 자동 병합하지 않는다. 병합 시 최신 head·CI·충돌·미해결 내용을 확인하고 대상 SHA를 검증한다.
- 작은 필수 입력·재현 스크립트·대표 CAD/STEP·실제 화면·성공/실패 JSON을 선별한다. 대형 메시·중간 GLB/뷰어·ZIP·반복 투영·로그·캐시는 일괄 게시하지 않는다.
- [입력 인벤토리](docs/verification/TEST-INPUT-INVENTORY-2026-11-07.json)와 [로컬 참조 인벤토리](docs/verification/LOCAL-ARTIFACT-REFERENCES-2026-11-07.json)를 확인한다. 둘의 scope는 제한적이며 모든 동적 fixture를 열거한 것으로 가정하지 않는다.
- `.env`, API key, 토큰, 사용자 도면, 모델 가중치, 계정 정보가 포함되지 않았는지 게시 전에 확인한다. 외부 공개 소스도 라이선스·NOTICE·출처·파생 수정 표시를 보존한다.
- SolidCraft·NVIDIA·다른 CAD/해석 오픈소스를 활용할 수 있다. 공식 소스와 실제 코드·라이선스·입출력·정밀도·WASM/Worker 적합성을 먼저 확인하고 기존 계약에 맞는 최소 재사용을 택한다. 무조건 자체 구현하거나 저장소 전체를 교체하는 결론부터 내리지 않는다.
- 대용량 다운로드·파괴적 마이그레이션·사용자 데이터의 외부 전송은 명시적인 범위를 확인한다. 비밀값을 로그에 출력해 연결 상태를 증명하지 않는다.
- 여러 개발 에이전트를 사용할 경우 코드 소유 범위와 통합 담당을 정한다. 동시에 같은 working tree 파일을 수정하거나 동일 문서에 Apply하지 않는다. 제품의 설계 에이전트와 코딩용 하위 에이전트를 구분한다.

## 13. 결과 보고 양식

이번 실행과 이전 증거를 분리하고 아래 순서로 간결하게 보고한다.

```text
작업 / 상태 — 카드 또는 목표 / 완료·부분 완료·차단
사용자에게 생긴 변화 — 어떤 설계 흐름이 실제로 가능해졌는가
실제 사용법 — UI/도구 진입 → 작업 → 결과
구현·재사용 — 주요 파일·기존 계약·변경 범위
동작 계약 — 대상·단위·공차·참조·소유·지원/미지원
상태 보존 — Preview/Cancel·원자성·Undo/Redo·저장/재열기·stale
온톨로지·도구 — 갱신 ID·실제 경로·문서 근거·이전 감사와의 관계
검증 — 이번 pass/fail/skip/미실행, 명령·count·대표 증거 경로
AI·성능 — 실제 호출/토큰/시간/데이터 규모와 미측정 범위(관련 시)
미해결 — 최초 실패 지점·사용자 영향·재현·지원 제한
다음 한 작업 — 이름·목적·진입 조건·필요한 추론 수준·요청 프롬프트·완료 기준
```

실제 코드·기하 실행이 없는 UI, mock, 평가자 생성 모델을 AI 성공으로 세지 않는다. 과거 통과·이번 통과·미실행·환경 실패를 구분한다. 후속 카드 추천은 자동 착수가 아니다. 모델 선택은 당시 가용 Claude 모델과 과제 복잡도를 기준으로 하며 오래된 GPT 모델/추론 강도 지정을 그대로 적용하지 않는다.

## 14. Claude에게 처음 전달할 요청 예시

> 루트 CLAUDE.md를 읽고 현재 branch/HEAD/git 상태와 이전 검증 근거를 확인해. 사용자 목표는 다양한 복잡한 제품·기계·구조물을 끝까지 설계하고, 검증된 CAD 능력에 온톨로지와 전문 에이전트 협업을 연결하는 것이다. 우선 DESIGN-WORKFLOW-BASELINE-01만 진행해. 기존 결과물 중 서로 다른 종류의 대표 프로젝트 2개를 골라 열기→중요 설계 변경→연관 결과 확인→Undo/Redo→저장·재열기→필요 출력의 최소 흐름을 조사·검증해. 먼저 기존 로그를 재사용하고 필요한 집중 검사만 실행해. 사람 UI·기존 공통 도구·실제 LLM의 능력을 분리하고, 최초 병목과 근거를 찾아 다음 작은 구현 카드 하나를 제안해. 이번에는 새 CAD 기능·새 에이전트 프레임워크·전체 감사·외부 데이터 전송을 시작하지 마. 작업 트리와 로컬 원본을 보존하고 CLAUDE.md의 결과 양식으로 보고해.

**계속 유지할 판단 기준: 실제 설계 능력 → 신뢰할 수 있는 공통 도구와 검증 → 의미·관계·의도 연결 → 전문 에이전트 → 오케스트레이션. 이 다섯 요소를 구체적인 설계 작업의 개선으로 증명한다.**
