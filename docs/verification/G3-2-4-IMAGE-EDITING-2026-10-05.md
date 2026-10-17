# G3 이미지 배치·마스크·crop·색 조정·Artboard PNG/PDF 검수

> **현재 기능 설명:** [이미지와 장면](../features/IMAGES-SCENES.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

실행일: 2026-10-05. 범위: G3-2 placement duplicate/transform/align, G3-3a ellipse mask, G3-3b canvas crop handles, G3-4a opacity, G3-4b1 color adjustment, G3-4b2 artboard PNG, G3-4b3 artboard PDF composition. G3-1 최초 slice 검수와 구분한다. 최신 전체 상태는 [PROJECT-STATE](../../PROJECT-STATE.md), 실제 동작 경계는 [구현 기록](../implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md)을 따른다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| `pnpm --filter @agent-webcad/web exec tsc -b` | 통과 |
| `pnpm --filter @agent-webcad/web test` | 587 tests / 54 suites 통과, 실패·skip 0 |
| `pnpm --filter @agent-webcad/web test:browser -- --page=imageWorkflow` | 38 UI/Worker checks 통과 |
| `pnpm --filter @agent-webcad/web test:browser -- --page=dependencyWorkflow` | 9 UI/Worker checks 통과 |
| `pnpm --filter @agent-webcad/web test:browser` | 28 workflows / 602 UI·Worker checks 통과; imageWorkflow 38, artboardPngWorkflow 25, artboardPdfWorkflow 21, interactionRelations 17 |
| `pnpm --filter @agent-webcad/web check:architecture` | 274 modules, boundary/import/document links 통과 |
| `pnpm build` | 전체 workspace 통과; minified main 978.31 kB, viewport 606.66 kB, >500 kB warning |

이미지 Node 검사는 원본 asset과 placement identity 분리, source 공유/정리, transform/Align, crop handle geometry/clamp, sRGB adjustment 수학과 셰이더 uniform, output size/memory bounds, ordered SVG scene/pixel-size contract, mask/opacity/color의 detached preview, v9/v10/v11 저장·재로드와 낮은 버전 위장 거부, SVG mask/alpha/color filter, Undo/Redo와 원자 실패를 확인한다. PDF writer/plan 검사는 page order/size, raster image object, binary xref offsets, invalid page input, page/pixel/memory/file budget rejection을 확인한다. Browser `imageWorkflow`는 PNG import → size/numeric crop → 실제 crop handle pointer drag → aspect lock → duplicate/transform/Align → mask/opacity/color preview → Apply/Cancel → SVG export → recovery/save/reload을 수행한다. 색 편집에서는 3개 number field 입력이 slider와 동기화되고, invalid 수정 후 실제 canvas screenshot의 24×24 pixel sample에서 preview 전후 최대 채널 차이 26.6을 확인한다. 저장 document는 preview 중 그대로이며 Apply는 한 history entry다. crop Apply 직전 mode를 끄면 effect cleanup이 reviewed plan을 버리는 회귀도 고쳤고, 성공 적용 후 mode를 종료한다. Browser `artboardPngWorkflow`는 보드 UI → 출력 scale → detached preview → invalid scale 수정 → 투명 배경 → download → 실제 PNG decode/pixel/alpha 확인을 수행한다.

`artboardPdfWorkflow` 21 checks는 서로 크기·방향이 다른 두 보드의 active/all-visible scope, page order와 72/96/150/300 DPI, 300DPI에서 예산을 넘는 보드를 차단하고 150DPI로 수정, detached page preview, 실제 2-page PDF download와 PDF object parsing을 검증한다. Browser 측 PDF parser는 page count·MediaBox를 검사하고 포함된 JPEG를 디코드해 board background, masked image, vector shape, white alpha flattening을 비교한다. Cancel 및 preview/render 후 document/history는 그대로다. 별도 Poppler `pdfinfo`에서 2 pages, 첫 page 72×72 pt, 둘째 page 1190.55×841.89 pt(A3 방향)로 확인했다. `pdftoppm`으로 두 page를 다시 렌더해 시각적으로 확인했다.

## Browser timing sample

Fixture: browser가 생성한 128×128 PNG 한 장, 전체 browser suite의 `imageWorkflow`에서 한 번 측정. 입력→ready/apply 관측값에는 native 입력 전달, 테스트 polling/settling, 같은 workflow의 브라우저 간 부하가 포함될 수 있다. p50/p95 또는 production profiling이 아니다.

| Phase | Observed |
| --- | ---: |
| source bytes / pixels / decoded RGBA estimate | 1,396 B / 16,384 px / 65,536 B |
| import / decode feedback | 9.1 ms / 0.7 ms |
| numeric crop preview / Apply | 125.7 ms / 183.1 ms |
| canvas crop drag→preview / Apply | 155.3 ms / 133.4 ms |
| color inputs→preview / Apply | 633.5 ms / 133.7 ms |
| color sample maximum RGB delta | 26.6 (24×24 sample, rendered canvas screenshot) |
| duplicate / exact transform sequence / Align | 163.9 ms / 433.0 ms / 137.2 ms |
| ellipse mask preview / Apply | 92.0 ms / 139.5 ms |
| opacity preview / Apply | 123.2 ms / 144.1 ms |
| artboard SVG generation / output | 1.0 ms / 5,101 B |

## Artboard PNG timing sample

전체 browser runner의 `artboardPngWorkflow`에서 Chromium/OffscreenCanvas를 한 번씩 측정했다. 이는 p50/p95 또는 실제 heap/VRAM peak가 아니며, memory 수치는 output RGBA/canvas buffers와 고유 source decode를 보수적으로 계산한 estimate다.

| Fixture | Output | Decode | Worker render | Preview feedback | PNG bytes | Estimated working memory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 96×96, 9,216 px | 6.8 ms | 22.3 ms | 173.5 ms | 1,832 B | 110,656 B |
| medium | 794×561, 445,434 px | 9.0 ms | 27.8 ms | 186.3 ms | 12,433 B | 5,345,272 B |

중형 workflow의 전체 첫 테스트 진입→export/cancel 완료는 374 ms, 소형의 전체 scenario는 2,030 ms였다. 이 end-to-end 값은 입력 전달·검증·cancel/reopen/export을 포함하며 순수 render 시간으로 해석하면 안 된다. Worker 내부 PNG 인코딩만 분리 측정한 값도 아니다. Browser test는 실제 내려받은 PNG를 다시 decode해 중앙 채움색, overlay ordering, 배경 색, crop/mask로 제거된 pixel의 alpha 및 투명 배경을 비교했다.

## Artboard PDF timing sample

전체 browser suite `artboardPdfWorkflow`에서 서로 다른 보드 2개를 한 번 출력해 측정했다. 시간은 반복 표본이 아니며 memory는 retained heap이나 VRAM 실측값이 아니라 계획 단계의 conservative estimate다.

| Fixture | 결과 | 관측 |
| --- | ---: | ---: |
| pages / PDF bytes | 2 / 32,796 B | 실제 브라우저 다운로드 후 page/object decode |
| aggregate raster | 4,372,420 pixels | 150 DPI; page-specific MediaBox |
| SVG decode → ImageBitmap | 42.7 ms | browser decode stage |
| Worker JPEG page render | 96.9 ms | 두 page sequential render 관측 |
| 전체 preview/render 완료 | 178.6 ms | UI/Worker workflow 단일 관측 |
| conservative estimated working memory | 86,822,200 B | actual heap/VRAM peak 아님 |

PDF page별 scene을 full-page JPEG quality 0.94, sRGB로 평탄화하며 alpha는 흰 배경에 합성한다. 페이지 물리 크기는 보드 mm를 point로 변환한 MediaBox다. 독립 Poppler 도구에서 다운로드 PDF를 열어 page count·dimensions 확인 및 raster preview를 생성했다. PDF writer/package dependency는 추가하지 않았다.

Mask, opacity, crop, adjustment 입력/Apply는 browser workflow에서 end-to-end 검사하고 timing은 단 한 번 관측했다. Color preview pixel delta는 실제 WebGL canvas 화면에서 얻었으나 reference color-management suite는 아니다. 반복 표본, 대형 raster/document, JS heap/VRAM profiling, 실제 PNG/PDF export memory, 외부 실무자 작업 시간·재시도 평가는 수행하지 않았다. RGBA 값은 width×height×4 추정치이며 실제 retained memory 측정값이 아니다.

## Build and open limits

Production bundle은 minified main 978.31 kB와 viewport 606.66 kB 두 chunk가 500 kB를 넘어 경고한다. OpenCascade WASM은 raw 50,305.13 kB / gzip 13,955.45 kB다. 새 PDF encoder도 dependency 없이 기존 worker/export code로 구현했다. Source import 제한은 source/document당 3 MiB, 16 megapixels, 한 축 8192 pixels다. PNG output은 0.1×..16×, 한 축 8192, 16M total pixels, 160 MiB estimated working budget 안에서만 생성한다. PDF는 최대 32 pages, 16M aggregate pixels, 8192 px/page-axis, 256 MiB conservative estimated working-memory, 128 MiB estimated-file budget을 검사한다. Estimated file/memory는 실제 결과나 heap peak의 정확한 측정값이 아니므로 검증과 사용자 사전 안내용 한계다. Recovery는 source bytes를 current/backup checkpoint JSON에서 분리했지만 브라우저 localStorage quota는 남는다. PDF는 page마다 한 장의 lossy JPEG raster image라 vector/text editing 정보를 유지하지 않는다. unsupported dimension/text/infinite-line/ray/point geometry는 전체 export를 거부한다. 대형 이미지 프로파일, 실제 heap/VRAM, 실무자 task-time/retry와 외부 사용자 평가는 다음 과제다.
