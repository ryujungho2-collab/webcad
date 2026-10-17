# G2-S1 작업 구역 — 2026-10-11

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

G2-F1 다음으로 작업 구역을 구현했다. 평면도·단면/입면·상세 또는 조립도·부품도·가공 상세의 프레임을 이름과 배경색으로 구분한다. CAD의 실제 단면(section) 기하와 별개인 화면 정리 기능이다. 전체 **1,098 Node / 54 suites / fail·skip 0**, 타입·architecture **493 modules**·production build와 대상 native browser **5 workflows / 126 checks**를 통과했다. 전체 browser 재실행은 아니다. [마감 기록](../verification/G2-S1-CLOSEOUT-2026-10-11.json)을 따른다.

## 사용

1. 2D 화면에서 **New work area**를 누른다. 현재 작업면의 소속 없는 프레임이 초기 멤버다.
2. 이름·색·구역 origin/width/height와 프레임 체크박스를 편집한다. 다른 구역의 프레임을 선택하면 소속 이동을 표시한다. 위/아래 버튼으로 목록 순서를 바꾼다.
3. **Review work area → Apply work area**로 한 번에 적용한다. 프레임과 구역은 서로 별도의 편집 도구이며 동시에 편집하지 않는다.
4. **Work areas** 목록 또는 구역 헤더로 다시 편집한다. **Navigate work area**로 전체 구역과 프레임에 화면을 맞춘다. 구역 헤더 드래그 또는 origin 수치 변경은 프레임들의 presentation origin을 같은 delta로 이동시킨다. 드래그는 초안이며 Review/Apply 전에는 문서를 바꾸지 않는다.
5. **Collapse/Expand work area**로 멤버 프레임을 숨기고 구역을 작은 헤더로 표시하거나 다시 펼친다. 각 동작도 Undo를 제공한다. 체크박스로도 Review/Apply할 수 있다.
6. **Review delete work area → Apply work area**는 소속을 풀고 구역만 삭제한다. 프레임이나 모델은 유지된다.

## 계약

- 문서의 선택적 `workspaceSections`와 v29 파일 계약. 기존 프레임 전용 문서는 v28 그대로 유지한다.
- 단층 구역, 프레임 한 개당 소속 한 구역, 같은 XY/XZ/YZ 작업면의 도면 프레임만 허용한다. 일반 아트보드/출력 시트/다른 구역은 멤버가 아니다.
- 프레임 순서는 `frameIds` 배열에 저장하고 향후 자동 시트 선택에 인계할 수 있다. 현재 페이지 자동 배치나 번호 매김 기능은 F2/D5-F1의 범위다.
- 다른 구역에서 프레임을 가져오면 이전 소속 제거와 새 소속 추가를 하나의 Review/Undo로 적용한다. 추가·제거 자체는 프레임 좌표를 바꾸지 않는다. 기존 구역 origin을 동시에 바꾸면 최종 멤버 전체에 이동 delta를 적용한다.
- 이동은 프레임 origin만 바꾸며 원본 객체 TRS·뷰 원본·축척·crop·치수는 보존한다. 잠긴 프레임이 포함된 이동은 전체를 거부한다. 개별 프레임은 구역 안에서도 독립 이동 가능하다.
- 접기는 화면 전용 상태다. SVG/PDF/DXF는 기존 프레임 visible·member·crop·축척 계약을 사용한다. 구역 배경/라벨은 출력하지 않는다. 개별 visible=false 프레임은 기존 출력 규칙을 따른다.
- 프레임 삭제는 같은 명령에서 소속을 정리한다. 소속 있는 프레임의 작업면 변경은 해제 후에 가능하다. 빈 구역은 유지할 수 있다.
- 변경된 문서에 대한 Review는 무효다. Cancel/Escape·다른 도구 진입·문서 교체는 초안을 닫는다. 새 파일/재열기/History/batch rollback은 구역 root의 추가와 제거를 보존한다.

## 다음 순서

**G2-F2**: 기준 프레임·간격·고정 프레임을 갖는 정투영 정렬부터 구현하고, 단면/상세 참조와 구역 간 연결을 이어간다. 그 다음 **G6-D5-F1**에서 프레임/구역을 A4/A3 자동 시트에 배치한다. **G2-F3**의 좌표 정합/이어 붙이기는 마지막이다. 실제 타원 단면·일반 BRep HLR·spline 기하 확대는 별도 CAD 큐로 유지한다.

## 검수 결과

신규 Node 11개와 native UI 25개에서 멤버 소속/순서·수치/드래그 이동·잠금·stale·잘못된 수치·Review/Cancel·Undo/Redo·삭제/해제·실제 재열기를 확인했다. 기존 drawingFrames26, artboardsWorkflow31, artboardPdfWorkflow21, historySelection23도 통과했다. 모든 프레임을 접은 상태의 실제 PDF 다운로드를 검사했고 pdfinfo/pdftoppm로 2페이지·100×80mm 용지 및 1:2 모델 사각형을 독립 확인했다. 구역 배경과 라벨은 출력에 포함되지 않는다.
