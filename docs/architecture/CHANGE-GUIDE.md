# 수정 위치·영향 범위·문서 역할 안내

갱신일: 2026-10-09. 실제 소스 위치를 확인한 유지보수 지도다. 구현 목표와 현재 코드를 구분하며, 기능별 수정 위치는 이 문서, 의존 규칙은 [DIRECTORY-STRUCTURE](DIRECTORY-STRUCTURE.md), 최신 검수 상태는 [PROJECT-STATE](../../PROJECT-STATE.md)가 소유한다.

## 1. 현재 실행 구조

```text
도구 버튼 / 캔버스 / Inspector / 규칙 기반 Copilot
  → App의 도구 세션·선택·입력
  → CadCommand + validateCommand
  → 즉시 실행: dispatchCadCommand
    또는 검토 실행: previewCadCommand → applyCadPlan
  → prepareCadCommand: 복제 문서 준비
  → createDocumentCommandExecutor: 도메인 명령 + 관계 재생성
  → 치수 갱신·형상 검증
  → publishCadProposal: 문서 게시 + History + 변경 알림
  → 캔버스·Inspector 갱신 / 결과 선택·다음 작업
```

검토 실행은 계산된 제안을 보관하고 문서 버전을 확인한 뒤 적용한다. `commandInteraction`은 UI의 Apply 가능 여부를 계산하고, 실제 실행 계층도 다시 검증한다. UI 판정만 통과했다고 문서에 바로 쓰지 않는다. 현재 모든 도구가 완전히 같은 세션·검토 UI를 사용하는 것은 아니다.

### 현재와 목표를 혼동하지 않기

| 항목 | 현재 소스 상태 | 수정 시 주의 |
| --- | --- | --- |
| 공유 기하 패키지 | `packages/cad-geometry`에는 GeometryRegistry/GeometryId와 비어 있는 TopologyMap 골격이 있다 | 실제 2D 계산·solver가 모두 이 패키지에 있다고 가정하지 않는다 |
| 2D 계산·solver | `apps/web/src/precision`과 `features/drawing-editing/geometry` | 이곳의 계산부터 수정하고, 별도 엔진 추출은 검증을 동반한 후속 작업으로 한다 |
| 명령 패키지 | `packages/cad-commands`는 명령 타입·검증·결과·버스를 제공 | 실제 명령 구현·재생성·Preview는 웹의 `state`와 도면 편집 모듈에 있다 |
| 3D 커널 | `packages/cad-kernel`이 OpenCascade에 의존하고 웹 `cad`가 Worker 호출을 연결 | 목표는 의존성 제거가 아니라 커널 구현과 선택적 제작 기능의 경계를 유지하는 것 |
| Copilot | 규칙 planner·gateway의 공통 detached Review/Apply, draft/context 수명, queued Apply 취소·게시 직전 검증·결과 인계. [G5-A 검수](../implementation/G5-A3-COPILOT-APPLY-2026-10-08.md) | 실제 LLM 공급자/서버와 인증 연결은 없고 mock 검증 범위다 |
| 아트보드 | G2 frame/Fit/vector/component 및 G3 SVG/PNG/PDF output 구현 | 전체 illustration/editor/publishing 기능 동등성과 구분한다 |
| 제작 확장 | RasterAsset/ImageNode·source replacement·Scene(v12)·state/time/link/재생·finite vector component·원본 선택·정지 SVG | G4 첫 범위 검수 완료. pixel brush·레이어 graph·variant·직접 layout handle·PPTX/GIF 출력은 남아 있다 |
| 외부 오픈소스 | MIT UTIF만 TIFF 전용 Worker에 채택. SVG-Edit/Paper.js/UPNG/Typr/ag-psd/PptxGenJS는 후보 | 외부 parser는 UI·문서·History를 대신하지 않는다. [재사용·직접 구현 경계](../product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md) |

## 2. 무엇을 고치면 무엇이 바뀌는가

아래 소스 경로는 `apps/web/src/` 기준이다. 공유 패키지는 별도로 표시한다. 계산 오류와 표시 오류를 먼저 구분한다.

| 고치려는 문제 | 우선 수정 위치 | 바뀌는 동작 / 함께 확인할 경계 |
| --- | --- | --- |
| 이미지 import·원본 교체·외부 결과 인계 | `interop/rasterImport.ts`, `integrations/photopea/*`, `state/imageCommands.ts`, `properties/ImageInspector.tsx`, `viewport/imageRenderer.ts` | decoder/MIME/한도 통일, 공유 source 보존·asset GC, detached source preview·Cancel·한 Undo·serialization/export/Scene 연결 |
| 장면 배치·state/link·원본 선택·SVG pose 출력 | `explorer/views/ScenesPanel.tsx`, `scenes/sceneEvaluation.ts`, `ScenePlayer.tsx`, `state/sceneCommands.ts`, `packages/cad-document/src/Scene.ts` | CAD 원본 identity, draft/baseline·revision, 숨김 layout collapse·target state, 같은 평가 결과의 출력. component variant·원본 transform과 구별 |
| DXF 입력·원호 정확도·단위·제외·Apply | `interop/dxfParser.ts`, `dxfImport.ts`, `dxfWriter.ts`, `DxfReviewDialog.tsx`, `App.tsx` | ordered vertex/bulge·exact control vertex·selected component closure, detached review·subset 수락·stale·한 Undo·실제 파일 왕복 |
| 일반 Ø 주석과 source 갱신·재연결 | `properties/DiameterDimensionReview.tsx`, `PropertiesPanel.tsx`, `state/dimensionCommands.ts`, `dimensionRefresh.ts`, `precision/dimensionGeometry.ts`, `features/drawing-editing/commands/contourReferences.ts` | supporting circle의 2r와 leader 배치, 스케치 driver 구별, 잠금 후 입력 유지, edge remap·v13 gate·DXF line/TEXT |
| 일반 각도 계산·측정 영역·오류 | `precision/angularDimension.ts`, `dimensionSymbols.ts`, `tests/angularDimension.test.ts` | C1 순수 계산만 구현. 두 straight edge와 ±ray/CW/CCW, 공통 elevation·평행/곡선 거부, rad/deg·정확한 arc와 표시 샘플. 명령/두 참조·remap·저장·UI는 C2a/C2b/C3 후속 |
| 패널 위치·폭·접힘·작업공간 밀도 | `app/AppShell.tsx`, `styles.css`, `ui/tokens.css`, `ui/workstation.css` | 화면 배치·가독성·클릭 가능 영역. 실제 도구 상태는 `App.tsx`에 있어 CSS만으로 흐름이 통합되지는 않는다 |
| 도구 발견·이름·검색·단축키 | `ribbon/Ribbon.tsx`, `activity/ActivityBar.tsx`, `menu/MenuBar.tsx`, `commands/paletteCommands.ts`, `commands/interactionTools.ts`, `input/shortcutRouter.ts` | 도구 진입과 사용 가능 이유. App 시작 핸들러·캔버스 우클릭 경로도 함께 확인 |
| 도구 전환·Cancel·선택 유지·결과 인계 | `App.tsx`, `viewport/CadViewport.tsx`, 도구별 `*Tool.tsx`·`CurveWorkbench.tsx` | 세션 시작/종료, 포커스, preview 정리, 적용 후 선택. 모든 도구를 소유하는 독립 ToolSession 모듈은 아직 없음 |
| 잘못 선택됨·hover 대상·점/선분 구별 | `state/selection.ts`, `viewport/selectionRouting.ts`, `directSelection.ts`, `brepPicking.ts`, `DirectTargetChooser.tsx` | 객체·하위 요소 선택과 설명. 캔버스 색상만 바꿔서는 선택 의미가 바뀌지 않음 |
| 스냅·좌표·단위 입력 | `precision/snapEngine.ts`, `snapPreferences.ts`, `pointInput.ts`, `units.ts`, `workPlane.ts`, `ui/PrecisionField.tsx` | 후보 계산·단위 해석·필드 안내. `NumericField` 및 개별 입력이 모두 공통 필드로 전환된 상태는 아님 |
| 드래그가 구속을 깨거나 방향이 불명확 | `precision/sketchGripMotion.ts`, `sketchGripEditing.ts`, `sketchSolver.ts`, `viewport/DirectEditHandles.tsx`, `DirectMotionGuide.tsx` | 가능한 이동·solver 결과·방향 안내. 수치 편집과 같은 형상/구속 결과인지 확인 |
| Trim/Join/Offset 결과 형상이 잘못됨 | `features/drawing-editing/geometry/`, `precision/drawingTopology.ts` | 실제 곡선·윤곽·위상 계산. 렌더러로 계산 오류를 가리지 않음 |
| 자른 뒤 치수·구속·작도·패턴 참조가 끊김 | `features/drawing-editing/commands/contourReferences.ts`, `sketchContourReferences.ts`, `contourCommands.ts` | 결과 조각에 대한 참조 매핑·모호성 거부. UI 참조 선택은 `ui/contourReferenceChoices.ts` |
| 원본 변경 후 종속 형상이 갱신되지 않음 | `state/featureRegeneration.ts`, `dependencyGraph.ts`, `documentParameters.ts`, `dimensionRefresh.ts`, `precision/sketchAdapter.ts` | 구속·변수·작도·패턴·투영·솔리드 갱신. 그래프 조회와 실제 재생성 책임을 구분 |
| Apply가 잘못 활성화됨·이전 입력을 적용함 | `state/commandInteraction.ts`, `documentPlans.ts`, `documentSession.ts`, `ui/CommandReview.tsx` | draft 일치·문서 버전·준비 상태·오류 안내. 실제 적용은 아래 트랜잭션 계층에서도 재검증 |
| 실패 후 일부 변경·Undo 누락·중복 실행 | `state/dispatchCadCommand.ts`, `commandBus.ts`, `documentCommandQueue.ts`, `history.ts`, `packages/cad-history` | 문서 복제·일괄 실행·게시·이력. UI 하나를 고쳐도 전체 실행 원자성이 보장되지는 않음 |
| 치수 값과 표시가 불일치 | `state/canvasDimensionEdit.ts`, `registerDimensionCommandHandlers.ts`, `precision/dimensionSource.ts`, `dimensionGeometry.ts`, `viewport/CanvasDimensionEditor.tsx` | 표시 치수와 구동 치수 수정·참조·표시. 구동 값은 스케치 명령과 solver까지 확인 |
| 새 객체/관계를 저장해야 함 | `packages/cad-document/src/`, 특히 `CadDocument.ts`, `Feature.ts`, `serialization.ts` | 저장 계약·구조 검증·파일 버전. 타입 추가 후 모든 게시/복원/차이 계산 경로 점검 필수 |
| 저장·열기·자동 복구에서 상태가 사라짐 | `state/documentFile.ts`, `documentRecovery.ts`, `history.ts`, `dispatchCadCommand.ts`, `documentPlans.ts` | 파일·캐시·이력·제안의 왕복. 마지막 항목 삭제처럼 optional 필드가 사라지는 경우도 확인 |
| 아트보드 편집 | `explorer/views/ArtboardsPanel.tsx`, `state/artboardCommands.ts`, `CadDocument.artboards` | 이름·평면·원점·크기 등의 문서 편집. 캔버스 표시와 export는 별도로 연결해야 함 |
| 캔버스만 모양·하이라이트가 잘못됨 | `viewport/drawingRenderer.ts`, `dimensionRenderer.ts`, `draftingRenderer.ts`, `SketchOverlay.tsx`, `CanvasEditImpact.tsx` | 표현·투영·가이드. 원본 geometry·참조는 계산/문서 계층에서 유지 |
| 큰 문서에서 화면·메모리·GPU 자원이 부족함 | `viewport/CadViewport.tsx`, `drawingRenderer.ts`, `draftingRenderer.ts`, `cad/kernelGeometryService.ts`, `kernelWorkerClient.ts`, `state/documentPlans.ts` | 현재 WebGL/Worker/cache의 병목과 무효화를 먼저 측정한다. WebGPU는 선택적 backend, WebGL은 fallback이며 원본 문서·원자성은 바꾸지 않는다. 캐시 키·예산·eviction은 [웹 런타임 자원 전략](WEB-RUNTIME-RESOURCE-STRATEGY.md)을 따른다 |
| 3D 연산·면/엣지 선택·Worker 오류 | `packages/cad-kernel/src/operations/`, 웹 `cad/kernelGeometryService.ts`, `kernelProtocol.ts`, `kernelRuntime.ts`, `kernelWorkerClient.ts` | 솔리드 계산·메쉬·작업 취소·통신. 화면 선택은 `brepPicking.ts`, live 연결은 재생성 계층까지 확인 |
| SVG/DXF/PDF/STEP 출력이 화면과 다름 | `export/exportModel.ts`, `svgWriter.ts`, `interop/dxfParser.ts`·`dxfImport.ts`·`dxfWriter.ts`, `plot/plotPlan.ts`·`pdfWriter.ts` | 출력 대상·단위·축척·포맷 변환. 형식마다 포함 가능한 객체가 다름 |
| Copilot이 요청·선택·결과를 잘못 설명함 | `copilot/copilotPlan.ts`, `copilotContext.ts`, `copilotConnection.ts`, `CopilotPanel.tsx`, `App.tsx`, `state/documentQuery.ts`, `documentPlans.ts` | 계획 해석·context 수명·문서 조회·검토·결과 인계. Apply 취소와 owner 재검증은 공통 plan queue 경계에서 실행. 형상 오류라면 공유 명령/기하를 수정 |
| Copilot의 local 선택/target 읽기·취소·오래된 결과·수동 인계 | `copilot/copilotQuery.ts`, `useCopilotQuery.ts`, `CopilotQueryPanel.tsx`, `state/documentQuery.ts`, `App.tsx` | bounded DTO·단위/관계/잠금·App 소유 context·요청 순간의 authoritative version. explicit read target은 편집 selection과 독립적이다. gateway 전송/편집 명령과 별도 경로. [B1 실제 UI/Worker 및 전체 검수](../implementation/G5-B1-COPILOT-QUERY-2026-10-09.md) |
| LLM·외부 라이브러리 도입 | 현재 `CopilotBackend`와 공개 명령/계획 경계에서 시작; 향후 `integrations` 어댑터 제안 | 네트워크·취소·외부 데이터 변환을 격리. 아직 존재하지 않는 통합 패키지를 선행 생성하지 않음 |

## 3. 변경을 놓치기 쉬운 연결 지점

**새 기능 하나**: 저장 모델 → 명령 타입/validator/result → handler 등록 → 관계 재생성 → UI 진입/입력 → 공통 검토 → 캔버스 표현 → 결과 인계 → 저장/Undo → 출력 지원 범위 순으로 영향 여부를 판단한다. 모든 단계의 코드를 무조건 바꾸는 체크리스트가 아니라, 누락을 확인하는 지도다.

**새 문서 필드 하나**: `serialization.ts`뿐 아니라 `publishCadProposal`, batch rollback, History restore, 파일 load/new, recovery, preview diff, 테스트 fixture를 확인한다. `Object.assign`은 제안에서 사라진 필드를 기존 문서에서 지우지 않는다.

아트보드 G0에서는 마지막 삭제 게시·복구·이력을 검증하고 impact 생성/수정/삭제 수량을 구별했다. 속성 입력은 ArtboardsPanel → 공통 preview/commandInteraction → Apply로 연결된다. 생성/삭제/Hide/Lock은 즉시 명령이다. 이 차이와 Node·실제 패널 browser 증거는 [아트보드 구현](../implementation/ARTBOARDS-2026-10-05.md), [G0 검증](../verification/G0-ARTBOARDS-2026-10-05.md)을 따른다. 새 optional 필드를 추가할 때 같은 모든 복원 경로를 다시 점검한다.

**History와 포커스**: G1에서 `input/shortcutRouter.ts`의 공통 History chord·입력/modal guard → App capture → 기존 Undo/Redo·busy guard → 도구 정리·selection 복원 → Viewport의 pointer 취소·canvas focus로 연결했다. 직접 편집·치수 review의 stale 입력/복구는 유지한다. capture를 일반 문자 단축키까지 확장하거나 form의 모든 입력을 문서 Undo로 보내지 않는다. `sessionContinuity.browser.tsx`가 패널·입력·도구 전환·grip·modal의 네이티브 동작을 검증한다.

**이력 상태와 선택**: `packages/cad-history/src/HistoryStack.ts`가 상태별 토큰을 소유한다. push는 새 토큰, Undo/Redo는 snapshot 토큰, clear는 새 세션 토큰이다. App의 `selectionMemory`는 토큰 객체를 키로 하는 WeakMap이며 geometry/topology 선택은 `validSelection`으로 현재 문서에 맞게 필터링한다. 깊이·revision·문서 ID를 대체 키로 쓰거나 UI 토큰을 JSON에 넣지 않는다. preview/failure/no-op는 토큰을 바꾸지 않고 실제 게시만 한 이력을 만든다. `historyState.test.ts`와 `historySelection.browser.tsx`가 100개 상한·분기·다중/꼭짓점 선택·같은 ID 파일 open을 확인한다. 증거와 지원 한계는 [G1 후속](../verification/G1-HISTORY-IDENTITY-2026-10-05.md)을 따른다.

**외부 엔진/LLM 연결 하나**: 외부 타입이 저장 모델·UI 전체로 퍼지는지 확인한다. 외부 결과는 입력 검증과 공유 명령 실행을 거치며, 취소·늦은 응답·문서 변경은 공통 버전 검증으로 처리한다. 현재 커널의 OpenCascade 의존과 앞으로 붙일 선택적 제작 라이브러리를 구분한다.

## 4. 변경별 검증 위치

모든 테스트 경로는 `apps/web/tests/` 기준이다. 아래는 기존 검사 진입점이며, 목록에 있다는 것만으로 새 변경의 통과를 의미하지 않는다.

| 변경 | 관련 기존 검사 | 확인할 결과 |
| --- | --- | --- |
| 선택·정밀 입력·구속 드래그 | `selectionState.test.ts`, `directSelection.test.ts`, `precisionRegression.test.ts`, `sketchGripMotion.test.ts`, `sketchCanvas.browser.tsx` | 목표 좌표·구속·선택 의미와 실제 입력/포커스 |
| 윤곽·관계 재연결 | `drawing-editing/contourTrim.test.ts`, `contourRelations.test.ts`, `interactionRelations.browser.tsx` | 기하·ID·연쇄 재생성·실패 원자성·결과 인계 |
| 계획·Apply·자동화 | `commandInteraction.test.ts`, `documentPlans.test.ts`, `documentCommandQueue.test.ts`, `copilotPlan.test.ts` | stale plan 거부·원본 불변·한 번만 적용·History |
| 새 모델·저장·아트보드 | `documentPersistence.test.ts`, `documentRecovery.test.ts`, `artboards.test.ts` | 추가뿐 아니라 수정·마지막 항목 삭제·save/reload·Undo/Redo |
| 작도·패턴·재생성 | `constructionGeometry.test.ts`, `patterns.test.ts`, `featureRegeneration.test.ts`, 해당 `*.browser` | 원본 편집 뒤 종속 결과·잠금·관계 복구 |
| 출력 | `exportModel.test.ts`, `plot.test.ts` 및 형식별 검사 | 단위·축척·영역·지원 객체·손실 안내; 결과 파일도 확인 |
| 장면·DXF·일반 지름 | `scenes.test.ts`, `dxfBulge.test.ts`, `diameterDimension.test.ts` 및 `scenesWorkflow`/`dxfWorkflow`/`diameterWorkflow.browser.tsx` | source/branch identity·draft/Cancel·오류 유지·atomic Apply·v12/v13·actual download/reimport·History |
| 구조·문서 | `architecture.test.ts`, `scripts/checkArchitecture.ts` | 상대 import·기하/명령 경계·타입 계약·문서 링크 |

새 browser 페이지는 HTML/TSX 파일 생성 후 `scripts/browserChecks.mjs`의 page 목록에 등록한다. 전체 실행 명령은 [루트 README](../../README.md#확인)를 따른다. production typecheck는 현재 `src`를 대상으로 하므로 테스트 파일의 전체 타입 검사를 대신하지 않는다. 성능 변경은 `scripts/benchmarkInteraction.ts`, `benchmark:edit` 등 같은 fixture의 전후 측정을 사용한다.

## 5. 문서별 역할과 갱신 시점

같은 사실을 여러 파일에 길게 복사하지 않고, 아래 소유 문서를 고친 뒤 링크한다.

| 문서 | 답하는 질문 | 갱신할 때 |
| --- | --- | --- |
| [README](../../README.md) | 어떻게 설치·실행·검증하는가? | 실행 방법·환경·검증 명령 변경 |
| [PROJECT-STATE](../../PROJECT-STATE.md) | 지금 무엇이 구현됐고 어디까지 검증됐는가? | 구현 범위·실행 결과·현재 제한 변경. 통과 날짜와 미실행을 분리 |
| [NEXT-STEPS](../../NEXT-STEPS.md) | 다음에 무엇을 어떤 순서로 하는가? | 우선순위·선행 조건·완료 기준 변경. 완료한 일의 상세 이력을 쌓지 않음 |
| [IMPLEMENTATION-READINESS](../IMPLEMENTATION-READINESS-2026-10-05.md) | 다음 구현의 상세 범위·선행 조건·완료 기준은? | G0–G6 상세 인계와 다음 담당 프롬프트 변경. NEXT-STEPS는 이 문서의 짧은 실행 큐 |
| [docs/README](../README.md) | 관련 문서는 어디에 있는가? | 문서 추가·이동·삭제·역할 변경 |
| [CAD-BASICS](../product/CAD-BASICS.md) | CAD 사용자가 어떤 객체/조합을 사용할 수 있는가? | 기능별 지원·미지원·작업 범위 변경 |
| [CAD-BASICS-IMPLEMENTATION-PLAN](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md) | CAD 확대를 어떤 단위로 구현하고 어디까지 검증하는가? | B/X 카드·선행 조건·소유권/참조·출력 경계 변경. 실제 지원표는 CAD-BASICS에 유지 |
| [PRODUCT-ROADMAP](../product/PRODUCT-ROADMAP.md) | CAD·작도·3D·BIM·협업의 장기 도메인 단계는? | 도메인별 목표·통과 기준 변경 |
| [UNIFIED-CREATIVE-SUITE-ROADMAP](../product/UNIFIED-CREATIVE-SUITE-ROADMAP.md) | 통합 UI·이미지·벡터·발표·AI를 어떤 경험으로 연결하는가? | 제품 원칙·제작 영역 설계 변경. 현재 구현 근거로 사용하지 않음 |
| [DIRECTORY-STRUCTURE](DIRECTORY-STRUCTURE.md) | 코드를 어디에 두고 무엇을 import할 수 있는가? | 실제 경계·폴더·의존 검사 규칙 변경 |
| 이 문서 `CHANGE-GUIDE` | 어떤 문제를 어디서 고치고 무엇을 함께 확인하는가? | 파일 책임·진입점·유지보수 절차 변경 |
| [SHARED-GEOMETRY-ARCHITECTURE](SHARED-GEOMETRY-ARCHITECTURE.md) | 공통 기하 요구사항과 현재 구현의 간격은? | 객체·단위·정밀도·표현/측정 계약 변경 |
| [PARAMETRIC-SKETCH](PARAMETRIC-SKETCH.md), [PARAMETRIC-REGENERATION](PARAMETRIC-REGENERATION.md) | 스케치 구속·투영·솔리드 재생성은 어떻게 연결되는가? | solver 연계·소유권·재생성 정책 변경 |
| [LIVE-PATTERNS](LIVE-PATTERNS.md), [VARIABLES-AND-EXPRESSIONS](VARIABLES-AND-EXPRESSIONS.md) | 패턴 identity와 변수/수식은 어떻게 유지되는가? | recipe/slot·바인딩·단위 정책 변경 |
| [OPEN-SOURCE-CREATIVE-INTEGRATION](OPEN-SOURCE-CREATIVE-INTEGRATION-2026-10-05.md) | 외부 후보를 왜 선택하고 어느 경계로 붙이는가? | 후보·실제 채택·버전·어댑터 경계 결정. 조사/설치/통합/검증 상태를 분리 |
| `docs/implementation/*` | 해당 기능을 실제로 어떻게 구현했고 무엇이 남았는가? | 기능 구현·정책·지원 경계 변경. 새 검증에는 날짜를 붙임 |
| `docs/verification/*` | 어떤 환경·과제로 어떤 결과를 측정했는가? | 검증/벤치마크 실행. 과거 수치를 최신 결과로 덮어쓰지 않음 |
| `docs/reviews/*` | 어떤 문제를 발견했고 무엇을 해결했는가? | 감사·코드 리뷰·후속 상태 갱신. 관찰·추정·재현 결과를 구분 |

대표 구현 기록: [Trim/Join 참조](../implementation/CONTOUR-TRIM-REFERENCES-2026-10-04.md), [Curve workflow](../implementation/CURVE-WORKFLOW-2026-10-04.md), [구속·스냅](../implementation/EXTENDED-SKETCH-AND-SNAPS-2026-10-04.md), [작도](../implementation/CONSTRUCTION-GEOMETRY-2026-10-04.md), [아트보드](../implementation/ARTBOARDS-2026-10-05.md). 나머지 기능·UX 기록은 [문서 목록](../README.md)에서 찾는다. 렌더 backend·Worker·캐시 변경은 [웹 런타임 자원 전략](WEB-RUNTIME-RESOURCE-STRATEGY.md)을 함께 갱신한다.

## 6. 다음 수정 때의 사용 순서

1. PROJECT-STATE에서 실제 지원·검증 상태를 확인하고 NEXT-STEPS에서 이번 완료 범위를 고른다.
2. 이 문서의 수정 위치 표로 책임 계층을 찾고 DIRECTORY-STRUCTURE의 import 규칙을 확인한다.
3. 관련 구현 문서와 기존 테스트에서 원래 의도를 확인한다. 실패 원인이 표시/입력/계산/관계/게시/저장 중 어디인지 구분한다.
4. 가장 작은 책임 범위를 고치고 위·아래 연결 지점에 누락이 없는지 확인한다.
5. 변경에 해당하는 검사와 필수 구조 검사를 실행한다. UX는 실제 브라우저, 성능은 동일 과제의 측정으로 확인한다.
6. 구현 문서에 실제 결과와 한계를, PROJECT-STATE에 요약을, NEXT-STEPS에 남은 순서를 기록한다.
7. 새 문서를 만들거나 옮겼다면 docs/README와 로컬 링크를 검사한다. 미실행 검사는 통과 수치에 합산하지 않는다.
