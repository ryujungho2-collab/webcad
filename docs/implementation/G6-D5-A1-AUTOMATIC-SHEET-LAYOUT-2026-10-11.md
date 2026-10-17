# G6-D5-A1 자동 시트 배치 — 2026-10-11

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

기존 resolved 모델 정투영/단면을 주석·치수와 함께 한 페이지에 자동 배치하는 첫 범위를 구현했다. 새 명령 `auto-layout-model-sheet`와 기존 Model drawing sheet UI를 연결했다. [검수 기록](../verification/G6-D5-A1-CLOSEOUT-2026-10-11.json), [다음 카드](../../NEXT-STEPS.md)를 따른다.

## 사용

View → Assembly and drawings → Model drawing sheet에서 **Automatic sheet layout**을 켠다. A4/A3 세로/가로 preset 또는 사용자 paper size, 종이 origin, 여백·그룹 간격, 공통 축척 분모 후보와 도면 뷰를 지정한다. 이미 배치한 뷰는 **Keep current placement**로 고정한다. Review는 후보별 실패 사유와 선택된 1:N, 종이 경계/그룹 외곽 그림·실제 도면 ghost·배치 좌표를 보여 준다. Apply만 문서와 History를 바꾼다. 후보가 모두 넘치면 Apply가 비활성화되고 더 큰 종이/분모·고정 해제/뷰 감소를 안내한다.

작은 분모부터 정렬해 첫 성공 후보를 선택한다. 기존 고정 그룹은 종이 위치와 축척을 함께 보존하므로 다른 축척 후보는 거부한다. 출력은 기존 시트 SVG/PDF/DXF를 사용한다. A3 landscape 다운로드 PDF를 독립 렌더링해 확인한다.

## 배치와 수치 계약

각 그룹은 파생 뷰 출력, 해당 source view/output에 부착된 live/snapshot Leader, 일반 연관 치수와 source-linked chain을 포함한다. 다른 모델 부품에서 직접 측정한 주석은 뷰 부착을 명시하도록 거부한다. 한 주석이 여러 뷰에 모호하게 연결되는 경우도 거부한다. 숨겨진 output/주석과 unresolved 참조는 자동 배치 전에 복구해야 한다.

직선/폴리라인과 원/호 외곽, 치수 보조선·화살표·문자, Leader와 stroke 폭을 모두 포함한 보수적 종이 bounds를 사용한다. 원호는 전체 원 envelope를 사용한다. text bounds는 출력과 같은 system-ui glyph advance의 안전한 envelope이며 browser canvas 실측 폭이 더 크면 확대한다. Node는 동일한 보수적 문자 폭으로 계산한다. 그룹 내부의 기존 주석끼리 겹치는 것은 자동 routing으로 바꾸지 않는다.

회전 없는 bottom-left obstacle 배치로 고정 그룹을 먼저 놓고, 면적 큰 movable 그룹을 안정 ID 순서로 정렬해 기존 그룹의 오른쪽/위 후보를 검사한다. 입력이 같으면 같은 배치가 나온다. 최적 packing을 보장하지 않으며 휴리스틱이 실패하면 명시적 overflow다. 한 그룹을 페이지 경계에서 잘라 내지 않는다. 종이 여백 안에 제목 footer 10 mm band를 예약한다.

뷰는 model mm/N의 paper mm로 바뀐다. Leader의 paper 위치/geometry를 뷰 origin/scale 변화에 맞춰 함께 옮기되 글자 높이는 보존한다. snapshot의 측정값과 source token은 유지되며 자동 배치가 의도적으로 표시 위치를 옮긴다. 일반 치수와 chain은 새 source geometry를 재생성한 뒤 모델 mm 값을 표시한다. 치수 offset/문자 크기는 paper mm다. 별도의 object TRS가 붙은 주석은 reset하고 종이 point/offset을 쓰도록 안내한다.

## 문서·안전·저장

후보 계산은 clone에서 진행한다. 최종 선택만 기존 sheet 명령으로 한 번 적용하며 source model parameter·조립 배치·기하 ID는 바꾸지 않는다. 같은 문서의 기존 다른 sheet가 소유한 view를 가져오지 않는다. 잠긴 시트·출력·변경될 주석, Cancel·overflow·stale Review는 원자적으로 거부한다. 한 Apply가 한 Undo이고 Redo/실제 cache 재열기로 같은 배치를 복원한다.

실제 결과는 기존 v25의 paper size/origin·공통 denominator·view placements·title·annotation params로 저장하므로 새 파일 버전은 필요하지 않다. 축척 후보/여백/간격/고정 checkbox는 이번 Review의 session 입력이며 저장된 자동 재배치 정책이 아니다. 재열면 배치 결과를 유지하고 필요할 때 다시 후보·고정을 지정한다. 원본 모델 변경은 기존 위치에서 연관 형상을 갱신하며 자동 재배치는 다시 명시적 Review로 수행한다.

## 지원 경계와 다음

최대 64 views/12 scale candidates의 한 페이지 pilot이다. 자동 회전, 그룹 내부 annotation routing, 영구 layout constraints, 페이지 자동 분할, 도곽/template·개정 필드·정투영 뷰 정렬은 **G6-D5-A2**와 후속이다. 타원/spline·일반 HLR은 해당 곡선 카드가 구현된 후 확대한다. 새로운 layout이 existing scale/notes/source recovery를 우회하지 않는다.

## 코드와 검증

순수 `modelSheetLayout`이 bounds/packing을 담당하고 `modelSheetLayoutService`가 detached view/annotation 재생성을 연결한다. `modelSheetCommands`는 기존 sheet와 같은 소유권/잠금 경로로 commit한다. `documentPlans`의 report와 Model drawing sheet UI는 candidate/placement/bounds를 Review에 표시한다. 신규 Node 검사는 결정성·독립 bounds/gap·model/paper 수치·fixed/overflow·잠금/Cancel/stale·저장/Undo·chain·큰 치수 offset을 검증한다. 실제 브라우저는 UI 입력/Review/Apply/고정/overflow/A3/PDF/재열기를 검증한다.

최종 **1,048 Node / 54 suites / fail·skip 0**, 신규 Node 9개, 대상 native browser **7 workflows / 159 checks**(신규 자동 배치 19 포함), 타입·architecture 473 modules·production build 통과. 첫 두 분야 재열기 대기 timeout과 단독 32 checks 재검증을 검수 기록에 구분했다. 전체 browser suite 재실행은 아니다. [다운로드한 A3 자동 시트 PDF](../../output/pdf/automatic-sheet.pdf)를 pdfinfo/pdftoppm으로 독립 렌더링하고 글자·치수·그룹 간격·footer를 확인했다.
