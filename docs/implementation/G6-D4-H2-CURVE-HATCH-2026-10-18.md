# G6-D4-H2 곡선 단면 해치

2026-10-18 · 첫 지원 범위 완료. [현재 사용법](../features/DRAWINGS-OUTPUT.md) · [검증 manifest](../verification/G6-D4-H2-2026-10-18.json) · R5 확장 산출물 (local-only, not in repository: `output/projects/curve-hatch-r5/README.md`)

타원·유한 elliptic arc·spline/NURBS가 포함된 단면의 해치 생략 경로를 보충했다. 원본 곡선을 폴리라인으로 바꾸지 않고, 정확한 유리 Bézier 표현과 유한 source domain에서 해치 교차를 구한다. 기존 line/circle/arc 전용 analytic 경로와 소유 출력·Review/Apply·Undo·저장 계약은 유지한다.

## 계산과 지원 경계

- sectionCurveBoundary는 conic을 양의 가중치 quadratic Bézier 구간으로 표현하고 spline은 기존 homogeneous knot insertion으로 유한 Bézier spans를 얻는다. display sampling과 구분한다.
- 단조 좌표를 증명할 수 있는 구간으로 나누고 끝점 차수 2를 확인한다. 양의 rational convex hull의 bounding box subdivision으로 비인접 경계의 분리 여부를 검사한다. 열린/분기·교차·접촉·중복·특이 또는 미수렴 경계는 해당 부품의 해치를 생략하고 진단한다. 같은 부품의 모든 링에 even/odd를 적용하므로 구멍과 내부 섬을 함께 처리한다.
- 행 교차는 homogeneous Bernstein 계수의 부호 변화로 고립한다. 양의 y 방향의 half-open 끝점 규칙을 적용하며 수치 seam만 끝점에서 1e-12 종이 mm 이내로 조정한다. 내부 계수는 임의로 0으로 바꾸지 않는다. 경계 판정 해상도는 1e-7 종이 mm, 내부 root bracket 목표는 1e-9 종이 mm다. 원본 좌표/domain은 수정하지 않는다.
- 512 source edges, 1,024 Bézier pieces, 200,000 경계 검사와 500,000 행 root 작업 예산을 둔다. 기존 4,000 종이 행·20,000 stroke 한도도 유지한다. 복잡도/정밀도 판정 실패는 경고 후 생략하며 행/stroke 초과는 기존처럼 Review 오류로 간격 증가를 요구한다. 큰 좌표의 부동소수점 해상도도 보수적으로 검사한다.
- modelSection의 기존 중심 descriptor가 충돌해 거절하던 동심 full conic은 면적 순서로 구별한다. 이전에 유효했던 unique source key는 바꾸지 않는다. 실제 중복/면적 구별 불가는 여전히 거절하며 kernel 순서와 무관하게 정렬한다.
- 소유 hatch는 기존 직선 drawing output이다. 화면·SVG·PDF·DXF가 같은 stroke와 종이 선 굵기를 사용한다. SVG/PDF spline outline의 기존 0.02mm 표시 근사와 해치 교차 계산은 다르다. DXF는 exact ELLIPSE/SPLINE과 직선 해치를 내보내며 HATCH entity를 새로 도입한 것은 아니다.

## 편집·복구

해치만 켜거나 간격/각도를 바꾸면 기존 cut ID와 참조를 유지한다. 단면 높이·종이 축척 변경은 원본 곡선과 해치를 같은 transaction에서 재생성한다. 원본 편집으로 spline edge 대응이 모호해지면 기존 정책대로 unresolved로 표시하고 소유 출력을 숨긴다. 명시적으로 단면을 Review/Apply하면 재연결한다. Undo/Redo는 전체 이전 상태를 복원한다. 재열기는 실제 async durable recovery 경로를 사용하며 새 Undo 세션이다.

## 검증

신규 Node 12개를 포함한 전체 **1,323 tests / 54 suites / 실패 0**. 곡선 해치·실제 OCCT 혼합 cap·타원 단면·건축 표현·spline 통합 대상 **32개**를 통과했다. 독립 타원식·cubic polynomial·rational circle 식과 비교하며 축/방향/seam·잘린 domain·짧은 parameter domain·구멍·자기교차·정밀도/예산 진단을 검사한다.

실제 R5는 기존 **56부품·14도면·10페이지**를 그대로 두고 native 타원 링과 torus/box cap 두 부품·두 단면·A3 한 페이지를 추가했다. 실제 UI **28개** 검사는 해치 Review/Apply, 원본/ID 보존, 실제 Three.js, 잘림 경계 생략/Undo, 단면 높이 편집·Undo/Redo, 1:1/1:2 발행과 실제 durable reload를 포함한다. 확장 문서는 **58부품·16도면·11페이지**다. 기존 sectionPresentation 17개·ellipseSection 18개·spline 19개·modelSheetSet 24개, 총 **78개 UI 회귀**도 통과했다. TypeScript 검사, 아키텍처 검사 631모듈, 프로덕션 빌드 451모듈을 통과했으며 기존 500kB chunk 경고는 남아 있다.

PDF 스킬의 읽기 전용 검수 방식으로 실제 다운로드 PDF 3건을 Poppler 144dpi로 독립 렌더링했다. A3 크기·하얀 타원 홀·재료 내부 stroke·편집 전후 차이와 SHA-256을 확인했다. 최종 WebCAD의 모든 해치 선분이 타원 홀을 가로지르지 않는지와 종이 2mm 간격을 독립 계산하며, 기존 R5의 parts/projections/sections/sheets 정의가 동일함도 비교한다. 정량 검수 (local-only, not in repository: `output/projects/curve-hatch-r5/artifact-verification.json`).

R5 자동 입력은 기존 R5 workflow와 같은 30초 CDP 응답 제한을 사용한다. 대형 React/저장 갱신의 5초 응답 초과를 허용한 것이며 기하 오차나 hit test를 완화하지 않는다. 성능 개선 카드나 전체 브라우저/임의 spline의 무제한 지원을 뜻하지 않는다. 기본 degree 1–8·256-pole·양의 가중치 계약, periodic/fit-only DXF와 미수렴 접선의 한계는 유지한다.

!독립 렌더한 1:1 곡선 해치 (local-only, not in repository: `output/projects/curve-hatch-r5/curve-01-1.png`)

!실제 R5 확장 화면 (local-only, not in repository: `output/projects/curve-hatch-r5/curve-preview.png`)
