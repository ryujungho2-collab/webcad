# G3 이미지 placement·mask·opacity·crop·색 조정·Artboard 출력

> **현재 기능 설명:** [이미지와 장면](../features/IMAGES-SCENES.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

갱신일: 2026-10-06. G3-2 placement, G3-3a ellipse mask, G3-3b canvas crop handles, G3-4a opacity, G3-4b1 color adjustments, G3-4b2 PNG, G3-4b3 PDF와 I1 원본 교체를 구현·검증했다. G3-5 자원 수정의 전체 자동 회귀도 마감했다. 이전 단계 검수는 [이미지 편집 검수](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md), 최신 원본 교체/전체 결과는 [I1 검수](../verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md)를 따른다. 실제 사용자·native GPU 평가는 남으며 [NEXT-STEPS](../../NEXT-STEPS.md)가 실행 순서를 소유한다.

## 사용자 workflow와 구현 범위

- 이미지 placement는 기존 객체 selection/transform/duplicate/history 경로에 참여한다. 복제는 content-addressed RasterAsset 원본을 공유하고 새 object/feature identity와 독립 transform을 갖는다. 공통 Align은 이미지 frame의 transformed bounds를 사용한다.
- Image Inspector에서 Keep aspect ratio를 켜면 가로·세로 정밀 입력이 현재 비율을 유지한다. 크기, crop, mask, opacity, color adjustment는 detached `update-image` preview plan으로 검토하고 Apply/Cancel한다. 잘못된 값과 Cancel은 저장 문서/History를 바꾸지 않는다.
- Mask는 현재 Rectangle 또는 Ellipse다. Ellipse는 원본 픽셀을 자르지 않고 viewport geometry와 SVG clip path로 표시한다. Crop은 mask보다 먼저 적용되며 mask 안에서 source crop을 유지한다.
- Opacity는 image placement별 `0..1` 값이다. Canvas material은 원본 texture를 유지하면서 alpha blending하고, artboard SVG는 `<image opacity="…">`를 쓴다. 기본값은 완전 불투명이다.
- Direct crop mode는 원본 전체와 현재 crop boundary를 캔버스에 겹쳐 표시하고 edge/corner 8개를 드래그하게 한다. Inspector의 수치 crop과 동일한 normalized crop draft 및 `update-image` reviewed plan을 사용한다. 핸들 위치는 normalized crop geometry와 렌더된 이미지 변환으로 계산하며 최소 한 source pixel이 남도록 제한한다. 편집 시작 시 placement work plane의 2D orthographic view로 전환하고 선택 이미지를 맞춘다.
- Canvas crop pointer preview는 saved document와 History를 변경하지 않는다. Cancel은 draft만 취소한다. Apply는 reviewed plan을 한 번 적용하며 plan을 먼저 무효화하지 않도록 성공 이후 crop mode를 종료한다. source bytes, image frame, mask, opacity, placement identity를 유지하고 crop만 기록한다. Undo/Redo와 board SVG export는 적용 crop을 소비한다.
- Color adjustment는 image placement의 brightness/contrast/saturation 세 값이다. 각 범위는 `-100..100`, 기본값 `0`이며 canvas shader와 SVG filter 모두 sRGB에서 brightness → contrast → saturation 순서로 적용한다. Saturation은 Rec.709 luminance `0.2126/0.7152/0.0722`를 사용한다. Number와 range slider는 동일한 draft를 변경한다. 복제 배치마다 값은 독립되고 `RasterAsset` source bytes는 바뀌지 않는다.
- Portable save는 embedded RasterAsset bytes를 self-contained로 보존한다. 필요한 기능 버전은 asset/image v8, ellipse mask v9, non-default image opacity v10, non-default color adjustments v11이다. 의미 있는 새 필드를 더 낮은 버전인 것처럼 저장하지 않으며 deserializer는 이를 거부한다.

## 원본·배치·출력 계약

`RasterAsset`은 원본 byte identity다. `ImageNode`의 frame, transform, crop, mask, opacity, adjustments는 문서 배치 속성이다. Duplicate와 placement edit는 source pixels를 덮어쓰지 않는다. 공통 객체 삭제 정책으로 마지막 placement가 사라질 때만 source가 회수된다.

Image edit review는 현재 입력 draft와 reviewed plan key를 연결한다. Preview는 saved document를 변경하지 않고 Apply는 검토된 command plan 하나를 적용한다. SVG output은 artboard clip, crop clip, ellipse mask, opacity 및 같은 값의 SVG color filter를 결합한다. Board PNG/PDF output은 동일한 export model의 순서 있는 vector/raster scene을 immutable detached scene으로 구성한다. PNG는 pixel-size SVG를 decode해 ImageBitmap으로 바꾼 뒤 Worker `OffscreenCanvas`에서 alpha-preserving PNG로 rasterize한다. PDF는 페이지별 계획대로 Worker에서 JPEG로 렌더하고 내부 writer로 multi-page PDF를 생성한다. Working color space는 sRGB다. Preview는 document/History를 건드리지 않고 모든 page/image가 준비된 결과만 Download할 수 있다. Planar scene semantics로 표현할 수 없는 기울어진 배치와 지원하지 않는 drafting geometry는 누락 없이 전체 export를 거부한다.

## G3-4b3 Artboard PDF

- File 메뉴에서 활성 보드 한 장 또는 현재 visible board 전체를 선택한다. 전체 보드는 문서 순서를 따르고 보드마다 PDF 한 페이지를 만든다. 72/96/150/300 DPI로 렌더하며 페이지 MediaBox는 보드의 정확한 mm 크기와 orientation을 사용한다. 종이 규격에 맞춰 보드 크기를 바꾸거나 여백을 추가하지 않는다.
- 계획 단계에서 페이지 수·이름·물리 크기·방향·pixel dimensions/count·예상 출력/작업 메모리를 보여준다. 최대 32 pages, aggregate 16M pixels, page axis 8192 px, 보수적 256 MiB estimated working memory, 128 MiB estimated file limit을 넘으면 preview/allocation/download 전에 막는다. 이는 브라우저 heap/VRAM peak 실측이 아닌 보수적 estimate다.
- PDF scene은 기존 board SVG export model이 만든 detached, ordered vector/raster composition을 재사용한다. 보드 배경과 board clip·crop·rectangle/ellipse mask·opacity·brightness/contrast/saturation 및 vector/raster stacking order를 유지한다. PDF page transparency가 없으므로 투명한 pixel은 흰색에 합성하고 지정된 board background는 유지한다. Color output은 sRGB다.
- Renderer는 SVG를 browser context에서 decode해 ImageBitmap으로 만들고 페이지마다 Worker `OffscreenCanvas`에서 JPEG quality 0.94로 변환한다. PDF는 내부 `encodePdfRasterPages` writer로 생성하며 외부 PDF dependency는 추가하지 않았다. 각 페이지는 하나의 full-page DCT/JPEG raster image다. 출력은 편집 가능한/vector PDF가 아니며 text·dimension·infinite line·ray·independent point를 보존하지 않는다.
- unsupported drawing, missing asset, tilted/unsupported placement, 범위 초과가 있으면 모든 페이지를 거부하고 보드 이름/원인과 해결 단서를 표시한다. 문서는 detached plan/render를 사용하며 preview·Cancel은 document/History를 변경하지 않는다. 모든 페이지가 완료되고 현재 plan과 일치할 때만 단일 PDF download가 가능하다.

PNG output은 96 dpi baseline의 보드 mm를 지정 scale로 픽셀화한다. scale은 0.1×..16×이며 한 축 8192 px, 전체 16M px, 보수적 160 MiB working-memory budget 중 먼저 닿는 제한에서 차단한다. estimate는 output RGBA/canvas buffers(픽셀당 12 bytes)와 고유 source RGBA decode(4 bytes/source pixel, data URL identity 중복 제거)를 합산한다. 이는 실제 browser heap/VRAM peak가 아닌 사전 위험 추정이다. Artboard background는 기본으로 불투명하게 출력하고 선택적으로 투명하게 한다. z-order는 `rootObjects`의 원래 document 순서다. SVG generator에서 board clip, image crop, rectangle/ellipse mask, placement opacity와 brightness/contrast/saturation을 적용한다.

## 구현 위치

- image model, validation, serialization: `packages/cad-document/src/ImageNode.ts`, `serialization.ts`
- command payload/handler: `packages/cad-commands/src/commands.ts`, `apps/web/src/state/imageCommands.ts`
- inspector review, aspect lock, crop/mask/opacity/color preview: `apps/web/src/properties/ImageInspector.tsx`
- crop handle projection/math, canvas asset render/mask/alpha/color shader: `apps/web/src/viewport/ImageCropHandles.tsx`, `imageCropGeometry.ts`, `imageRenderer.ts`, `CadViewport.tsx`
- transformed bounds, placement export, SVG crop/clip/opacity/filter: `apps/web/src/precision/worldBounds.ts`, `apps/web/src/export/exportModel.ts`, `svgWriter.ts`
- board PNG output model, size/memory bounds and SVG scene contract: `apps/web/src/export/artboardPng.ts`, `svgWriter.ts`, `exportModel.ts`
- detached SVG decode, transferable bitmap, OffscreenCanvas Worker and preview/download UI: `artboardPngRenderer.ts`, `artboardPng.worker.ts`, `ArtboardPngDialog.tsx`
- PDF page planning and budget guards: `apps/web/src/export/artboardPdf.ts`; raster PDF writer: `apps/web/src/plot/pdfWriter.ts`; shared JPEG/PNG worker and PDF UI: `artboardPngRenderer.ts`, `artboardPng.worker.ts`, `ArtboardPdfDialog.tsx`
- regression workflows: `apps/web/tests/imageWorkflow.test.ts`, `artboardPdf.test.ts`, `plot.test.ts`, `imageWorkflow.browser.tsx`, `artboardPngWorkflow.browser.tsx`, `artboardPdfWorkflow.browser.tsx`; browser runner registration: `apps/web/scripts/browserChecks.mjs`

## 다음 slice와 남은 경계

2026-10-06 I1은 선택한 ImageNode의 원본 교체를 추가했다. 파일 import와 교체는 `interop/rasterImport.ts`를 공유하며 PNG/JPEG/WebP와 제한된 TIFF를 처리한다. `replace-image-source`는 기존 object/feature/geometry/transform과 crop/mask/opacity/color를 유지한다. 공유 source의 다른 배치는 보존하고 마지막 참조를 잃은 이전 asset만 제거한다. source 교체와 숫자 편집을 같은 detached batch preview/Apply로 한 Undo에 적용한다. canvas preview는 source lease를 바꾸고 Cancel에서 복원하며 원본 문서에 임시 asset을 저장하지 않는다. Scene은 기존 source object ID를 계속 참조하고 기존 export/recovery/JSON 경로를 사용한다. 실제 범위·계획과 검수는 [재사용·구현 계획](../product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md) 및 PROJECT-STATE를 따른다.

G3-4b1은 placement별 brightness/contrast/saturation adjustment model, 범위와 적용 순서, detached Review/Apply/Cancel·History·v11 save/reload·canvas preview·SVG filter를 연결했다. G3-4b2는 현재 artboard SVG export model로 crop/mask/opacity/color adjustment와 drawing/vector/raster content의 PNG composition을 제공한다. G3-4b3은 active/all-visible page별 PDF를 만들며 board mm MediaBox와 선택 DPI를 사용하고 raster alpha/color/size semantics를 명시한다. 작은 fixture의 actual PDF page count·MediaBox·pixels를 browser 및 독립 PDF reader로 확인한다. 미구현 경계는 blend modes, vector-preserving PDF, brush/retouch, clipboard/drop, GIF/timeline, linked external files, tile/thumbnail cache와 대형 자원 eviction이다.

아직 미구현: blend modes, vector-preserving PDF, brush/retouch, clipboard/drop, GIF/timeline, linked external files, tile/thumbnail cache와 대형 자원 eviction. PDF/PNG output은 현재 소유 geometry semantics만 rasterize한다. 3 MiB source 제한은 사용성 충분성이나 대형 파일 성능을 입증하지 않으며 늘리기 전에 real large-image workflow와 storage/render resource를 측정한다. Open-source image editor를 core dependency로 추가하지 않는다.
