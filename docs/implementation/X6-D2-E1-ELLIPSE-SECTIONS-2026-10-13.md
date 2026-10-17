# X6-D2-E1 타원 단면

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

후속 B2에서 ellipse/elliptic-arc HLR과 단면 background를 구현했다. 아래 검증 수치는 당시 기록이며 타원 해치와 일반 spline은 계속 제외한다. [후속 지원 정책](G6-D3-B2-CONIC-SEAM-2026-10-13.md).

2026-10-13. 실제 OCCT BRep × 평면의 타원/유한 타원호를 기존 X2-A 원본 계약으로 연결했다. 원본은 중심 C, 두 축 U/V, 시작 매개변수와 sweep을 보존하며 C + U cos(t) + V sin(t)로 표현한다. 원본을 sampled polyline으로 바꾸지 않는다.

## 사용

View → Assembly and drawings → BRep section에서 기존 단면과 같이 높이, XY/XZ/YZ, 원본 부품, 선택적 xmin/ymin/xmax/ymax를 지정한다. Review는 detached, Apply는 한 Undo다. 타원 단면과 crop된 타원호는 기존 도면의 읽기 전용 소유 출력이며 직접 이동/삭제를 거절한다.

Annotation에서 타원 중심, 타원호의 정확한 시작/끝점에 live/snapshot 텍스트 리더를 붙일 수 있다. 시트 축척/위치가 바뀌면 두 축과 중심·리더 부착점도 따라간다. 텍스트 높이는 종이 mm다. 타원 자체에는 원형 지름/반지름 치수를 적용하지 않는다. 기존 부품 측정 주석은 원본 부품의 치수를 뜻한다.

건축 표현의 절단선 굵기·라벨은 타원에도 적용한다. **Background는 꺼야 한다.** 일반 타원 HLR은 아직 지원하지 않으므로 포함하면 Review/Apply 전체를 거절한다. 타원이 있는 부품의 해치는 경고 후 생략한다. 다른 지원 부품의 해치는 유지한다.

## 구현과 계약

- OCCT BRepAdaptor_Curve의 실제 gp_Elips 중심, major/minor 축 방향·길이, First/LastParameter를 반환한다. cap에 가까운 절단에서 나온 유한 타원호와 직선도 보존한다. spline 등 다른 미지원 곡선은 전체 결과를 진단한다.
- XY/XZ/YZ 투영은 중심과 두 축을 도면 평면으로 옮긴다. crop은 각 직사각형 경계의 U cos(t)+V sin(t)=bound-C 해를 구해 유한 구간을 만든다. tangent root로 이어지는 retained 구간과 닫힌 타원의 매개변수 seam을 병합해 가짜 끝점을 만들지 않는다.
- 중심/축의 종이 배치·scale 변환을 원본 재사용 및 이전 참조 대응 경로에 추가했다. 유한 원본 타원호는 domain으로 구분하여 같은 중심의 다른 호를 혼동하지 않는다. 단일 타원의 크기 변경은 같은 output/topology ID를 유지하며, 소멸/curve-kind·crop 대응 변화는 기존 unresolved/rebind 계약을 따른다. nearest curve로 새 참조를 조용히 대체하지 않는다.
- live 주석 시작/끝점은 표시용 sample의 첫/마지막 항목 대신 analytic parameter endpoints를 사용한다.
- 실제 Three.js와 도면 bounds/시트는 기존 X2-A 표현을 사용한다. SVG는 ellipse 또는 elliptic A, DXF는 ELLIPSE entity를 사용한다. PDF는 앱의 기존 bounded display/raster pipeline을 사용하며, portable source와 SVG/DXF의 analytic 원본은 유지된다.
- v35는 타원 단면의 소유 mapping을 보존하고 하위 버전 선언을 거절한다. 단면 없는 일반 타원은 기존 v27, 타원 없는 H1은 v34를 유지한다.

## 검수와 프로젝트

전체 Node **1,173 / 54 suites**, fail/skip0, 타입·architecture **527 modules**·production build 통과. 새로운 타원 단면 7개 Node 검증은 독립 원통 표면/평면 residual, 알려진 축 길이, 실제 finite BRep cap 연결, 세 평면의 crop, 정확한 endpoint/Undo·stale·잠금·source loss, sheet/SVG/DXF/v35, 해치 생략·배경 거절을 확인한다.

대상 native **5 workflows / 105 checks**: 신규 ellipseSection18, 실제 프로젝트14, 기존 modelDrawing32 / sectionPresentation17 / ellipse24. 전체 browser suite 재실행은 아니다. 작은 A4 1페이지 및 실제 프로젝트 6페이지 PDF를 앱에서 다운로드하고 pdfinfo/pdftoppm으로 독립 렌더링하여 모두 확인했다.

[실제 프로젝트](../../output/projects/courtyard-commons/ellipse-section/README.md)는 기존 **56부품**의 skylight-study를 그대로 사용한다. 반지름1800·길이6000, Y회전30°, 이동(18000,14000,11000), 절단 Z13500에서 반장축 **2078.460969mm**, 반단축 **1800mm**다. 전체 타원 1개와 연속 반쪽 타원호 1개, 중심/끝점 live 리더를 A3 1:50 도면에 추가했다. 이전 7개 도면/5개 페이지는 유지하여 **9도면·6페이지**(기존 A2 5 + A3 1)가 됐다. DXF skipped0, schema35 round-trip을 검증했다.

성공한 Node 프로젝트 추가 실행은 약9.9초, native 첫 scene 약26.4초의 단일 측정이다. 큰 프로젝트 원본 편집을 이번에 다시 측정하지 않았으므로 이전 H1의 편집54.6초/시트44초 성능 문제가 해결된 것으로 보지 않는다. 기존 프로그램 주석의 긴 리더와 공간/구조/법규/피난 설계 마감도 남아 있다.

[정량 검수](../verification/X6-D2-E1-CLOSEOUT-2026-10-13.json). 다음은 **G6-D6-P2 대형 소유 출력 성능 보충**, 그 뒤 잔여 conic/HLR 정책 및 건축 프로젝트 마감이다. 타원 해치·일반 ellipse HLR·spline은 이번 완료 범위 밖이다.
