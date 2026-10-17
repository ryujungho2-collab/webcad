# 이미지와 장면

[기능 가이드](README.md) · [제작 기능 후속 목표](../product/UNIFIED-CREATIVE-SUITE-ROADMAP.md)

이 문서는 일반 아트보드·벡터 스타일·이미지 편집과 Scene/prototype 사용법을 관리한다. 모델 도면의 프레임·종이 축척·CAD 시트는 [도면과 출력](DRAWINGS-OUTPUT.md)이 소유한다. 건축 콘텐츠의 슬롯/override는 [평면도와 건축 콘텐츠](FLOOR-PLANNING.md)를 따른다.

## 아트보드와 벡터 표현

Artboards에서 작업/출력 보드를 관리한다. 활성 보드·보이는 보드를 Fit할 수 있고 숨김 보드는 출력 대상에서 제외한다. 보드 잠금은 위치/크기/평면을 보호하며 내부 객체 잠금과 별개다.

drawing을 선택하고 Properties의 **Appearance**에서 stroke/fill/opacity/width를 Review/Apply한다. 지원되는 닫힌 도형은 채움을 표시한다. 재사용/nested 벡터 컴포넌트 기반이 있지만 이것이 범용 path-node editor·gradient/blend·모든 instance variant의 완료를 뜻하지 않는다.

## 이미지 가져오기·편집·원본 교체

1. **File → Import image**로 PNG/JPEG/WebP 또는 제한된 TIFF를 가져온다. placement는 원본 asset과 별개이며 복제 배치의 transform/보정은 독립적이다.
2. **Image Inspector**에서 크기·Keep aspect ratio, crop, Rectangle/Ellipse mask, opacity와 brightness/contrast/saturation을 검토한다. 색 보정은 각 -100..100, opacity는 0..1 범위다.
3. Direct crop mode의 edge/corner 핸들 또는 수치 필드로 같은 crop 초안을 바꾼다. 최소 한 source pixel을 남기며 Apply 전에는 원본·History를 바꾸지 않는다.
4. **Replace source**에서 새 파일을 고르고 Current/Replacement와 canvas preview를 확인한다. 기존 placement의 크기·transform·crop·mask·보정·Scene 참조를 유지하며 같은 원본을 쓰는 다른 배치는 바꾸지 않는다.

Crop·mask·색 보정은 원본 픽셀을 덮어쓰지 않는다. 공유 원본/내장 bytes의 저장은 [프로젝트와 저장](PROJECTS.md)을 따른다. PSD 레이어 편집·범용 retouch·reference color management는 완료 범위가 아니다.

## 아트보드 출력

File의 보드 SVG/PNG/PDF 출력은 적용된 배치·순서·crop·mask·opacity·색 보정을 사용한다. SVG는 보드 mm 크기와 clip을 유지한다. PNG는 raster 합성이고 PDF는 페이지별 JPEG raster로 내보낸다. PDF의 투명 pixel은 흰색에 합성한다.

PDF는 활성 보드 또는 보이는 보드 전체를 문서 순서대로 한 장씩 출력하며 72/96/150/300 DPI를 선택한다. 최대 32페이지·총 16M pixels·축당 8192px·예상 작업 메모리 256MiB·예상 파일 128MiB의 guard가 있다. 이 수치는 실제 heap/VRAM peak 측정이 아니다. 지원하지 않는 기울어진 배치/geometry는 조용히 누락하지 않고 출력 오류로 표시한다.

## 장면과 오프라인 프로토타입

아트보드와 원본 객체를 선택한 뒤 **Explorer → Scenes → New scene from selection**으로 장면을 만든다. Free/Row/Column·gap/padding, 상태·시간·링크를 편집하고 Review/Apply한다. 원본 수정 후 기존 draft를 재검토하며 저장된 clean scene에서 SVG를 출력한다.

**Export prototype HTML**은 저장된 장면/상태/원본 artwork를 자체 포함 HTML로 만든다. 브라우저에서 장면 이동·Back·target state 링크·재생/일시정지·타임라인 탐색·자동 다음 장면을 사용할 수 있다. 끊어진 링크/미지원 source는 출력 전에 거부한다.

HTML은 출력 시점 snapshot이며 CAD 수정 후 재출력해야 한다. 이미지 내장으로 파일이 커질 수 있다. 직접 layout canvas handle, 범용 상위 Flex, 정의 격리 편집·모든 variant, PPTX·GIF/APNG·영상 출력은 별도 범위다.

## 구현·검증 근거

- [아트보드/벡터/컴포넌트](../implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md), [이미지 편집·출력](../implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md).
- [원본 교체](../verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md), [이미지 자원 측정](../verification/G3-5-IMAGE-RESOURCES-2026-10-06.md). 작은 fixture 관측을 대형 이미지/장시간 성능으로 일반화하지 않는다.
- [Scene 편집](../implementation/G4-CAD-BASICS-2026-10-06.md), [HTML prototype 검증](../verification/G4-OFFLINE-PROTOTYPE-2026-10-10.md).
