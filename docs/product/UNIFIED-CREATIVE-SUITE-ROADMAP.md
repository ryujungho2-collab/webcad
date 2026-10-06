# WebCAD 통합 제작 제품 방향

갱신일: 2026-10-05

문서 역할: 통합 UI와 제작 기능의 목표·설계 원칙을 기록한다. 아래 ToolSession/RasterAsset/ImageNode/Scene/Timeline과 어댑터 도식은 계획을 포함한다. 실제 구현과 검증은 [PROJECT-STATE](../../PROJECT-STATE.md), 실제 수정 위치와 현재/목표 차이는 [CHANGE-GUIDE](../architecture/CHANGE-GUIDE.md), 다음 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다.

WebCAD의 목표는 **CAD·벡터 일러스트·이미지 편집·레이아웃의 통합 제작 엔진**이다. 정확한 CAD 기하와 관계를 보존하고, 아트보드를 통해 아이콘·이미지·화면·슬라이드를 같은 문서에서 구성한다. 선택·입력·Preview·Apply·Undo·저장·결과 인계를 공유하되 도메인마다 필요한 편집 의미를 유지한다.

이미지는 asset·픽셀·마스크·보정 stack으로, 레이아웃은 Frame·배치·상태로 다룬다. 모든 이미지를 CAD geometry로 강제하거나 모든 배치를 CAD solver로 해결하지 않는다. CAD 참조를 사용하는 표현은 원본 identity에 연결하고, 각 도메인의 원본과 표현 변환을 구분한다. 공통 계약을 기존 코드에서 점진적으로 추출하며 전체 Shell 재작성이나 새 패키지 일괄 분리를 선행 조건으로 두지 않는다.

## 기준 아키텍처

```text
CAD Document / Dependency Graph
  ├─ Geometry + Constraint + Feature + Solver
  ├─ Artboard (좌표 영역·배경·출력 경계)
  ├─ Scene / Frame (배치·상태·링크)
  ├─ Style / Component / Asset (표현·재사용)
  ├─ Raster / Image Composite (이미지·마스크·필터)
  ├─ Timeline / Presentation (시간·발표)
  └─ AI Command Interface (관계 그래프를 읽고 제안)
```

## 엔진과 제품 UI의 경계

엔진은 headless 환경에서도 동작해야 한다. 브라우저 UI가 없어도 문서 생성·조회·구속 해결·관계 재생성·Preview·Apply·Undo/Redo·저장/재로드를 실행할 수 있어야 하며, UI와 Copilot/LLM은 이 엔진의 Command와 Query를 소비한다.

```text
Engine packages
  cad-document · cad-geometry · cad-kernel · cad-history
  cad-commands · dependency/query · render/export contracts

Product shell
  unified workspace · canvas · inspectors · timeline · presentation
  Copilot/LLM adapters · external library adapters
```

현재 repository는 이 두 층이 일부 분리되어 있지만 App/Viewport와 상태 모듈이 아직 강하게 연결된 하이브리드 단계다. 다음 구조 작업의 목적은 UI를 약화하는 것이 아니라, 같은 엔진을 WebCAD 화면·Copilot·자동화·외부 import/export가 함께 사용할 수 있게 만드는 것이다. 오픈소스는 `integrations/*-adapter` 경계에만 연결하고, 선택적 제작·LLM 패키지가 없어도 CAD 문서·명령·검증은 빌드·테스트되어야 한다. 3D 커널의 OpenCascade 의존은 별도 계산 의존성이며 제거 대상으로 간주하지 않는다.

아트보드는 geometry의 대체 문서가 아니다. 아트보드는 어떤 CAD 객체를 어느 위치·축척·순서로 보여주고 출력할지를 정의한다. 같은 선을 도면에서는 치수와 구속이 있는 CAD geometry로 보고, 아트보드에서는 아이콘·도형·슬라이드 요소로 배치할 수 있다.

## 제품 원칙

### 최우선: 통합 UI

사용자는 CAD, 일러스트, 와이어프레임, 애니메이션, 슬라이드를 서로 다른 앱으로 경험하면 안 된다. 모든 모드가 같은 상단 도구 영역, 좌측 문서/아트보드 탐색, 중앙 캔버스, 우측 속성·관계 패널, 하단 상태·타임라인을 공유해야 한다. 모드가 바뀌어도 선택, 정밀 입력, 미리보기, 영향 확인, 오류 복구, Apply, 결과 인계의 동작 문법은 유지한다.

외부 라이브러리의 toolbar, selection panel, history, modal을 그대로 노출하지 않는다. 외부 기능은 통합 UI가 만든 `ToolSession`, `SelectionContext`, `ReviewState`, `CommandResult`를 소비하는 어댑터로 감싼다.

### 확장 가능하고 편안한 UI 원칙

- **고정된 공간, 변하는 내용**: 좌측 탐색·중앙 캔버스·우측 인스펙터·하단 상태/타임라인의 위치는 유지하고, 선택과 작업에 따라 내용만 바꾼다.
- **선택 우선**: 도구를 찾기 전에 대상을 선택해도 가능한 편집·관계·출력 작업을 제안한다. 선택이 바뀌면 패널과 캔버스 안내가 즉시 같은 의미로 갱신된다.
- **점진적 노출**: 기본 조작은 짧게, 정밀 옵션·참조·스타일·진단은 펼쳐서 제공한다. 전문가 기능을 숨기지 않되 처음부터 화면을 채우지 않는다.
- **직접 조작과 값 입력의 동등성**: 드래그, 핸들, 숫자 필드, 명령 검색은 같은 파라미터와 실행 경로를 사용한다.
- **현재 상태를 항상 설명**: 현재 도구, 선택 대상, 필요한 입력, 변경 영향, Apply 가능 여부, 오류 복구 방법을 캔버스와 패널에서 확인할 수 있어야 한다.
- **작업 중단에 강함**: 도구 전환·취소·문서 교체·Undo/Redo 뒤에도 선택, 입력, preview, focus가 예측 가능하게 복원된다.
- **밀도와 접근성 조절**: compact/comfortable 밀도, 키보드 focus, 충분한 hit area, 색상만 사용하지 않는 상태 표시를 지원한다.
- **새 기능은 슬롯으로 확장**: 새 모드는 새 화면을 만들지 않고 Tool rail, Inspector section, Canvas overlay, Timeline track 같은 등록 지점에 추가한다.

### 초보자와 전문가를 같은 흐름에 수용한다

초보자용 UI와 전문가용 UI를 별도 제품처럼 나누지 않는다. 같은 명령·상태·결과를 사용하고, 보이는 정보의 깊이와 입력 밀도만 조절한다.

| 사용자 상태 | 기본 경험 | 확장 시 제공 |
| --- | --- | --- |
| 처음 사용하는 사용자 | 추천 도구, 단계별 다음 입력, 안전한 기본값, 캔버스 힌트, 자연어 Copilot | 상세 Inspector와 관계 보기로 점진적 확장 |
| 익숙한 사용자 | 검색·단축키·직접 드래그·정밀 입력, 최근 도구 | 빠른 반복, multi-select, batch command, reusable component |
| 전문가 | compact layout, topology/constraint diagnostics, command history, script/API, 수치·허용오차 | solver 상태, dependency graph, export capability와 성능 측정 |

공통 규칙은 다음과 같다.

- `Beginner / Standard / Expert`는 기능을 삭제하는 모드가 아니라 정보 밀도와 도움말의 기본값이다.
- 언제든 같은 명령의 상세 패널과 진단 정보를 펼칠 수 있어야 한다.
- 초보자에게 자동으로 적용되는 동작은 Preview와 되돌리기를 제공한다.
- 전문가는 안내를 끄고도 키보드·명령 검색·정밀 숫자 입력으로 같은 결과에 도달할 수 있어야 한다.
- Copilot은 초보자에게는 설명과 다음 행동을, 전문가에게는 command plan·참조·허용오차·성능 정보를 보여준다.
- 사용자의 현재 수준을 추측해 UI를 갑자기 재배치하지 않는다. 밀도와 도움말은 명시적으로 조절하고 작업 중에는 레이아웃을 안정적으로 유지한다.

### CAD 정밀도는 모든 레이어의 바닥 계약이다

통합 UI가 편해져도 CAD의 세부 의미를 줄이지 않는다. 아트보드·이미지·벡터·슬라이드가 CAD geometry를 참조할 때도 단위, 허용오차, topology, constraint, dependency, history를 보존한다.

CAD 작업의 완료 기준은 다음 범위를 포함한다.

- **기하**: Point, Line, Segment, Ray, Polyline, Polygon, Circle, Arc, Ellipse, Bezier, Spline, Text, Dimension과 analytic curve 보존
- **편집**: Move, Rotate, Scale, Mirror, Offset, Trim, Extend, Fillet, Chamfer, Split, Join, Boolean, Explode, Stretch, Lengthen
- **관계**: 수평·수직·평행·수직·접선·동심·동일 길이·동일 반지름·거리·각도·고정·점 위·대칭과 solver 재계산
- **참조**: point/endpoint/segment/whole-span/face/edge/branch identity, construction·pattern·projection·extrusion 재연결
- **정밀 입력**: mm/cm/m/inch, 절대·상대·극좌표, 각도 잠금, snap 후보와 추적, 허용오차·소수점 표시
- **도면**: 선형·수평·수직·각도·반지름·지름·호 길이·면적·좌표·Leader·주석·스타일
- **문서 관리**: layer/group/component, visible/locked/opacity/color/line type/line width, 원본·결과 탐색
- **교환·재생성**: SVG/DXF/PDF/STEP 등에서 가능한 의미 보존, unsupported/ambiguous geometry의 명시적 거부, 원자적 실패
- **3D 기반**: Extrude, Revolve, Sweep, Loft, Boolean, Fillet/Chamfer와 face/edge 참조의 재생성

일러스트나 AI가 CAD 객체를 생성할 때도 이 계약을 우회하지 않는다. “선 하나를 그려줘”라는 요청도 단순 픽셀이나 SVG path를 남기는 것이 아니라, 가능한 경우 단위·작업 평면·구속·참조를 가진 CAD command plan으로 제안한다.

### Copilot과 LLM은 통합 UI의 실행 계층이다

Copilot은 별도의 대화창에서 임의의 기능을 호출하는 도구가 아니다. 현재 문서, 선택, 활성 아트보드, 작업 모드, 잠금, 구속, preview, 영향 범위를 읽고 같은 Command API를 통해 제안하는 실행 계층이다.

```text
User gesture / command search / Copilot / LLM
                    ↓
            Intent + capability resolver
                    ↓
          ToolSession + SelectionContext
                    ↓
       Preview → Impact/Review → Apply
                    ↓
       Result Handoff → History → Explain
```

Copilot이 지켜야 할 계약은 다음과 같다.

- 문서와 선택을 먼저 읽고, 사용할 수 없는 도구와 이유를 설명한다.
- 자연어를 바로 mutation으로 실행하지 않고 typed `CadCommand` 계획으로 변환한다.
- 계획에는 대상, 입력값, 생성·변경·삭제 객체, 영향받는 관계, 미해결 참조, 예상 결과를 포함한다.
- Preview와 검증은 사람이 실행한 명령과 같은 경로를 사용한다.
- Apply 전에는 변경 범위와 복구 방법을 캔버스와 Copilot 패널에 함께 표시한다.
- Apply 실패나 모호한 요청은 문서를 변경하지 않고 추가 선택·값·branch를 요청한다.
- 결과에는 사용한 명령, 보존·재연결된 관계, 생긴 제한을 사람이 읽을 수 있게 남긴다.
- 사용자는 언제든 직접 편집으로 전환하고, Copilot 제안을 수정하거나 Undo할 수 있다.

따라서 LLM 기능의 첫 대상은 “무엇이든 생성”이 아니라 `현재 선택 설명`, `다음 작업 추천`, `정밀 입력 계획`, `영향받는 관계 설명`, `반복 작업 자동화`다. 이 기반이 안정된 뒤 일러스트·와이어프레임·슬라이드·애니메이션 생성으로 넓힌다.

```text
Unified Workspace Shell
  ├─ Tool rail / command search
  ├─ Document + Artboard + Layer navigator
  ├─ Shared canvas and selection context
  ├─ Properties / constraints / component inspector
  ├─ Review / impact / recovery panel
  └─ Timeline / presentation controls
```

1. **CAD가 원본이다**

   정확한 좌표, 단위, 구속, topology, dependency, solver 결과는 CAD 문서가 소유한다. 일러스트나 슬라이드 편집은 이 원본을 참조하거나 스타일·배치를 추가하며, geometry를 조용히 복제하지 않는다.

2. **하나의 객체 모델**

   선·곡선·텍스트·이미지·그룹·컴포넌트는 공통 identity·소유권·참조·명령·저장 계약을 사용한다. 기하 Feature, RasterAsset/ImageNode, Frame의 데이터와 계산은 구별한다. 동일 원본을 참조하는 편집이 독립 복사본으로 갈라지지 않도록 연결을 보존하며, 명시적 복제·변환에는 새 identity와 출처를 기록한다. 모든 도메인을 기존 `CadFeature`에 억지로 넣는다는 뜻은 아니다.

3. **아트보드는 공통 좌표 공간**

   현재 추가한 아트보드는 여러 캔버스를 담는 문서 경계다. CAD 작업 평면, 일러스트 아트보드, 와이어프레임 화면, 프레젠테이션 슬라이드는 같은 문서 좌표를 공유하고, 표시 방식과 출력 영역만 달라야 한다.

4. **직접 편집과 자동화의 동일 경로**

   드래그·핸들·정밀 입력·명령 검색·AI는 모두 같은 Command/Preview/Apply/Undo 경로를 호출한다. AI가 만든 객체도 사용자가 캔버스에서 직접 수정할 수 있어야 한다.

5. **관계가 기능을 연결한다**

   컴포넌트 인스턴스, 패턴 멤버, 애니메이션 키프레임, 프로토타입 링크, 슬라이드 배치 모두 원본 객체의 identity를 가리킨다. 원본 편집 후 연결된 결과를 미리 보고 재생성한다.

## 기능별 확장 범위

아래 번호는 기능 묶음을 설명한다. 실제 구현 순서는 [최종 기획의 G0–G6](../IMPLEMENTATION-READINESS-2026-10-05.md)가 소유한다. 레이아웃 기반 뒤 애니메이션을 추가하고, 외부 연동은 기본 엔진 완료 이후의 선택 확장으로 둔다.

### 1단계 — 벡터 일러스트와 아이콘 제작

- Path/compound path의 fill, stroke, line cap/join, dash, gradient, opacity, blend mode
- Boolean path, outline/stroke 변환, 노드 편집, 정렬·분배·스마트 가이드
- 텍스트의 글꼴·크기·행간·자간·윤곽 변환
- Group, Mask, Clip, Symbol/Component의 원본·인스턴스 관계
- SVG를 기본 왕복 포맷으로 삼고, 기존 CAD geometry와 같은 문서 객체로 저장

이 단계의 대표 과제는 “아이콘 1개를 만들고, 색상·stroke·간격을 바꾼 뒤 24/32/48px 아트보드에 인스턴스를 배치하고 SVG/PNG로 각각 내보내기”다.

### 이미지와 합성 레이어

이미지는 단순한 배경 파일이 아니라 편집 가능한 `RasterAsset`과 문서 객체의 조합으로 저장한다.

- PNG/JPEG/WebP/GIF import, clipboard·drag/drop, embedded 또는 relinked asset
- 아트보드·Frame·Slide 안에서 위치·회전·스케일·crop·fit·flip·opacity 편집
- Clip path, mask, alpha, blend mode, 그림자와 기본 색상 보정
- 원본 이미지를 보존하는 비파괴 adjustment stack과 export 시점의 합성
- 이미지 위에 CAD geometry·vector path·text를 겹치고 같은 선택/정렬/그룹 문법 사용
- 큰 이미지는 썸네일·tile·해상도 단계로 지연 로드하고, 문서에는 asset identity와 transform을 저장
- 선택 영역 tracing, vectorize, 배경 제거 같은 AI 기능은 원본을 덮어쓰지 않고 새 레이어/제안으로 생성

Photoshop식 픽셀 편집 전체를 처음부터 복제하지 않는다. 먼저 배치·crop·mask·합성·비파괴 보정·내보내기를 안정화하고, 브러시·생성형 채우기·고급 retouch는 별도 raster worker 계층으로 확장한다.

### 이미지 편집 기능 범위

이미지 편집은 한두 개의 버튼이 아니라 다음 네 층으로 확장한다.

| 층 | 사용자 기능 | WebCAD 계약 |
| --- | --- | --- |
| 배치 | import, drag/drop, clipboard, duplicate, copy/paste, crop, fit, align, distribute, rotate, flip, resize | `RasterAsset` + `ImageNode` transform/crop 명령 |
| 선택·합성 | rectangle/ellipse/lasso selection, feather, invert, alpha, mask, clip, layer order, group, blend, opacity | 원본 asset은 보존하고 selection/mask를 별도 node로 저장 |
| 보정·리터칭 | exposure, contrast, saturation, temperature, curves, blur, sharpen, noise, shadow, eraser, brush, clone/heal | 비파괴 adjustment stack과 worker 실행, 각 단계 preview/undo |
| 변환·자동화 | background removal, object erase, upscale, denoise, vectorize, recolor, style variation, image-to-CAD reference | AI 결과를 새 레이어/제안으로 생성하고 원본과 provenance 유지 |

편집 모드는 캔버스에서 대상 이미지를 더블클릭하거나 `Edit image`로 진입한다. 이때 우측 Inspector는 크기·crop·mask·보정·효과를, 상단 contextual toolbar는 자르기·선택·복사·붙여넣기·뒤집기·합성을 제공한다. 일반 선택 모드에서는 이미지 전체를 CAD/vector와 동일하게 이동·정렬·그룹화한다.

## 이미지 객체 계약

```text
RasterAsset
  source: embedded | linked
  mime, width, height, colorProfile, checksum

ImageNode
  assetId, transform, crop, selection, mask
  adjustments[], effects[], blend, opacity
  artboard/frame/component ownership
```

원본 파일과 편집 결과를 분리하므로 crop을 되돌리거나 보정 단계를 재정렬할 수 있다. 큰 이미지는 thumbnail/tile/해상도 단계로 읽고, 실제 픽셀 작업은 worker에서 수행한다. export 시점에만 합성 결과를 렌더링한다.

### 2단계 — 재사용 컴포넌트와 에셋

- 컴포넌트 정의/인스턴스/override
- 색상·간격·타이포그래피 토큰
- 로컬 에셋, SVG/PNG import, 링크된 원본과 임베드 정책
- 인스턴스 선택 시 원본 편집과 override 편집을 명확히 구분

CAD의 Block보다 강한 관계를 사용하되, 솔버와 패턴의 참조 재연결 정책을 그대로 재사용한다.

### 3단계 — 연결 애니메이션과 움짤

- 시간축, 장면/클립, 트랙, 키프레임, easing
- 위치·회전·스케일·색상·불투명도·path morph의 애니메이션
- 아트보드 또는 컴포넌트 단위의 재생/루프
- GIF는 색상 제한을 감안한 export, 고품질 결과는 WebM/MP4를 우선

애니메이션은 geometry를 복제하지 않고 객체 속성의 시간별 평가 결과를 렌더링한다. CAD 구속으로 계산되는 값은 키프레임보다 우선순위가 명확해야 한다.

### 4단계 — 와이어프레임과 프로토타이핑

- Frame/Section, Auto Layout의 최소 집합, 반복 리스트, 표·카드·폼·내비게이션 패턴
- 화면·상태·분기·오류 화면·로딩 화면을 하나의 Flow graph로 관리
- 화면 간 링크, hotspot, transition, overlay, 뒤로가기, 조건부 분기와 변수 입력
- 컴포넌트 variant와 상태 전환: hover, pressed, disabled, loading, success, error
- 디자인 컴포넌트와 프로토타입 컴포넌트의 동일 identity
- 사용자가 직접 클릭해 검토하는 Prototype mode와 구조를 편집하는 Wireframe mode를 같은 객체에 연결
- 공유 링크와 검토용 댓글은 문서 버전과 연결

와이어프레임은 별도 그래픽 엔진이 아니라 아트보드 위의 semantic frame이다. 최종 벡터와 프로토타입 화면이 같은 객체를 사용해야 한다.

### 5단계 — 프레젠테이션

- Slide를 아트보드의 프레젠테이션 뷰로 취급
- 순서, 섹션, 배경, 마스터, 레이아웃, 발표자 노트, 숨김 슬라이드
- 텍스트·도형·이미지·CAD 도면·일러스트·표·와이어프레임을 한 슬라이드에 배치
- 요소별 등장·퇴장·이동·확대·색상 변화와 순차/동시 타이밍
- 슬라이드 전환, 클릭 트리거, 자동 재생, 반복, 발표자용 현재/다음 화면
- Prototype flow를 발표 장면으로 전환하거나, 슬라이드 장면을 prototype hotspot으로 연결
- 브라우저 발표 모드와 SVG/PNG/PDF export를 먼저 제공하고, PPTX는 변환 가능한 객체와 제한되는 효과를 구분해 생성

PPT를 단순 이미지 묶음으로 만들지 않는다. 슬라이드·요소·전환·애니메이션을 문서에 저장하고, PPTX 변환 계층은 지원 가능한 네이티브 객체로 내보낸다. 변환 불가능한 효과는 미리보기에서 표시하고 필요하면 해당 장면을 동영상 또는 이미지로 대체한다.

### 와이어프레임과 슬라이드의 공통 장면 모델

두 기능은 다음 공통 구조를 사용한다.

```text
Scene / Frame
  ├─ children: vector, text, component, cad reference
  ├─ layout: position, size, constraints, auto layout
  ├─ state: default, hover, pressed, loading, error
  ├─ links: prototype navigation or slide trigger
  └─ timeline: transition, keyframes, duration, easing
```

따라서 한 화면을 만든 뒤 다음 작업이 가능해진다.

- 버튼을 누르면 다른 화면으로 이동하는 웹 와이어프레임
- 같은 화면을 발표 슬라이드로 배치
- 발표 중 버튼이나 도형이 순서대로 등장하는 애니메이션
- 동일 컴포넌트의 상태 변화를 prototype과 slide animation에 함께 사용
- CAD 도면 변경을 설명 슬라이드와 연결

### 6단계 — AI 오케스트레이션

AI는 문서 최상위에 별도 그래픽 엔진으로 붙이지 않고, 관계 그래프와 Command API를 읽고 제안하는 통합 UI 실행 계층으로 둔다.

- “이 아이콘을 3개 크기의 컴포넌트로 만들어줘”
- “선택한 도형을 12프레임 루프로 흔들어줘”
- “이 화면들을 발표 슬라이드로 정렬해줘”
- “이 컴포넌트의 원본과 override를 설명해줘”

모든 AI 결과는 Preview에서 대상·영향·생성 객체·미해결 관계를 확인하고 Apply/Undo할 수 있어야 한다.

## 다음 구현 순서

**G0 실행 환경·시작된 아트보드 검수**와 G1 세션/History 기술 묶음은 각각 [G0 증거](../verification/G0-ARTBOARDS-2026-10-05.md), [G1 세션](../verification/G1-SESSION-CONTINUITY-2026-10-05.md), [G1 History](../verification/G1-HISTORY-IDENTITY-2026-10-05.md)에 기록했다. G2의 artboard frames/Fit/individual SVG → CAD vector appearance → reusable/nested Component foundation도 구현·검증했다. 실제 지원·한계·수치는 [G2 기록](../implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md)을 따른다. G3-1 import/crop/save/export 위에 placement duplicate/transform/align, ellipse mask, per-placement opacity·brightness·contrast·saturation과 캔버스 direct crop을 추가했다. 실제 동작과 한계는 [G3 이미지 편집 기록](../implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md), 최신 수치는 [검수](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다. 다음은 Artboard PNG composite, 이후 페이지 단위 PDF output과 large-image resource workflow다. G4 Frame/AutoLayout/Prototype → Scene/Timeline/슬라이드, G5 Copilot/LLM, G6 Axo/IFC/RVT·Manim·출판 adapter는 이후 단계/선택 확장이다.

공통 ToolSession·SelectionContext·Review·Handoff는 각 작업에서 필요한 만큼 기존 commandInteraction과 transaction 경로를 재사용해 공통화한다. 상세 선행 조건·검수·다음 구현 프롬프트는 [최종 기획](../IMPLEMENTATION-READINESS-2026-10-05.md), 짧은 작업 대기열은 [NEXT-STEPS](../../NEXT-STEPS.md)에 둔다. G2에서 아트보드 viewport frame/Fit/SVG를 추가했지만 전체 편집 계층 세션 통합은 진행 중이다.

## 현재 상태와 한계

현재 문서에는 CAD geometry, drawing의 제한된 vector fill/stroke/opacity/width, artboard frame/Fit/SVG, definition/instance/nested Component foundation, RasterAsset image placement/duplicate/transform/align, numeric crop, ellipse mask, per-placement opacity와 제한된 board SVG가 있다. SVG path-node/import, compound operations, gradient/blend, component overrides, direct crop handles, pixel adjustments·retouch·PNG/PDF composite export, 타임라인, prototype links, slide model, GIF/PPT export는 미구현이다. CAD의 모든 세부 기능이 기존 상용 CAD 수준으로 완성된 상태도 아니다. 이 문서는 계획을 구현 완료로 표시하지 않으며, 각 단계를 실제 코드와 브라우저 검증이 끝난 뒤 상태 문서에 옮긴다.
