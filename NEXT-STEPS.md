# 프로젝트 통합 안내와 다음 작업

갱신: 2026-10-17. **프로젝트 문서는 여기서 시작한다.** 이 문서가 전체 문서를 연결하고 실행 순서를 관리한다. 현재 사용법·지원 범위는 기능별 대표 문서, 상세 설계는 계획서, 실행 결과는 검증 기록이 각각 소유한다.

[현재 실행 큐](#현재-실행-큐) · [WF-Q1 완료 조건](#wf-q1-완료-조건) · [진행·검증 상태](PROJECT-STATE.md) · [설치·실행](README.md#시작)

## 기능별 문서 연결

기능을 고르면 대표 가이드에서 사용법·제한·구현/검증 근거까지 확인할 수 있다. 후속 변경을 설계할 때는 같은 행의 계획서를 읽는다.

| 기능 | 현재 설명의 기준 | 후속 설계 |
| --- | --- | --- |
| 프로젝트·저장·복구 | [프로젝트와 저장](docs/features/PROJECTS.md) | [워크스페이스 계획](docs/product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md) |
| 작도·스케치·참조 편집 | [정밀 작도와 편집](docs/features/DRAWING-EDITING.md) | [CAD 구현 단위](docs/product/CAD-BASICS-IMPLEMENTATION-PLAN.md) |
| 작업면·솔리드 | [솔리드 모델링](docs/features/SOLID-MODELING.md) | [CAD 구현 단위](docs/product/CAD-BASICS-IMPLEMENTATION-PLAN.md) |
| 평면도·벽·창호·가구 | [평면도와 건축 콘텐츠](docs/features/FLOOR-PLANNING.md) | [평면도 확장 계획](docs/product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md) |
| 연관 도면·프레임·시트·출력 | [도면과 출력](docs/features/DRAWINGS-OUTPUT.md) | [도면 확대](docs/product/CAD-DRAWING-EXPANSION-PLAN-2026-10-11.md), [프레임·구역](docs/product/CAD-FRAMES-SECTIONS-PLAN-2026-10-11.md) |
| 이미지·아트보드·장면 | [이미지와 장면](docs/features/IMAGES-SCENES.md) | [통합 제작 목표](docs/product/UNIFIED-CREATIVE-SUITE-ROADMAP.md) |
| Copilot·자동화 | [Copilot](docs/features/COPILOT.md) | [통합 제작 목표](docs/product/UNIFIED-CREATIVE-SUITE-ROADMAP.md), [평면도 작업 설계](docs/product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md) |

개발 시에는 [수정 위치·문서 책임](docs/architecture/CHANGE-GUIDE.md)과 [구조 규칙](docs/architecture/DIRECTORY-STRUCTURE.md)을 따른다. 상세 증거는 [구현 기록](docs/implementation/README.md)·[검증 기록](docs/verification/README.md)·[리뷰](docs/reviews/README.md), 과거 결정은 [이력](docs/history/README.md), 전체 파일 탐색은 [문서 색인](docs/README.md)에서 찾는다.

<a id="현재-실행-큐--2026-10-14"></a>

## 현재 실행 큐

바로 다음은 **WF-Q1 실제 주거 과제 검증**이다. UI-P2와 WF-A1·C0/A2/B1·B2/B3·CMP-S1/WF-D1의 지원 범위를 재사용한다. 아래 후속/병행 표시는 착수나 완료를 뜻하지 않는다.

| 순서 | 카드 / 종류 | 사용자에게 생기는 변화 | 선행 / 첫 완료 기준 |
| --- | --- | --- | --- |
| **바로 다음 · CAD** | **WF-Q1 실제 주거 과제 검증** | 준비→벽/개구부→슬롯 창호/가구→평면/단면/A3 발행·수정/재발행 | CMP-S1/WF-D1 첫 지원 범위 완료. [구현·검증·경계](docs/implementation/CMP-S1-WF-D1-2026-10-16.md) |
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

## WF-Q1 완료 조건

1. 작은 주거 DXF를 실제 UI로 준비하고 단위·기준점·레이어·참조를 확인한다.
2. 진단→면→벽/개구부→슬롯 창호/가구→바닥/천장을 같은 문서에서 연결한다.
3. 평면/단면·A3 시트를 만들고 1:50/1:100·한글·선 굵기·홀·잘림·참조/stale 상태를 확인한다.
4. 벽/개구부 또는 가구 수정→연관 출력 갱신→Undo/Redo→재발행→저장/재열기를 검증한다.
5. WebCAD 원본, PDF/SVG/DXF, 실제 UI 증거와 누락·지원 한계를 남긴다. PDF는 독립 렌더링해 확인한다.

상세 fixture·지원 조건은 [평면도 계획](docs/product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md), [선행 구현](docs/implementation/CMP-S1-WF-D1-2026-10-16.md), [정합성 대조](docs/reviews/PLAN-CONSISTENCY-2026-10-17.md)를 따른다. 기존 placeholder fixture만으로 WF-Q1을 완료 처리하지 않는다. **G6-D5-Q1 출력 전 점검**은 별도 카드다.

## 별도 확장과 담당 경계

- **CAN-A1 → CAN-A2 → CAN-A3:** 상위 캔버스 소유/참조 → Flex → 비례 scale. 단일 슬롯 구현으로 완료되지 않는다.
- **MEAS-H1:** 정확한 호버 거리와 witness. 현재 AABB 경고와 구분한다.
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
