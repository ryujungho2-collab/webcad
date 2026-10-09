# 다음 작업 — 전체 과제 목록

갱신일: 2026-10-09. G 단계와 CAD B/A/C 하위 카드, 확장 X, 이미지 I, 건축·기계 도면 목표를 이 문서에서 함께 확인한다. **실행할 과제는 전체 ID로 지정한다.** `A1`은 G5-A1·G6-A1·B3-A1·B5-A1 등 서로 다른 과제를 뜻할 수 있고, 각도 치수 `C3`는 **B3-C3**다. 상위 단계의 일부가 끝나도 나머지 카드를 완료로 올리지 않는다.

상태: **완료**는 해당 지원 범위의 구현·자동 검수가 끝남, **부분**은 첫 범위만 완료, **대기**는 추가 구현/검수가 남음, **환경 필요**는 실제 외부 연결 검증이 준비되지 않음이다. 기존 기능이 있어도 확장 카드가 대기일 수 있다. 아래 표는 탐색용 목록이며 상세 계약은 연결된 기획/구현 문서가 소유한다. 최신 검수는 [PROJECT-STATE](PROJECT-STATE.md)의 **B0-A 분리 검증: 677 Node / 43 browser·916 checks**를 따른다.

빠른 이동: [제품 G](#제품-g-전체와-하위-단계) · [CAD B0/B1](#cad-b0b1--조작구성편집참조) · [CAD B2](#cad-b2--수정명령-대상-확대) · [CAD B3/A/C](#cad-b3--치수스냅교환-ac-하위-단계) · [CAD B4/B5](#cad-b4b5--호-구속작업면솔리드) · [확장 X](#확장-x--추가-객체작도클립보드3d) · [이미지 I](#이미지-i와-제작-후속) · [건축·기계 목표](#건축기계-도면-목표의-남은-연결) · [이전 기록](#이전-구현검수-기록).

## 현재 우선순위 — 1차 건축·기계 CAD

2026-10-09 사용자 목표: **1차는 동일 모델의 건축·기계 도면, 지름/길이 수치 편집, 저장 뷰와 분해도**다. **2차는 아트보드·벡터/이미지 편집·프로토타입·슬라이드·LLM 통합**이다. 기존 구현은 유지한다. [목표·기반/공백·구현 분할·완료 workflow](docs/product/ARCHITECTURE-MECHANICAL-MILESTONE.md)를 따른다.

**현재 요청은 CAD 기본 수정 공백 보완이다.** B2-A1 두 윤곽과 **B2-A2 내부 코너의 D1/D2**를 구현했다. [내부 코너의 검토·거리선·관계 갱신·한계](docs/implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md), [CAD 카드](docs/product/CAD-BASICS-IMPLEMENTATION-PLAN.md)를 따른다. **B0-A 컨트롤 Enter/Space와 CAD 반복 충돌 한 종류를 수정했다.** [대상별 실제 조작·숫자 grip·History·제한](docs/implementation/B0-A-KEYBOARD-ACTIVATION-2026-10-09.md)을 따른다. 다음 기본 조작 후보는 **B0-B 단위/좌표 입력과 drag의 일치**이며 별도 요청으로 실행한다. 인접 호 B2-B/C와 Break 참조 B1-A는 별도 검증 단위다.

동일 모델의 도면 작업 축은 **G6-A1 모델 뷰 저장 계약 → G6-A2 뷰 UI → 수치 편집 pilot → 부품/분해 표현 → 연관 정투영/건축 단면 → 시트·치수·출력 → 두 분야 전체 검수**다. 외부 환경 없이 현재 CAD에서 시작하며 G6-A1은 아직 시작하지 않았다. 사용자가 별도로 요청한 **G5-B2는 단일 2D Move로 구현**했고 [지원 계약·검수 기록](docs/implementation/G5-B2-COPILOT-MOVE-2026-10-09.md)을 유지한다. 그 밖의 gateway 편집 확대와 실제 LLM 연결은 2차 후속이다.

## 제품 G 전체와 하위 단계

상세 분할은 [WORK-SLICES](docs/WORK-SLICES-2026-10-06.md), 공통 기준은 [구현 인계](docs/IMPLEMENTATION-READINESS-2026-10-05.md)를 따른다.

| 전체 ID | 상태 | 구현된 범위 / 남은 작업 |
| --- | --- | --- |
| G0 | 완료 | 실행환경·아트보드 초기 기준선 복구/검수 |
| G1 | 부분 | 명령 전환·History·포커스 첫 범위와 후속 검수 완료. 기본 조작 확대는 B0 카드로 계속 |
| G2 | 부분 | 아트보드 frame/Fit/SVG·벡터 appearance·component 기반 완료. path/import·compound/gradient·override/variant 후속 |
| G3-1 | 완료 | 이미지 import·배치·크기/crop·SVG·저장/재열기 |
| G3-2 | 완료 | source 공유 복제·exact transform·aspect lock·Align |
| G3-3a | 완료 | 비파괴 ellipse mask/clip |
| G3-3b | 완료 | crop edge/corner 캔버스 핸들 |
| G3-4a | 완료 | placement별 opacity |
| G3-4b1 | 완료 | brightness/contrast/saturation |
| G3-4b2 | 완료 | 아트보드 PNG 합성 출력 |
| G3-4b3 | 완료 | 활성/여러 아트보드 PDF 출력 |
| G3-5 / G3-5A | 부분 | source 공유·재업로드 제거·해제·자동 회귀와 측정 마감. 실무자/native GPU·heap/VRAM 평가는 남음 |
| G4-A | 부분 | Scene/Auto Layout/state/link/player 첫 범위·검수 완료. 직접 layout 핸들 등 확장 남음 |
| G4-B | 부분 | Scene source→Properties·finite nested component 인계 완료. 격리 편집·override/variant 후속 |
| G4-C | 부분 | 검토한 state/time/layout의 정지 SVG 완료. 독립 플레이어·PPTX·GIF/APNG·영상 출력 후속 |
| G5-A1 | 완료 | gateway 응답 검증·취소/timeout·late response 경계, mock transport 검수 |
| G5-A2 | 완료 | 패널/설정 draft·요청 context 수명·변경 시 무효화 |
| G5-A3 | 완료 | authoritative Apply·잠금/경합·게시 전 Cancel·결과 인계 |
| G5-B1 | 완료 | local 선택/명시적 target Query·측정/관계/오류·수동 인계 |
| G5-B2 | 부분 | 선택된 독립 finite 2D drawing 하나의 Move 완료. 다른 편집 명령·다중 대상·local 자연어 Move 확대 남음 |
| G5 실제 LLM 연결 | 환경 필요 | provider·서버·인증·실제 응답/취소/게시 workflow 검수. A/B 완료와 구분 |
| G6-A1 | 대기 | 명명된 모델 뷰의 카메라/프레이밍 저장 계약·명령·migration·History |
| G6-A2 | 대기 | 저장 뷰 호출/이름 수정·Ribbon/검색·Fit UI. A1 이후 |
| G6-B | 대기 | 오프라인 source ID/unit/loss/asset manifest와 adapter fixture 입출력 |
| G6-C 이후 | 환경 필요 | 실제 Revit/IFC·Manim·Notion/InDesign adapter를 각각 연결/검수 |

## CAD B0/B1 — 조작·구성편집·참조

상세 계약·수정 위치·선행 조건: [CAD 구현 카드](docs/product/CAD-BASICS-IMPLEMENTATION-PLAN.md#4-b0b5-구현-카드). 현재 지원 대상: [CAD-BASICS](docs/product/CAD-BASICS.md).

| 전체 ID | 상태 | 다음 결과 |
| --- | --- | --- |
| B0-A | 완료 | 컨트롤 Enter/Space의 행 선택·CAD 반복 충돌 한 종류 수정. [숫자 grip·대상별 실제 검수와 제한](docs/implementation/B0-A-KEYBOARD-ACTIVATION-2026-10-09.md). 기본 조작 전체의 완료 아님 |
| B0-B | 대기 | 길이/각도/상대·극좌표와 drag의 계산·단위·입력 중 상태 일관성 확대 |
| B0-C | 대기 | 해치·문자·선두께·보조 형상의 가시성/잠금/출력 일관성 |
| B1-A | 대기 | Break 후 결과 조각 선택·치수/작도 참조 보존. 일반→sketch→pattern 순으로 분할 |
| B1-B | 대기 | Explode→정확한 선/호 편집→Join에서 의존 관계 복원 |
| B1-C | 대기 | 블록 인스턴스 하나의 해체, 다른 instance/definition 보존 |
| B1-D | 대기 | 다중선의 지정 변 직선↔호 전환과 topology remap |
| B1-E | 대기 | 스케치 정점/변 구성 편집→구속/구동 치수/돌출 갱신 |
| B1-F1 | 대기 | source 교체 후 해치 재연결 (B1-F의 첫 소비자) |
| B1-F2 | 대기 | source 교체 후 연속 치수 재연결 |
| B1-F3 | 대기 | source 교체 후 변수/수식 바인딩 재연결 |

## CAD B2 — 수정명령 대상 확대

| 전체 ID | 상태 | 다음 결과 / 완료 범위 |
| --- | --- | --- |
| B2-A1 | 완료 | 두 독립 윤곽의 D1/D2 모따기·unit·swap/equal·거리선·Apply→Join. [실제 범위](docs/implementation/B2-A1-ASYMMETRIC-CHAMFER-2026-10-09.md) |
| **B2-A2** | **완료** | 독립 polyline/rectangle 내부 직선 코너의 D1/D2·단위·Swap/Equal·거리선·review·치수/작도/돌출 갱신·원호/ID 보존·원자성·Undo/reload. [지원 경계](docs/implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md) |
| B2-B | 대기 | line–arc Fillet의 접점·유지할 가지·허용 구간 |
| B2-C | 대기 | arc–arc Fillet/Chamfer 및 닫힌 윤곽. 두 연산은 따로 검증 |
| B2-D | 대기 | 블록 Stretch의 완전 포함 rigid move·부분 포함 의미 |
| B2-E | 대기 | 스케치 Stretch의 구속 유지/충돌 복구·연쇄 재생성 |
| B2-F | 대기 | Lengthen의 호 각도 입력↔목표 길이 연결 |

## CAD B3 — 치수·스냅·교환 (A/C 하위 단계)

`B3-A`는 DXF 교환, `B3-C`는 일반 각도 주석의 상위 카드다. **A1/A2 완료는 A3 완료가 아니며**, 일반 주석은 스케치의 구동 치수와 구별한다.

| 전체 ID | 상태 | 다음 결과 / 완료 범위 |
| --- | --- | --- |
| B3-A1 | 완료 | DXF bulge 정확한 입출력·단위/평면 내 transform·왕복 |
| B3-A2 | 완료 | 실제 파일 Import review→편집→Export→재가져오기 |
| B3-A3 | 대기 | non-default OCS·기울어진 평면의 교환 확대 |
| B3-B | 완료 | 일반 원/허용 호의 지름 주석·leader 배치·live 갱신·재연결 |
| B3-C1 | 완료 | 두 straight edge의 각도/branch·표시 기하 계산 |
| B3-C2a | 완료 | 두 참조 create/update·refresh·한 transaction/History |
| B3-C2b | 완료 | Trim/Join remap·v14 저장/재로드·참조 원자성 |
| B3-C3 | 완료 | 검색/리본/우클릭·캔버스 선택/핸들·Review/Apply·DXF/SVG/PDF. [C2/C3 근거](docs/implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md) |
| B3-D1 | 대기 | 공통 치수 표시 단위·소수 자릿수 (B3-D 첫 범위) |
| B3-D2 | 대기 | 글자/화살표/간격·종이 축척. geometry/driver 값 보존 |
| B3-E | 대기 | 스냅 추적점 획득/해제·일시 억제·방향 잠금 |
| B3-F | 대기 | 복수 추적선 교점·후보 전환. E 이후 |

## CAD B4/B5 — 호 구속·작업면·솔리드

| 전체 ID | 상태 | 다음 결과 / 선행 |
| --- | --- | --- |
| B4-A | 대기 | point-on-arc가 실제 호 구간·끝점·branch를 유지 |
| B4-B | 대기 | line–arc 접선의 실제 접점/구간. A 이후 |
| B4-C | 대기 | arc–arc/arc–circle 접선과 치수 변경/돌출 |
| B4-D | 대기 | 자동 접선 후보를 명시적으로 영구 구속으로 확정 |
| B5-A1 | 대기 | 사용자 작업면 origin/basis/normal·좌표 변환·기존 평면 호환 |
| B5-A2 | 대기 | planar face에 붙는 frame·안정 source 참조·소멸/모호성 복구 |
| B5-B | 대기 | 면 위 스케치→치수→projection→돌출·원본 따라가기 |
| B5-C | 대기 | 프로파일 돌출 절삭을 한 reviewed command/Undo로 실행 |
| B5-D | 대기 | 위치·지름·깊이를 입력하는 기본 Hole. 면 참조/C 선행 |
| B5-E | 대기 | 제거할 면·두께를 지정하는 Shell·커널 유효성/원자성 |

## 확장 X — 추가 객체·작도·클립보드·3D

상세 지원 축: [확장 X 설계](docs/product/CAD-BASICS-IMPLEMENTATION-PLAN.md#5-기본기-밖으로-밀려나지-않도록-남겨-둘-확장-x). 기존 객체의 새 작성 방식과 새 geometry 종류를 구별한다.

| 전체 ID | 상태 | 다음 결과 |
| --- | --- | --- |
| X1-A | 대기 | 3점 원/호 |
| X1-B | 대기 | 두점+반지름/접선 기반 작성 |
| X1-C | 대기 | 정다각형 |
| X2-A | 대기 | Ellipse 객체·편집·정밀 핸들·교환 |
| X2-B | 대기 | Bezier 객체·노드 편집·교환 |
| X2-C | 대기 | Spline/NURBS 객체·편집·교환 |
| X3-A | 대기 | 저장된 작도 정의의 입력 참조 재지정 |
| X3-B | 대기 | 원–원/일반 곡선 교점·branch 유지 |
| X3-C | 대기 | 각 이등분선·외접원·내접원 |
| X4-A | 대기 | 문서 내부 기준점 clipboard·dependency closure |
| X4-B | 대기 | 문서 간 붙여넣기·ID/asset/definition remap |
| X5 | 대기 | 명명된 UCS 저장/전환·작성/수정 pilot. B5-A1 공유 |
| X6-A | 대기 | 3D Mirror |
| X6-B | 대기 | 3D Linear Pattern |
| X6-C | 대기 | 3D Radial Pattern |
| X6 후속 Section | 대기 | 솔리드 단면. 독립 하위 ID는 아직 미정 |
| X7 | 대기 | Leader·좌표/면적/호 길이 주석·측정 인계·문자 편집 확대, 종류별 분할 |

자취/함수/벡터·Euclidean 제한 모드, 평면 Boolean/Shape Builder·compound path, mesh 편집·BIM·협업/버전/댓글도 [PRODUCT-ROADMAP](docs/product/PRODUCT-ROADMAP.md)과 [공통 기하 설계](docs/architecture/SHARED-GEOMETRY-ARCHITECTURE.md)의 후속이다. 여기서 새 완료 상태나 임의 실행 ID를 만들지 않는다.

## 이미지 I와 제작 후속

1차 CAD에 필요한 기존 제작/출력 기반은 재사용하고, 새로운 2차 기능은 별도 대기열로 유지한다. [재사용·직접 구현 계획](docs/product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md)이 범위를 소유한다.

| 전체 ID / 영역 | 상태 | 다음 결과 / 완료 범위 |
| --- | --- | --- |
| I1 | 완료 | PNG/JPEG/WebP·제한된 TIFF 공통 decoder·원본 교체·asset 공유·한 Apply/Undo |
| I2 | 대기 | rectangle/polygon 선택 영역→비파괴 pixel mask. brush/지우개·tile engine은 별도 분할 |
| I3 | 대기 | 추가 필터/retouch/blend를 한 종류씩, 순서·Worker 비용·결과 인계 |
| I4 | 대기 | 이미지 clipboard→기존 decoder/asset→삽입/교체·권한/실패 복구 |
| I5 | 대기 | 제한된 PSD composite 입출력→레이어 mapping·손실 검토 |
| G2/X2 벡터 후속 | 대기 | path node/import·compound/gradient/blend/mask·text-to-path·폰트/문자 편집 |
| G4-B component 후속 | 대기 | definition 격리 편집·instance override/variant·중첩 라이브러리 검수 |
| G4-A 직접 배치 후속 | 대기 | layout 캔버스 핸들·화면/슬라이드 배치 경험 확대 |
| G4-C 출력 후속 | 대기 | 독립 prototype player·PPTX·GIF/APNG·영상, 포맷별로 분할 |

## 건축·기계 도면 목표의 남은 연결

아래 번호는 [1차 목표 문서](docs/product/ARCHITECTURE-MECHANICAL-MILESTONE.md#작은-구현-묶음)의 순서다. G6-A1/A2 외 항목은 기존 문서의 번호를 그대로 표시하며 새 A/B/C ID로 바꾸지 않는다.

| 목표 순서 / ID | 상태 | 사용자 결과 |
| --- | --- | --- |
| 1 / G6-A1 | 대기 | 동일 모델의 명명된 뷰 저장 계약 |
| 2 / G6-A2 | 대기 | 정면·평면·사시도와 저장 뷰 호출 UI |
| 3 / 수치 편집 pilot | 대기 | cylinder 지름/길이·스케치/돌출 중 한 경로부터 단위·영향 검토·편집 |
| 4a / 부품·조립 위치 | 대기 | 안정 부품 ID·조립 위치·참조/삭제 정책 |
| 4b / 비파괴 분해도 | 대기 | 부품별 방향/거리·전체 분해량·원상 복귀·측정 의미 |
| 5a / 모델 연관 정투영 | 대기 | source를 따르는 도면 선·갱신/오류·윤곽/숨은선 |
| 5b / 건축 절단·단면 | 대기 | 절단 높이/범위·개구부·단면선·원본 보존 |
| 6 / 시트·치수·출력 | 대기 | 모델 뷰→보드·축척·연관 치수→PDF/SVG/DXF |
| 7 / 두 분야 통합 검수 | 대기 | 건축/기계 예제의 수치 변경→재생성→출력·저장·이력·성능 |

성능·웹 자원·외부 실무자 평가는 모든 단계의 공통 과제다. [웹 자원 전략](docs/architecture/WEB-RUNTIME-RESOURCE-STRATEGY.md)에 따라 병목을 측정한 범위에 Worker·부분 재계산·byte budget·선택적 WebGPU/캐시를 적용한다. 자동 회귀 통과와 native GPU/heap/VRAM·사용자 작업 시간 평가를 구분한다.

## 이전 구현·검수 기록

아래는 날짜별 이력이다. 당시 “다음”과 테스트 수치는 현재 실행 큐를 대신하지 않는다. 현재 요청은 위 **B0-A**, 전체 미완료 목록은 위 표를 따른다.

**2026-10-09: CAD B2-A2 완료.** 내부 코너 두 거리의 실제 검토·오류 복구·캔버스 Enter·결과 인계와 연관 edge 치수/작도/돌출을 검사했다. 신규 Node 10개/native browser 18 checks 포함 **677 Node / 54 suites**, **42 browser workflows / 895 checks**, 타입·architecture **328 modules**·workspace build 통과. [구현](docs/implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md), [마감 증거](docs/verification/B2-A2-CLOSEOUT-2026-10-09.json).

**2026-10-09: CAD B2-A1 완료.** 두 독립 윤곽의 D1/D2 모따기와 unit·swap/equal·캔버스 표시·오류 복구·Apply→Join을 검증했다. 신규 Node 8개/native browser 18 checks 포함 **667 Node / 54 suites**, **41 browser workflows / 877 checks**, 타입·architecture **323 modules**·workspace build 통과. [마감 증거](docs/verification/B2-A1-CLOSEOUT-2026-10-09.json). 단일 내부 코너 B2-A2는 남는다.

**2026-10-09: 별도로 요청한 G5-B2 단일 2D Move를 완료했다.** 새 Node 8개와 native browser Move 25 checks를 포함한 전체 **659 Node / 54 suites**, **40 browser workflows / 859 checks**, 타입·architecture **321 modules**·workspace build 통과. [지원 범위·발견/수정·사용자 workflow](docs/implementation/G5-B2-COPILOT-MOVE-2026-10-09.md), [검수 요약](docs/verification/G5-B2-CLOSEOUT-2026-10-09.json)을 따른다. 다른 편집 명령과 실제 provider는 자동 확대하지 않았다. 다음은 위 G6-A1이다.

**2026-10-09: G5-B1 구현·전체 검수를 완료했다.** local Read selection/명시적 Read target, 측정·관계·잠금/오류·취소/context·수동 인계와 문서 게시 직후 재조회 경합을 검수했다. 전체 **651 Node / 54 suites**, **39 browser workflows / 834 checks**, 타입·architecture/import·문서 링크 **318 modules**·workspace build 통과. [B1 구현과 지원 경계](docs/implementation/G5-B1-COPILOT-QUERY-2026-10-09.md), [마감 증거](docs/verification/G5-B1-CLOSEOUT-2026-10-09.json)를 따른다. 다음 후보는 별도 요청의 **G5-B2: 기존 편집 명령 한 종류**다. 현재 allowlist와 실제 provider 연결은 확대하지 않았다.

이전 전체 기준선(2026-10-08): **G5-A1–A3 검수와 일반 각도 치수 B3-C1–C3를 완료했다.** Apply의 게시 전 취소·context 재검증·잠금/부분 실패·만료 복구·결과 인계는 [A3 기록](docs/implementation/G5-A3-COPILOT-APPLY-2026-10-08.md), 두 source/edge 치수와 v14는 [C2/C3 기록](docs/implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md)을 따른다. 최신 전체 Node **643개**, browser **38 workflows / 799 checks**, 타입·architecture **313 modules**·workspace build가 통과했다. 현재 B1 검수와 후속 B2 편집 명령 한 종류 확대를 구분한다. 실제 provider 연결은 준비되지 않았다. CAD의 다음 확장 후보는 B3-A3 OCS/기울어진 DXF와 B/X 카드다. Pro 한도의 약 15% 단위 분할은 [작업 분할](docs/WORK-SLICES-2026-10-06.md)을 따른다.

최상위 목표는 기본 CAD·벡터·이미지·레이아웃 기능을 공통 문서·선택·명령·History와 통합 UI로 연결하는 것이다. 상세 범위와 완료 기준은 [구현 인계](docs/IMPLEMENTATION-READINESS-2026-10-05.md), 실제 상태는 [PROJECT-STATE](PROJECT-STATE.md), 수정 위치는 [CHANGE-GUIDE](docs/architecture/CHANGE-GUIDE.md)를 따른다.

## 완료한 G0

기존 Node 24.19.0·pnpm 11.26.0 설치를 정상 실행 권한으로 사용했다. 재설치·lockfile 변경·reset 없이 아트보드 optional 삭제 게시, impact 수량, detached review와 실패·저장·이력을 검증했다.

전체 Node **545개/50 suites**, 실제 browser **22과제/454검사**가 통과했다. 아트보드 Node 10개·browser 25개가 포함된다. 소스 타입·G0 테스트 별도 타입·전체 build 통과, architecture 최종 결과는 [G0 증거](docs/verification/G0-ARTBOARDS-2026-10-05.md)를 따른다.

아트보드 속성 편집은 공통 Review/Apply와 Cancel을 사용한다. 당시 G0 완료 범위에는 프레임·Fit·보드 export가 포함되지 않았으며, 현재 그 세 항목은 G2에서 연결하고 검증했다.

## G1에서 구현한 첫 묶음

도구·패널별로 달랐던 Undo/Redo 경로를 공통화했다. 입력창의 자체 Undo·modal 키보드 범위는 유지한다. 도구 전환은 돌출까지 정리하고, History 후 선택·캔버스 포커스를 복원한다. 살아 있는 원본의 직접 편집·치수 review는 기존 stale 복구를 보존한다. 네이티브 세션 과제 24개를 작은 문서와 배경 1,000개에서 검증했다. 전체 결과·측정·제한은 [G1 증거](docs/verification/G1-SESSION-CONTINUITY-2026-10-05.md)를 따른다.

## G1 후속 검수 결과

105회 복제 뒤 Undo에서 이전 깊이의 객체를 잘못 선택하는 오류를 재현했다. History 상태 토큰과 WeakMap으로 수정하고 분기·다중/primary 선택·꼭짓점→Explode·Hide·같은 파일 재열기를 확인했다. [후속 증거](docs/verification/G1-HISTORY-IDENTITY-2026-10-05.md)에 신규 Node 7개·browser 23개와 전체 회귀 로그를 기록했다.

## G2 완료: 아트보드·벡터·컴포넌트 기반

G2를 네 작은 묶음으로 구현했다: (1) work plane을 보존하는 아트보드 프레임/활성 선택, (2) 현재·전체 Fit과 page bounds/background/clip이 정확한 보드 SVG, (3) CAD drawing에 저장되는 fill/stroke/opacity/width 편집, (4) definition·instance·nested resolution 기반 Component Explorer. 기존 CAD geometry와 topology 편집을 같은 객체와 History에서 사용한다.

[G2 상세 기록](docs/implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md)은 실제 support, 검수와 제한을 소유한다. Artboards browser 29개, Components browser 13개, 전체 Node 567개/53 suites, 전체 browser 25과제/518검사, TypeScript·architecture 258 modules·production build가 통과했다.

남은 vector/component 경계는 G2 전체 기능 동등성을 뜻하지 않는다. SVG path node editor/import, compound path·gradient·blend/mask, text/image 출력, component instance property override/variant, nested-library 전용 browser 흐름과 G2 대형 도면 렌더·export benchmark는 남아 있다. 별도 외부 실무자 작업 시간·재시도·복구율 평가도 자동 회귀와 구분한다.

## G3-1 완료: 이미지 한 장의 왕복 작업

G3-1 당시 기준선은 PNG/JPEG/WebP import → placement → size/numeric crop → artboard SVG → JSON v8 save/reload/Undo/Redo/recovery였다. 당시 전체는 571 Node/53 suites, 26 browser workflows/532 checks였다. 이 수치는 stage history이며 최신 결과가 아니다. 현재 이미지 범위와 검수는 [G3 누적 구현](docs/implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md)과 [최신 검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다.

G3-1 단계 기록은 당시 기준선이다. 다음 slice 상태와 최신 이미지 behavior는 cumulative [G3-2..4 구현](docs/implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md) 및 [검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다.

## G3-2..4a + G3-3b 구현: placement·mask·opacity·direct crop

이미지 복제는 원본 RasterAsset bytes를 공유하면서 placement ID와 transform을 분리한다. 일반 exact transform/Align에 참여하고 Inspector는 비율 잠금·크기·crop·Ellipse mask·opacity를 같은 detached review/apply/cancel 경로로 편집한다. Ellipse와 opacity는 viewport/SVG output 및 JSON v9/v10에 보존된다.

캔버스 crop mode에서 원본 frame과 crop boundary를 함께 보이고 edge/corner를 끌어 숫자 crop과 같은 normalized draft로 편집한다. Apply는 reviewed plan을 한 번 적용하고 source·mask·opacity·frame을 보존한다. `imageWorkflow`의 실제 pointer drag, Cancel/Apply, Undo/Redo와 SVG 검사가 추가됐다. 전체 Node 575개, browser 26 workflow/553 checks, architecture 265 modules 및 production build가 통과했다. 자세한 timing sample과 한계는 [G3 이미지 편집 검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 기록했다.

G3-4b1 당시에는 PNG/PDF composite와 대형 이미지/외부 실무자 평가가 남아 있었다. 뒤이어 G3-4b2에서 Artboard PNG, G3-4b3에서 Artboard PDF를 추가했다. Color adjustment의 당시 Node 577개, browser 26 workflow/556 checks, architecture 265 modules와 production build 결과는 해당 단계의 역사적 기준이다. 128×128 fixture pixel sample 최대 채널 변화 26.6도 한 번의 관측이다.

G3-4b2는 활성 보드를 SVG와 같은 visible drawing/vector/raster 순서로 합성해 PNG로 저장한다. Crop·rectangle/ellipse mask·opacity·brightness/contrast/saturation·배경·보드 경계를 포함하고, 스케일/픽셀 크기/메모리를 미리 검사한다. Preview와 Cancel은 원본 문서를 바꾸지 않는다. 전체 Node 581개, browser 27 workflow/581 checks, architecture 270 modules 및 production build가 통과했다. 브라우저가 실제 PNG를 내려받아 픽셀과 투명도를 디코드해 확인했다. 소형·중형 fixture의 단일 관측 수치와 지원 한계는 [G3 이미지 편집 검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 기록했다.

G3-4b3은 활성 아트보드 또는 표시 중인 여러 아트보드를 페이지별 PDF로 저장한다. 보드의 mm 크기와 순서를 보존하고 DPI·페이지 수·픽셀/메모리/파일 한계를 출력 전에 검사한다. 기존 detached SVG scene과 PNG Worker 경로를 재사용하며 alpha는 흰색 페이지에 합성하고 JPEG raster image로 넣는다. 실제 multi-page PDF를 내려받아 독립 PDF reader로 페이지 수·MediaBox·렌더 결과를 확인했다. 전체 Node 587개/54 suites, browser 28 workflows/602 checks, architecture 274 modules, TypeScript와 production build가 통과했다. 수치와 제한은 [G3 이미지 편집 검수](docs/verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 기록했다.

Photopea 관련 요청의 최초 TIFF 도입은 Node 596개·TIFF browser 9개·image browser 38개로 부분 검증했다. 이후 공통 decoder와 선택 placement 원본 교체를 구현하고 전체 회귀를 마감했다. 최신 TIFF browser 10개(Worker abort 포함), source 교체 16개, resource 34개가 전체 33 workflows/686 checks에 포함된다. 새 원본은 기존 object/Scene identity와 crop/mask/color를 유지하며 숫자 편집과 한 Undo로 적용한다. [검수·실패 로그·남은 한계](docs/verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md)를 따른다. 악의적 파일 보안 검토와 brush/PSD 전체 편집은 완료되지 않았다.

## 완료 판단

Preview·Cancel·실패는 원본과 History를 변경하지 않고 성공은 한 Undo다. 기하·단위·참조·저장 복원을 검사하며 UX는 실제 브라우저에서 확인한다. 자동 회귀와 실무자의 작업 시간·재시도 평가는 구분한다. 실행 방법은 [README](README.md), 구현 범위·검증 날짜는 PROJECT-STATE에 기록한다.
