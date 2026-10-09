# 현재 프로젝트 상태

갱신일: 2026-10-09. 이 문서는 **현재 구현과 최근 검수**를 요약한다. 실행 순서는 [NEXT-STEPS](NEXT-STEPS.md), 기능별 지원 대상과 공백은 [CAD-BASICS](docs/product/CAD-BASICS.md)를 따른다. 단계별 상세 기록은 [문서 목록](docs/README.md)에서 찾는다.

## 최신 통합 구현·검수 상태

**CAD B0-A의 기존 조작 결함 한 종류를 수정했다.** Explorer 자식 버튼의 Enter/Space가 부모 행 선택과 충돌하고, Ribbon activation이 마지막 CAD 명령 반복으로 흐르던 문제를 native 브라우저에서 재현했다. 공통 키 판정과 행 이벤트 ownership을 수정해 컨트롤 activation·캔버스 반복·숫자 grip의 Enter/Esc·비텍스트 포커스의 문서 Undo/Redo를 유지한다. [실제 workflow·지원 경계](docs/implementation/B0-A-KEYBOARD-ACTIVATION-2026-10-09.md), [검증 증거](docs/verification/B0-A-CLOSEOUT-2026-10-09.json)를 따른다. 단위/좌표/drag 일치 B0-B와 표시/잠금/출력 B0-C는 후속이다.

B0-A만 분리한 검증 복사본에서 **677 Node / 54 suites / fail·skip 0**, architecture **327 modules**, workspace production build가 통과했다. 전체 **43 browser workflows / 916 checks**(신규 native keyboard 21)와 직접 타입 검사가 통과했다. 같은 저장소의 다른 채팅에서 휠/단축키를 변경 중이어서 동시 작업을 이 검증·커밋에 섞지 않는다. serialization **v14 유지**. main **1,062.25 kB / gzip 320.75 kB**, viewport **628.65 kB / gzip 171.17 kB**, WASM **50,305.13 kB**이며 기존 >500 kB 경고 유지. 새 latency benchmark는 없다.

## 직전 B2-A2 내부 코너 구현·검수

**CAD B2-A2 내부 코너의 D1/D2 비대칭 모따기를 완료했다.** 이전/다음 변의 단위 입력·Swap/Equal·캔버스 거리선·공통 Review/Apply·오류/잠금 입력 유지·수정 contour 선택과 다음 CAD 작업을 연결했다. 비편집 bulge 원호가 직선으로 바뀌던 문제를 수정했다. 안정된 edge/control ID와 연관 일반 치수·각도·작도·돌출을 한 transaction에서 갱신한다. [실제 범위·workflow·한계](docs/implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md), [마감 증거](docs/verification/B2-A2-CLOSEOUT-2026-10-09.json)를 따른다. 직전 [B2-A1 두 독립 윤곽](docs/implementation/B2-A1-ASYMMETRIC-CHAMFER-2026-10-09.md)은 유지한다.

최종 **677 Node / 54 suites / fail·skip 0**, **42 browser workflows / 895 checks**(신규 내부 코너 18), 타입·architecture/import·문서 링크 **328 modules**, workspace production build 통과. v14 저장·재로드, preview 원본 불변성·거리 소모/교차/잠금/경합 실패·한 Undo/Redo를 검사했다. 로그는 `output-b2-a2-node.log`, `output-b2-a2-browser-full.log`, `output-b2-a2-build.log`(apps/web 기준)다. main **1,062.06 kB**, viewport **630.43 kB**, WASM **50,305.13 kB**이며 기존 >500 kB 경고는 남는다. 이번 새 대형 문서 benchmark는 없다. 다음 요청은 **B0-A 기존 선택/입력/그립/반복 결함 한 종류 검수·수정**이다. G6-A1 모델 뷰 저장 계약은 별도 미구현이다.

## 직전 G5-B2 구현·검수

**G5-B2의 첫 편집 명령 확대를 완료했다.** gateway의 `move-object`를 선택된 독립 finite 2D drawing 한 개에 개방했다. absolute world translation mm·작업면/ownership/선택 권한과 게시 직전 context를 검증하며, 원본/결과 ghost는 detached plan에서 생성한다. 치수·중점 영향과 원본 identity를 보존하고, 편집 결과를 선택해 기존 Properties로 인계한다. 잠긴 연관 일반 치수가 갱신되던 문제와 단일 작도점 ghost 실패를 회귀 검사로 발견·수정했다. [B2 실제 workflow·지원 경계](docs/implementation/G5-B2-COPILOT-MOVE-2026-10-09.md), [마감 증거](docs/verification/G5-B2-CLOSEOUT-2026-10-09.json)를 따른다.

최종 전체 **659 Node / 54 suites / fail·skip 0**, **40 browser workflows / 859 checks**(신규 Move 25), 타입·architecture/import·문서 링크 **321 modules**, workspace build 통과. 원시 로그는 `output/g5-b2-node-2026-10-09.log`, `output/g5-b2-browser-2026-10-09.log`, `output/g5-b2-build-2026-10-09.log`다. main **1,058.73 kB** / viewport **619.05 kB**, 기존 >500 kB 경고 유지. 실제 provider·다중 사용자·Move 성능 benchmark는 실행하지 않았다. v14 유지, 기존 local Query/생성/profile/extrusion은 유지한다. 다중 대상/다른 편집 명령과 local 자연어 Move parser는 미지원이다. 다음은 G6-A1이며 아직 시작하지 않았다.

## 직전 구현·검수 기준선

**2026-10-09 목표 재정리(계획만):** 1차는 건축·기계 CAD의 동일 모델 뷰/치수 기반 수정/분해도/연관 도면, 2차는 아트보드·벡터/이미지 편집·프로토타입·슬라이드·LLM 통합이다. [범위·코드에서 확인한 기반·남은 구현](docs/product/ARCHITECTURE-MECHANICAL-MILESTONE.md)을 기록했다. 표준 카메라 전환과 primitive 수치 편집 기반이 있으나 저장된 모델 연관 도면·3D 분해도·건축 절단 평면의 전체 workflow 완료를 의미하지 않는다. 사용자가 별도로 요청한 B2를 먼저 완료했고 다음 구현은 G6-A1이다. 아래 검수 수치는 이전 G5-B1 기준선이다.

**G5-B1의 local Query 연결과 전체 검수를 완료했다.** Read selection/명시적 Read target에 실측·관계·구속·잠금/오류 설명, Cancel·context 무효화와 수동 편집 인계를 연결했다. 잠금/숨김 객체는 편집 selection을 바꾸지 않고 읽으며, 문서 게시 직후 재조회가 이전 render의 version을 사용하는 경합을 수정했다. 새 Node **8개**, 실제 pointer/Worker Query **35 checks**를 포함해 전체 **651 Node / 54 suites**, **39 browser workflows / 834 checks**, 타입·architecture/import·문서 링크 **318 modules**, workspace build가 통과했다. [B1 구현·실제 workflow·제한](docs/implementation/G5-B1-COPILOT-QUERY-2026-10-09.md), [마감 검증 요약](docs/verification/G5-B1-CLOSEOUT-2026-10-09.json)을 따른다. Query는 local 읽기이며 LLM으로 결과를 보내지 않는다. 다음 B2 편집 command와 실제 provider/G6는 시작하지 않았다.

사용자 요청으로 **G5-A3 Copilot Apply·잠금·경합 검수**를 완료했다. [A3 구현](docs/implementation/G5-A3-COPILOT-APPLY-2026-10-08.md)과 [검증 요약](docs/verification/G5-A3-CLOSEOUT-2026-10-08.json)을 따른다. [A1 응답·취소](docs/implementation/G5-A1-GATEWAY-BOUNDARY-2026-10-06.md), [A2 패널·context 수명](docs/implementation/G5-A2-COPILOT-CONTEXT-2026-10-08.md)을 포함한 **G5-A 검수**를 마친 뒤 B1으로 진행했다. 앞서 구현한 B3-C 일반 각도 치수(v14)는 [C1 계산](docs/implementation/B3-C1-ANGULAR-DIMENSION-2026-10-08.md), [C2/C3 작업·검증](docs/implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md)에 기록했다. 기존 [G4·DXF·지름](docs/implementation/G4-CAD-BASICS-2026-10-06.md)을 유지한다. 실제 LLM 연결과 G4–G6/CAD-BASICS 전체 기능 동등성을 달성한 상태는 아니다.

- G3-5: 공유 이미지 source의 texture 중복과 crop/opacity/color 재업로드를 제거했다. 최신 resource browser **34 checks**는 source 교체/Cancel의 실제 픽셀과 해제도 검사한다. 같은 4000×4000 두 배치에서 texture 2→1, 9회 편집 upload-version 증가 18→0. 2026-10-06 마감 측정 p95 **0.2ms**, texture 1·upload 증가 0. Edge/SwiftShader 9개 warm 표본이며 실사용 GPU·heap/VRAM 측정이 아니다. [전후 증거와 마감](docs/verification/G3-5-IMAGE-RESOURCES-2026-10-06.md).
- I1: PNG/JPEG/WebP와 제한된 TIFF의 공통 import/replacement decoder, Current/Replacement와 캔버스 preview, Cancel·stale·Worker abort, 원본 교체+숫자 편집 한 Apply/Undo를 추가했다. object/Scene 참조·crop/mask/color·다른 공유 배치를 보존하고 마지막 이전 source만 해제한다. 새 Node **3개**, source browser **16개**, TIFF browser **10개**. [실제 workflow·제한](docs/verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md).
- G4-A 및 첫 B/C: 원본 revision 변경 후 draft 유지, 동시 scene 변경 충돌 차단, 숨김 state의 layout collapse, editor state/time preview·link target state, 원본 Properties 선택 인계·finite nested vector component·정지 SVG 출력. Scene Node **7개**, actual pointer browser **24개**. 기존 원본 ID와 v12 유지. layout canvas handle·component override/variant·PPTX/GIF/영상은 남는다.
- CAD B3-A1/A2: ordered vertex/sparse·signed·closed bulge·inch/R12 elevation, exact control vertex writer와 회전/반사·uniform scale 왕복. Import/Export detached Review의 단위·제외·subset 수락·stale·Cancel/한 Undo, 선택한 root의 component definition closure. DXF Node **7개**, 실제 file input/download/reimport browser **18개**. width/mesh/non-default OCS/tilted/non-uniform curved geometry는 명시적 제외다.
- CAD B3-B: 원/원호 supporting circle의 일반 Ø 주석·양끝 화살표, deg/rad leader review·재배치, 원본 수정과 Trim/Join circular edge remap·source 삭제 동결·v13·DXF TEXT. Node **4개**, browser **17개**. 잠금으로 selection이 바뀌어도 검토 창/입력 유지. 공통 dimension style과 지름 전용 canvas annotation handle은 후속이다.
- CAD B3-C1–C3: 두 straight edge의 연장 교점·공통 elevation·명시적 ±ray/CW/CCW를 계산하고 각 source의 객체/edge identity를 저장한다. 원본/Sketch/Pattern 수정과 Trim/Join 참조 재연결에서 각도를 원자적으로 갱신하며 모호한 참조는 거부한다. v14 저장·재열기, 검색/리본/우클릭의 Angular Dimension 도구, 캔버스 edge picking·반지름 핸들·정밀 입력·검토/인계, DXF/SVG/PDF 출력까지 연결했다. C1 신규 **10 Node**, C2 신규 **8 Node**, C3 browser **24 checks**가 독립 검증됐다. 일반 각도는 구동 스케치 치수와 별도의 연관 주석이다.
- G5-A 검수 완료: A1의 응답 주입 거부·취소/deadline, A2의 activity 왕복 draft 유지·요청 context 검토/변경 시 폐기를 유지한다. A3에서 queued Apply의 취소와 게시 직전 동일한 authoritative review 검증, 중복 진입 차단·이전 완료의 새 요청 보호, 명시적 output layer 일치·잠금/부분 실패·만료 복구를 검수했다. 성공 뒤 공통 completed review·결과 선택·Inspect result를 제공한다. A3 신규 Node **5개**, mock transport actual UI browser **26 checks**, A1 13/A2 15개의 browser 회귀가 통과했다. Gateway는 finite drawing/primitive 생성 1–20개만 허용하고 local rule의 기존 profile/extrusion을 유지한다. 실제 공급자/서버·새 Query/편집 명령은 연결하지 않았다.
- A3 당시 전체 **643 Node / 54 suites / fail·skip 0**, **38 browser workflows / 799 checks**, architecture **313 modules**와 build가 통과했다. [A3 검증 요약](docs/verification/G5-A3-CLOSEOUT-2026-10-08.json)에 보존한다. 최신 전체는 B1의 651 Node / 39 browser·834 checks다. 실제 LLM 연결 증거는 아니다. A2 당시 638/37/773, C3 당시 636/36/758과 앞선 수치는 단계별 검수 기록이다.
- `utif@3.1.0`과 전이 `pako@1.0.11`은 TIFF 전용 Worker에만 들어가며 production Worker chunk는 **87.19 kB**다. UPNG/Typr/ag-psd/Paper/PptxGenJS는 확인한 후보이며 미설치다. Photopea 전체 편집기 소스는 가져오지 않았다.
- G6의 실제 외부 환경은 없고 새 adapter 구현은 시작하지 않았다. CAD B3-A1/A2·B·C1–C3 이후 B2-A1 두 윤곽의 비대칭 모따기를 추가했다. 나머지 B0–B5/X 카드는 계획 상태를 유지한다.

2026-10-06 설계와 후속 구현: [CAD 구현 카드](docs/product/CAD-BASICS-IMPLEMENTATION-PLAN.md)에 B0–B5/X1–X7의 경계·선행 조건·수정 위치·검수를 구분했다. 이후 B3-A1/A2·B·C1–C3를 실제 구현해 카드와 지원표를 갱신했다. 일반 CAD 전체 기능 동등성을 달성한 것은 아니다.

| 최신 검사 (2026-10-09, G5-B1) | 결과와 로그 |
| --- | --- |
| 전체 Node | [651 tests / 54 suites, fail·skip 0](output/g5-b1-node-final-2026-10-09.log) |
| 전체 browser | [39 workflows / 834 checks](output/g5-b1-browser-final-2026-10-09.log), B1 35개·A3 26개·A2 15개·A1 13개 포함. 실제 React/Worker·CDP pointer·취소·이력·수동 인계 검사. Query local / Plan mock |
| 타입·architecture | `tsc -b` 통과, 318 modules·문서 링크 통과 |
| 전체 production build | [workspace build 통과](output/g5-b1-build-final-2026-10-09.log). main 1,053.95 kB / viewport 618.81 kB, >500 kB 경고 유지. OpenCascade WASM 50,305.13 kB raw / 13,955.45 kB gzip |

원시 실행 로그는 로컬 생성 파일이며 Git에서는 제외한다. A3의 실제 workflow·제한은 [A3 기록](docs/implementation/G5-A3-COPILOT-APPLY-2026-10-08.md)에, 각도 기능은 [C2/C3 기록](docs/implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md)에 기록한다. 이전 수치는 [A2 검증 요약](docs/verification/G5-A2-CLOSEOUT-2026-10-08.json), [C3 검증 요약](docs/verification/B3-C3-CLOSEOUT-2026-10-08.json), [C1 검증 요약](docs/verification/B3-C1-CLOSEOUT-2026-10-08.json), [G5-A1 검증 요약](docs/verification/G5-A1-CLOSEOUT-2026-10-06.json)과 [G4/CAD 검증 요약](docs/verification/G4-CAD-CLOSEOUT-2026-10-06.json)에 유지한다.

이전 G3-5A/I1 최초 전체 browser는 PDF native file fetch의 `Failed to fetch`로 중단됐으며 원인은 미확정이다. 이번 전체 회귀에서는 재현되지 않았다. [이전 실패 로그](output/integrated-browser-2026-10-06.log)를 보존한다. 2026-10-06 G4/CAD 최초 Node는 DXF 정밀도가 높아져 정수 문자열을 전제한 패턴 radius 검사 한 개가 실패했다. analytic circle 개수 검사를 유지하고 실제 radius와 세 center XYZ를 독립 수치 검증하도록 보강한 최종 전체는 통과했다.

## 제품 방향

정밀한 CAD 기하와 구속을 유지하면서, 그리기·직접 편집·반복 작업·파라메트릭 설계를 편하게 연결하는 통합 제작 엔진을 만든다. 기계 설계와 건축 도면의 작업을 각각 끝낼 수 있어야 하며, 같은 엔진에서 아트보드·벡터·컴포넌트·애니메이션·와이어프레임·프레젠테이션·Copilot/LLM을 사용한다. 기능 확장은 대상·입력값·미리보기·결과 인계를 이어 주는 경험으로 평가한다. 기존 CAD와의 전체 기능 동등성을 달성한 상태는 아니다.

## 현재 구현

| 영역 | 제공하는 경로 | 남은 주요 경계 |
| --- | --- | --- |
| 2D 작성·기본 조작 | Line/Polyline/Rectangle/Circle/Arc, 독립 Point·무한 Line·Ray, XY/XZ/YZ, 단위·절대/상대/극좌표, 이동·회전·스케일·복사·미러 | Ellipse/Bezier/Spline, 사용자 UCS, 모든 도구의 정밀 입력 일관성. 통합 제작 엔진에서도 CAD 세부 기능과 허용오차·참조 의미를 우선 보존 |
| 도면 수정 | Join/Explode/Break, 정점 편집·Lengthen/Stretch·Offset, 닫힌·중간 구간 Trim과 명시적 재결합. 같은 소유 스케치·작도·중첩 패턴·치수·live 솔리드의 참조 재연결, 두 직선 끝부분 Fillet/Chamfer | 원호 코너, 비대칭 Chamfer, 혼합 sketch bulge·소유권, 해치/연속 치수·블록·변수 바인딩 source 교체 |
| 작업 연결 | 공통 commandInteraction Apply 판정, 대상·영향·오류/복구 검토, 검색/우클릭 Workflow. 공통 Undo/Redo 라우팅·입력/modal 범위·돌출 전환 정리·선택/캔버스 포커스 복원, stale review 복구 보존. History 상태 토큰으로 100개 상한·분기·다중/꼭짓점 선택·같은 파일 재열기 검증. Trim→참조 수정→Join→Edit Sketch 및 다음 도구 인계 | 전체 세션 수명 주기·정밀 입력·hover 진단 통일, 원본/결과 탐색·관계 수량 이력, 실무자 시간·재시도 평가 |
| 통합 제작 UI | Ribbon·ActivityBar·Explorer·Properties·Canvas, Artboards와 Components 뷰. 공통 Review/Apply·History로 연결된 아트보드·vector appearance·component 편집 | CAD/일러스트/와이어프레임/타임라인/슬라이드와 실제 LLM이 모두 같은 SelectionContext·ToolSession·Handoff를 공유하는 완전한 통합 Workspace |
| 이미지 편집 | PNG/JPEG/WebP와 제한된 단일 페이지 8-bit TIFF import·원본 교체, immutable RasterAsset + editable ImageNode, 공유 원본의 독립 복제·정밀 transform·aspect lock·일반 Align, size/numeric/canvas crop, rectangle/ellipse mask, placement opacity·brightness·contrast·saturation, detached Review/Apply/Cancel·History, artboard SVG/PNG/PDF composition, crop/mask/color output, v11 save/reload/recovery | TIFF는 PNG 변환 시 metadata/고비트 심도/다중 페이지를 보존하지 않음. brush/pixel mask/PSD layer/blend/clipboard, 큰 이미지 tile/cache와 실무 과제 검증. source는 per-source/document 3 MiB·16M px/8192축(TIFF 별도 4M px); PNG는 최대 8192 px/축·16M px·160 MiB estimated working; PDF는 32 pages·16M aggregate px·256 MiB estimated working·128 MiB estimated file |
| 스케치·구속 | 기본 치수/일치/수평/수직/고정과 평행·수직·동일 길이/반지름·동심·선/원 접선·점의 선/원 위·대칭. DOF/충돌, 구속을 유지하는 드래그·방향 안내, 캔버스 검토 | 호 접점 범위·호 위 점, 일반 곡선 관계, 큰 연결 스케치의 솔버 비용 |
| 스냅 | Grid/Endpoint/Midpoint/Center/Intersection/Tangent/Perpendicular/Nearest/Quadrant/Extension, 종류·격자 간격·픽셀 반경 설정, 기호·원본 표시와 Alt 억제 | 취득한 추적점 유지·해제, 복수 추적 교점·후보 전환 |
| 저장 관계·자동화 | 변수/수식·바인딩, live 2D Mirror/Linear·Grid/Radial Pattern, 중점→수직이등분선→교점 저장/재계산, 재귀 component definition/instances, Dependency Query/Inspector | component instance property override/variant, 작도 정의 편집, 공통 노드 UI |
| 치수·표현·교환 | 일반 선형/반지름/지름/각도/연속 치수, 스케치 구동 치수, 문자·해치·레이어 style·CAD vector fill/stroke/opacity/width, limited DXF와 exact bulge 왕복, active-plane/board SVG, PDF·일부 STEP/STL 출력 | 통합 치수 style/Leader, 아트보드 image output의 annotation 지원, DXF association 왕복, SVG path-node/import, gradient/mask/blend, 여러 시트·폰트, DWG/STEP/IFC 가져오기 |
| 아트보드 | CRUD·v7·mm/cm 입력·공통 detached Review/Apply/Cancel·impact·실제 frame/background·활성 선택·Fit·별도 SVG/PNG/PDF export·다중 PDF page·visible vector/raster order·crop/mask/opacity/color·보드 경계/배경 | drafting text/dimension·무한선/ray/독립점 export, 다중 선택·편집/인쇄 출판, 큰 문서 성능 측정. 생성/삭제/Hide/Lock은 즉시 한 Undo |
| 3D | 기본 솔리드, Extrude/Revolve/Sweep/Loft/Boolean/일부 엣지 Fillet·Chamfer, 원본 편집의 종속 재생성 | Axonometric ViewPreset, 면 위 스케치·연관 투영, 전용 Cut/Hole/Shell/Section Plane, 3D 미러/배열·엣지 참조 복구. RVT/IFC adapter는 미구현 |
| 웹 문서·AI·mesh | JSON 저장/열기·자동 복구·Undo/Redo, Copilot local selection/target Query·측정/관계/잠금·취소/수동 인계와 공용 Preview/Apply. 표현·측정 출처의 확장 계약 | B2 편집 allowlist·Query→LLM 설명, 실제 provider, URL 저장소·협업/버전/댓글, 편집 가능한 mesh 자산과 도구, BIM 의미 계층·Publication Graph, Manim adapter. CAD를 원본으로 한 아트보드·vector·raster image·컴포넌트·타임라인·와이어프레임·슬라이드 확장은 [통합 제작 로드맵](docs/product/UNIFIED-CREATIVE-SUITE-ROADMAP.md)에 정의 |

상세 경계: [구간 Trim·참조 재연결](docs/implementation/CONTOUR-TRIM-REFERENCES-2026-10-04.md), [곡선 작업](docs/implementation/CURVE-WORKFLOW-2026-10-04.md), [구속·스냅](docs/implementation/EXTENDED-SKETCH-AND-SNAPS-2026-10-04.md), [작도 관계](docs/implementation/CONSTRUCTION-GEOMETRY-2026-10-04.md), [G2 아트보드·벡터·컴포넌트](docs/implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md), [live 패턴](docs/architecture/LIVE-PATTERNS.md), [공통 기하 요구사항](docs/architecture/SHARED-GEOMETRY-ARCHITECTURE.md).

## 구현 구조와 변경 계약

- `packages/cad-document`가 문서·관계·직렬화를, `cad-commands`가 공개 명령·검증·결과를 소유한다. 커널 작업은 `cad-kernel`과 웹의 Worker 서비스로 실행한다.
- 도면 편집은 `apps/web/src/features/drawing-editing/{geometry,commands,ui}`에 모았다. `contracts.ts`는 타입, `registerCommands.ts`는 등록 진입점이다. 공용 변환 함수는 `precision`, 치수 명령은 별도 어댑터에 있다.
- UI·노드·AI는 같은 문서와 명령을 사용한다. Preview는 분리된 제안을 계산하고, Apply는 검토한 제안을 한 Undo로 게시한다. 오래된 계획·잠금·구속·연관 재생성 실패는 부분 변경을 남기지 않는다. 현재 viewport는 WebGL, 기하·메시 계산은 Worker와 제한된 세션 캐시를 사용한다. WebGPU backend, 영속 파생 캐시와 자원 예산은 [웹 런타임 자원 전략](docs/architecture/WEB-RUNTIME-RESOURCE-STRATEGY.md)에 정의된 다음 작업이다.
- 해석 곡선/BRep 원본과 표시용 mesh를 구분한다. Offset·두 객체 코너·Trim/Join 결과는 적용 당시의 편집 가능한 기하다. 변경되지 않은 해석 모서리 ID와 명시적으로 지정한 치수·솔리드 참조를 보존한다. 영구 Fillet/Trim 정의를 추가한 것은 아니다.
- JSON은 필요한 의미에 따라 v1–v14를 사용한다. 변수/바인딩 v2, live 패턴 v3, 작도 v4, 확장 구속 v5, topology/span 관계 v6, 아트보드 v7, image v8, ellipse mask v9, opacity v10, color adjustment v11, Scene v12, 일반 지름 주석 v13, 일반 각도 주석 v14다. 이전 버전을 읽고 새 의미가 없는 문서는 기존 최소 버전으로 저장한다. 구형 version에 새 주석 의미를 넣은 파일은 거부한다.

[디렉토리 규칙](docs/architecture/DIRECTORY-STRUCTURE.md), [재생성 계약](docs/architecture/PARAMETRIC-REGENERATION.md), [구조 리뷰](docs/reviews/CODE-REVIEW-2026-10-04.md)를 따른다.

## 최근 검수

2026-10-05 G1 후속에서 105회 복제 뒤 Undo가 옛 깊이의 객체를 선택하는 오류를 재현했다. History 상태 토큰과 App의 WeakMap 선택 기록으로 수정했다. 성공한 이력 게시·Undo/Redo·clear의 identity를 보존하고 preview/실패/no-op의 이력 불변을 확인했다. 네이티브 분기·다중/primary·꼭짓점→Explode·Hide·같은 ID 파일 open까지 23개 browser 검사, Node 7개를 추가했다. [후속 증거](docs/verification/G1-HISTORY-IDENTITY-2026-10-05.md)는 수정 전 실패·범위·로그를 기록한다. G2 첫 묶음으로 진행할 기술 검수를 통과했으며 외부 실무자 평가는 별도로 남는다.

2026-10-05 G1의 첫 묶음으로 도구·패널별 Undo/Redo와 포커스, 중첩 돌출 세션을 개선했다. 수정 전 네이티브 `Duplicate → Pattern → Fit preview → Ctrl+Z`가 12초 대기 후 실패했다. 공통 History capture와 기존 Undo/Redo·document version 경로를 재사용해 입력창의 자체 Undo와 modal 범위를 유지하고 도구/돌출을 정리한다. 살아 있는 source의 직접 편집·치수 review는 기존 stale 복구를 보존한다. [G1 증거](docs/verification/G1-SESSION-CONTINUITY-2026-10-05.md)는 실제 workflow·회귀·제한을 기록한다.

2026-10-05 G0에서 기본 sandbox의 `tsc` 미발견·`tsx` EPERM을 식별했고, 이후 허용된 정상 실행 권한에서 타입·Node·browser·build 명령을 실행했다. 기존 Node 24.19.0·pnpm 11.26.0 설치를 사용했고 dependency 재설치·lockfile 수정·작업 트리 reset을 수행하지 않았다.

2026-10-05 G2를 네 검증 묶음으로 실행했다. 아트보드 캔버스/활성 선택, 현재/전체 Fit 및 SVG, drawing vector appearance, 재사용·중첩 component 정의와 placement를 구현했다. 보드/벡터/컴포넌트 경계·현재 미지원 항목은 [G2 구현 증거](docs/implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md)에 있다. `artboardsWorkflow` 29개와 `componentsWorkflow` 13개의 실제 브라우저 검사를 추가했다.

2026-10-05 G3-1은 이미지 한 장을 실제 작업물로 가져와 저장·전달하는 vertical slice로 구현했다. File 메뉴에서 PNG/JPEG/WebP를 검증해 import하고, 공통 캔버스 선택과 Properties에서 정확한 크기 및 crop을 detached preview/Review/Apply/Cancel로 편집한다. 원본 픽셀은 content-addressed RasterAsset으로 보존하고 배치·crop은 ImageNode에 분리한다. 제한된 artboard SVG 출력은 원본을 embed하고 crop/clip을 적용한다. JSON v8 save/reload, local recovery, 한 단계 Undo/Redo, 중복 배치 source 공유, 마지막 참조 삭제·복원을 확인했다. 구현 경계는 [G3-1 구현](docs/implementation/G3-IMAGE-ASSET-2026-10-05.md), 실행 근거·성능 표본은 [G3-1 검수](docs/verification/G3-1-IMAGE-WORKFLOW-2026-10-05.md)에 있다. G3 전체 편집 계층은 아직 완료가 아니다.
2026-10-05 G3-4b2에서 아트보드 PNG composition을 추가했다. 활성 보드 File 메뉴에서 output scale, 정확한 픽셀 크기, pixel count와 보수적 working-memory estimate를 검토하고 detached preview를 만든 뒤 다운로드한다. ordered board scene의 visible drawing/vector/raster z-order와 배경·보드 clip·crop·rectangle/ellipse mask·opacity·sRGB color adjustment를 출력한다. SVG Blob decode는 메인 browser context에서 하고 ImageBitmap을 Worker로 보내 OffscreenCanvas 합성/PNG 인코딩을 처리한다. 8192 px/축, 16M px, 약 160 MiB estimated working budget을 넘기 전에 차단한다. unsupported dimension/text/infinite-line/ray/point geometry는 생략하지 않고 안내와 함께 거부한다. preview/cancel/invalid size는 원본·History를 바꾸지 않는다.

G3-4b2 당시 전체 Node 581/53 suites, browser 27 workflows/581 UI·Worker checks, typecheck, architecture 270 modules, production build가 통과했다. `artboardPngWorkflow` 25개 검사는 scale 수정, preview, 투명 배경, 실제 다운로드와 PNG decoded pixels/alpha를 확인했다. 중형 445,434 px fixture는 12,433 B PNG, 5,345,272 B estimated working memory, 27.8 ms Worker render 단일 관측이었다. 그때는 PDF composition과 대형 raster·외부 실무자 검증이 남아 있었고, PDF는 아래 G3-4b3에서 추가했다. 현재 누적 검증은 다음 단락과 표를 따른다.

2026-10-05 G3-4b3은 Artboard PDF 출력을 추가했다. File 메뉴에서 현재 보드 또는 표시 중인 보드를 고르고 72/96/150/300 DPI를 설정한다. document board order로 보드당 한 페이지를 만들며 실제 mm 크기를 PDF MediaBox로 보존한다. 기존 artboard SVG scene의 crop·mask·opacity·color·vector/raster 순서를 유지해 browser Worker에서 페이지별 JPEG(sRGB, quality 0.94)로 만들고, PDF에는 페이지마다 하나의 full-page raster XObject를 넣는다. 기존 배경은 유지하고 투명 영역은 흰색으로 평탄화한다. PDF 작성기는 내부 코드라 새 패키지 의존성이 없다. 32 pages, 16M aggregate pixels, 8192px per-axis, conservative 256 MiB working-memory estimate, 128 MiB estimated-file guard를 할당/다운로드 전에 적용한다. 텍스트·치수·무한선·반직선·독립점과 미지원/기울어진 placement는 전체 export를 차단한다. Preview/Cancel은 document와 History를 바꾸지 않는다.

전체 Node 587 tests/54 suites, browser 28 workflows/602 UI·Worker checks, TypeScript, architecture 274 modules, production build가 통과했다. `artboardPdfWorkflow` 21개 검사는 잘못된 해상도 수정, active/all-visible scope, 실제 multi-page download, PDF page count·MediaBox·JPEG pixel/white-alpha·vector/overlay pixels, history 불변과 Cancel을 확인한다. 독립 Poppler `pdfinfo`/`pdftoppm` 검증에서도 2 pages와 실제 page box 및 두 렌더가 확인됐다. 전체 browser run에서 작은 두 페이지 fixture는 32,796 B PDF, 4,372,420 output pixels, 86,822,200 B estimated working memory였다. decode 42.7 ms, Worker render 96.9 ms, 전체 preview 178.6 ms는 단일 관측치이지 p50/p95나 실제 heap/VRAM peak가 아니다. production build는 main 978.31 kB와 viewport 606.66 kB가 각각 500 kB 경고를 유지한다. 상세·한계는 [G3 이미지 편집 구현](docs/implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md)과 [검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 있다. 이는 G3-4b3 당시 기준선이며 최신 G3-5 진행 상태는 문서 상단을 따른다.

G0의 optional 삭제 게시·impact 수량·정밀 속성 입력·본문 스크롤과 실행 버튼 배치는 [G0 실행 증거](docs/verification/G0-ARTBOARDS-2026-10-05.md)와 [아트보드 구현](docs/implementation/ARTBOARDS-2026-10-05.md)을 따른다. 당시 Node 545개/50 suites, browser 22과제/454검사였고 아래 G1 최신 결과와 구분한다.

| 검사 | G3-4b3 당시 전체 기준선 (2026-10-05) | 로그 |
| --- | --- | --- |
| 전체 Node | 587 tests / 54 suites 통과, skipped 0 | crop/color/export bounds 및 multi-page PDF xref/validation 포함 |
| 실제 React·Worker·네이티브 입력 | 28 workflows / 602 UI·Worker checks 통과 | 전체 `pnpm --filter @agent-webcad/web test:browser`; `imageWorkflow` 38, `artboardPngWorkflow` 25, `artboardPdfWorkflow` 21, `interactionRelations` 17 |
| TypeScript | `pnpm --filter @agent-webcad/web exec tsc -b` 통과 | PDF dialog/renderer/worker, raster PDF writer와 plan 포함 |
| 소스 의존·문서 링크 | architecture/import guard 274 modules 통과 | G3-4b3 구현/검수 기록 포함 |
| 전체 production build | `pnpm build` workspace 전체 통과. main 978.31 kB, Viewport 606.66 kB minified; >500 kB 경고 | OpenCascade WASM 50,305.13 kB raw / 13,955.45 kB gzip. chunk 분리/asset 용량 경고는 미해결 |

첫 G1의 네 가지 도구별 단일 관측에서 작은 문서 enter 124.5–131.9ms / Undo 69.0–75.0ms / Redo 68.9–72.4ms, 배경 1,000개는 enter 209.3–274.9ms / Undo 196.9–225.3ms / Redo 173.5–213.3ms였다. Edge/SwiftShader·네이티브 입력 전송·25ms polling/settling을 포함한다. 반복 p95·순수 계산·input-to-paint·실무자 과제 시간이 아니며 이전 Undo 실패와 속도 개선 비율을 계산하지 않는다. 당시 표본은 `tmp/g1-final-browser.log`, `tmp/g1-large-session-browser-final.log`를 따른다. `output/benchmarks/g1-session-0.json`은 runner 재실행으로 최신 관측이 갱신된다. 이번 후속은 이력 정확성 수정이며 별도의 지연·heap 전후 benchmark를 수행하지 않았다.

관계 Node 12개에는 닫힌 소유 스케치→구속→Trim/재연결→Construction chain→중첩 Pattern→자식 치수→원본/자식 Extrusion을 한 transaction으로 갱신하는 검사가 포함된다. 한 Undo/Redo·v6 저장/재로드·후속 구동 치수 변경과 preview 원본 불변성을 확인했다. missing reference, 잃은 branch, 잠긴 downstream, mixed ownership, pattern identity 충돌과 지원하지 않는 mixed sketch bulge는 부분 변경 없이 실패한다.

`interactionRelations`는 runner에 등록되어 실제 검색→대상 선택→Trim→잘못된 참조/오류→복구→Apply→Join→Edit Sketch와 치수 변경을 실행한다. 검토된 입력을 바꾸면 이전 Apply가 막히며, active sketch/잠긴 레이어의 우클릭 Workflow는 다음 해결 행동을 안내한다. 기존 Pattern 검사 22개는 실제 pointer hit-test로 Fit/Apply/Cancel을 검증한다. 감사와 남은 UX 경계는 [interaction audit](docs/reviews/INTERACTION-AUDIT-2026-10-04.md)을 따른다. `tmp/trim-final-*`의 519 Node / 20 browser / 411검사는 이전 기준이다.

같은 Node fixture(배경 1,000개 + 패턴 127개, 9회)에서 경로 조회 p95 78.931→1.565 ms, preview 117.457→43.925 ms, Apply 28.781→23.600 ms였다. before/after feature index와 private path cache를 재사용하며 외부 반환값은 복제한다. [측정표](docs/verification/INTERACTION-PERFORMANCE-2026-10-04.md)는 전체 수치와 한계를 기록한다. 이 측정은 browser input-to-paint나 실무자의 작업 시간 평가가 아니다.

10-04 전체 기준선은 Node 535/49 suites, browser 21과제/429검사, architecture 243모듈이었다. 그 기록은 `tmp/ux-final-*`에 보존하며 G0 결과와 구분한다. 기존 관계 Node 12개·browser 17개는 G0 전체 회귀에도 포함한다.

남은 구조 과제는 App/Viewport session·input lifetime, 구조화된 오류 대상 연결, precision widget 전체 전환, 테스트 전체 별도 typecheck, vector path/import·component override/variant이다. 이미지/PNG/PDF latency는 작은 fixture 단일 관측이며 p50/p95·대형 source/document·retained heap·실무자 작업 시간·reference color-management의 증거가 아니다. output memory 값은 보수적 계산치이지 실제 heap/VRAM peak 측정이 아니다. PDF board 전체를 벡터 텍스트/기하로 보존하지 않고 lossy JPEG raster로 평탄화하며, 지원하지 않는 drawing geometry는 거부한다. 상세는 [G3 이미지 편집 검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 둔다. localStorage recovery는 source당 별도 key를 차지하며 브라우저 quota 영향을 받는다. WebGPU backend는 선택 불가이고 큰 문서 input-to-paint·GPU 자원·cache eviction은 측정하지 않았다. Production의 >500 kB chunk 경고와 WASM payload는 남아 있다.

## 문서 관리

현재 상태는 이 파일, 실행 순서는 NEXT-STEPS, 기능 대상/제한은 CAD-BASICS에 둔다. 수정 위치·영향·문서 갱신 순서는 [CHANGE-GUIDE](docs/architecture/CHANGE-GUIDE.md)에 둔다. 과거 검수 수치와 결정은 해당 구현·검수 문서에 보존한다. 초기 화면 작업 문서의 유효한 원칙은 디렉토리 안내에 통합하고, 오래된 raw status/build 출력 문서는 삭제했다.
