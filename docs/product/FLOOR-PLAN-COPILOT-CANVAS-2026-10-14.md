# 평면도에서 모델·시트까지 — CAD/Copilot/캔버스 구현 계획

> **문서 역할**: 후속 설계와 당시 결정 기록. 현재 사용법·지원 범위는 [평면도와 건축 콘텐츠](../features/FLOOR-PLANNING.md)에서 관리한다.

기준일: 2026-10-14. 사용자의 7단계 예시는 제품의 실제 작업 흐름 요구사항이다. 최종 목표는 **정리한 평면도 → 추적/면 → 벽 → 문·창 → 부품/가구 → 연관 평면·단면·시트**를 같은 프로젝트에서 완성하고, 모든 조작을 직접 UI와 Copilot 양쪽에서 실행하는 것이다. 자동 배치는 이 흐름을 돕되 모델 치수·참조·단위·Undo 계약을 보존한다.

정합성 갱신: **2026-10-17**. 다음 실행은 [현재 실행 큐](../../NEXT-STEPS.md#현재-실행-큐)의 **WF-Q1**이며 아래 완료 상태는 2026-10-16 구현·검증 범위다. 설계 목표와 첫 지원 범위를 구분한다.

## 현재 코드에서 확인한 기반과 공백

현재 사용법·지원 범위는 [평면도와 건축 콘텐츠](../features/FLOOR-PLANNING.md), 출력은 [도면과 출력](../features/DRAWINGS-OUTPUT.md), Copilot의 실행 경계는 [Copilot](../features/COPILOT.md)이 소유한다. 이 계획서는 앞으로 만들 기능과 완료 조건을 관리하며 완료 기능표를 다시 유지하지 않는다.

## 우선순위와 완료 단위

완료 판단은 실제 UI·Review/실패·Undo/복구·재열기·관련 출력 증거를 따른다. WF-A1·C0/A2/B1·B2/B3·CMP-S1/WF-D1의 현재 지원은 [대표 가이드](../features/FLOOR-PLANNING.md)를 따른다. 다음 실행은 [WF-Q1](../../NEXT-STEPS.md#wf-q1-완료-조건)이다.

| 후속 카드 | 목표 | 선행·완료 조건 |
| --- | --- | --- |
| CAN-A1 상위 캔버스 | 소유/참조·모델/종이 단위·계층 탐색 | Section/Frame의 표현 참조를 보존하고 schema/마이그레이션·cycle/중복 소유 검증 |
| CAN-A2 Flex | row/column/wrap·gap/padding·Fixed/Hug/Fill·absolute/min/max | CAN-A1. Hug/Fill 순환·overflow·잠금 진단, CAD 크기 변경은 명시적 모델 명령 |
| CAN-A3 비례 scale | Resize/Reflow/Scale contents 구분, 글자/테두리/효과의 비례 확대 | CAN-A1/A2. 종이 단위 고정 옵션, SVG/PDF 일치, 비균등 곡선/구속 충돌 거부 |
| MEAS-H1 호버 거리 | 기준·hover 대상의 witness와 최단/축/투영 거리 | stable IDs, 정확/근사·단위·취소/cache·최근접 실제 객체 표시 |
| CMP-S1/WF-D1 확대 | 다중 슬롯/assembly·외부 라이브러리·텍스처·정확 거리 등 | 현재 단일 슬롯 지원과 구분하고 각 확장 계약을 별도로 검증 |
| WF-Q1 실제 주거 과제 | 준비부터 A3 발행·수정/재발행·재열기 | [실행 큐의 완료 조건](../../NEXT-STEPS.md#wf-q1-완료-조건). CAN/MEAS/IO 전체 완료는 필수 선행 아님 |
| IO-DWG1 외부 교환 | DWG/SKP의 라이선스·버전·단위·손실 Review | 실제 샘플 독립 왕복 전 지원 선택지 노출 금지 |

아래 데이터/편집 계약과 요청 예는 **후속 목표를 포함한 설계**다. 구현된 동작과 입력 한도는 대표 가이드를 기준으로 한다. 통합 전 상세 표는 [보존본](../history/FLOOR-PLAN-PLAN-BEFORE-CONSOLIDATION-2026-10-17.md)에 있다.

## 핵심 데이터·편집 계약

- **모델 mm와 종이 mm:** 같은 수치 타입으로 암묵 혼용하지 않는다. 4000mm 벽을 1:50 프레임에 넣으면 80mm 표현이며 원본은 4000mm다. 프레임 resize로 벽 두께가 바뀌면 안 된다. 도면 표기 치수는 측정 원본을 유지한다.
- **슬롯:** `slotId`, 허용 콘텐츠 종류, local bounds, padding, fit policy, min clearance, default content, per-instance override를 계약으로 둔다. 호스트 개구부 치수에 맞춘 창호는 왜곡 scale보다 지원하는 폭/높이 파라미터를 우선한다. definition 수정과 instance content 교체는 다른 intent다.
- **Fill/Hug:** available inner size=container size−padding; 형제 gap·fixed/min/max·fill weight로 분배. Hug는 flow 자식의 layout bounds로 결정하고 absolute child는 기본 계산에서 제외하되 overflow 표시. 서로 Hug/Fill인 미정 크기는 결정적 진단을 내며 무한 재귀 금지.
- **거리:** source/target ID와 revision, 좌표계, 두 실제 기하 witness, mode, 단위, 정확/근사와 tolerance를 결과에 포함. 화면 bbox 간격을 실제 CAD 최단거리라고 표시하지 않는다. 레이어 집합은 visible/locked 포함 정책과 실제 최근접 객체를 표시한다. 회전·다른 고도·겹침을 구별한다.
- **Scale:** presentation text/lineweight/radius/effect와 model parametric dimension을 분리. Scale contents는 지원 항목을 함께 변환하고 미지원 effect를 silent drop하지 않는다. 비균등 변형/constraint conflict면 Apply 전에 중지·설명한다. 기존 block override와 frame source를 덮어쓰지 않는다.
- **원본 참조:** 참조 도면을 잠가도 추적/스냅은 가능해야 한다. 참조 재가져오기는 새 source revision과 remap Review를 거치고 만들어 둔 벽을 자동 중복 생성하지 않는다. 원점 이동의 역변환을 receipt에 남겨 측량/외부 좌표로 내보낼 수 있게 한다(WF-A2).
- **PURGE:** ‘보이지 않음’과 ‘사용되지 않음’을 동일시하지 않는다. 블록/변수/치수/해치/도면/scene/slot/import receipt 의존성의 reachable set을 계산하고 보존 사유를 보여 준다. 전체 문서 삭제나 원본 파일 변경은 이 도구의 동작이 아니다.

## Copilot이 실제로 쉬워지는 조건 — WF-C0

먼저 버튼형 작업 intent와 명시적 필드를 공통 API로 구현하고 local rules와 gateway가 그 API를 호출한다. prompt를 직접 JS나 문서 JSON mutation으로 실행하지 않는다.

| 요청 예 | 계획에 반드시 들어갈 정보 | 불명확하면 할 일 |
| --- | --- | --- |
| “벽체랑 창호만 남겨서 기준점부터 시작해” | source/import ID, 선택 layer IDs, 제외 목록, unit override, 기준점, 참조 잠금 | 이름만으로 벽임을 확정하지 말고 후보 표시. 기준점·단위 미정이면 선택 대기 |
| “이 틈들 닫아서 면 만들어” | region 후보·구멍, gap 거리/수리 위치, tolerance mm, 변경될 edges | 비평면·자기교차·허용오차 초과면 문제 위치로 이동 |
| “선택한 벽 2400 올려, 다음도 같은 높이” | targets, work plane/normal, 2400mm, base level, 마지막 **확정된** height | 벽 선택이 아니면 목적에 맞는 선택 안내 |
| “여기에 폭900 높이2100 문” | host wall/face, 위치·방향, width/height/sill, through policy, 충돌 | host/방향 누락 시 pick 단계 |
| “가구 사이 600 유지하고 오른쪽 맞춰” | selection/container, edge/clearance mode, 600mm, anchor, fixed/absolute children | 종이 간격인지 실제 이격인지 구분 |
| “도면은 그대로 두고 이 프레임의 글자도 같이 두 배” | presentation scale factor2, children/style policy, fixed paper annotation 여부 | 모델 scale과 view scale의 차이를 수치로 보여 줌 |

각 intent는 `requestId + documentId/generation + revision + target IDs`를 고정하고 예상 변경/손실/추정 비용을 Review한다. 선택/단위/원본이 바뀌면 stale로 다시 계획. Apply는 하나의 원자적 batch, cancel은 publish 전에 정지, repeated click은 중복 방지. 사용자 입력은 개인정보/asset bytes를 포함해 gateway로 자동 전송하지 않는다. 기능별 scope allowlist를 현재 gateway처럼 유지한다. 첫 결과는 정확한 대상이 선택되어 다음 단계로 이어져야 한다.

## 편의와 성능 검증

- 호버는 spatial index로 후보를 좁히고 frame당 한 번 갱신, 대상/revision/mode cache. 고비용 BRep 거리는 Worker + cancel/generation guard, 늦은 결과는 폐기. pointer move마다 전체 문서/HLR/section 생성 금지.
- 레이아웃은 순수 계산 결과→transform plan. 변경한 container subtree와 관련 views만 dirty; pointer drag 동안 transient preview, pointerup 한 Undo. frame/주석 배치에 원본 BRep 재계산 0회.
- 키보드로 목표 선택/거리 pin/필드 이동/Enter 확정/Escape 취소, IME 보호. 더블 클릭 직전 높이는 의도한 도구에서만, triple click과 편집 진입 충돌 해결. 숫자입력에 mm/cm/m 및 math 표현 허용 범위 표시.
- import parser 결과 재사용, 입력 타이핑에는 geometry evaluation 없음. 현재 WF-A1은 Review preparation 클릭 때만 새 계획을 평가한다. 대형 파일 chunk/취소/worker parsing은 아직 미구현.
- 성능 fixture: 실제 R5 56부품/14도면/10페이지, 두 독립 프로젝트, 별도 작은 평면과 1k/10k 선·100/1k slot. cold/warm·p50/p95·worst·sample 수·환경·Worker/HLR 호출 수·retained/WASM capacity를 분리. 합격 수치 목표는 baseline 측정 후 고정하며 평균 하나로 규모 주장을 하지 않는다.

## 담당 경계와 재현 fixture

향후 하위 에이전트에 맡길 때: 통합 담당은 App/command schema/document schema/serialization/NEXT-STEPS를 소유한다. **준비/Copilot 담당**은 interop/workflow와 tests, **기하 담당**은 region·face·wall/opening, **캔버스 담당**은 순수 layout/viewport/inspector, **거리 담당**은 precision/Worker query를 각각 담당한다. 공통 schema 변경은 계약안 합의 후 통합한다. 같은 파일 동시 수정 금지. 대기 카드와 위임 가능한 카드는 이번 턴의 자동 에이전트 실행 지시가 아니다.

WF-A1 fixture `apps/web/tests/helpers/floorPlanFixture.ts`: cm 선언, 길이4000mm 벽, Window block 내부 독립 layer/text, furniture/notes/unused definition. mm override 시 실제 길이400mm가 되는 것을 검증하여 무조건 mm로 가정한 오차를 숨기지 않는다. 실제 사용자에게는 알려진 거리로 확인시킨다.

WF-Q1 확장 fixture: 외곽/내벽/문/창/가구/치수/해치 레이어, 한글명, 중복2개·gap0.1/1mm·hole·T접합·Z편차·대좌표·nested block·잘못된 단위·잠김. 정상 결과와 의도적 진단을 함께 기록. 빌딩 코드·시공도서 적합 판정이나 학과 수준 보증으로 확대하지 않는다.

## 외부 참고와 채택 판단

- [SketchUp 공식 CAD 교환 안내](https://help.sketchup.com/en/sketchup/importing-and-exporting-cad-files): 가져오기 전 정리·단위·원점·지원 엔티티를 확인하는 흐름을 참고했다. 현재 WebCAD에 DWG/SKP 변환기가 있다는 증거가 아니다.
- [Yoga 공식 사이트](https://www.yogalayout.dev/): flex/gap/absolute layout의 계산 엔진 후보. CAN-A2에서 현재 순수 배치 함수와 결과/속도/패키지 크기를 비교한다. CAD 정확 거리·기하·모델 제약을 대신하는 엔진은 아니다. 설치/채택하지 않았고, 도입 전 고정 버전/라이선스/NOTICE 및 제거 경로를 기록한다.
- 기존 [워크스페이스 UX 계획](WORKSPACE-UX-AGENT-PLAN-2026-10-14.md)의 VS Code/Photoshot 참고와 C2/C3 도구 UI를 재사용한다. 별도 워크벤치 전면 교체는 필요하지 않다.
