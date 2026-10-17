# 단면·주석·시트·건축/기계 workflow — 2026-10-11

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

X6-D1/D2 → G6-D4 → X7-A/E → G6-D5 → G6-D6의 첫 지원 범위를 실제 명령·화면·Worker·저장·출력에 연결했다. 검수 수치는 [검수 기록](../verification/SECTION-ANNOTATION-SHEETS-WORKFLOWS-2026-10-11.json), 다음 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다.

## 사용

View → Assembly and drawings에서 기존 Part/Placement/Explosion/Projection과 함께 Clipping, Section, Note, Sheet, Dimension을 선택한다. 변경은 Review에서 검토한 뒤 Apply한다. Cancel은 문서와 History를 변경하지 않는다. 저장된 항목을 선택해 수정·재연결하며 시트 탭에서 SVG/DXF/PDF를 출력한다. 일반 File의 Artboard 출력도 같은 시트 소유 범위를 사용한다.

## 실제 구현

- X6-D1: XY/XZ/YZ 기본 평면의 전역 높이와 남길 양/음 방향을 설정한다. 실제 솔리드 재질과 선택 hit에 반영하는 화면 clipping이며 원본 BRep·조립 배치·STEP은 보존한다. 절단면 cap은 생성하지 않는다.
- X6-D2/G6-D4: OCCT BRepAlgoAPI_Section으로 실제 배치된 BRep와 평면의 교선을 계산한다. 직선·원·호를 정확한 독립 drawing으로 만들고 절단 높이·모델 평면 범위·부품을 지정한다. Boolean 벽의 안쪽/바깥쪽과 문 개구부도 같은 엔진을 사용한다. 범위 clipping도 직선·원호의 유한 구간을 해석적으로 계산한다.
- X7-A/E: Leader/문자 편집과 길이·지름·면적 측정값 인계를 제공한다. live는 원본 변경 후 값과 부착점을 갱신하고 snapshot은 작성 시 값·위치를 유지한다. 모델 연관 일반 선형/반지름/지름 치수도 지원한다. 주석은 수치 driver가 아니다. 원통 길이는 local Z 길이이며 면적은 해당 측정 서비스의 면적 의미를 따른다.
- G6-D5: 정투영/단면을 기존 XY 아트보드의 수동 종이 위치와 1:N 축척에 연결한다. 형상은 종이 mm, 연관 치수 값은 모델 mm, 문자 높이는 종이 mm다. 안정 제목 ID와 시트/뷰 소유권을 검증한다. 같은 캔버스 위치의 여러 시트도 SVG/PDF/DXF 출력 객체가 섞이지 않는다.
- DXF: LINE/CIRCLE/ARC/LWPOLYLINE/TEXT의 기존 R2007 writer를 재사용한다. 모델 연관·치수 의미는 일반 entity로 평탄화되고 외부 font가 달라질 수 있음을 출력 UI에 표시한다. 종이 경계를 넘는 entity는 정확한 clipping을 추정하지 않고 거부한다. 원호도 전체 원 bounds를 사용하는 보수적인 경계 검사가 적용된다.
- G6-D6: plate/spacer/shaft 3부품의 지름20→25·길이80→100, 조립 위치·비파괴 분해도·정투영/단면·치수 시트와 단층 Boolean 벽/문/바닥의 두께200→300·높이2800→3000·문 폭/높이 변경을 연결했다. 모델 체적은 독립 수식과 비교한다. 저장 재열기·Undo/Redo·두 시트 PDF를 검수한다.

## 참조와 저장

파생 형상의 source key는 정규화한 해석적 교선과 crop 구간으로 대응한다. 동일 대응은 output/topology ID를 유지한다. 교선 수/종류/대응이 바뀌거나 원본이 사라지면 unresolved로 숨기며 측정·출력을 거부한다. 저장된 Section을 명시적으로 재연결하면 새로운 대응을 만든다. 종속 live 주석/치수도 참조 실패를 유지하며 명시적 재연결로 복구한다. 임의의 OCCT edge 순번을 영구 ID로 취급하지 않는다.

모든 변경은 기존 detached plan/Review/Apply와 한 번의 Undo에 포함된다. 잠긴 출력/주석 변경은 원본 재생성과 함께 원자적으로 거부하고, 변경 없는 잠긴 단면은 무관한 명령을 막지 않는다. 시트에 소유된 뷰 위치·축척은 시트 명령으로만 바꾼다. v25는 clipping/section/sheet와 연관 주석을 저장하며 v1–v24 읽기와 최소 필요 버전 writer를 유지한다. 새로운 데이터를 구버전으로 내보내는 것은 거부한다.

## 남은 범위

일반 BRep 정투영/숨은선(G6-D3), 타원·spline 단면, 임의 UCS 절단 평면, clipping cap, 자동 배치/도곽, 일반 영구 topology naming, BIM 의미·mate solver, 건축 종류 전체와 대규모 성능 기준은 후속이다. X7-B/C/D 전용 도구와 별도 annotation 계열 전체는 완료로 올리지 않는다. G6-D6은 두 제한된 예제의 workflow 완료이며 전체 건축·기계 milestone 완료가 아니다.

## 코드 연결

kernel section → Worker protocol/runtime → modelSectionService → 순수 modelSection 기하 → modelDrawingCommands/refresh → viewport drawing/annotation → 시트 소유 범위 → 공통 SVG/PDF와 DXF 순서다. 문서 계약은 ModelDrawing/ModelPresentation/FeatureContract/serialization, 화면은 ModelDrawingPanel과 기존 ModelPresentationDialog가 담당한다.

## 최종 검수

전체 Node 1,039개/54 suites, 대상 native browser 11 workflows/266 checks, 타입 검사·architecture 469 modules·production build를 통과했다. 신규 Node 13개와 신규 UI/Worker 32 checks를 포함하며 전체 browser suite 재실행은 아니다. 다운로드한 A4 두 페이지 PDF를 pdfinfo/pdftoppm으로 독립 렌더링해 Ø25 치수·live 주석과 넓어진 건축 개구부, 시트별 소유 범위를 확인했다. [PDF 결과](../../output/pdf/two-workflows.pdf).
