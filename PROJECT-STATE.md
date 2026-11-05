# 현재 프로젝트 상태

실무 검토 기반(2026-11-05): [PRACTICE-REVIEW-01](docs/implementation/PRACTICE-REVIEW-01-2026-11-05.md). UI/MCP 공통 `cad.coordinationReview`에 명시적인 최소 간격·목적, 실제 BRep 체적/거리, 미확인 범위와 도면 연결/연관 치수/시트 검사를 추가했다. R1의 “1200mm 주방 통로”가 실제 1120mm임을 검출하고 원본 2D를 80mm 이동해 수정했다. 12쌍 재검사 중 벽 접합 1쌍은 실패 유지, 도면 5장의 치수/시트 10항목은 미확인이다. 검사 수는 산업디자인/납품 완성도가 아니며, 다음은 외벽–창호–바닥 접합의 의미 정보·상세 및 요구조건/이슈 영속 저장이다.

주택 R1(2026-11-05): [내부·외부 복잡도 검증](docs/implementation/THREE-STOREY-HOUSE-R1-2026-11-05.md). R0를 산업디자인 완성으로 평가하지 않는다. 수납장 구성·주방/욕실·침대·경사 손잡이·창호/테라스/파라펫을 182개 부품으로 보완해 총 361개를 검증했다. 작업대 다리–침대 기단 750,000mm³ 관통을 원본 이동으로 해소하고 선택 간섭·문 여닫이·계단 머리높이 표본 등 598개 검사, STEP 361개 재읽기를 통과했다. 벽 접합 중복과 구조/설비/체결·전체 경로 검토는 남아 있다.

최신 주거 검증(2026-11-05): [3층 단독주택](docs/implementation/THREE-STOREY-HOUSE-2026-11-05.md). 2D 원본 193개→live 부품 191개→층별 조립→실제 절단 도면 5장, 공통 벽 편집·Undo/Redo·재열기 포함 406개 검사 통과. STEP 191개 솔리드 재읽기 유효성·체적 보존 확인. 외장/수납 모듈을 반영했다. 납품 판정은 R0 검토용이며 벽 접합·난간·구조/설비·법규·치수/상세를 보완하기 전 시공/인허가 발행 보류다.

최신 소형 부품 검증(2026-10-25): [60 × 40 × 45 mm 센서 L 브래킷](docs/implementation/LIGHT-BRACKET-2026-10-25.md). 사람 폼·내부 자연어·실제 MCP SDK·사람 Boolean 폼의 인계와 저장·재열기 38개를 확인했다. 한 개의 STEP 솔리드를 다시 읽고 독립 체적 및 실제 절단의 구멍 네 위치를 검사했다. 외부 모델 호출 0회. 제품 기능 추가는 필요하지 않았으며 재열기 후 토글 순서와 검증 창 크기를 정리했다.

최신 파빌리온 재작업(2026-10-25): [바람의 뜰과 A1 설계 판넬](docs/implementation/COURTYARD-PAVILION-2026-10-25.md). 이전 타원 캐노피 안의 건축적 완성 판단을 철회하고 중정·두 곡면 지붕·14개 목재 프레임·곡선 좌석의 27부품 모델을 실제 MCP로 재작성했다. 최종 브라우저 79개, STEP 27부품 재읽기와 독립 체적 24개, A1 한글·실제 단면·3600px 뷰를 확인했다. 공통 대상 선택기를 건축 단면의 64개 한도와 맞췄다. 미적 품질을 시험 개수로 평가하지 않는다.

최신 공간 곡선 과제(2026-10-25): [공간 곡선 파빌리온](docs/implementation/PAVILION-HANDOFF-2026-10-25.md). 공간 XYZ fitted 편집·접선 정렬 스윕·동일한 경로 조회·실제 BRep 경계의 Review/MCP 공유를 연결했다. 3개 공간 아치·곡면 캐노피·기단·6개 받침판을 기존 공통 도구로 작성하고 실제 단면과 STEP을 인계한다. 비평면 곡선의 암묵적 평탄화는 거절한다.

최신 곡면 재편집(2026-10-25): [로프트 연결 방식 왕복 편집](docs/implementation/LOFT-EDIT-HANDOFF-2026-10-25.md). 속성 버튼·사람 공통 폼·자연어·MCP가 같은 `solid.loft.update`를 사용한다. 같은 ID/배치/마감/원본 단면을 유지하며 ruled↔smooth와 원본 변경 후 재생성을 검증했다. 대상 Node 34개, 실제 UI/Worker/stdio MCP 인계 13개, 빌드·architecture 통과. canonical 40 / MCP 43 / 공통 폼 14종. 모든 자유곡면 편집의 완료 선언은 아니다.

최신 연속 곡선 과제(2026-10-24): [C2 라운지체어](docs/implementation/CHAIR-HANDOFF-2026-10-24.md). 기존 fitted 도구에 C2 natural/periodic 보간, 같은 사람·MCP 곡률 조회, 점 수정 시 C2 유지, 수동 spline 편집과 형식 53의 명시적 정책 저장을 연결했다. canonical 39 / MCP 42 / 사람 폼 13종은 유지한다.

최신 곡선 과제(2026-10-24): [S자 조명 · 정확한 spline 스윕](docs/implementation/LAMP-HANDOFF-2026-10-24.md). 열린 맞춤 곡선을 원래 NURBS로 스윕하고 통과점·접선 강도 수정이 3D에 함께 반영되도록 연결했다. canonical 39 / MCP 42를 유지하며 사람 폼은 13종이다. 형식 52가 정확한 경로를 보존한다.

최신 과제 검증(2026-10-24): [비정형 세면 볼·배수구](docs/implementation/BASIN-HANDOFF-2026-10-24.md). 닫힌 NURBS·원·선/원호 경계의 구멍·섬을 native 포함 관계로 분류하고 사람 돌출 폼과 MCP context에 같은 source IDs·순면적을 제공한다. 실제 과제에서 발견한 긴 MCP 검증의 timeout을 `waitForReview:false` 접수와 상태 조회로 분리했다. native Review/사람 Apply/Undo 경계는 유지한다. 모델 요청 0회, 기존 39 canonical / 42 MCP / 12 공통 폼 유지. flat-bottom 개념 모델이며 설비·제조 인증은 아니다.

최신 코파일럿 개선(2026-10-24): [단계형 질문·도구 계획과 검증된 부품 템플릿](docs/implementation/COPILOT-STAGED-RECIPES-01-2026-10-24.md). 일반 Prompt/gateway에 필수 정보 질문·답변 재개를 연결했다. 4홀 플레이트·핀·원형 통풍구 덮개를 일반 CAD 명령으로 컴파일하고 실제 커널 체적을 독립 계산식과 대조한다. 전체 Node 1625개와 신규 실제 UI/Worker 14개 통과. 자유 문장 의미 판단 성공률·브래킷 템플릿·Blender 연산 완성을 뜻하지 않는다.

최신 과제 검증(2026-10-24): [비정형 전시 키오스크](docs/implementation/KIOSK-HANDOFF-2026-10-24.md). 사람용 맞춤 곡선·점 수정·연관 도면 재연결을 기존 canonical 도구에 연결해 공통 폼 12종을 제공한다. 실제 과제에서 드러난 닫힌 NURBS→3D 프로파일 전달과 매듭 구간 처리·커널 수명을 보완했다. 원본 점 수정은 live 3D를 재생성하며 단면 대응이 불명확하면 숨기고 명시 재연결한다. 실제 UI/Worker/SDK MCP 48개 검증, 모델 endpoint 요청 0회. canonical 39 / MCP 42 유지. 미적·구조·시공 품질 인증은 아니다.

최신 과제 검증(2026-10-24): [곡선 손잡이·설치판의 회전/스윕 인계](docs/implementation/HANDLE-HANDOFF-2026-10-24.md). 회전축의 평면/세계 방향 안내, 스윕 단면/경로 역할 교환, 숫자 폴리라인 입력을 기존 공통 도구에 연결했다. 정확한 ID 검색을 원본 윤곽의 부분 일치보다 우선하도록 고쳤다. 실제 BRep 절단의 동심원으로 핀 간극을 검사한다. 사람 폼 9 / canonical 39 / MCP 42이며 전체 수동 도구 노출이나 자율 설계·체결 성능 검증은 아니다.

최신 과제 검증(2026-10-24): [2D 순서 단면 → 편심 전환 덕트](docs/implementation/DUCT-HANDOFF-2026-10-24.md). 원 단면 세 개의 순서 이동과 원/로프트 사람용 폼을 공통 도구에 연결했다. 3D 부품/2D 윤곽 필터로 이름이 같은 연관 도면을 구분한다. 내부 자연어와 사람 폼의 로프트를 비교하고 실제 MCP로 내부 통로·플랜지·체결 구멍·연관 단면을 완성한다. canonical 39 / MCP 42는 유지하며 형상 기능 확대나 자율 설계 완성을 뜻하지 않는다.

최신 과제 검증(2026-10-24): [벽걸이 외함·덮개의 작업 인계](docs/implementation/ENCLOSURE-HANDOFF-2026-10-24.md). 형상 도구 추가 대신 코파일럿 내부의 명시 대상 검색/선택/추가/순서 전환을 실제 캔버스·자연어·MCP 선택과 연결했다. 다른 부품 선택 시 현재 치수와 오류를 갱신한다. 두 부품의 체적·구멍 중심·조립/분리 위치·실제 연관 단면·Undo/재열기를 검증한다. canonical 39 / MCP 42는 유지하며 전체 수동 기능 노출·자율 설계·제조 검증을 의미하지 않는다.

최신 연결 검증(2026-10-24): [센서 브래킷 · 사람–Copilot–MCP 인계](docs/implementation/SHARED-TOOL-HANDOFF-2026-10-24.md). 새 형상 기능 대신 네 canonical 도구의 사람용 폼과 동일 Review/Apply/Undo 연결을 제공했다. 자연어 초안·gateway 설정을 유지하며 실제 SDK로 사람이 만든 부재의 수정·조회·가공과 사람의 후속 Boolean을 수행한다. coplanar face 선택을 위한 명시적 tessellation bounds를 보완했다. 전체 수동 도구의 MCP 노출이나 자율 설계 완성은 아니다.

최신 과제(2026-10-24): [틈마당집 · 지하+지상 2층 단독주택](output/projects/lightwell-house/README.md). 실제 MCP stdio → Copilot Review → UI Apply로 모델·세 층 평면·두 단면·정적 주석을 작성했다. 내부 코파일럿의 현관 문 폭 수정으로 체적·제한된 경로·Undo·재열기를 검사한다. [공통 도구 연결 보완](docs/implementation/HOUSE-MCP-01-2026-10-24.md): 레이어/마감, 같은 제안의 슬래브 윤곽/홀, 명시 부재 범위 64. canonical 39 / MCP 42. 후속 피드백으로 명시적 벽 마이터/끝점·누락 구획·외장과 내부 기호를 보완하고, MCP delta/직선 도형 범위 조회로 부재와 기호의 배치 겹침을 수정했다. 설계 구성은 설계자가 제공하며 자율 주거설계·미적 판단 완성이나 기존 졸업설계 미달 해소를 뜻하지 않는다.


최신 MCP 연결(2026-10-23): 기능 확대보다 기존 CAD와 코파일럿 연결을 우선했다. 공식 SDK 2.3.1 stdio 서버가 공통 37개 도구와 문맥/일괄 제안/상태 3개를 제공한다. 내부 엔진과 같은 조회·native Preview/Review/Apply·Undo를 사용한다. 모델 독립 연결이며 public HTTP/모든 수동 기능 노출 완료가 아니다. [사용법과 계약](docs/architecture/CAD-MCP.md) · [구현·검증](docs/implementation/CAD-MCP-01-2026-10-23.md).

최신 기능 개선(2026-10-23): 기존 native 벽·호스트 개구부·슬래브·실제 BRep 절단 기능을 다시 확인하고 내부 코파일럿에 연결했다. 공통 도구 37개, 제한된 벽/문 경로 여유 조회를 제공한다. 작은 두 공간의 생성·문 수정·연관 도면 갱신·단일 Undo·재열기 실제 UI 29개와 전체 Node 1592개 통과. 건축 자동 설계/미적 완성으로 평가하지 않으며 이전 졸업설계 미달 판정은 유지한다. [구현과 사용법](docs/implementation/COPILOT-NATIVE-ARCHITECTURE-01-2026-10-23.md).

최신 과제 검증(2026-10-23): 졸업설계 수준의 2층 도시수리학교를 내부 코파일럿으로 검증했다. 23개 설계자 입력 제안→365객체→5 SVG/DXF→정밀 수정·Undo·재열기 54 UI 검사는 통과했지만 자체 공간 설계 완주 수준은 미달이다. 복합 요구의 단순 도형 축약을 차단하고 텍스트/실측 치수 공통 도구를 추가했다. 현재 29개 도구, 전체 Node 1583개. [근거](docs/implementation/COPILOT-GRADUATION-TASK-01-2026-10-23.md).

최신 내부 코파일럿(2026-10-23): 기본값을 모델 없는 Agent WebCAD 내부 엔진으로 고정했다. 의도 질문/수치 확정, 실제 대안, 영역/통과점/치수 수정과 Apply/Undo를 내부에서 수행한다. Ollama와 외부 gateway는 선택 연결이다. 전체 Node 1580개, browser/Worker 29+26+13+15개, 실제 Ollama 11개 검증. 일반 미적 추론과 R1 미채택은 유지한다. [구현/사용법](docs/implementation/COPILOT-INTERNAL-OPTIONAL-01-2026-10-23.md).

최신 의도 보조(2026-10-22): [COPILOT-DESIGN-STUDY-01](docs/implementation/COPILOT-DESIGN-STUDY-01-2026-10-22.md). Copilot에 확정 요구/가정/질문, 객체 앵커, CAD 영역 표시, 실제 2D·3D 후보 비교, 인간 선택/거절 이유, 단일 Undo 적용, 문서별 intent sidecar를 연결했다. 로컬 기하 탐색과 gateway 의도 해석을 구분한다. 실제 외부 provider·Blender/IFC 브리지·모델 학습·자동 미적 평가는 별도이며 R1 설계의 미적 보류는 유지한다. 검증 수치는 [manifest](docs/verification/COPILOT-DESIGN-STUDY-01-2026-10-22.json)를 따른다.

현재 비정형 과제(2026-10-22): 사용자는 DDP 같은 유기적 비정형을 상급 2D부터 설계하도록 요청했고 카페 용도를 철회했다. 전시관 R1을 만들었으나 아름다움이 부족하다는 피드백으로 채택을 보류하고 [레퍼런스 비교와 재설계 기준](docs/product/FLOW-REFERENCE-REVIEW-2026-10-22.md)을 작성했다. DDP·하얼빈 오페라하우스·헤이다르 알리예프 센터·Rolex Learning Center의 공식 사진/모형/평면과 현재 안을 비교한다. [비교 자료](output/projects/flow-court/reference-review.html). R1을 최종 설계·승인 도면으로 취급하거나 그대로 3D 확장하지 않는다. 통과점 spline·허용 오차 polyline·곡선 분할/블록 배치 기능과 길이 측정 개선은 유지한다. 전체 Node 1551개 및 R1 실제 UI/Worker 16개 통과는 기능 검증이며 미적 완성의 근거가 아니다.

최신 카페 변환(2026-10-20): [CAFE-2F-02](docs/implementation/CAFE-2F-02-2026-10-20.md). R0 공간 배치를 유지해 1,114개 BRep 솔리드, 편집 원본·STEP·재료 GLB·층별/층 분리 뷰어·정확 A-A 단면을 작성했다. 원래 2D 도면도 보존한다. 전체 Node 1546개, 실제 UI 14개, STEP 재수입의 부재 수/치수/체적을 검증했다. 가구/창호는 source ID 대응 snapshot이며 양방향 BIM 자동 변환은 아니다. [납품 안내](output/projects/large-cafe/3d/README.md).

최신 2D 실무 과제(2026-10-20): [CAFE-2F-01](docs/implementation/CAFE-2F-01-2026-10-20.md). 총 외곽 면적 450㎡·40/60석의 2층 카페 설계 발전안, 12장 도면과 20종 원본 CAD 에셋을 작성했다. 실제 UI 이동/Undo/Redo·PDF 발행·캐시 재열기 13개, 독립 PDF 12장 검수와 전체 Node 1540개를 통과했다. 과제에서 발견한 PDF 합계/단일 페이지 예산 혼동과 모델 DXF 치수의 높이·배치 손실을 수정했다. [원본·납품 안내](output/projects/large-cafe/README.md). 현장 승인 시공도서나 자동 BIM 연동 완료가 아니다.

최신 케이스 과제(2026-10-19): [COPILOT-ENCLOSURE-01](docs/implementation/COPILOT-ENCLOSURE-01-2026-10-19.md). 2D에서 둥근 3D 케이스·셸·바닥/앞벽 구멍까지 6개 요청으로 연결했다. 내부 바닥 절삭 방향 오류를 수정했고 실제 UI 22개와 최종 STEP 해석 체적을 검증했다. Local rules의 제한된 면 선택 범위다.


최신 연속 과제 검증(2026-10-19): [COPILOT-2D3D-01](docs/implementation/COPILOT-2D3D-01-2026-10-19.md). 자연어 2D 스케치 → 3D 전환/돌출 → 관통 구멍 → 필렛을 기존 경로로 확인했다. 관련 Node 21개·실제 UI 18개와 STEP 해석 체적/원본 관계 재검사 통과. 이번에는 제품 런타임 코드를 변경하지 않았고, 제한된 Local rules 범위다.


최신 대화 연결(2026-10-19): [COPILOT-CONVERSATION-01](docs/implementation/COPILOT-CONVERSATION-01-2026-10-19.md). 빈 문서에서 전체 한국어 치수 요청으로 4공 판 생성 → 간격 유지 조건의 후속 폭/세로 변경 → Undo/재열기/STEP를 검증했다. 제한된 Local rules 범위이며 실제 모델 provider 연결과 임의 자연어 자동화는 미완료다.


최신 도구 확대(2026-10-19): [CAD-TOOLS-02](docs/implementation/CAD-TOOLS-02-2026-10-19.md) 지원 범위 완료. 공통 23개 도구로 확대하고 높이가 다른 원/경로, 모서리 조회와 회전·스윕·로프트·필렛·모따기·셸을 연결했다. 전체 Node 1529개·실제 브라우저 17개·기존 흐름 회귀 75개, build/typecheck와 STEP 독립 재수입을 통과했다. 실행 수치는 [검증 manifest](docs/verification/CAD-TOOLS-02-2026-10-19.json)를 따른다. 실제 모델 provider 연결은 후속이다.

1차 도구 연결(2026-10-19): [CAD-TOOLS-01](docs/implementation/CAD-TOOLS-01-2026-10-19.md) 첫 지원 범위 완료. 공통 14개 조회/모델링 도구, gateway 조회 왕복→검토 가능한 모델링 계획, 로컬 스케치·선택 윤곽 돌출·면 구멍·Boolean을 연결했다. 전체 Node 1518개·신규 브라우저 19개·기존 3D/코파일럿 브라우저 회귀 82개와 build/typecheck 통과.

최신 3D 구현(2026-10-19): [COPILOT-SOLID-01](docs/implementation/COPILOT-SOLID-01-2026-10-19.md) 첫 지원 범위 완료. 코파일럿에서 구속/변수를 가진 4공 판 생성→폭 변경/모서리 간격 유지→선택 솔리드 치수 편집→Undo/재열기/STEP 검사까지 연결했다. 로컬 규칙과 mock gateway의 선택 기반 편집 계약을 검증했으며 실제 모델 provider 연결은 후속이다.

현재 개발 방향(2026-10-19): [자연어 CAD·코파일럿 제품 목적](docs/product/NATURAL-LANGUAGE-CAD-PURPOSE-2026-10-19.md)을 정리했다. 목적 합의이며 구현 완료 항목이 아니다. 최종 목적은 자연어로 2D 도면과 3D 모델을 생성·수정하는 CAD이며, 외부 도면 수정·복원은 학습·검증 단계다. 생성·조회·편집·검증·복구 기반을 판단 엔진과 연결하되 구체적인 엔진 선택은 미정이다.


최신 검증(2026-10-19): [주거 외부 도면 수정·복원 01](docs/implementation/EXT-CIVIL-RESTORE-01-2026-10-19.md) 완료. 다섯 항목 변경 후 Undo/직접 편집 복원과 실제 UI 9개 검사를 통과했다. 기준/복원 문서는 revision 외 일치, DXF 표시 선분 36,631개 일치. 다음에는 단위·블록·곡선·규모가 다른 도면으로 확대한다.


최신 추가(2026-10-19): [EXT-CIVIL-03 대형 가져오기 개선](docs/implementation/EXT-CIVIL-03-2026-10-19.md). 준비 진행·취소와 탐색기/다중 선택 인덱스 개선. 실제 파일 Apply 단일 관측 37.4초 → 16.0초. 해치 15개 제외와 동기 parse/후속 편집 지연은 남아 있다.



최신 추가 검증(2026-10-19): [EXT-CIVIL-02 외부 주거 도면 2차 개선](docs/implementation/EXT-CIVIL-02-2026-10-19.md) 완료. HATCH 46/61 복원, 색상 상속·v48·전체 DXF 왕복 검증. 남은 15개 gradient/곡선 해치와 대형 파일 UI 성능은 후속 범위다.

문서 갱신: **2026-10-18**. 최신 제품 구현·검증 기준: **2026-10-18**. **CAN-A1 상위 캔버스**는 [구현·검증 완료](docs/implementation/CAN-A1-CANVAS-HIERARCHY-2026-10-18.md)했으며 CAN-A2 Flex도 [구현·검증 완료](docs/implementation/CAN-A2-FLEX-LAYOUT-2026-10-18.md)했고 CAN-A3도 [첫 지원 범위 구현·검증 완료](docs/implementation/CAN-A3-CONTENT-SCALE-2026-10-18.md)했다. 균등 표현 확대·종이 글자/선 고정·원본 CAD/bitmap 보존을 지원한다. **MEAS-H1**도 [유한 도면 기하 첫 지원 범위 구현·검증 완료](docs/implementation/MEAS-H1-HOVER-DISTANCE-2026-10-18.md)했다. 실제 측정 지점·3D/축/투영·오차 경계와 레이어 최근접을 지원한다. 닫힌 솔리드/BRep 경계·재료 거리와 관계 판정도 [후속 첫 지원 범위 구현·검증 완료](docs/implementation/MEAS-H1-BREP-DISTANCE-2026-10-18.md)했다. **UI-P4 공유/협업 기반**은 [파일 묶음·revision 비교·복사본 가져오기 범위로 완료](docs/implementation/UI-P4-PROJECT-BUNDLES-2026-10-18.md)했다. **I-UX1 이미지 배치 경험**은 [구현·검증 완료](docs/implementation/I-UX1-IMAGE-PLACEMENT-2026-10-18.md)했다. 후속 우선순위는 [NEXT-STEPS](NEXT-STEPS.md#현재-실행-큐)를 참고한다. G6-D5-Q1은 [구현·검증 완료](docs/implementation/G6-D5-Q1-OUTPUT-PREFLIGHT-2026-10-18.md)했다. G2-W2는 [첫 지원 범위로 완료](docs/implementation/G2-W2-REUSABLE-LIBRARY-2026-10-18.md)했다. G2-W1은 [첫 지원 범위로 완료](docs/implementation/G2-W1-PROJECT-NAVIGATION-2026-10-18.md)했다. G6-D6-P4는 [첫 지원 범위로 완료](docs/implementation/G6-D6-P4-CACHE-COLD-HLR-2026-10-18.md)했다.

## 지원 범위 요약

| 영역 | 상태 | 현재 사용법·지원 범위 |
| --- | --- | --- |
| 상태·입력·접근성 | UI-C5 첫 지원 범위 완료 | [상태와 키보드](docs/features/INPUT-ACCESSIBILITY.md) |
| 프로젝트·복구·다중 세션 | UI-P1/H1/H2·UI-P2·UI-P3-A/B·UI-C4 지원 범위 완료 | [프로젝트와 저장](docs/features/PROJECTS.md) |
| 속성·수치·표현 UI | UI-C3 첫 지원 범위 완료 | [속성 패널](docs/features/PROPERTIES.md) |
| 선택 문맥 UI | UI-C2 첫 지원 범위 완료 | [선택 문맥 도구](docs/features/SELECTION-TOOLS.md) |
| 작도·참조 편집·스케치 | 카드별 지원 범위 | [정밀 작도와 편집](docs/features/DRAWING-EDITING.md) |
| 작업면·솔리드 | B5 지원 범위/pilot | [솔리드 모델링](docs/features/SOLID-MODELING.md) |
| 평면도·벽·콘텐츠 | WF-A1·C0/A2/B1·B2/B3·CMP-S1/WF-D1·WF-Q1 첫 범위 완료 | [평면도와 건축 콘텐츠](docs/features/FLOOR-PLANNING.md) |
| 연관 도면·시트 | 카드별 지원 범위 | [도면과 출력](docs/features/DRAWINGS-OUTPUT.md) |
| 이미지·제작 | G2/G3·Scene/prototype 지원 범위 | [이미지와 장면](docs/features/IMAGES-SCENES.md) |
| Copilot | local Query/guided 작업·제한된 gateway 계약 | [Copilot](docs/features/COPILOT.md) |

사용법·수치 한도·미지원 조합은 위 대표 문서 한 곳에서 관리한다. 이 표는 진행 상태만 요약한다.

## 최신 검증 근거

2026-10-18 **외부 주거 도면 기반 1차 개선 완료**. Civil_projects DWG/PDF를 고정해 검증했고 MTEXT·정적 치수 표시 블록·숨김 표시 누락을 수정했다. 전체 Node 1491개, 신규 Chrome 13개·회귀 116개, architecture 704모듈·build 통과. 원본과 비교한 다음 우선순위는 **HATCH와 개체별/ByBlock 스타일 보존**이며 Edge 대형 입력 응답 지연도 남아 있다. [구현·비교](docs/implementation/EXT-CIVIL-01-2026-10-18.md) · [검증 manifest](docs/verification/EXT-CIVIL-01-2026-10-18.json).

2026-10-18 **주거 과제 측정→도면 발행 통합 검증 완료**. 기존 A3에 저장 치수가 누락되는 문제를 도면 연결로 해결했다. 실제 가구 수정에서 3395→3295mm 갱신·Undo/Redo·v47 재열기·도면 위 배치를 확인했다. [구현·지원 범위](docs/implementation/MEAS-RESIDENTIAL-DRAWING-2026-10-18.md) · [검증](docs/verification/MEAS-RESIDENTIAL-2026-10-18.json). 후속 측정 기능은 실제 과제에서 필요한 경우 선택한다.

2026-10-18 [G6-D5-E2 검증](docs/verification/G6-D5-E2-2026-10-18.json): wrapped rational periodic를 seam/domain을 유지한 finite basis로 변환하고 열린 fit-only natural cubic을 결정적으로 재구성한다. 변환/재구성 손실 동의와 미지원 제외 동의를 분리했다. 전체 Node **1,335 / 54 suites / 실패 0**, 대상 **37** tests, 신규 native **24**·기존 회귀 **123** checks, architecture **635모듈**·build **452모듈**을 통과했다. 다운로드 DXF 2,002개 독립 좌표 비교와 실제 PDF 렌더를 검수했다. [구현·지원 범위](docs/implementation/G6-D5-E2-CURVE-DXF-2026-10-18.md), [사용법](docs/features/DRAWINGS-OUTPUT.md).

2026-10-18 [G6-D4-H2 검증](docs/verification/G6-D4-H2-2026-10-18.json): 타원·spline의 유한 rational 경계에서 해치와 홀을 처리하고 열린/접촉/중복·미수렴은 진단한다. 전체 Node **1,323 / 54 suites / 실패 0**, 대상 **32** tests, R5 native **28** checks, 독립 Poppler PDF **3건**. R5 원본 정의를 보존한 58부품·16도면·11페이지 확장, 1:1/1:2의 종이 2mm 간격·빈 타원 홀·편집/Undo·실제 durable 재열기를 확인했다. [사용법](docs/features/DRAWINGS-OUTPUT.md) · [구현·화면](docs/implementation/G6-D4-H2-CURVE-HATCH-2026-10-18.md).

2026-10-18 [UI-C5 검증](docs/verification/UI-C5-2026-10-18.json): 저장/다운로드 상태·재시도·기하 작업 단계/취소, 도구 그룹 키보드 탐색·modal 포커스·IME/History 보호를 구현했다. 전체 Node **1,311 / 54 suites / 실패 0**, 신규 UI **30**·기존 회귀 **218** checks, architecture **626 modules**·production **450 modules** 통과. 실제 Worker 취소 후 재실행, 단위 편집/Undo, quota/Retry, 파일 다운로드, 키보드 닫기/복구와 960px/150% 상당 화면을 확인했다. [사용법](docs/features/INPUT-ACCESSIBILITY.md) · [구현·화면](docs/implementation/UI-C5-INPUT-ACCESSIBILITY-2026-10-18.md).

2026-10-17 [UI-C4 검증](docs/verification/UI-C4-2026-10-17.json): Home 최근/검색·저장 XY 미리보기·복구·독립 샘플·파일 열기·시작 옵션을 구현했다. 전체 Node **1,309 / 54 suites / 실패 0**, Home **26** checks·기존 회귀 **125** checks, architecture **621 modules**·production **446 modules** 통과. Home 전환에서 비교 세션·Undo 보존과 추가 커널 요청 0, quota 실패 되돌리기/Retry를 확인했다. [사용법](docs/features/PROJECTS.md) · [구현·화면](docs/implementation/UI-C4-PROJECT-HOME-2026-10-17.md).

2026-10-17 [UI-C3 검증](docs/verification/UI-C3-2026-10-17.json): 선택 요약→수치/위치→표현→고급 정보, 종류별 접기 저장, 단위 입력·필드/축별 다중 편집·선택 초안·Esc/IME 보호를 구현했다. 전체 Node **1,303 / 54 suites / 실패 0**, 속성 UI **28** checks·기존 회귀 **151** checks, architecture **615 modules**·production **441 modules** 통과. 실제 SVG/PDF의 스타일과 source/Undo 보존을 확인했다. [사용법](docs/features/PROPERTIES.md) · [구현·화면](docs/implementation/UI-C3-INSPECTOR-2026-10-17.md).

2026-10-17 [UI-C2 검증](docs/verification/UI-C2-2026-10-17.json): 선택별 세 가지 도구·More 메뉴와 잠금/혼합 이유를 기존 registry에 연결했다. 전체 Node **1,300 / 54 suites / 실패 0**, 문맥 UI **23** checks, architecture **609 modules**·production **437 modules** 통과. 곡선/프레임 Review→Apply→Undo, source/치수 보존, 960px·150% 상당 화면·한글 입력·메뉴 포커스를 확인했다. [구현 및 화면](docs/implementation/UI-C2-SELECTION-TOOLS-2026-10-17.md).

2026-10-17 [UI-P3-B 검증](docs/verification/UI-P3-B-2026-10-17.json): 탭 고정·pointer/키보드 순서 저장·열린 이름/ID 검색·overflow·한글 IME·iframe 단축키를 구현했다. 전체 Node **1,297 / 54 suites / 실패 0**, 탭 탐색 native **27** checks, architecture **605 modules**·production **434 modules** 통과. 편집 iframe·Undo·revision·비교 위치를 유지하며 저장 실패/Retry와 새로고침 복원을 확인했다. [상세 기록과 화면](docs/implementation/UI-P3-B-TAB-NAVIGATION-2026-10-17.md).

2026-10-17 [UI-P3-A 검증](docs/verification/UI-P3-A-2026-10-17.json): 두 프로젝트의 좌우 비교·크기 조절·활성 전환·단일 복귀·새로고침 복원을 구현했다. 전체 Node **1,291 / 54 suites / 실패 0**, 비교 native **25** checks·기존 탭 **19**·복구 **24** checks, 타입·architecture **600 modules**·production **431 modules** 통과. 실제 두 iframe·Undo·선택을 유지하고 레이아웃 변경에서 추가 kernel 제출 0을 확인했다. [지원 범위와 화면 증거](docs/implementation/UI-P3-A-PROJECT-COMPARISON-2026-10-17.md). 탭 탐색은 위 UI-P3-B 기록으로 이어지며 카메라 동기화는 후속이다.

2026-10-17 [WF-Q1 검증](docs/verification/WF-Q1-2026-10-17.json): 소형 주거 DXF를 실제 UI로 준비→벽/개구부→슬롯 창호/가구→평면/단면/A3 발행·수정·재발행·재열기를 수행했다. 전체 Node **1,281 / 54 suites / 실패 0**, native UI 주거 **21** checks·floorTasks 회귀 **18** checks, 타입·architecture **592 modules**·production build **427 modules** 통과. A3 1:50/1:100 PDF 3건은 Poppler 렌더 독립 검사와 SHA-256 재검산으로 확인했고 제출 파일은 [residential-q1](output/projects/residential-q1/README.md)에 있다. 기존 큰 chunk 경고는 남아 있다. 상세는 [구현 기록](docs/implementation/WF-Q1-RESIDENTIAL-2026-10-17.md)과 원본 JSON을 따른다.

2026-10-16 [CMP-S1/WF-D1 검증](docs/verification/CMP-S1-WF-D1-2026-10-16.json): 전체 Node **1,274 / 54 suites / 실패 0**, native 콘텐츠 **16**, 벽 **14**, 연관 도면 **32** checks. 타입·architecture **589 modules**·production build **427 modules** 통과. 기존 큰 chunk 경고는 남아 있다. 상세 대상 실행과 환경은 원본 JSON을 따른다.

이는 해당 날짜의 제품 검증이다. 2026-10-17 계획/문서 정리에서 실행한 링크·구조 검사를 제품 전체 회귀로 합산하지 않는다. [정합성 기록](docs/reviews/PLAN-CONSISTENCY-2026-10-17.md), [문서 정리 기록](docs/reviews/DOCUMENTATION-ORGANIZATION-2026-10-17.md).

## 남은 지원 경계

WF-Q1은 2026-10-17 소형 자체 과제의 첫 지원 범위로 완료했다. 외부 실측/고객 도면 상호운용·완성 주택 설계 품질 보증은 포함하지 않고, 기능별 미지원 조합은 위 대표 문서를, 예정 카드와 선행 조건은 [실행 큐](NEXT-STEPS.md)를 따른다. 지원 범위 일부의 완료를 전체 기능·실무 품질 보증으로 확대하지 않는다.

## 기록과 갱신

기존 날짜별 구현·실패·보충·측정 조건은 [2026-10-17 분리 이력](docs/history/PROJECT-STATE-2026-10-17.md)에 보존했다. 기능별 사용법은 [기능 가이드](docs/features/README.md), 실행 결과는 [검증 색인](docs/verification/README.md), 문서 갱신 책임은 [CHANGE-GUIDE](docs/architecture/CHANGE-GUIDE.md)를 따른다. 이 파일에는 현재 요약과 최신 근거만 유지한다.

<details>
<summary>이전 상세 절과 날짜별 기록</summary>

- <a id="날짜별-구현검증-이력"></a> [날짜별 구현·검증 이력](docs/history/PROJECT-STATE-2026-10-17.md#날짜별-구현검증-이력)

- <a id="최신-통합-구현검수-상태"></a> [최신 통합 구현·검수 상태](docs/history/PROJECT-STATE-2026-10-17.md#최신-통합-구현검수-상태)

- <a id="직전-b0-c-구현검수"></a> [직전 B0-C 구현·검수](docs/history/PROJECT-STATE-2026-10-17.md#직전-b0-c-구현검수)

- <a id="직전-b2-a2-내부-코너-구현검수"></a> [직전 B2-A2 내부 코너 구현·검수](docs/history/PROJECT-STATE-2026-10-17.md#직전-b2-a2-내부-코너-구현검수)

- <a id="직전-g5-b2-구현검수"></a> [직전 G5-B2 구현·검수](docs/history/PROJECT-STATE-2026-10-17.md#직전-g5-b2-구현검수)

- <a id="직전-구현검수-기준선"></a> [직전 구현·검수 기준선](docs/history/PROJECT-STATE-2026-10-17.md#직전-구현검수-기준선)

- <a id="제품-방향"></a> [제품 방향](docs/history/PROJECT-STATE-2026-10-17.md#제품-방향)

- <a id="현재-구현"></a> [현재 구현](docs/history/PROJECT-STATE-2026-10-17.md#현재-구현)

- <a id="구현-구조와-변경-계약"></a> [구현 구조와 변경 계약](docs/history/PROJECT-STATE-2026-10-17.md#구현-구조와-변경-계약)

- <a id="최근-검수"></a> [최근 검수](docs/history/PROJECT-STATE-2026-10-17.md#최근-검수)

- <a id="문서-관리"></a> [문서 관리](docs/history/PROJECT-STATE-2026-10-17.md#문서-관리)

</details>

- 완료: [MEAS 후속 · 면·모서리 지정 측정](docs/implementation/MEAS-SELECTED-ELEMENTS-2026-10-18.md) — Direct Select A/B 고정, 원본 BRep 거리·측정점, 편집·Undo 참조 재검증.

- 완료: [MEAS 혼합·투영·축별 지정 측정](docs/implementation/MEAS-MIXED-PROJECTED-DISTANCE-2026-10-18.md) — 면↔모서리, 월드 평면·축별 독립 최소화, 원본 witness와 수치 정밀도 표시.

- 완료: [MEAS 측정 결과 고정·치수화](docs/implementation/MEAS-SAVED-DIMENSIONS-2026-10-18.md) — version 46 저장/복원, 연관 갱신·broken 재지정, 평면 치수 배치와 SVG/PDF 출력.

- 완료: [MEAS 치수선 직접 배치·편집](docs/implementation/MEAS-DIMENSION-PLACEMENT-2026-10-18.md) — 선택·드래그 미리보기·한 번 확정/Undo, 키보드 mm 이동, 치수 삭제와 stale 취소.

- 완료: [MEAS 치수 배치 스냅·겹침 정리](docs/implementation/MEAS-DIMENSION-LAYOUT-2026-10-18.md) — 평행 기준선 스냅·Shift 축 고정, 화면 겹침 안내, anchor 유지 간격 미리보기와 일괄 Apply/Undo.
