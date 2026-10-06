# 아트보드 모델·캔버스·출력 구현 기록

갱신일: 2026-10-05

## 문서와 편집 경험

- `CadDocument.artboards`는 id, 이름, work plane, 전역 mm 원점, 양수 크기, background, visibility, lock을 저장한다. geometry는 복제하지 않는다.
- create/update/delete 명령과 직렬화 v7을 제공하고, 아트보드가 없는 기존 문서는 예전 버전으로 계속 저장한다.
- Artboards Explorer에서 목록·속성·활성 프레임을 다룬다. 속성 입력은 공통 PrecisionField 및 detached Review/Apply/Cancel을 사용하며 preview는 원본 문서와 History를 바꾸지 않는다.
- lock은 보드의 위치·크기·평면 변경과 삭제를 막는다. 이름·배경·visibility·lock metadata는 안전한 편집으로 분리하고 내부 도형의 visibility/layer lock 의미를 대체하지 않는다.
- 생성·삭제·Hide/Lock은 즉시 명령이며 각 성공이 한 Undo다. 속성 수정은 review를 거친 한 트랜잭션이다.

## G2-1 캔버스와 Fit

- 현재 보드 평면의 visible artboard frame과 배경을 viewport에 표시한다. XY/XZ/YZ 각각의 실제 공간 방향을 유지하고, 활성 프레임을 테두리 및 viewport 레이블로 구분한다.
- 빈 프레임 영역의 pointer hit-test로 활성 보드를 바꾼다. 실제 geometry가 같은 위치에 있으면 geometry 선택이 우선한다.
- 활성 보드/표시 보드 Fit을 캔버스 toolbar와 패널에서 실행한다. 2D에서 현재 work plane을 고정하고, 3D에서 mixed-plane 프레임 좌표를 그대로 사용한다.
- 숨긴 보드는 표시·Fit·내보내기에서 제외한다. 보드 plane은 캔버스상 도형 참조나 문서 geometry 위치를 변경하지 않는다.

## G2-2 보드별 SVG

- File 메뉴에서 활성 visible board를 별도 SVG로 저장한다. `viewBox`는 보드 mm origin/size와 정확히 일치하며, board background와 SVG clip path를 포함한다.
- 선분을 경계에 자르고, 닫힌 filled profile은 원래 채움 영역을 SVG clip path 안에서 유지한다. 잘린 열린 stroke fragment를 닫아 새 geometry를 만들지 않는다.
- drawing vector style 색·채움·opacity·선폭을 내보낸다. 기존 active-plane SVG export 경로도 유지한다.
- SVG board export는 현재 2D drawing 선/다중선/닫힌 profile 기준이다. Drafting text, images, masks, gradients와 blends는 SVG에서 미지원이다. 별도 PDF board raster export는 G3-4b3에서 추가했으며 범위와 손실 경계는 아래 PDF 절을 따른다. 무한선·반직선·독립점은 SVG로 축약해 내보내지 않는다.

## G3-4b2 보드별 PNG

- File 메뉴는 활성 visible board 이름을 포함한 별도 PNG export를 제공한다. Preview에서 output scale, 정확한 pixel dimensions/count, 예상 working memory와 background transparency를 확인한 뒤 download한다.
- PNG scene은 보드 배경·bounds, visible coplanar vector drawing과 raster placement를 문서 root order로 합성한다. Crop, rectangular/ellipse mask, opacity, brightness/contrast/saturation를 SVG scene 생성 단계에 반영하고 export는 artboard 경계로 자른다.
- Render는 immutable detached scene에서 생성한다. SVG decode 뒤 `ImageBitmap`을 Worker로 이전하고 `OffscreenCanvas`에서 PNG Blob을 만든다. Preview/Cancel/invalid scale은 document와 History를 변경하지 않는다. Preview key가 현재 scale/transparency와 다르면 Download를 비활성화한다.
- 입력 범위는 0.1×..16×, 최대 8192 px per axis 및 16M output pixels다. 고유 raster source decode와 output canvas estimate가 합산 160 MiB working budget을 넘으면 할당 전에 거부한다. 이 값은 heap/VRAM 측정치가 아닌 conservative estimate다.
- same-plane dimensions, drafting text, infinite lines/rays/independent points, missing source assets와 표현 불가능한 tilted placement는 묵살하지 않고 export error로 안내한다. 이 제한 안에서는 SVG generation을 재사용하므로 output order/filter semantics를 공유한다.

## G3-4b3 보드별 PDF

- File 메뉴에서 활성 visible board만 또는 visible board 전체를 PDF로 내보낸다. 전체 내보내기는 문서 보드 순서로 페이지를 만들며 각 페이지의 MediaBox는 보드의 mm 크기와 방향을 그대로 반영한다. 72/96/150/300 DPI 설정은 page pixel dimensions를 바꾼다.
- Preview summary는 보드별 크기·방향·페이지 픽셀과 aggregate pixels·estimated file/working memory를 보여준다. 한 export에 최대 32 pages, 16M total output pixels, 한 축 8192 px, 보수적 256 MiB estimated working memory, 128 MiB estimated PDF size를 허용한다.
- Artboard SVG scene을 Worker JPEG raster로 변환해 내부 PDF writer에 넘긴다. Color는 sRGB, JPEG quality 0.94다. 원본 보드 배경은 유지하고 투명 pixel은 흰 페이지 배경에 합성한다. 페이지마다 full-page raster image 하나를 담으므로 vector/text editing 정보는 보존되지 않는다. 새 third-party dependency는 없다.
- PDF Browser flow는 scope 선택, DPI/페이지 목록, 크기 오류 수정, detached preview, 실제 다중 페이지 다운로드, PDF page count/MediaBox 및 JPEG pixel sample, Cancel/history 불변을 검사한다. Unsupported drafting text/dimensions/infinite lines/rays/independent points, missing asset, tilted placement 및 output limits는 전체 operation을 거부한다.

## 검증된 실제 작업 흐름

G0에서 속성 모델·Review·Apply·Cancel·v7 persistence의 browser 25개와 아트보드 Node 10개를 검사했다. G2 browser는 추가로 4개를 확인한다. 프레임의 active plane 전환, 전체 보드 맞춤, native frame click, File 메뉴 SVG 액션, blob 결과의 exact `viewBox`/background가 포함된다. G3-4b2 `artboardPngWorkflow`의 25개 검사는 scale 수정, detached preview/cancel, invalid scale 차단, 투명 배경, PNG download와 decoded pixel/color/alpha를 확인한다. G3-4b3 `artboardPdfWorkflow`의 21개 검사는 active/all-visible scope, DPI 수정·page plan, 실제 multi-page PDF download, page count/MediaBox, decoded raster pixels/alpha·vector order, history 불변과 Cancel을 확인한다. 독립 `pdfinfo`와 `pdftoppm`로 생성 PDF를 재개방·렌더했다. Node export model 검사는 page order/size, PDF raster object/xref, output pixels·memory·file guard 및 invalid input 거부를 검사한다.

전체 최신 검증 수치·명령·로그는 [G2 구현·검증 기록](G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md), [PROJECT-STATE](../../PROJECT-STATE.md)에 둔다. G0 문서의 Node 545 / browser 22과제·454검사 수치는 당시 기준선으로 유지하며 최신 결과와 혼동하지 않는다.

## 남은 경계

- drafting text/dimensions, independent points/infinite lines/rays의 보드 export, asset embed/import, SVG drawing import, blend effects는 아직 없다. PDF output은 JPEG raster 페이지로 제공하며 편집 가능한 벡터 PDF는 아니다.
- 별도 실무자 평가와 아트보드/대형 도면 렌더·export의 비교 가능한 전후 성능 및 메모리 측정이 없다.
- 프레임/채움은 CAD 원본을 위한 viewport overlay다. 아트보드별 geometry, 독립 layer graph, 협업·URL 공유를 만든 것은 아니다.
