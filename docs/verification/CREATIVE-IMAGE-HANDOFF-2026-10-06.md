# 공개 코드 경계와 native 이미지 원본 교체 검수

2026-10-06. 재사용·직접 구현 범위의 소유 문서는 [통합 계획](../product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md)이다. 이번 구현은 기존 G3 자원 최적화/이미지 편집/출력과 I1 원본 교체를 연결한다. Photopea 전체 기능이나 PSD 레이어 편집 완료를 뜻하지 않는다.

## Before → 문제 → 변경

이전에는 PNG/JPEG/WebP 및 제한된 TIFF를 새 ImageNode로 삽입할 수 있었지만, 기존 배치의 원본을 바꾸려면 새 객체를 만들거나 문서 source를 직접 수정해야 했다. 이는 object/Scene 참조, crop·mask·color 편집과 공유 원본의 다른 배치를 잃거나 잘못 바꿀 수 있는 공백이었다. App 안의 디코더도 다음 입출력 기능이 재사용할 공통 경로가 아니었다.

`interop/rasterImport.ts`가 import와 replacement의 MIME/bytes·크기·해상도·SHA-256·TIFF→PNG 변환을 공유한다. TIFF는 MIT UTIF 전용 Worker에만 의존하고 abort/10초 timeout에서 terminate한다. PNG/JPEG/WebP의 native bitmap도 decode 후 닫고 취소 결과를 버린다. source decode 도중 문서 버전/selection/session 변경과 Cancel·새 파일 선택은 오래된 결과를 확정하지 않는다.

`replace-image-source`는 선택한 placement의 assetId만 바꾼다. object/geometry/feature ID, transform, width/height, crop/mask/opacity/color와 Scene source object ID를 보존한다. 공유 원본의 다른 배치를 바꾸지 않으며 마지막 참조를 잃은 원본만 현재 문서에서 제거한다. quota는 제거될 source를 제외한 교체 후 bytes로 판정한다. locked/hidden/missing/conflicting/over-budget/no-op은 문서와 History 불변으로 실패한다.

Inspector는 Current/Replacement thumbnail과 전환 손실을 보여 주고 캔버스 source도 transient texture lease로 바꾼다. Cancel은 이전 source를 다시 연결하고 임시 resource를 해제한다. 원본 교체와 정밀 width/crop/color 편집은 같은 authoritative Review/Apply의 batch로 한 Undo에 확정한다. asset 수량 변화가 common impact review에 포함된다. 일반 숫자 편집의 source 비교는 큰 data URL을 JSON 재직렬화하지 않는다.

## 실제 workflow와 증거

`File → Import image → Duplicate → Replace source → file selection → Current/Replacement + canvas preview → invalid width → Cancel → replace + 80mm → impact → Apply → SVG/source query → save/reload → Undo/Redo → TIFF replacement → Undo`

- 새 Node 3개: shared source·object/Scene identity, detached preview와 한 Undo/save/reload, quota·conflict·locked/hidden·stale 원자성, source+placement batch의 후속 실패 rollback.
- `imageSourceWorkflow`: 실제 pointer hit-test/file upload, preview 문서/History 불변, canvas lease 수, invalid numeric stale Apply 차단, Cancel 복원, source+width 한 Apply, 공유 원본 보존, save/export/Undo/Redo, no-op recovery, TIFF 결과 인계 **16 checks**.
- `tiffImportWorkflow`: TIFF pixels, canonical PNG asset, 변환 손실, 저장/이력, unsupported compression/multi-page atomicity와 Worker abort **10 checks**.
- `imageResources`: 기존 독립 UV/opacity·한 source 공유·재업로드 제거·마지막 해제와 취소·재개방 검사에 실제 replacement/cancel pixel 검사를 추가해 **34 checks**.
- 최신 전체 **599 Node / 54 suites / skip 0**, **33 browser workflows / 686 checks**, TypeScript·architecture/import/문서 링크 **294 modules**, workspace production build 통과. [Node](../../output/integrated-final-node-2026-10-06.log), [browser](../../output/integrated-final-browser-2026-10-06.log), [architecture](../../output/integrated-final-architecture-2026-10-06.log), [build](../../output/integrated-final-build-2026-10-06.log).
- 최초 전체 browser 실행은 PDF native input fetch 중 `TypeError: Failed to fetch`로 중단됐다. [실패 로그](../../output/integrated-browser-2026-10-06.log)를 보존하며 테스트를 완화하지 않은 단독 PDF 21개 및 최종 전체 통과와 구분한다. 최초 실패의 원인은 확정하지 않았으므로 runner 안정성의 재발 추적 과제로 남긴다.

## 측정과 남은 제한

[source-closeout resource 측정](../../output/benchmarks/g3-resources-source-closeout.json)은 이전 before/after 파일을 덮어쓰지 않는다. 4000×4000 공유 두 배치의 texture 수는 1, 9회 crop/opacity 편집의 upload-version 증가 합계는 0, RGBA 추정은 64,000,000 bytes였다. p95 0.3ms는 Edge/SwiftShader에서 9개의 warm resource render+gl.finish 관측이며 App 작업 시간·native GPU·heap/VRAM peak의 측정이 아니다. 해당 run은 다른 focused browser 검사와 병행되어 cold 시간 비교로 사용하지 않는다. G3-5의 원래 동일 fixture 전후 측정은 [기존 기록](G3-5-IMAGE-RESOURCES-2026-10-06.md)을 보존한다.

최종 전체 run의 [별도 resource JSON](../../output/benchmarks/g3-resources-integrated-final.json)도 texture 1·upload 증가 0을 유지했고 4000px warm p50 0.1ms/p95 0.2ms였다. source replacement 추가로 기존 공유·재업로드 방지 동작이 퇴행하지 않음을 확인한 수치다. 자체 포함 bytes 비교에서 data URL을 JSON 재직렬화하지 않도록 변경했지만 이 변경 단독의 속도 개선 비율은 측정하지 않았다.

source replacement 자체는 새 외부 패키지나 serialization version을 추가하지 않는다. 실제 교체 asset은 PNG/JPEG/WebP의 자체 포함 source다. TIFF는 3 MiB 입력/변환 output, 4M px, 8192px/축, 단일 페이지·8-bit/channel 및 제한된 strip/compression subset이고 metadata/고비트 심도/다중 페이지·RAW는 보존하지 않는다. 악의적 TIFF 전반의 보안 보증과 외부 사용자 업로드 보안 검토는 별도다.

기존 source bytes와 Undo snapshot의 retained heap·storage quota, source 교체의 대형 App input-to-paint, 실제 실무자 task time·재시도는 아직 측정하지 않았다. PNG/JPEG/WebP native decode는 AbortSignal로 결과를 버릴 수 있지만 브라우저의 진행 중 createImageBitmap 계산을 강제로 종료하는 API는 없다. brush·retouch·pixel mask·blend·PSD layer graph·GIF/PPTX는 후속 계획이며 UPNG/Typr/ag-psd/Paper/PptxGenJS를 설치한 상태가 아니다.
