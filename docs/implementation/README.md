# 날짜별 구현 기록

[문서 안내](../README.md) · [현재 상태](../../PROJECT-STATE.md) · [실행 큐](../../NEXT-STEPS.md)

**현재 사용법과 지원 범위는 [기능별 가이드](../features/README.md)**를 읽는다. 아래 문서는 당시 구현·설계 이유·검증 근거이며 후속 구현 전의 사용법/제한을 포함한다. 각 기록 맨 위에서 담당 대표 가이드로 이동할 수 있다.

## 공통 기반·감사·기타

- [아트보드 모델·캔버스·출력 구현 기록](ARTBOARDS-2026-10-05.md) · 2026-10-05
- [기본 CAD의 정점·길이·영역 편집](BASIC-CAD-CORE-EDITING-2026-10-04.md) · 2026-10-04
- [기본 CAD 조작과 첫 윤곽 편집 묶음](BASIC-CAD-EDITING-2026-10-04.md) · 2026-10-04
- [구현 기능 전반 통합 보강](CAD-INTEGRATION-HARDENING-2026-10-11.md) · 2026-10-11
- [캔버스 수정 의도와 영향 검수](CANVAS-EDIT-INTENT.md)
- [캔버스 대상 확인과 연속 편집](CANVAS-TARGET-EXPERIENCE.md)
- [구속에 따른 이동 안내와 드래그 제어](CONSTRAINT-GUIDED-DRAG.md)
- [저장되는 점·직선·반직선과 연쇄 작도](CONSTRUCTION-GEOMETRY-2026-10-04.md) · 2026-10-04
- [구간 Trim과 참조 재연결](CONTOUR-TRIM-REFERENCES-2026-10-04.md) · 2026-10-04
- [곡선 편집과 기능 간 작업 연결](CURVE-WORKFLOW-2026-10-04.md) · 2026-10-04
- [드래그·핸들 편집 경험 검수](DIRECT-EDIT-EXPERIENCE.md)
- [확장 스케치 구속과 정밀 스냅](EXTENDED-SKETCH-AND-SNAPS-2026-10-04.md) · 2026-10-04

## CAD B · 기본 편집·정밀도

- [B0-A — 포커스된 컨트롤과 CAD 명령의 키 소유권](B0-A-KEYBOARD-ACTIVATION-2026-10-09.md) · 2026-10-09
- [B0-B — 정밀 입력과 포인터 확정의 일치](B0-B-PRECISION-INPUT-2026-10-09.md) · 2026-10-09
- [B0-C — 기본 도면 요소의 표시·잠금·출력](B0-C-DRAFTING-VISIBILITY-2026-10-09.md) · 2026-10-09
- [B0-C1 아트보드 주석 출력](B0-C1-ARTBOARD-ANNOTATIONS-2026-10-10.md) · 2026-10-10
- [B1-A 일반 도형 Break 조각·참조 보존](B1-A-BREAK-REFERENCES-2026-10-09.md) · 2026-10-09
- [B1-B Explode→편집→Join 의존 관계 복원](B1-B-EXPLODE-JOIN-REFERENCES-2026-10-09.md) · 2026-10-09
- [B1-C 블록 인스턴스 해체·일반 도형 복원](B1-C-BLOCK-DISBAND-2026-10-09.md) · 2026-10-09
- [B1-D 다중선 지정 변의 직선↔호 전환](B1-D-EDGE-CONVERSION-2026-10-09.md) · 2026-10-09
- [B1-E 스케치 정점·변 구성 편집·구속/치수/돌출 갱신](B1-E-SKETCH-VERTICES-2026-10-09.md) · 2026-10-09
- [B1-E2 호·혼합 스케치 구성 편집](B1-E2-MIXED-SKETCH-EDITING-2026-10-11.md) · 2026-10-11
- [B1-F1 source 교체 후 해치 재연결](B1-F1-HATCH-RECONNECTION-2026-10-09.md) · 2026-10-09
- [B1-F2 source 교체 후 연속 치수 재연결](B1-F2-CHAIN-RECONNECTION-2026-10-09.md) · 2026-10-09
- [B1-F3 source 교체 후 변수/수식 바인딩 재연결](B1-F3-BINDING-RECONNECTION-2026-10-09.md) · 2026-10-09
- [CAD B2-A1 — 두 독립 윤곽의 비대칭 모따기](B2-A1-ASYMMETRIC-CHAMFER-2026-10-09.md) · 2026-10-09
- [B2-A2 — 내부 코너 두 거리 모따기](B2-A2-INTERNAL-CHAMFER-2026-10-09.md) · 2026-10-09
- [B2-B line–arc Fillet](B2-B-LINE-ARC-FILLET-2026-10-10.md) · 2026-10-10
- [B2-C arc–arc와 닫힌 윤곽 코너](B2-C-ARC-CORNERS-2026-10-10.md) · 2026-10-10
- [B2-C2 독립 line–arc Chamfer와 열린 혼합 경로 끝 연결](B2-C2-OPEN-END-CORNERS-2026-10-11.md) · 2026-10-11
- [B2-D 블록 영역 Stretch](B2-D-BLOCK-STRETCH-2026-10-10.md) · 2026-10-10
- [B2-E 스케치 Stretch 구속 유지·충돌 복구](B2-E-SKETCH-STRETCH-2026-10-10.md) · 2026-10-10
- [B2-F 호 포함각 Lengthen](B2-F-ARC-ANGLE-LENGTHEN-2026-10-10.md) · 2026-10-10
- [B3-A3 DXF OCS·기울어진 평면 교환](B3-A3-DXF-OCS-2026-10-10.md) · 2026-10-10
- [B3-A4 — TEXT/INSERT OCS·중첩 배치](B3-A4-DXF-PLACEMENT-2026-10-11.md) · 2026-10-11
- [B3-C1 — 일반 각도 치수의 계산·표시 기하](B3-C1-ANGULAR-DIMENSION-2026-10-08.md) · 2026-10-08
- [B3-C2/C3 — 두 참조 각도 치수](B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md) · 2026-10-08
- [B3-D/E/F 치수 스타일과 추적 스냅](B3-D-E-F-DIMENSION-TRACKING-2026-10-10.md) · 2026-10-10
- [B3-G1 스냅 정밀도 · B3-D3 PDF 치수 스타일](B3-G1-D3-PRECISION-OUTPUT-2026-10-10.md) · 2026-10-10
- [B4 호를 포함한 스케치 관계](B4-ARC-CONSTRAINTS-2026-10-10.md) · 2026-10-10
- [B5-A 사용자 작업면과 평면 면 연결](B5-A-WORK-PLANES-2026-10-10.md) · 2026-10-10
- [B5-B/C 면 스케치와 돌출 절삭](B5-B-C-FACE-SKETCH-CUT-2026-10-10.md) · 2026-10-10
- [B5-D 면 기준 원통형 Hole](B5-D-FACE-HOLE-2026-10-10.md) · 2026-10-10
- [B5-E 면 제거와 두께 지정 Shell](B5-E-SHELL-2026-10-10.md) · 2026-10-10
- [B5-F1 → B5-F2 — 수치 편집 pilot](B5-F12-NUMERIC-PILOT-2026-10-11.md) · 2026-10-11

## 평면도·벽·콘텐츠

- [CMP-S1 콘텐츠 슬롯 → WF-D1 바닥·천장·마감](CMP-S1-WF-D1-2026-10-16.md) · 2026-10-16
- [WF-A1 평면도 준비 — 첫 구현](WF-A1-FLOOR-PLAN-PREPARATION-2026-10-14.md) · 2026-10-14
- [WF-B2 벽 생성·반복 돌출 → WF-B3 연관 개구부](WF-B2-B3-2026-10-16.md) · 2026-10-16
- [WF-C0 + WF-A2 → WF-B1](WF-C0-A2-B1-2026-10-16.md) · 2026-10-16

## 모델·프레임·연관 도면·시트

- [중정형 도서관 검증 P0/P1 수정](COURTYARD-P0-P1-FIXES-2026-10-12.md) · 2026-10-12
- [G2 아트보드·벡터·컴포넌트 구현 기록](G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md) · 2026-10-05
- [G2-F1 도면 프레임 — 2026-10-11](G2-F1-DRAWING-FRAMES-2026-10-11.md) · 2026-10-11
- [G2-F2 프레임 연결·자동 정렬 — 2026-10-11](G2-F2-FRAME-CONNECTIONS-2026-10-11.md) · 2026-10-11
- [G2-F3 연속 도면 이어 붙이기 — 2026-10-12](G2-F3-CONTINUOUS-FRAMES-2026-10-12.md) · 2026-10-12
- [G2-S1 작업 구역 — 2026-10-11](G2-S1-WORKSPACE-SECTIONS-2026-10-11.md) · 2026-10-11
- [G6-A1 명명된 모델 뷰 저장 계약](G6-A1-MODEL-VIEWS-2026-10-09.md) · 2026-10-09
- [G6-A2 모델 뷰 저장·호출 UI](G6-A2-MODEL-VIEW-UI-2026-10-09.md) · 2026-10-09
- [G6-B 첫 오프라인 JSON fixture adapter](G6-B-OFFLINE-FIXTURE-2026-10-09.md) · 2026-10-09
- [G6-D3-B2 conic/seam 정책](G6-D3-B2-CONIC-SEAM-2026-10-13.md) · 2026-10-13
- [G6-D4-H1 건축 도면 표현](G6-D4-H1-ARCHITECTURAL-EXPRESSION-2026-10-13.md) · 2026-10-13
- [G6-D5-A1 자동 시트 배치 — 2026-10-11](G6-D5-A1-AUTOMATIC-SHEET-LAYOUT-2026-10-11.md) · 2026-10-11
- [G6-D5-A2 도곽·정렬·다중 페이지 — 2026-10-11](G6-D5-A2-FRAMES-ALIGNMENT-MULTIPAGE-2026-10-11.md) · 2026-10-11
- [G6-D5-F1 프레임·구역 자동 시트 — 2026-10-11](G6-D5-F1-FRAME-SHEETS-2026-10-11.md) · 2026-10-11
- [G6-D6-P1 — 원본 교선 재사용과 시트 후보 공유](G6-D6-P1-SECTION-REUSE-2026-10-13.md) · 2026-10-13
- [G6-D6-P2 대형 연관 출력 성능 보충 — 2026-10-13](G6-D6-P2-LARGE-OUTPUT-PERFORMANCE-2026-10-13.md) · 2026-10-13
- [G6-D6-P3 retained slab·전역 HLR 비용 보충 — 2026-10-13](G6-D6-P3-RETAINED-SLAB-2026-10-13.md) · 2026-10-13
- [G6-D6-W1 건축 프로젝트 마감 — 2026-10-13](G6-D6-W1-ARCHITECTURAL-ISSUE-2026-10-13.md) · 2026-10-13
- [G6-D1/D2/D3 — 부품·분해도·연관 정투영](G6-D123-ASSEMBLY-EXPLODED-PROJECTION-2026-10-11.md) · 2026-10-11
- [단면·주석·시트·건축/기계 workflow — 2026-10-11](SECTION-ANNOTATION-SHEETS-WORKFLOWS-2026-10-11.md) · 2026-10-11

## 세션·이미지·제작·Copilot

- [G3 이미지 placement·mask·opacity·crop·색 조정·Artboard 출력](G3-2-4-IMAGE-EDITING-2026-10-05.md) · 2026-10-05
- [G3-1 이미지 자산 vertical slice (단계 기록)](G3-IMAGE-ASSET-2026-10-05.md) · 2026-10-05
- [G4 장면 작업과 CAD 기본 치수·DXF 왕복](G4-CAD-BASICS-2026-10-06.md) · 2026-10-06
- [G5-A1 — Gateway 응답과 요청 종료 경계 검수](G5-A1-GATEWAY-BOUNDARY-2026-10-06.md) · 2026-10-06
- [G5-A1 gateway 응답 검증 보완](G5-A1-GATEWAY-RECHECK-2026-10-09.md) · 2026-10-09
- [G5-A2 — Copilot 패널 draft와 요청 context 수명](G5-A2-COPILOT-CONTEXT-2026-10-08.md) · 2026-10-08
- [G5-A3 — Copilot Apply·잠금·경합 검수](G5-A3-COPILOT-APPLY-2026-10-08.md) · 2026-10-08
- [G5-B1 — Copilot의 명시적 local Query](G5-B1-COPILOT-QUERY-2026-10-09.md) · 2026-10-09
- [G5-B1 Query 연결 — 중간 정리](G5-B1-QUERY-CHECKPOINT-2026-10-09.md) · 2026-10-09
- [G5-B2 — Copilot의 선택된 2D 도형 Move](G5-B2-COPILOT-MOVE-2026-10-09.md) · 2026-10-09

## 프로젝트·UI·자원

- [프로젝트 탭 — UI-P1](PROJECT-TABS-2026-10-14.md) · 2026-10-14
- [UI-P1-H1 — 프로젝트 저장·복구 보강](UI-P1-H1-PROJECT-RECOVERY-2026-10-14.md) · 2026-10-14
- [UI-P1-H2 — 프로젝트 검색·내보내기·삭제·용량 관리](UI-P1-H2-PROJECT-MANAGER-2026-10-14.md) · 2026-10-14
- [UI-P2-C 작업별 취소·메모리 예산](UI-P2-C-TASKS-MEMORY-2026-10-16.md) · 2026-10-16
- [UI-P2 다중 프로젝트 성능 — 2026-10-15](UI-P2-PROJECT-ACTIVITY-2026-10-15.md) · 2026-10-15
- [UI-P2-S 대형 문서 저장소 보충](UI-P2-S-DURABLE-STORAGE-2026-10-15.md) · 2026-10-15

## CAD X · 곡선·좌표·확장

- [X2-C1/C2 → X6-D2-S1 → G6-D5-E1 곡선 출력 pilot — 2026-10-13](SPLINE-NURBS-OUTPUT-2026-10-13.md) · 2026-10-13
- [X1-B2/B3 · X4-A1 · X5-A/B pilot 구현](X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md) · 2026-10-11
- [X1-A 3점 원·3점 호](X1-A-THREE-POINT-CURVES-2026-10-10.md) · 2026-10-10
- [X1-B1 두 끝점 + 반지름 원호](X1-B1-ENDPOINT-RADIUS-ARC-2026-10-10.md) · 2026-10-10
- [X1-C 정다각형 작성](X1-C-REGULAR-POLYGON-2026-10-10.md) · 2026-10-10
- [X2-A 타원 원본 기반 — 2026-10-11](X2-A-EXACT-ELLIPSE-2026-10-11.md) · 2026-10-11
- [X3-A 저장된 작도 정의 재지정](X3-A-CONSTRUCTION-REASSIGNMENT-2026-10-10.md) · 2026-10-10
- [X3-B1 원/호 live 교점](X3-B1-CIRCULAR-INTERSECTIONS-2026-10-10.md) · 2026-10-10
- [X6-D2-E1 타원 단면](X6-D2-E1-ELLIPSE-SECTIONS-2026-10-13.md) · 2026-10-13
