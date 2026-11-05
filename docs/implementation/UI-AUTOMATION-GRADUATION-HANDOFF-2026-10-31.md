# UI 자동화 졸업작품 3종과 사용성 수정 인계 (2026-10-31, Claude)

## 요약

사용자 요청으로 agent-webcad의 **실제 UI만** 조작해 졸업작품 세 점을 만들었다. 그 과정에서 드러난 사용성 문제를 원본 작업 트리에서 직접 고쳤다. 커밋은 하지 않았다. 사용자가 원본 수정을 승인했고, 이 문서는 Codex와 공유할 기록이다. 실패한 시도도 다음 작업자가 반복하지 않도록 그대로 남긴다.

- 결과물·이미지·자동화 스크립트: [output/projects/claude-graduation-2026-10-31](../../output/projects/claude-graduation-2026-10-31/)
- 제출 보고서(claude.ai 아티팩트, 비공개): https://claude.ai/artifact/Kgkz1iMbdcYZdMLWB1CSzr

| 작품 | 구분 | 결과 | 객체 |
|---|---|---|---|
| 학생 A · 유성기어 감속기 조립도 | 2D | A3 1:1, Zs18/Zp21×3/Zr60, m1.5, 정면도(치형 987점) + 해칭 단면도 A-A + 제원표·주기·표제란 | 122 |
| 학생 B · TWIN HELIX 트윈 타워 | 3D | 36층 96° 비틀림 테이퍼 타워 + 24층 역비틀림 타워, 스카이브리지, 크라운·첨탑 | 76 |
| 학생 C · 로툰다 대학도서관 | 2D→3D | 지름 52 m 평면 작도 후 Extrude 16회, 돔·포드 돔 | 136 |

품질 한계: 전부 단색 솔리드다. A의 치형은 7점 근사이고 인벌류트가 아니다. B와 C는 매스 수준이다. 자동화가 만든 결과이며 설계 완성도나 미적 판단의 근거로 확대하지 않는다.

## 자동화 방식

computer use 도구가 세션에 없어서 Chrome DevTools Protocol로 헤드리스 Chrome을 조종했다(`automation/lib.mjs`, `automation/h.mjs`). 문서 API나 `dispatchCadCommand`는 직접 호출하지 않았다. 리본 버튼, 캔버스 키보드 좌표 입력(`x,y` + Enter), Inspector 필드, Drafting·Extrude 대화상자, 모델 트리 Ctrl+클릭만 사용했다.

알아둘 구조:
- 프로젝트 탭마다 iframe(`?project-tab=…`)이 따로 있다. 숨은 탭(legacy)의 iframe이 먼저 잡히므로 `frameElement.offsetParent !== null`인 문서를 써야 한다.
- 캔버스 좌표 입력은 `window` capture keydown으로 받는다. 대기 상태의 숫자 키도 도구 입력이 우선한다.
- 모델 트리는 100행씩 렌더링된다(`Show more model objects`).
- 앱 다운로드는 `<a download>`다. 헤드리스에서는 **브라우저 대상**의 `Browser.setDownloadBehavior`를 써야 저장된다. 페이지 세션에서 호출한 것은 무시됐다.

## 실패와 시행착오 (재발 방지용)

1. **좌표 클릭으로 그린 첫 도서관**: 화면 픽셀 클릭으로 직사각형만 그려 "네모 상자"라는 평가를 받았다. 이후 키보드 좌표 입력으로 실제 치수(m)와 곡선을 쓰도록 바꿨다.
2. **Polyline이 Esc로 사라짐**: 안내 문구는 "Esc to finish"였지만 Esc가 입력을 버렸다. → 수정함.
3. **텍스트 위치**: 캔버스 클릭이 위치를 바꾸지 않아 px↔mm 환산(21.84 px/mm)을 손으로 계산했다. → 수정함.
4. **원기둥·원뿔 생성 실패**: 첫 3D 명령이 커널 로딩("Kernel deferred" → "Loading geometry")을 기다리는 동안 입력란이 없었다. 원기둥은 Dimensions 대신 `Cylinder size/length` + Review/Apply 2단계 편집기를 쓴다.
5. **박스가 부채꼴로 겹침**: Box 위치는 **최소 모서리**이고 회전도 그 모서리를 축으로 돈다(원기둥·구는 중심). 중심 좌표에서 `R(θ)·(w/2,d/2)`를 빼서 해결했다. 의미 자체는 바꾸지 않고 Inspector 표기만 추가했다.
6. **Inspector 입력 유실**: Enter 직후 바로 다음 필드에 입력하면 재계산 중 값이 사라졌다. 자동화 속도에서만 확인됐다. 값이 반영됐는지 읽어서 확인하고 재시도하는 방식으로 우회했다. **앱 수정 안 함, 사람 속도 재현 미확인.**
7. **큰 토러스가 표시되지 않음**: 테셀레이션 허용오차가 절대값 0.1 mm로 고정돼 R13.5 m 토러스가 수십만 삼각형이 됐다. "Preparing display"가 끝나지 않았고, 이후 위치 변경 반영까지 밀렸다. → 수정함.
8. **브라우저 3개 동시 실행**: 한 실행이 끝나 Chrome을 닫는 시점에 나머지 두 실행의 CDP 연결이 끊겼고, CPU 경합도 심했다. 결국 순차 실행했다.
9. **Extrude 취소**: 미리보기 준비 중 문서가 바뀌면(배경 작업 완료 포함) 세션이 통째로 취소됐다. → 같은 루프면 재바인딩하도록 수정함.
10. **자동화 좌표 의존**: 리본에 Annotate 그룹을 추가하자 Draw 버튼 위치가 밀려 좌표 클릭 스크립트가 깨졌다. `h.mjs`는 이제 버튼 `title`로 찾는다. `work*.mjs`의 일부 좌표(3D 리본, Editing actions)는 당시 레이아웃 기준이다.

## 원본에 적용한 수정

| 파일 | 내용 |
|---|---|
| `apps/web/src/commands/paletteCommands.ts` | `NAVIGATION_SHORTCUTS`의 참조 행이 실제 명령과 id가 같으면(`repeat-command`) 중복 추가하지 않고 단축키·설명만 병합. React 중복 key 경고와 눌러도 동작하지 않는 리본 버튼 제거 |
| `apps/web/tests/paletteCommandIds.test.ts` (신규) | 팔레트 id 유일성, `repeat-command` 실행 가능 회귀 테스트(수정 전 실패 확인) |
| `apps/web/src/viewport/CadViewport.tsx` | Polyline 2점 이상에서 Esc = 확정. 대기 안내 "Esc to exit". 패널용 캔버스 점 선택 훅. 뷰 초점 제공. 정투영 Fit을 경계구 대신 투영 사각형 + 8% 여백으로 계산 |
| `apps/web/src/viewport/pointPick.ts` (신규) | 뷰포트 밖 패널이 캔버스 클릭 점을 받는 요청 모듈(최신 요청 우선) |
| `apps/web/src/viewport/viewFocus.ts` (신규) | 활성 뷰의 orbit target 조회 |
| `apps/web/src/properties/DraftingPanel.tsx` | 텍스트·블록 배치 중 캔버스 클릭 → Point 입력. 세션 내 마지막 적용 글자 높이를 새 텍스트 기본값으로 사용(최초 175 유지) |
| `apps/web/src/ribbon/Ribbon.tsx`, `app/AppShell.tsx` | Draw 탭에 항상 보이는 Annotate 그룹(Text, Hatch · Dims) 추가. Polyline 툴팁 "Enter or Esc to finish" |
| `apps/web/src/explorer/views/ModelPanel.tsx`, `ui/explorer.css` | 루트의 중복 이름에 표시 전용 `#n`(저장 이름 불변) |
| `apps/web/src/App.tsx` | Box·프리미티브를 뷰 초점(지면)에 생성(Box는 중심 정렬, 실패 시 기존 위치). 3D 진입 1.5초 후 커널 예열. Extrude 세션 재바인딩 |
| `apps/web/src/cad/kernelGeometryService.ts` | `warmKernel()` — deferred일 때만 1 mm 박스를 비치명 요청 |
| `packages/cad-kernel/src/mesh/shapeToMesh.ts` | 선형 허용오차 `max(0.1, 대각선/2000)`. 대각선 200 mm 이하 부품은 기존과 동일 |
| `apps/web/src/properties/PropertiesPanel.tsx` | Box Position 라벨에 "min corner"와 툴팁 |
| `apps/web/src/ui/commands.css`, `ui/PrecisionField.tsx` | body 기본 16px을 상속하던 Drafting·Extrude 대화상자, CommandReview, PrecisionField 라벨을 UI 크기로 고정(`:where`로 기존 규칙 우선) |
| `apps/web/src/viewport/HoverDistance.tsx` | Hover distance 기본 꺼짐(대부분의 브라우저 테스트가 시작 시 직접 끄던 패널) |
| `apps/web/tests/hoverDistance.browser.tsx`, `brepDistance.browser.tsx` | 시작할 때 Hover distance를 켜는 한 줄 추가 |

`App.tsx`, `CadViewport.tsx`, `PropertiesPanel.tsx`는 Codex 작업과 겹칠 수 있는 파일이다. 변경은 위 지점에 국한했다.

## 검증

- `tsc --noEmit`: `apps/web`, `packages/cad-kernel` 모두 오류 없음.
- 관련 Node 테스트 11개 파일 94건 통과: b5Shell, brepTopology, commandWorkflow, kernelResources, kernelWorkerClient, planarReconstruction, revolveSolid, sweepLoft, paletteCommandIds, accessibilityInput, shortcutGuide.
- `checkArchitecture`: 기존 `WEBCAD-FEATURE-AUDIT.md` 문서 링크 경고만 있고 신규 위반 없음.
- 실행 중인 앱에서 CDP로 확인(`automation/verify.mjs`)한 항목:
  - Polyline이 Esc로 확정되고 트리에 `Polyline #1/#2/#3`으로 표시됨
  - Annotate 버튼이 보이고, 클릭한 점이 Point로 들어가며, 대화상자 글꼴이 12px이고, 다음 텍스트 높이가 기억됨
  - 3D 진입 후 커널 Ready, Box가 초점에 생성됨, Hover 기본 꺼짐
  - R13.5 m / 관 0.45 m 토러스가 약 4~5초에 Ready
  - Fit이 화면 폭을 채움

## 미검증

- **전체 Node 스위트**: 실행하지 않았다(`output/verification` 산출물 갱신 문제).
- **브라우저 스위트**(`test:browser`): 실행하지 않았다. 특히 다음은 실제 실행으로 확인해야 한다.
  - 수정한 hoverDistance, brepDistance
  - 트리 라벨 텍스트를 비교하는 `modelPresentation.browser.tsx`: 중복 이름이 있으면 `#n`이 붙는다
  - 새 Box 위치에 의존할 수 있는 브라우저 테스트
- **메시 허용오차 변경**: 대각선 200 mm 초과 형상의 삼각형 수가 줄었다. 큰 형상의 메시 수나 시각 결과를 고정한 fixture가 있으면 영향받는다.

## 남은 문제 (미수정)

- 일반 솔리드의 색·재질 지정 기능이 없다. `solidFinish`는 건축 콘텐츠에만 있다. 형식 변경이 필요하므로 Codex와 조율이 필요하다.
- 작은 주석은 축소 시 읽을 수 없다(최소 화면 크기·주석 축척 없음).
- Extrude 대상 다중 선택이 모델 트리 Ctrl+클릭 외에는 확인되지 않았다.
- 원기둥만 다른 Dimensions 편집기(Review/Apply)를 쓴다. 의도된 설계인지 확인이 필요하다.
