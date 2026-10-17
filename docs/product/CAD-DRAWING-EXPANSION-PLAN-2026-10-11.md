# CAD 도면 지원 범위 확대 계획 — 2026-10-11

> **문서 역할**: 후속 설계와 당시 결정 기록. 현재 사용법·지원 범위는 [도면과 출력](../features/DRAWINGS-OUTPUT.md)에서 관리한다.

2026-10-12 후속 수정: G6-D6-P1/G6-D4-R1의 재현 문제와 G6-D3-B1/B2의 첫 line/circle/arc HLR을 구현했다. [수정 범위](../implementation/COURTYARD-P0-P1-FIXES-2026-10-12.md). 다음은 **G6-D4-H1 건축 도면 표현 → X6-D2-E1 타원 단면**, conic/seam 세부 정책은 G6-D3-B2 잔여로 유지한다. 아래 최초 검토 순서는 이 후속 기록보다 이전이다.
2026-10-12 우선순위 변경: [중정형 도서관 프로젝트 검증](COURTYARD-COMMONS-CAD-AUDIT-2026-10-12.md)에 따라 **G6-D6-P1 성능 보충 → G6-D4-R1 단면 편집·참조 안정화 → G6-D3-B1/B2 일반 BRep 입면/숨은선 → G6-D4-H1 건축 도면 표현 → X6-D2-E1 타원 단면 → G6-D6-W1 건축 프로젝트 마감** 순서로 진행한다. 아래 이전 순서보다 이 갱신을 우선한다. X2-A exact curve 계약은 이미 있고, 일반 BRep 첫 직선/원·호 입면 검증은 타원 단면 전체 완료를 기다리지 않는다. G6-D4-R1은 새 보충 카드이며 위 보고서가 완료 조건을 소유한다.

사용자 요청에 따라 타원/spline 단면·일반 BRep 숨은선·자동 시트를 실제 구현 카드로 분할했다. 이 문서는 계획이며 G6-D5-A1 한 페이지 pilot은 [구현](../implementation/G6-D5-A1-AUTOMATIC-SHEET-LAYOUT-2026-10-11.md)했고 **G6-D5-A2도 [구현](../implementation/G6-D5-A2-FRAMES-ALIGNMENT-MULTIPAGE-2026-10-11.md)**했다. **X2-A도 [구현](../implementation/X2-A-EXACT-ELLIPSE-2026-10-11.md)**했으며 나머지는 대기다. 초기 계획 기록과 실제 최신 검수 수치는 구분한다. 현재 구현은 [단면·주석·시트 기록](../implementation/SECTION-ANNOTATION-SHEETS-WORKFLOWS-2026-10-11.md), 실행 상태는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다. 아래 하위 ID는 이번 계획에서 새로 정의하며 기존 상위 ID를 대체하지 않는다.

## 실행 순서와 필수 의존성

G6-D5-A1/A2·X2-A를 완료했고 CAD 다음 실행은 **X6-D2-E1 → G6-D3-B1 → B2 → X2-C1 → C2 → X6-D2-S1 → G6-D5-E1 → G6-D6-W1 → P1**이다. 기존 도면의 시트 배치는 A2에서 마감했고 다음에는 타원 및 일반 BRep 도면을 연결한다. HLR에 필요한 spline 출력은 X2-C/S1 계약 완료 후 확대한다. 해당 단계 이전의 미지원 곡선은 명시적으로 거부하며 sampling으로 정확한 출력 완료를 주장하지 않는다.

독립적인 제작/이미지 큐 **G1 공통 session owner → G4-B → I4 → I2 → I3**는 유지하지만, 이번 CAD 확대 큐 다음에 실행한다. 재현되는 공통 session 수명 결함은 해당 CAD 카드에서 함께 수정한다. G6-D5-A1/A2는 X2·HLR을 기다리지 않는다. X2-B Bezier/node editor와 G2 appearance 전체는 OCCT B-spline/NURBS 단면의 필수 선행이 아니다. X2-C1/C2의 곡선 계약을 직접 재사용한다.

| 새/기존 카드 | 첫 구현 범위 | 선행 / 완료 기준 |
| --- | --- | --- |
| **G6-D5-A1 자동 시트 배치 pilot · 완료** | 기존 resolved 정투영/단면과 소유 주석을 도면 뷰 단위로 묶어 A4/A3 가로/세로의 여백 안에 배치. 공통 1:N 후보 목록·모델 mm/종이 mm 유지. 기존 수동 위치는 고정/해제 선택. 회전 없는 결정적 배치와 한 페이지 pilot | 기존 D5. 주석·치수·stroke 여유까지 포함한 bounds, 중복/잘림/overflow 진단. 불가능하면 후보를 Review하고 Apply 거부. 같은 입력은 같은 계획, Cancel 무변경·한 Undo·재열기·PDF/SVG 일치 |
| **G6-D5-A2 도곽·정렬·다중 페이지 · 완료** | A1의 overflow를 페이지 분할, 제목/축척/페이지 번호·도면명/작성자/개정 필드와 Standard/Compact 선택 및 필드 편집 가능한 도곽 템플릿(임의 그래픽 editor/import 제외). 정면/평면/측면 뷰 정렬 옵션. 자동 재배치는 명시적 Review | A1. 최대 16페이지/64뷰/12축척 후보, 한 뷰 그룹을 잘라 분할하지 않음. 원본 뷰 ID·치수 참조 보존, 페이지 소유권 이전 원자성, 잠긴 페이지/고정 배치 보호. 삭제/재배치/저장·Undo, 실제 다중 PDF 검사 |
| **X2-A 타원 원본 기반 — 완료** | 중심·평면 frame·장/단축·회전·유한 parameter 구간으로 ellipse/elliptic arc를 정확히 저장. 생성/수치 편집·최소 정밀 핸들·끝점/중심/축점 스냅·선택/bounds·길이/면적·기존 TRS 정책 | 신규 geometry 종류의 document/feature/command/renderer/export 계약. SVG 타원/호와 DXF ELLIPSE 입출력, 저장 버전·Undo·퇴화/비균등 transform·열린 구간·실제 화면. 일반 타원 구속 solver·타원 교점 X3-B2는 별도 |
| **X6-D2-E1 타원 단면** | OCCT ellipse 교선의 축/frame·유한 구간 추출, 기존 section output/참조 계약으로 저장. 기울어진 원통 절단과 타원호 범위 crop·측정·주석·시트 SVG/PDF/DXF | X2-A. kernel→Worker→문서→viewport→export 전 구간 유지. 원통 단면 축과 독립 해석식 대조, 구간/회전/XY-XZ-YZ/변경·재연결·잠금 검사. spline 혼합 결과는 S1 전까지 원자적 거부 |
| **G6-D3-B1 일반 BRep 정투영·가시 윤곽** | primitive/extrude/Boolean으로 만든 유효한 배치 BRep의 XY/XZ/YZ 직교 도면. OCCT HLR 기반 가시 외곽/실제 edge와 visibility split 구간, 겹치는 부품 처리. 분석적 line/circle/arc/ellipse 첫 지원 | exact curve 계약 + Worker에서 HLR 바인딩/추출 가능성 확인. 지원 불가 바인딩은 kernel capability 보강으로 해결; mesh 실루엣 대체 금지. 사각 Boolean 구멍/계단/원통 가림 fixture로 독립 도면 대조. source/visibility split 대응이 모호하면 unresolved·명시적 재연결 |
| **G6-D3-B2 숨은선·표현 정책** | B1의 hidden edge를 별도 분류, 숨은선 표시 토글/실선·점선/종이 lineweight, seam/tangent edge 포함 정책. 조립 상태와 별도 저장 분해도 도면의 입력 상태를 명시 | B1. 구멍/가림/접선/중복 edge fixture로 visible/hidden domain 검증. viewport·SVG·PDF·DXF LTYPE/lineweight 일치 또는 명시적 손실. 점선은 semantic style이며 짧은 sampled 선분으로 원본 대체 금지. perspective 도면·임의 카메라 HLR 제외 |
| **X2-C1 비유리 B-spline 원본** | degree·poles·knots/multiplicity·parameter domain·개방/폐합/주기 계약, 비유리 곡선 생성/수치 제어점 편집·선택·스냅·측정·저장 | 검증 가능한 exact 원본. adaptive 렌더 오차/길이 적분 tolerance/비동기 취소를 분리. DXF SPLINE 입출력, SVG/PDF tessellation은 출력 tolerance·손실을 명시. Bezier/node editor 전체나 일반 solver 완료와 분리 |
| **X2-C2 rational NURBS 원본** | C1에 유한 양의 weights와 rational 평가·편집·측정/교환을 추가. 필요한 OCCT rational/periodic 곡선 계약 수용 | C1. 유리 원호 독립 기준·weight 변화·knot/domain·극단 수치/주기 seam 검증. exact DXF SPLINE roundtrip. 잘못된 knots/weights는 Review 단계에서 거부 |
| **X6-D2-S1 spline 단면·HLR 곡선 인계** | OCCT B-spline/NURBS 단면의 degree/poles/weights/knots/domain 추출. finite plane range crop은 곡선 parameter 구간으로 분리. B1/B2의 spline 결과도 같은 계약으로 소비 | C1/C2. 생성 kernel 곡선과 저장/복원 곡선의 평가점·접선·길이 오차 대조, 독립 알려진 곡면 fixture. 렌더 mesh는 파생 캐시이고 exact source를 대체하지 않음. fold/tangent/반복 root·빈 crop·참조 실패·출력 손실·UI 검수 |
| **G6-D5-E1 도면 출력 계약 확대** | 타원·spline·hidden line·도곽을 SVG/PDF/DXF로 연결. 종이 경계의 유한 곡선 구간 처리와 font/한글·dash/lineweight, flatten 손실 Review | A2와 해당 곡선/HLR 카드. DXF ELLIPSE/SPLINE/LTYPE·단위·유한 구간 import/export 왕복. SVG/PDF 근사 tolerance가 종이 mm 기준임을 표시. clipping 불가 entity는 거부하며 조용한 누락 금지. 한글 font 임베딩/대체 정책과 실제 다운로드 렌더 검증 |
| **G6-D6-W1 확대 workflow 마감** | Boolean 구멍/계단/돌출을 가진 기계 조립과 벽·문·창을 가진 건축 모델: 수치 변경→일반 정투영/숨은선·타원/spline 단면→연관 주석→자동 다중 시트→저장/Undo/출력 | 앞 카드. 두 분야를 별도 실제 browser workflow로 검수. 형상·visible/hidden 기준·모델/종이 수치 독립 대조, missing/ambiguous 참조 복구·잠금·실패·재열기. spline fixture는 실제 section이 해당 종류임을 확인 |
| **G6-D6-P1 성능·취소·자원 마감** | 10/50/100 부품·1/10/30 시트 고정 fixture의 kernel/HLR/section/layout/render/export 단계별 시간·edge/curve/픽셀·캐시 bytes·History 비용 계측 | W1 또는 동등 기능. cold/warm p50/p95와 장비/Worker 조건 기록, 취소/오래된 결과 폐기·반복 Undo/문서 교체 자원 회수 검사. 첫 계측에서 budget 수치를 정하고 초과 시 Review 진단/부분 재계산. 실무자 시간·native heap/VRAM 평가와 자동 검사 구분 |

## 도면 프레임·작업 구역 연결

별도 [사용자 경험 계획](CAD-FRAMES-SECTIONS-PLAN-2026-10-11.md)에 **G2-F1은 구현 완료**, 후속 **G2-S1/F2 → G6-D5-F1 → G2-F3**는 대기다. 프레임 생성/멤버·작업 구역·연결/정렬·상세 확대·구역 선택 자동 시트·연속 도면 정합을 포함한다. G6-D5-F1은 A1/A2를 재사용하고 곡선/스타일 출력 확대는 G6-D5-E1을 따른다. 기본 실행 위치는 현재 CAD 큐 뒤·제작 큐 앞이며 F1/S1은 기존 지원 geometry로 독립 실행할 수 있다.

## 함께 남겨 둘 확장

| 카드 | 범위 / 선행 |
| --- | --- |
| **X6-D2-P1 임의 frame 절단** | X5 frame의 origin/normal/in-plane axis를 저장하고 clipping·실제 section이 같은 평면을 소비. 기존 global height를 호환 변환. E1/S1과 별도로 진행 가능하나 결과 곡선 지원은 해당 카드 필요. 회전/반전/재열기·좌표 기준·원본 보존 검수 |
| **X6-D1-C1 화면 cap** | display 전용 cap·재질/깊이·여러 solid/Boolean 구멍 처리. 모델/STEP 불변과 실제 section 구분. 원본 BRep를 잘라 만드는 solid surgery는 별도 X6 기능이며 cap으로 완료 처리하지 않음 |
| **G6-D4-H1 건축 단면 표현** | 실제 section의 닫힌 loop·구멍 포함 hatch/절단선 굵기·전경/배경 구분, 종이 hatch 간격. open/ambiguous contour는 경고. 원본 모델·교선 참조 유지와 SVG/PDF/DXF 표현 검수. 건축 객체 semantics와 재료 자동 추론은 제외 |

## 공통 계약과 완료 판정

새 curve 종류는 문서·명령·topology/domain·정밀 기하·Worker·측정·renderer·SVG/PDF/DXF를 함께 설계한다. 저장 버전은 실제 schema 변경 시 올리고 기존 파일 읽기를 유지한다. 모든 파생 뷰는 source/output ID·유한 구간·visible/hidden 종류를 저장하되 OCCT explorer 순번을 영구 topology ID로 쓰지 않는다. 일반 영구 topological naming 전체가 없더라도 보수적 참조 실패와 재연결은 필수다.

자동 시트는 원본 모델을 바꾸지 않는다. 위치/축척/페이지 소유권 변경을 detached plan에 담고 ghost/overflow/출력 손실을 Review한다. 성공만 한 Undo이며 잠금/취소/미지원/오래된 plan은 무변경이다. 주석 bounds는 glyph metrics·선 굵기를 포함해야 하며 페이지에 들어간다고 모델 치수 값을 바꾸지 않는다.

각 카드의 완료는 실제 사용자 생성/편집/재연결/출력 동작, 독립 기하 기준, 저장/Undo·잠금/실패, native browser와 다운로드 검증을 포함한다. 테스트 추가만으로 완료시키지 않는다. exact 교환과 허용 오차가 있는 출력 근사를 구분하며 미지원 종류·손실을 출력 전에 알린다. BIM 의미·mate solver·모든 spline 구속·자동 공차·모든 camera projection은 이번 범위에서 제외한다.
