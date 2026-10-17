# X2-C1/C2 → X6-D2-S1 → G6-D5-E1 곡선 출력 pilot — 2026-10-13

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

비유리 B-spline과 rational NURBS 원본을 CAD 객체·수치 편집·native 단면/HLR·캔버스·시트·교환에 연결했다. 처음 범위는 degree1–8/최대256 poles, 양수 weights, expanded knots와 nonperiodic finite domain이다. 닫힌 비주기 곡선도 지원한다.

## 사용과 실제 구현

Draw → Spline / NURBS에서 degree, control points(mm), knots, weights, domain을 입력한다. 다항식은 weights1을 사용한다. 선택한 source는 pole 좌표·weights·domain을 편집한다. degree/knot structure/pole 수 변경은 새 source로 만들며 기존 참조를 조용히 다른 구조에 연결하지 않는다. 화면 preview와 detached Review/Apply·한 Undo, stale/잠금/취소·실제 v39 재열기를 지원한다.

원본 데이터의 유리 de Boor 평가, homogeneous knot insertion/finite trimming, positive rational Bezier convex-hull chord bound, 길이 enclosure와 닫힌 평면 곡선 Green 적분 면적을 구현했다. 독립적인 rational1/4원·전체 원의 길이/면적, 원본 불변·trim 후 point equality를 검증했다. 기본 move/rotate/scale은 제어점 원본을 affine 변환하여 측정과 DXF에 보존한다. pole grips·finite endpoint/parameter midpoint snap·document topology endpoint references를 지원한다. snap sampled chords를 가짜 교차 edge로 사용하지 않는다.

실제 OCCT BSpline/Bezier curve를 private trimmed handle로 인계한다. line/circle/arc/ellipse는 기존 analytic 표현을 유지한다. 일반 BRep 교차는 OCCT Approximation의 fitted spline basis와 커널 허용오차를 보존한다. 임의 곡면의 수학적으로 정확한 대수 교차곡선이라는 주장은 하지 않는다. mesh silhouette나 화면 샘플을 원본으로 대체하지 않는다.

단면 XY/XZ/YZ → paper scale/placement·retained background·HLR visible/hidden·owned read-only·live endpoint/length note로 연결했다. crop은 homogeneous Bernstein roots로 원래 finite domain 구간을 구하고 exact knot trimming으로 내보낸다. 빈틈을 잇지 않고 unresolved/budget failure는 명시한다. native spline source key는 짧은 deterministic fingerprint로 저장하며 ambiguous coincident outputs는 거절한다.

## 출력과 손실 Review

- source/model-sheet DXF는 exact finite SPLINE과 ELLIPSE로 출력한다. 종이 사각 경계도 entity domain을 잘라 보존한다. source geometry·model association/dimension semantics는 외부 파일에서 구분한다.
- R2007 UTF-8 TEXT, 기존 CONTINUOUS/DASHED/CENTER LTYPE와 model hidden-line style을 유지한다. periodic/fit-only 또는 잘못된counts/knots/weights/closed flag는 DXF import Review에서 경고/skip한다.
- SVG/PDF paper chord tolerance0.02mm를 명시한다. positive rational Bezier hull로 display chord deviation을 제한하며 sampling budget 초과는 거절한다. crop root residual1e-7mm를 만족하지 못하면 명시적으로 실패한다. SVG에 source curve/tolerance metadata가 들어가고 PDF Review에도 근사·raster 출력 안내가 보인다.
- 기존 프레임/시트·연속 도면은 curve control points도 paper transform한다. component와 overrides의 spline도 nested affine source를 재평가한다. frame DXF는 기존 명시적 sampled presentation 계약이며 source/model-sheet exact SPLINE과 다르다.
- 실제1쪽 PDF를 독립 렌더링해 native spline section/HLR·한글 주석을 확인했다. PDF는 raster 결과다. SVG의 system font 설치/외부 CAD font 차이는 남고 폰트 embedding을 주장하지 않는다. spatial spline SVG/PDF는 출력 평면 정렬을 요구하며 exact WCS DXF를 사용할 수 있다.

## 검증과 경계

[편집 가능한 pilot과 PDF/SVG/DXF](../../output/projects/spline-pilot/README.md), [정량 검수](../verification/SPLINE-OUTPUT-CLOSEOUT-2026-10-13.json). 실제 UI19검사에서 C1 생성/Undo, rational 생성/수치 편집/측정, actual Three.js·native torus section/HLR, exact endpoint note, DXF 왕복·출력 Review·PDF 다운로드·v39 cache reload를 검수했다. 기존 타원·건축 표현·conic·시트·연속 프레임과 R5검증도 함께 통과했다. 전체 browser 재실행은 아니다.

Spline/ellipse hatch는 경고 후 제외한다. 전체 Bezier node editor·spline constraint/intersection/tangent/offset/fillet/연관 spline extrusion solver, periodic/fit-only DXF, native degree8/256-pole budget 이상, parabola/hyperbola adapter는 후속이다. 기존 선/호 중심 제조 기능을 sampled spline으로 자동 변환하지 않는다.

DXF 형식은 [Autodesk SPLINE reference](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-E1F884F8-AA90-4864-A215-3182D47A9C74.htm), native finite basis는 [OCCT Geom_BSplineCurve API](https://occt3d.com/dev/doc/refman/html/class_geom___b_spline_curve.html)를 확인했다.
