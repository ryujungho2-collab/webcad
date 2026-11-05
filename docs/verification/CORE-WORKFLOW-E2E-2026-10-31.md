# Core Workflow E2E — 2026-10-31

## 판정

**전체 완료 아님.** A의 지정 파일을 실제 Open UI로 재열지 못했다. 브라우저 확장 권한은 변경하지 않았으며 내부 API 문서 주입은 사용하지 않았다.

| 작업 | 판정 | 실제 완료 범위 / 제한 |
| --- | --- | --- |
| A: 2D | **BLOCKED — 환경** | 기존 120×60 mm, 구속 2개, 치수 수정, Undo/Redo, 다운로드 증거 유지. 지정 파일 Open은 확장의 file URL 접근 제한으로 차단됨. |
| B: 2D→3D | **PASS — 프로젝트 재열기 경로** | 실제 스케치/Extrude/원본 치수 수정/재생성/STEP 내보내기/독립 검증/프로젝트 닫기·재열기. 다운로드 파일을 Open으로 다시 가져오는 경로는 미검증. |
| C: 실제 Copilot | **PASS — 프로젝트 재열기 경로** | 실제 제품 UI의 로컬 모델 요청/조회/Preview/검토/평가 복사본 Apply/Undo/Redo/다운로드/프로젝트 닫기·재열기. 다운로드 파일 Open은 미검증. |

프로젝트 재열기는 제품의 로컬 저장·복구 경로다. 이를 A의 지정 파일 Open 성공으로 집계하지 않는다. 재열기 후 형상과 feature/object는 복원되지만 Undo/Redo는 새 세션으로 시작한다. 영구 History 복원은 PASS로 주장하지 않는다.

증거 디렉터리: `output/verification/core-workflow-e2e/`. 기존 A 산출물을 재작성하지 않았다. B/C는 별도 신규 평가 프로젝트에서 수행했다. Assembly 후보 탐색, 명령, Solver, GLB 디코더·자원 레지스트리 코드는 수정하지 않았다.

## A — 유지된 결과와 파일 Open 차단

- 문서: `A-2d.webcad.json`. 실제 제품 다운로드 파일, 120×60 mm 사각형, 거리 구속 120/60, drawing feature 및 object 각 1개.
- 이전 UI 증거: `A-2d-constrained.jpg`, `A-dimension-preview.jpg`, `A-undo-ui.txt`, `A-redo-ui.txt`.
- 제품 `Open document` → 실제 파일 선택 이벤트 → 지정 파일 선택 시도에서 확장 오류: `Allow access to file URLs` 필요. 원문은 `A-reopen-attempt.json`.
- 이전 OS 파일 선택기 접근도 자동화의 브라우저 URL 확인 제한으로 중단됐다. 같은 안전 차단을 다른 제어 기술로 우회하지 않았다.
- 예상: 파일을 읽어 120×60 mm와 구속/feature/object를 복구하고 다시 편집 가능. 실제: 파일을 제품에 전달하는 단계에서 차단. 파서·직렬화 결함으로 판정하지 않는다.
- 수정: 없음. 권한 변경·문서 주입 없음. 따라서 지정 파일 재열기와 그 후 편집 확인은 **BLOCKED**다.

## 최소 수정 및 같은 조작 재실행

### F1 — 사각형 숫자 입력 뒤 Enter가 툴바 버튼에 남음

- 재현: Rectangle 툴바 클릭 → `0,0` → Enter. 버튼에 포커스가 남아 Enter가 버튼을 다시 활성화하고 사각형 좌표 입력이 끝나지 않았다.
- 예상: 첫 좌표 확정 후 두 번째 좌표 대기. 원인: 숫자 버퍼는 갱신되지만 Enter의 일반 버튼 활성화 경로가 계속 포커스를 소유했다.
- 수정: `apps/web/src/viewport/CadViewport.tsx`의 기존 숫자 입력 경로에서 첫 숫자 의도가 시작되면 renderer canvas에 포커스를 넘긴다. renderer null guard 포함. 입력창·버튼 차단 계약은 유지한다.
- 실제 UI 재검증: Rectangle → `0,0` Enter → `100,60` Enter → Esc로 사각형 1개 완성. Rectangle → Esc는 형상 변경 없음. Filter model의 `123`/Enter는 입력창에 남음. 유휴 Rectangle 버튼 Enter 활성화도 유지.
- 증거: `focus-regression-ui.txt`, `focus-text-input-ui.txt`; 기존 `keyboardActivation.browser.tsx`에 물리 키 입력 회귀를 추가했다.
- 최초 추가 테스트 실행은 Draw 탭 선택 누락으로 `Missing control: Sketch`가 발생했다. 테스트 준비 단계에서 실제 Draw 탭을 선택하도록 수정했다. 제품 기능 결함과 구분한다.
- TypeScript의 nullable renderer 오류는 명시적 guard로 수정했고 최종 build가 통과했다.

### F2 — 성공한 Extrude를 취소로 표시

- 재현: 실제 100×60 mm 스케치 선택 → Extrude 20 mm → Apply. 솔리드는 120,000 mm³로 생성됐지만 `Extrusion cancelled because the source document changed`라는 잘못된 상태를 표시했다.
- 원인: 자신의 명령 게시로 발생한 revision 변경을 기존 stale-preview 감시가 외부 변경으로 취급했다.
- 수정: `apps/web/src/App.tsx`의 기존 extrusion session에 적용 중 ref를 두고 자신의 publication은 감시에서 제외했다. Apply 직전 revision 검사와 외부 변경 취소는 유지하며 성공 상태를 명시한다. 기존 CommandBus를 그대로 사용한다.
- 같은 UI 절차: Undo로 원상복귀 후 Extrude 20 mm를 다시 Apply → `Extrusion applied`, valid solid, 체적 120,000 mm³.
- 증거: `B-extrude-status-before-fix.txt`, `B-extrude-after-fix-ui.txt`.
- 집중 회귀에는 외부 source revision 변경 시 실제 취소되고 두 번째 솔리드를 게시하지 않는 검사도 포함했다.

## B — 실제 2D→3D 결과

프로젝트 `E2E Core B 2D to 3D copy` (`ed363e08-be7b-44b5-b89c-e4695bb6a05f`).

1. 실제 제품 툴바/숫자 키로 100×60 mm 스케치 작성, 폭·높이 구속 2개.
2. Finish → 3D → 원본 스케치 선택 → Extrude 20 mm → Preview/Apply.
3. 원본 Sketch 1을 다시 편집하여 폭 100→140 mm, 높이 60 mm 유지. Native Review는 2개 영향 객체와 체적 120,000→168,000 mm³를 표시했다.
4. Apply/Finish/3D에서 valid exact solid, 체적 168,000 mm³, 면적 24,800 mm² 확인.
5. 제품 File → Export STEP 및 Download file로 실제 파일 생성.
6. 프로젝트 Close → closed project 선택으로 재열기. 실제 스케치 화면에 140.00/60.00 mm와 구속 2개, 편집 가능한 inspector 확인. 3D Extrude 선택 시 정확 체적 168,000 mm³ 재확인.

산출물: `B-3d.webcad.json`, `B-140x60x20.step`, `B-140x60x20.validation.json`.

독립 Python OCP STEP 리더/유효성 검사: valid, 닫힌 shell 1, solid 1, face 6, edge 12, vertex 8. 경계 `[0,0,0]→[140,60,20]` mm, 체적 `167999.99999998798` mm³. 제품 viewport나 JSON의 측정값을 복사한 검사가 아니다.

UI 증거: `B-extrude-preview.jpg`, `B-sketch-update-preview.jpg`, `B-3d-regenerated.jpg`, `B-project-reopened-sketch.jpg`, `B-project-reopened.jpg`와 대응 UI 텍스트.

## C — 실제 Copilot UI, 실제 모델, 실제 Apply

프로젝트 `E2E Core C Copilot evaluation copy` (`b7045c8a-682e-4ca8-aeae-19946da8125f`). 원본 사용자 문서가 아닌 신규 평가 문서다.

제품 GUI로 Box를 생성했다. 원본은 8×8×6 mm, 위치 `[14,0,0]`, 회전 0, scale 1. 실제 GUI 높이 6→7 mm 편집과 Undo로 기본 편집 계약도 확인했다.

실제 Copilot UI에서 Use local copilot을 선택하고 다음 요청을 입력해 Plan을 클릭했다.

> 선택한 Box의 현재 높이를 기존 조회 도구로 먼저 확인한 뒤 높이를 10mm로 변경해줘. 가로와 깊이 8mm 및 위치·회전은 유지해줘.

별도 데모 뷰어 없이 기존 `apps/web/index.html`과 Vite/Gateway를 사용하는 제품 서버(`product-audit-server.mts`, 127.0.0.1:5174)에 수동 관측기만 붙였다. 관측기는 UI가 발생시킨 `/api/copilot/plan` 및 Ollama `/api/chat`를 기록하며 자체적으로 모델을 호출하거나 응답을 대체하지 않는다.

| 실제 호출 | 결과 | 입력 / 출력 토큰 | 경과 |
| --- | --- | --- | --- |
| 1 | `cad.inspect`로 선택 Box 현재 폭/깊이/높이 조회 | 1496 / 65 | 16,422 ms |
| 2 | `solid.parameter`, height=10 제안 | 1350 / 61 | 1,159 ms |

모델 `qwen3-coder-32k:latest`, 총 2회, 입력 2846/출력 126 토큰, repair 0회. 두 응답 모두 `done_reason=stop`, `num_ctx=16384`, `truncate=false`. 두 번째 실제 Gateway 요청에 성공한 native `cad.inspect` toolResults가 포함된다. 과거 로그를 브라우저에서 재생한 결과가 아니다.

- Native Preview Ready에서 높이 6→10, 체적 384→640 mm³ 확인. Apply 전 원본 높이 입력값은 6이었다.
- Preview 내용을 검토한 뒤 평가 복사본의 실제 Apply 버튼을 클릭했다. 수정 1개, source height 10, 정확 체적 640 mm³/면적 448 mm².
- 실제 작업 로그에서 Create box와 Edit primitive parameters 확인. Undo → 높이 6/체적 384, Redo → 높이 10/체적 640.
- 제품 다운로드 후 프로젝트 Close/재열기에서도 폭 8, 깊이 8, 높이 10의 편집 가능한 값과 정확 체적 640이 복원됐다.
- 실제 내보낸 STEP 독립 검증: valid closed solid 1, 체적 `639.9999999999999`, 경계 `[14,0,0]→[22,8,10]` mm.
- 별도 `verify_contract.mts`는 실제 기록된 tool call을 기존 ToolSession에 넣어 `update-primitive` canonical 명령임을 확인한다. 이 계약 검사는 실제 UI E2E를 대체하지 않는다. object ID/transform, 폭·깊이는 보존되고 높이만 바뀌었다.
- 같은 검사에서 GUI가 사용하는 `primitivePropertyEdit`의 결과와 실제 기록된 Copilot ToolSession 명령을 deep equality로 비교해 일치함을 확인했다. 단순히 명령 이름만 고정 문자열로 비교한 것이 아니다.

로그: `C-gateway.jsonl`, `C-ollama.jsonl`, `C-contract.json`. 문서: `C-before.webcad.json`, `C-after.webcad.json`. 독립 검증: `C-8x8x10.step`, `C-8x8x10.validation.json`.

UI 증거: `C-request-ui.txt`, `C-native-preview.jpg`, `C-applied.jpg`, `C-history-after-apply-ui.txt`, `C-undo-ui.txt`, `C-redo-ui.txt`, `C-project-reopened.jpg`.

## 집중 회귀와 남은 확인

전체 unit suite 및 전체 browser audit는 실행하지 않았다.

- 최종 production build PASS (`build.log`, 6.54 s; 기존 bundle 크기 경고).
- 관련 unit 24개 PASS (`preserved-unit.log`): candidate ranking/search, assembly placement, native agent preview, SimReady.
- Phase 1B-2 대표 browser 19개 PASS (`phase1b2-browser.log`). 이는 보존 회귀이며 C의 실제 모델 증거와 별개다.
- 키보드/Extrude 집중 browser의 첫 성공 실행은 28개 PASS. 최종 renderer null guard 이후 마지막 단독 실행은 **키보드 26개 PASS 후 Extrude Preview 준비에서 FAIL**했다. 요청된 숫자 좌표 Enter 2회, Esc, 입력창 소유권, 일반 버튼 Enter 검사는 모두 마지막 로그에도 PASS로 남는다. 뒤의 Extrude 적용·외부 변경 취소 2개 assertion은 완료하지 못했다.
- SimReady B1 첫 실행은 Low Memory의 `two placements need one parse` assertion FAIL. 앞선 import/handoff/hash/texture/hierarchy/Undo/bundle/Original/Balanced 검사는 통과했다. 실행 도중 CadViewport HMR이 발생한 기록도 있다. 이를 원인으로 확정하거나 GLB 기능 보존 완료라고 주장하지 않는다.
- 이후 키보드 및 SimReady 재실행에서 browser timeout 발생. 실패 로그는 보존했고 단순 재시도 반복을 제한했다. 최종 실행별 판정은 `status.json` 및 각 로그를 참조한다.

### F3 — 최종 집중 자동화의 Extrude Preview 준비 실패

- 재현: 기존 keyboardActivation fixture에서 실제 키 입력으로 사각형 생성 → Finish → 3D → Extrude → 20 mm 입력.
- 예상: Preview ready로 바뀌어 Apply 활성화. 실제: 마지막 단독 실행에서 `Preparing preview…` 상태로 기존 helper의 18초 제한을 넘었다. 앞의 26개 키보드 assertion은 통과했다.
- 원인: 확정하지 못함. 실제 제품 B의 동일 연산은 수정 후 정상 적용·재생성·STEP 검증을 완료했다. 자동화 실행 실패를 곧바로 제품 기능 미지원이나 환경 문제로 단정하지 않는다.
- 수정: validator와 커널/시간 제한을 완화하지 않았다. 초기 동시 실행, 캐시 분리, 단독 실행 결과를 각각 보존했다. 외부 임시 캐시 시도의 Babel 변환 경고도 실패 로그에 남는다.
- 최종 결과: 키보드 필수 회귀 PASS, 전체 확장 fixture FAIL/미완료. 근거 `focus-browser.log`, `focus-browser-timeout.log`, `focus-browser-outside-cache-timeout.log`.

### F4 — SimReady Low Memory 자원 회귀 미확정

- 재현: 기존 simreadyB1 대표 browser 시나리오의 동일 에셋 2개 배치 및 Low Memory 정책 검사.
- 예상: 두 배치에서 디코딩 1회. 실제 최초 실행: Original/Balanced는 통과했으나 Low Memory parse-count assertion 실패. 해당 실행 도중 source HMR 기록이 있으나 인과는 미확정.
- 수정: GLB/Renderer 자원 관리 코드는 변경하지 않았다. 코드 변경 없는 최종 단독 재실행도 기존 60초 전체 제한으로 끝나 성공을 확인하지 못했다.
- 최종 결과: 최초 assertion FAIL, 최종 재확인 INCOMPLETE. 관련 unit 통과를 GPU 수명 전체 PASS로 확대하지 않는다. 근거 `simready-browser-initial-hmr-failure.log`, `simready-browser-timeout.log`, `simready-browser.log`.

문서·STEP SHA-256은 `sha256.json`, A 파일 내용의 독립 읽기 검사는 `A-saved-content.validation.json`에 보관했다. A의 파일 읽기 검사를 제품 UI Open으로 집계하지 않는다. C 기록용 서버는 로그 수집 후 종료했으며 기존 사용자 localhost:5173 서버는 유지했다.

## 다음 검증 백로그

1. 정상적인 사용자 OS 파일 선택 경로가 가능한 환경에서 **기존 A 파일 자체**를 제품 Open으로 재열고 치수·구속·feature/object·viewport·추가 편집을 확인한다. 확장 보안 설정을 자동 변경하지 않는다.
2. B/C의 다운로드 문서도 동일 파일 Open 경로로 재수입하여 프로젝트 로컬 복구와 독립적으로 확인한다.
3. 최종 집중 browser timeout의 import/worker 준비 상태를 분리하고, SimReady Low Memory 재실행으로 parse count 및 자원 회수 보존을 확정한다. 관측 실패를 최적화 성공으로 바꾸지 않는다.
4. 저장 후 Undo stack 영속화가 제품 요구사항인지 결정한다. 현재 실제 제품은 새 History 세션으로 재열린다.

명시적 미지원/미검증: 영구 History 복원, 외부 파일 UI 재수입, 이번 대표 예제 밖의 CAD 연산. 신규 기능을 구현해 통과로 만들지 않았다.
