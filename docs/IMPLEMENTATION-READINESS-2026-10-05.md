# 다음 구현 전 최종 기획과 인계

갱신일: 2026-10-06. G3-4b3까지 전체 검증했다. G3-5 자원 최적화·측정과 G4/G5 첫 코드가 작업 트리에 있으며, 사용자의 요청으로 범위를 분할했다. **다음은 G3-5A 마감만**이다. [작업 분할·진행 중 상태·다음 프롬프트](WORK-SLICES-2026-10-06.md)를 우선하고 아래 큰 단계는 제품 범위로 유지한다. 실제 검증은 [PROJECT-STATE](../PROJECT-STATE.md)와 [G3-5 증거](verification/G3-5-IMAGE-RESOURCES-2026-10-06.md)를 따른다.

이 문서는 다음 구현의 범위·선행 조건·완료 기준을 소유한다. 짧은 실행 큐는 [NEXT-STEPS](../NEXT-STEPS.md), 현재 사실과 검증 날짜는 [PROJECT-STATE](../PROJECT-STATE.md), 수정 위치는 [CHANGE-GUIDE](architecture/CHANGE-GUIDE.md)를 따른다. 기획 정리 이후 사용자 요청으로 G0와 G1 세션 개선·History 후속 검수를 실행했다. 이 문서는 모델 설정을 변경하거나 후속 작업을 자동 시작하지 않는다.

## 최상위 목표

CAD의 정확도, Illustrator의 벡터 편집, Photoshop의 이미지 편집, Figma의 레이아웃·재사용·프로토타입을 하나의 문서와 일관된 조작 경험으로 연결한다. 특정 상용 제품의 전체 기능 동등성을 완료 조건으로 삼지 않고, 실제 작업을 끝낼 수 있는 기능 묶음을 순차 검증한다.

공통 기반은 문서 identity, 선택, 좌표·단위, 명령·Query, Preview/Review/Apply, 실패 원자성, History, 저장, 출력, 자원 수명이다. 기하·구속·위상, 벡터 appearance, raster asset·pixel adjustment, layout·prototype는 각자의 의미와 계산을 소유한다.

```text
통합 Workspace · Selection · Command · Review · History
                         ↓
공통 문서 · Asset · Reference · 저장 · 출력 계약
    ├─ CAD: analytic geometry · constraint · topology · BRep
    ├─ Vector: path · style · artboard · component
    ├─ Raster: source image · crop · mask · adjustment · pixels
    └─ Layout: frame · auto layout · state · prototype
                         ↓
표시: 현재 WebGL / 선택적 WebGPU · Worker · 파생 캐시
자동화: 같은 Query/Preview/Apply를 쓰는 Copilot·LLM·외부 adapter
```

이미지를 CAD geometry로 강제하거나 layout 규칙을 CAD solver에 넣지 않는다. 원본 참조와 변환 경계를 명시한다. CAD mm와 화면 px, 기하 허용오차와 화면 스냅 반경, 원본 정확도와 표시용 tessellation을 구분한다.

## G0 기준선과 이후 G1

- CAD 기본 편집, 스케치·작도·패턴 관계 재연결, 공통 commandInteraction 일부, Worker 기반 커널, rule Copilot이 있다. 실제 지원 조합은 [CAD-BASICS](product/CAD-BASICS.md)를 따른다.
- 아트보드 model·command·panel·v7 저장과 viewport frame/선택/Fit, exact-bounds/background/crop SVG 출력이 있다. 현재 추가 limitation은 [G2 기록](implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md)에 둔다.
- 시작된 마지막 artboards collection 제거는 G0에서 검증했다. impact는 생성/수정/삭제를 구분하고 속성 편집을 공통 PrecisionField·commandInteraction·Review/Apply로 연결했다. 본문 스크롤과 별도 하단 버튼 영역을 native hit-test로 확인했다.
- 기존 Node 24.19.0·pnpm 11.26.0을 정상 실행 권한에서 사용하면 타입·Node·browser·build가 동작했다. 기본 sandbox의 tsc 미발견·tsx EPERM 때문에 dependency를 재설치하지 않았다.
- 아트보드 Node 10개·browser 25개에서 preview/Cancel 불변, 마지막 삭제·Undo/Redo, 잠금/없는 대상·stale/double Apply·batch 원자성, 파일/cache·v7/v1 왕복과 실제 패널 reload를 확인했다.
- G0 전체 Node는 545개/50 suites, browser는 22과제/454검사였다. 소스 및 G0 테스트 별도 타입 검사와 전체 build도 통과했다. 당시 architecture·로그·측정 한계는 [G0 증거](verification/G0-ARTBOARDS-2026-10-05.md)에 둔다.
- G1은 공통 History 단축키·도구/돌출 정리·선택/포커스 복원과 기존 stale 복구를 연결했다. 첫 24개 네이티브 과제를 작은 문서와 배경 1,000개에서 검증했다. 후속에서는 100개 상한 뒤 선택 오류를 수정하고 분기·다중/위상 선택·같은 ID 재열기 23개 browser 검사와 Node 7개를 추가했다. 첫 관측 지연은 [세션 증거](verification/G1-SESSION-CONTINUITY-2026-10-05.md), 후속 범위는 [History 증거](verification/G1-HISTORY-IDENTITY-2026-10-05.md), 최신 전체 수치는 PROJECT-STATE를 따른다.
- G2는 Artboard frame/Fit/export, CAD drawing vector appearance, definition/instance/nested Component의 네 작은 검증 단위로 실행했다. 전체 Node 567/53 suites, browser 25 workflows/518 checks, TypeScript, architecture 258 modules와 production build가 통과했다. component instance-level override/variant, path-node/import, advanced vector style은 남아 있다.
- WebGPU, 완전한 ToolSession, 고급 Component, Frame/Timeline, 실제 LLM, IFC/RVT/Manim/Notion/InDesign 연동은 목표이며 통합 완료가 아니다. RasterAsset/ImageNode는 placement/mask/opacity/direct crop/color adjustment와 Artboard PNG/PDF raster composition까지 구현했다. 큰 source의 자원 수명과 외부 실무자 task-time/retry 검증은 남아 있다.

## 실행 순서

| 단계 | 구현 묶음 | 종료 조건 |
| --- | --- | --- |
| G0 완료 | 실행 환경·기준선 복구 + 시작된 아트보드 수정 검증 | [실제 실행 증거](verification/G0-ARTBOARDS-2026-10-05.md). 뷰포트 프레임·보드 export 완료를 의미하지 않음 |
| G1 기술 검수 통과·후속 평가 유지 | 공통 interaction·세션 개선·긴/분기 History 선택 복원 | 검증한 workflow의 기술 문턱 통과. 전체 도구 통일과 실무자 시간/재시도 평가는 계속 남김 |
| G2 foundation 완료 | 아트보드 표시/Fit/SVG → CAD vector appearance → 재사용 Component | [G2 증거](implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md). path-node/import 및 instance override는 확장 공백 |
| G3-1 완료 | PNG/JPEG/WebP import·배치·크기/crop·artboard SVG·v8 저장/recovery | immutable source identity, 공통 selection/Review/History, 실제 browser 왕복 |
| G3-2 완료 | placement duplicate·exact transform·aspect lock·공통 Align | source bytes 공유, placement identity 분리, Node/browser/History 왕복 |
| G3-3a 완료 | Rectangle/Ellipse non-destructive mask | live canvas geometry preview, Cancel/Apply, v9/SVG mask roundtrip |
| G3-3b 완료 | canvas crop handles | source/visible bounds, pointer/numeric same crop model, review/apply/cancel, Undo/Redo |
| G3-4a 완료 | per-placement opacity | 원본 bytes 보존, v10, canvas preview와 board SVG alpha |
| G3-4b1 완료 | placement별 brightness/contrast/saturation | sRGB canvas shader/SVG filter, v11, slider/input, Apply/Cancel·History |
| G3-4b2 완료 | Artboard PNG raster composition | crop/mask/opacity/adjustment/vector, decoded output pixels·메모리 비용 |
| G3-4b3 완료 | PDF board output | active/all-visible pages, mm MediaBox, DPI/page/pixel/memory/file guards, real multi-page decode |
| G3-5 | 큰 이미지 자원·실무 사용성 검증 | thumbnail/tile/cache 도입을 계측으로 결정하고 외부 task-time/retry 평가 |
| G4 | Frame·Auto Layout·component state·Prototype → Scene/Timeline·슬라이드 | 같은 문서 객체로 화면 흐름·상태 전환·발표를 구성하고 포맷 손실을 명시함 |
| G5 | Copilot·LLM 연결 | 선택·관계·지원 capability를 읽고 검토 가능한 typed command로 수동 작업과 같은 결과를 얻음 |
| G6 | Axo/IFC/RVT·Manim·Notion/InDesign adapter | 검증된 핵심 문서·asset·view·출력 계약을 소비하며 optional adapter 없이도 핵심 편집이 동작함 |

성능은 모든 단계의 공통 과제다. cold/warm, input-to-paint, preview/Apply p95, 메모리와 자원 해제를 측정하고 가장 큰 병목을 개선한다. WebGPU 전체 전환을 G2~G5의 선행 조건으로 두지 않는다. 도입은 [웹 자원 전략](architecture/WEB-RUNTIME-RESOURCE-STRATEGY.md)에 따라 renderer 병목이 확인된 범위부터 진행한다. persistent cache는 RAM/VRAM을 대신하지 않으며 재계산·재다운로드를 줄이는 계층이다.

## G0에서 검증한 범위

1. 실행 경로·권한 문제와 소스 문제를 구분하고 기존 작업 트리·dependency·lockfile을 보존했다.
2. 마지막 collection 삭제의 게시·serialization·recovery·History·New·파일 open을 검증했다.
3. preview/abort/discard/Cancel의 원본 불변과 Apply 한 번, stale·잠금·없는 대상의 원자적 거부를 확인했다.
4. create/update/delete·no-op·batch의 impact 수량을 구분하고 실패 시 revision·양쪽 History stack을 보존했다.
5. 아트보드 Node 10개와 관련 공통 precision/interaction 검사를 보강했다. 기존 테스트를 약화하지 않았다.
6. Artboards 패널의 native 입력·review·오류 복구·last delete·Undo/Redo·Save·reload browser 25개를 runner에 등록했다.
7. 전체 검증과 당시 제한을 [검증 문서](verification/G0-ARTBOARDS-2026-10-05.md)에 기록했다. G0 실행에서는 G1을 시작하지 않았고, 후속 사용자 요청으로 아래 첫 묶음을 구현했다.

## G1 첫 구현과 후속 범위

기존 audit와 실제 브라우저를 대조해 도구별 Undo/Redo·포커스와 중첩 돌출 세션을 첫 공백으로 선정했다. 공통 단축키 라우팅과 기존 Undo/Redo·busy guard·document version 검증을 재사용했다. Pattern/Curve/Contour/Construction/Extrude와 숫자 입력·그리기·Scale·핸들·modal을 실제 입력으로 확인한다. 직접 편집·치수의 기존 stale 입력 복구를 제거하지 않는다.

후속 검수에서 105회 복제 뒤 Undo의 선택 오류를 재현했다. HistoryStack의 상태 토큰을 App WeakMap의 키로 사용해 상한·분기·다중/primary·꼭짓점/Explode·Hide·같은 ID 파일 open을 검증했다. token은 UI 세션 정보이며 serialization·topology identity와 분리한다. preview/no-op/실패는 이력을 추가하지 않는다.

G2는 이 계획을 네 개의 독립 검증 slice로 완료했다. Artboard viewport/Fit, per-board SVG bounds/crop, drawing fill/stroke editor, Component definition/placement/update는 각각 기존 document/command/History를 사용한다. 실제 범위와 browser/Node 증거는 [G2 구현 기록](implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md)을 따른다. 실무자 평가와 G2 전용 대형문서 성능 benchmark는 아직 없다.

G3-2..4a와 G3-3b/4b1은 공통 selection/transform/History를 재사용해 duplicate·transform·align·mask·opacity·direct crop·brightness/contrast/saturation을 연결했다. Crop pointer/numeric 입력은 동일 normalized crop draft를, color number/slider는 동일 adjustment draft를 소비한다. 128×128 browser fixture direct crop drag→preview/Apply는 전체 회귀에서 155.3/133.4ms, color 입력 3개→preview/Apply 633.5/133.7ms였다. canvas screenshot에서 최대 sample RGB 변화는 26.6이었다. 각 timing은 단일 관측이라 반복 p95·대형 이미지 성능으로 일반화하지 않는다. 다음은 Artboard PNG 합성이다. 실제 support와 제한은 [G3 구현 기록](implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md)을 따른다.

### 필수 검증

```sh
pnpm --filter @agent-webcad/web exec tsc -b
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web check:architecture
pnpm --filter @agent-webcad/web test:browser -- --artifacts
pnpm build
```

새 코드와 테스트가 검증에 포함되는지 확인한다. 현재 production tsconfig는 src만 포함하므로 테스트 타입 검사 공백도 기록한다. browser direct command 호출은 실제 패널 조작 검증을 대신하지 않는다. 실행 제한이 있으면 완료를 선언하지 않고 결과·원인·남은 명령을 명시한다.

## G1 이후의 공통 구현 계약

- Discover → Enter → Select → Input → Preview → Validate → Apply → Handoff를 공유한다. 적용 가능 여부는 공통 validation/state를 소비한다.
- drag와 numeric input은 같은 parameter와 계산 경로를 사용한다. UI에 독립 geometry 알고리즘을 만들지 않는다.
- unsupported·ambiguous·locked·missing reference는 진단과 복구 방법을 표시한다. 부분 변경이나 임의 remap을 하지 않는다.
- 새 문서 필드는 serialization/publish/restore/recovery/preview diff/History/fixture/출력을 함께 점검한다.
- cache·render resource·worker·late response는 문서와 세션 버전 및 취소 수명을 따른다.
- 전문가·초보자는 같은 문서와 명령을 쓴다. 점진적 안내·정보 밀도·단축키가 달라도 입력 정확도·결과·복구 기준은 같다.
- App/Viewport 전체 재작성이나 모든 shared type의 선행 생성 없이, 검증 가능한 세션·기능 단위로 경계를 추출한다.

## 외부 연동의 위치

[RVT·IFC·Axo](architecture/RVT-IFC-AXONOMETRIC-INTEGRATION.md), [BIM 출판](architecture/BIM-PUBLICATION-ORCHESTRATION.md), [Manim](architecture/MANIM-MATH-ANIMATION-INTEGRATION.md), [오픈소스 후보](architecture/OPEN-SOURCE-CREATIVE-INTEGRATION-2026-10-05.md)는 후속 연동 설계다. 핵심 네 편집 계층보다 앞서 별도 원본·UI·History를 만들지 않는다.

Axo view는 기존 CAD 솔리드에도 적용할 수 있으므로 관련 3D 과제에서 독립적으로 검증할 수 있다. IFC와 Revit API/MCP 연결은 데이터 변환·출처·손실 계약이 필요하다. RVT 직접 파일 변환과 열려 있는 Revit 모델 조회는 서로 다른 adapter이며 구분한다. Notion은 팀 검토 read model, InDesign은 출력 대상, Manim은 설명 장면의 비동기 renderer로 둔다.

## 문서별 책임

| 문서 | 책임 |
| --- | --- |
| 이 문서 | 단계·선행 조건·다음 구현의 상세 인계 |
| [NEXT-STEPS](../NEXT-STEPS.md) | 짧은 실행 큐와 현재 재시작 지점 |
| [PROJECT-STATE](../PROJECT-STATE.md) | 코드 상태·검증 날짜·남은 제한 |
| [통합 제작 로드맵](product/UNIFIED-CREATIVE-SUITE-ROADMAP.md) | 네 편집 영역의 UX·제품 설계 |
| [도메인 로드맵](product/PRODUCT-ROADMAP.md), [CAD-BASICS](product/CAD-BASICS.md) | CAD·수학·3D·BIM 도메인 목표와 지원 범위 |
| [CAD 구현 단위 설계](product/CAD-BASICS-IMPLEMENTATION-PLAN.md) | B0–B5와 신규 X 기능의 카드·선행 조건·구현 경계·통합 검수 |
| [CHANGE-GUIDE](architecture/CHANGE-GUIDE.md), [DIRECTORY-STRUCTURE](architecture/DIRECTORY-STRUCTURE.md) | 실제 코드 수정 위치와 의존 규칙 |
| implementation / verification / reviews | 기능별 구현·실행 증거·발견 근거 |

장기 목표를 NEXT-STEPS에 반복하지 않는다. 고유한 과거 측정·지원 경계는 보존하며 최신 상태와 연결한다. 계획을 구현으로 승격하는 기준은 실제 코드와 해당 테스트 실행 결과다.

## 권장 모델과 강도

서로 다른 문서·트랜잭션·UI·browser 경계를 함께 바꾸는 G2 orchestration에는 **GPT-6 Astra / xhigh**가 적합했다. 반면 G2와 G3를 독립 계약/사용자 workflow 단위로 자르면 **Luna / xhigh** 크기로 진행할 수 있다. 이는 작업 크기 권고이며 모델별 실측 비교가 아니다.

| slice | 단일 결과 | 독립 검증 | 강도 |
| --- | --- | --- | --- |
| G2-1 | artboard frame·active selection·Fit | artboard canvas unit + 실제 패널 browser | Luna xhigh |
| G2-2 | active-board SVG bounds/background/crop | SVG/export Node + File menu browser | Luna xhigh |
| G2-3 | drawing vector style persistence/render | style Node + selected-drawing browser | Luna xhigh |
| G2-4 | component definition/insert/update/nesting | drafting Node + Components browser | Luna xhigh |
| G3-1 완료 | one-image import → crop → artboard SVG → save/reload | Node persistence/recovery + native browser workflow | Luna xhigh slice |
| G3-2 완료 | duplicate/transform/align image placements | placement identity/reference Node + canvas browser + Undo/Redo | Luna xhigh slice |
| G3-3a 완료 | ellipse mask/clip | preview nonmutation + artboard SVG/browser | Luna xhigh slice |
| G3-3b 완료 | direct crop handles | pointer-to-normalized-crop browser + cancel/apply + Undo/Redo | Luna xhigh |
| G3-4a 완료 | basic opacity | source identity + preview/apply + SVG + v10 tests | Luna xhigh slice |
| G3-4b1 완료 | placement color adjustment + canvas preview | deterministic color math + source identity + SVG filter + v11 | Luna xhigh |
| G3-4b2 완료 | Artboard PNG composition | detached Worker render, decoded output pixels, alpha/order, scale and memory guards | Luna xhigh slice; 25 browser checks |
| G3-4b3 완료 | PDF board output | page mapping, exact mm MediaBox, DPI and aggregate guards, downloaded multi-page PDF reopen/pixel check | Luna xhigh; 21 browser checks, no new dependency |
| G3-5 | large asset/resource behavior + user task check | measured fixture sizes + explicitly reported limits | Luna xhigh |

G2와 G3-4b3 slice는 구현·검증했다. G3-1..4b3의 상세 evidence는 [구현](implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md)과 [검수](verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다. G3-5에서 texture 중복과 재업로드 병목을 측정·수정했으며 다음 작은 단계는 회귀 마감이다. 여러 cache/storage/render primitive를 한꺼번에 도입하거나 document storage를 재설계하게 되면 Astra xhigh 크기로 다시 나눈다. OpenAI Docs의 [모델 선택](https://developers.openai.com/api/docs/guides/model-selection)과 [reasoning 안내](https://developers.openai.com/api/docs/guides/reasoning)를 참고했다.

## 다음 담당에게 전달할 프롬프트

[작업 분할 문서의 G3-5A 마감 프롬프트](WORK-SLICES-2026-10-06.md)를 사용한다. 기존 자원 최적화와 시작된 G4/G5 변경을 보존하고, 전체 회귀와 기록까지만 수행한다. 다음 기능은 자동 시작하지 않는다.
