# G6-D3-B2 conic/seam 정책

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

후속 C1/C2·S1·E1에서 native finite spline section/HLR·exact DXF SPLINE을 보충했다. 아래 B2 검수 수치는 당시 범위다. [최신 곡선 지원 경계](SPLINE-NURBS-OUTPUT-2026-10-13.md).

실제 OCCT HLR에 ellipse/elliptic-arc를 추가하고 주기 seam·가시 구간·퇴화 경계를 정리했다. 원본 중심/두 축/parameter domain을 유지하며 Three.js·Review·live 주석·시트·SVG/DXF/PDF·v36과 연결한다.

## 지원 정책

V/H의 sharp(C0) 경계와 OutLine 실루엣을 보존한다. Rg1의 smooth tangent 경계, RgN의 sewn/periodic seam 및 isoline은 제외한다. 이 분류는 [OCCT HLRToShape API](https://occt3d.com/dev/doc/refman/html/class_h_l_r_b_rep___h_l_r_to_shape.html)를 따르며 로컬 OCCT bindings와 실제 원통/가림 fixture에서 검증했다. 정책은 `sharp-outline`으로 저장하고 출력별 sharp/outline 분류를 보존한다.

타원 축의 부호/방향을 canonical positive paper orientation으로 정리한다. 같은 source·visibility·analytic conic에서 겹치거나 이어지는 유한 구간과 주기 seam만 합친다. 다른 source, 가시/숨은 구간, 실제 occlusion gap과 다른 locus는 합치지 않는다. full ellipse의 임의 parameter seam을 제거하고 유한 ellipse의 실제 domain은 보존한다. 같은 중심의 다른 arc domain도 source key에서 구분한다. 닮은 선을 추측 재연결하지 않으며 visibility/topology 대응이 달라지면 unresolved/rebind 계약을 유지한다.

Edge-on 끝면을 OCCT가 nonrational degree-1 B-spline으로 재구성하는 경우, 모든 제어점의 collinearity(1e-7mm 이내)와 단조 순서를 확인한 경우에만 실제 line locus의 bounded endpoints로 출력한다. 일반 spline을 sampling해 line으로 바꾸는 기능은 아니다. parabola/hyperbola와 비선형 spline은 전체 결과를 명시적으로 거절한다. 타원 해치는 남은 범위다.

## 연결과 검수

원본/방향/축척 후보 재사용 경로에서 타원 축을 함께 변환한다. hidden ellipse는 dashed/thin style을 공유한다. 일반 타원 원본은 v27, 타원 단면은 v35, conic HLR/정책·타원 배경은 v36이며 하위 schema 선언과 policy 손상을 거절한다.

타원 단면의 retained-depth 배경도 같은 HLR을 사용한다. 정확히 겹치는 cut/background conic은 중심 및 quadratic tensor/domain을 비교해 제거한다. 해치는 타원 부품을 경고 후 생략한다.

전체 Node **1,182/54 suite**, fail/skip0, 타입·architecture **530 modules**를 통과했다. 신규 conic/seam 9개 검증은 axis/domain/periodic seam/edge-on proof/occlusion gap/실제 HLR/style·exact exchange·Undo/소유권·stale/잠금/source loss·비선형 torus 거절을 확인한다. 대상 native **6 workflows/129 checks**: conicProjection22 + courtyardConic16 + modelPresentation24 + modelDrawing32 + ellipseSection18 + sectionPresentation17. 전체 browser suite 재실행은 아니다.

[프로젝트](../../output/projects/courtyard-commons/conic-hlr/README.md)는 기존 56부품에 천창을 포함한 전체 입면(783 outputs), 천창 상면/측면 HLR과 단면 배경을 추가했다. 12도면·7페이지·v36, 모든 SVG/DXF skipped0와 실제 PDF·cache 재열기를 확인했다. 단일 Node 추가 실행23.071초, 입면 생성2.329초/천창각0.498·0.471초다. cold/warmed 평균이나 P2 성능 해결을 주장하지 않는다.

Production build는 초기 자동 승인 검토의 사용량 한도로 미실행됐으나, 사용 가능 상태 확인 후 승인된 재실행에서 통과했다. [검수](../verification/G6-D3-B2-CLOSEOUT-2026-10-13.json).
