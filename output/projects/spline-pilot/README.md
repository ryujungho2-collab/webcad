# Spline/NURBS output pilot

File Open으로 [편집 가능한 v39 프로젝트](spline.webcad.json)를 연다. Draw → Spline / NURBS에서 원본을 선택해 pole/weight/domain을 편집한다. 실제 경사진 torus의 native spline 단면·HLR, rational1/4원, 한글 live endpoint note를 포함한다.

[PDF1쪽](spline.pdf) · [SVG](spline.svg) · [DXF SPLINE 원본](spline.dxf) · [native19 검수](native-report.json).

SVG/PDF는0.02mm paper chord tolerance이며 PDF는 raster다. OCCT 일반 교차곡선은 fitted spline/kernel tolerance를 보존한다. periodic/fit-only DXF와 spline hatch/전체 solver는 제외한다. [사용과 지원 경계](../../../docs/implementation/SPLINE-NURBS-OUTPUT-2026-10-13.md).
