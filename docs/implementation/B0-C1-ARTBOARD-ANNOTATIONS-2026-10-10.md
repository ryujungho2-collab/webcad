# B0-C1 아트보드 주석 출력

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. root 문자·치수를 보드 SVG/PNG/PDF에 연결했다. 기존 화면의 주석 표시와 레이어 계약을 유지하며, 출력 전에 drawing으로 변환할 필요가 없다. [검수 증거](../verification/B0-C1-CLOSEOUT-2026-10-10.json).

## 출력 계약

- `collectArtboardExportItems`는 이미지·도형·drafting 선·일반 치수 선·문자를 root 객체 순서로 합성한다. 치수 객체 안에서는 선 다음 글자가 출력된다. 뒤에 작성한 채운 도형이 앞의 문자를 덮는 순서도 유지한다.
- 문자·연속 치수·평면도 글자는 `worldDraftingGeometry`, 일반 선형/반지름/지름/각도 치수는 `resolveDimension`을 사용한다. 스타일 글자 높이·paperScale, 색·물리 선 두께·dash, 단위·측정값을 보존한다. 일반 치수 객체의 배치 변환도 선과 글자에 적용한다.
- XY/XZ/YZ 문자 축을 실제 객체 변환으로 계산한다. 이동·회전·균등 축척을 반영하고, 비균등 축척은 SVG affine 행렬로 glyph 비율을 유지한다. 중첩 drafting 문자 축은 viewport 렌더러에도 전달한다.
- 보드 origin/size가 유한 출력 창이다. 선은 잘리고 글자는 SVG clipPath로 잘린다. anchor가 밖에 있어도 보드 안으로 들어오는 glyph를 남긴다. 문자만 있는 보드도 출력한다. 보드는 기존 작업면의 축에 정렬된 사각형이며 새로운 보드 회전 속성을 추가하지 않았다.
- 숨긴 객체·레이어·다른 작업면은 제외하고 잠금은 출력 표시를 유지한다. 출력 준비·미리보기·다운로드는 문서와 Undo/Redo를 변경하지 않는다. 문서 스키마 변경은 없다.

SVG는 Unicode 텍스트와 escape·회전·중앙 정렬을 보존한다. PNG와 PDF는 같은 SVG 장면을 기존 worker에서 래스터화한다. PNG 배율은 픽셀 해상도만 바꾸고, 보드 PDF의 종이 크기는 보드 mm 크기다. PDF 글자는 래스터 페이지에 포함되며 검색 가능한 vector PDF 텍스트로 바꾸지는 않았다. 활성 평면 Plot PDF의 축척 정책은 [B3-D3](B3-G1-D3-PRECISION-OUTPUT-2026-10-10.md)를 따른다.

## 검증

신규 Node 9개는 Unicode/escape·회전·clip·문자 전용 보드·치수/chain·레이어/표시/잠금·객체 순서·배치 변환·XY/XZ/YZ·비균등 축척·Undo/Redo·JSON을 검사한다. 기존 dimension 거부 검사는 실제 포함 검사로 교체했다.

통합 **955 Node / 54 suites / fail·skip 0**, 타입·architecture **437 modules**·production build 통과. 실제 브라우저 **75 checks**: 신규 artboardAnnotations 12, 기존 PNG 25, 다중 보드 PDF 21, draftingVisibility 17. 실제 메뉴 다운로드 SVG를 파싱하고 PNG 및 PDF 내부 JPEG를 다시 디코딩해 한글·치수 픽셀, 해상도, 25.4 mm 보드의 72 pt 페이지 크기를 확인했다.

검수 중 기존 PNG/PDF fixture의 vector style에 빠진 `fillGradient:null`을 추가했고, 표시 회귀의 오래된 PDF 3.5 mm 기대값은 B3-D3의 1:2 기본 높이 2 mm로 수정했다. 이 수정 후 모두 통과했다.

## 남은 경계

Point 표식과 무한선/ray의 보드 유한화는 별도 후속이며 기존 명시적 거부를 유지한다. 작업면 밖으로 기울어진 문자는 정확한 2D 글자로 출력할 수 없어 복구 이유를 표시한다. Scene의 주석 layout/animation은 이번 보드 출력과 다른 범위다. 글꼴은 브라우저의 system-ui를 사용하며 파일에 폰트를 임베드하지 않는다. 전체 브라우저 suite·외부 PDF 뷰어·대형 도면 벤치마크는 이번 검수에 포함하지 않았다.

다음 B 보충 권장은 B1-E2 호·혼합 sketch 구성 편집이다.
