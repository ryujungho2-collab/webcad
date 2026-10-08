# 다음 작업

갱신일: 2026-10-08. **G5-A1–A3 검수와 일반 각도 치수 B3-C1–C3를 완료했다.** Apply의 게시 전 취소·context 재검증·잠금/부분 실패·만료 복구·결과 인계는 [A3 기록](docs/implementation/G5-A3-COPILOT-APPLY-2026-10-08.md), 두 source/edge 치수와 v14는 [C2/C3 기록](docs/implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md)을 따른다. 최신 전체 Node **643개**, browser **38 workflows / 799 checks**, 타입·architecture **313 modules**·workspace build가 통과했다. 다음 보류 작업은 **G5-B Query와 기존 편집 명령 한 종류의 확대**다. 실제 provider 연결은 준비되지 않았다. CAD의 다음 확장 후보는 B3-A3 OCS/기울어진 DXF와 B/X 카드다. Pro 한도의 약 15% 단위 분할은 [작업 분할](docs/WORK-SLICES-2026-10-06.md)을 따른다.

최상위 목표는 기본 CAD·벡터·이미지·레이아웃 기능을 공통 문서·선택·명령·History와 통합 UI로 연결하는 것이다. 상세 범위와 완료 기준은 [구현 인계](docs/IMPLEMENTATION-READINESS-2026-10-05.md), 실제 상태는 [PROJECT-STATE](PROJECT-STATE.md), 수정 위치는 [CHANGE-GUIDE](docs/architecture/CHANGE-GUIDE.md)를 따른다.

## 완료한 G0

기존 Node 24.19.0·pnpm 11.26.0 설치를 정상 실행 권한으로 사용했다. 재설치·lockfile 변경·reset 없이 아트보드 optional 삭제 게시, impact 수량, detached review와 실패·저장·이력을 검증했다.

전체 Node **545개/50 suites**, 실제 browser **22과제/454검사**가 통과했다. 아트보드 Node 10개·browser 25개가 포함된다. 소스 타입·G0 테스트 별도 타입·전체 build 통과, architecture 최종 결과는 [G0 증거](docs/verification/G0-ARTBOARDS-2026-10-05.md)를 따른다.

아트보드 속성 편집은 공통 Review/Apply와 Cancel을 사용한다. 당시 G0 완료 범위에는 프레임·Fit·보드 export가 포함되지 않았으며, 현재 그 세 항목은 G2에서 연결하고 검증했다.

## G1에서 구현한 첫 묶음

도구·패널별로 달랐던 Undo/Redo 경로를 공통화했다. 입력창의 자체 Undo·modal 키보드 범위는 유지한다. 도구 전환은 돌출까지 정리하고, History 후 선택·캔버스 포커스를 복원한다. 살아 있는 원본의 직접 편집·치수 review는 기존 stale 복구를 보존한다. 네이티브 세션 과제 24개를 작은 문서와 배경 1,000개에서 검증했다. 전체 결과·측정·제한은 [G1 증거](docs/verification/G1-SESSION-CONTINUITY-2026-10-05.md)를 따른다.

## G1 후속 검수 결과

105회 복제 뒤 Undo에서 이전 깊이의 객체를 잘못 선택하는 오류를 재현했다. History 상태 토큰과 WeakMap으로 수정하고 분기·다중/primary 선택·꼭짓점→Explode·Hide·같은 파일 재열기를 확인했다. [후속 증거](docs/verification/G1-HISTORY-IDENTITY-2026-10-05.md)에 신규 Node 7개·browser 23개와 전체 회귀 로그를 기록했다.

## G2 완료: 아트보드·벡터·컴포넌트 기반

G2를 네 작은 묶음으로 구현했다: (1) work plane을 보존하는 아트보드 프레임/활성 선택, (2) 현재·전체 Fit과 page bounds/background/clip이 정확한 보드 SVG, (3) CAD drawing에 저장되는 fill/stroke/opacity/width 편집, (4) definition·instance·nested resolution 기반 Component Explorer. 기존 CAD geometry와 topology 편집을 같은 객체와 History에서 사용한다.

[G2 상세 기록](docs/implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md)은 실제 support, 검수와 제한을 소유한다. Artboards browser 29개, Components browser 13개, 전체 Node 567개/53 suites, 전체 browser 25과제/518검사, TypeScript·architecture 258 modules·production build가 통과했다.

남은 vector/component 경계는 G2 전체 기능 동등성을 뜻하지 않는다. SVG path node editor/import, compound path·gradient·blend/mask, text/image 출력, component instance property override/variant, nested-library 전용 browser 흐름과 G2 대형 도면 렌더·export benchmark는 남아 있다. 별도 외부 실무자 작업 시간·재시도·복구율 평가도 자동 회귀와 구분한다.

## G3-1 완료: 이미지 한 장의 왕복 작업

G3-1 당시 기준선은 PNG/JPEG/WebP import → placement → size/numeric crop → artboard SVG → JSON v8 save/reload/Undo/Redo/recovery였다. 당시 전체는 571 Node/53 suites, 26 browser workflows/532 checks였다. 이 수치는 stage history이며 최신 결과가 아니다. 현재 이미지 범위와 검수는 [G3 누적 구현](docs/implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md)과 [최신 검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다.

G3-1 단계 기록은 당시 기준선이다. 다음 slice 상태와 최신 이미지 behavior는 cumulative [G3-2..4 구현](docs/implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md) 및 [검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다.

## G3-2..4a + G3-3b 구현: placement·mask·opacity·direct crop

이미지 복제는 원본 RasterAsset bytes를 공유하면서 placement ID와 transform을 분리한다. 일반 exact transform/Align에 참여하고 Inspector는 비율 잠금·크기·crop·Ellipse mask·opacity를 같은 detached review/apply/cancel 경로로 편집한다. Ellipse와 opacity는 viewport/SVG output 및 JSON v9/v10에 보존된다.

캔버스 crop mode에서 원본 frame과 crop boundary를 함께 보이고 edge/corner를 끌어 숫자 crop과 같은 normalized draft로 편집한다. Apply는 reviewed plan을 한 번 적용하고 source·mask·opacity·frame을 보존한다. `imageWorkflow`의 실제 pointer drag, Cancel/Apply, Undo/Redo와 SVG 검사가 추가됐다. 전체 Node 575개, browser 26 workflow/553 checks, architecture 265 modules 및 production build가 통과했다. 자세한 timing sample과 한계는 [G3 이미지 편집 검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 기록했다.

G3-4b1 당시에는 PNG/PDF composite와 대형 이미지/외부 실무자 평가가 남아 있었다. 뒤이어 G3-4b2에서 Artboard PNG, G3-4b3에서 Artboard PDF를 추가했다. Color adjustment의 당시 Node 577개, browser 26 workflow/556 checks, architecture 265 modules와 production build 결과는 해당 단계의 역사적 기준이다. 128×128 fixture pixel sample 최대 채널 변화 26.6도 한 번의 관측이다.

G3-4b2는 활성 보드를 SVG와 같은 visible drawing/vector/raster 순서로 합성해 PNG로 저장한다. Crop·rectangle/ellipse mask·opacity·brightness/contrast/saturation·배경·보드 경계를 포함하고, 스케일/픽셀 크기/메모리를 미리 검사한다. Preview와 Cancel은 원본 문서를 바꾸지 않는다. 전체 Node 581개, browser 27 workflow/581 checks, architecture 270 modules 및 production build가 통과했다. 브라우저가 실제 PNG를 내려받아 픽셀과 투명도를 디코드해 확인했다. 소형·중형 fixture의 단일 관측 수치와 지원 한계는 [G3 이미지 편집 검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 기록했다.

G3-4b3은 활성 아트보드 또는 표시 중인 여러 아트보드를 페이지별 PDF로 저장한다. 보드의 mm 크기와 순서를 보존하고 DPI·페이지 수·픽셀/메모리/파일 한계를 출력 전에 검사한다. 기존 detached SVG scene과 PNG Worker 경로를 재사용하며 alpha는 흰색 페이지에 합성하고 JPEG raster image로 넣는다. 실제 multi-page PDF를 내려받아 독립 PDF reader로 페이지 수·MediaBox·렌더 결과를 확인했다. 전체 Node 587개/54 suites, browser 28 workflows/602 checks, architecture 274 modules, TypeScript와 production build가 통과했다. 수치와 제한은 [G3 이미지 편집 검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 기록했다.

Photopea 관련 요청의 최초 TIFF 도입은 Node 596개·TIFF browser 9개·image browser 38개로 부분 검증했다. 이후 공통 decoder와 선택 placement 원본 교체를 구현하고 전체 회귀를 마감했다. 최신 TIFF browser 10개(Worker abort 포함), source 교체 16개, resource 34개가 전체 33 workflows/686 checks에 포함된다. 새 원본은 기존 object/Scene identity와 crop/mask/color를 유지하며 숫자 편집과 한 Undo로 적용한다. [검수·실패 로그·남은 한계](docs/verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md)를 따른다. 악의적 파일 보안 검토와 brush/PSD 전체 편집은 완료되지 않았다.

## 이후 순서

G4 첫 범위·CAD DXF/지름·각도 C1–C3와 **G5-A1–A3 검수**를 완료했다. 다음 실행 우선순위는 **G5-B**다. Query를 먼저 구분하고 기존 편집 명령 한 종류를 뒤이어 확대하며, 한 번에 모든 command를 열지 않는다. CAD 확장을 다시 선택하면 B3-A3 OCS/기울어진 DXF와 B/X 카드의 선행 조건을 평가한다. component override/variant·직접 layout handle과 PPTX/GIF, 이미지 I2–I5, G6 및 나머지 CAD B/X는 [통합 계획](docs/product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md)과 [작업 분할](docs/WORK-SLICES-2026-10-06.md)의 독립 카드로 남긴다.

| 순서 | 작업 | 상세 기준 |
| --- | --- | --- |
| G1 | CAD 기본 조작·정밀 입력·오류 복구·세션·결과 인계 공통화 | 구현 인계의 공통 interaction 계약 |
| G2 | 기반 구현 완료. path node/import·component override/variant은 후속 공백으로 유지 | [G2 구현·검증](docs/implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md) |
| G3-1 | 완료: import·배치·크기/crop·SVG·save/reload | [G3-1 증거](docs/implementation/G3-IMAGE-ASSET-2026-10-05.md) |
| G3-2 완료 | image placement 복제·exact transform·aspect lock·공통 Align | 독립 identity/source share, Node/browser/Undo/Redo |
| G3-3a 완료 | ellipse mask/clip | non-destructive renderer preview, SVG clip, v9 roundtrip |
| G3-3b 완료 | crop edge/corner canvas handles | existing crop model, pointer/numeric parity, preview/apply/cancel/export |
| G3-4a 완료 | per-placement opacity | original pixels retained, canvas alpha, SVG opacity, v10 roundtrip |
| G3-4b1 완료 | placement별 brightness/contrast/saturation | sRGB canvas shader/SVG filter, v11, slider/input, Apply/Cancel·History |
| G3-4b2 완료 | Artboard PNG raster composition | crop/mask/opacity/adjustment/vector, decoded pixel fixture·메모리 비용 |
| G3-4b3 완료 | Artboard PDF output | active/all-visible pages, mm MediaBox, DPI/page/pixel/memory/file guards, real multi-page decode |
| G3-5 / I1 | 자원 공유·재업로드 제거 및 원본 교체 자동 검수 완료. 외부 실무자/실제 GPU 평가는 남음 | [G3-5 전후 측정·마감](docs/verification/G3-5-IMAGE-RESOURCES-2026-10-06.md), [source 교체 검수](docs/verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md) |
| G4 첫 A/B/C 완료 | Scene source 선택·draft/recovery·finite nested component·Auto Layout/state/time·target state·재생·정지 SVG | [구현 근거](docs/implementation/G4-CAD-BASICS-2026-10-06.md). 직접 layout handle·component override/variant·PPTX/GIF/영상은 후속 |
| G5-A 완료, B 대기 | gateway 응답·취소·draft/context와 Apply·잠금·경합·local rule·결과 인계 검수 | [A3 구현·검증](docs/implementation/G5-A3-COPILOT-APPLY-2026-10-08.md). 다음은 Query와 기존 편집 명령 한 종류. 실제 LLM 공급자 연결 전 |
| G6 | IFC/RVT·Axo·Manim·Notion/InDesign adapter | 핵심 문서·asset·view 계약 재사용 |

성능은 매 단계에서 같은 과제의 지연·메모리·자원 해제를 측정한다. WebGPU·영속 캐시는 [웹 자원 전략](docs/architecture/WEB-RUNTIME-RESOURCE-STRATEGY.md)에 따라 병목이 확인된 경우 도입하고, 핵심 제작 기능의 선행 조건으로 두지 않는다. 자동 회귀 마감 후에도 외부 실무자의 task time·재시도·복구율과 native GPU/heap/VRAM 평가를 별도로 남긴다.

## CAD 공백은 계속 보존

CAD 카드는 [구현 단위 설계](docs/product/CAD-BASICS-IMPLEMENTATION-PLAN.md)에 분리했다. **B3-A1/A2·B와 C1–C3를 완료했다.** C3 전체 회귀 결과와 잔여 문제는 PROJECT-STATE를 따른다. A3 OCS/tilted 교환과 나머지 B0–B4·B5·X1–X7은 계획을 유지한다. 전체 CAD 공백을 이미지/장면 단계의 완료로 덮지 않는다.

일반 치수의 공통 스타일, 스냅 추적, 추가 DXF OCS, 원호 코너·비대칭 Chamfer, 해치·블록·변수 참조 재연결, 작도 정의 재편집, 면 위 스케치·Hole/Shell·mesh는 [CAD-BASICS](docs/product/CAD-BASICS.md)와 [로드맵](docs/product/PRODUCT-ROADMAP.md)에 남는다. 지름·각도 주석과 DXF 기본 bulge 왕복은 실제 검수 범위에서 지원한다.

## 완료 판단

Preview·Cancel·실패는 원본과 History를 변경하지 않고 성공은 한 Undo다. 기하·단위·참조·저장 복원을 검사하며 UX는 실제 브라우저에서 확인한다. 자동 회귀와 실무자의 작업 시간·재시도 평가는 구분한다. 실행 방법은 [README](README.md), 구현 범위·검증 날짜는 PROJECT-STATE에 기록한다.
