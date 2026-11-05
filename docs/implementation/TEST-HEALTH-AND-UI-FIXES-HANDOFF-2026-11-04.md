# 회귀 스위트 복구와 UI 버그 수정 인계 (2026-11-04, Claude)

## 요약

사용자가 "알아서 개선"을 맡겼다(4시간). 원본 작업 트리에서 직접 고쳤고 **커밋하지 않았다**. 10-31 이후 한 번도 돌리지 않은 타입 검사·아키텍처 검사·Node 스위트·브라우저 스위트를 실제로 돌려 깨진 곳을 찾고, 원인이 앱에 있으면 앱을, 테스트가 UI 변경을 못 따라간 것이면 테스트를 고쳤다. 원인을 끝까지 못 찾은 실패는 아래 "남은 실패"에 진단과 함께 남긴다.

| 검사 | 시작 시 | 종료 시 |
|---|---|---|
| `tsc -b` | 오류 1 (`assemblyJointGizmo.ts`) | 통과 |
| `checkArchitecture` | 문서 링크 1,070건 깨짐 | 통과 |
| Node 스위트 | 1828 중 2 실패 | 1829 중 1828 통과. 남은 1개(`assemblyMotion` OCCT sweep)는 전체 실행 부하에서만 시간 예산 초과, 단독 8/8 통과(기존에 알려진 현상) |
| 브라우저 스위트 (183 페이지) | 첫 페이지에서 중단 | 172 통과, 11 실패(아래). 주의: 96개 페이지는 1차 전체 실행에서만 통과를 확인했고, 그 뒤에 Fit 복구·커널 예열·씬 선택 수정이 들어갔다. 실패했거나 1차에서 못 돈 87개는 최종 코드로 단독 재실행했다 |

브라우저 스위트는 원래 첫 실패에서 멈춘다. 전체 상태를 보려고 페이지마다 따로 실행하는 임시 러너를 썼다(저장소에 남기지 않음).

## 앱 수정 (사용자에게 보이는 버그)

| 파일 | 문제 | 수정 |
|---|---|---|
| `src/viewport/CadViewport.tsx` | 같은 부모 아래 `SavedMeasurements`와 `SelectedDistance`가 둘 다 `key={cadDocument.id}`를 써서 React 키가 중복됐다. 문서를 새로 만들거나 열 때마다 "저장된 측정" 패널이 복제돼 쌓였다(테스트에서 5개 확인). | 키를 `saved-measurements:<id>`, `selected-distance:<id>`로 분리 |
| `src/viewport/SelectedDistance.tsx` | Direct 모드에 들어가기만 하면 "면·모서리 지정 측정" 패널이 2D 도면 편집 중에도 캔버스 오른쪽 아래를 덮어 직접편집 핸들을 가렸다. 또 아무것도 고정하지 않아도 80 ms마다 강제 리렌더했다. | 면/모서리를 고르거나 A/B를 고정·불러오기 전에는 렌더하지 않음(마운트는 유지해 고정값 보존). 위치 재투영 루프는 A·B가 모두 있을 때만 |
| `src/viewport/CadViewport.tsx` `cancelDirectPointerRef` | 직접편집 취소가 드래그 중이 아니어도 OrbitControls·TransformControls를 무조건 다시 켰다. 그리기 도구가 꺼 둔 카메라 조작이 되살아나 선 그리기 포인터를 가로챘다(draftingWorkflow 실패 원인). | 실제 드래그가 있었을 때만 복원 |
| `src/viewport/CadViewport.tsx` TransformControls | 붙은 대상이 없어도 활성 상태면 모든 캔버스 포인터를 capture했다. | `enabled`를 "요청됨 && 대상 있음"으로 계산하는 접근자로 감쌈 |
| `src/viewport/CadViewport.tsx` 박스 선택 | 선택 사각형 시작 시 `setPointerCapture`가 예외를 던질 수 있었다(다른 호출부는 이미 try로 감쌈). | try/catch |
| `src/viewport/CadViewport.tsx` `fitBounds` | **10-31 제 변경의 회귀.** 일반 정투영 Fit을 "투영 사각형 + 8% 여백"으로 촘촘하게 바꾼 것이 브라우저 페이지 7개를 깨뜨렸다(patternsWorkflow, drawingFrames, savedMeasurementPlacement, measurementLayout, imageWorkflow, constructionWorkflow, canvasFlex 일부). 테스트들이 기존 경계구 배치를 전제로 클릭 좌표를 잡고, 실제로도 프레임 라벨·치수 라벨이 캔버스 위 버튼("Frames & sheets", 선택 편집 막대)에 가렸다. 픽셀 여백(60/90/140 px, 위아래 비대칭)도 시험했지만 수렴하지 않았다. | 일반 Fit은 **10-31 이전 경계구 공식으로 복구**. 촘촘한 사각형 Fit(위아래 90 px·좌우 40 px 픽셀 여백)은 명시적 시트/아트보드 맞춤(`fit-active-artboard`, `viewPlane` 인자)에만 남김. 추가로 `insetLeft`를 넣어 왼쪽에 떠 있는 편집기 폭을 빼고 중심을 옮김. Pattern·Construction·Block 미리보기 Fit에 적용(`floatingEditorInset`). 10-31에 얻은 "A3 도면 Fit이 화면을 채움"은 일반 Fit에서는 되돌아갔다(아래 남은 결정 참고) |
| `src/cad/kernelGeometryService.ts` `warmKernel` | **10-31 제 변경의 부작용.** 3D 진입 1.5초 후 커널 예열이 일반 작업처럼 `submittedTasks`를 올려, "레이아웃이 커널 작업을 요청하지 않음"을 검사하는 canvasFlex가 타이밍에 따라 실패했다. | 예열은 워커에 직접 요청하고 작업 지표(`submittedTasks`/`activeTasks`)에서 제외. 상태는 loading → ready |
| `src/App.tsx`, `scenes/ScenesPanel.tsx`, `explorer/ExplorerPanel.tsx`, `app/AppShell.tsx` | 씬 패널에서 장면을 열거나 "New scene from selection"을 누르면 `activateArtboard`가 캔버스 선택을 지웠다. 두 번째 "선택으로 새 장면"이 빈 장면이 됐다(scenesWorkflow). 선택 해제는 10-31 이전 Codex 변경. | `activateArtboard(id, {keepSelection})` 옵션 추가. 씬 패널만 선택 유지, Artboards 패널 등 나머지는 기존대로 해제 |
| `src/ribbon/Ribbon.tsx` | 점 기준 Move/Copy/Rotate를 시작하면 리본이 Modify 탭으로 바뀌는데, 그 명령들은 Draw 탭의 "Editing actions"에만 있었다. 다음 점 기준 명령을 고를 수 없었다. | Modify 탭(2D)에 "By points" 그룹 추가 |
| `src/copilot/copilotConnection.ts` | 게이트웨이가 같은 잘못된 제안을 반복하면 "Repeated rejected/no-op proposal"만 보이고 원래 거부 이유가 사라졌다. | `Last reason: …`으로 첫 거부 이유를 붙임 |
| `src/copilot/cadToolContract.ts`, `cadToolSession.ts` | `cad.tools` 전체 카탈로그(도구 96개)가 63 KB로 자라 탐색 한 번이 64 KiB 전송 예산을 거의 다 썼다. 탐색 후 조회 한 번이면 "transcript exceeds 64 KiB"로 실패했고(cadTools.test), MCP 단일 읽기 한도까지 1.8 KB만 남아 있었다. | 인자 없는 `cad.tools`는 간결한 색인(이름·라벨·readOnly, 약 7.9 KB), `names`(최대 16개)를 주면 그 도구들의 설명·스키마. 모르는 이름은 거부. 회귀 테스트 추가 |
| `src/explorer/views/ModelPanel.tsx`, `ui/explorer.css` | **10-31 제 변경의 부작용.** 중복 이름 `#n`을 `.tree-label` 안에 넣어 라벨 텍스트가 "Cylinder #1"로 바뀌었다(modelDrawing 실패). | `data-ordinal` + CSS `::after`로 표시만. 텍스트는 저장 이름 그대로. 실제 UI에서 `Box #1`, `Box #2` 표시 확인 |
| `src/app/ProjectHome.tsx` | 홈 상세에 내부 ID `legacy`가 그대로 보였고, 열려 있는 탭에 "Not opened recently"가 붙었다. | `Starter project` 표시(ID는 title), 열린 탭은 "Open in this session" |
| `src/viewport/assemblyJointGizmo.ts` | 클로저 안에서 `j.min!` 좁히기 실패로 `tsc -b` 오류 | 지역 변수로 좁힘 |

## 테스트·문서 수정 (앱 변경을 못 따라간 테스트)

- `docs/verification/WEBCAD-FEATURE-AUDIT.md`: `<C:/Users/...:line>` 절대 경로 링크 1,070개를 `../../path#Lline` 상대 링크로 바꿈. 아키텍처 검사가 통과한다.
- `docs/architecture/CAD-TOOL-INTERFACE.md`: `cad.tools` 행 갱신.
- `tests/helpers/physicalInput.ts`: 리본 그룹을 펼치는 `openDisclosureFor()`를 분리해 내보냄. Obscured 오류에 가린 요소도 적음.
- `patternsWorkflow`, `contourWorkflow`, `basicEditWorkflow`, `curveWorkflow`, `contourTrimWorkflow`, `sessionContinuity`: 리본 Patterns/Edit 그룹이 팝오버로 바뀐 뒤에도 숨은 버튼을 바로 누르려 했다. 각 로컬 `physical()`이 먼저 `openDisclosureFor()`를 부른다.
- `deliveryWorkflow`: `click("Model")`이 탐색기 대신 리본 Model 탭을 눌렀다. 탐색기 `Model tree` 활동 버튼으로 한정.
- `copilotQuery`: Copilot 패널의 로컬 모델 상태 확인(`/api/copilot/status`)까지 게이트웨이 요청으로 셌다. 상태 요청은 스텁하고(이 PC의 실제 Ollama에 닿지 않게) `/plan`만 셈.
- `tests/helpers/browserChecks.ts`: 잡히지 않은 브라우저 오류에 스택 앞부분을 붙임(이번 원인 추적에 필요했음).
- `tests/cadTools.test.ts`: `cad.tools` 색인·이름 조회·모르는 이름 거부 테스트 추가.

## 남은 실패 (원인과 함께)

| 페이지 | 실패 | 진단 | 성격 |
|---|---|---|---|
| `keyboardActivation` | 컴포넌트 행 Enter 뒤 문서 명령이 끝나지 않아 대기 시간 초과 | 10-31 15:17 스냅숏 사본(`C:\Users\thefi\agent-webcad-p1`)에서는 21/21 통과 → **그 이후 회귀**. 오늘 바꾼 커널 예열·"By points" 그룹을 각각 빼도 실패해 원인을 좁히지 못했다. 10-31 제 UI 변경 또는 이후 Codex 변경 중 하나 | 회귀, 원인 미확정 |
| `sketchCanvas` | Direct 드래그의 합성 PointerEvent에 OrbitControls가 `setPointerCapture` → 예외 | 실제 마우스에서는 문제없음. CDP 입력으로 바꿔 봤으나 Direct 의도 패널이 열리지 않아 되돌림 | 테스트 입력 방식 |
| `wheelNavigation` | `ResizeObserver loop completed…`를 잡히지 않은 오류로 취급 | 10-31 스냅숏에서도 동일하게 실패 | 기존 실패 |
| `copilotContext` | 요청 중 planner 전환 | planner `<select>`가 요청 대기 중 **비활성화**돼 시나리오 자체가 불가능. 테스트를 "비활성 확인"으로 바꿀지, 전환을 허용할지 결정 필요 | Codex 설계 결정 |
| `copilotApply` | `Clear` 버튼 없음 | 두 번째 묶음이 거부되면 plan이 비어 Clear가 렌더되지 않음 | 테스트 드리프트 추정 |
| `copilotEdit` | 잠긴 하위 치수가 있는 Move 거부 검사 | 미조사 | Codex 영역 |
| `cadToolsAdvanced` | 요청 본문의 도구가 40개가 아님 | `taskToolScope`가 본문 카탈로그를 작업 범위(일반 13개)로 줄였다. sweep/loft/shell 스키마는 본문에 없고 이제 `cad.tools` 색인→이름 조회로만 얻는다. 범위에 생성형 고급 도구를 넣을지 결정 필요 | Codex 설계 결정 |
| `residentialTask` | `Fit active artboard` 버튼 없음 | 활성 아트보드가 있을 때만 렌더. 미조사 | 미조사 |
| `residentialExtended` | `mm override receipt` 검사 | 미조사 | 미조사 |
| `courtyardH1` | A2 5쪽 96dpi 총 예산 진단 | 미조사(233초 걸리는 긴 페이지) | 미조사 |
| `assemblyDrive` | 관절 구동 UI 준비 대기 초과 | 11-01 Codex 작업 영역, 미조사 | Codex 영역 |

## 후속: Fit 여백을 사용자 설정으로 (2026-11-05, 사용자 요청)

사용자 결정: "여백은 기본적으로 여유롭되 원하면 바꿀 수 있게". `View › Fit margin · 맞춤 여백`에 Roomy(기본)/Balanced/Tight를 추가했다. 선택은 브라우저(`localStorage` `agent-webcad-fit-margin`)에 저장되고 다음 Fit부터 적용된다.

- Roomy: 일반 Fit은 기존 경계구 방식(A3가 화면 높이의 약 절반). 기존 브라우저 테스트가 전제하는 배치 그대로라 테스트 수정이 필요 없다.
- Balanced/Tight: 투영 사각형 Fit. 캔버스 버튼("Frames & sheets", 뷰 버튼, 하단 안내 막대)에 가리지 않게 위·아래·좌우 픽셀 여백(Tight 110/80/40 px, Balanced 130/100/60 px)을 두고 그 사이 띠의 가운데에 놓는다. Tight에서 A3가 화면 높이의 약 75%.
- 아트보드(시트) 맞춤은 설정과 관계없이 사각형 Fit이며 여백은 설정값을 따른다.
- 파일: `src/state/fitMargin.ts`(신규), `src/menu/MenuBar.tsx`, `src/ui/menu.css`, `src/viewport/CadViewport.tsx` `fitBounds`, 테스트 `tests/fitMargin.test.ts`.
- 확인: 기본값에서 Fit 민감 페이지 10개(draftingWorkflow, patternsWorkflow, drawingFrames, savedMeasurementPlacement, measurementLayout, imageWorkflow, constructionWorkflow, canvasFlex, directEditExperience, modelSheetLayout) 통과. 실제 UI에서 Roomy·Tight 화면과 메뉴를 확인했다. Balanced/Tight로 브라우저 스위트를 돌리면 고정 픽셀 좌표 테스트 일부가 실패한다(테스트는 기본값 기준).

## 실패와 시행착오

- 브라우저 스위트를 배경으로 돌리면서 같은 시간에 개별 페이지를 돌리자 `patternsWorkflow`·`brepDistance` 등이 시간 초과나 커널 대기로 실패했다. 단독 실행에서는 통과했다. 판정은 **단독 재실행 결과**로 했다.
- `sketchCanvas`를 CDP 실제 마우스 입력으로 바꿔 봤지만 Direct 드래그가 시작되지 않아 되돌렸다(아래 남은 실패 참고).
- `copilotContext`에서 planner 옵션 순서가 바뀐 줄 알고 인덱스를 고쳤다가 틀려서 되돌렸다. 실제로는 요청 대기 중 planner `<select>` 변경이 반영되지 않는다.
- 진단용으로 `--artifacts` 실행을 했다가 추적되는 `output/images/cad-image-review.png`를 실패 화면으로 덮어썼다. HEAD 버전(10-31 스냅숏 해시와 동일)으로 되돌렸다.
- 테스트 실행은 `output/verification`, `output/projects/*/browser-report.json` 등을 다시 쓴다. 세션 끝에 오늘 바뀐 `output/` 파일 171개를 스크래치에 백업하고, 10-31 스냅숏에 있는 것은 스냅숏 내용으로, 없고 git에 있는 것은 HEAD로 되돌렸다. 이때 **같은 시각 Codex가 만든 `output/projects/three-storey-house/` 25개 파일과 `output/verification/assembly-drive/browser-report.json`을 "오늘 새로 생긴 파일"로 보고 지웠다가 즉시 백업에서 복원했다**(내용 동일, 파일 시각만 복원 시각). 10-31~11-04 사이에 Codex가 갱신한 `output/` 보고서가 있었다면 10-31 내용으로 돌아갔을 수 있다.
- 이 세션 중 Codex도 같은 트리에서 작업했다(3층 주택, `PROJECT-STATE.md`). 그쪽 문서상 제품 코드 변경은 없어 제 소스 수정과 겹치지 않았다.

## 재현

```
cd apps/web
npx tsc -b
npx tsx scripts/checkArchitecture.ts
npx tsx --test 'tests/**/*.test.ts'
node scripts/browserChecks.mjs --page=<page>
```

브라우저 스위트는 첫 실패에서 멈추므로 전체 상태가 필요하면 페이지별로 돌린다. 이 PC에는 Ollama가 설치돼 있어 Copilot 상태 확인이 실제 모델 목록을 읽는다. 스텁하지 않은 테스트는 환경에 따라 결과가 달라질 수 있다.
