# UI-C2 · 선택 문맥 도구

2026-10-17 첫 지원 범위 완료. 사용법과 지원 경계는 [선택 문맥 도구](../features/SELECTION-TOOLS.md), 실행 결과는 [검증 manifest](../verification/UI-C2-2026-10-17.json)를 따른다.

`selectionContext`는 문서의 선택 feature·레이어·활성 스케치/프레임에서 도구 ID를 제안한다. `SelectionToolbar`는 `createPaletteCommands`와 같은 명령·capability gate·callback을 사용한다. source 명령이나 geometry 로직을 복제하지 않는다. 세 개의 첫 명령과 More 메뉴, 혼합/잠금/숨김/미지원 이유를 제공한다. 기존 스케치·Lengthen·spline/ellipse·변환·Properties를 그대로 연다.

프레임 진입은 App이 ID/sequence를 가진 요청을 viewport에 전달한다. DrawingFrames와 연결/시트 편집기가 기존 Review/Apply를 수행한다. 활성 프레임을 연결 source와 첫 시트 대상으로 제안한다. 편집 중 busy를 App에 돌려 다른 진입을 막고, 문서의 활성 프레임/작업공간 변경 시 이전 요청을 지운다. 명시적 프레임 활성화는 객체 선택을 비운다.

도구 줄과 캔버스/Review 영역을 분리해 줄 높이를 고정했다. 기존 중복 point-operations 도구는 registry를 사용하는 리본 Editing actions로 옮겼고 스케치 Auto constraints 입력은 유지했다. native ToolDisclosure의 light-dismiss/Esc를 사용하고 선택 ID 변경 시 메뉴를 닫는다. 입력 중 자동 포커스 이동을 하지 않으며 Properties 진입 때만 명시적으로 포커스를 전달한다.

반응형 container는 도구 줄에만 둔다. viewport에 두면 쌓임 문맥이 생겨 비교 창의 Explorer 닫기 버튼이 패널 뒤에 갇히는 회귀가 있어 제거했다. 일반 frame overlay 위의 패널 버튼과 compact 비교 패널 위의 버튼 순서를 구분했다. 숨은 popover가 flex 규칙으로 표시되지 않도록 첫 명령 그룹 selector에서 popover를 제외했다.

실제 Edge 입력으로 선택→Lengthen detached Preview→Apply→Undo, 다른 source/연관 치수 보존, 솔리드/주석 Properties, 혼합 선택, Esc/포커스, frame 축척 Review/Apply/Undo, 잠금·편집 중 진입 차단, 연결·시트 진입, 한글 이름 입력을 검증했다. 1440/960px와 패널을 접은 640×667 CSS px / DPR 1.5 화면에서 메뉴 경계를 확인했다. 마지막 조건은 960×1000 화면의 150% 확대 상당 emulation이며 실제 브라우저 확대 UI 조작은 아니다.

전체 Node 1,300 / 54 suites / 실패 0. 신규 분류 테스트 3개와 interaction/shortcut 대상 8개 통과. 문맥 UI 23 checks와 기존 비교·탭 탐색·시트·수치·각도 주석 회귀, 타입·architecture·build 결과는 manifest를 따른다. 기존 큰 chunk 경고는 남아 있다.

- [곡선 Preview/Apply 화면](../../output/verification/selection-toolbar/selection-curve-review.png)
- [960px 프레임 도구](../../output/verification/selection-toolbar/selection-frame-960.png)
- [150% 상당 메뉴](../../output/verification/selection-toolbar/selection-zoom-150.png)

새 geometry/명령/저장 schema를 추가하지 않는다. 모든 솔리드에 새로운 수치 driver를 제공하는 범위가 아니며 기존 Properties의 지원 종류를 따른다. stitch·종이 시트 전용 편집, 속성 패널의 정보 재배치와 새로운 주석 참조 편집은 후속/기존 전용 도구 범위다.
