# 오픈소스 제작 기능 조사와 도입 결정

갱신일: 2026-10-06. Photopea 선택 연동 후보를 추가 조사했다. 아래 기존 오픈소스 후보와 상용/호스팅 편집기를 구분한다.

재사용할 코드와 제품에서 구현할 기능의 구분, G3/G4/G5 및 CAD 계획에 합친 실행 순서는 [통합 재사용·구현 계획](../product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md)이 소유한다. 이번 native 이미지 원본 교체는 외부 앱 없이 기존 Command/Review/History를 사용한다.

상태: 아래 제작 라이브러리는 조사 후보이고, Photopea의 MIT `UTIF.js`만 TIFF import adapter로 실제 설치·검증했다. 나머지 어댑터 타입과 패키지 도식은 목표 설계다. 현재 실행 파일 위치는 [CHANGE-GUIDE](CHANGE-GUIDE.md)를 따른다.

실제 시점은 [최종 기획 G0–G6](../IMPLEMENTATION-READINESS-2026-10-05.md)에 맞춘다. G0 실행·아트보드 검증과 G1 CAD 경험을 우선한다. Vector Style은 G2, 발표·움짤 출력은 G4의 모델 이후에 검토한다. 아래 도입 판단은 후보 평가이며 검증 전에 설치·채택이 확정됐다는 뜻이 아니다.

## 결론

WebCAD의 CAD 문서·dependency graph·solver를 외부 앱의 문서 모델로 교체하지 않는다. 외부 프로젝트는 다음 경계에서 선택적으로 사용한다.

| 후보 | 라이선스/강점 | WebCAD 도입 판단 |
| --- | --- | --- |
| [SVG-Edit / @svgedit/svgcanvas](https://github.com/SVG-Edit/svgedit) | MIT. 브라우저 SVG 편집기와 재사용 가능한 SVG canvas를 제공한다. | Vector Style 단계에서 SVG authoring/import/export 어댑터 후보. 전체 UI를 임베드하지 않고 CommandBus로 변환한다. |
| [Paper.js](https://github.com/paperjs/paper.js) | MIT. Canvas 기반 벡터 path와 Boolean/Bezier 스크립팅에 강하다. | 자유곡선·일러스트용 보조 해석 계층 후보. CAD solver의 원본 geometry를 대체하지 않는다. |
| [Fabric.js](https://github.com/fabricjs/fabric.js) | MIT. Canvas object interaction과 SVG 변환이 성숙했다. | 임시 편집/미리보기 후보. 별도 object graph가 문서 원본이 되지 않도록 제한한다. |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | MIT. 프레임·도형·이미지·PNG/SVG·JSON·협업이 있는 화이트보드다. | 빠른 와이어프레임 참고 또는 별도 import 경계에 적합. 정밀 CAD 캔버스의 기본 편집기로 사용하지 않는다. |
| [Motion Canvas](https://github.com/motion-canvas/motion-canvas) | MIT. TypeScript 기반 벡터 애니메이션 라이브러리와 실시간 preview editor다. | Timeline/animation 모델을 검토하고 player/export 계층 후보로 사용한다. 전체 monorepo를 초기 의존성으로 넣지 않는다. |
| [reveal.js](https://revealjs.com/) | 오픈소스 HTML 발표 프레임워크. auto-animate, PDF export, 발표자 노트를 제공한다. | Presentation mode와 브라우저 발표 런타임에 도입한다. CAD 문서 모델은 유지한다. |
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS) | MIT. 브라우저·React·Node에서 PPTX를 생성한다. | Slide 모델이 생긴 뒤 PPTX export 어댑터로 도입한다. 지원되지 않는 효과는 이미지/동영상으로 명시적 대체한다. |
| [Penpot](https://github.com/penpot/penpot) | MPL-2.0. 컴포넌트·variant·prototype·design token·협업이 풍부하다. | 전체 플랫폼을 임베드하거나 복사하지 않는다. Scene/Component/Prototype 요구사항의 참고 구현으로 조사한다. |

이미지 편집은 외부 디자인 앱의 문서 모델을 가져오는 대신 WebCAD의 `RasterAsset` 계약을 먼저 만든다. 브라우저 디코딩·thumbnail·canvas composite는 플랫폼 API와 작은 worker adapter로 시작하고, 고급 retouch나 AI segmentation은 독립 worker로 격리한다.

## Photopea — 선택적 고급 이미지 편집기 후보

2026-10-06 공식 자료를 확인했다. 조사 대상은 **photopea.com**이다. 사용자 언급 `photopia.com`은 이 조사에서 접근되지 않았고 같은 서비스인지 확인되지 않았다. Photopea 전체 편집기 설치·연동·구매는 실행하지 않았다. 공개 MIT 디코더만 별도로 채택했다.

| 방식 | 확인한 제공 범위 | WebCAD 판단 |
| --- | --- | --- |
| 편집기 전체 소스 이식 | [공식 저장소](https://github.com/photopea/photopea)는 편집기가 완전한 오픈소스가 아니며 issue/discussion 용도라고 명시 | 공개 repo를 clone해 전체 엔진을 소유할 수 있는 후보로 분류하지 않음 |
| hosted iframe/API | [API](https://www.photopea.com/api/)는 무료 embedding, [Live Messaging](https://www.photopea.com/api/live)은 binary 파일·script 전달과 결과 회수 제공 | 기존 WebCAD UI에서 선택 이미지를 외부 편집 세션으로 여는 adapter 후보. CAD kernel·문서·History의 필수 의존성으로 만들지 않음 |
| white-label/self-host | [Accounts](https://www.photopea.com/api/accounts)에 유료 Distributor와 self-host 계약 안내. 조회 당시 self-host는 월 $500–$2,000, 12개월 선납·1년 사용 패키지로 표시 | self-host도 소스 자유 수정/재배포 권한과 동일하지 않음. 실제 계약·가격·대상 사용자 조건 확인은 도입 시 별도. 지금 결제하지 않음 |
| 개별 공개 라이브러리 | [UPNG.js](https://github.com/photopea/UPNG.js)는 MIT의 PNG/APNG codec | 편집기 전체와 별개 후보. 플랫폼 PNG 경로보다 필요한 성능/포맷 이점이 검증될 때 adapter로 평가 |
| 채택한 공개 라이브러리 | [UTIF.js 3.1.0](https://github.com/photopea/UTIF.js)는 MIT의 TIFF decoder | TIFF 파일을 별도 Worker에서 8-bit PNG로 변환하는 import 전용 adapter. WebCAD의 문서·편집·History는 자체 구현을 유지 |

### 실제 도입: 제한된 TIFF 가져오기

`apps/web/src/integrations/photopea/tiffImport.ts`가 헤더·IFD·단일 페이지·4M pixel/8192px·3 MiB 입력 한도를 먼저 검사한다. `tiffDecode.worker.ts`가 UTIF를 지연 로드하고 8-bit 채널, RGB/gray/palette, uncompressed/LZW/Deflate/PackBits와 파일 내부 strip 범위를 확인한 뒤 PNG로 변환한다. 10초가 지나면 Worker를 종료한다. 변환된 PNG가 3 MiB를 넘으면 문서 명령 전에 거부한다. TIFF metadata, 다중 페이지, 고비트 심도, RAW/PSD layer 의미는 보존하지 않으며 가져오기 결과에 변환 손실을 표시한다.

이후에는 기존 `insert-image` → ImageNode crop/mask/color → Undo/Redo → JSON 저장 경로를 사용한다. 독립 TIFF 픽셀 fixture와 실제 브라우저 업로드/색상/오류/원자성/저장·이력 검사를 통과했다. 전체 Photopea 앱이나 hosted API는 아직 연결하지 않았다. [UTIF의 crafted TIFF 메모리 소진 보고](https://github.com/photopea/UTIF.js/issues/142)가 공개되어 있으므로 Worker와 입력·출력 상한을 두었지만, 악의적 TIFF 전체에 대한 보안 보증으로 간주하지 않는다. 해당 기능은 신뢰할 수 있는 파일을 대상으로 제공하고, 외부 사용자 업로드를 공개 서비스로 받기 전 보안 검토가 필요하다.

제안 UX: `WebCAD 이미지 선택 → 고급 이미지 편집 → Photopea 세션 → 결과 미리보기 → WebCAD Apply`. 이 흐름은 설계 제안이며 아직 구현·브라우저 검증하지 않았다. Photopea의 내부 레이어/History와 CAD topology/constraint/History가 자동으로 통합되는 것은 아니다.

도입 전에 별도 작은 실험에서 다음 경계를 검증한다.

1. 현재 선택 RasterAsset snapshot만 binary로 전달한다. 사용자가 요청하지 않은 cloud upload/AI 외부 서비스 호출은 adapter가 자동 실행하지 않는다. 일반 편집과 별도 네트워크 기능을 구별한다.
2. iframe의 정확한 origin과 source window를 검증하고, 편집 세션·asset hash·document revision을 매칭한다. API의 `done` 메시지 하나를 문서/요청 식별자로 간주하지 않는다. 임의 LLM JavaScript를 그대로 실행하지 않고 허용된 작업으로 script를 만든다.
3. 반환된 PNG 등의 bytes를 기존 MIME·크기·픽셀/메모리 한도로 다시 검사한다. native `replace-image-source`가 선택 placement에 새 asset을 연결하는 reviewed transaction을 제공한다. 공유 원본을 사용하는 다른 placement는 보존하고 마지막 참조를 잃은 원본은 현재 문서에서 해제한다. hosted 메시지 수신·검증 adapter는 아직 연결하지 않았다.
4. WebCAD Undo는 외부 세션의 확정 결과 전체를 되돌린다. Photopea의 세부 brush/filter 단계 Undo는 그 세션에 남는다. 각각을 한 이력으로 자동 합친다고 설명하지 않는다.
5. PSD 레이어를 계속 수정하려면 PSD 원본 asset 보존·재편집·용량 정책을 추가해야 한다. 현재 WebCAD가 PSD layer graph를 직접 편집할 수 있다는 의미가 아니다. PNG 반환으로 평탄화되는 레이어/텍스트/효과는 결과 검토에 표시한다.
6. source 삭제/문서 변경·Cancel·재요청·외부 서비스 중단 때 결과를 잘못 적용하지 않는다. adapter가 없어도 기존 CAD·이미지 크기/crop/mask/color·저장·출력이 동작해야 한다.

hosted 편집기의 첫 실험을 한다면 crop/mask 등 현재 기능을 대체하는 작업이 아니라 **선택한 이미지 한 장의 왕복과 실패 복구**에 한정한다. 도입 결정 전 기본 편집 지연·작업 전환·레이어 손실·광고/배포 조건을 함께 평가한다. MIT TIFF decoder 채택을 전체 Photopea 편집기 채택으로 올리지 않는다.

## 후보 실험의 선행 조건

1. **현재 즉시 추가하지 않는 것**: Penpot, Excalidraw, Motion Canvas 전체 앱. 각자 persistence/state/rendering을 가지므로 CAD 원본을 분리한다.
2. **Vector Style vertical slice**: SVG-Edit의 `@svgedit/svgcanvas` 또는 Paper.js 중 하나를 작은 실험 패키지로 검증한다. 실험 결과는 `CadCommand`와 style/geometry 변환을 거쳐야 문서에 반영한다.
3. **발표 출력**: Scene/Frame과 timeline이 먼저 생긴 뒤 reveal.js와 PptxGenJS를 각각 runtime/export adapter로 추가한다.
4. **움짤 출력**: timeline이 확정된 후 GIF/WebM encoder를 붙인다. GIF를 내부 애니메이션의 원본 포맷으로 삼지 않는다.

## 통합 금지선

- 외부 라이브러리의 scene graph를 `CadDocument` 대신 저장하지 않는다.
- SVG/Canvas에서 발생한 드래그를 별도 geometry mutation으로 직접 적용하지 않는다. 항상 `Command → Preview → Apply → History`로 변환한다.
- 외부 Boolean/curve 결과를 CAD solver가 이해하지 못하는 근사 geometry로 조용히 바꾸지 않는다.
- MPL/GPL 계열 코드를 복사해 현재 패키지에 섞지 않는다. Penpot은 실행 참조와 API 조사 대상으로만 둔다.
- 발표/PPT export가 지원하지 않는 CAD 구속·솔리드·애니메이션 의미를 이미지로 바꿀 때는 사용자에게 export 손실을 보여준다.

## 의존도 제어

외부 프로젝트를 핵심 문서·명령·솔버에서 직접 import하지 않는다. 각 통합은 다음 세 계층으로 격리한다.

```text
WebCAD canonical model
  ↓
Adapter contract (vector editor / timeline / presentation export)
  ↓
Optional external package
```

- 문서·명령·solver·topology·serialization 계약은 선택적 제작 라이브러리나 LLM SDK에 의존하지 않도록 한다. 현재 CAD 커널의 OpenCascade 의존은 별도 경계이며 제거 대상이라는 뜻은 아니다.
- 외부 패키지는 `apps/web/src/integrations/<name>` 아래에서만 import한다.
- 외부 객체를 저장하지 않고, WebCAD canonical model로 변환한 결과만 저장한다.
- 편집기 패키지는 lazy import하고, export 패키지는 해당 기능을 사용할 때만 로드한다.
- 각 어댑터에는 `capabilities`, `version`, `license`, `fallback`을 명시한다.
- 같은 contract를 만족하는 두 구현으로 교체할 수 있는 conformance test를 둔다.
- 외부 패키지가 사라져도 기존 CAD 파일 열기·편집·저장·Undo/Redo는 동작해야 한다.

따라서 reveal.js/PptxGenJS는 출력 플러그인으로 낮은 의존도를 유지하고, SVG-Edit/Paper.js는 제한된 실험 어댑터로만 도입한다. Penpot·Excalidraw·Motion Canvas 전체 애플리케이션은 런타임 의존성으로 가져오지 않는다.

## 패키지 의존 방향

아래는 목표 의존 구조다. 화살표는 아래 소비자가 위의 계약/서비스를 사용한다는 뜻이다. 핵심 계약은 브라우저·React·외부 편집기·LLM을 import하지 않도록 유지한다. 현재 Query/Plans와 solver는 웹 소스에 남아 있다.

```text
cad-document      cad-geometry      cad-kernel      cad-history
       ↑                ↑                 ↑              ↑
                cad-commands / query / plans
                              ↑
                 render/export contracts
                              ↑
       web workspace / canvas / copilot / external adapters
```

- `cad-document`: canonical data model, identity, serialization, validation
- `cad-geometry`/`cad-kernel`: analytic geometry, solver, topology, BRep/mesh 계산
- `cad-commands`: typed command, validation, result/diagnostic
- `query/plans`: selection context, detached preview, impact, atomic apply
- `render/export contracts`: geometry·style·image·scene을 표현하는 작은 내부 인터페이스
- `apps/web`: 통합 UI와 optional adapter를 조립하는 product shell

외부 라이브러리는 `apps/web/src/integrations` 또는 별도 `packages/*-adapter`에서만 참조한다. CAD core가 외부 패키지 타입을 노출하면 그 순간 optional dependency가 mandatory dependency로 변하므로, adapter 내부에서만 변환한다.

## 외부 기능 호출 계약

```ts
type CreativeAdapter<Input, Output> = {
  id: string;
  version: string;
  capabilities: string[];
  run(input: Input, signal?: AbortSignal): Promise<Output>;
  fallback?: (input: Input) => Output;
};
```

Adapter 입력은 immutable snapshot과 typed operation이고, 출력은 canonical command 또는 export bytes다. 외부 객체를 문서에 저장하지 않으며, 외부 편집기에서 발생한 selection/drag/history는 WebCAD interaction model로 다시 변환한다.

## 줄이는 방법과 남기는 비용

- 공통 geometry·selection·history·preview를 직접 소유해 기능별 라이브러리 중복을 줄인다.
- UI 전체를 가져오지 않고 알고리즘·parser·renderer·exporter 중 필요한 capability만 선택한다.
- optional dependency는 dynamic import와 capability check로 로드한다.
- 버전을 고정하고 adapter contract test와 license/SBOM 기록을 유지한다.
- 외부 패키지가 제거되어도 CAD 편집·저장·Undo/Redo는 계속 동작해야 한다.

이 구조는 외부 라이브러리 교체 비용을 낮추지만, adapter 작성·변환·conformance test라는 초기 비용이 생긴다. 이 비용은 CAD 문서와 UI가 특정 오픈소스에 잠기는 비용보다 작고, 장기적으로 기능별 교체와 성능 측정을 가능하게 한다.

## 검증 기준

첫 외부 라이브러리 실험은 다음을 통과해야 한다.

`CAD line/arc → artboard style → external editor preview → Command conversion → undo/redo → save/reload → SVG export`

객체 identity, 단위, 참조, 구속이 보존되지 않으면 해당 라이브러리는 WebCAD 문서 원본에 채택하지 않고 import/export 보조로만 제한한다.
