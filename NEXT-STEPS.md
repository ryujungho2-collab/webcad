# 프로젝트 통합 안내와 다음 작업

최신 과제(2026-11-05, Claude): [ARC 1.7 전기주전자 2D/3D 검증](docs/implementation/ARC-KETTLE-2026-11-05.md). 검증 44/45. 자유곡면 투영·단면 불가, 큰 솔리드 쉘 면 키 불일치, 대칭 투영 중복 오류를 커널·도면 쪽에서 고쳤다. 남은 일: STEP 체적 편차 0.26%, 자동 시트 배치 거부, 시트 치수·표제란.

실무 검토 우선순위(2026-11-05): [PRACTICE-REVIEW-01](docs/implementation/PRACTICE-REVIEW-01-2026-11-05.md)의 요구조건 표와 후속 순서를 따른다. 공통 UI/MCP 간격·도면 검사는 구현했으며, 실제 주택의 주방 간격 결함을 수정했다. 다음은 외벽–창호–바닥 한 접합부의 재료층/연결 요구와 상세 단면 검증, 요구조건·이슈의 영속 저장, 실/문/층 관계·연속 경로, 도면 요구/치수 연결이다. 더 많은 부품이나 검사 통과 수를 산업용 설계 완성도로 보고하지 않는다.

최신 회귀 점검(2026-11-04, Claude): [회귀 스위트 복구와 UI 버그 수정](docs/implementation/TEST-HEALTH-AND-UI-FIXES-HANDOFF-2026-11-04.md). tsc·아키텍처 검사 통과, Node 1828/1829, 브라우저 172/183. 저장 측정 패널 중복(React 키), Direct 모드에서 캔버스를 덮던 측정 패널, 미리보기 Fit이 편집 패널 뒤로 숨던 문제, Copilot `cad.tools` 64 KiB 초과 등을 고쳤다. Fit 여백은 View › Fit margin(Roomy 기본/Balanced/Tight) 설정으로 바꿨다. 남은 11개 실패와 진단은 문서에 있다.

최신 UI 자동화 과제(2026-10-31, Claude): [UI만으로 만든 졸업작품 3종과 사용성 수정](docs/implementation/UI-AUTOMATION-GRADUATION-HANDOFF-2026-10-31.md). 실제 UI 조작으로 2D·3D·2D→3D 작품을 만들며 드러난 문제를 원본에서 고쳤다(Polyline Esc 확정, 텍스트 클릭 배치, Annotate 리본, 뷰 초점 생성, 커널 예열, Extrude 재바인딩, 큰 형상 상대 테셀레이션, Fit, 중복 이름 표시, 대화상자 글꼴, Hover 기본 꺼짐). 브라우저 스위트와 전체 Node 스위트는 아직 돌리지 않았으며, 실패 기록과 자동화 스크립트를 함께 남겼다.

최신 파빌리온 재작업(2026-10-25): [중정 파빌리온과 A1 판넬](docs/implementation/COURTYARD-PAVILION-2026-10-25.md). 최종 모델과 별도 연관 도면, STEP, 고해상도 실제 CAD 뷰와 A1 판넬을 인계했다. 다음 확장은 구조·접합 및 배수 상세 또는 건축 도면 출력 연결을 별도 과제로 다룬다. 현재 안의 개념설계와 기하 검증을 시공도서나 미적 평가의 완료로 확대하지 않는다.

최신 공간 곡선 과제(2026-10-25): [공간 곡선 파빌리온](docs/implementation/PAVILION-HANDOFF-2026-10-25.md). 공간 XYZ 편집과 접선 정렬, 결과 경계 공유를 연결했다. 이후 과제는 경로 roll 제어·개별 접선 핸들·3D 곡선 간 구속 또는 비균일 점 간격의 제어를 기준으로 고른다. smooth loft의 입력 단면 높이를 최종 경계로 간주하지 않고 측정값을 검토한다.

최신 연속 곡선 과제(2026-10-24): [C2 라운지체어](docs/implementation/CHAIR-HANDOFF-2026-10-24.md). C2 보간과 원본 정책 보존을 연결했다. 다음에는 개별 접선 핸들·곡선 간 구속·3D 공간 곡선 또는 비균일 점 간격의 제어처럼 아직 연결되지 않은 작업을 기준으로 과제를 고른다. C2를 미적 점수나 자동 최적화로 설명하지 않는다.

최신 곡선 과제(2026-10-24): [S자 조명 · 정확한 spline 스윕](docs/implementation/LAMP-HANDOFF-2026-10-24.md). 열린 spline 스윕과 기존 reshape의 접선 강도 편집을 연결했다. 다음 곡선 과제는 개별 접선 핸들·곡률 연속성·곡선 간 접선 구속처럼 아직 없는 편집 흐름을 기준으로 고른다. 이번 C1 통과점 보간을 C2 곡률 최적화로 설명하지 않는다.

최신 완료(2026-10-24): [비정형 세면 볼의 혼합 윤곽·MCP 검증](docs/implementation/BASIN-HANDOFF-2026-10-24.md). 원·NURBS 구멍과 섬, 공유된 순면적 조회, 비동기 검증 접수를 실제 과제로 연결했다. 다음 개선은 복잡한 live Boolean과 연관 단면 재검증의 중복 연산·대기 시간을 먼저 측정해 줄이는 방향이다. 비동기 접수는 연결 timeout을 해결하지만 연산 자체를 빠르게 하지는 않는다. 이후 열린 스플라인 경로·혼합 edge chain을 검증 과제로 고른다.

최신 완료(2026-10-24): [비정형 전시 키오스크의 곡선 수정 인계](docs/implementation/KIOSK-HANDOFF-2026-10-24.md). 12종 공통 폼과 제한된 점 이동 자연어를 기존 MCP 도구에 연결하고 닫힌 스플라인의 실제 3D 전달을 보완했다. 다음 과제는 혼합 곡선 경계·구멍 또는 열린 곡선 경로처럼 현재 명시적으로 거절하는 작업을 기준으로 고른다. 단면 대응이 바뀌면 숨기고 명시 재연결하는 경계를 유지하며, 단순 객체 수 확대를 목표로 삼지 않는다.

최신 과제 검증(2026-10-24): [곡선 손잡이·설치판의 회전/스윕 인계](docs/implementation/HANDLE-HANDOFF-2026-10-24.md). 회전축의 평면/세계 방향 안내, 스윕 단면/경로 역할 교환, 숫자 폴리라인 입력을 기존 공통 도구에 연결했다. 정확한 ID 검색을 원본 윤곽의 부분 일치보다 우선하도록 고쳤다. 실제 BRep 절단의 동심원으로 핀 간극을 검사한다. 사람 폼 9 / canonical 39 / MCP 42이며 전체 수동 도구 노출이나 자율 설계·체결 성능 검증은 아니다.

최신 과제 검증(2026-10-24): [2D 순서 단면 → 편심 전환 덕트](docs/implementation/DUCT-HANDOFF-2026-10-24.md). 원 단면 세 개의 순서 이동과 원/로프트 사람용 폼을 공통 도구에 연결했다. 3D 부품/2D 윤곽 필터로 이름이 같은 연관 도면을 구분한다. 내부 자연어와 사람 폼의 로프트를 비교하고 실제 MCP로 내부 통로·플랜지·체결 구멍·연관 단면을 완성한다. canonical 39 / MCP 42는 유지하며 형상 기능 확대나 자율 설계 완성을 뜻하지 않는다.

최신 과제 검증(2026-10-24): [벽걸이 외함·덮개의 작업 인계](docs/implementation/ENCLOSURE-HANDOFF-2026-10-24.md). 형상 도구 추가 대신 코파일럿 내부의 명시 대상 검색/선택/추가/순서 전환을 실제 캔버스·자연어·MCP 선택과 연결했다. 다른 부품 선택 시 현재 치수와 오류를 갱신한다. 두 부품의 체적·구멍 중심·조립/분리 위치·실제 연관 단면·Undo/재열기를 검증한다. canonical 39 / MCP 42는 유지하며 전체 수동 기능 노출·자율 설계·제조 검증을 의미하지 않는다.

최신 연결 검증(2026-10-24): [센서 브래킷 · 사람–Copilot–MCP 인계](docs/implementation/SHARED-TOOL-HANDOFF-2026-10-24.md). 새 형상 기능 대신 네 canonical 도구의 사람용 폼과 동일 Review/Apply/Undo 연결을 제공했다. 자연어 초안·gateway 설정을 유지하며 실제 SDK로 사람이 만든 부재의 수정·조회·가공과 사람의 후속 Boolean을 수행한다. coplanar face 선택을 위한 명시적 tessellation bounds를 보완했다. 전체 수동 도구의 MCP 노출이나 자율 설계 완성은 아니다.

최신 주택 과제(2026-10-24): [틈마당집](output/projects/lightwell-house/README.md)을 공통 MCP와 내부 코파일럿으로 실제 작성·수정·검증했다. [보완 내용](docs/implementation/HOUSE-MCP-01-2026-10-24.md)은 층 레이어/이름/마감과 새 슬래브 윤곽·계단 홀 조합을 기존 Review에 연결하는 범위다. 다음 확대에서는 이 원본의 벽·계단·실·마당 관계와 변경 후 정적 주석/창호 상세의 동기화 격차를 기준으로 기능을 고른다. 추가 객체 수나 테스트 통과를 건축적 품질 점수로 대체하지 않는다. 아래 과거 전시관/졸업설계 과제 기록은 이 주택 과제와 구분한다.


최신 사용자 우선순위(2026-10-23): 개별 기능 추가보다 공통 도구와 MCP 연결을 먼저 정비한다. [CAD MCP](docs/architecture/CAD-MCP.md)는 기존 37개 도구를 모델과 독립된 stdio 연결로 제공하며 문맥·검토·게시·오류·취소 경계를 공유한다. 이후 수동 기능을 노출할 때도 이 계약과 실제 클라이언트 검증을 먼저 갖춘다. 외부/로컬 모델은 MCP 호스트가 선택 연결하며 내부 기하 실행기를 복제하지 않는다.

최신 사용자 요청(2026-10-23): 대형 설계 재생성보다 CAD 기능 사용부터 개선했다. 기존 벽·개구부·슬래브·연관 절단을 내부 코파일럿에 연결하고 작은 공간에서 수정·통과 여유 조회·Undo·재열기를 검증했다. [Native 건축 기능 연습](docs/implementation/COPILOT-NATIVE-ARCHITECTURE-01-2026-10-23.md). 다음 확대도 실제 부재와 변경 관계가 확인되는 과제로 평가한다. 자동 벽 접합·실/층 관계·경로 탐색·미적 판단은 이번 완료 범위가 아니다.

최신 검증(2026-10-23): 졸업설계 과제는 자체 설계 완주 미달로 판정했다. 설계자 입력을 작성·수정하는 기능과 대지/실/층/문/동선/보이드 관계를 스스로 구성하는 기능을 구분했다. 후속 우선순위는 이 관계의 내부 데이터와 요구사항 연결·누락/충돌 검사다. 곡선 하나나 더 많은 객체로 성공을 대신하지 않는다. [근거](docs/implementation/COPILOT-GRADUATION-TASK-01-2026-10-23.md).

최신 사용자 요청(2026-10-23): 모델 연결을 필수가 아닌 선택 기능으로 분리했다. 내부 의도·수치·대안·피드백 수정·CAD 검증·Undo를 완결하고 설치 Ollama의 실제 질문/대안/정확한 통과점 수정도 검증했다. 이후 지원 작업/의도 문법 확대는 내부 엔진을 기준으로 하며 외부 provider/vision/자동 미적 평가와 구분한다. [구현/사용법](docs/implementation/COPILOT-INTERNAL-OPTIONAL-01-2026-10-23.md).

최신 사용자 요청(2026-10-22): GitHub 조사에서 찾은 의도 전달·대안·판단 보조 원칙을 [Design study](docs/implementation/COPILOT-DESIGN-STUDY-01-2026-10-22.md)로 구현했다. Copilot에서 실제 곡선/솔리드 파라미터 대안을 검토·적용하고 인간 판단을 기록할 수 있다. 후속은 실제 provider를 새 design-explore 계약에 연결한 뒤 미확정 요구를 어떤 대안으로 구체화하는지 평가하는 것이다. 로컬 곡선 변형의 통과를 아름다운 건축 설계의 완성으로 간주하지 않는다.

현재 사용자 과제(2026-10-22): [비정형 레퍼런스 비교](docs/product/FLOW-REFERENCE-REVIEW-2026-10-22.md)를 기준으로 2층 문화 전시관을 다시 구성한다. R1의 둥근 외곽+타원 중정+축소 상층을재사용하는 것을 기본값으로 두지 않는다. 주/보조 공간의 위계, 대지에서 이어지는 진입 마당, 낮은 진입부와 높은 홀, 상층 보이드 관계를 1F·2F·진입 단면에서 함께 검토한다. 가구 배치와 대량 도면 발행은 그다음이다. 사용자는 상급부터 하고 최상급으로 높이겠다고 했으므로 현재 단계에서 자유곡면 패널 전개나 3D 완성으로 넘어가지 않는다.

제품 목적(2026-10-19): [자연어 CAD·코파일럿 목적과 판단 기준](docs/product/NATURAL-LANGUAGE-CAD-PURPOSE-2026-10-19.md)을 따라 자연어로 2D 도면과 3D 모델을 생성하고 대화로 수정하는 능력을 목표로 한다. 2D는 검증 축이며 최종 범위의 상한이 아니다. 외부 도면 이해·수정·복원은 학습·검증 수단이다. 목적 문서는 실행 큐와 구분하며, 근거에 따라 선택한 작업만 이 문서의 현재 실행 큐에 반영한다. 이번 목적 정리로 새 실행 항목이나 고정된 다음 스텝을 추가하지 않는다.


최신 검증(2026-10-19): [주거 외부 도면 수정·복원 01](docs/implementation/EXT-CIVIL-RESTORE-01-2026-10-19.md) 완료. 다섯 항목 변경 후 Undo/직접 편집 복원과 실제 UI 9개 검사를 통과했다. 기준/복원 문서는 revision 외 일치, DXF 표시 선분 36,631개 일치. 다음에는 단위·블록·곡선·규모가 다른 도면으로 확대한다.


최신 추가(2026-10-19): [EXT-CIVIL-03 대형 가져오기 개선](docs/implementation/EXT-CIVIL-03-2026-10-19.md). 준비 진행·취소와 탐색기/다중 선택 인덱스 개선. 실제 파일 Apply 단일 관측 37.4초 → 16.0초. 해치 15개 제외와 동기 parse/후속 편집 지연은 남아 있다.



최신 추가 검증(2026-10-19): [EXT-CIVIL-02 외부 주거 도면 2차 개선](docs/implementation/EXT-CIVIL-02-2026-10-19.md) 완료. HATCH 46/61 복원, 색상 상속·v48·전체 DXF 왕복 검증. 남은 15개 gradient/곡선 해치와 대형 파일 UI 성능은 후속 범위다.

갱신: 2026-10-18. **프로젝트 문서는 여기서 시작한다.** 이 문서가 전체 문서를 연결하고 실행 순서를 관리한다. 현재 사용법·지원 범위는 기능별 대표 문서, 상세 설계는 계획서, 실행 결과는 검증 기록이 각각 소유한다.

[현재 실행 큐](#현재-실행-큐) · [WF-Q1 완료 조건](#wf-q1-완료-조건) · [진행·검증 상태](PROJECT-STATE.md) · [설치·실행](README.md#시작)

## 기능별 문서 연결

3D·자동화 후속 작업을 고를 때는 [외부 CAD 7종 비교와 적용 기준](docs/product/CAD-REFERENCE-ADOPTION-2026-10-19.md)을 함께 본다. 기존 3D 연산과 코파일럿 공개 도구의 격차, 적용 위치, 생성→수정→검증 과제를 정리한 참고 설계이며 착수·완료 상태는 아니다.

기능을 고르면 대표 가이드에서 사용법·제한·구현/검증 근거까지 확인할 수 있다. 후속 변경을 설계할 때는 같은 행의 계획서를 읽는다.

| 기능 | 현재 설명의 기준 | 후속 설계 |
| --- | --- | --- |
| 상위 캔버스·소유/참조 | [상위 캔버스](docs/features/CANVASES.md) | [캔버스 확장 계획](docs/product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md) |
| 상태·입력·접근성 | [상태와 키보드](docs/features/INPUT-ACCESSIBILITY.md) | [워크스페이스 계획](docs/product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md) |
| 프로젝트·저장·복구 | [프로젝트와 저장](docs/features/PROJECTS.md) | [워크스페이스 계획](docs/product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md) |
| 속성·수치·표현 편집 | [속성 패널](docs/features/PROPERTIES.md) | [워크스페이스 계획](docs/product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md) |
| 선택 문맥 도구 | [선택에 맞는 도구](docs/features/SELECTION-TOOLS.md) | [워크스페이스 계획](docs/product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md) |
| 작도·스케치·참조 편집 | [정밀 작도와 편집](docs/features/DRAWING-EDITING.md) | [CAD 구현 단위](docs/product/CAD-BASICS-IMPLEMENTATION-PLAN.md) |
| 작업면·솔리드 | [솔리드 모델링](docs/features/SOLID-MODELING.md) | [CAD 구현 단위](docs/product/CAD-BASICS-IMPLEMENTATION-PLAN.md) |
| 평면도·벽·창호·가구 | [평면도와 건축 콘텐츠](docs/features/FLOOR-PLANNING.md) | [평면도 확장 계획](docs/product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md) |
| 연관 도면·프레임·시트·출력 | [도면과 출력](docs/features/DRAWINGS-OUTPUT.md) | [도면 확대](docs/product/CAD-DRAWING-EXPANSION-PLAN-2026-10-11.md), [프레임·구역](docs/product/CAD-FRAMES-SECTIONS-PLAN-2026-10-11.md) |
| 이미지·아트보드·장면 | [이미지와 장면](docs/features/IMAGES-SCENES.md) | [통합 제작 목표](docs/product/UNIFIED-CREATIVE-SUITE-ROADMAP.md) |
| Copilot·자동화 | [Copilot](docs/features/COPILOT.md) | [통합 제작 목표](docs/product/UNIFIED-CREATIVE-SUITE-ROADMAP.md), [평면도 작업 설계](docs/product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md) |

개발 시에는 [수정 위치·문서 책임](docs/architecture/CHANGE-GUIDE.md)과 [구조 규칙](docs/architecture/DIRECTORY-STRUCTURE.md)을 따른다. 상세 증거는 [구현 기록](docs/implementation/README.md)·[검증 기록](docs/verification/README.md)·[리뷰](docs/reviews/README.md), 과거 결정은 [이력](docs/history/README.md), 전체 파일 탐색은 [문서 색인](docs/README.md)에서 찾는다.

<a id="현재-실행-큐--2026-10-14"></a>

## 현재 실행 큐

2026-10-20 **CAFE-2F-02 도면→3D CAD·모델링**. 사용자 지시에 따라 공간 배치 재설계는 차후로 미루고 [완성한 R0 도면의 3D 변환](output/projects/large-cafe/3d/README.md)을 수행했다. 1,114개 BRep·STEP·재료 GLB·층별/분리 뷰어·정확 단면과 원본을 작성했다. [구현·검증 기록](docs/implementation/CAFE-2F-02-2026-10-20.md)을 따른다. 후속 기능 후보는 가구 조합의 live source 연결·선택 기반 변환 UI·대형 STEP 성능이다. 원래 2D 12장/20종 에셋과 배치 검토는 [CAFE-2F-01](docs/implementation/CAFE-2F-01-2026-10-20.md)을 보존하며, 배치 재설계나 실시설계 완료로 처리하지 않는다.

2026-10-19 **CAD-TOOLS-02 도구 확대 지원 범위 완료**. 공통 23개 도구로 world 단면/경로·정확한 모서리 조회·회전/스윕/로프트·필렛/모따기/셸을 연결했다. [구현·검증](docs/implementation/CAD-TOOLS-02-2026-10-19.md) · [연동 계약](docs/architecture/CAD-TOOL-INTERFACE.md). 실제 Worker에서 6종 연산·한 Undo·재열기·STEP 독립 재검사를 확인했다. 다음 후보는 실제 판단 모델 연결과 더 다양한 연속 설계·수정 과제, 명시적 면/모서리 인계 확대다.

2026-10-19 **CAD-TOOLS-01 첫 지원 범위 완료**. 공통 도구 catalog·스냅샷 조회와 gateway 왕복을 연결했고, 일반 스케치/돌출·면 Hole·Boolean 제안을 기존 Review/Apply로 실행한다. [구현·검증](docs/implementation/CAD-TOOLS-01-2026-10-19.md) · [연동 계약](docs/architecture/CAD-TOOL-INTERFACE.md). 실제 판단 모델 연결, 다양한 요구의 생성·후속 수정 평가와 추가 피처는 후속 후보로 유지한다.

2026-10-19 **COPILOT-SOLID-01 첫 지원 범위 완료**. 외부 CAD 비교에서 선택한 첫 3D 과제로 4공 판 자연어 recipe와 관계를 보존하는 후속 치수 편집을 구현했다. [구현·검증](docs/implementation/COPILOT-SOLID-01-2026-10-19.md). 다음 과제는 이 기반에서 실제 판단 엔진 연결, 도구 확대·면 선택 또는 다른 3D/2D 과제의 효과를 비교해 선택한다. 케이스나 3D 도면 발행 과제를 이번에 완료 처리하지 않는다.

2026-10-18 **외부 주거 도면 기반 1차 개선 완료**. Civil_projects DWG/PDF를 고정해 검증했고 MTEXT·정적 치수 표시 블록·숨김 표시 누락을 수정했다. 전체 Node 1491개, 신규 Chrome 13개·회귀 116개, architecture 704모듈·build 통과. 원본과 비교한 다음 우선순위는 **HATCH와 개체별/ByBlock 스타일 보존**이며 Edge 대형 입력 응답 지연도 남아 있다. [구현·비교](docs/implementation/EXT-CIVIL-01-2026-10-18.md) · [검증 manifest](docs/verification/EXT-CIVIL-01-2026-10-18.json).

2026-10-18 **주거 과제 측정→도면 발행 통합 검증 완료**. 기존 A3에 저장 치수가 누락되는 문제를 도면 연결로 해결했다. 실제 가구 수정에서 3395→3295mm 갱신·Undo/Redo·v47 재열기·도면 위 배치를 확인했다. [구현·지원 범위](docs/implementation/MEAS-RESIDENTIAL-DRAWING-2026-10-18.md) · [검증](docs/verification/MEAS-RESIDENTIAL-2026-10-18.json). 후속 측정 기능은 실제 과제에서 필요한 경우 선택한다.

**WF-Q1·UI-P3-A 좌우 비교·UI-P3-B 탭 탐색은 2026-10-17 첫 지원 범위로 완료**했다. UI-C2 선택 문맥 도구·UI-C3 속성 패널·UI-C4 프로젝트 시작 화면도 첫 지원 범위로 완료했고 UI-C5 상태·입력·접근성도 2026-10-18 첫 지원 범위로 완료했다. G6-D4-H2 곡선 해치와 G6-D5-E2 곡선 DXF도 2026-10-18 첫 지원 범위로 완료했다. G6-D6-P4 캐시·cold HLR도 [첫 지원 범위로 완료](docs/implementation/G6-D6-P4-CACHE-COLD-HLR-2026-10-18.md)했고 G2-W1 프로젝트 내부 탐색도 [첫 지원 범위로 완료](docs/implementation/G2-W1-PROJECT-NAVIGATION-2026-10-18.md)했고 G2-W2 재사용 부품·표현 라이브러리도 [첫 지원 범위로 완료](docs/implementation/G2-W2-REUSABLE-LIBRARY-2026-10-18.md)했고 G6-D5-Q1 출력 전 점검도 [완료](docs/implementation/G6-D5-Q1-OUTPUT-PREFLIGHT-2026-10-18.md)했고 I-UX1 이미지 배치 경험도 [구현·검증 완료](docs/implementation/I-UX1-IMAGE-PLACEMENT-2026-10-18.md)했다. UI-P4 파일 기반 공유/협업도 [구현·검증 완료](docs/implementation/UI-P4-PROJECT-BUNDLES-2026-10-18.md)했다. CAN-A1도 [구현·검증 완료](docs/implementation/CAN-A1-CANVAS-HIERARCHY-2026-10-18.md)했고 CAN-A2도 [구현·검증 완료](docs/implementation/CAN-A2-FLEX-LAYOUT-2026-10-18.md)했고 CAN-A3도 [첫 지원 범위 구현·검증 완료](docs/implementation/CAN-A3-CONTENT-SCALE-2026-10-18.md)했다. MEAS-H1도 [유한 도면 기하 첫 지원 범위 구현·검증 완료](docs/implementation/MEAS-H1-HOVER-DISTANCE-2026-10-18.md)했다. 아래 후속/병행 표시는 착수나 완료를 뜻하지 않는다.

| 순서 | 카드 / 종류 | 사용자에게 생기는 변화 | 선행 / 첫 완료 기준 |
| --- | --- | --- | --- |
| 완료 | **WF-Q1 실제 주거 과제 검증** | 준비→벽/개구부→슬롯 창호/가구→평면/단면/A3 발행·수정/재발행·재열기 | [구현·검증](docs/implementation/WF-Q1-RESIDENTIAL-2026-10-17.md) · [manifest](docs/verification/WF-Q1-2026-10-17.json) |
| 완료 | **UI-P3-A 좌우 비교** | 두 프로젝트 좌우 배치·크기 조절·활성 전환·분할 복원 | [구현·검증](docs/implementation/UI-P3-A-PROJECT-COMPARISON-2026-10-17.md), 프로젝트별 Undo/명령/선택 격리·분할 해제에도 세션 유지 |
| 완료 | **UI-P3-B 탭 탐색** | 탭 순서 이동·고정·열린 프로젝트 검색·키보드 전환 | [구현·검증](docs/implementation/UI-P3-B-TAB-NAVIGATION-2026-10-17.md), pointer/keyboard·한글 IME·1440/960px·세션 유지·Retry/재열기 |
| 완료 | **UI-C2 선택 문맥 도구** | 선/곡선·솔리드·프레임·주석별 자주 쓰는 명령만 표시 | [구현·검증](docs/implementation/UI-C2-SELECTION-TOOLS-2026-10-17.md), registry·잠금/혼합 이유·Review/Apply/Undo·960px/확대 |
| 완료 | **UI-C3 속성 패널 정리** | 핵심 수치·단위·스타일을 먼저 보고 고급 설정은 펼침 | [구현·검증](docs/implementation/UI-C3-INSPECTOR-2026-10-17.md), 혼합값·단위·선택 변경·잠금·UI 접기 저장·SVG/PDF |
| 완료 | **UI-C4 프로젝트 시작 화면** | 최근 프로젝트·미리보기·검색·복구·샘플/템플릿으로 시작 | [구현·검증](docs/implementation/UI-C4-PROJECT-HOME-2026-10-17.md), 저장 XY 미리보기·독립 샘플·복구/Retry·세션 유지 |
| 완료 | **UI-C5 상태·입력·접근성** | 저장 상태·작업 진행·취소·단축키를 일관되게 이해 | [구현·검증](docs/implementation/UI-C5-INPUT-ACCESSIBILITY-2026-10-18.md), 저장/다운로드 구분·실 Worker 취소·키보드/IME·포커스·960px/확대 |
| 완료 | **G6-D4-H2 곡선 해치 보충** | 타원/spline 단면의 폐합 경계와 구멍을 올바르게 채움 | [구현·검증](docs/implementation/G6-D4-H2-CURVE-HATCH-2026-10-18.md), 유한 rational 교차·구멍·잘림 진단·R5/A3 3건·Undo/재열기 |
| 완료 | **G6-D5-E2 곡선 DXF 확대** | wrapped periodic 유한 변환·열린 fit cubic 재구성 및 손실 동의 | [구현·검증](docs/implementation/G6-D5-E2-CURVE-DXF-2026-10-18.md), WCS/단위·seam·작은 domain·편집/왕복·실제 PDF. tangent/closed fit·implied cyclic poles·custom LTYPE/font는 후속 |
| 완료 · 첫 지원 범위 | **G6-D6-P4 캐시·cold HLR** | source/slab byte 추정 LRU·해제와 정확 cold HLR 개선 | [구현·검증](docs/implementation/G6-D6-P4-CACHE-COLD-HLR-2026-10-18.md). 전역 문서/Undo 상한·장시간 soak는 후속 |
| 완료 · 첫 지원 범위 | **G2-W1 프로젝트 내부 탐색** | 모델/평면/단면/상세/시트를 프로젝트 트리에서 바로 이동 | [구현·검증](docs/implementation/G2-W1-PROJECT-NAVIGATION-2026-10-18.md). 원본 참조·검색·뷰 맞춤, revision/Undo 불변 |
| 완료 · 첫 지원 범위 | **G2-W2 재사용 부품·표현 라이브러리** | 문/창/가구/도곽/선·해치 스타일을 검색·미리보기·삽입 | W1. 단위/원점/의존성/asset remap·한 Undo, 각 자료의 출처 기록 |
| 완료 | **G6-D5-Q1 출력 전 점검** | 누락 참조·stale·잘린 주석·축척·폰트·손실을 시트에서 찾음 | [구현·검증](docs/implementation/G6-D5-Q1-OUTPUT-PREFLIGHT-2026-10-18.md). 페이지별 진단·위치 이동·손실 확인·PDF 예산, 실제 R5/수정·재발행·재열기 |
| **완료 · 2026-10-18** | **I-UX1 이미지 배치 경험** | 참고 이미지 교체·맞춤·자르기·투명도·앞뒤 순서를 쉽게 조작 | C2/C3. 기존 I 기능 재사용, 원본 비파괴·asset 저장/재열기·출력 검증 |
| 완료 · 2026-10-18 | **UI-P4 공유/협업 기반** | 프로젝트 묶음 export/import·revision 내용 비교·새 복사본 충돌 정책 | [구현·검증](docs/implementation/UI-P4-PROJECT-BUNDLES-2026-10-18.md). 이미지 검증·ID namespace 분리·원자 rollback. 실시간 공동편집/서버는 별도 설계 |
| 완료 · 2026-10-18 | **CAN-A1 상위 캔버스** | 소유/공유 참조·모델/종이 단위·계층 편집과 탐색 | [구현·검증](docs/implementation/CAN-A1-CANVAS-HIERARCHY-2026-10-18.md). v43·명시적 legacy adapter, cycle/중복 소유·원본 참조/출력 보존 |
| 완료 · 2026-10-18 | **CAN-A2 Flex 배치** | row/column/wrap·gap/padding·Fixed/Hug/Fill·absolute·min/max 배치 | [구현·검증](docs/implementation/CAN-A2-FLEX-LAYOUT-2026-10-18.md). 소유 paper/child canvas·한 Undo·v44·원본 치수/축척 보존 |
| 완료 · 첫 지원 범위 | **CAN-A3 비례 scale** | Resize/Reflow/Scale contents 구분·프레임/작업 구역/이미지 표현 확대 | [구현·검증](docs/implementation/CAN-A3-CONTENT-SCALE-2026-10-18.md). 종이 글자/선 고정, 원본 CAD·bitmap 보존, v45·SVG/PDF |
| 완료 · 첫 지원 범위 | **MEAS-H1 호버 거리** | 유한 원본 도형의 거리·A/B 측정 지점·레이어 최근접 | [구현·검증](docs/implementation/MEAS-H1-HOVER-DISTANCE-2026-10-18.md). 선형/곡선 오차 경계·world mm·읽기 전용·취소/cache |
| 완료 · 첫 지원 범위 | **MEAS-H1 솔리드/BRep 후속** | 닫힌 BRep 경계·재료 거리, 실제 support 점, 접촉/관통/포함 구분 | [구현·검증](docs/implementation/MEAS-H1-BREP-DISTANCE-2026-10-18.md). Worker 취소·cache·world 변환, 수치 허용 오차 명시 |

## WF-Q1 완료 조건

**2026-10-17: 아래 5조건으로 완료했다.** 근거는 [구현 기록](docs/implementation/WF-Q1-RESIDENTIAL-2026-10-17.md)과 [검증 manifest](docs/verification/WF-Q1-2026-10-17.json)다.

1. 작은 주거 DXF를 실제 UI로 준비하고 단위·기준점·레이어·참조를 확인한다.
2. 진단→면→벽/개구부→슬롯 창호/가구→바닥/천장을 같은 문서에서 연결한다.
3. 평면/단면·A3 시트를 만들고 1:50/1:100·한글·선 굵기·홀·잘림·참조/stale 상태를 확인한다.
4. 벽/개구부 또는 가구 수정→연관 출력 갱신→Undo/Redo→재발행→저장/재열기를 검증한다.
5. WebCAD 원본, PDF/SVG/DXF, 실제 UI 증거와 누락·지원 한계를 남긴다. PDF는 독립 렌더링해 확인한다.

상세 fixture·지원 조건은 [평면도 계획](docs/product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md), [선행 구현](docs/implementation/CMP-S1-WF-D1-2026-10-16.md), [정합성 대조](docs/reviews/PLAN-CONSISTENCY-2026-10-17.md)를 따른다. 기존 placeholder fixture만으로 WF-Q1을 완료 처리하지 않는다. **G6-D5-Q1 출력 전 점검**은 별도 카드다.

## 별도 확장과 담당 경계

- **CAN-A1/CAN-A2/CAN-A3 첫 지원 범위 완료:** 계층·Flex·균등 표현 확대를 구현했다. 연결/연속 프레임·발행 시트 그룹 확대와 물리 CAD 비균등 변환은 후속이다.
- **MEAS-H1 첫 지원 범위 완료:** [유한 도면 기하 거리·witness](docs/implementation/MEAS-H1-HOVER-DISTANCE-2026-10-18.md). 3D/축/투영·레이어 최근접·오차 구간·stale/취소를 지원하며 닫힌 BRep 경계/재료 거리·관계 판정도 [구현·검증](docs/implementation/MEAS-H1-BREP-DISTANCE-2026-10-18.md)했다. 직접 subface/edge와 면↔모서리 혼합·투영/축별 지정 측정 및 결과 고정·치수화도 완료했다. 유한 도면↔BRep 혼합과 signed depth는 후속이다. 기존 AABB 배치 경고와 구분한다.
- **IO-DWG1:** 외부 교환 어댑터. 네이티브 DWG/SKP·DWG2010 지원은 대기다.
- 위 확장은 WF-Q1 첫 지원 범위의 필수 선행이 아니다. 세부 계약은 [평면도 계획](docs/product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md)을 따른다.
- UI/CAD 담당 파일·공통 계약·검증은 [워크스페이스 계획](docs/product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md)을 따른다. 위임 가능 범위는 자동 병렬 실행 지시가 아니다.
- 외부 패키지는 도입 전에 버전·라이선스·영향을 확인한다. [이전 후보 조사](docs/history/NEXT-STEPS-2026-10-17.md#가져올-기능과-오픈소스-참고)는 당시 기록이다.

## 갱신 기준

기능 설명이 바뀌면 해당 대표 문서를 갱신하고, 상태는 PROJECT-STATE, 순서·완료 조건은 이 파일에 반영한다. 대표 문서나 계획서가 추가·통합되면 위 연결 표를 갱신한다. 동일한 사용법·지원 한도는 여러 문서에 복사하지 않는다.

완료한 카드는 [구현 기록](docs/implementation/README.md)과 [검증 근거](docs/verification/README.md)를 남기고, PROJECT-STATE의 요약과 이 큐를 함께 갱신한다. 실제 UI·Review/실패 처리·Undo/복구·재열기·해당 출력이 확인된 범위만 완료 처리한다. 상세 이력과 전체 B/X/G/I 표는 [분리한 기록](docs/history/NEXT-STEPS-2026-10-17.md)에 보존했다.

<details>
<summary>이전 상세 절과 날짜별 기록</summary>

- <a id="평면도-과제--copilot--상위-캔버스-확장"></a> [평면도 과제 · Copilot · 상위 캔버스 확장](docs/history/NEXT-STEPS-2026-10-17.md#평면도-과제--copilot--상위-캔버스-확장)

- <a id="하위-에이전트에게-맡기는-방법"></a> [하위 에이전트에게 맡기는 방법](docs/history/NEXT-STEPS-2026-10-17.md#하위-에이전트에게-맡기는-방법)

- <a id="가져올-기능과-오픈소스-참고"></a> [가져올 기능과 오픈소스 참고](docs/history/NEXT-STEPS-2026-10-17.md#가져올-기능과-오픈소스-참고)

- <a id="구현검증-기록"></a> [구현·검증 기록](docs/history/NEXT-STEPS-2026-10-17.md#구현검증-기록)

- <a id="b--x--g--i-실행-순서-이력--2026-10-11"></a> [B · X · G · I 실행 순서 이력 — 2026-10-11](docs/history/NEXT-STEPS-2026-10-17.md#b--x--g--i-실행-순서-이력--2026-10-11)

- <a id="cad-도면-지원-범위-확대--2026-10-11"></a> [CAD 도면 지원 범위 확대 — 2026-10-11](docs/history/NEXT-STEPS-2026-10-17.md#cad-도면-지원-범위-확대--2026-10-11)

- <a id="도면-프레임연결작업-구역--추가-계획"></a> [도면 프레임·연결·작업 구역 — 추가 계획](docs/history/NEXT-STEPS-2026-10-17.md#도면-프레임연결작업-구역--추가-계획)

- <a id="cad-b계열-보충-검토--2026-10-10"></a> [CAD B계열 보충 검토 — 2026-10-10](docs/history/NEXT-STEPS-2026-10-17.md#cad-b계열-보충-검토--2026-10-10)

- <a id="현재-우선순위--1차-건축기계-cad"></a> [현재 우선순위 — 1차 건축·기계 CAD](docs/history/NEXT-STEPS-2026-10-17.md#현재-우선순위--1차-건축기계-cad)

- <a id="제품-g-전체와-하위-단계"></a> [제품 G 전체와 하위 단계](docs/history/NEXT-STEPS-2026-10-17.md#제품-g-전체와-하위-단계)

- <a id="cad-b0b1--조작구성편집참조"></a> [CAD B0/B1 — 조작·구성편집·참조](docs/history/NEXT-STEPS-2026-10-17.md#cad-b0b1--조작구성편집참조)

- <a id="cad-b2--수정명령-대상-확대"></a> [CAD B2 — 수정명령 대상 확대](docs/history/NEXT-STEPS-2026-10-17.md#cad-b2--수정명령-대상-확대)

- <a id="cad-b3--치수스냅교환"></a> [CAD B3 — 치수·스냅·교환](docs/history/NEXT-STEPS-2026-10-17.md#cad-b3--치수스냅교환)

- <a id="cad-b4b5--호-구속작업면솔리드"></a> [CAD B4/B5 — 호 구속·작업면·솔리드](docs/history/NEXT-STEPS-2026-10-17.md#cad-b4b5--호-구속작업면솔리드)

- <a id="확장-x--추가-객체작도클립보드3d"></a> [확장 X — 추가 객체·작도·클립보드·3D](docs/history/NEXT-STEPS-2026-10-17.md#확장-x--추가-객체작도클립보드3d)

- <a id="이미지-i와-제작-후속"></a> [이미지 I와 제작 후속](docs/history/NEXT-STEPS-2026-10-17.md#이미지-i와-제작-후속)

- <a id="건축기계-도면-목표의-남은-연결"></a> [건축·기계 도면 목표의 남은 연결](docs/history/NEXT-STEPS-2026-10-17.md#건축기계-도면-목표의-남은-연결)

- <a id="이전-구현검수-기록"></a> [이전 구현·검수 기록](docs/history/NEXT-STEPS-2026-10-17.md#이전-구현검수-기록)

- <a id="완료한-g0"></a> [완료한 G0](docs/history/NEXT-STEPS-2026-10-17.md#완료한-g0)

- <a id="g1에서-구현한-첫-묶음"></a> [G1에서 구현한 첫 묶음](docs/history/NEXT-STEPS-2026-10-17.md#g1에서-구현한-첫-묶음)

- <a id="g1-후속-검수-결과"></a> [G1 후속 검수 결과](docs/history/NEXT-STEPS-2026-10-17.md#g1-후속-검수-결과)

- <a id="g2-완료-아트보드벡터컴포넌트-기반"></a> [G2 완료: 아트보드·벡터·컴포넌트 기반](docs/history/NEXT-STEPS-2026-10-17.md#g2-완료-아트보드벡터컴포넌트-기반)

- <a id="g3-1-완료-이미지-한-장의-왕복-작업"></a> [G3-1 완료: 이미지 한 장의 왕복 작업](docs/history/NEXT-STEPS-2026-10-17.md#g3-1-완료-이미지-한-장의-왕복-작업)

- <a id="g3-24a--g3-3b-구현-placementmaskopacitydirect-crop"></a> [G3-2..4a + G3-3b 구현: placement·mask·opacity·direct crop](docs/history/NEXT-STEPS-2026-10-17.md#g3-24a--g3-3b-구현-placementmaskopacitydirect-crop)

- <a id="완료-판단"></a> [완료 판단](docs/history/NEXT-STEPS-2026-10-17.md#완료-판단)

</details>

- 완료: [MEAS 후속 · 면·모서리 지정 측정](docs/implementation/MEAS-SELECTED-ELEMENTS-2026-10-18.md) — Direct Select A/B 고정, 원본 BRep 거리·측정점, 편집·Undo 참조 재검증.

- 완료: [MEAS 혼합·투영·축별 지정 측정](docs/implementation/MEAS-MIXED-PROJECTED-DISTANCE-2026-10-18.md) — 면↔모서리, 월드 평면·축별 독립 최소화, 원본 witness와 수치 정밀도 표시.

- 완료: [MEAS 측정 결과 고정·치수화](docs/implementation/MEAS-SAVED-DIMENSIONS-2026-10-18.md) — version 46 저장/복원, 연관 갱신·broken 재지정, 평면 치수 배치와 SVG/PDF 출력.

- 완료: [MEAS 치수선 직접 배치·편집](docs/implementation/MEAS-DIMENSION-PLACEMENT-2026-10-18.md) — 선택·드래그 미리보기·한 번 확정/Undo, 키보드 mm 이동, 치수 삭제와 stale 취소.

- 완료: [MEAS 치수 배치 스냅·겹침 정리](docs/implementation/MEAS-DIMENSION-LAYOUT-2026-10-18.md) — 평행 기준선 스냅·Shift 축 고정, 화면 겹침 안내, anchor 유지 간격 미리보기와 일괄 Apply/Undo.
