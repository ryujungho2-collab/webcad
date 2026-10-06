# G3-1 이미지 자산 vertical slice (단계 기록)

실행일: 2026-10-05. G3-1 시점의 구현 기록이며 현재 이미지 기능 상태를 단독으로 나타내지 않는다. 이후 placement 복제/변환/align, ellipse mask, opacity는 [G3-2..4a 누적 구현](G3-2-4-IMAGE-EDITING-2026-10-05.md), 최신 검수는 [G3-2..4a 검수](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다. 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md), 전체 현황은 [PROJECT-STATE](../../PROJECT-STATE.md)가 소유한다.

## 완료한 사용자 workflow

File 메뉴에서 PNG/JPEG/WebP 파일을 가져와 현재 작업면 또는 활성 작업면과 맞는 artboard 중앙에 놓고 캔버스에서 선택한다. Properties에서 크기를 수치로 바꾸고 crop을 비율로 검토한다. Review/Apply는 detached command plan을 적용하며 Cancel/잘못된 값은 원본 문서를 바꾸지 않는다. 성공한 배치나 편집은 기존 History에서 한 번 Undo/Redo할 수 있다. 활성 artboard SVG 출력은 raster 원본을 embed하고 crop clip을 적용한다. JSON v8은 source와 배치를 함께 저장한다.

## 문서 및 source 모델

- `CadRasterAsset`은 source의 SHA-256 content identity, mime, 원본 크기, byte count, data URL을 저장한다. Crop은 원본을 자르지 않는다.
- `CadImageNode`는 asset ID, XY/XZ/YZ 작업면, frame width/height, normalized crop을 가진다. Object transform과 공통 selection은 기존 document 구조를 사용한다.
- 동일한 source를 같은 문서에 다시 놓으면 asset bytes를 공유하고 placement ID·transform은 별개다. 삭제는 source를 참조하는 마지막 placement가 사라진 뒤에만 asset을 회수한다.
- 저장 형식은 raster asset/image node가 필요한 경우 v8이다. v1–v7 deserialize를 유지하며, 새 의미가 없는 문서는 기존 필요한 포맷 버전을 사용한다.
- Recovery는 current/backup checkpoint 본문에서 source를 중복 base64 저장하지 않고 content-addressed 별도 key에서 불러온다. Portable JSON 파일은 이미지 source를 포함한 self-contained 문서다.

## 입력 및 경계

- MIME: PNG/JPEG/WebP. File header와 browser decode를 함께 검사한다.
- 원본: 최대 3 MiB/source 및 문서 전체 raster bytes, 최대 16 megapixels, 한 축 8192 pixels.
- document command는 asset identity 충돌, 잘못된 crop, 잠긴 대상/layer, 편집 시 숨겨진 image/layer, 누락된 source, 총량 초과를 적용 전에 거부한다.
- SVG output은 active artboard 영역에서 source를 embed하고 board 및 image crop을 clip한다. 현재 plane에 표현할 수 없는 기울어진 image placement는 왜곡해 내보내지 않고 오류로 거부한다.
- Recovery가 한 source를 current/backup 본문에 중복하지 않아도 개별 source가 localStorage의 별도 key를 차지한다. base64 overhead, 다른 복구 데이터와 브라우저별 저장 한도를 고려한 durable asset store는 후속 작업이다.

## 구현 위치

- 문서 계약·검증·v8: `packages/cad-document/src/RasterAsset.ts`, `ImageNode.ts`, `FeatureContract.ts`, `serialization.ts`
- 공개 command와 atomic handler: `packages/cad-commands/src/commands.ts`, `apps/web/src/state/imageCommands.ts`, `commandBus.ts`
- File UI/inspect/review: `apps/web/src/App.tsx`, `app/AppShell.tsx`, `menu/MenuBar.tsx`, `properties/ImageInspector.tsx`
- canvas/render/bounds/export: `apps/web/src/viewport/imageRenderer.ts`, `precision/worldBounds.ts`, `export/exportModel.ts`, `export/svgWriter.ts`
- recovery와 회귀: `apps/web/src/state/documentRecovery.ts`, `apps/web/tests/imageWorkflow.test.ts`, `imageWorkflow.browser.tsx`

## G3-1 시점의 다음 경계

G3-1 종료 때는 crop bounds 수치 입력까지만 제공했다. 그 다음 G3-2..4a에서 duplicate/transform/align, ellipse mask, placement opacity를, G3-3b에서 canvas crop handles를 추가했다. 현재 남은 구현은 blend, pixel adjustment stack, PNG/PDF raster export, brush/retouch, clipboard/drop, GIF, image-backed component overrides, linked external files, large-image tiles/cache, LLM edit proposals다. 각 후속은 독립 Node/browser workflow로 검증한다. 최신 경계는 [G3 이미지 편집 누적 기록](G3-2-4-IMAGE-EDITING-2026-10-05.md)과 [최신 검수](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다.

기능 결과와 실제 검수 수치: [G3-1 image workflow verification](../verification/G3-1-IMAGE-WORKFLOW-2026-10-05.md).
