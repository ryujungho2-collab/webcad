# 제품 확장 로드맵

갱신일: 2026-10-05. CAD의 정밀함과 편한 직접 편집을 바탕으로 벡터·이미지·레이아웃·자동화·AI를 연결한다. **현재 지원 기능은 [CAD-BASICS](CAD-BASICS.md), 다음 구현 묶음은 [NEXT-STEPS](../../NEXT-STEPS.md)와 [최종 기획 정리](../IMPLEMENTATION-READINESS-2026-10-05.md), 검수 결과는 [PROJECT-STATE](../../PROJECT-STATE.md)**에 둔다. 아래 미완료 단계는 목표이며 구현 완료를 뜻하지 않는다.

## 공통 기반

2026-10-09 우선순위 결정: **1차 건축·기계 CAD → 2차 아트보드·벡터/이미지·프로토타입·슬라이드·LLM 통합**이다. [1차/2차 목표와 완료 기준](ARCHITECTURE-MECHANICAL-MILESTONE.md)이 아래 도메인별 단계의 실행 우선순위를 구체화한다. 같은 모델의 표준 뷰·수치 수정·분해도·건축 단면·연관 도면을 먼저 끝내고, 기존 제작 기능은 유지·재사용한다. 아래 단계 번호를 실제 구현 순서로 해석하지 않는다.

이 문서는 CAD·작도·3D·BIM·협업의 도메인 확장 단계를 소유한다. 통합 UI·이미지·벡터·슬라이드·Copilot/LLM의 경험 설계는 [통합 제작 제품 방향](UNIFIED-CREATIVE-SUITE-ROADMAP.md)에 둔다. 둘 사이의 실제 실행 순서는 NEXT-STEPS로 결정하고, 구현 여부는 PROJECT-STATE에서 확인한다.

문서의 Geometry/Constraint/Dependency 정의를 원본으로 사용한다. Canvas·노드·AI는 같은 Query/Preview/Apply를 호출한다. 표현용 tessellation, 주석, BIM 의미, editable mesh는 원본과 측정 출처를 구분한다. 관계·단위·잠금·이력·실패 원자성을 지키며 도구 결과를 다음 작업에 인계한다.

기반 중 정밀 측정·공차·문서 계획·저장 복구, 변수/수식, live 2D 패턴, 저장되는 중점→수직이등분선→교점, 확장 스케치 구속·스냅, 첫 곡선 작업 연결은 구현했다. [12개 요구사항의 실제 대조](../architecture/SHARED-GEOMETRY-ARCHITECTURE.md)와 [구조 규칙](../architecture/DIRECTORY-STRUCTURE.md)을 따른다.

## 단계와 통과 기준

아래는 도메인별 기능 목표다. 전체 실행 대기열을 의미하지 않는다. 기본 CAD·벡터·이미지·레이아웃을 먼저 연결하고 AI와 외부 연동을 확장한다. G0–G6의 실제 순서·선행 조건은 최종 기획을 따른다. 3D/BIM·Manim·WebGPU가 아트보드·이미지 편집을 시작하기 위한 필수 조건은 아니다.

### 1. 기본 CAD 작업의 완결성

닫힌/중간 구간 Trim과 참조 재연결, 원호 코너, 일반 치수·스냅 추적, DXF bulge 왕복을 현재 Curve workflow에 연결한다. 이미 지원하는 Offset·자유 끝부분 편집·직선 코너와 구속을 유지한다.

통과 기준: 기계 윤곽과 건축 도면을 작성→수정→치수→출력까지 끝내고 기하·단위·관계·Undo/재열기를 확인한다. 미지원 조합과 모호한 참조를 적용 전에 설명한다. 자세한 실행 순서는 NEXT-STEPS를 따른다.

2026-10-06에 [CAD 구현 단위 설계](CAD-BASICS-IMPLEMENTATION-PLAN.md)를 추가했다. B0–B5의 기존 지원 확대와 X1–X7의 신규 형상·작성 방식·작도·UCS·교환을 분리하고, 한 요청의 결과와 선행 조건을 명시했다. 이 설계 추가가 신규 기능 구현을 뜻하지 않는다.

### 2. 재사용 가능한 Component와 벡터 편집

현재 단순 블록·live 패턴을 바탕으로 편집 가능한 정의/인스턴스, 중첩·격리 편집·명시적 덮어쓰기/초기화·variants를 순차 확장한다. Group은 묶음, Layer는 표시/잠금/스타일, Component는 재사용 관계로 구분한다.

Pen/Bezier/Spline·핸들 연속성·평면 Boolean/Shape Builder를 같은 곡선 원본과 명령 위에 추가한다. Fill/Stroke·gradient·mask·appearance는 표현 계층으로 둔다. 문자/범례/프레임의 layout 규칙은 CAD 치수 구속과 분리하고 mm/px 변환 조건을 명시한다.

통과 기준: 문 폭을 바꾸면 여러 인스턴스가 갱신되고 명시적 덮어쓰기는 보존된다. 곡선/문자/표현 편집과 SVG/PDF 결과가 일치하며 저장·Undo가 정의와 관계를 복원한다.

### 3. 수학 작도와 공통 노드

저장 작도를 나침반/자, 수선·각 이등분선, 접선·외접원/내접원, 자취·함수·매개곡선·벡터로 확장한다. 작도 정의의 입력 재지정과 실패 이유를 캔버스에서 제어한다. Euclidean 제한 모드는 허용 연산과 실제 생성 관계를 저장한다. 작도·구속·재생성 설명 영상은 [Manim adapter](../architecture/MANIM-MATH-ANIMATION-INTEGRATION.md)로 비동기 export할 수 있지만, WebCAD solver나 live canvas를 외부 엔진에 위임하지 않는다.

타입 있는 노드 포트·수식·정의 편집을 같은 Geometry Object와 명령에 연결한다. 직접 편집의 구동 값/관계 변경을 노드에도 보여 주며, 노드 전용 기하 원본을 따로 만들지 않는다.

통과 기준: 캔버스/노드에서 원 반지름·분할 수를 바꿔 같은 도형과 의존 결과를 얻는다. 객체의 위치를 저장된 연산으로 설명하고 순환·소멸·잘못된 입력은 전체 변경을 거부한다.

### 4. 기본 3D와 mesh 확장

기존 Extrude/Revolve/Sweep/Loft/Boolean을 바탕으로 면 위 스케치·연관 투영·Cut/Hole/Shell/Section Plane과 안정적인 면/엣지 참조를 보강한다. 3D Mirror/Pattern은 동일한 정의/인스턴스 정책으로 확장한다. BIM 교환은 [RVT·IFC·Axonometric 계획](../architecture/RVT-IFC-AXONOMETRIC-INTEGRATION.md)의 IFC first, RVT adapter second 순서를 따른다.

mesh 편집을 도입할 때 정점·엣지·면 ID, 원본 버전, asset 소유권과 측정 출처를 가진 자산을 추가한다. 현재 커널의 표시 mesh를 편집 원본으로 취급하지 않는다. BRep↔mesh 변환/근사는 명시적 연산이며, 같은 명령·계획·이력 경계를 사용한다.

통과 기준: 치수 수정→솔리드 재생성→독립 체적/유효성 검사→STEP 출력까지 확인한다. mesh 편집은 위상과 Undo를 복원하며 근사 측정과 정확 측정을 구분한다. 실무 문서에서 참조 실패와 성능을 평가한다.

### 5. BIM 의미 계층

공통 기하에 Wall/Door/Window/Floor/Column/Beam/Stair/Room 의미와 두께·높이·재료·속성을 붙인다. 별도 그래픽 원본을 만들지 않는다. 벽 연결·개구부·공간과 Component 인스턴스의 관계를 명시한다.

통과 기준: 벽 두께·문 폭 변경으로 관련 개구부·치수·공간이 갱신되고, 기하 관점과 BIM 관점에서 같은 객체를 읽는다. IFC 등 전문 포맷은 의미 보존을 검사하는 별도 변환 계층으로 연결한다.

### 6. URL 문서·공동 편집·AI

URL 문서 저장소·권한·버전·댓글·실시간 협업을 추가한다. 동시 변경과 다중 탭 복구 충돌, 저장 실패·오프라인 재연결을 처리한다. 로컬 JSON 저장/복구만으로 공유 기능이 완성된 것으로 보지 않는다.

AI는 Dependency Graph를 읽고 공개 명령을 제안하는 인터페이스로 연결한다. 지원 기능 조회→대상 확인→Preview→영향 설명→Apply/취소를 사용한다. 현재 Copilot은 rule 기반이며 실제 LLM backend·외부 자동화 transport는 후속이다.

통과 기준: 링크로 같은 버전의 문서를 열고 공동 수정·댓글·버전 복원을 확인한다. “왜 이 점이 움직이지 않는가”를 실제 구속으로 설명하고, 자연어 수정도 수동 조작과 같은 형상·검증·Undo 결과를 얻는다.

## 측정과 우선순위 조정

기능별 버튼 수 대신 성공률, 재선택·재입력·도구 전환·재시도, 피드백 지연과 작업 시간을 평가한다. 기계/건축 과제를 각각 관찰하며 Node/브라우저 회귀를 실무 평가와 구분한다.

반복 수정의 warm 개발 환경 측정은 [편집 벤치마크](../verification/CAD-EDIT-BENCHMARK-2026-10-03.md)에 있다. 큰 연결 스케치·문서 복제/이력·Explorer·초기 다운로드/Worker 시작은 현재 문서와 production/GPU 환경에서 따로 측정하고, 가장 큰 병목을 먼저 개선한다. 구조 분리는 검토 가능한 세션 단위로 진행한다.

상세 기하 계약과 기존 검수 근거: [파라메트릭 스케치](../architecture/PARAMETRIC-SKETCH.md), [재생성](../architecture/PARAMETRIC-REGENERATION.md), [변수/수식](../architecture/VARIABLES-AND-EXPRESSIONS.md), [live 패턴](../architecture/LIVE-PATTERNS.md), [검수 문서 목록](../README.md).
