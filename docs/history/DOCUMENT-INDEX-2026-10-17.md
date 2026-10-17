> 2026-10-17 문서 분리 시 보존한 이력입니다. 아래 상태·순서·검증 수치는 기록 당시 기준입니다. 현재 안내는 [원래 진입 문서](../README.md), [현재 상태](../../PROJECT-STATE.md), [실행 큐](../../NEXT-STEPS.md)를 따릅니다.

# 문서 안내

최신 판단과 실행 순서는 루트의 [PROJECT-STATE](../../PROJECT-STATE.md), [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다. 날짜가 붙은 검수 기록은 해당 시점의 결과이며, 최신 전체 테스트 수를 대신하지 않는다.

수정 시작점은 [CHANGE-GUIDE](../architecture/CHANGE-GUIDE.md)다. 문제별 코드 위치·동작 영향·검증 범위와 각 문서의 갱신 책임을 연결한다. 폴더/import 규칙은 DIRECTORY-STRUCTURE, 현재 사실은 PROJECT-STATE, 다음 순서는 NEXT-STEPS가 각각 소유한다. 로드맵의 타입·패키지 이름은 구현 완료를 의미하지 않는다.

2026-10-05 기획 및 실행: G0·G1, G2 Artboard/Vector/Component 기반, G3 image import·placement·mask·opacity·canvas crop·color adjustment를 구현·검수했다. G3 현재 동작은 누적 구현·검수 기록, 최신 전체 결과는 [PROJECT-STATE](../../PROJECT-STATE.md), 다음 실행은 [NEXT-STEPS](../../NEXT-STEPS.md)가 소유한다. 날짜별 G0/G1/G3-1 초기 검수 수치는 해당 시점의 기록이다.

| 목적 | 문서 |
| --- | --- |
| 계획서 정합성·현재 실행 기준 | [2026-10-17 대조 결과·지원 범위·WF-Q1 완료 조건](../reviews/PLAN-CONSISTENCY-2026-10-17.md), [현재 실행 큐](../../NEXT-STEPS.md#현재-실행-큐) |
| CMP-S1/WF-D1 콘텐츠·건축 마감 | [사용·슬롯/소유권·기하·검증·경계](../implementation/CMP-S1-WF-D1-2026-10-16.md) |
| C1/C2·S1·E1 spline/NURBS | [원본·native 곡선·출력·경계](../implementation/SPLINE-NURBS-OUTPUT-2026-10-13.md) |
| G6-D6-P3 retained slab | [측정·가림/자원 계약](../implementation/G6-D6-P3-RETAINED-SLAB-2026-10-13.md) |
| G6-D6-P2 대형 출력 성능 | [구현·최초/warmed 측정·남은 비용](../implementation/G6-D6-P2-LARGE-OUTPUT-PERFORMANCE-2026-10-13.md) |
| G6-D6-W1 건축 프로젝트 마감 | [구현·실제 발행·남은 범위](../implementation/G6-D6-W1-ARCHITECTURAL-ISSUE-2026-10-13.md) |
| G6-D3-B2 conic/seam | [정확한 HLR·지원 정책](../implementation/G6-D3-B2-CONIC-SEAM-2026-10-13.md) |
| X6-D2-E1 타원 단면 | [사용·범위·프로젝트 검수](../implementation/X6-D2-E1-ELLIPSE-SECTIONS-2026-10-13.md) |
| G6-D4-H1 건축 도면 표현 | [사용·지원 경계](../implementation/G6-D4-H1-ARCHITECTURAL-EXPRESSION-2026-10-13.md) |
| 졸업설계 규모 CAD 기반 검증 | [중정형 도서관·메이커센터 / 보충 우선순위](../product/COURTYARD-COMMONS-CAD-AUDIT-2026-10-12.md) |
| G2-F3 연속 도면 이어 붙이기 | [사용·정합·seam·출력 경계](../implementation/G2-F3-CONTINUOUS-FRAMES-2026-10-12.md), [검수](../verification/G2-F3-CLOSEOUT-2026-10-12.json) |
| G6-D5-F1 프레임·구역 자동 시트 | [사용·배치·축척·출력 계약](../implementation/G6-D5-F1-FRAME-SHEETS-2026-10-11.md), [검수](../verification/G6-D5-F1-CLOSEOUT-2026-10-11.json) |
| G2-F2 프레임 연결·자동 정렬 | [사용·정투영·참조·이동·출력 계약](../implementation/G2-F2-FRAME-CONNECTIONS-2026-10-11.md), [검수](../verification/G2-F2-CLOSEOUT-2026-10-11.json) |
| G2-S1 작업 구역 | [사용·소속·접기·이동·출력 계약](../implementation/G2-S1-WORKSPACE-SECTIONS-2026-10-11.md), [검수](../verification/G2-S1-CLOSEOUT-2026-10-11.json) |
| G2-F1 도면 프레임 | [사용·축척·멤버·출력 경계](../implementation/G2-F1-DRAWING-FRAMES-2026-10-11.md), [검수](../verification/G2-F1-CLOSEOUT-2026-10-11.json) |
| CAD 프레임·연결·작업 구역 계획 | [생성/소속·자동 정렬·시트·이어 붙이기 카드](../product/CAD-FRAMES-SECTIONS-PLAN-2026-10-11.md) |
| X2-A 타원 원본 기반 | [사용·exact 원본·지원 경계](../implementation/X2-A-EXACT-ELLIPSE-2026-10-11.md), [검수](../verification/X2-A-CLOSEOUT-2026-10-11.json) |
| G6-D5-A2 도곽·정렬·다중 페이지 | [사용·지원 경계](../implementation/G6-D5-A2-FRAMES-ALIGNMENT-MULTIPAGE-2026-10-11.md), [검수](../verification/G6-D5-A2-CLOSEOUT-2026-10-11.json) |
| G6-D5-A1 자동 시트 배치 | [사용·지원 경계](../implementation/G6-D5-A1-AUTOMATIC-SHEET-LAYOUT-2026-10-11.md), [검수](../verification/G6-D5-A1-CLOSEOUT-2026-10-11.json) |
| CAD 도면 지원 범위 확대 계획 | [타원/spline·HLR·자동 시트 하위 카드/의존성](../product/CAD-DRAWING-EXPANSION-PLAN-2026-10-11.md) |
| X6-D1/D2·G6-D4·X7-A/E·G6-D5/D6 | [단면·주석·시트·두 분야 workflow](../implementation/SECTION-ANNOTATION-SHEETS-WORKFLOWS-2026-10-11.md), [검수](../verification/SECTION-ANNOTATION-SHEETS-WORKFLOWS-2026-10-11.json) |
| G6-D1/D2/D3 부품·분해도·모델 연관 윤곽 | [구현·사용·지원 경계](../implementation/G6-D123-ASSEMBLY-EXPLODED-PROJECTION-2026-10-11.md), [검수](../verification/G6-D123-CLOSEOUT-2026-10-11.json) |
| CAD X1-B2/B3·X4-A1·X5-A/B pilot | [접선·clipboard·UCS 구현](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md), [검수](../verification/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.json) |
| CAD B3-A4·B5-F1/F2 | [TEXT/INSERT·중첩 DXF](../implementation/B3-A4-DXF-PLACEMENT-2026-10-11.md), [수치 편집 pilot](../implementation/B5-F12-NUMERIC-PILOT-2026-10-11.md), [검수](../verification/B3-A4-B5-F12-CLOSEOUT-2026-10-11.json) |
| CAD B2-C2 line–arc Chamfer·열린 mixed 끝 연결 | [D1/D2·기하/참조·실제 UI·지원 경계](../implementation/B2-C2-OPEN-END-CORNERS-2026-10-11.md), [마감 검수](../verification/B2-C2-CLOSEOUT-2026-10-11.json) |
| B·X·G·I 실행 순서와 추가 카드 | [의존 관계·1차/2차 큐·B5-F/G6-D 분할](../product/B-X-G-I-IMPLEMENTATION-ORDER-2026-10-11.md) |
| 기존 CAD·G·X 전반 통합 보강 / B2-F2 | [실제 수정·지원 범위](../implementation/CAD-INTEGRATION-HARDENING-2026-10-11.md) |
| CAD B1-E2 호·혼합 sketch 구성 편집 | [실제 저장·solver·편집·UI 변경](../implementation/B1-E2-MIXED-SKETCH-EDITING-2026-10-11.md), [마감 증거](../verification/B1-E2-CLOSEOUT-2026-10-11.json) |
| CAD B0-C1 아트보드 주석 출력 | [SVG/PNG/PDF·표시·변환·clip 계약](../implementation/B0-C1-ARTBOARD-ANNOTATIONS-2026-10-10.md), [마감 증거](../verification/B0-C1-CLOSEOUT-2026-10-10.json) |
| CAD B3-G1·D3 스냅 정밀도·PDF 스타일 | [교점·출력 크기 계약](../implementation/B3-G1-D3-PRECISION-OUTPUT-2026-10-10.md), [마감 증거](../verification/B3-G1-D3-CLOSEOUT-2026-10-10.json) |
| CAD B계열 보충 검토 | [B0–B5 공백·재현·우선순위](../product/CAD-B-SUPPLEMENT-REVIEW-2026-10-10.md), [재현 증거](../verification/CAD-B-SUPPLEMENT-REVIEW-2026-10-10.json) |
| CAD X1-B1 두 끝점+반지름 원호 | [중심·방향·작성·지원 경계](../implementation/X1-B1-ENDPOINT-RADIUS-ARC-2026-10-10.md), [마감 증거](../verification/X1-B1-CLOSEOUT-2026-10-10.json), [다음 구현 검토](../product/CAD-X-NEXT-IMPLEMENTATION-REVIEW-2026-10-10.md) |
| CAD X3-B1 원/호 교점 | [branch·접선·호 구간·지원 경계](../implementation/X3-B1-CIRCULAR-INTERSECTIONS-2026-10-10.md), [마감 증거](../verification/X3-B1-CLOSEOUT-2026-10-10.json), [다음 구현 검토](../product/CAD-X-NEXT-IMPLEMENTATION-REVIEW-2026-10-10.md) |
| CAD X3-A 작도 정의 재지정 | [원본·요소·교점 branch·종속 갱신·지원 경계](../implementation/X3-A-CONSTRUCTION-REASSIGNMENT-2026-10-10.md), [마감 증거](../verification/X3-A-CLOSEOUT-2026-10-10.json) |
| CAD X1-C 정다각형 | [내접/외접 반지름·회전·편집·돌출·교환 연결](../implementation/X1-C-REGULAR-POLYGON-2026-10-10.md), [마감 증거](../verification/X1-C-CLOSEOUT-2026-10-10.json) |
| CAD X1-A 3점 원·호 | [작성·방향·정확도·스케치·기존 편집 연결](../implementation/X1-A-THREE-POINT-CURVES-2026-10-10.md), [마감 증거](../verification/X1-A-CLOSEOUT-2026-10-10.json) |
| CAD 확장 X 실행 계획 | [X1–X7 현재 코드·세부 카드·선행 조건·완료 기준 검토](../product/CAD-X-IMPLEMENTATION-REVIEW-2026-10-10.md) |
| CAD B5-E Shell | [제거할 면·안쪽 두께·재생성·재지정·지원 경계](../implementation/B5-E-SHELL-2026-10-10.md), [마감 증거](../verification/B5-E-CLOSEOUT-2026-10-10.json) |
| CAD B5-D 면 기준 Hole | [중심·지름·깊이·관통·재생성·지원 경계](../implementation/B5-D-FACE-HOLE-2026-10-10.md), [마감 증거](../verification/B5-D-CLOSEOUT-2026-10-10.json) |
| CAD B5-B/C 면 스케치·돌출·절삭 | [로컬 작도·치수·live 재생성·Review/Apply·지원 경계](../implementation/B5-B-C-FACE-SKETCH-CUT-2026-10-10.md), [마감 증거](../verification/B5-B-C-CLOSEOUT-2026-10-10.json) |
| CAD B5-A 작업면·평면 면 참조 | [자유 frame·BRep 면 연결·정확한 참조·재연결·지원 경계](../implementation/B5-A-WORK-PLANES-2026-10-10.md), [마감 증거](../verification/B5-A-CLOSEOUT-2026-10-10.json) |
| CAD B4 호 스케치 관계 | [실제 호 구간·접점·후보 검토·치수/돌출·v17](../implementation/B4-ARC-CONSTRAINTS-2026-10-10.md), [마감 증거](../verification/B4-CLOSEOUT-2026-10-10.json) |
| CAD B3 치수 스타일·추적 스냅 | [단위/축척·복수 교점·단축키·검수와 경계](../implementation/B3-D-E-F-DIMENSION-TRACKING-2026-10-10.md), [마감 증거](../verification/B3-D-E-F-CLOSEOUT-2026-10-10.json) |
| CAD B2-F 원호 각도 Lengthen | [포함각↔목표 길이·방향/경계·실측 검증](../implementation/B2-F-ARC-ANGLE-LENGTHEN-2026-10-10.md), [마감 증거](../verification/B2-F-CLOSEOUT-2026-10-10.json) |
| G4 독립 프로토타입 출력 | [자급식 HTML player·상태/애니메이션/링크·검수와 지원 경계](../verification/G4-OFFLINE-PROTOTYPE-2026-10-10.md) |
| CAD B2-E 스케치 Stretch | [구속/구동 치수 유지·충돌 복구·연쇄 재생성·검수](../implementation/B2-E-SKETCH-STRETCH-2026-10-10.md), [마감 증거](../verification/B2-E-CLOSEOUT-2026-10-10.json) |
| CAD B3-A3 DXF OCS | [analytic OCS·기울어진 평면·Review·왕복 검수](../implementation/B3-A3-DXF-OCS-2026-10-10.md), [마감 증거](../verification/B3-A3-CLOSEOUT-2026-10-10.json) |
| CAD B2-D 블록 Stretch | [전체 포함 rigid move·부분 포함 인계·envelope·검수](../implementation/B2-D-BLOCK-STRETCH-2026-10-10.md), [마감 증거](../verification/B2-D-CLOSEOUT-2026-10-10.json) |
| CAD B2-C arc–arc/닫힌 코너 | [Fillet·원호 길이 Chamfer·정점/해 선택·폐합/Offset·검수](../implementation/B2-C-ARC-CORNERS-2026-10-10.md), [마감 증거](../verification/B2-C-CLOSEOUT-2026-10-10.json) |
| CAD B2-B line–arc Fillet | [bounded 접점·유지 가지·복수 해·radius guide·검수](../implementation/B2-B-LINE-ARC-FILLET-2026-10-10.md), [마감 증거](../verification/B2-B-CLOSEOUT-2026-10-10.json) |
| G6-B 첫 JSON fixture 구현 | [계약·단위/ID·Preview/Apply·v16·asset/loss·왕복](../implementation/G6-B-OFFLINE-FIXTURE-2026-10-09.md), [마감 증거](../verification/G6-B-CLOSEOUT-2026-10-09.json) |
| G6-B 오프라인 adapter 분류 | [B1 계약 → B2 변환 → B3 검토/적용 → B4 export/왕복, 실행 계약·지원 경계](../product/G6-B-OFFLINE-ADAPTER-PLAN.md) |
| G6-A2 모델 뷰 저장·호출 UI | [Ribbon/검색·표준 뷰/Fit·실제 camera 복원·지원 경계](../implementation/G6-A2-MODEL-VIEW-UI-2026-10-09.md), [마감 증거](../verification/G6-A2-CLOSEOUT-2026-10-09.json) |
| G6-A1 모델 뷰 저장 계약 | [camera·명령·v15·History·복원 adapter와 UI 후속](../implementation/G6-A1-MODEL-VIEWS-2026-10-09.md), [마감 증거](../verification/G6-A1-CLOSEOUT-2026-10-09.json) |
| G5-A1 gateway 응답 검증 보완 | [정확한 JSON 타입·UTF-8 거부·지원 경계](../implementation/G5-A1-GATEWAY-RECHECK-2026-10-09.md), [대상 검수와 통합 실패 기록](../verification/G5-A1-RECHECK-2026-10-09.json) |
| CAD B1-B·C·D 상태 재검증 | [현재 완료 범위·전단 회귀 수정·대상별 재검증 증거](../verification/B1-BCD-RECHECK-2026-10-09.json) |
| CAD B0-A 키 소유권·반복·숫자 grip | [포커스된 버튼의 native activation·대상별 workflow·제한](../implementation/B0-A-KEYBOARD-ACTIVATION-2026-10-09.md), [마감 증거](../verification/B0-A-CLOSEOUT-2026-10-09.json) |
| CAD B0-B 단위·좌표·포인터 확정 | [기본 작도·점 기반 변환의 공통 계산·입력 복구·작업면 검수](../implementation/B0-B-PRECISION-INPUT-2026-10-09.md), [마감 증거](../verification/B0-B-CLOSEOUT-2026-10-09.json) |
| CAD B0-C 표시·잠금·출력 | [기본 도면 요소의 SVG 문자·레이어 스타일·보조 형상 선택·실제 검수](../implementation/B0-C-DRAFTING-VISIBILITY-2026-10-09.md), [마감 증거](../verification/B0-C-CLOSEOUT-2026-10-09.json) |
| CAD B1-A 일반 Break 조각·참조 보존 | [지원 명령·실제 검수·스케치/패턴 후속 경계](../implementation/B1-A-BREAK-REFERENCES-2026-10-09.md), [마감 증거](../verification/B1-A-CLOSEOUT-2026-10-09.json) |
| CAD B1-B Explode→편집→Join 의존 복원 | [정확한 선·호 분해·참조·profile/scene·검수·경계](../implementation/B1-B-EXPLODE-JOIN-REFERENCES-2026-10-09.md), [마감 증거](../verification/B1-B-CLOSEOUT-2026-10-09.json) |
| CAD B1-C 블록 인스턴스 해체 | [단일 해체·world 복원·1단계/재귀·실제 검수·경계](../implementation/B1-C-BLOCK-DISBAND-2026-10-09.md), [마감 증거](../verification/B1-C-CLOSEOUT-2026-10-09.json) |
| CAD B1-D 지정 변 직선↔호 전환 | [접속점 고정·반지름/방향·참조 재연결·실제 검수·경계](../implementation/B1-D-EDGE-CONVERSION-2026-10-09.md), [마감 증거](../verification/B1-D-CLOSEOUT-2026-10-09.json) |
| CAD B1-E 스케치 정점·변 구성 편집 | [직선 구성·구속/구동 치수/돌출·실제 검수·경계](../implementation/B1-E-SKETCH-VERTICES-2026-10-09.md), [마감 증거](../verification/B1-E-CLOSEOUT-2026-10-09.json), [재검증](../verification/B1-E-RECHECK-2026-10-09.json) |
| CAD B1-F1 source 교체 후 해치 재연결 | [전체 결과 재지정·영역 재생성·실제 검수·경계](../implementation/B1-F1-HATCH-RECONNECTION-2026-10-09.md), [마감 증거](../verification/B1-F1-CLOSEOUT-2026-10-09.json) |
| CAD B1-F2 source 교체 후 연속 치수 재연결 | [단일 결과 인계·점열 갱신·실제 검수·경계](../implementation/B1-F2-CHAIN-RECONNECTION-2026-10-09.md), [마감 증거](../verification/B1-F2-CLOSEOUT-2026-10-09.json) |
| CAD B1-F3 source 교체 후 바인딩 재연결 | [단일 결과 인계·의미 변경 거부·실제 검수·경계](../implementation/B1-F3-BINDING-RECONNECTION-2026-10-09.md), [마감 증거](../verification/B1-F3-CLOSEOUT-2026-10-09.json) |
| 단축키·Ctrl+K·Tab·화면 조작 | [현재 키 조합·공식 앱 비교·향후 추천](../product/SHORTCUTS-AND-NAVIGATION.md) |
| 1차/2차 제품 목표 | [1차 건축·기계 CAD / 2차 아트보드·제작·LLM](../product/ARCHITECTURE-MECHANICAL-MILESTONE.md) |
| CAD B2-A1/A2 기본 수정 공백 | [두 독립 윤곽의 D1/D2·Join](../implementation/B2-A1-ASYMMETRIC-CHAMFER-2026-10-09.md), [내부 코너 D1/D2·공통 review·원호/참조 보존·관계 갱신](../implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md), [A2 마감 증거](../verification/B2-A2-CLOSEOUT-2026-10-09.json) |
| 현재 범위 분할·재시작 프롬프트 | [각도 C1–C3·G5-A/B1·B2 첫 범위 / 다음 G6-A1 모델 뷰 계약](../WORK-SLICES-2026-10-06.md) |
| G5-B2 gateway 편집 첫 범위 | [단일 2D Move·대상/좌표 계약·관계 갱신·원자성·인계](../implementation/G5-B2-COPILOT-MOVE-2026-10-09.md), [659 Node·40 browser/859 checks·build/321 module guard](../verification/G5-B2-CLOSEOUT-2026-10-09.json) |
| G5-B1 local Query 구현·전체 검수 | [선택/명시적 target·잠금/측정·취소·버전 경합·수동 인계](../implementation/G5-B1-COPILOT-QUERY-2026-10-09.md), [651 Node·39 browser/834 checks·build/318 module guard](../verification/G5-B1-CLOSEOUT-2026-10-09.json) |
| G5-B1 중단 당시 기록 | [Node/타입까지의 checkpoint](../implementation/G5-B1-QUERY-CHECKPOINT-2026-10-09.md), [당시 집중 Node 15개](../verification/G5-B1-CHECKPOINT-2026-10-09.json). 최신은 B1 closeout |
| G5-A3 Apply·잠금·경합 구현/검수 | [게시 전 취소·owner 재검증·새 요청 보호·결과 인계](../implementation/G5-A3-COPILOT-APPLY-2026-10-08.md) |
| G5-A3 전체 검증 요약 | [643 Node·38 browser/799 checks·타입/build/313 module guard](../verification/G5-A3-CLOSEOUT-2026-10-08.json) |
| G5-A2 패널 draft·요청 context 구현/검수 | [activity 왕복, off-panel 응답, context 변경과 늦은 제안 폐기](../implementation/G5-A2-COPILOT-CONTEXT-2026-10-08.md) |
| G5-A2 전체 검증 요약 | [Node/browser·타입/build/architecture와 mock 연결 경계](../verification/G5-A2-CLOSEOUT-2026-10-08.json) |
| 일반 각도 치수 C1 계산·branch·표시 기하 | [실제 계약·오류·검수와 UI/명령/저장 미완료 경계](../implementation/B3-C1-ANGULAR-DIMENSION-2026-10-08.md) |
| 일반 각도 치수 C2/C3 참조·명령·UI·출력 | [두 source remap·v14·검토/Apply·브라우저 검증과 남은 범위](../implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md) |
| B3-C3 전체 검증 요약 | [636 Node·36 browser/758 checks·타입/build/308 module guard](../verification/B3-C3-CLOSEOUT-2026-10-08.json) |
| B3-C1 전체 검증 요약 | [628 Node·기존 browser 35/734·타입/build/304 module guard](../verification/B3-C1-CLOSEOUT-2026-10-08.json) |
| G5-A1 응답·취소 경계 구현/검수 | [stalled body·late response 종료, ownership 주입 거부·복구 workflow](../implementation/G5-A1-GATEWAY-BOUNDARY-2026-10-06.md) |
| G5-A1 전체 검증 요약 | [618 Node·35 browser/734 checks·빌드/타입/301 module guard](../verification/G5-A1-CLOSEOUT-2026-10-06.json) |
| G4·CAD 최신 구현 및 검수 | [원본·component 인계·state/time/link·SVG·DXF review·지름 v13](../implementation/G4-CAD-BASICS-2026-10-06.md) |
| G4·CAD 전체 검증 결과 요약 | [613 Node·35 browser/729 checks·빌드/타입/301 module guard](../verification/G4-CAD-CLOSEOUT-2026-10-06.json) |
| CAD 구현 카드·선행 조건·책임 분리 | [B0–B5 보완 및 X1–X7 신규 기능 설계](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md) |
| 공개 코드 재사용·직접 구현·기존 CAD/제작 계획 연결 | [코덱·PSD/폰트/벡터/PPTX 후보와 native 이미지 원본 교체](../product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md) |
| G3-5 자원 최적화·전체 자동 회귀 마감 | [동일 fixture 전후 수치·수명 검사·남은 외부 평가](../verification/G3-5-IMAGE-RESOURCES-2026-10-06.md) |
| 원본 교체·TIFF·이미지 편집 연결 검수 | [실제 preview/Cancel/Apply·source identity·전체 검사·제한](../verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md) |
| 수정 위치·영향·문서 갱신 | [CHANGE-GUIDE](../architecture/CHANGE-GUIDE.md) |
| 다음 구현 전 최종 기획 | [IMPLEMENTATION-READINESS-2026-10-05](../IMPLEMENTATION-READINESS-2026-10-05.md) |
| 기능 기준·제품 방향 | [CAD-BASICS](../product/CAD-BASICS.md), [PRODUCT-ROADMAP](../product/PRODUCT-ROADMAP.md), [통합 제작 제품 방향](../product/UNIFIED-CREATIVE-SUITE-ROADMAP.md) |
| 공통 모델·확장 구조 | [공통 기하](../architecture/SHARED-GEOMETRY-ARCHITECTURE.md), [디렉토리 규칙](../architecture/DIRECTORY-STRUCTURE.md), [스케치](../architecture/PARAMETRIC-SKETCH.md), [재생성](../architecture/PARAMETRIC-REGENERATION.md), [수식](../architecture/VARIABLES-AND-EXPRESSIONS.md), [live 패턴](../architecture/LIVE-PATTERNS.md), [오픈소스 제작 통합](../architecture/OPEN-SOURCE-CREATIVE-INTEGRATION-2026-10-05.md) |
| 웹 런타임 자원 | [WebGPU·Worker·캐시 전략](../architecture/WEB-RUNTIME-RESOURCE-STRATEGY.md) |
| 수학 애니메이션 | [Manim 연동 계획](../architecture/MANIM-MATH-ANIMATION-INTEGRATION.md) |
| BIM·RVT·Axo | [RVT·IFC·Axonometric 연동 계획](../architecture/RVT-IFC-AXONOMETRIC-INTEGRATION.md) |
| BIM 출판·외부 앱 오케스트레이션 | [BIM 목록·검토·출판](../architecture/BIM-PUBLICATION-ORCHESTRATION.md) |
| 최신 편집 구현 | [구간 Trim·참조 재연결](../implementation/CONTOUR-TRIM-REFERENCES-2026-10-04.md), [곡선 작업 연결](../implementation/CURVE-WORKFLOW-2026-10-04.md), [구속·스냅](../implementation/EXTENDED-SKETCH-AND-SNAPS-2026-10-04.md), [작도 관계](../implementation/CONSTRUCTION-GEOMETRY-2026-10-04.md), [아트보드 모델](../implementation/ARTBOARDS-2026-10-05.md), [G2 아트보드·벡터·컴포넌트](../implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md), [기본 편집](../implementation/BASIC-CAD-CORE-EDITING-2026-10-04.md), [윤곽 구성](../implementation/BASIC-CAD-EDITING-2026-10-04.md) |
| G3 이미지 편집 | [G3-1 RasterAsset/ImageNode 기초](../implementation/G3-IMAGE-ASSET-2026-10-05.md), [placement·mask·opacity·crop·color adjustment·Artboard PNG/PDF 구현](../implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md), [최신 browser·Node·build 검수와 timing sample](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md), [G3-1 당시 기준선](../verification/G3-1-IMAGE-WORKFLOW-2026-10-05.md) |
| 캔버스 편집 경험 | [편집 의도](../implementation/CANVAS-EDIT-INTENT.md), [직접 편집](../implementation/DIRECT-EDIT-EXPERIENCE.md), [구속 이동 안내](../implementation/CONSTRAINT-GUIDED-DRAG.md), [대상 선택](../implementation/CANVAS-TARGET-EXPERIENCE.md) |
| 검수·성능·한계 | [기본 검수](../verification/CORE-VERIFICATION-2026-10-03.md), [작업 흐름 검수](../verification/WORKFLOW-VERIFICATION-2026-10-03.md), [편집 벤치마크](../verification/CAD-EDIT-BENCHMARK-2026-10-03.md), [성능](../verification/PERFORMANCE.md), [UX 점검](../verification/UX-AUDIT-2026-10-03.md) |
| 코드 리뷰 | [2026-10-04 구조·의존·테스트 리뷰](../reviews/CODE-REVIEW-2026-10-04.md), [interaction 감사·구현·남은 경계](../reviews/INTERACTION-AUDIT-2026-10-04.md) |
| 관계 UX 성능 | [Preview/경로 조회 전후 측정](../verification/INTERACTION-PERFORMANCE-2026-10-04.md) |
| G0 실행·아트보드 검증 | [실행 환경·원자성·실제 패널 workflow](../verification/G0-ARTBOARDS-2026-10-05.md) |
| G1 첫 세션 개선 | [명령 전환·History·포커스·큰 문서 관측 지연](../verification/G1-SESSION-CONTINUITY-2026-10-05.md) |
| G1 후속 검수 | [100개 이력 상한·분기·선택/위상 참조·같은 파일 재열기](../verification/G1-HISTORY-IDENTITY-2026-10-05.md) |

## 갱신과 삭제 기준

- 현재 구현·최근 전체 검수는 PROJECT-STATE, 다음 실행 순서는 NEXT-STEPS, 기능별 대상·제한은 CAD-BASICS가 소유한다. 로드맵에는 이후 확장과 통과 기준을 둔다. 완료 이력을 루트 문서에 반복하지 않는다.
- 구현 문서는 해당 단계의 사용법·정책·검수, 검수 문서는 측정 조건·출력·한계를 보존한다. 오래된 테스트 수와 “다음” 항목을 최신 판단으로 사용하지 않는다.
- 후속 구현으로 바뀐 제한은 근거 문서를 연결해 갱신한다. 중복된 원칙은 소유 문서에 통합하고, 고유한 기하/측정/검수 근거가 없는 임시 기록은 삭제한다. 삭제·이동 시 들어오는 링크도 갱신하고 `check:architecture`를 실행한다.

2026-10-04 정리: 상태·다음 작업·로드맵의 중복 이력을 줄이고 완료/미완료를 정정했다. `DESIGN-PASS.md`의 유효한 표현 원칙은 [디렉토리 안내](../architecture/DIRECTORY-STRUCTURE.md)에 통합했으며 오래된 raw status/build 출력 문서는 삭제했다. 날짜가 있는 고유한 구현·검수 기록은 유지한다.

- [중정 프로젝트 P0/P1 수정](../implementation/COURTYARD-P0-P1-FIXES-2026-10-12.md)

- [G6-D6-P1 원본 교선 재사용·시트 후보 공유](../implementation/G6-D6-P1-SECTION-REUSE-2026-10-13.md)
