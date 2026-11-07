# G6-D5-Q1 출력 전 점검

2026-10-18 · 구현·검증 완료. [도면 출력 가이드](../features/DRAWINGS-OUTPUT.md) · [검증 manifest](../verification/G6-D5-Q1-2026-10-18.json).

File → Output preflight 또는 명령 검색에서 출력 전 점검을 연다. Assembly and drawings의 저장된 model sheet에는 Check sheet output이 있으며 해당 시트 세트 전체를 선택한다. 기존 직접 출력 버튼은 유지하며, 점검 화면의 checked output 경로가 진단·손실 확인을 거쳐 출력하는 경로다.

## 진단 범위

페이지별 missing source/view/output, unresolved view/annotation, sheet denominator와 view scale 불일치, 비유한/지원 밖 형상을 오류로 구분한다. 숨긴 scoped output은 생략 경고다. annotation의 conservative system-ui glyph envelope가 paper/clip 경계를 벗어나면 잘림 가능성 경고를 표시한다. 이는 실제 glyph outline 검증이나 폰트 설치 보증이 아니다.

SVG/PDF의 기존 원·호 polyline 출력은 검증된 paper 오차 상한이 없는 근사 경고다. SVG/PDF spline sampling은 선언된 paper chord tolerance(기본 0.02mm)의 근사 경고이며, 정확 DXF SPLINE과 구분한다. 프레임 DXF의 presentation flattening은 손실 경고다. DXF raster image는 해당 경로에서 지원하지 않는 오류다. PDF raster/DPI, SVG/DXF font embedding/대체와 관계 평탄화는 형식 안내로 구분한다. 오류와 단순한 지원 한계를 같은 상태로 표시하지 않는다.

오류가 있으면 checked output을 막고, 경고는 사용자가 확인한 뒤 진행한다. 기존 export collector/writer가 거절하는 경우도 report에 전달한다. 점검은 자동 rebind, scale 변경, annotation 이동, 잠금 해제를 수행하지 않는다.

## 장면과 수명

`outputPreflight.ts`의 읽기 전용 점검은 `collectArtboardExportItems`와 동일한 page scene/ownership/crop을 사용한다. 썸네일과 SVG는 같은 items로 encodeSvg하며 PDF는 기존 ArtboardPdfDialog/renderer로 보낸다. DXF는 기존 modelSheetDxf/encodeFrameDxf/encodeDxf writer를 검증하고 다시 호출한다. 미리보기용 scene과 최종 출력용 도형을 따로 작성하지 않는다.

여러 페이지는 page 단위로 점검하고 중간에 UI event loop에 양보한다. 진행 상태를 표시하고 대상/형식 변경이나 닫기 시 이전 점검을 취소한다. 현재 document version과 맞는 보고서만 출력한다. PDF DPI와 기존 16M 총 raster-pixel 예산도 점검 단계에서 확인한다. R5 전체 10쪽은 하나의 PDF로 이 예산을 넘기므로 원래 네 시트 세트(4/4/1/1쪽)를 선택해 각각 출력한다. 예산을 키우거나 조용히 해상도를 낮추지 않는다. PDF preview 이후 문서가 바뀌어도 Download 시 version을 다시 확인한다. thumbnail Blob URL은 교체/해제 때 반환한다.

Show target은 보고서를 닫고 해당 page 또는 기존 object를 선택·맞춤한다. 누락 객체나 frame source는 page로 이동하며, 숨김 page를 자동으로 켜지 않는다. 수정은 기존 도구의 Review/Apply/Undo로 수행하고 다시 점검한다. 점검 결과·경고 동의는 document schema에 저장하지 않는다.

## 검증과 경계

실제 R5 전체 10쪽과 clipped associated annotation 결함 fixture를 사용한다. 전체 scene 동등성, 읽기 전용 진단, source/annotation/ref 누락·scale mismatch·형식 구분은 Node에서 확인한다. 실제 UI에서 page preview, 경고 승인, PDF/SVG/DXF 다운로드, Show target, 별도 수정 Review/Apply, Undo/Redo, 재검사·재발행·portable reload를 확인한다. 다운로드 PDF는 pypdf와 독립 Poppler 렌더링으로 page 수/실제 mm/비어 있지 않은 도면을 검증하고 PNG를 시각 검수한다.

이 점검은 건축 법규/설계 적합성, 인쇄 장치의 색/여백, 모든 설치 폰트의 glyph coverage를 보증하지 않는다. 일반 Plot의 비시트 출력은 기존 자체 scale/fit 정책을 유지한다. 모든 warning은 자동 오류로 승격하지 않으며, 지원 범위를 벗어난 형식 손실은 사용자에게 구분해서 남긴다.

## 최종 검증 결과

- 전체 Node 1,360개 / 54 suites 통과, 신규 집중 5개 통과.
- 실제 native UI/Worker 24개: R5 10쪽 점검과 실제 SVG 10개·DXF 10개 다운로드, 4개 시트 세트 PDF 다운로드, PDF 예산 거절, clipped annotation 수정→Review/Apply→Undo/Redo→재검사→PDF/SVG/DXF 재발행→portable reload.
- 기존 native 회귀: modelSheetSet, artboardPdfWorkflow, conicProjection, residentialTask. 명령·개수·로그는 manifest에 기록한다.
- 실제 다운로드 PDF 5파일/11쪽을 pypdf + Poppler 72dpi로 독립 렌더링했다. 페이지 수·용지 mm·비어 있지 않은 도면·저장한 수정 좌표·R5 20개 vector 파일을 검사했고, 전체 contact sheet (local-only, not in repository: `output/verification/output-preflight/independent-contact.png`)와 선택 페이지를 시각 검수했다. 독립 보고서 (local-only, not in repository: `output/verification/output-preflight/independent-report.json`).
- TypeScript 포함 전체 build와 architecture/문서 링크 검사 통과. 기존 500kB bundle 경고는 유지한다.

검증 출력: R5 평면·단면 4쪽 (local-only, not in repository: `output/pdf/output-preflight-r5-1.pdf`), R5 입면 4쪽 (local-only, not in repository: `output/pdf/output-preflight-r5-2.pdf`), R5 출입구 1쪽 (local-only, not in repository: `output/pdf/output-preflight-r5-3.pdf`), R5 skylight 1쪽 (local-only, not in repository: `output/pdf/output-preflight-r5-4.pdf`), 주석 수정 후 1쪽 (local-only, not in repository: `output/pdf/output-preflight-repaired.pdf`), R5 SVG/DXF 20개 (local-only, not in repository: `output/verification/output-preflight/r5-vector.zip`).
