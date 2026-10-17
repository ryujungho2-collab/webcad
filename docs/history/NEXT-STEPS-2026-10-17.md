> 2026-10-17 문서 분리 시 보존한 이력입니다. 아래 상태·순서·검증 수치는 기록 당시 기준입니다. 현재 안내는 [원래 진입 문서](../../NEXT-STEPS.md), [현재 상태](../../PROJECT-STATE.md), [실행 큐](../../NEXT-STEPS.md)를 따릅니다.

# 다음 작업 — 전체 과제 목록

<a id="현재-실행-큐--2026-10-14"></a>

## 현재 실행 큐

정합성 갱신: **2026-10-17**. 구현·검증 근거는 2026-10-16까지의 기록이다. [계획서 대조·상태 기준](../reviews/PLAN-CONSISTENCY-2026-10-17.md).

**이 절이 실행 우선순위의 기준이다.** 아래 날짜별 기록의 ‘다음’은 당시 판단이며, 이 큐보다 우선하지 않는다. 기존 B/X/G/I 상세 표는 기능 범위와 완료 증거를 찾는 데 사용한다. 완료된 pilot을 전체 지원 완료로 확대하지 않는다.

완료된 UI 기반: **UI-C1 정돈된 편집 UI + UI-P1 프로젝트 탭**. 프로젝트마다 문서·Undo·선택·화면·복구 저장소를 분리했다. 탭 전환은 Undo를 유지하고 닫기/재열기는 새 Undo 세션이다. [구현·검증·한계](../implementation/PROJECT-TABS-2026-10-14.md). 최근 마감은 **CMP-S1/WF-D1 첫 지원 범위**, 다음 실행은 **WF-Q1 실제 주거 과제 검증**이다.

제품 방향: **프로젝트를 안전하게 이어 작업 → Copilot과 캔버스로 평면도 준비·모델 작성 → 두 안 비교·편집 → 실제 시트 출력**. **UI-P1-H1/H2·UI-P2·WF-A1·WF-C0/A2/B1은 각각의 지원 범위로 완료**했다. WF-B2/B3도 아래 지원 범위로 완료했으며 CMP-S1/WF-D1도 첫 지원 범위로 완료했고 다음은 **WF-Q1**이다. 외부 패키지는 아직 추가하지 않았다. Akan.js 전환은 진행하지 않는다.

| 순서 | 카드 / 종류 | 사용자에게 생기는 변화 | 선행 / 첫 완료 기준 |
| --- | --- | --- | --- |
| 완료 | **UI-P1-H1 저장·복구 보충** | 목록 백업·명시적 복원·checkpoint 검색 복구·raw 복구 다운로드, 로컬/파일 상태 분리 | 요청 ID/편집 세션/deadline 검증, 저장 실패 보존·재시도·정확한 저장 revision. [구현·검증·경계](../implementation/UI-P1-H1-PROJECT-RECOVERY-2026-10-14.md) |
| 완료 | **UI-P1-H2 저장소 관리 보충** | Projects 검색/필터·최근 시각·용량 추정, 라이브/닫힌 도면 파일 내보내기, 미등록 복구본 등록/삭제·200개 제한 해소 | 닫기/명시적 삭제 확인, 양쪽 checkpoint 기반 이미지 정리, IndexedDB 삭제 journal·실패/중단 복원·다른 세션 보존. [구현·검증·경계](../implementation/UI-P1-H2-PROJECT-MANAGER-2026-10-14.md) |
| 완료 · 지원 범위 | **UI-P2 다중 프로젝트 성능** | 비활성 화면의 렌더·계산·유휴 자원 비용 억제 | H1 메시지 계약. 렌더 중지·복귀, S 저장소/C 취소·예산, R5 두 프로젝트 cold/warm 검증. 전체 프로세스/무제한 문서 메모리 상한은 아님 |
| 완료 · 지원 범위 | **UI-P2-S 대형 문서 저장소 보충** | R5 두 프로젝트의 localStorage 백업 quota 초과 해결 | IndexedDB current/backup+내장 asset 원자 저장, migration receipt·CAS·중단 복구·정확 ack·닫기/재열기·R5 두 문서 reload. [구현·검증·범위](../implementation/UI-P2-S-DURABLE-STORAGE-2026-10-15.md) |
| 완료 · 지원 범위 | **UI-P2-C 작업 scope·메모리 예산** | 화면별 AbortSignal, cache active64MiB/비활성16MiB→30초0, 유휴 GPU/Worker 반환 | 문서/출력·Undo 보존, 늦은 응답 격리, R5 20회 전환·긴 비활성/복귀. 시간 단위 운영/문서·Undo/활성 GPU 상한은 후속. [구현·검증·경계](../implementation/UI-P2-C-TASKS-MEMORY-2026-10-16.md) |
| **완료 · 지원 범위** | **WF-B2 벽 의미·반복 돌출 → WF-B3 연관 개구부** | 직선 중심선/준비된 footprint·높이/두께/레벨/확정 높이 반복, 직선 host 문/창 관통 cut·명시적 연관 도면 rebind | 자동 코너 융합/곡선 host 개구부는 후속. [구현·검증·경계](../implementation/WF-B2-B3-2026-10-16.md) |
| **바로 다음 · CAD** | **WF-Q1 실제 주거 과제 검증** | 준비→벽/개구부→슬롯 창호/가구→평면/단면/A3 발행·수정/재발행 | CMP-S1/WF-D1 첫 지원 범위 완료. [구현·검증·경계](../implementation/CMP-S1-WF-D1-2026-10-16.md) |
| 후속 UI 1 | **UI-P3-A 좌우 비교** | 프로젝트 두 개를 나란히 보고 크기 조절·활성 편집 전환 | P2. 프로젝트별 Undo/명령/선택 격리, 분할 해제에도 열린 세션 유지 |
| 후속 UI 2 | **UI-P3-B 탭 탐색** | 탭 순서 이동·고정·열린 프로젝트 검색·키보드 전환 | H1. pointer/keyboard 모두 사용, 긴 제목·좁은 화면 대응, 브라우저 예약키 회피 |
| 병행 A | **UI-C2 선택 문맥 도구** | 선/곡선·솔리드·프레임·주석별 자주 쓰는 명령만 표시 | 기존 command registry 사용. 잠금·혼합 선택 이유, Review/Apply/Undo 연결 |
| 병행 B | **UI-C3 속성 패널 정리** | 핵심 수치·단위·스타일을 먼저 보고 고급 설정은 펼침 | 선택/명령 계약 공유. 다중 선택 혼합값·수치 편집 중 선택 변경·잠금 처리 |
| 다음 | **UI-C4 프로젝트 시작 화면** | 최근 프로젝트·미리보기·검색·복구·샘플/템플릿으로 시작 | H2. 샘플은 독립 복제, 썸네일 생성이 원본 BRep를 반복 계산하지 않음 |
| 다음 | **UI-C5 상태·입력·접근성** | 저장 상태·작업 진행·취소·단축키를 일관되게 이해 | C2/C3. 키보드/IME/포커스 복귀·960px·확대·명암, 숨은 팝오버 hit-test 회귀 |
| CAD 1 | **G6-D4-H2 곡선 해치 보충** | 타원/spline 단면의 폐합 경계와 구멍을 올바르게 채움 | 기존 정확 곡선 source 사용. 화면/SVG/PDF 동일, 잘못된 폐합은 진단 |
| CAD 2 | **G6-D5-E2 곡선 DXF 확대** | periodic/fit-only 입력 지원 범위와 변환 손실을 Review | H2와 병행 가능. 유한 domain·seam·단위·왕복 검증, 임의 폴리라인 대체 금지 |
| 성능 | **G6-D6-P4 캐시·cold HLR** | 장시간 대형 도면 편집의 메모리 상한과 최초 계산 비용 개선 | P3 계측 유지. byte 예산·퇴출·수명 정리·결과 동등성, P2와 계측 형식 공유 |
| 후속 | **G2-W1 프로젝트 내부 탐색** | 모델/평면/단면/상세/시트를 프로젝트 트리에서 바로 이동 | C3/C4. 같은 원본을 문서 복제 없이 참조, 뷰 이동과 모델 Undo 분리 |
| 후속 | **G2-W2 재사용 부품·표현 라이브러리** | 문/창/가구/도곽/선·해치 스타일을 검색·미리보기·삽입 | W1. 단위/원점/의존성/asset remap·한 Undo, 각 자료의 출처 기록 |
| 후속 | **G6-D5-Q1 출력 전 점검** | 누락 참조·stale·잘린 주석·축척·폰트·손실을 시트에서 찾음 | H2/E2. 문제 위치 이동, 지원 한계와 실제 오류 분리, 동일 export 경로 사용 |
| 후속 | **I-UX1 이미지 배치 경험** | 참고 이미지 교체·맞춤·자르기·투명도·앞뒤 순서를 쉽게 조작 | C2/C3. 기존 I 기능 재사용, 원본 비파괴·asset 저장/재열기·출력 검증 |
| 검토 | **UI-P4 공유/협업 기반** | 프로젝트 묶음 이식·revision 비교부터 시작 | H2/W1. 파일 기반 묶음과 충돌 정책 먼저. 실시간 공동편집/서버는 별도 설계 |

**2026-10-16 현재 실행 순서: WF-Q1.** CMP-S1/WF-D1 콘텐츠 정의·단일 공간/개구부 슬롯·override/reset/detach·중정 바닥/천장·3D 단색 마감·보수적 이격 진단을 구현했다. [사용·검증·지원 경계](../implementation/CMP-S1-WF-D1-2026-10-16.md). WF-B2/B3 직선 벽·준비된 footprint·연관 문/창·반복 높이·명시적 평단면/입면 rebind를 지원 범위로 완료했다. [이번 구현·지원 경계](../implementation/WF-B2-B3-2026-10-16.md). UI-P2 이후 C0/A2/B1을 지원 범위로 마감했다. File/Copilot/Ctrl K 공통 작업 패널, DXF 역할/검색·미리보기 좌표 pick·단위 검산/출처, 기존 문서 PURGE, line/arc/circle 진단·명시적 gap bridge·홀을 가진 analytic face·기존 정확 돌출·한 Undo/재열기를 연결했다. 임의 자연어·임의 UCS/spline 면·T 접합 자동 분할/전체 부분 영역 자동 수리·독립 BRep surface는 지원 완료가 아니다. [이번 구현·검증·경계](../implementation/WF-C0-A2-B1-2026-10-16.md). UI-P2의 시간 단위/전체 프로세스 메모리 상한, 문서/Undo 및 source/slab byte 예산은 별도 G6-D6-P4 범위로 유지한다.

### 평면도 과제 · Copilot · 상위 캔버스 확장

사용자의 7단계는 **작업 흐름의 완료 조건**이다. [전체 기능·공백·명령 계약·구현 순서·fixture·담당 경계](../product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md). 현재 **WF-A1·C0/A2/B1·B2/B3·CMP-S1/WF-D1**이 각각 지원 범위로 완료됐고 다음은 **WF-Q1**이다. 네이티브 DWG/2010 저장·SKP/3D Warehouse·범용 Flex·호버 최단거리까지 완료됐다는 의미가 아니다.

| 순서 | 카드 | 구현 결과 / 완료 기준 |
| --- | --- | --- |
| 완료 | **WF-A1 도면 준비** | File 및 Copilot의 Prepare floor plan → 레이어/단위/기준점/참조 잠금 → 실제 geometry Review/Apply. 미사용 수입 정의만 생략, 중첩 의존성 유지·한 Undo·재열기. [구현](../implementation/WF-A1-FLOOR-PLAN-PREPARATION-2026-10-14.md) |
| 완료 · 지원 범위 | **WF-C0 + WF-A2** | 공통 guided intent/선택/단위·세대 계약, 기존 문서 PURGE Review, DXF 역할/검색·XY preview pick·단위 검산·source receipt. [구현·경계](../implementation/WF-C0-A2-B1-2026-10-16.md) |
| 완료 · line/arc/circle 범위 | **WF-B1 폐합 진단·Make face** | 틈/중복/T 접합/자기교차/비평면 진단·위치 이동, 0–10mm 유일 끝점 bridge Review, 정확 outer/hole 면·원본 연관·돌출·v40 재열기. 최대2,000 drawing/edge 및 표시점200,000, 자동 교차 분할/일괄 수리는 후속 |
| **완료 · 지원 범위** | **WF-B2 → WF-B3** | 실제 벽·개구부 생성/치수 편집·확정 높이 반복·한 Undo/v41 재열기·명시 rebind. 독립 butt end/직선 host 범위 |
| 병행 기반 | **CAN-A1 → CAN-A2 → CAN-A3** | 상위 캔버스 소유/참조·모델/종이 단위 → Fixed/Hug/Fill·gap/padding·absolute/edge align → 글자/테두리/반지름/효과 포함 비례 scale |
| 병행 | **MEAS-H1 호버 거리** | 기준 선택 후 hover witness·최단/축/투영 거리. 레이어 집합은 실제 최근접 객체 명시. 정확/근사·단위·Worker 취소/cache |
| **완료 · 첫 지원 범위** | **CMP-S1 → WF-D1** | 자체 포함 콘텐츠 정의/단일 슬롯·개구부 추종·padding/minimum/fit·override/reset/detach·홀 보존 slab·3D 재질. [구현·남은 범위](../implementation/CMP-S1-WF-D1-2026-10-16.md) |
| **바로 다음** | **WF-Q1** | 작은 주거 평면 1건을 실제 UI로 준비→벽/개구부→가구→평면/단면/A3 발행, 수정·재발행·재열기 |
| 별도 | **IO-DWG1** | 정식 교환 어댑터의 라이선스·지원 버전·실제 파일 왕복 검증 후에만 DWG/SKP 지원 노출 |

**상위 캔버스의 크기 변경과 CAD 모델 치수 변경을 구분한다.** 실제 벽4000mm를 1:50으로 배치하면 표현80mm이고 원본4000mm는 유지한다. 모델을 변형하는 경우만 명시적 파라미터/transform 명령을 Review한다. UI-P2는 두 대형 프로젝트 및 UI-P3 분할 이전 필수 성능 작업으로 유지한다.

### 하위 에이전트에게 맡기는 방법

[작업별 담당 파일·구체적 범위·검증·위임 문구](../product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md)를 사용한다. 통합 담당은 `App.tsx`, `main.tsx`, 공통 메시지/명령 계약, `NEXT-STEPS.md`를 소유한다. 각 구현 담당은 해당 기능 파일과 대상 테스트를 소유하고 공통 파일 수정안은 통합 담당에게 전달한다. 같은 파일을 여러 에이전트가 동시에 수정하지 않는다.

현재 우선 작업은 **WF-Q1 실제 주거 과제 검증**이다. H1/H2와 UI-P2-S/C는 완료된 선행이다. 후속 UI 후보는 **UI-P3-A 좌우 비교 / UI-P3-B 탭 탐색**, 병행 가능한 후보는 **UI-C2 문맥 도구 / UI-C3 속성 패널 / G6-D4-H2 곡선 해치 / G6-D5-E2 곡선 DXF**다. **G6-D6-P4 캐시·cold HLR**과 **G6-D5-Q1 출력 전 점검**은 별도 카드다. WF-Q1과 G6-D5-Q1을 혼용하지 않는다. 위임 표는 향후 담당 경계이며 자동 병렬 실행 지시가 아니다. 선행 완료 전에는 계약 분석·fixture 준비만 하며 의존 구현을 완료 처리하지 않는다.

모든 카드 완료 조건: **실제 UI 진입점 → 실제 데이터 변경 → Preview/Review와 실패 처리 → Undo/Redo 또는 세션 복구 → 저장/재열기 → 해당 출력**을 범위에 맞게 확인한다. 테스트만 추가한 경우 ‘구현 완료’로 기록하지 않는다. 결과 보고에는 수정 파일, 재현 시나리오, 검증 명령/결과, 남은 지원 한계, 스크린샷/산출물 경로를 넣는다.

### 가져올 기능과 오픈소스 참고

2026-10-14 공식 저장소와 라이선스를 확인했다. 아래는 도입 후보/설계 참고이며 버전 선택·호환성 실험 전이다. 도입 시 정확한 버전/commit, 사용 파일, 라이선스/NOTICE, bundle 영향과 제거 경로를 기록한다.

| 참고 | 가져올 경험 / 연결 카드 | 도입 판단 |
| --- | --- | --- |
| [VS Code 소스](https://github.com/microsoft/vscode), [MIT](https://github.com/microsoft/vscode/blob/main/LICENSE.txt) | 탭·편집 그룹·빠른 전환·명령 검색 → P3/W1 | 동작 참고. 전체 workbench 이식 대신 현재 CAD 명령/세션 유지 |
| [Dockview](https://github.com/dockview/dockview), [패키지별 라이선스](https://github.com/dockview/dockview/blob/master/LICENCE.md) | 탭 이동·그룹 분할·layout 저장 → P3-A/B | core/React MIT 후보. Enterprise는 별도 상용 조건. iframe 이동 시 remount/Undo 유실 실험 필수 |
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels), [MIT](https://github.com/bvaughn/react-resizable-panels/blob/main/LICENSE.md) | 단순 좌우 분할과 크기 조절 → P3-A | 두 패널 첫 범위의 우선 비교 후보. Dockview와 중복 채택하지 않음 |
| [Radix Primitives](https://github.com/radix-ui/primitives), [MIT](https://github.com/radix-ui/primitives/blob/main/LICENSE) | 포커스·키보드·메뉴/다이얼로그 일관성 → C2/C3/C5 | native popover로 부족한 컴포넌트만 실험. 전체 UI 교체하지 않음 |
| [Excalidraw](https://github.com/excalidraw/excalidraw), [MIT](https://github.com/excalidraw/excalidraw/blob/master/LICENSE) | 선택 중심 UI·재사용 library·편집 이력 경계 → C2/W2 | 인터랙션 참고. CAD 정확 기하/단위/참조/Undo 모델은 유지 |
| [Dexie](https://github.com/dexie/Dexie.js), [Apache-2.0](https://github.com/dexie/Dexie.js/blob/master/LICENSE) | IndexedDB wrapper 도입 후보 | 미채택. UI-P2-S는 직접 IndexedDB로 대형 문서/current·backup·asset 저장을 구현했고 작은 문서는 localStorage를 유지한다. wrapper 도입 필요성은 별도 판단 |
| [tldraw](https://github.com/tldraw/tldraw), [현재 라이선스](https://github.com/tldraw/tldraw/blob/main/LICENSE.md) | 캔버스 선택·도구 노출 방식 참고 → C2 | 현 라이선스는 일반 운영 사용을 허용하는 MIT가 아니다. SDK 도입은 별도 조건 확인 후 판단 |
| [Photoshot](https://slohero.com/photoshot/editor/) | 조용한 크롬·간결한 도구 그룹·빈 상태 → C1/C3/C4/I-UX1 | 화면 분석 참고. 소스/아이콘/브랜드 복제 없이 자체 구현 |

당장은 **세션 신뢰성, 선택 중심 UI, 분할 비교**가 체감 효과가 크다. 클라우드 공동편집, 플러그인 마켓, 범용 사진 필터, 전면 프레임워크 전환은 현재 큐 뒤로 둔다.

## 구현·검증 기록

2026-10-15 **UI-P2-S 대형 문서 저장소 보충 완료(지원 범위):** 대형/current·backup·내장 image snapshot을 IndexedDB v2로 원자 저장하고 작은 문서는 기존 localStorage를 유지한다. 이관 commit 후 일치하는 원본만 정리, 중단 복구·다른 창 token CAS·actual revision ack·async 닫기·손상/누락 gate·관리/export/raw archive·삭제 journal 원자 commit을 연결했다. R5 두 도면 저장 성공·각 Undo/DXF·닫기/재열기·실제 페이지 reload를 검증했다. 다음은 **UI-P2-C → WF-C0+A2**. UI-P2 전체 완료는 아니다. [구현·한계·검증](../implementation/UI-P2-S-DURABLE-STORAGE-2026-10-15.md).


2026-10-15 **UI-P2 첫 범위 구현:** 프로젝트 세대 검증 activity 메시지·뷰포트/편집 도구 RAF 정지/복귀·Scene 시간 보존·60초 비활성 유휴 Worker 반환을 구현했다. R5 두 프로젝트 실제56부품/각 Undo/portable export·연관 DXF·Worker 재시작16 checks 통과. Cold17.4/15.3초, warm4회179.7–186.6ms(입력 지연 포함, 단일 실행). **B 복구 백업 quota 초과**를 확인했으므로 전체 P2는 진행 상태다. 다음은 **UI-P2-S 저장소 보충 → UI-P2-C 작업 scope/메모리 예산 → WF-C0+A2**. [구현·측정·한계](../implementation/UI-P2-PROJECT-ACTIVITY-2026-10-15.md).


2026-10-14 **UI-P1-H2 프로젝트 관리 구현:** Projects 검색/필터·최근 시각·local/origin 용량 추정·200개 제한 해결 경로를 연결했다. self-contained 도면 내보내기/재열기, 로컬 저장 실패 중 라이브 snapshot 파일 내보내기, 닫기 후 선택 프로젝트 영구 삭제, 미등록 source 등록/삭제와 양쪽 checkpoint 기반 unused image 정리를 제공한다. IndexedDB는 삭제 전 복구 journal에만 사용하며 문서 전체 이관은 아니다. 부분 실패/commit 실패/중단 복원·namespace/legacy/다른 탭 Undo 보존과 손상 current의 실제 backup 이미지 보존을 보충했다. 대상 Node29·browser4 workflows/89 checks·타입·architecture554·build405 통과. [구현·검증·지원 경계](../implementation/UI-P1-H2-PROJECT-MANAGER-2026-10-14.md). 다음은 **UI-P2 비활성 세션 성능 → UI-P3 좌우 비교**다.

2026-10-14 **UI-P1-H1 저장·복구 보강 완료:** 프로젝트 목록 백업/검증·명시적 복원·저장된 namespace 검색 복구·손상 원문 보존/복구 데이터 다운로드를 구현했다. 로컬 checkpoint와 파일 다운로드 상태를 구분하고, 실제 저장 snapshot/revision만 성공으로 표시한다. 닫기 request ID·편집 세션·deadline, pending 명령/저장 실패 시 닫기 거부·재시도, 읽을 수 없는 도면의 자동 저장/재시도 덮어쓰기 방지를 연결했다. 대상 Node14·browser3 workflows/58 checks·타입·architecture549·build402 통과. [사용·검증·지원 경계](../implementation/UI-P1-H1-PROJECT-RECOVERY-2026-10-14.md). 다음은 **UI-P1-H2 저장소 관리 → UI-P2 비활성 성능 → UI-P3 좌우 비교**다.

2026-10-14 **UI-P1 프로젝트 탭 구현:** 새 문서/파일을 새 탭으로 열고 독립 편집 세션·Undo/Redo·선택·2D/3D를 유지한다. 이름 변경·저장 상태·닫기 전 checkpoint·닫은 프로젝트 다시 열기·탭 목록 복구를 연결했다. 실제 브라우저19 checks, 대상 Node6 checks, 타입·architecture545·build 통과. [사용법·격리·지원 경계](../implementation/PROJECT-TABS-2026-10-14.md). 후속 후보: 좌우 분할 비교, UI-C2 문맥 도구, 다중 대형 프로젝트 메모리 예산.

2026-10-14 **UI-C1 Photoshot 구성 참고 첫 적용 완료:** 중립 크롬, 94→72px 리본, More curves/Construct/Measure 펼침 메뉴, Frames & sheets 통합 패널을 적용했다. 대상 native 4 workflows/91 checks, 타입·architecture541·production build 통과. [분석·적용·후속 UI-C2/C3/C4](../product/PHOTOSHOT-UI-REVIEW-2026-10-14.md).

2026-10-13 **P3 → X2-C1/C2 → X6-D2-S1 → G6-D5-E1 첫 범위 완료:** 실제 BRep bounds의 안전한 slab 판정·부분 slab LRU와 WASM capacity 계측을 보충했다. R5 native 단일 원본Review10.74→8.76초, raw retained slab+HLR 반복105ms/추가clip build0(최초와 분리). degree1–8/256-pole nonperiodic spline/NURBS 원본·수치 편집·길이/닫힌 평면 면적·실제 단면/HLR·정확한 ELLIPSE/SPLINE paper-domain DXF·0.02mm SVG/PDF 손실 Review·한글·v39 재열기를 연결했다. 전체Node1204/54 suites·타입·architecture539·production build, 대상native7 workflows/160 checks 통과. [P3 측정·경계](../implementation/G6-D6-P3-RETAINED-SLAB-2026-10-13.md), [곡선 사용·지원 경계](../implementation/SPLINE-NURBS-OUTPUT-2026-10-13.md).


2026-10-13 **G6-D6-P2 첫 성능 보충 완료:** 시트 주석/scene feature index·decoration bulk 은퇴·streaming bounds·Worker 원본 BRep LRU128을 구현했다. R5 14도면 이동 최초1280→157ms, raw HLR 반복1839→727ms, 실제 최초scene41.3→17.3초(각 단일 실행). 정확한830 HLR 출력/bounds·원본 Review/Undo·발행/재열기 유지. 전체Node1191/54 suites·타입·architecture533·build, 대상native4 workflows/98 checks 통과. 새 원본 nativeReview10.7초가 남아 다음은 **G6-D6-P3 retained slab·cold source HLR 보충**이다. [측정·지원 경계](../implementation/G6-D6-P2-LARGE-OUTPUT-PERFORMANCE-2026-10-13.md).


2026-10-13 **G6-D3-B2와 G6-D6-W1 첫 건축 workflow 완료:** 정확한 ellipse/elliptic-arc HLR·유한 domain/seam·sharp/outline 정책을 마감했다. 반대 방향 입면·숨은선 생략·background live 치수·원자적 혼합 원본 편집·CAD publication PDF를 구현했다. 실제 R5는56부품·14도면·10페이지/4권, 모든 참조 resolved·SVG/DXF skipped0·실제 UI35 checks/재열기 통과. 전체 Node1188/54 suites, 타입·architecture532·build 통과. 다음은 **G6-D6-P2 대형 소유 출력 성능 보충**. 일반 spline HLR·타원 해치·시공/법규 설계는 남는다. [B2 범위](../implementation/G6-D3-B2-CONIC-SEAM-2026-10-13.md), [W1 구현·산출물·한계](../implementation/G6-D6-W1-ARCHITECTURAL-ISSUE-2026-10-13.md).


2026-10-13 **X6-D2-E1 타원 단면 완료:** 실제 OCCT 타원/유한 타원호를 X2-A 축·domain 원본으로 연결했다. 세 평면 analytic range crop·닫힌 seam 병합·live 중심/끝점 주석·시트 축척·SVG/DXF/PDF·v35·Undo/잠금/stale를 검증했다. 기존 도서관 천창 전체/반쪽 단면을 추가해 56부품·9도면·6페이지가 됐다. 전체 Node1,173/54 suite, 대상 native5 workflows/105 checks, 타입·architecture527·build 통과. 당시 남았던 ellipse HLR/background는 후속 B2에서 구현했다. 타원 해치는 남는다. 다음은 **G6-D6-P2 대형 소유 출력 성능 보충**. [구현·지원 경계](../implementation/X6-D2-E1-ELLIPSE-SECTIONS-2026-10-13.md).

2026-10-13 **G6-D4-H1 건축 도면 표현 구현:** 실제 retained-depth BRep/HLR 배경, analytic 닫힌 경계·구멍 해치, 종이 간격·절단/배경/해치 선 굵기·이름을 UI Review/Apply/Undo와 캔버스·시트·SVG/PDF/DXF·v34에 연결했다. 56부품 프로젝트는 7도면·A2 5페이지, 열린 계단 경계는 해치 제외 경고로 남긴다. 전체 Node 1,166/54 suite, 타입·architecture524·build 통과. [구현·지원 경계](../implementation/G6-D4-H1-ARCHITECTURAL-EXPRESSION-2026-10-13.md). 대상 native 5 workflows/113 checks와 실제 A2 5페이지 PDF 독립 렌더링을 통과했다. 성공한 단일 native 원본 편집54.6초·Node 시트 재배치44초가 남아 **G6-D6-P2 대형 소유 출력 성능 보충 → X6-D2-E1 타원 단면** 순서로 진행한다.

2026-10-13 **G6-D6-P1 완료 조건 마감:** 저장된 resolved 원본의 논리 source revision(params/중첩 operand/TRS)을 비교해 scale/placement 후보와 최종 Apply까지 교선을 공유한다. 56부품·5도면의 주석/이름/표시/1:50·100·200 후보에서 BRep task와 cache lookup 0회를 검증했다. 최초 source 생성과 warmed 실행을 별도 기록한다. 전체 Node 1,160/54 suite, native 시트 2 workflows/43 checks, 타입·architecture518 통과. [구현·지원 경계](../implementation/G6-D6-P1-SECTION-REUSE-2026-10-13.md).
2026-10-12 P0/P1 수정: 영향 없는 단면/투영 갱신을 생략하고 원본 section/HLR cache와 feature index를 보충했다. 저장 단면의 레이어/종이 배치를 유지하며, 유일한 정지 꼭짓점/선 그래프 대응으로 문 폭 변경의 참조를 보존한다. Boolean·돌출의 analytic line/circle/arc 가시/숨은선 HLR을 실제 캔버스·SVG/PDF/DXF·v33에 연결했다. 수정 프로젝트는 56부품·7도면·A2 5페이지다. 당시 다음 G6-D4-H1은 위 최신 기록에서 구현했고 다음은 X6-D2-E1 타원 단면이다. 전체 Node 1,158/54 suite, native 6 workflows/167 checks, 타입·architecture517·build 통과. 대형 복구 저장 압축도 보충했다. Native 7도면 창 편집은 약12.6초로 실제 kernel/Boolean/HLR 비용이 남으므로 실시간 성능 완료로 보지 않는다. [수정 범위·측정·지원 경계](../implementation/COURTYARD-P0-P1-FIXES-2026-10-12.md).
2026-10-12 프로젝트 검토: 사용자 선택의 3층·약 2,426㎡ 중정형 도서관/메이커센터로 CAD 기반을 검증한다. 56부품·5도면에서 주석/배치의 전체 단면 재계산, Boolean 입면도 미지원, 단면 참조/비기본 레이어 편집 공백을 확인했다. 직접 편집 Review를 덮던 프레임 도구막대는 수정했다. 다음 순서는 **G6-D6-P1 성능 보충 → G6-D4-R1 단면 편집·참조 안정화 → G6-D3-B1/B2 일반 BRep 입면/숨은선 → G6-D4-H1 건축 도면 표현 → X6-D2-E1 타원 단면 → G6-D6-W1 건축 프로젝트 마감**로 조정한다. [설계·발견·마감 조건](../product/COURTYARD-COMMONS-CAD-AUDIT-2026-10-12.md). 전체 건축 도면 세트는 아직 완료가 아니다.

검증 산출물: [편집 가능한 검증 프로젝트와 사용법](../../output/projects/courtyard-commons/README.md), [정량 검수](../verification/COURTYARD-COMMONS-AUDIT-2026-10-12.json). 56부품·평면 3/단면 2·A2 4페이지를 생성했고 실제 UI 편집·Undo/Redo·PDF·재열기를 검사했다. 저장 단면 Review의 레이어 거절과 cut-only 평면 표현 부족은 미해결로 남겼다.
최신 완료: **G2-F3 연속 도면 이어 붙이기를 구현했다.** 2D Stitch frames에서 동일 평면·축척의 원본 2–16개를 공통 모델 좌표 또는 두 대응 기준점으로 정렬한다. proper rotation/이동·세 번째 방향 witness·잔차·겹침/빈틈·seam crop·정확한 중복 선/주석 정책을 Review/Apply·한 Undo로 연결했다. 원본/모델을 유지하며 명시적 해제·작업 구역·자동 시트·SVG/PDF/평탄화 DXF·v32 실제 재열기를 지원한다. 전체 **1,151 Node / 54 suites / fail·skip 0**, 타입·architecture **511 modules**·build 통과. 대상 native browser **8 workflows / 204 checks**, 다운로드 A4 1페이지 PDF 독립 렌더링을 검수했다. 전체 browser 재실행은 아니다. [사용·지원 경계](../implementation/G2-F3-CONTINUOUS-FRAMES-2026-10-12.md), [검수](../verification/G2-F3-CLOSEOUT-2026-10-12.json).

프레임 F1/S1/F2/D5-F1/F3 첫 범위를 완료했다. 이전 다음 카드 X6-D2-E1에 앞서 위 성능·참조 보충과 일반 BRep 입면을 진행한다. Akan.js 전환은 사용자 요청으로 진행하지 않는다.

이전 완료: **G6-D5-F1 프레임·구역 자동 시트를 구현했다.** 2D Frame sheets에서 선택 프레임/구역→A4/A3 가로/세로, 축소 후보·표준/간소 도곽·정투영 정렬·연결 묶음 보존·고정·다중 페이지를 Review/Apply·한 Undo와 연결했다. 원본 프레임/구역/모델 좌표는 유지하며 종이 배치 identity를 분리했다. 페이지별 SVG/DXF와 번호순 PDF 묶음 scope, 프레임별 crop·유효 축척·참조 주석·v31 실제 재열기를 검수했다. 전체 **1,132 Node / 54 suites / fail·skip 0**, 타입·architecture **504 modules**·build 통과. 대상 native browser **8 workflows / 210 checks**와 A4 2페이지 PDF 독립 렌더링을 확인했다. 전체 browser 재실행은 아니다. [사용·지원 경계](../implementation/G6-D5-F1-FRAME-SHEETS-2026-10-11.md), [검수](../verification/G6-D5-F1-CLOSEOUT-2026-10-11.json).

당시 다음 프레임 과제 G2-F3는 위 최신 기록에서 완료했다. 다음 CAD 기하 확대는 **X6-D2-E1**이다.

최신 보강(2026-10-11): **스케치 스타일·원호/혼합 grip·구속·solver 폐합·B2-F2 Lengthen·연속 치수 UI**의 실제 코드를 수정했다. 전체 브라우저 74페이지와 Node 971개를 검수했다. [수정 범위](../implementation/CAD-INTEGRATION-HARDENING-2026-10-11.md), [최초 실패/재검증 증거](../verification/CAD-INTEGRATION-HARDENING-2026-10-11.json).

이전 완료: **G2-F2 프레임 연결·자동 정렬을 구현했다.** 2D Link frames/Connections에서 정투영 front/top/right·간격·공통 모델 좌표 정렬, 단면선/방향/번호, 대상 crop 기반 상세 확대 범위/번호, 조립/부품 source·번호를 저장한다. 기준/종속 트리·고정 대상·구역 간 묶음 이동·명시적 재정렬·해제를 Review/Apply·한 Undo와 연결했다. 모순 역할·중복 부모/번호·순환·겹침·잠금·미해결 참조·stale를 진단하고 v30 실제 재열기를 검수했다. 화면/프레임 SVG·PDF·평탄화 DXF가 같은 참조 주석을 사용하며 모델 좌표·crop·축척은 유지한다. 전체 **1,116 Node / 54 suites / fail·skip 0**, 타입·architecture **498 modules**·production build 통과. 대상 native browser **7 workflows / 186 checks**(연결36 포함), 실제 5페이지 PDF의 독립 렌더링과 상세 선분 **25→50 paper mm**를 확인했다. 전체 browser 재실행은 아니다. [사용·지원 경계](../implementation/G2-F2-FRAME-CONNECTIONS-2026-10-11.md), [검수·최초 DXF 실패/수정](../verification/G2-F2-CLOSEOUT-2026-10-11.json).

추천 실행 순서: **G6-D4-H2 타원·spline 해치 범위 → G6-D5-E2 periodic/fit-only DXF 입력 → G6-D6-P4 자원 byte budget·남은 cold HLR**. G2-F3와 G6-D5-F1은 첫 범위에서 완료했다.

이전 완료: **G2-S1 작업 구역을 구현했다.** 2D New work area/Work areas, 이름·배경색·접기/펼치기, 단층·단일 소속·프레임 추가/제거/순서/구역 간 재배정을 제공한다. 구역 헤더 드래그/수치 이동과 탐색, Review/Apply·Undo, 잠금·잘못된 수치·stale·batch rollback·v29 실제 재열기를 검수했다. 모델 좌표·축척은 보존하고 구역 삭제는 소속만 해제한다. 접힌 프레임도 기존 SVG/PDF/DXF 출력 규칙을 유지하며 구역 배경/라벨은 출력하지 않는다. 전체 **1,098 Node / 54 suites / fail·skip 0**, 타입·architecture **493 modules**·production build 통과. 대상 native browser **5 workflows / 126 checks**(작업 구역25 포함), 실제 다운로드 PDF 2페이지의 독립 렌더링을 확인했다. 전체 browser 재실행은 아니다. [사용·경계](../implementation/G2-S1-WORKSPACE-SECTIONS-2026-10-11.md), [검수](../verification/G2-S1-CLOSEOUT-2026-10-11.json).

이전 추천의 G2-F2와 G2-F3는 위 최신 기록에서 완료했다. 기존 CAD 기하 확대 **X6-D2-E1 → 일반 BRep HLR → spline**은 별도 큐로 유지한다.

이전 완료: **G2-F1 도면 프레임을 구현했다.** 2D의 Draw frame/Frame selection, 명시적 도면·주석 멤버, 이름·축척·원본 기준점·여백, 드래그 이동/crop과 수치 Review/Apply를 연결했다. 모델 좌표·실제 치수를 보존하며 같은 원본의 복수 프레임, 원본 뷰 축척 정규화, 잠금·소스 소멸 진단·Undo·v28 재열기를 지원한다. SVG/기존 PDF 출력과 손실을 표시한 평탄화 DXF를 제공한다. 전체 **1,087 Node / 54 suites / fail·skip 0**, 타입·architecture **488 modules**·production build 통과. 대상 native browser **7 workflows / 165 checks**(신규 프레임26 포함)와 다운로드 PDF 독립 렌더링을 통과했다. 전체 browser 재실행은 아니다. 결과와 지원 경계는 [검수](../verification/G2-F1-CLOSEOUT-2026-10-11.json), [사용 안내](../implementation/G2-F1-DRAWING-FRAMES-2026-10-11.md)를 따른다. 당시 프레임 큐 다음이었던 **G2-S1 작업 구역은 위 최신 기록에서 완료했고** G2-F3도 위 최신 기록에서 완료했다. 기존 CAD 기하 큐의 X6-D2-E1과 구분한다.

갱신일: 2026-10-12. G 단계와 CAD B/A/C 하위 카드, 확장 X, 이미지 I, 건축·기계 도면 목표를 이 문서에서 함께 확인한다. **실행할 과제는 전체 ID로 지정한다.** `A1`은 G5-A1·G6-A1·B3-A1·B5-A1 등 서로 다른 과제를 뜻할 수 있고, 각도 치수 `C3`는 **B3-C3**다. 상위 단계의 일부가 끝나도 나머지 카드를 완료로 올리지 않는다.

상태: **완료**는 해당 지원 범위의 구현·자동 검수가 끝남, **부분**은 첫 범위만 완료, **대기**는 추가 구현/검수가 남음, **환경 필요**는 실제 외부 연결 검증이 준비되지 않음이다. 기존 기능이 있어도 확장 카드가 대기일 수 있다. 아래 표는 탐색용 목록이며 상세 계약은 연결된 기획/구현 문서가 소유한다. 최신 검수는 [PROJECT-STATE](../../PROJECT-STATE.md), [B1-E 재검증](../verification/B1-E-RECHECK-2026-10-09.json), [B1-B·C·D 재검증](../verification/B1-BCD-RECHECK-2026-10-09.json)을 따른다. 최초 마감의 전체 browser 검사와 이번 대상별 재검증을 구분한다.

빠른 이동: [프레임·작업 구역](#도면-프레임연결작업-구역--추가-계획) · [제품 G](#제품-g-전체와-하위-단계) · [CAD B0/B1](#cad-b0b1--조작구성편집참조) · [CAD B2](#cad-b2--수정명령-대상-확대) · [CAD B3/A/C](#cad-b3--치수스냅교환-ac-하위-단계) · [CAD B4/B5](#cad-b4b5--호-구속작업면솔리드) · [확장 X](#확장-x--추가-객체작도클립보드3d) · [이미지 I](#이미지-i와-제작-후속) · [건축·기계 목표](#건축기계-도면-목표의-남은-연결) · [이전 기록](#이전-구현검수-기록).

## B · X · G · I 실행 순서 이력 — 2026-10-11

[전체 실행 큐·선행 관계·추가 항목](../product/B-X-G-I-IMPLEMENTATION-ORDER-2026-10-11.md)을 기준으로 한다. B2-C2에 이어 **B3-A4·B5-F1/F2·X1-B2/B3·X4-A1·X5-A/B pilot과 G6-D1/D2·D3 첫 adapter를 완료했고 X6-D1/D2·G6-D4·X7-A/E·G6-D5/D6 첫 범위도 완료했고 G6-D5-A1/A2·X2-A를 완료했고 다음은 X6-D2-E1 → 곡선/HLR 확대**이다. 계열을 통째로 끝내는 대신 1차 건축·기계 모델/도면 목표를 먼저 연결한다. 새 카드의 상태는 아래 상세 표와 최신 구현 기록을 따른다.

| 순서 | 실행 묶음 |
| --- | --- |
| 완료 | **B2-C2** 독립 line–arc Chamfer/열린 코너. [구현·검수](../implementation/B2-C2-OPEN-END-CORNERS-2026-10-11.md) |
| 2 | **B5-F1 → B5-F2 완료** cylinder 지름/길이·단위 Review → 기존 sketch driver/변수·돌출 수치 편집 pilot |
| 3 | **X1-B2 → X1-B3 → X4-A1 → X5-A → X5-B 완료** 접선 작성 → 기준점 복사 → UCS pilot |
| 완료 | **G6-D1/D2 완료 · G6-D3 첫 윤곽 adapter 완료** 부품/조립 위치 → 비파괴 분해도 → 모델 연관 정투영 |
| 완료 · 첫 범위 | **X6-D1/D2 → G6-D4 → X7-A/E → G6-D5 → G6-D6** 화면 clipping/실제 section → 건축 단면 → 주석 → 시트/출력 → DXF 확대 → 두 분야 workflow |
| 완료 · 한 페이지 pilot | **G6-D5-A1** 자동 시트 배치·고정·축척 후보·overflow Review |
| 완료 · 도곽/정렬/16페이지 | **G6-D5-A2** 템플릿·필드·페이지 소유권·v26·다중 PDF |
| 완료 · 타원 원본 | **X2-A** ellipse/elliptic arc·수치/핸들·스냅·SVG/DXF·v27 |
| CAD 다음 | **G6-D4-H2 타원·spline 해치 보충 → G6-D5-E2 periodic/fit-only DXF 입력** |
| CAD 곡선 후속 | C1/C2·S1·E1 첫 범위 완료. H2 곡선 해치 → E2 periodic/fit-only 입력; 전체 spline solver는 별도 |
| 완료 · 프레임 첫 범위 | **G2-F1 → G2-S1 → G2-F2 → G6-D5-F1 → G2-F3** |
| 제작 후속 | **G1 공통 session owner → G4-B → I4 → I2 → I3** 도구 수명 → component 격리/override → 이미지 paste → pixel mask → 효과 |
| 제작 후속 | **X2-B + G2 path → G2 appearance/text → G4-A/C → I5 → G5 확대** 자유곡선/노드 → 표현 → 제작/출력 → PSD → AI 편집 |

X2-C1/C2는 위 CAD 확대 큐로 승격했다. X3-C·X3-B2/B3·X4-A2/B·X5-C·X6-A/B/C·X7-B/C/D는 후속 큐와 승격 조건을 상세 문서에 기록했다. G6-C 실제 adapter는 환경 준비와 필요한 fixture를 확보한 뒤 한 종류씩 실행한다. **G6-D는 내부 모델/도면 카드이며 외부 G6-C와 다르다.** 성능·참조 복구·보조 형상 출력·font/축척·mask 자원 정책도 각 실행 카드의 완료 경계에 포함한다.

최신 B2-C2 검수: **983 Node / 54 suites / fail·skip 0**, 대상 native browser **6 workflows / 123 checks**, 타입·architecture **442 modules**·production build 통과. [마감 증거](../verification/B2-C2-CLOSEOUT-2026-10-11.json).

## CAD 도면 지원 범위 확대 — 2026-10-11

사용자 요청에 따라 아래 하위 카드를 새로 정의했다. **G6-D5-A1/A2·X2-A는 선언된 지원 범위에서 완료했고 나머지는 대기다.** [상세 계약·지원 대상·제외 범위](../product/CAD-DRAWING-EXPANSION-PLAN-2026-10-11.md)가 각 카드의 완료 기준을 소유한다.

| 구현 카드 | 상태 | 다음 결과 / 핵심 선행 |
| --- | --- | --- |
| G6-D5-A1 → A2 | A1/A2 완료 · 지원 경계는 구현 기록 참고 | 기존 도면 자동 배치·A4/A3/축척/고정·overflow Review → 도곽·정렬·다중 페이지. 곡선/HLR과 독립 실행 |
| X2-A | 완료 | exact ellipse/elliptic arc 원본·수치/핸들 편집·스냅·측정·SVG/DXF·v27·실제 UI/출력. [구현](../implementation/X2-A-EXACT-ELLIPSE-2026-10-11.md) |
| G6-D6-P2 | 완료 · 측정한 첫 성능 범위 | R5 index/streaming bounds·원본 BRep LRU·scene 재사용·snapshot/Undo 분리 측정. 최초/warmed·정확도·stale·잠금·취소 유지 |
| G6-D6-P3 | 완료 · 측정한 첫 범위 | retained slab 재사용·안전한 빈 slab 판정·전역 HLR cold 비용, 메모리 byte 계측. 새 원본 native10.7초/최초scene17.3초를 보충; 가림/참조/취소 계약 유지 |
| G6-D6-P1 | 완료 · 56부품/5도면 마감 | 56부품/5도면의 영향 뷰만 갱신·section cache·시트 후보 중복 재계산 제거. 실제 프로젝트 지연 측정 |
| G6-D4-R1 | 이번 재현 보충 완료 | 저장 단면 레이어/종이 소유권 유지·참조 안정화·복구 UI·연관 주석/시트 회귀 |
| X6-D2-E1 | 완료 · 실제 ellipse/elliptic-arc | 실제 타원 단면·유한 range crop·연관 주석/시트; X2-A 원본 계약 사용 |
| G6-D3-B1 → B2 | line/circle/arc/ellipse HLR·conic/seam 정책 완료 | 실제 OCCT HLR 기반 일반 BRep 가시 윤곽/edge 구간 → 숨은선·seam/tangent 정책·점선/lineweight·교환. 첫 line/circle/arc/ellipse, spline 출력은 S1 이후 |
| X2-C1 → C2 → X6-D2-S1 | 완료 · degree1–8/256 poles nonperiodic pilot | 비유리 B-spline → rational NURBS exact 원본·domain/knots/weights·수치 편집/측정/DXF → 실제 spline 단면·HLR 곡선 인계. Bezier/node editor 전체는 필수 선행 아님 |
| G6-D5-E1 | 완료 · ELLIPSE/SPLINE/LTYPE·paper domain/한글 첫 범위 | ELLIPSE/SPLINE/LTYPE DXF·종이 경계 구간·font/한글·SVG/PDF 근사 tolerance/손실 Review |
| G6-D6-W1 → P2 | 건축 첫 workflow 완료 · 성능/두 분야 확대 잔여 | 두 분야 일반 BRep/곡선/숨은선/자동 시트 workflow → 단계별 p50/p95·캐시/자원·취소·stale 결과·10/50/100 부품 fixture |
| X6-D2-P1 / X6-D1-C1 | 대기 · 별도 확대 | 임의 frame 절단 / 화면 cap. cap과 실제 BRep 절단 모델을 구분 |
| G6-D4-H1 | 완료 · line/circle/arc 첫 범위 | 닫힌 loop·구멍 기반 건축 단면 hatch·절단선·전경/배경 표현, 종이 간격·교환 |
| G6-D4-H2 | 다음 · 보충 | 타원·spline 폐합/구멍·finite-domain hatch intersections·tangent/접촉·종이 spacing/출력·잠금/Undo. 근사 경계 자동 polygon 변환은 금지 |
| G6-D5-E2 | 후속 | periodic/fit-only DXF를 명시적 finite source basis로 정규화·수치 오차/손실 Review; custom LTYPE/font portability 확대 |
| G6-D6-P4 | 후속 성능 | live native cache byte budget·보수적 memory diagnostics·새 source/global HLR cold 비용; heap capacity를 cache live bytes로 사용하지 않음 |

자동 시트 A1은 [구현·검수](../implementation/G6-D5-A1-AUTOMATIC-SHEET-LAYOUT-2026-10-11.md)를 완료했고 **A2도 도곽/정렬/16페이지 범위와 X2-A 원본을 완료했고 X6-D2-E1로 진행**한다. 타원 X2-A와 C1/C2 rational 원본 선행은 완료했고 실제 S1 native spline 인계까지 연결했다. HLR은 mesh 실루엣으로 대체하지 않는다. 모든 변경은 실제 UI/Review/Apply·저장·Undo·잠금/실패·참조 재연결·출력 검수로 마감한다. 일반 BIM 의미·mate solver·전체 spline solver/임의 camera projection은 이 큐에서 제외한다.

## 도면 프레임·연결·작업 구역 — 추가 계획

2026-10-11 사용자 논의를 [상세 계획](../product/CAD-FRAMES-SECTIONS-PLAN-2026-10-11.md)에 반영했다. **G2-F1/S1과 [G2-F2](../implementation/G2-F2-FRAME-CONNECTIONS-2026-10-11.md)는 완료**, D5-F1 자동 시트도 완료했고 F3는 대기다. G2 아트보드 frame·G6-D5-A2 도곽과 별개로 지원 범위를 검수했다. **작업 구역 → 도면 프레임 → 출력 시트**로 구성하며, 작업 구역은 CAD 단면(section)과 구별하는 UI 명칭이다.

| 전체 ID | 상태 | 구현 범위 |
| --- | --- | --- |
| G2-F1 | 완료 · 2D 도면 프레임 | 빈 프레임 드래그/선택 도면·주석 감싸기, 이름·축척·멤버·crop·이동·SVG/PDF·평탄화 DXF. 모델 좌표/치수·기존 F 유지·v28. [사용·경계](../implementation/G2-F1-DRAWING-FRAMES-2026-10-11.md) |
| G2-S1 | 완료 · 단층/단일 소속 | 평면/단면/상세 또는 조립/부품별 작업 구역. 이름·색·접기/펼치기·순서·구역 이동/탐색·소속 변경·Undo·v29. 화면 정리와 출력 포함을 분리. [사용·경계](../implementation/G2-S1-WORKSPACE-SECTIONS-2026-10-11.md) |
| G2-F2 | 완료 · 동일 작업면/관계 트리/4유형 | 프레임 연결·정투영 정렬/간격·평면↔단면 참조·전체↔상세 확대·조립↔부품 참조. 고정/충돌/구역 간 연결·모델 변경 후 재배치 Review·v30. [사용·지원 경계](../implementation/G2-F2-FRAME-CONNECTIONS-2026-10-11.md) |
| G6-D5-F1 | 완료 · 첫 범위 | 프레임/구역→독립 종이 identity·A4/A3·축소 후보·도곽·정투영 정렬·고정·다중 페이지·연결 묶음 보존. SVG/PDF/DXF·crop·유효 축척·v31 검수 |
| G2-F3 | 완료 · 동일 뷰/독립 2D·2–16 source | 공통 좌표/두 대응 기준점·proper rigid 정렬·방향 witness·잔차/겹침/빈틈·seam crop·정확 중복 정책·원본 보존/해제·시트/SVG/PDF/평탄화 DXF·v32 |

G2-F1/S1/F2와 G6-D5-F1, G2-F3를 첫 지원 범위에서 완료했다. 기본 실행 위치는 CAD 곡선/HLR 확대 큐 뒤·G1/G4/I 제작 큐 앞이며 현재 다음 CAD는 **X6-D2-E1**을 유지한다. F1/S1은 기존 도면으로 독립 실행 가능하다. 프레임 이동은 presentation 배치, resize는 표시 범위, 축척 변경은 명시적 조작이다. 여러 프레임을 묶어 배치하기와 연속 도면 이어 붙이기를 분리한다. 같은 원본의 복수 프레임, 명시적 멤버 소유/참조, 잠금/Undo/저장·실제 출력은 상세 카드의 마감 조건이다.

## CAD B계열 보충 검토 — 2026-10-10

[현재 코드·실행 재현·보충 우선순위](../product/CAD-B-SUPPLEMENT-REVIEW-2026-10-10.md)를 반영했다. **B3-G1 → B3-D3 및 B0-C1·B1-E2 보강을 완료했다.** [공통 교점·출력 크기 계약](../implementation/B3-G1-D3-PRECISION-OUTPUT-2026-10-10.md), [아트보드 주석 출력](../implementation/B0-C1-ARTBOARD-ANNOTATIONS-2026-10-10.md), [최신 검수 증거](../verification/B0-C1-CLOSEOUT-2026-10-10.json). [B1-E2 호·혼합 구성 편집](../implementation/B1-E2-MIXED-SKETCH-EDITING-2026-10-11.md)도 완료했다. B2-F2도 [통합 보강](../implementation/CAD-INTEGRATION-HARDENING-2026-10-11.md)에서 완료했다. B2-C2도 완료했다. **B3-A4·B5-F1/F2도 완료했다.** [B3-A4](../implementation/B3-A4-DXF-PLACEMENT-2026-10-11.md)·[B5-F1/F2](../implementation/B5-F12-NUMERIC-PILOT-2026-10-11.md). X1-B2/B3·X4-A1·X5-A/B pilot도 완료했으며 G6-D1/D2·D3 첫 adapter도 완료했고 X2-A를 완료했고 다음 CAD 실행은 **X6-D2-E1**이다.

| 보충 ID | 상태 | 사용자 결과 |
| --- | --- | --- |
| B3-G1 | 완료 | 공통 안정 교점·tolerance, 유한 선/호·ray domain과 물리 위치 중복 제거. 큰 좌표 약 1.074 mm 잔차 수정 |
| B3-D3 | 완료 | 일반/연속 치수·문자의 PDF 모델 크기 × 출력 ratio 통일. 스타일 6×paperScale 2는 1:1에서 12 mm, 1:10에서 1.2 mm |
| B0-C1 | 완료 | 보드 문자·일반/연속 치수 SVG/PNG/PDF, 표시/레이어·clip·객체 순서·XY/XZ/YZ 회전/축척. Point·무한선/ray 유한화는 별도 후속 |
| B1-E2 | 완료 | 호 분할/병합·혼합 구성·선택 변 직선↔호 전환, stable arc edge 구속/driver·참조·live 돌출·v23. [실제 구현·검수](../implementation/B1-E2-MIXED-SKETCH-EDITING-2026-10-11.md) |
| B2-F2 | 완료 | XY/XZ/YZ sketch 선·호 Lengthen, driver 충돌 진단·연결 형상·live 돌출·UI Review/Undo. 면 부착/혼합 경로 Lengthen은 후속. [구현](../implementation/CAD-INTEGRATION-HARDENING-2026-10-11.md) |
| B2-C2 | 완료 | bounded line–arc Chamfer·열린 mixed free-end Chamfer/Fillet, D1/D2·공유 정점/ID·호 길이 guide·참조/Undo. [구현·검수](../implementation/B2-C2-OPEN-END-CORNERS-2026-10-11.md) |
| B3-A4 | 완료 · 지원 범위 | 비기본 TEXT/INSERT OCS·중첩 배치·signed scale·Review·실제 DXF 왕복. [B3-A4](../implementation/B3-A4-DXF-PLACEMENT-2026-10-11.md) |

## 현재 우선순위 — 1차 건축·기계 CAD

**B5-A1/A2·B5-B/C/D/E 작업면→면 스케치→돌출/절삭·Hole·Shell을 완료했다.** 면 위 로컬 작도·치수·투영과 live 돌출, 검토 후 단일 Undo로 확정하는 절삭과 위치·지름·깊이 입력형 원통형 Hole을 연결했다. 면 키 소멸 시 명시적 재연결이 필요하다. [Hole 구현·지원 경계](../implementation/B5-D-FACE-HOLE-2026-10-10.md), [마감 검수](../verification/B5-D-CLOSEOUT-2026-10-10.json)를 따른다. 안쪽 두께 Shell도 [구현·지원 경계](../implementation/B5-E-SHELL-2026-10-10.md), [마감 검수](../verification/B5-E-CLOSEOUT-2026-10-10.json)에 따라 완료했다. UCS/WCS 전환과 Line/Circle·local Move pilot은 X5-A/B에서 완료했다.

**B2-F 완료: 독립 원호 Lengthen의 포함각↔목표 길이 입력을 연결했다.** [사용·지원 경계](../implementation/B2-F-ARC-ANGLE-LENGTHEN-2026-10-10.md), [마감 검수](../verification/B2-F-CLOSEOUT-2026-10-10.json)를 따른다.

**B2-E 완료: 스케치 Stretch의 구속/구동 치수 유지·충돌 원자성·입력 복구·연쇄 재생성을 검수했다.** [사용·solver 이동 의미·지원 경계](../implementation/B2-E-SKETCH-STRETCH-2026-10-10.md), [마감 증거](../verification/B2-E-CLOSEOUT-2026-10-10.json)를 따른다.

**B3-A3를 유한 analytic 도형 OCS·기울어진 평면 교환 범위에서 완료했다.** [지원 범위·Review·왕복 검수](../implementation/B3-A3-DXF-OCS-2026-10-10.md), [마감 증거](../verification/B3-A3-CLOSEOUT-2026-10-10.json)를 따른다. 비기본 TEXT/INSERT OCS와 사용자 UCS는 후속이다.

2026-10-09 사용자 목표: **1차는 동일 모델의 건축·기계 도면, 지름/길이 수치 편집, 저장 뷰와 분해도**다. **2차는 아트보드·벡터/이미지 편집·프로토타입·슬라이드·LLM 통합**이다. 기존 구현은 유지한다. [목표·기반/공백·구현 분할·완료 workflow](../product/ARCHITECTURE-MECHANICAL-MILESTONE.md)를 따른다.

**현재 요청은 CAD 기본 수정 공백 보완이다.** **B2-D 블록 Stretch의 전체 포함 rigid move·부분 포함 거부/명시적 인계를 완료했다.** [사용·검수·envelope 경계](../implementation/B2-D-BLOCK-STRETCH-2026-10-10.md)를 따른다. **B2-C arc–arc Fillet/Chamfer와 닫힌 line–arc/arc–arc 코너를 완료했다.** [사용·검수·지원 경계](../implementation/B2-C-ARC-CORNERS-2026-10-10.md)를 따른다. **B2-B line–arc Fillet의 bounded 접점·유지 가지·복수 해 선택을 완료했다.** [사용·검수·후속 경계](../implementation/B2-B-LINE-ARC-FILLET-2026-10-10.md)를 따른다. B2-A1 두 윤곽과 **B2-A2 내부 코너의 D1/D2**를 구현했다. [내부 코너의 검토·거리선·관계 갱신·한계](../implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md), [CAD 카드](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md)를 따른다. **B0-A 컨트롤 Enter/Space와 CAD 반복 충돌 한 종류를 수정했다.** [대상별 실제 조작·숫자 grip·History·제한](../implementation/B0-A-KEYBOARD-ACTIVATION-2026-10-09.md)을 따른다. **B0-B 기본 작도·점 기반 변환의 단위/좌표·숫자 preview/Enter/클릭 일치와 입력 복구를 완료했다.** [지원 범위·검수](../implementation/B0-B-PRECISION-INPUT-2026-10-09.md)를 따른다. **B0-C 기본 root 도면 요소의 표시/잠금/출력 공백을 완료했다.** [범위·검수·후속 경계](../implementation/B0-C-DRAFTING-VISIBILITY-2026-10-09.md)를 따른다. **B1-A 일반 도형 Break의 남길 조각·치수/작도 참조 보존을 구현했다.** [명령 계약·검수·후속 경계](../implementation/B1-A-BREAK-REFERENCES-2026-10-09.md)를 따른다. **B1-B Explode→편집→Join 의존 관계 복원을 완료했다.** [정확한 선·호 분해·치수/작도/profile/scene 갱신·한계](../implementation/B1-B-EXPLODE-JOIN-REFERENCES-2026-10-09.md)를 따른다. 스케치/패턴 Break·소유 adapter는 별도 검증 단위다. **B1-C 블록 인스턴스 하나의 해체를 완료했다.** [world 복원·1단계/재귀 중첩·검수·한계](../implementation/B1-C-BLOCK-DISBAND-2026-10-09.md)를 따른다. 정의 격리 편집과 override/variant는 G4-B 후속이다. **B1-D 다중선 지정 변의 직선↔호 전환을 완료했다.** [접속점 고정·반지름/방향·참조 재연결·한계](../implementation/B1-D-EDGE-CONVERSION-2026-10-09.md)를 따른다. 스케치 소유 변 전환은 B1-E 후속이다. **B1-E 스케치 정점·변 구성 편집을 완료했다.** [직선 구성·구속/구동 치수/돌출 갱신·한계](../implementation/B1-E-SKETCH-VERTICES-2026-10-09.md)를 따른다. 호·혼합 bulge 구성도 B1-E2에서 완료했다.

동일 모델의 도면 작업 축은 **G6-A1 모델 뷰 저장 계약 → G6-A2 뷰 UI → 수치 편집 pilot → 부품/분해 표현 → 연관 정투영/건축 단면 → 시트·치수·출력 → 두 분야 전체 검수**다. **G6-A1 문서·명령·카메라 저장/복원·v15·History를 완료했다.** [지원 계약과 검수](../implementation/G6-A1-MODEL-VIEWS-2026-10-09.md)를 따른다. G6-A2의 실제 저장·호출 UI 연결도 완료했다. [사용·검수](../implementation/G6-A2-MODEL-VIEW-UI-2026-10-09.md)를 따르며 다음 1차 후보는 수치 편집 pilot이다. 사용자가 별도로 요청한 **G5-B2는 단일 2D Move로 구현**했고 [지원 계약·검수 기록](../implementation/G5-B2-COPILOT-MOVE-2026-10-09.md)을 유지한다. 그 밖의 gateway 편집 확대와 실제 LLM 연결은 2차 후속이다.

## 제품 G 전체와 하위 단계

상세 분할은 [WORK-SLICES](../WORK-SLICES-2026-10-06.md), 공통 기준은 [구현 인계](../IMPLEMENTATION-READINESS-2026-10-05.md)를 따른다.

| 전체 ID | 상태 | 구현된 범위 / 남은 작업 |
| --- | --- | --- |
| G0 | 완료 | 실행환경·아트보드 초기 기준선 복구/검수 |
| G1 | 부분 | 명령 전환·History·포커스와 활성 아트보드 선택 복원, 블록 도구 키보드 경계 보강. 공통 session owner·실무 평가 후속 |
| G2 | 부분 | 아트보드 frame/Fit/SVG·벡터 appearance·component 기반과 정의 멤버 vector override 연결. 스케치 Appearance UI·재생성/Copy 스타일 보존 보강. G2-F1 프레임·G2-S1 작업 구역·G2-F2 연결/정렬 완료, G6-D5-F1 자동 시트 완료, G2-F3 연속 도면 첫 범위 완료. path/import·compound/gradient·인스턴스별 override/variant 후속 |
| G3-1 | 완료 | 이미지 import·배치·크기/crop·SVG·저장/재열기 |
| G3-2 | 완료 | source 공유 복제·exact transform·aspect lock·Align |
| G3-3a | 완료 | 비파괴 ellipse mask/clip |
| G3-3b | 완료 | crop edge/corner 캔버스 핸들 |
| G3-4a | 완료 | placement별 opacitycopilot |
| G3-4b1 | 완료 | brightness/contrast/saturation |
| G3-4b2 | 완료 | 아트보드 PNG 합성 출력 |
| G3-4b3 | 완료 | 활성/여러 아트보드 PDF 출력 |
| G3-5 / G3-5A | 부분 | source 공유·재업로드 제거·해제·자동 회귀와 측정 마감. 실무자/native GPU·heap/VRAM 평가는 남음 |
| G4-A | 부분 | Scene/Auto Layout/state/link/player 첫 범위와 투명 프레임의 링크 비활성화 검수 완료. 직접 layout 핸들 등 확장 남음 |
| G4-B | 부분 | Scene source→Properties·finite nested component 인계 완료. 격리 편집·override/variant 후속 |
| G4-C | 부분 | 검토한 state/time/layout의 정지 SVG와 자급식 HTML prototype player 완료. PPTX·GIF/APNG·영상 출력 후속 |
| G5-A1 | 완료 | gateway 응답 검증·취소/timeout·late response 경계. 정확한 JSON media type·잘못된 UTF-8 거부 보완, mock transport 검수. [보완 기록](../implementation/G5-A1-GATEWAY-RECHECK-2026-10-09.md) |
| G5-A2 | 완료 | 패널/설정 draft·요청 context 수명·변경 시 무효화 |
| G5-A3 | 완료 | authoritative Apply·잠금/경합·게시 전 Cancel·결과 인계 |
| G5-B1 | 완료 | local 선택/명시적 target Query·측정/관계/오류·수동 인계 |
| G5-B2 | 부분 | 선택된 독립 finite 2D drawing 하나의 Move 완료. 다른 편집 명령·다중 대상·local 자연어 Move 확대 남음 |
| G5 실제 LLM 연결 | 환경 필요 | provider·서버·인증·실제 응답/취소/게시 workflow 검수. A/B 완료와 구분 |
| G6-A1 | 완료 | 명명된 모델 뷰의 카메라/프레이밍 계약·명령·v15/이전 파일 호환·History·복원 adapter. [검수·경계](../implementation/G6-A1-MODEL-VIEWS-2026-10-09.md) |
| G6-A2 | 완료 | Ribbon/검색의 저장·호출·이름 변경·카메라 갱신·삭제와 표준 뷰/Fit, active camera·OrbitControls 연결. [실제 검수·경계](../implementation/G6-A2-MODEL-VIEW-UI-2026-10-09.md) |
| G6-B | 완료 | 첫 JSON fixture의 독립 선·직사각형, ID/단위/좌표 변환·손실/asset metadata·Preview/Apply·v16 receipt·export 왕복. [구현·지원 경계](../implementation/G6-B-OFFLINE-FIXTURE-2026-10-09.md), [카드](../product/G6-B-OFFLINE-ADAPTER-PLAN.md) |
| G6-B1 | 완료 | envelope/manifest 계약·version/source ID/단위·좌표계/loss/asset validator |
| G6-B2 | 완료 | 첫 fixture decode·mm/좌표 변환·새 UUID 매핑·detached import plan |
| G6-B3 | 완료 | 파일 Preview·손실 수락·atomic Apply·v16 provenance·History/File/recovery·재열기 UI |
| G6-B4 | 완료 | 첫 adapter export·편집 후 실제 다운로드/reimport 왕복·손실/참조/단위 검수 |
| G6-C | 환경 필요 | 실제 Revit/IFC·Manim·Notion/InDesign adapter를 각각 연결/검수 |
| G6-D1/D2 | 완료 | 안정 부품 ID·조립 배치·비파괴 분해도·v24·Undo/재열기. [구현](../implementation/G6-D123-ASSEMBLY-EXPLODED-PROJECTION-2026-10-11.md) |
| G6-D3 | 부분 · 첫 adapter 완료 | 주축 box/cylinder 모델 연관 윤곽·source 대응·재생성·재연결·SVG/DXF. 일반 BRep/숨은선은 G6-D3-B1/B2, spline은 X6-D2-S1로 확대 |
| G6-D4/D5/D6 | 부분 · 첫 범위 완료 | 기본 평면 실제 단면·수동 시트/연관 치수/SVG/PDF/정확 DXF·두 분야 예제 완료. 일반화·성능은 후속. [순서·기존 목표 대응](../product/B-X-G-I-IMPLEMENTATION-ORDER-2026-10-11.md) |

## CAD B0/B1 — 조작·구성편집·참조

**2026-10-09 재검증:** B1-B·C·D는 아래 지원 범위에서 완료다. 전체 Node **733개**, 대상 browser **3개·50 checks**, 타입·구조·빌드 통과. B1-C 전단 복원 결함을 수정했으며 [재검증 증거](../verification/B1-BCD-RECHECK-2026-10-09.json)에 기록했다. B1-E도 직선 스케치 구성 범위에서 완료다. B1-F1/F2/F3도 아래 최신 기록에서 완료했다. B1-E 호·혼합 구성은 2026-10-11 B1-E2에서 확대 완료했다. G5-B2 추가 확대는 별도 미완료 과제다.

**B1-E 재검증:** 전체 Node **746개**, 대상 native browser **1 workflow·16 checks**, 타입·architecture **353 modules**·workspace build 통과. 잠긴 원본·작도 dependent와 구동 치수/검토 형상 간 solver 충돌의 원자적 거부를 회귀 검사 2개로 보강했다. 전체 browser 52개·1054 checks는 최초 마감 기록이며 이번에는 B1-E workflow를 다시 실행했다. [재검증 증거](../verification/B1-E-RECHECK-2026-10-09.json).

상세 계약·수정 위치·선행 조건: [CAD 구현 카드](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md#4-b0b5-구현-카드). 현재 지원 대상: [CAD-BASICS](../product/CAD-BASICS.md).

| 전체 ID | 상태 | 다음 결과 |
| --- | --- | --- |
| B0-A | 완료 | 컨트롤 Enter/Space의 행 선택·CAD 반복 충돌 한 종류 수정. [숫자 grip·대상별 실제 검수와 제한](../implementation/B0-A-KEYBOARD-ACTIVATION-2026-10-09.md). 기본 조작 전체의 완료 아님 |
| B0-B | 완료 | 기본 작도·점 기반 Move/Copy/Rotate의 단위/활성 필드·상대/극좌표·숫자 preview/Enter/클릭 일치·입력 복구·XY/XZ/YZ. [실제 범위·검수](../implementation/B0-B-PRECISION-INPUT-2026-10-09.md) |
| B0-C | 완료 | 기본 root 도면 요소의 SVG 문자·치수 layer style·finite construction dash·표시/잠금/선택/출력 일치. [지원 범위·17 native checks·제한](../implementation/B0-C-DRAFTING-VISIBILITY-2026-10-09.md). 보드 문자/치수와 nested member 확대는 별도 |
| B1-A | 일반 완료 / 확대 대기 | 일반 Break 조각 보존 선택·치수/작도 point/edge/span/branch 재연결·원자성·History 검수. sketch→pattern은 별도 요청 |
| B1-B | 완료 | 일반 root 도형의 Explode→정확한 선/호 편집→Join에서 치수/작도/profile/scene 의존 관계 복원. [지원 경계](../implementation/B1-B-EXPLODE-JOIN-REFERENCES-2026-10-09.md) |
| B1-C | 완료 | 블록 인스턴스 하나의 해체와 world 복원·1단계/재귀 중첩, 다른 instance/definition 보존. 전단 곡선·손실 있는 중첩 배치 거부, 재귀 직선 복원 검수. [지원 경계](../implementation/B1-C-BLOCK-DISBAND-2026-10-09.md) |
| B1-D | 완료 | 일반 root 다중선 지정 변의 직선↔호 전환과 접속점 유지·치수/작도 재연결. 스케치 소유는 B1-E 후속. [지원 경계](../implementation/B1-D-EDGE-CONVERSION-2026-10-09.md) |
| B1-E | 완료 | 스케치 정점·변 구성 편집과 구속·구동 치수·돌출 갱신. 직선 구성 및 B1-E2 호·혼합 bulge 지원. [지원 경계](../implementation/B1-E-SKETCH-VERTICES-2026-10-09.md) |
| B1-F1 | 완료 | source 교체 후 해치 재연결·영역 재생성. 연속 치수·바인딩은 후속. [지원 경계](../implementation/B1-F1-HATCH-RECONNECTION-2026-10-09.md) |
| B1-F2 | 완료 | source 교체 후 연속 치수 재연결·점열 갱신. 바인딩은 후속. [지원 경계](../implementation/B1-F2-CHAIN-RECONNECTION-2026-10-09.md) |
| B1-F3 | 완료 | source 교체 후 변수/수식 바인딩 재연결·의미 변경 거부. [지원 경계](../implementation/B1-F3-BINDING-RECONNECTION-2026-10-09.md) |

## CAD B2 — 수정명령 대상 확대

| 전체 ID | 상태 | 다음 결과 / 완료 범위 |
| --- | --- | --- |
| B2-A1 | 완료 | 두 독립 윤곽의 D1/D2 모따기·unit·swap/equal·거리선·Apply→Join. [실제 범위](../implementation/B2-A1-ASYMMETRIC-CHAMFER-2026-10-09.md) |
| **B2-A2** | **완료** | 독립 polyline/rectangle 내부 직선 코너의 D1/D2·단위·Swap/Equal·거리선·review·치수/작도/돌출 갱신·원호/ID 보존·원자성·Undo/reload. [지원 경계](../implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md) |
| B2-B | 완료 | 독립 arc + straight free-end Fillet의 해석 접점·bounded 유지 가지·복수 해 선택·radius 안내·Preview/Apply·한 Undo. [지원 범위·검수](../implementation/B2-B-LINE-ARC-FILLET-2026-10-10.md) |
| B2-C | 완료 | 독립 finite arc–arc Fillet/Chamfer와 닫힌 line–arc/arc–arc 코너. 해석 접점·원호 길이 D1/D2·정점 선택·폐합/Offset·한 Undo를 두 연산별 검증. [지원·검수](../implementation/B2-C-ARC-CORNERS-2026-10-10.md) |
| B2-D | 완료 | 전체 instance envelope 포함 시 translation만 이동. 부분 포함은 혼합 batch까지 거부하고 definition edit/명시적 Disband로 인계. nested/affine 극값·Review·한 Undo 검수. [지원·검수](../implementation/B2-D-BLOCK-STRETCH-2026-10-10.md) |
| B2-E | 완료 | [스케치 Stretch solver·고정점/구동 치수 충돌·복구·연쇄 재생성·검수](../implementation/B2-E-SKETCH-STRETCH-2026-10-10.md). active sketch Finish·rectangle shear/면 Stretch는 지원 경계. 스케치 선/호 Lengthen은 B2-F2 완료 |
| B2-F | 완료 | 독립 원호 Lengthen의 포함각 deg/rad 입력↔world 목표 길이 환산·CW/CCW·XY/XZ/YZ·0/full-turn 경계·Preview/Undo 검수. [지원 범위](../implementation/B2-F-ARC-ANGLE-LENGTHEN-2026-10-10.md) |

## CAD B3 — 치수·스냅·교환

`B3-A`는 DXF 교환, `B3-C`는 일반 각도 주석의 상위 카드다. **A1/A2 완료는 A3 완료가 아니며**, 일반 주석은 스케치의 구동 치수와 구별한다.

| 전체 ID | 상태 | 다음 결과 / 완료 범위 |
| --- | --- | --- |
| B3-A1 | 완료 | DXF bulge 정확한 입출력·단위/평면 내 transform·왕복 |
| B3-A2 | 완료 | 실제 파일 Import review→편집→Export→재가져오기 |
| B3-A3 | 완료 | [원·원호·bulge OCS/elevation·기울어진 평면 선·analytic DXF 왕복·검수](../implementation/B3-A3-DXF-OCS-2026-10-10.md). 비기본 TEXT/INSERT·ellipse·UCS는 후속 |
| B3-B | 완료 | 일반 원/허용 호의 지름 주석·leader 배치·live 갱신·재연결 |
| B3-C1 | 완료 | 두 straight edge의 각도/branch·표시 기하 계산 |
| B3-C2a | 완료 | 두 참조 create/update·refresh·한 transaction/History |
| B3-C2b | 완료 | Trim/Join remap·v14 저장/재로드·참조 원자성 |
| B3-C3 | 완료 | 검색/리본/우클릭·캔버스 선택/핸들·Review/Apply·DXF/SVG/PDF. [C2/C3 근거](../implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md) |
| B3-D1 | 완료 | 선형/반지름/지름/각도/연속 치수의 표시 단위·소수 자릿수. [구현·검수](../implementation/B3-D-E-F-DIMENSION-TRACKING-2026-10-10.md) |
| B3-D2 | 완료 | 공통 글자 높이·화살표 크기·간격·종이 축척을 화면/내보내기에 반영. 측정·구동값과 원본 기하 보존 |
| B3-E | 완료 | 작도 중 Shift+A 추적점 획득/해제, Shift+R 전체 해제, Alt 일시 억제, Shift+L 방향 잠금. 문서 변경 시 해제 |
| B3-F | 완료 | 복수 추적점의 수평/수직선 교점, 픽셀 반경 후보와 Shift+N 전환·원본 안내 |

## CAD B4/B5 — 호 구속·작업면·솔리드

| 전체 ID | 상태 | 다음 결과 / 선행 |
| --- | --- | --- |
| B4-A | 완료 | point-on-arc의 방향 있는 유한 호 구간·끝점·wrap/시계 방향, drag·저장 v17. [구현·검수](../implementation/B4-ARC-CONSTRAINTS-2026-10-10.md) |
| B4-B | 완료 | line–arc 접점이 유한 선분과 실제 호 구간에 모두 포함되어야 함. 불가능한 고정 입력은 원자적으로 거부 |
| B4-C | 완료 | arc–arc/arc–circle 내·외접의 실제 접점, 반지름 치수 변경과 live 돌출 재생성 |
| B4-D | 완료 | 선택된 근접 선–호/호–호/호–원 접선 후보를 Review→Apply로 확정, 취소·Undo. [마감 증거](../verification/B4-CLOSEOUT-2026-10-10.json) |
| B5-A1 | 완료 | 자유 작업면 origin/basis/normal·좌표 변환·v18 저장·기존 XY/XZ/YZ 호환. [구현·검수](../implementation/B5-A-WORK-PLANES-2026-10-10.md) |
| B5-A2 | 완료 | planar BRep face frame·정확한 source key 추적·소멸/모호성 표시·명시적 재연결. [마감 증거](../verification/B5-A-CLOSEOUT-2026-10-10.json) |
| B5-B | 완료 | 면 위 스케치→치수→projection→live 돌출·원본 이동/회전 추종. [구현·검수](../implementation/B5-B-C-FACE-SKETCH-CUT-2026-10-10.md) |
| B5-C | 완료 | blind/through 절삭 Preview→Apply·체적 검증·source ownership·단일 Undo. [마감 증거](../verification/B5-B-C-CLOSEOUT-2026-10-10.json) |
| B5-D | 완료 | 면 로컬 위치·지름·깊이의 blind/through 원통형 Hole, Review/Apply·live 재생성·v20·STEP. [구현·검수](../implementation/B5-D-FACE-HOLE-2026-10-10.md) |
| B5-E | 완료 | 제거할 면·안쪽 두께 Shell, Review/Apply·단일 solid 검증·면 재지정·live 재생성·v21·STEP/STL. [구현·검수](../implementation/B5-E-SHELL-2026-10-10.md) |
| B5-F1 | 완료 · 단일 cylinder pilot | Ø/R·길이·단위, detached 영향/체적 Review·Apply·종속 오류·Undo/재열기/STEP. [구현](../implementation/B5-F12-NUMERIC-PILOT-2026-10-11.md) |
| B5-F2 | 완료 · 기존 driver/돌출 pilot | sketch R/Ø·단위 driver, 연결 solid 체적 Review·변수 handoff·돌출 distance Review/Apply. [구현](../implementation/B5-F12-NUMERIC-PILOT-2026-10-11.md) |

## 확장 X — 추가 객체·작도·클립보드·3D

상세 지원 축: [확장 X 설계](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md#5-기본기-밖으로-밀려나지-않도록-남겨-둘-확장-x). 기존 객체의 새 작성 방식과 새 geometry 종류를 구별한다.

2026-10-10 [현재 코드 대조·실행 카드·선행 조건 검토](../product/CAD-X-IMPLEMENTATION-REVIEW-2026-10-10.md)를 반영했다. **X1-A/C·X1-B1/B2/B3·X3-A·X3-B1·X4-A1·X5-A/B pilot을 완료했으며 X2-A를 완료했고 다음 CAD 실행은 X6-D2-E1**이다. X5 좌표계/3D 배치, X4 복사/주석 인계, X2 신규 곡선은 해당 선행 계약에 따라 진행한다. 하위 일부 완료로 상위 카드 전체를 완료 처리하지 않는다.

| 전체 ID | 상태 | 다음 결과 |
| --- | --- | --- |
| X1-A | 완료 | 3점 원·시작/통과/끝 호, standalone/sketch·정밀 입력·방향·기존 편집/치수/돌출·DXF. [구현·검수](../implementation/X1-A-THREE-POINT-CURVES-2026-10-10.md) |
| X1-B | 완료 · B1/B2/B3 | 두 끝점+반지름, oriented 시작 접선+끝점, 두 직선+반지름 접선 원. 가지·finite/extension·단위/스냅·Review·sketch/출력. [B2/B3 구현](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md) |
| X1-C | 완료 | 중심·3–128변·내접/외접 반지름·회전각의 정다각형. standalone/일반·면 sketch의 편집 가능한 closed polyline, Review/Apply·면적/둘레·돌출·DXF·아트보드 SVG. [구현·검수](../implementation/X1-C-REGULAR-POLYGON-2026-10-10.md) |
| X2-A | 완료 | Ellipse/elliptic arc exact 원본·수치/핸들 편집·스냅·측정·SVG/DXF·v27 저장/Undo·실제 UI. X6-D2-E1 선행. [구현](../implementation/X2-A-EXACT-ELLIPSE-2026-10-11.md) |
| X2-B | 대기 | Bezier 객체·노드 편집·교환 |
| X2-C | 완료 · bounded nonperiodic C1/C2 | X2-C1 비유리 B-spline → X2-C2 rational NURBS. 객체·정밀 편집·교환 |
| X3-A | 완료 | 저장된 작도의 source/point/edge/endpoint-span·교점 branch 재지정. 정의·inputs·cache·종속 작도/치수의 Review/Apply·단일 Undo, cycle/잠금/타 평면 거부. [구현·검수](../implementation/X3-A-CONSTRUCTION-REASSIGNMENT-2026-10-10.md) |
| X3-B | 부분 | **X3-B1 완료**: 원–원/원–호/호–호의 ordered centre-line branch, 접선 ID 유지·유한 호 구간·해 소멸 원자적 거부·Review/재지정·문서 v22. [구현·검수](../implementation/X3-B1-CIRCULAR-INTERSECTIONS-2026-10-10.md). X3-B2 ellipse·X3-B3 Bezier/spline은 해당 X2 선행 후 구현 |
| X3-C | 대기 | X3-C1 각 이등분선 → X3-C2 외접원 → X3-C3 내접원, live 정의 |
| X4-A | 부분 · A1 완료 | 같은 문서 독립 drawing 기준점 Copy/Paste·불변 snapshot·새 ID/배치/style·반복 Paste/Undo. X4-A2 dependency closure 대기. [구현](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md) |
| X4-B | 대기 | 문서 간 붙여넣기·ID/asset/definition remap |
| X5 | 부분 · A/B pilot 완료 | B5 frame 공유·session UCS/WCS·임의 frame Line/Circle/local Move·ray/snap/Fit·재열기. X5-C 도구/교환 확대 대기. [구현](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md) |
| X6-A | 대기 | 3D Mirror |
| X6-B | 대기 | 3D Linear Pattern |
| X6-C | 대기 | 3D Radial Pattern |
| X6-D1 | 완료 · 첫 범위 | XY/XZ/YZ 전역 높이 clipping, 원본·STEP 보존. cap/임의 평면은 후속 |
| X6-D2 | 부분 · 첫 범위 완료 | 실제 BRep×기본 평면 직선/원/호·범위·측정·시트. 타원 X6-D2-E1·spline X6-D2-S1 후속 |
| X7 | 부분 · A/E 첫 범위 완료 | X7-A Leader/문자 편집 · X7-B 좌표 · X7-C 면적 · X7-D 호 길이 · X7-E 측정 인계. 첫 범위는 일반 주석 |

자취/함수/벡터·Euclidean 제한 모드, 평면 Boolean/Shape Builder·compound path, mesh 편집·BIM·협업/버전/댓글도 [PRODUCT-ROADMAP](../product/PRODUCT-ROADMAP.md)과 [공통 기하 설계](../architecture/SHARED-GEOMETRY-ARCHITECTURE.md)의 후속이다. 여기서 새 완료 상태나 임의 실행 ID를 만들지 않는다.

## 이미지 I와 제작 후속

1차 CAD에 필요한 기존 제작/출력 기반은 재사용하고, 새로운 2차 기능은 별도 대기열로 유지한다. [재사용·직접 구현 계획](../product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md)이 범위를 소유한다.

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
| G4-C 출력 후속 | 대기 | 자급식 HTML prototype player 완료. PPTX·GIF/APNG·영상은 포맷별로 분할 |

## 건축·기계 도면 목표의 남은 연결

아래 번호는 [1차 목표 문서](../product/ARCHITECTURE-MECHANICAL-MILESTONE.md#작은-구현-묶음)의 순서다. 목표 3은 B5-F1/F2, 4a–7은 G6-D1–D6 실행 카드로 구체화했다. 기존 목표 번호와 G6-A/B/C의 의미는 유지한다.

| 목표 순서 / ID | 상태 | 사용자 결과 |
| --- | --- | --- |
| 1 / G6-A1 | 완료 | 동일 모델의 명명된 뷰 저장 계약·카메라 복원·v15·Undo/재열기 |
| 2 / G6-A2 | 완료 | 표준 뷰·Fit과 저장 뷰 관리/검색 호출 UI·실제 camera 복원 |
| 3 / B5-F1/F2 | 완료 · pilot | cylinder Ø/R·길이와 기존 sketch driver/변수·돌출 수치 Review/Apply·Undo/STEP |
| 4a / G6-D1 | 완료 | 안정 부품 ID·조립 위치·참조/삭제 정책 |
| 4b / G6-D2 | 완료 | 부품별 방향/거리·전체 분해량·원상 복귀·측정 의미 |
| 5a / G6-D3 | 부분 · 정확한 첫 adapter | 주축 box/cylinder 윤곽·갱신/오류·명시적 재연결 완료. 일반 BRep/숨은선은 G6-D3-B1/B2, spline은 X6-D2-S1로 확대 |
| 5b / G6-D4 | 부분 · 첫 범위 완료 | 절단 높이/범위·개구부·단면선·원본 보존 |
| 6 / G6-D5 | 부분 · 첫 범위 완료 | 모델 뷰→보드·축척·연관 치수→PDF/SVG/DXF |
| 7 / G6-D6 | 부분 · 두 예제 완료, 성능 후속 | 건축/기계 예제의 수치 변경→재생성→출력·저장·이력·성능 |

성능·웹 자원·외부 실무자 평가는 모든 단계의 공통 과제다. [웹 자원 전략](../architecture/WEB-RUNTIME-RESOURCE-STRATEGY.md)에 따라 병목을 측정한 범위에 Worker·부분 재계산·byte budget·선택적 WebGPU/캐시를 적용한다. 자동 회귀 통과와 native GPU/heap/VRAM·사용자 작업 시간 평가를 구분한다.

## 이전 구현·검수 기록

아래는 날짜별 이력이다. 당시 “다음”과 테스트 수치는 현재 실행 큐를 대신하지 않는다. 최신 완료 범위는 위 통합 보강과 **PROJECT-STATE**이며 전체 미완료 목록은 위 표를 따른다.

**2026-10-09: CAD B1-F3 완료.** source 교체 후 변수 바인딩 재연결과 의미 변경 거부를 검사했다. 신규 Node 4개/native browser 13 checks 포함 **755 Node / 54 suites**, **55 browser workflows / 1093 checks**, 타입·architecture **358 modules**·workspace build 통과. [구현](../implementation/B1-F3-BINDING-RECONNECTION-2026-10-09.md), [마감 증거](../verification/B1-F3-CLOSEOUT-2026-10-09.json).

**2026-10-09: CAD B1-F2 완료.** source 교체 후 연속 치수 재연결과 점열 갱신을 검사했다. 신규 Node 3개/native browser 12 checks 포함 **749 Node / 54 suites**, **54 browser workflows / 1080 checks**, 타입·architecture **355 modules**·workspace build 통과. [구현](../implementation/B1-F2-CHAIN-RECONNECTION-2026-10-09.md), [마감 증거](../verification/B1-F2-CLOSEOUT-2026-10-09.json).

**2026-10-09: CAD B1-F1 완료.** source 교체 후 해치 재연결과 영역 재생성을 검사했다. 신규 Node 5개/native browser 14 checks 포함 **746 Node / 54 suites**, **53 browser workflows / 1068 checks**, 타입·architecture **353 modules**·workspace build 통과. [구현](../implementation/B1-F1-HATCH-RECONNECTION-2026-10-09.md), [마감 증거](../verification/B1-F1-CLOSEOUT-2026-10-09.json).

**2026-10-09: CAD B1-E 완료.** 스케치 정점·변 구성 편집과 구속·구동 치수·돌출 갱신을 검사했다. 신규 Node 6개/native browser 16 checks 포함 **739 Node / 54 suites**, **52 browser workflows / 1054 checks**, 타입·architecture **351 modules**·workspace build 통과. [구현](../implementation/B1-E-SKETCH-VERTICES-2026-10-09.md), [마감 증거](../verification/B1-E-CLOSEOUT-2026-10-09.json).

**2026-10-09: CAD B1-D 완료.** 다중선 지정 변의 직선↔호 전환과 접속점 고정·치수/작도 재연결을 검사했다. 신규 Node 7개/native browser 16 checks 포함 **731 Node / 54 suites**, **51 browser workflows / 1038 checks**, 타입·architecture **349 modules**·workspace build 통과. [구현](../implementation/B1-D-EDGE-CONVERSION-2026-10-09.md), [마감 증거](../verification/B1-D-CLOSEOUT-2026-10-09.json).

**2026-10-09: CAD B1-C 완료.** 블록 인스턴스 하나의 해체와 world 복원·1단계/재귀 중첩·정의/형제 보존을 검사했다. 신규 Node 6개/native browser 15 checks 포함 **724 Node / 54 suites**, **50 browser workflows / 1022 checks**, 타입·architecture **347 modules**·workspace build 통과. [구현](../implementation/B1-C-BLOCK-DISBAND-2026-10-09.md), [마감 증거](../verification/B1-C-CLOSEOUT-2026-10-09.json).

**2026-10-09: CAD B1-B 완료.** Explode한 정확한 선·호의 편집과 Join의 치수/작도/profile/scene 의존 복원을 검사했다. 신규 Node 7개/native browser 19 checks 포함 **718 Node / 54 suites**, **49 browser workflows / 1007 checks**, 타입·architecture **342 modules**·workspace build 통과. [구현](../implementation/B1-B-EXPLODE-JOIN-REFERENCES-2026-10-09.md), [마감 증거](../verification/B1-B-CLOSEOUT-2026-10-09.json).

**2026-10-09: CAD B2-A2 완료.** 내부 코너 두 거리의 실제 검토·오류 복구·캔버스 Enter·결과 인계와 연관 edge 치수/작도/돌출을 검사했다. 신규 Node 10개/native browser 18 checks 포함 **677 Node / 54 suites**, **42 browser workflows / 895 checks**, 타입·architecture **328 modules**·workspace build 통과. [구현](../implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md), [마감 증거](../verification/B2-A2-CLOSEOUT-2026-10-09.json).

**2026-10-09: CAD B2-A1 완료.** 두 독립 윤곽의 D1/D2 모따기와 unit·swap/equal·캔버스 표시·오류 복구·Apply→Join을 검증했다. 신규 Node 8개/native browser 18 checks 포함 **667 Node / 54 suites**, **41 browser workflows / 877 checks**, 타입·architecture **323 modules**·workspace build 통과. [마감 증거](../verification/B2-A1-CLOSEOUT-2026-10-09.json). 단일 내부 코너 B2-A2는 남는다.

**2026-10-09: 별도로 요청한 G5-B2 단일 2D Move를 완료했다.** 새 Node 8개와 native browser Move 25 checks를 포함한 전체 **659 Node / 54 suites**, **40 browser workflows / 859 checks**, 타입·architecture **321 modules**·workspace build 통과. [지원 범위·발견/수정·사용자 workflow](../implementation/G5-B2-COPILOT-MOVE-2026-10-09.md), [검수 요약](../verification/G5-B2-CLOSEOUT-2026-10-09.json)을 따른다. 다른 편집 명령과 실제 provider는 자동 확대하지 않았다. 다음은 위 G6-A1이다.

**2026-10-09: G5-B1 구현·전체 검수를 완료했다.** local Read selection/명시적 Read target, 측정·관계·잠금/오류·취소/context·수동 인계와 문서 게시 직후 재조회 경합을 검수했다. 전체 **651 Node / 54 suites**, **39 browser workflows / 834 checks**, 타입·architecture/import·문서 링크 **318 modules**·workspace build 통과. [B1 구현과 지원 경계](../implementation/G5-B1-COPILOT-QUERY-2026-10-09.md), [마감 증거](../verification/G5-B1-CLOSEOUT-2026-10-09.json)를 따른다. 다음 후보는 별도 요청의 **G5-B2: 기존 편집 명령 한 종류**다. 현재 allowlist와 실제 provider 연결은 확대하지 않았다.

이전 전체 기준선(2026-10-08): **G5-A1–A3 검수와 일반 각도 치수 B3-C1–C3를 완료했다.** Apply의 게시 전 취소·context 재검증·잠금/부분 실패·만료 복구·결과 인계는 [A3 기록](../implementation/G5-A3-COPILOT-APPLY-2026-10-08.md), 두 source/edge 치수와 v14는 [C2/C3 기록](../implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md)을 따른다. 최신 전체 Node **643개**, browser **38 workflows / 799 checks**, 타입·architecture **313 modules**·workspace build가 통과했다. 현재 B1 검수와 후속 B2 편집 명령 한 종류 확대를 구분한다. 실제 provider 연결은 준비되지 않았다. CAD의 다음 확장 후보는 B3-A3 OCS/기울어진 DXF와 B/X 카드다. Pro 한도의 약 15% 단위 분할은 [작업 분할](../WORK-SLICES-2026-10-06.md)을 따른다.

최상위 목표는 기본 CAD·벡터·이미지·레이아웃 기능을 공통 문서·선택·명령·History와 통합 UI로 연결하는 것이다. 상세 범위와 완료 기준은 [구현 인계](../IMPLEMENTATION-READINESS-2026-10-05.md), 실제 상태는 [PROJECT-STATE](../../PROJECT-STATE.md), 수정 위치는 [CHANGE-GUIDE](../architecture/CHANGE-GUIDE.md)를 따른다.

## 완료한 G0

기존 Node 24.19.0·pnpm 11.26.0 설치를 정상 실행 권한으로 사용했다. 재설치·lockfile 변경·reset 없이 아트보드 optional 삭제 게시, impact 수량, detached review와 실패·저장·이력을 검증했다.

전체 Node **545개/50 suites**, 실제 browser **22과제/454검사**가 통과했다. 아트보드 Node 10개·browser 25개가 포함된다. 소스 타입·G0 테스트 별도 타입·전체 build 통과, architecture 최종 결과는 [G0 증거](../verification/G0-ARTBOARDS-2026-10-05.md)를 따른다.

아트보드 속성 편집은 공통 Review/Apply와 Cancel을 사용한다. 당시 G0 완료 범위에는 프레임·Fit·보드 export가 포함되지 않았으며, 현재 그 세 항목은 G2에서 연결하고 검증했다.

## G1에서 구현한 첫 묶음

도구·패널별로 달랐던 Undo/Redo 경로를 공통화했다. 입력창의 자체 Undo·modal 키보드 범위는 유지한다. 도구 전환은 돌출까지 정리하고, History 후 선택·캔버스 포커스를 복원한다. 살아 있는 원본의 직접 편집·치수 review는 기존 stale 복구를 보존한다. 네이티브 세션 과제 24개를 작은 문서와 배경 1,000개에서 검증했다. 전체 결과·측정·제한은 [G1 증거](../verification/G1-SESSION-CONTINUITY-2026-10-05.md)를 따른다.

## G1 후속 검수 결과

105회 복제 뒤 Undo에서 이전 깊이의 객체를 잘못 선택하는 오류를 재현했다. History 상태 토큰과 WeakMap으로 수정하고 분기·다중/primary 선택·꼭짓점→Explode·Hide·같은 파일 재열기를 확인했다. [후속 증거](../verification/G1-HISTORY-IDENTITY-2026-10-05.md)에 신규 Node 7개·browser 23개와 전체 회귀 로그를 기록했다.

2026-10-10 G1·G2 재검토에서 활성 아트보드 선택의 Undo/Redo 복원, 블록 해체 도구 단축키와 체크박스 포커스 Undo, 컴포넌트 멤버 vector override의 뷰포트·SVG 전파를 보강했다. [통합 검수](../verification/G1-G2-INTEGRATION-2026-10-10.md)에 전체 Node 825/54와 표적 browser 4과제/86검사·남은 경계를 기록했다.

## G2 완료: 아트보드·벡터·컴포넌트 기반

G2를 네 작은 묶음으로 구현했다: (1) work plane을 보존하는 아트보드 프레임/활성 선택, (2) 현재·전체 Fit과 page bounds/background/clip이 정확한 보드 SVG, (3) CAD drawing에 저장되는 fill/stroke/opacity/width 편집, (4) definition·instance·nested resolution 기반 Component Explorer. 기존 CAD geometry와 topology 편집을 같은 객체와 History에서 사용한다.

[G2 상세 기록](../implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md)은 실제 support, 검수와 제한을 소유한다. Artboards browser 29개, Components browser 13개, 전체 Node 567개/53 suites, 전체 browser 25과제/518검사, TypeScript·architecture 258 modules·production build가 통과했다.

남은 vector/component 경계는 G2 전체 기능 동등성을 뜻하지 않는다. SVG path node editor/import, compound path·gradient·blend/mask, text/image 출력, component 배치 인스턴스별 property override/variant, nested-library 전용 browser 흐름과 G2 대형 도면 렌더·export benchmark는 남아 있다. 정의 멤버의 vector style override는 2026-10-10 보강에서 연결했다. 별도 외부 실무자 작업 시간·재시도·복구율 평가도 자동 회귀와 구분한다.

## G3-1 완료: 이미지 한 장의 왕복 작업

G3-1 당시 기준선은 PNG/JPEG/WebP import → placement → size/numeric crop → artboard SVG → JSON v8 save/reload/Undo/Redo/recovery였다. 당시 전체는 571 Node/53 suites, 26 browser workflows/532 checks였다. 이 수치는 stage history이며 최신 결과가 아니다. 현재 이미지 범위와 검수는 [G3 누적 구현](../implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md)과 [최신 검수](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다.

G3-1 단계 기록은 당시 기준선이다. 다음 slice 상태와 최신 이미지 behavior는 cumulative [G3-2..4 구현](../implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md) 및 [검수](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)를 따른다.

## G3-2..4a + G3-3b 구현: placement·mask·opacity·direct crop

이미지 복제는 원본 RasterAsset bytes를 공유하면서 placement ID와 transform을 분리한다. 일반 exact transform/Align에 참여하고 Inspector는 비율 잠금·크기·crop·Ellipse mask·opacity를 같은 detached review/apply/cancel 경로로 편집한다. Ellipse와 opacity는 viewport/SVG output 및 JSON v9/v10에 보존된다.

캔버스 crop mode에서 원본 frame과 crop boundary를 함께 보이고 edge/corner를 끌어 숫자 crop과 같은 normalized draft로 편집한다. Apply는 reviewed plan을 한 번 적용하고 source·mask·opacity·frame을 보존한다. `imageWorkflow`의 실제 pointer drag, Cancel/Apply, Undo/Redo와 SVG 검사가 추가됐다. 전체 Node 575개, browser 26 workflow/553 checks, architecture 265 modules 및 production build가 통과했다. 자세한 timing sample과 한계는 [G3 이미지 편집 검수](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 기록했다.

G3-4b1 당시에는 PNG/PDF composite와 대형 이미지/외부 실무자 평가가 남아 있었다. 뒤이어 G3-4b2에서 Artboard PNG, G3-4b3에서 Artboard PDF를 추가했다. Color adjustment의 당시 Node 577개, browser 26 workflow/556 checks, architecture 265 modules와 production build 결과는 해당 단계의 역사적 기준이다. 128×128 fixture pixel sample 최대 채널 변화 26.6도 한 번의 관측이다.

G3-4b2는 활성 보드를 SVG와 같은 visible drawing/vector/raster 순서로 합성해 PNG로 저장한다. Crop·rectangle/ellipse mask·opacity·brightness/contrast/saturation·배경·보드 경계를 포함하고, 스케일/픽셀 크기/메모리를 미리 검사한다. Preview와 Cancel은 원본 문서를 바꾸지 않는다. 전체 Node 581개, browser 27 workflow/581 checks, architecture 270 modules 및 production build가 통과했다. 브라우저가 실제 PNG를 내려받아 픽셀과 투명도를 디코드해 확인했다. 소형·중형 fixture의 단일 관측 수치와 지원 한계는 [G3 이미지 편집 검수](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 기록했다.

G3-4b3은 활성 아트보드 또는 표시 중인 여러 아트보드를 페이지별 PDF로 저장한다. 보드의 mm 크기와 순서를 보존하고 DPI·페이지 수·픽셀/메모리/파일 한계를 출력 전에 검사한다. 기존 detached SVG scene과 PNG Worker 경로를 재사용하며 alpha는 흰색 페이지에 합성하고 JPEG raster image로 넣는다. 실제 multi-page PDF를 내려받아 독립 PDF reader로 페이지 수·MediaBox·렌더 결과를 확인했다. 전체 Node 587개/54 suites, browser 28 workflows/602 checks, architecture 274 modules, TypeScript와 production build가 통과했다. 수치와 제한은 [G3 이미지 편집 검수](../verification/G3-2-4-IMAGE-EDITING-2026-10-05.md)에 기록했다.

Photopea 관련 요청의 최초 TIFF 도입은 Node 596개·TIFF browser 9개·image browser 38개로 부분 검증했다. 이후 공통 decoder와 선택 placement 원본 교체를 구현하고 전체 회귀를 마감했다. 최신 TIFF browser 10개(Worker abort 포함), source 교체 16개, resource 34개가 전체 33 workflows/686 checks에 포함된다. 새 원본은 기존 object/Scene identity와 crop/mask/color를 유지하며 숫자 편집과 한 Undo로 적용한다. [검수·실패 로그·남은 한계](../verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md)를 따른다. 악의적 파일 보안 검토와 brush/PSD 전체 편집은 완료되지 않았다.

## 완료 판단

Preview·Cancel·실패는 원본과 History를 변경하지 않고 성공은 한 Undo다. 기하·단위·참조·저장 복원을 검사하며 UX는 실제 브라우저에서 확인한다. 자동 회귀와 실무자의 작업 시간·재시도 평가는 구분한다. 실행 방법은 [README](../../README.md), 구현 범위·검증 날짜는 PROJECT-STATE에 기록한다.
