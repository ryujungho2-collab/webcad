# B0-C — 기본 도면 요소의 표시·잠금·출력

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

갱신일: 2026-10-09. 기본 root drawing/drafting/dimension의 표시·선택·출력 공백을 보완했다. 최신 검수는 [마감 증거](../verification/B0-C-CLOSEOUT-2026-10-09.json), 실행 상태는 [NEXT-STEPS](../../NEXT-STEPS.md)가 소유한다.

## 발견한 공백과 수정

1. 활성 평면 SVG가 일반 치수만 문자로 수집해 drafting text, 연속 치수·floor-plan·component의 문자를 누락했다. `collectExportAnnotations`가 `worldDraftingGeometry`의 문자도 같은 object/layer visibility로 수집한다. 문자만 있는 문서도 실제 파일 다운로드를 허용한다. Unicode/XML escaping, 높이·레이어 색·회전·가운데 정렬을 보존한다. 화면처럼 문자 요소는 선/이미지 위에 출력한다.
2. 일반 치수의 PDF 선과 문자에서 레이어 색·선두께·선종류가 빠졌다. SVG/PDF와 viewport dimension renderer에 같은 레이어 스타일을 연결했다. viewport 선은 LineSegments2로 물리 선두께를 픽셀로 변환한다. 선택/hover tint는 일시적인 UI이며 원래 스타일로 복원한다. PDF의 기본 치수 문자는 기존 종이 크기 3.5 mm를 유지한다; B3-D 스타일 확대를 완료로 올리지 않는다.
3. construction purpose drawing을 Center 레이어에 놓으면 화면에서는 Center dash shader를 쓰고 SVG/PDF에서는 Dashed를 썼다. `drawingLineType`으로 construction의 dashed 규칙을 공유하며 DXF entity에도 DASHED를 기록한다. 레이어 자체는 Center로 남는다. construction의 회색은 화면용 보조 tone이며 출력의 색·선두께는 저장된 layer/vector style을 따른다.
4. canvas construction을 숨겨도 Ctrl+A·Explorer·History 선택 복원에서 다시 선택됐다. `selectAllIds`/`validSelection`에 표시 context를 전달해 숨긴 purpose construction과 그 subobject를 제외한다. 일반 selection 호출은 기본 visible 정책을 유지한다. viewport가 이미 제외하던 hidden/locked hit-test와 일치시킨다.

SVG의 자동 viewBox는 회전/가운데 정렬 Unicode 문자에 보수적인 폰트 footprint를 포함한다. 브라우저 폰트 측정에 의존하는 정확한 glyph bounds나 text-to-path가 아니며, 실제 SVG 문자 렌더링은 system-ui/sans-serif 폰트를 사용한다.

## 표시·선택·출력 계약

| 상태 | 화면 / 편집 선택 | 출력 |
| --- | --- | --- |
| object 또는 소속 layer 숨김 | 표시·선택 제외 | SVG/PDF/DXF에서 제외 |
| layer 잠금 | 표시 유지, canvas/Explorer/전체 선택·편집 차단 | visible graphics는 출력 유지 |
| canvas construction 숨김 | purpose construction 표시·선택 제외 | 문서·History·출력은 그대로 유지 |
| 해치의 source만 숨김 | 해치는 자신의 object/layer 상태를 따름 | 자신의 cached associative region으로 계속 출력 |

construction 토글을 layer hidden이나 비출력 플래그로 저장하지 않는다. Hatch source ID·연관 관계는 제거하지 않는다. 새 문서 필드·공개 명령·serialization version을 추가하지 않았으며 v14를 유지한다.

## 실제 검수

새 Node 7개는 SVG 문자 속성과 XML escaping, hatch/source 독립 visibility, layer hide의 SVG/PDF/DXF 제외, lock의 출력 불변·편집 거부·History 불변, dimension의 물리 선두께·색·dash PDF operator, construction Center→Dashed 일치, Undo/Redo·save/reload·selection context를 독립 수치·파일 구조로 검사한다.

`draftingVisibility`의 새 native Edge/CDP workflow 17 checks는 실제 App/React/Worker에서 SVG 메뉴→다운로드→XML parse, layer Hide/Show·Lock/Unlock, Ctrl+A·Explorer 선택, native canvas의 hidden construction/locked hatch hit-test, object Hide→Undo, text-only 다운로드를 실행한다. 캔버스 좌표는 실제 direct grip의 screen 위치로 계산한다. fixture 준비만 공개 CAD 명령을 사용하고 대상 조작은 native 키/포인터로 수행한다. browser font가 필요한 renderer의 layer color/width/dash도 검사한다.

전체 Node·browser·타입·architecture/import/문서 링크·workspace production build 결과는 마감 JSON을 따른다. 기존 B0-B 및 휠/단축키 변경이 있는 작업 트리 전체를 검수하며 이 변경을 B0-C 단독 작업으로 보고하지 않는다. 새 대형 문서/GPU/실무자 latency benchmark는 실행하지 않았다.

## 지원 경계

아트보드 PNG/PDF 및 보드 SVG의 문자/치수 지원은 이번에 확대하지 않는다. 해당 export는 기존처럼 미지원 요소를 명시적으로 거부한다. 활성 평면 SVG/PDF/DXF가 이 카드의 출력 범위다. 무한선/ray/독립점의 finite output adapter, nested component member별 layer/purpose visibility, 사용자 작업면/UCS, 통합 종이 축척/치수 style은 별도 확대 과제로 남는다. block 전체는 소속 root layer 상태를 따르며 내부 member의 새 visibility 규칙을 도입하지 않았다.
