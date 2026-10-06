# G2 아트보드·벡터·컴포넌트 구현 기록

갱신일: 2026-10-05

G2를 네 개의 검증 가능한 묶음으로 나눠 실행했다. 아트보드는 공통 CAD 문서의 독립된 출력/작업면으로 남기고, vector style과 component는 같은 drawing geometry·command·History를 공유한다.

## G2-1 — 캔버스와 작업면

- 표시 중인 아트보드를 `XY`/`XZ`/`YZ` work plane 방향 그대로 viewport에 그린다. 활성 프레임은 테두리와 화면 레이블로 구분한다.
- 프레임의 빈 영역을 클릭하면 해당 보드가 활성화되고 2D 작업 평면과 Artboards 패널이 함께 갱신된다. 형상이 겹치는 경우 실제 geometry 선택이 프레임 선택보다 우선한다.
- `Fit active artboard`와 `Fit visible artboards`가 캔버스 상단과 Artboards 패널에서 같은 viewport 동작을 호출한다. 2D에서는 현재 평면만, 3D에서는 서로 다른 실제 평면의 프레임을 표시한다.
- 숨김 보드는 렌더링/Fit/내보내기에서 제외된다. 잠금은 아트보드의 크기·위치·평면만 보호하며 이름 같은 안전한 metadata 수정과 내부 도형 잠금은 분리한다.

## G2-2 — 보드별 SVG 출력

- File 메뉴의 `Export “{board}” SVG…`는 활성·표시 보드의 mm 원점과 크기를 정확한 `viewBox`로 사용하고 저장된 background를 포함한다.
- 선분을 보드 경계에 clip해 보드 밖 geometry가 출력되지 않는다. 닫힌 채움 도형은 SVG clip path 안에서 원래 fill을 유지하고, 잘린 외곽 stroke에는 인위적인 닫힘 선을 추가하지 않는다.
- object의 stroke, fill, opacity, stroke width를 출력에 전달한다. 기존 active-plane 전체 SVG 경로는 유지한다.
- 직접 검증 범위는 2D drawing의 직선/다중선이며, text, image, mask, gradient, blend, PDF artboard 출력은 아직 지원 범위가 아니다.

## G2-3 — CAD drawing의 vector appearance

- `CadVectorStyle`은 stroke 색, 선택적 fill, opacity, stroke width를 drawing feature에 저장한다. 이전 문서에서 이 필드가 없으면 기본 appearance를 사용한다.
- 단일 drawing을 선택하면 Properties의 `Appearance` editor에서 공통 PrecisionField·Review/Apply·Cancel을 통해 편집한다. 실제 `commandInteraction.canApply`와 동일 draft의 preview가 Apply를 통제한다.
- 닫힌 XY/XZ/YZ path에는 같은 CAD object identity를 유지하는 실제 triangulated fill을 외곽선 아래에 표시한다. open curve에는 fill을 억지로 적용하지 않는다.
- 재사용 definition에 포함된 원본 vector style은 중첩 drawing 평가를 거쳐 component 인스턴스의 stroke/fill 렌더와 SVG 출력까지 전달한다. 저장·재로드 후 인스턴스 렌더 값을 확인하는 Node 회귀가 있다.
- geometry/topology 편집은 기존 CAD drawing 명령과 stable references를 계속 사용한다. SVG 노드/compound path editor, gradient, cap/join, dash override, blend/mask editor는 미구현이다.

## G2-4 — 재사용 컴포넌트

- Components Explorer에서 선택한 편집 가능 drawing/ drafting instance로 정의를 만들고, 이름을 바꾸고, 선택 geometry로 정의를 교체하고, Drafting의 정밀 배치 단계로 직접 삽입한다.
- definition은 원본 geometry 입력과 transform을 문서에 보관한다. 인스턴스에는 안정된 object/feature identity와 placement transform이 있으며 source definition 변경 시 모든 인스턴스가 같은 History transaction에서 재생성된다.
- 중첩 definition은 재귀적으로 평가·저장한다. cycle, 혼합 work plane, 숨김/잠금 source는 적용 전에 거부한다. save/reload·Undo/Redo는 definition과 instance identity를 보존한다.
- 브라우저에서 생성→두 번 배치→source appearance 편집→definition 교체→두 인스턴스 갱신→save/reload→Undo/Redo를 검증했다. nested resolution/cycle atomicity는 Node 통합 검사로 확인했다.
- 현재 구성은 component-wide definition 교체와 instance placement transform이다. 색/치수/문자 같은 instance-level property override, variant/state, nested library 브라우저 시나리오는 미구현이며 다음 vector/component 확장 후보로 남는다.

## 실행 증거

- `artboardsWorkflow`: 29개의 실제 React/Worker/browser UI 검사. 프레임 선택·Fit·File 메뉴를 통한 실제 SVG Blob 출력과 정확한 page bounds/background 포함.
- `componentsWorkflow`: 13개의 실제 browser 검사. 벡터 appearance의 review/apply, component definition, 두 개의 별도 placement, source 교체 후 양쪽 geometry 갱신, identity 유지, save/reload, Undo/Redo.
- 전체 Node 회귀: **567 tests / 53 suites**, 모두 통과. 두 개의 새 회귀는 component instance의 source vector style 렌더·SVG 출력 및 저장/재로드 유지 여부를 확인한다.
- 전체 브라우저 회귀: **25 workflow / 518 UI·Worker checks**, 모두 통과.
- `pnpm --filter @agent-webcad/web exec tsc -b`, `check:architecture`(258 modules), `pnpm build` 통과.
- production build에서 minified main chunk 928.54 kB, viewport 597.20 kB이며 500 kB warning이 남는다. OpenCascade WASM 50,305.13 kB(raw; gzip 13,955.45 kB)도 출력된다. G2 변경 전후 비교 가능한 별도 cold/warm, frame render, SVG export, memory benchmark는 하지 않았다.

브라우저 회귀 통과는 외부 실무자의 작업 시간·재시도·만족도 평가를 대신하지 않는다. 현 단계의 G2 기반을 끝냈지만 Illustrator/Figma 기능 전체나 모든 component override가 구현된 것은 아니다. 다음 구현은 [NEXT-STEPS](../../NEXT-STEPS.md)와 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다.
