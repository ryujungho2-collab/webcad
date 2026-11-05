# 작업 트리 미커밋 변경 분류 보고서 (T-006)

- 작성일: 2026-10-31
- 기준 커밋: `f4f1b95` (main)
- 조사 방법: 읽기 전용 명령만 사용 (`git status --short`, `git diff --stat`, `git diff <path>`, `git ls-files output`, 파일 목록 Glob/Grep)
- 하지 않은 일: `git add` / `commit` / `stash` / `reset` / `checkout`, 다른 파일 수정. 이 문서 하나만 새로 만들었다.

## 0. 요약

| 구분 | `git status` 항목 수 | 비고 |
|---|---:|---|
| 수정 (` M`) | 203 | `git diff --stat`: 203 files, +5945 / −2809 |
| 미추적 (`??`) | 741 | 디렉터리 단위로 접힌 항목 포함 (아래 참고). 실제 파일 수는 이보다 많다 |
| **합계** | **944** | |

알아 둘 점:

1. **루트 `output-*.log`(실측 128개)는 944개에 들어 있지 않다.** 루트 `.gitignore`의 `*.log` 규칙에 걸려서 이미 무시된다. 그래서 커밋 후보에서 빼려고 따로 할 일은 없고, 디스크 정리만 결정하면 된다 (6장).
2. 미추적 항목 중 22개는 디렉터리 하나로 접혀 보인다: `apps/web/server/`(5개 파일), `apps/web/src/canvas/`(6개), `apps/web/src/library/`(9개), `docs/licenses/`(1개), `docs/research/`(1개), `output/external/`(약 70개), `output/projects/*/` 21개, `output/verification/*/` 55개.
3. `output/`은 원래 일부가 **추적 중**이다 (`git ls-files output` 기준으로 benchmarks·images·pdf·projects·verification 아래 약 330개 파일). 그래서 `output/` 전체를 무시 규칙으로 막으면 기존 증거 파일과 어긋난다. 산출물 처리는 6장에서 따로 제안한다.
4. `git diff` 실행 시 70여 개 파일에서 `LF will be replaced by CRLF the next time Git touches it` 경고가 나온다. 커밋하기 전에 줄바꿈 정책(`core.autocrlf` 또는 `.gitattributes`)을 정하지 않으면, 내용 변경 없이 줄바꿈만 바뀐 diff가 섞여 리뷰가 어려워질 수 있다.

## 1. 영역별 분류 (개수)

요청한 8개 영역 기준이다. `apps/web/src`의 편집기 공통 코드(state·precision·viewport·properties·ui 등)는 8개 영역 어디에도 딱 맞지 않는다. 그래서 **app/project 영역 안에 "편집기 코어" 하위 묶음**으로 따로 셌다 (판단 근거: 이 파일들이 앱 셸과 같은 `apps/web/src` 계층에 있고, 커밋할 때도 앱 통합 커밋과 함께 움직여야 빌드가 맞는다).

| 영역 | 수정 | 미추적 | 주요 경로 |
|---|---:|---:|---|
| cad/kernel | 19 | 9 | `apps/web/src/cad/*`(5 M, 4 ??), `packages/cad-kernel/**`(14 M, 5 ??) |
| copilot | 6 | 45 | `apps/web/src/copilot/*`(6 M, 44 ??), `apps/web/server/`(항목 1개 = 파일 5개) |
| interop(DXF) | 6 | 6 | `apps/web/src/interop/*` (DXF 4개와 GLB 참조 2개) |
| export | 4 | 5 | `apps/web/src/export/*` |
| app/project — 앱 셸·프로젝트 | 21 | 21 | `src/app`, `src/explorer`, `src/canvas/`(항목 1 = 파일 6), `src/library/`(항목 1 = 파일 9), `App.tsx`, `activity`, `menu`, `ribbon`, `commands`, `input`, `status` |
| app/project — 편집기 코어 | 53 | 73 | `src/state`, `src/precision`, `src/viewport`, `src/properties`, `src/ui`, `src/architecture`, `src/features` |
| app/project — 테스트·스크립트·설정 | 33 | 306 | `apps/web/tests/**`(28 M, 250 ??), `apps/web/scripts/*`(3 M, 56 ??), `package.json`, `vite.config.ts` |
| packages (cad-document·cad-commands) | 13 | 24 | `packages/cad-document/src/*`(11 M, 24 ??), `packages/cad-commands/src/*`(2 M) |
| 루트 lock | 1 | 0 | `pnpm-lock.yaml` |
| docs | 27 | 167 | 루트 `README.md`·`NEXT-STEPS.md`·`PROJECT-STATE.md` + `docs/**` |
| output·artifact | 20 | 85 | `output/**`, 루트 `ChatGPT 이미지 2026년 10월 18일 오전 09_48_37.png` |
| **합계** | **203** | **741** | |

참고: 위 표에서 cad/kernel 행에 `packages/cad-kernel`을 넣었으므로, packages 행에는 cad-document·cad-commands만 남겼다. 미추적 숫자는 `git status --short`의 **항목 수** 기준이다. 디렉터리로 접힌 항목은 1로 셌다.

## 2. 영역별 변경 요약

### 2.1 cad/kernel
- `packages/cad-kernel` 신규 연산: `operations/distance.ts`(B-rep 최단거리), `selectedDistance.ts`(선택 요소 간 측정 모드), `planarReconstruction.ts`(평면 메시를 솔리드로 복원), `projectionPartition.ts`, `shapeResources.ts`(`estimateShapeBytes`, 자원·메모리 추정).
- 기존 연산 수정: `booleans.ts`(+68), `shapeToMesh.ts`(+78), `revolve`·`sweep`·`projection`(`HlrProfile` 타입 공개)·`spline`·`loft`·`extrude`, IO(`iges`·`step`·`stl`)는 소폭 수정.
- `apps/web/src/cad`: `kernelRuntime.ts`(+76)와 `kernelGeometryService.ts`를 고쳤고, **지오메트리 평가 전용 워커**(`geometryEvaluation.worker.ts`·`Client`·`Protocol`)와 `retainedShapeCache.ts`를 새로 넣었다.

### 2.2 copilot
- MCP 기반 CAD 도구 계층: `cadToolContract.ts`, `cadMcpRuntime.ts`, `useCadMcpBridge.ts`, `McpConnectionPanel.tsx`, 서버 쪽 `apps/web/server/cadMcpServer.ts`·`cadMcpBroker.ts`·`mcpStdio.ts`.
- 로컬 Copilot: `server/localCopilot.ts`, `copilotPlanning.ts`, `copilotTaskScope.ts`, `cadRecipes.ts`, `CopilotConnectionSettings.tsx`, `copilotSettings.ts`.
- 도메인 도구: 건축(`architecture*.ts`, `ArchitectureReadPanel.tsx`, `wallMovePlan.ts`), 어셈블리 후보 탐색(`assembly*.ts`, `server/assemblySearchModel.ts`), 메시·스컬프트·하이브리드·복원·지오메트리 노드·씬 도구(`meshTools`, `sculptTools`, `hybridTools`, `reconstructionTools`, `geometryNodeTools`, `sceneTools`), 디자인 스터디(`designStudy*.ts`, `DesignStudyDialog.tsx`).
- 수정: `CopilotPanel.tsx`(+57), `copilotConnection.ts`(+74), `copilotPlan.ts`.
- 의존성: `apps/web/package.json`에 `@modelcontextprotocol/client`·`@modelcontextprotocol/server` 2.3.1과 `zod` ^4.6.7을 추가했고, `test:copilot-live`·`preview` 스크립트도 추가했다. `vite.config.ts`에 `localCopilotPlugin()`·`cadMcpPlugin()`을 등록했다.

### 2.3 interop(DXF)
- 신규: `dxfColors.ts`, `dxfHatch.ts`, `dxfMtext.ts`, `dxfSpline.ts` — 곡선 해치, MTEXT, 스플라인, 색상 왕복 변환.
- 수정: `dxfParser.ts`(+87), `DxfReviewDialog.tsx`(가져오기 진행률과 취소), `dxfImport.ts`, `dxfWriter.ts`.
- GLB 참조(`glbReference.ts`, `glbAssemblyPreview.ts`)는 경로상 interop에 있지만 내용은 외부 씬·어셈블리 기능이라, 커밋할 때는 앱 통합 쪽에 묶기를 권한다.
- 관련 라이선스: `docs/licenses/ezdxf-MIT.txt`.

### 2.4 export
- 신규: 출력 사전 점검 `outputPreflight.ts`, `OutputPreflightDialog.tsx`, `outputPreflight.css`, GLB 내보내기 `glbExport.ts`·`glbWriter.ts`(SimReady GLB MVP).
- 수정: `exportModel.ts`, `artboardPdf.ts`, `ArtboardPdfDialog.tsx`, `frameDxf.ts`.

### 2.5 app/project
- 앱 셸·프로젝트: 프로젝트 홈(`ProjectHome.tsx`, `projectHomeStore.ts`, `projectTemplates.ts`), 탭 탐색(`ProjectTabStrip.tsx`, `ProjectTabSearch.tsx`, `projectTabs.ts`), 프로젝트 비교(`projectComparison.ts`, `ProjectComparisonDivider.tsx`), 번들 내보내기·가져오기(`projectBundle.ts`, `ProjectBundleDialog.tsx`), 프로젝트 트리(`explorer/projectTree.ts`, `ProjectTreePanel.tsx`), 캔버스 계층·플렉스·스케일(`src/canvas/`), 재사용 라이브러리·외부 씬(`src/library/`). `App.tsx`(+207)와 `ProjectWorkspace.tsx`(+156)가 이 기능들을 엮는다.
- 편집기 코어: 측정 기능(hover·selected·saved distance, 치수 배치), 어셈블리(명령·모션·미리보기·간섭 판정), 편집 가능 메시·스컬프트·하이브리드·평면 복원 명령, 곡선 배치·피팅 스플라인·스윕 경로, 인스펙터 재구성(`InspectorSummary`, `inspectorEdits`), 선택 툴바, 접근성(`accessibility.css`, `useModalDialog.ts`). 수정 규모가 큰 파일은 `CadViewport.tsx`(+285), `PropertiesPanel.tsx`(+236), `commandBus.ts`(+137)이다.
- 테스트: 새 `*.test.ts`와 `*.browser.tsx`/`*.browser.html` 짝 약 250개, 헬퍼 18개, 픽스처 2개.
- 스크립트: 검증 스크립트(`verify*.ts/py`), 벤치마크, 시나리오 데모(cafe·garden house·flow court·external civil), `browserChecks.mjs`(+325). `checkArchitecture.ts`는 Vite `?raw`/`?url` import를 허용하도록 고쳤다.

### 2.6 packages (cad-document·cad-commands)
- `CadDocument`에 선택 필드를 추가했다: `externalSceneAssets`, `interferenceIntents`, `assembly`, `savedMeasurements`, `canvases`. `CadDrawingFrame`에는 `paperStrokeScale`·`paperTextScale`를 추가했다.
- 신규 모듈 24개: Assembly, Canvas·CanvasFlex, EditableMesh·Mesh*(Topology, Modifiers, Sculpt, Remesh, SpatialIndex, Intersection, Provenance), GeometryNodes·Evaluation·Registry, Hybrid·PlanarReconstruction·PlanarHealing, SavedMeasurement, DxfStyle, ExternalSceneAsset, InterferenceIntent, SplineProfile 등.
- `index.ts`(+50)가 이 모듈을 모두 export한다. `serialization.ts`(+63)는 새 필드를 직렬화한다.
- `cad-commands`: `commands.ts`·`validator.ts`에 새 명령 타입과 검증을 넣었다.

### 2.7 docs
- 수정: 루트 `README.md`·`NEXT-STEPS.md`(+120)·`PROJECT-STATE.md`(+115), `docs/features/*`(COPILOT +165, PROJECTS, DRAWINGS-OUTPUT 등), 각 색인 README(`docs/implementation/README.md` +78, `docs/verification/README.md` +72).
- 신규: `docs/architecture/` 16개(ASSEMBLY, CAD-MCP, HYBRID-GEOMETRY 단계별 문서, DESIGN-STUDY-GATEWAY 등), `docs/features/` 6개(CANVASES, MEASUREMENTS, PROPERTIES 등), `docs/implementation/` 60개 작업 기록, `docs/product/` 6개, `docs/research/` 1개, `docs/verification/` 76개(md + json 증거).

### 2.8 output·artifact
- 수정된 추적 파일 20개: 재생성된 native report JSON, `spline-pilot/spline.dxf`(+2314 줄 변경, 재생성 노이즈로 추정), PNG 3개, `g3-resources-sample.json`.
- 미추적: `output/projects/` 21개 디렉터리, `output/verification/` 55개 디렉터리, `output/external/civil-projects/`(외부 원본 `.dwg`·`.pdf`, 변환본, `.log` 포함), `output/pdf/` 새 PDF 7개, 루트 `ChatGPT 이미지 2026년 10월 18일 오전 09_48_37.png`.

## 3. 커밋 분할안 (리뷰하기 쉬운 순서)

원칙:
- **아래층(packages)부터 위층(앱)으로** 쌓는다. 리뷰어가 스키마와 연산을 먼저 보고 나서 UI를 보게 하기 위해서다.
- **테스트는 해당 기능 커밋에 같이 넣는다.** 테스트만 따로 모은 커밋은 리뷰 가치가 낮다.
- `packages/cad-document/src/index.ts`와 `packages/cad-kernel/src/index.ts`는 새 모듈을 한 파일에서 모두 export한다. 그래서 **패키지는 기능별로 나누지 않고 패키지 단위 커밋 하나로** 한다. 나누려면 `git add -p`로 index를 쪼개야 하는데, 작업량에 비해 위험이 크다.
- 앱 쪽 `App.tsx`·`CadViewport.tsx`·`PropertiesPanel.tsx`·`commandBus.ts`는 여러 기능이 한 파일에 섞여 있다. 그래서 C4~C7은 **각 커밋마다 빌드가 되는지 확인이 필요**하다 (`pnpm --filter @agent-webcad/web build`, 즉 `tsc -b && vite build`). 빌드가 깨지면 바로 다음 커밋과 합친다.

| # | 커밋(가제) | 포함 파일 묶음 | 의존 |
|---|---|---|---|
| C1 | `chore(deps): add MCP client/server and zod` | `apps/web/package.json`, `pnpm-lock.yaml` | 없음 |
| C2 | `feat(document): assembly, canvas, mesh, measurement, scene schema` | `packages/cad-document/src/**`(11 M + 24 ??), `packages/cad-commands/src/*`(2 M) | 없음 |
| C3 | `feat(kernel): brep distance, planar reconstruction, shape resources` | `packages/cad-kernel/src/**`(14 M + 5 ??) | C2 (커널이 문서 타입을 쓰는 경우) |
| C4 | `feat(cad): geometry evaluation worker and retained shape cache` | `apps/web/src/cad/*`(5 M + 4 ??), `tests/kernelResources.*`, `tests/helpers/geometryTransfer.worker.ts`, `tests/helpers/kernelP4Fixture.ts` | C2, C3 |
| C5 | `feat(interop): DXF hatch, MTEXT, spline, colors, import progress` | `src/interop/dxf*.ts`(M 3 + ?? 4), `DxfReviewDialog.tsx`, `src/precision/dxfStyle.ts`, 테스트 `curveDxf.*`·`curveHatch*`·`dxfAnnotations`·`dxfDimensionPlacement`·`dxfPresentation`·`dxfImportProgress.*`·`importCancellation`·`dxfBulge`, `dxfWorkflow.browser.tsx`, 헬퍼 `curveDxfFixture.ts`·`curveHatchFixture.ts`, `docs/licenses/ezdxf-MIT.txt` | C2 |
| C6 | `feat(export): output preflight and GLB export` | `src/export/*`(4 M + 5 ??), 테스트 `outputPreflight.*`·`glbExport.test.ts`·`artboardPdf.test.ts`·`simready*`, `helpers/preflightFixture.ts` | C2, C3 |
| C7 | `feat(editor): measurements, assembly, mesh/sculpt/hybrid, canvases, library, project home/tabs/compare/bundle` (앱 통합) | 나머지 `apps/web/src/**` 전부(app, explorer, canvas, library, state, precision, viewport, properties, ui, status, menu, ribbon, input, commands, activity, architecture, features, `glb*` interop, `App.tsx`), 이에 맞는 `apps/web/tests/**`, `scripts/browserChecks.mjs`·`browserInput.mjs`·`checkArchitecture.ts` | C2~C6 |
| C8 | `feat(copilot): CAD MCP server, local copilot, domain tools` | `src/copilot/**`(6 M + 44 ??), `apps/web/server/*`, `vite.config.ts`, 테스트 `cadMcp*`·`copilot*`·`localCopilot.*`·`architecture*Copilot*`·`designStudy.*`·`agent*`·`*Mcp.test.ts`·`*Handoff.browser.*`·`graduationCopilot.*`·`nativeArchitectureCopilot.*`·`mcpBridge.*`·`sceneTools`·`wallMove`·`internalDesignEngine`, `scripts/localCopilotLive.ts`·`mcpBrowserClient.mjs`·`verifyCopilot*.ts` | C1, C7 (아래 주의 참고) |
| C9 | `chore(scripts): verification, benchmark, and scenario scripts` | 나머지 `apps/web/scripts/*` 신규(verify*, benchmark*, cafe·gardenHouse·flowCourt·externalCivil·repairSchool 등), 시나리오 테스트(`largeCafe*`, `gardenHouse.*`, `flowCourt.*`, `externalCivil*`, `house*`, `residential*`, `courtyard*`) | C7, C8 |
| C10 | `docs: feature guides, architecture, implementation and verification records` | `docs/**` 전체(수정 24 + 신규 167). `docs/verification/*.json`이 `output/` 경로를 참조하면 C11 결정과 맞춰야 한다 | C2~C9 (설명 대상) |
| C11 | `docs: update README, NEXT-STEPS, PROJECT-STATE` | 루트 `README.md`, `NEXT-STEPS.md`, `PROJECT-STATE.md` | C10 |
| (선택) C12 | `chore(output): refresh tracked verification evidence` | 수정된 추적 `output/**` 20개 중 의미 있는 것과, 6장 기준으로 고른 미추적 증거 | C10 |

의존 관계에서 주의할 점:
- `apps/web/src/state/assemblyMotion.ts`가 `../copilot/`를 import한다. 그래서 C7만 먼저 넣으면 빌드가 깨질 수 있다. 해결책은 둘 중 하나다: ① C7에 해당 copilot 모듈(`assemblySearchPolicy.ts` 등)만 먼저 넣거나, ② **C7과 C8을 한 커밋으로 합친다**. 리뷰 부담이 적은 쪽은 ①이다.
- `apps/web/server/*`는 `../src/copilot/cadToolContract`, `copilotTaskScope`, `cadRecipes`, `copilotPlanning`, `assemblySearchPolicy`를 import한다. 그래서 `vite.config.ts` 변경은 반드시 서버·copilot 파일과 같은 커밋(C8)에 넣어야 한다. 그렇지 않으면 `vite` 시작부터 실패한다.
- C1은 단독으로도 안전하다. 의존성만 추가하고, 이를 쓰는 코드는 C8에서 들어온다.
- 각 커밋 전에는 `git diff --cached --stat`으로 묶음을 확인하고, 커밋 후에는 `pnpm --filter @agent-webcad/web build`, `pnpm --filter @agent-webcad/web test`, `pnpm --filter @agent-webcad/web check:architecture`를 권장한다.

## 4. 커밋 대상에서 뺄 것

| 대상 | 이유 | 처리 |
|---|---|---|
| 루트 `output-*.log` (128개) | 실행 로그. 이미 `.gitignore`의 `*.log`로 무시됨 | 커밋 작업 불필요. 6장 기준으로 디스크만 정리 |
| `output/pdf/` 새 PDF 7개 | 요청에 따라 제외. 재생성 가능한 출력물 | 커밋하지 않음. 6장 기준 적용 |
| 루트 `ChatGPT 이미지 2026년 10월 18일 오전 09_48_37.png` | 출처가 외부 생성 이미지인 참고 자료로 보이고, 루트 위치도 맞지 않음 | 커밋하지 않음. 필요하면 소유자가 `docs/research/` 등으로 옮길지 결정 |
| `output/external/civil-projects/` | 외부 원본 `.dwg`·`.pdf`가 들어 있어 **재배포 라이선스 확인이 필요**함. `.log`는 이미 무시됨 | 라이선스를 확인하기 전에는 커밋하지 않음. `source-manifest.json`·`provenance.json`·`RESULTS.md`처럼 출처와 결과만 남기는 방안을 검토 |

## 5. 판단 근거 메모

- 영역 분류는 경로 기준으로 했다. 내용이 다른 영역에 가까운 파일(예: `src/interop/glb*.ts`, `src/precision/dxfStyle.ts`)은 커밋안(3장)에서 내용 기준으로 옮겼다.
- "수정 약 200 / 미추적 약 740"은 실측 203 / 741과 맞는다. 요청에 있던 "루트 `output-*.log` 약 150개"는 Glob 실측으로 128개였고, 모두 git 무시 대상이라 944개 집계에는 들어가지 않는다.
- 패키지 내부 의존(C2→C3)은 import 그래프를 끝까지 확인하지 않았다. C3이 C2 없이 빌드된다면 순서를 바꿔도 된다.
- 테스트 파일의 커밋 배정은 파일 이름으로 판단했다. 일부 browser 테스트는 여러 기능을 함께 검증할 수 있으니, 빌드·테스트가 깨지면 인접 커밋으로 옮긴다.

## 6. 산출물(output·로그) 보관/정리 기준 제안

다음 순서대로 판단한다. 앞의 조건에 먼저 걸리는 쪽을 따른다.

1. **문서가 참조하는 증거는 보관한다.** `docs/verification/*.json|md`나 `docs/implementation/*.md`가 경로로 인용하는 `output/verification/<slug>/`, `output/projects/<slug>/` 파일은 커밋 후보로 둔다 (C12). 인용되지 않으면 2번으로 간다.
2. **재생성할 수 있으면 커밋하지 않는다.** 스크립트(`apps/web/scripts/verify*`, `browserChecks.mjs`)로 다시 만들 수 있는 PDF·PNG·SVG·DXF·report JSON은 대표본(최종본 1세트)만 남긴다. 중간 시도본(`*-recheck-*`, `*-before*`, `*-initial-*`, `*-regression-backup*`, `output-preflight-r5-1..4.pdf` 같은 반복본)은 정리 대상이다.
3. **루트 `output-*.log`는 날짜와 단계로 정리한다.** 이미 git 밖에 있으므로 다음 기준을 제안한다.
   - 해당 단계(`b0`·`b1`·`b2`·`g5`·`g6` 등)가 커밋으로 마감되고 `docs/verification`에 결과가 기록됐으면 → 삭제하거나 저장소 밖 보관소(예: `../agent-webcad-logs/2026-10/`)로 옮긴다.
   - 아직 진행 중인 단계이거나 실패 원인을 분석 중이면 → 남겨 둔다.
   - 앞으로는 로그를 루트가 아닌 `output/logs/<stage>/`처럼 한 폴더에 쓰도록 스크립트를 바꾸기를 권한다 (이번 작업에서는 고치지 않음).
4. **외부 원본·제3자 파일은 라이선스를 확인하기 전까지 커밋하지 않는다.** (`output/external/**/*.dwg`, 외부 PDF)
5. **용량 기준**: 파일 하나가 1 MB를 넘는 바이너리(PDF·PNG·DWG·GLB)는 2번을 다시 확인하고, 그래도 보관해야 하면 Git LFS나 외부 보관을 검토한다.
6. 정리(삭제)는 **Codex와 같이 쓰는 원본 트리라서** 소유자가 승인한 뒤 한 번에 한다. 그 전에는 목록만 만든다.

추가 제안 (이번 작업에서는 적용하지 않음): `output/pdf/`의 새 파일을 계속 제외하려면 `.gitignore`에 넣기보다, "대표본만 추적한다"는 규칙을 `docs/verification/README.md`에 적어 두는 편이 기존 추적 파일(`output/pdf/` 50개)과 충돌하지 않는다.

## 7. 순서대로 안전하게 커밋하는 실행 절차 (재확인 결과)

### 7.0 실행하지 않은 이유
수정 요청은 "확인해서 실행"이었지만, 이 작업의 규칙(`git add`/`commit`/`stash`/`reset`/`checkout` 금지, 원본 트리를 Codex와 같이 씀)이 우선한다. 그래서 **절차 확인까지만 하고 커밋은 실행하지 않았다.** 소유자가 아래 절차를 직접 실행하거나, Codex 작업을 멈춘 상태에서 명시적으로 커밋 권한을 다시 주면 그대로 진행할 수 있다.

### 7.1 읽기 전용으로 다시 확인한 사실 (2026-10-31)
| 항목 | 명령 | 결과 | 의미 |
|---|---|---|---|
| 스테이징 상태 | `git diff --cached --name-only` | 비어 있음 | 지금 index에 섞인 것이 없다. 아래 `git add -- <경로>` 방식이 안전하게 시작된다 |
| 항목 수 | `git status --short` | 수정 203 / 미추적 744 | 1장 집계(741)보다 3개 늘었다. 이 문서 자신과 그 사이 Codex 작업분으로 보인다. 실행 직전에 다시 세야 한다 |
| 줄바꿈 | `git config --get core.autocrlf`, `git ls-files --eol apps/web/src/App.tsx` | `true`, `i/lf w/crlf` | index는 LF로 저장된다. `LF will be replaced by CRLF` 경고는 무해하며 줄바꿈만 바뀐 diff는 생기지 않는다 |
| 커널→문서 의존 | `packages/cad-kernel/src`에서 `cad-document` 검색 | 없음 | C2와 C3은 서로 독립이다. 순서는 바꿔도 된다 (5장의 미확인 항목 해소) |
| 앱↔copilot 의존 | `apps/web/src`에서 `../copilot/` 검색 | `ExplorerPanel.tsx`, `AppShell.tsx`, `CadViewport.tsx`, `state/assemblyMotion.ts`, `properties/AssemblyCandidateSearchPanel.tsx`, `interop/ArchitectureWallPanel.tsx`가 copilot을 import. 반대로 `cadModelingTools.ts`는 `../state/` 등을 9곳 import | **양방향 의존**이다. 3장의 C7(편집기)과 C8(copilot)은 **한 커밋으로 합친다** (3장 주의의 ②안 채택) |

### 7.2 확정한 커밋 순서
3장 표를 위 확인 결과로 고친 최종안이다. 중간 커밋은 "리뷰 단위"이고, 빌드 보장은 마지막 상태 기준이다 (7.4에서 커밋별 검증 방법 제시).

| # | 커밋 메시지(가제) | `git add --` 경로 |
|---|---|---|
| S1 | `chore(deps): add MCP client/server and zod` | `apps/web/package.json pnpm-lock.yaml` |
| S2 | `feat(document): assembly, canvas, mesh, measurement, scene schema` | `packages/cad-document/src packages/cad-commands/src` |
| S3 | `feat(kernel): brep distance, planar reconstruction, shape resources` | `packages/cad-kernel/src` |
| S4 | `feat(cad): geometry evaluation worker and retained shape cache` | `apps/web/src/cad apps/web/tests/kernelResources.* apps/web/tests/helpers/geometryTransfer.worker.ts apps/web/tests/helpers/kernelP4Fixture.ts` |
| S5 | `feat(interop): DXF hatch, MTEXT, spline, colors, import progress` | `apps/web/src/interop/dxf* apps/web/src/interop/DxfReviewDialog.tsx apps/web/src/precision/dxfStyle.ts apps/web/tests/curveDxf.* apps/web/tests/curveHatch* apps/web/tests/dxf* apps/web/tests/importCancellation.test.ts apps/web/tests/helpers/curveDxfFixture.ts apps/web/tests/helpers/curveHatchFixture.ts docs/licenses` |
| S6 | `feat(export): output preflight and GLB export` | `apps/web/src/export apps/web/tests/outputPreflight.* apps/web/tests/glbExport.test.ts apps/web/tests/artboardPdf.test.ts apps/web/tests/simready* apps/web/tests/helpers/preflightFixture.ts` |
| S7 | `feat(app): editor features and copilot/CAD MCP integration` (기존 C7+C8) | `apps/web/src apps/web/server apps/web/vite.config.ts apps/web/tests apps/web/scripts/browserChecks.mjs apps/web/scripts/browserInput.mjs apps/web/scripts/checkArchitecture.ts apps/web/scripts/localCopilotLive.ts apps/web/scripts/mcpBrowserClient.mjs apps/web/scripts/verifyCopilot*.ts` 에서 시나리오 테스트 제외 (아래 명령 참고) |
| S8 | `chore(scripts): verification, benchmark, and scenario scripts` | `apps/web/scripts apps/web/tests` (남은 것 전부) |
| S9 | `docs: feature guides, architecture, implementation and verification records` | `docs` (단, `docs/reviews/WORKTREE-TRIAGE-2026-10-31.md`는 넣을지 소유자 결정) |
| S10 | `docs: update README, NEXT-STEPS, PROJECT-STATE` | `README.md NEXT-STEPS.md PROJECT-STATE.md` |
| (선택) S11 | `chore(output): refresh tracked verification evidence` | 6장 기준으로 고른 `output/...` 파일만 개별 경로로 |

끝까지 커밋하지 않는 것: `output/pdf/` 새 PDF, `output/external/`, 루트 `ChatGPT 이미지 2026년 10월 18일 오전 09_48_37.png`, 루트 `output-*.log`(이미 무시됨).

### 7.3 실행 명령 (PowerShell, 저장소 루트에서)
사전 조건: **Codex 작업을 멈추고**, 아래 0단계가 모두 통과해야 시작한다.

```powershell
# 0단계: 사전 점검 (읽기 전용)
git diff --cached --name-only          # 출력이 비어 있어야 함
git status --short | Measure-Object    # 수정/미추적 수를 이 문서와 비교
pnpm --filter @agent-webcad/web build  # 최종 상태가 빌드되는지 먼저 확인

# 각 커밋 공통 패턴 (S1 예시)
git add -n -- apps/web/package.json pnpm-lock.yaml   # -n: 무엇이 들어갈지 미리 보기만
git add -- apps/web/package.json pnpm-lock.yaml
git diff --cached --stat                              # 묶음 확인. 엉뚱한 파일이 있으면 git restore --staged -- <경로>
git commit -m "chore(deps): add MCP client/server and zod"

# S7: 시나리오 테스트는 pathspec 제외로 S8에 남긴다
git add -- apps/web/src apps/web/server apps/web/vite.config.ts apps/web/tests `
  apps/web/scripts/browserChecks.mjs apps/web/scripts/browserInput.mjs apps/web/scripts/checkArchitecture.ts `
  apps/web/scripts/localCopilotLive.ts apps/web/scripts/mcpBrowserClient.mjs 'apps/web/scripts/verifyCopilot*.ts' `
  ':!apps/web/tests/largeCafe*' ':!apps/web/tests/gardenHouse.*' ':!apps/web/tests/flowCourt.*' `
  ':!apps/web/tests/externalCivil*' ':!apps/web/tests/house*' ':!apps/web/tests/residential*' `
  ':!apps/web/tests/courtyard*' ':!apps/web/tests/fixtures/repairSchoolTask.ts' `
  ':!apps/web/tests/helpers/residential*' ':!apps/web/tests/helpers/courtyardPavilionFixture.ts' ':!apps/web/tests/helpers/pavilionFixture.ts'
```

규칙:
- `git add -A`, `git add .`, `git commit -a`는 쓰지 않는다. `output/`과 Codex가 새로 만든 파일이 섞인다.
- 매 커밋 전에 `git diff --cached --stat`을 보고, 이 문서에 없는 경로가 보이면 멈춘다.
- 전부 끝난 뒤 `git status --short`에 남은 것이 7.2의 "커밋하지 않는 것"과 S11 후보뿐인지 확인한다.
- 마지막에 `pnpm --filter @agent-webcad/web build`, `pnpm --filter @agent-webcad/web test`, `pnpm --filter @agent-webcad/web check:architecture`를 실행한다.
- push는 위 검증과 소유자 승인 뒤에 따로 한다.

### 7.4 커밋별 빌드 검증 (선택)
작업 트리에는 모든 변경이 다 있으므로, 중간 커밋에서 빌드를 돌려도 그 커밋만의 상태를 검증하지 못한다. 커밋별로 확인하려면 원본 트리를 건드리지 않는 별도 worktree를 쓴다.

```powershell
git worktree add ..\agent-webcad-verify <S4 커밋 해시>
cd ..\agent-webcad-verify; pnpm install --frozen-lockfile; pnpm --filter @agent-webcad/web build
cd ..\agent-webcad; git worktree remove ..\agent-webcad-verify
```

S4~S6이 S7 파일(예: `src/state`, `src/precision`의 새 모듈)을 참조해 깨지면, 그 커밋을 S7과 합친다.
