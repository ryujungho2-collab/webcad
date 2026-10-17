> 2026-10-17 기능 설명 통합 전 보존본입니다. 현재 사용법·지원 범위는 [기능 가이드](../features/README.md), 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따릅니다.

# 프로젝트 작업 공간·UI 후속 작업 위임안

현재 우선순위: [평면도 계획](../product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md)의 **WF-Q1 실제 주거 과제 검증**이다. UI-P2·WF-A1·C0/A2/B1·B2/B3·CMP-S1/WF-D1은 각각 지원 범위로 완료했다. 아래 UI 전용 순서는 전체 제품 큐를 대체하지 않는다.

정합성 갱신: 2026-10-17. 실행 순위와 상태의 원본은 [NEXT-STEPS](../../NEXT-STEPS.md#현재-실행-큐)다. 이 문서는 향후 위임 시 사용할 구현 경계이며 자동 에이전트 실행 지시가 아니다. **UI-P1-H1/H2·UI-P2-S/C는 지원 범위로 완료**했다. 후속 세션 UI 후보는 **UI-P3-A/B**, UI-C2/C3와 CAD 해치/DXF 보충은 병행 가능한 대기 카드다.

## 공통 계약과 소유권

- 현재 한 프로젝트는 한 CAD 문서다. 프로젝트 내부의 모델·도면 뷰·프레임·시트는 이 문서의 참조 관계를 공유한다. 새 탭과 새 도면 뷰를 같은 동작으로 만들지 않는다.
- 현재 열린 탭은 각각 iframe/Worker/document/history를 소유한다. 탭 전환 시 유지, 닫기/새로고침 후 geometry 복구와 새 Undo 세션이라는 계약을 보존한다. 프로젝트 이름은 현재 workspace 표시 이름이다.
- 통합 담당만 `apps/web/src/App.tsx`, `main.tsx`, `app/projectSession.ts`, 공통 command 계약, `NEXT-STEPS.md`, `PROJECT-STATE.md`를 최종 통합한다. 다른 담당은 필요한 연결 Props/메시지/schema 변경안을 먼저 제안한다. 계약 확정 후 구현한다.
- 세션 담당은 `app/ProjectWorkspace.tsx`, `app/projects.css`, `state/documentFile.ts`, `state/documentRecovery.ts`를 소유한다. 문맥 UI 담당과 속성 담당은 아래 지정 하위 파일만 수정한다. 공통 CSS tokens 변경은 통합 담당에게 요청한다.
- CAD 변경은 기존 command bus·Review/Apply·stale/잠금·한 Undo 경로를 사용한다. UI 정리 때문에 source revision이나 BRep를 재생성하지 않는다. 이름·표시·시트 배치는 기하 변경과 구분한다.
- 테스트는 실패를 숨기려고 skip/강제 click/임의 좌표·오차 완화로 고치지 않는다. 단순 스타일 변경에는 불필요한 새 테스트 대신 실제 화면 확인을 사용한다. 상태/저장/기하 계약 변경에는 회귀를 추가한다.
- 작업 중인 다른 변경을 되돌리지 않는다. 완료는 실제 기능 코드와 사용자 경로가 연결됐을 때만 기록한다. 계획·prototype·지원 범위 일부를 구분한다.

## 카드별 구현 계약 — 완료/대기 상태는 각 절 참조

### UI-P1-H1 · 저장과 복구 신뢰성

**완료:** [구현·검증·지원 경계](../implementation/UI-P1-H1-PROJECT-RECOVERY-2026-10-14.md). 아래 내용은 구현 계약 기록이다. 후속 담당은 `app/projectWorkspaceStore.ts`와 `CheckpointGate`를 재사용한다.

**담당:** 세션. **선행:** UI-P1 완료. **파일:** `app/ProjectWorkspace.tsx`, `state/documentRecovery.ts`, `state/documentFile.ts`, `tests/projectTabs.browser.tsx`, `tests/projectSession.test.ts`.

H1 구현 전에는 목록이 단일 localStorage JSON이었고 손상 시 기존 데이터를 보존하되 복구 UI가 없다. Save는 로컬 복구, Save As는 파일 다운로드인데 dirty 표시 하나로 둘을 설명한다. 닫기 응답은 프로젝트 ID로만 대응한다.

**구현:** workspace 목록 백업·검증·명시적 복원; 복원 실패 시 데이터 다운로드/복구 경로; 로컬 저장 상태와 내보낸 파일 상태의 의미·문구 정리; checkpoint request ID와 session generation 확인; timeout 이후 도착한 과거 응답 거부. 저장할 때 revision을 고정하고 성공한 revision만 저장 완료로 표시한다. 실패 원인과 재시도 버튼을 제공한다. 브라우저가 실제 파일 기록 완료를 알려주지 않으면 다운로드 시작을 저장 완료와 혼동하지 않는다.

**완료/검증:** quota 초과·손상된 manifest·백업 fallback·pending CAD operation·늦은 ack·이중 닫기·다른 탭 메시지·Undo 후 저장 상태를 재현한다. 실패 시 열린 데이터가 사라지지 않아야 한다. 프로젝트 UI에서 복구 후 정상 편집/재열기가 가능해야 한다. 닫기만으로 기존 파일을 덮어쓰지 않는다.

### UI-C2 · 선택 문맥 도구 모음

**담당:** 문맥 UI. **선행:** 기존 명령의 사용 가능 여부 계약 확인. **파일:** 신규 `ui/SelectionToolbar.tsx`, `ui/ToolDisclosure.tsx`, `ribbon/Ribbon.tsx`, 관련 scoped CSS와 browser workflow. App 연결은 통합 담당.

**구현:** 무선택은 주요 작성 도구, line/arc/spline은 이동·복사·길이/곡선 편집, 솔리드는 수치/변환, 프레임은 crop·축척·연결·시트, 주석은 내용·참조·스타일을 노출한다. 혼합 선택/잠금/지원 불가에는 원인을 표시한다. 첫 줄에는 자주 쓰는 소수 명령만 두고 나머지는 메뉴로 보낸다. 명령을 복제하지 않고 registry를 호출한다. 화면 가장자리와 Review 패널을 피하고 선택/텍스트 입력 중 UI가 튀지 않게 한다.

**완료/검증:** 실제 대상 선택→명령→Preview/Apply→Undo, 잠긴 대상·혼합 선택, 메뉴 Escape와 원래 포커스 복귀, 960px/확대 화면. 원본 선·치수·도면 출력을 유지한다. 기존 리본·단축키 경로도 작동한다.

### UI-C3 · 속성 패널의 정보 순서

**담당:** 속성 UI. **선행:** C2와 공통 선택/상태 Props 합의. **파일:** `properties/PropertiesPanel.tsx`, `DraftingPanel.tsx`, `VectorStyleEditor.tsx`, `SketchInspector.tsx`, `NumericModelEdit.tsx`, `ui/inspector.css`.

**구현:** 대상 이름/종류/잠금/참조 상태 요약 → 치수·위치·단위 → 표현 → 고급 의존성 순서. 혼합값은 명시적으로 표시하고 입력한 필드만 적용한다. 단위 해석·잘못된 입력·취소/Apply 경로를 기존 수치 편집과 공유한다. 접기 상태는 UI 설정으로 유지하며 source revision을 바꾸지 않는다. 잠금/stale/미지원 진단을 접힌 영역에 숨기지 않는다.

**완료/검증:** primitive/sketch/frame/annotation/multiselect별 실제 편집, 입력 도중 선택 변경, 단위 변환, 잠금, Undo/Redo, 한글 긴 이름·좁은 패널. 스타일 수정은 SVG/PDF 결과까지 대상별 확인한다.

## 두 번째 묶음 — 기반 보충

### UI-P1-H2 · 저장소와 프로젝트 관리

**완료:** [구현·검증·지원 경계](../implementation/UI-P1-H2-PROJECT-MANAGER-2026-10-14.md). `ProjectManager.tsx`, `projectManagerStore.ts`, `projectStorageTransactions.ts`가 목록 UI·namespace 정리·삭제 journal을 소유한다. 문서 저장 backend 이관은 아직 아니다. 아래는 원래 완료 계약 기록이다.

**담당:** 세션. **선행:** H1. **파일:** `app/ProjectWorkspace.tsx`, 신규 프로젝트 목록/관리 UI, `state/documentRecovery.ts`, `state/documentFile.ts`.

**구현:** 최근/닫은 프로젝트 검색·이름·저장 상태·크기 추정, 선택 프로젝트 내보내기/영구 삭제, 200개 제한 도달 시 정리 경로. 삭제는 대상과 삭제 범위를 명시하고 열린 프로젝트/asset/backup의 소유권을 확인한다. orphan checkpoint 청소는 참조 목록과 성공한 저장 상태에 근거한다. IndexedDB/Dexie 전환은 별도 adapter 실험으로 시작하고 localStorage 원본을 읽고 검증한 뒤에만 migration 완료를 표시한다.

**완료/검증:** 내부 CAD ID가 같은 두 프로젝트와 공유처럼 보이는 asset key를 만들어 하나만 삭제; quota/full storage·migration 중단 후 복구; legacy 캐시 보존. 비동기 저장으로 바꿀 경우 pagehide에만 의존하지 않고 편집 중 지속 checkpoint와 실패 표시를 검증한다.

### UI-P2 · 비활성 탭 비용과 작업 수명

**상태: 지원 범위 완료.** [첫 렌더 억제](../implementation/UI-P2-PROJECT-ACTIVITY-2026-10-15.md), [S 저장소](../implementation/UI-P2-S-DURABLE-STORAGE-2026-10-15.md), [C 취소·메모리](../implementation/UI-P2-C-TASKS-MEMORY-2026-10-16.md)를 따른다. 아래는 최초 완료 조건이다. 현재 유휴 Worker/GPU 반환도 구현했고, 시간 단위 운영·전체 프로세스/문서·Undo 상한과 source/slab byte 예산은 G6-D6-P4 후속이다.

H2의 관리 dialog와 삭제 복구 초기화, live export snapshot, request generation 계약을 보존한다. journal 복구 대기 시 기존 열린 iframe은 유지하되 inert 상태로 둔다. 비활성 탭 최적화가 이 세션을 강제 unmount하거나 원본을 덮어쓰지 않아야 한다.

**담당:** 세션 성능. **선행:** H1 메시지 버전/ack. **파일:** `app/ProjectWorkspace.tsx`, `viewport/CadViewport.tsx`, 관련 renderer·`cad/kernelGeometryService.ts`/Worker lifecycle. 공통 App/protocol은 통합 담당.

**구현:** 활성/보임 상태 메시지로 비활성 프레임의 렌더·pointer 처리를 멈추고 복귀 시 resize/redraw한다. 대기 계산·취소·응답을 세션별로 구분한다. 변경을 잃는 강제 unmount를 메모리 최적화로 사용하지 않는다. Worker 종료/세션 suspend는 Undo·진행 작업 복원 계약이 검증될 때 별도 단계로 채택한다. 첫 범위는 세션 유지+불필요 렌더 억제다.

**완료/검증:** R5(56부품/14도면/10페이지)를 두 독립 프로젝트로 열어 A편집→B전환→A복귀→각 Undo/출력. 렌더 프레임 수·task 수·전환 지연·JS heap/가능한 WASM 계측을 기록한다. WASM capacity와 실제 live/cache bytes를 혼동하지 않는다. 최초 로드와 warmed 전환, 새 source와 같은 source를 나눠 측정한다.

### G6-D4-H2 · 타원/spline 해치

**담당:** 기하. **선행:** 완료된 ellipse/spline section source. **파일:** `precision/sectionHatch.ts`, `sectionBoundary.ts`, 해당 geometry helper와 대상 tests. renderer/export 공통 접점은 통합 담당과 합의.

**구현:** 실제 유한 곡선의 폐합·교차·접선·구멍 포함 관계와 seam을 검증하고 해치 간격/방향을 같은 경계에서 생성한다. 출력에 필요한 곡선 근사 허용오차와 원본 기하를 분리한다. 실패 경계를 조용히 다각형으로 바꾸지 않는다.

**완료/검증:** 타원 외곽+구멍, spline/line 혼합 폐합, 접촉/자기교차/열린 경계·짧은 domain. 편집→연관 갱신→Undo→재열기, 화면/SVG/PDF의 동일한 경계와 축척. R5에 곡선 단면 fixture를 추가해 실제 페이지를 렌더링한다.

### G6-D5-E2 · periodic/fit-only DXF

**담당:** 교환. **선행:** E1 정확 curve writer, schema 지원 경계 합의. **파일:** `interop/dxfParser.ts`, `dxfImport.ts`, `dxfWriter.ts`, `DxfReviewDialog.tsx`, 대상 fixture/tests. document schema 변경은 통합 담당.

**구현:** 먼저 periodic 원본·seam·유한 domain 지원, 이어 fit-only 입력의 결정적인 재구성과 허용오차/손실 Review를 별도 하위 단계로 마감한다. 현재 nonperiodic degree/pole 예산을 몰래 확장하지 않는다. 미지원 입력은 이유와 함께 거절한다. custom LTYPE/폰트 이식은 별도 체크리스트로 남긴다.

**완료/검증:** 단위/OCS/가중치/knot·seam·닫힌 곡선·잘린 종이 domain, import→수정→export→재import 수치 비교, 실제 캔버스·시트 출력. 기준 데이터/오차를 기록하고 근사 변환은 사용자에게 드러낸다.

## 세 번째 묶음 — 비교와 출력 완성도

### UI-P3-A/B · 분할 비교와 탭 탐색

**담당:** 작업 공간. **선행:** H1/P2. **파일:** `app/ProjectWorkspace.tsx`, `app/projects.css`, 새 layout adapter/탭 모델, `tests/projectTabs.browser.tsx`. 단축키 routing은 통합 담당과 조정.

**A 범위:** 서로 다른 열린 프로젝트 2개 좌우 배치, divider 크기 조절, 활성 pane 명확히 표시, 단일 보기 복귀. 같은 프로젝트를 두 편집 iframe으로 중복 생성하지 않는다. DOM 그룹 이동이 iframe을 reload해 Undo를 지우는지 우선 실험한다. Dockview와 react-resizable-panels를 작은 fixture에서 비교한 뒤 하나 또는 기존 CSS 구현을 선택한다. 카메라 동기화는 좌표계/단위·2D/3D가 맞는 경우의 명시적 옵션으로 후속 분리한다.

**B 범위:** 탭 순서 저장, 고정, 이름 검색, overflow, 키보드로 순서 변경·빠른 전환. Ctrl+Tab처럼 브라우저가 소유한 키를 필수 경로로 가정하지 않는다. 입력/IME 중 단축키를 가로채지 않는다.

**완료/검증:** A/B 양쪽 편집과 각각 Undo·내보내기, 포커스/메뉴가 다른 pane에 명령을 보내지 않음, resize·분할 종료·새로고침·긴 제목/960px. layout 변경만으로 source revision/geometry 계산이 늘지 않음.

### G6-D6-P4 · 캐시 byte 예산과 cold HLR

**담당:** 커널 성능. **선행:** P3. **파일:** `cad/kernelRuntime.ts`, `state/modelSectionService.ts`, `state/modelProjectionService.ts`, 관련 protocol/benchmark. P2와 Worker lifecycle 파일을 동시에 수정하지 않는다.

**구현:** source/retained-slab/cache의 count 상한과 byte 추정 예산·퇴출·명시적 해제를 함께 관리한다. pinned/in-flight 데이터와 stale revision을 분리한다. 최초 새 source의 global HLR 병목을 계측하고 개선한다. 상한 초과 시 정확한 계산 경로 또는 명시적 실패를 사용한다.

**완료/검증:** 최소 5회 독립 cold/warm 실행의 원시값·중앙값·최솟값/최댓값과 환경 기록. 작은 표본의 p95를 안정적 지표처럼 해석하지 않는다. 같은 source/새 source·회수 전후·다중 세션을 분리한다. cache hit만으로 성능 완료를 주장하지 않는다. 기하/hidden line 결과 동등성, stale/잠금/Undo와 eviction 후 재생성을 검증한다.

### G6-D5-Q1 · 출력 전 점검

**담당:** 도면 출력. **선행:** H2/E2 지원 범위 확정. **파일:** `export/ArtboardPdfDialog.tsx`, `export/exportModel.ts`, `export/modelSheetExport.ts`, `plot/plotPlan.ts`, 신규 preflight UI/검수 tests.

**구현:** 시트별 누락 참조·stale·축척·잘린 주석·폰트·지원 밖 곡선·근사 손실을 출력 전 표시하고 해당 뷰로 이동. 시트 썸네일과 최종 출력은 같은 scene/domain/crop 정보를 사용한다. 진단이 원본을 수정하지 않으며, 자동 수정은 별도 Review/Undo로 적용한다.

**완료/검증:** R5 전체 시트 세트 및 결함 fixture. 문제 수정→재검사→PDF/SVG/DXF→재열기. 실제 다운로드한 PDF 페이지를 독립 렌더링하고 화면과 비교한다.

## 후속 카드의 첫 범위

| 카드 | 담당 파일 범위 / 선행 | 첫 산출물과 합격 기준 |
| --- | --- | --- |
| UI-C4 | 신규 app/ProjectHome, H2 목록 API | 최근/검색/샘플 복제/복구. 기존 프로젝트에 덮어쓰지 않고 템플릿은 새 ID/asset namespace |
| UI-C5 | input/shortcutRouter, shortcutCatalog, ui/ToolDisclosure 및 dialog 호출부; C2/C3 | 단축키 안내·진행/취소·저장 상태 규칙, 키보드만으로 작성/편집/닫기/복구. 한글 IME·포커스/확대 확인 |
| G2-W1 | explorer 하위 신규 project tree, 기존 viewport model/frame APIs; C3/C4 | 모델/도면/시트 트리와 검색·대상 보기. 탐색이 geometry revision/Undo를 만들지 않음 |
| G2-W2 | 신규 library UI와 기존 block/import 명령; W1 | 문/창/가구·도곽 작은 기본 library, 단위/원점/의존성 Review·한 Undo·저장 재열기 |
| I-UX1 | properties/ImageInspector, viewport/ImageCropHandles, image renderer; C2/C3 | 교체/맞춤/crop/opacity/순서 접근 개선. 기존 원본/좌표·출력·asset 복구 보존 |
| UI-P4 | H2 workspace packaging adapter; W1 | 프로젝트 묶음 내보내기/열기와 충돌 Review. 동일 ID를 세션별 remap, asset 누락·실패 rollback. 실시간 협업은 별도 명세 |

## 복사해서 맡길 지시문

> NEXT-STEPS.md 현재 실행 큐의 [카드 ID]를 구현하세요. docs/product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md에서 해당 카드와 공통 계약을 먼저 읽으세요. 지정된 파일 범위를 소유하고 공통 App/메시지/schema 변경은 통합 담당에게 인터페이스 제안을 보내세요. 실제 UI와 명령/저장/출력 경로까지 연결하고 대상 검증을 수행하세요. 테스트만 늘리고 구현 완료로 보고하지 마세요. 결과에는 변경 파일, 사용자 재현 절차, 실행한 검증과 결과, 스크린샷/출력 증거, 남은 지원 경계를 포함하세요. 다른 담당의 파일이나 기존 변경을 되돌리지 마세요.

## 통합 검증과 오픈소스 채택

구현 담당마다 대상 테스트를 실행하고 통합 담당은 충돌/계약 변경을 확인한 뒤 타입·architecture·production build와 영향받은 native workflow를 실행한다. 문서만 변경한 카드는 링크/상태 일관성을 검사한다. UI 회귀는 1440px/960px, 단일/두 프로젝트, 한글 이름, 저장 실패, 실제 pointer/keyboard를 포함한다. 전체 suite는 넓은 공통 계약 변경 또는 대상 실패가 필요성을 보여줄 때 실행하고 대상 검사 결과를 전체 검사로 보고하지 않는다.

오픈소스 출처·라이선스 표는 NEXT-STEPS를 따른다. 채택 실험 결과는 정확한 버전/commit, 라이선스/NOTICE, bundle 증감, accessibility, iframe 유지/포커스, teardown, 기존 CAD와의 계약으로 판단한다. 외부 라이브러리는 레이아웃·입력·저장 adapter에 한정하고 CAD 정확 기하와 연관 모델의 대체로 간주하지 않는다. 현재 조사 단계에서 새 의존성이나 외부 소스를 추가하지 않았다.

2026-10-17 현재: 다음은 **WF-Q1**이다. [콘텐츠·마감 구현/한계](../implementation/CMP-S1-WF-D1-2026-10-16.md), [벽/개구부 구현·검증](../implementation/WF-B2-B3-2026-10-16.md), [평면도 준비·면 생성](../implementation/WF-C0-A2-B1-2026-10-16.md)을 재사용한다. 작은 주거 DXF를 실제 UI에서 준비→벽/개구부→슬롯 창호/가구→평면/단면/A3 발행하고 수정·재발행·저장/재열기를 확인한다. 누락은 재현과 영향 카드로 기록하며 B2/B3 재구현을 시작하지 않는다. 공통 command/schema/App 수정은 통합 담당이 조정한다. CAN-A1/A2/A3·MEAS-H1은 별도 대기이며 단일 슬롯·AABB 경고로 완료 처리하지 않는다. 문서/Undo·source/slab byte 예산은 G6-D6-P4, 출력 전 점검은 G6-D5-Q1로 WF-Q1과 구분한다.
