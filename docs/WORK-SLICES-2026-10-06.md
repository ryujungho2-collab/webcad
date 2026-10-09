# 작업 범위 분할과 재시작 계약

**현재 실행 순서(2026-10-09):** G5-B2 단일 2D Move 후 **CAD B2-A1 두 윤곽 / B2-A2 내부 코너의 D1/D2 모따기**를 구현했다. [내부 코너의 지원 범위·검수·한계](implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md)를 따른다. **B0-A 컨트롤 Enter/Space ownership 결함 한 종류**를 수정했다. [native 조작·숫자 grip·반복/History 검수와 한계](implementation/B0-A-KEYBOARD-ACTIVATION-2026-10-09.md)를 따른다. 다음 조작 후보 B0-B는 별도 요청으로 실행한다. 동일 모델의 도면 목표는 별도 **G6-A1 모델 뷰 저장 계약**부터 시작한다. 2차는 아트보드·벡터/이미지·프로토타입·슬라이드·LLM 통합이다. 아래 B1 당시 B2 후보는 이력이다. 최신 실행 우선순위는 [NEXT-STEPS](../NEXT-STEPS.md)가 소유한다.

**2026-10-09 마감:** G5-B1을 재개해 선택/명시적 target Query·잠금/오류·취소/context·수동 인계와 문서 게시 직후 버전 경합을 검수했다. 새 Node 8개/browser 35 checks 포함 **651 Node / 39 browser·834 checks / 318 module guard / 타입·build** 통과. [B1 구현·지원 경계](implementation/G5-B1-COPILOT-QUERY-2026-10-09.md), [마감 증거](verification/G5-B1-CLOSEOUT-2026-10-09.json)를 따른다. 이전 checkpoint는 중단 당시 기록으로 보존한다. 다음 B2·G6는 시작하지 않았다.

갱신일 2026-10-09. 기존 G0–G6와 CAD B0–B5를 작은 검증 가능한 결과로 구분한다. G4 첫 범위·CAD B3-A1/A2·B·C1–C3와 **G5-A1–A3**를 구현·검수했다. [C1 계산](implementation/B3-C1-ANGULAR-DIMENSION-2026-10-08.md), [C2/C3 구현·검수](implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md), [G4/CAD 기록](implementation/G4-CAD-BASICS-2026-10-06.md), [G5-A1 기록](implementation/G5-A1-GATEWAY-BOUNDARY-2026-10-06.md), [G5-A2 기록](implementation/G5-A2-COPILOT-CONTEXT-2026-10-08.md), [G5-A3 기록](implementation/G5-A3-COPILOT-APPLY-2026-10-08.md)을 따른다. B1 Query를 마감했으며 다음 우선순위는 별도 요청의 G6-A1이다.

## 현재 작업 트리에서 이어받을 것

| 묶음 | 실제 상태 | 다음 담당의 책임 |
| --- | --- | --- |
| CAD B2-A1 | 두 독립 윤곽의 D1/D2·unit·swap/equal·캔버스 거리선·공통 review·Join 인계. 새 Node 8개/native browser 18 checks | B2-A2 단일 polyline/rectangle 내부 코너를 별도 요청으로 조사. B2-A 전체 완료나 3D asymmetric Chamfer로 보고하지 않음 |
| G3-5 자원 / I1 원본 교체 | source 공유·재업로드 제거·마지막 해제·원본 교체 마감. 당시 599 Node / 33 browser·686 checks / architecture 294 modules. 최신 전체는 PROJECT-STATE | 외부 실무자/native GPU/heap/VRAM·3 MiB 정책 평가. [측정과 제한](verification/G3-5-IMAGE-RESOURCES-2026-10-06.md), [원본 교체 검수](verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md) |
| G4-A / 첫 B·C | Scene v12·원본/finite nested component 선택 인계·row/column·숨김 collapse·state/time preview·target state 링크·재생·SVG 출력. draft 유지/동시 수정 충돌·scroll review를 수정. Node 7개·browser 24개 | 직접 layout handle·component override/variant·PPTX/GIF/영상과 실무자 평가 남음. 숨김 state를 variant로 표시하지 않음 |
| G5 첫 연결 + A1–A3 / B1 완료 | A 검수와 B1 local 선택/explicit target Query·세션·bounded DTO·수동 인계·전체 회귀 마감. B1 신규 Node 8개/browser 35 checks | B2 편집 후보 한 종류부터 조사. Query→LLM 설명/실제 공급자·키·서버 없음. Gateway 허용 명령은 finite drawing/primitive 생성 1–20개 |
| G6 | 이번에 새 adapter 구현 없음 | 외부 연결 환경이 없으므로 오프라인 계약/fixture와 실제 연결 검증을 분리 |
| CAD B3-A1/A2·B | DXF bulge analytic 왕복과 Import/Export review, 일반 원/원호 Ø 주석·source 갱신·Trim/Join circular edge remap·v13. 신규 Node DXF 7/지름 4, browser DXF 18/지름 17 | B3-C는 뒤이어 구현했다. B3-A3 OCS/tilted와 나머지 B/X 카드는 계획. 전체 CAD 기능 동등성 아님 |
| CAD B3-C1–C3 | 두 straight edge의 ±ray/CW/CCW 측정, source별 topology/branch·갱신, Trim/Join remap, v14 저장, 공개 UI/정밀 입력/캔버스 반지름 핸들 및 출력. C1 신규 Node 10개·C2 신규 Node 8개 | 전체 36 browser workflows/758 checks 통과. 구동 각도 치수·곡선 접선각·공통 style·아트보드 주석 출력은 후속 카드 |

G4/CAD 기준선은 커밋 `291c1c3`에 보존했다. 새 작업의 git status를 먼저 확인하고 reset/checkout/clean이나 일괄 되돌리기를 하지 않는다. G4/G5를 G3 결과로 보고하거나 작업 트리에서 지우지 않는다. 파일 이름에 날짜가 있어도 문서에 적힌 검증 시점을 확인한다.

## 실행 단위

각 행은 독립 요청으로 선택할 수 있다. 여러 행을 요청한 경우 공통 회귀에서 함께 마감하되, 실제 완료 경계를 각각 기록한다. 한도 안에 특정 단계가 끝난다고 시간이나 사용량을 보장하지 않는다.

| 순서 | 범위 | 완료 경계 / 포함하지 않는 것 |
| --- | --- | --- |
| 완료 · G3-5A + I1 | 기존 자원 최적화 전체 회귀·측정 및 native 원본 교체 연결 | 타입·전체 Node/browser·architecture·workspace build 통과. cache/tile/WebGPU/G4/G5 새 기능 제외 |
| 완료 · G4-A 검수 | Scene/Auto Layout/state/link/player/v12 검수·결함 수정 | 같은 source identity·한 Undo·stale·잠금·저장·draft 유지/오류 복구 |
| 완료 · B3-A1/A2 | DXF bulge 입출력·단위·레이어 왕복·실제 review/파일 흐름 | sparse/final/signed arc·inch·회전/반사·exact vertices·subset 수락. A3 OCS/tilted·DWG/일반 spline 남음 |
| G5-A1 완료 | 응답 payload/stream 취소·timeout·late response 경계 | 실제 provider 없는 모의 검증. ownership/topology 주입 거부와 prompt 유지→재시도→한 Apply/Undo 확인 |
| 완료 · G5-A2 | 패널/설정 draft·요청 context 수명 | activity 왕복·문서 교체·selection/workPlane/layer 변경·prompt/endpoint 수정 중 늦은 응답. 변경 시 폐기·재계획, 키 저장 없음. [검증 요약](verification/G5-A2-CLOSEOUT-2026-10-08.json) |
| 완료 · G5-A3 | Apply 중복/경합·잠금·로컬 규칙 회귀 및 A 통합 마감 | 같은 authoritative canApply·게시 전 Cancel, 배치 실패의 mutation/history 0, 한 Undo·결과 선택·복구. [전체 검증 643 Node/38 browser·799 checks](verification/G5-A3-CLOSEOUT-2026-10-08.json) |
| B3-B/C1–C3 완료 | 일반 지름 주석과 두 참조 각도 주석 | 주석과 driver 구분. C3 전체 회귀 결과는 PROJECT-STATE에서 확인 |
| G4-B 첫 범위 완료 | Scene source→Properties와 finite nested component 재사용 | 직접 layout handle·override/variant는 별도 후속. original identity 보존 |
| G4-C 첫 출력 완료 | 검토 state/time/layout의 정지 SVG와 손실 안내 | links/timing을 가진 독립 플레이어·PPTX/GIF/영상은 각각 후속 |
| 8a · G5-B1 완료 | local 선택/explicit target Query·제한/실측/관계·취소/context·수동 인계 | 실제 browser 35 checks와 전체 Node/browser·타입·architecture/build 통과. 실제 provider와 구별 |
| 8b · G5-B2 첫 범위 완료 | 독립 finite 2D drawing 한 개의 Move | Node 신규 8개·native browser 25 checks, 전체 659 Node/40 browser·859 checks·타입/321 module guard/build 통과. 다중 대상/다른 편집 명령·실제 provider는 미지원 |
| 9 · G6-A | 현재 CAD의 Axo 뷰 계약·재현 가능한 preset | 카메라·Fit·출력의 첫 독립 과제. RVT import와 섞지 않음 |
| 10 · G6-B | 오프라인 source ID/unit/loss/asset manifest와 fixture import/export | 하나의 adapter boundary만 구현, review/atomic Apply. IFC/RVT를 실제 읽었다는 주장 금지 |
| 11 · G6-C 이후 | 실제 연결 환경이 준비된 adapter 한 종류 | Manim render, Revit/IFC, Notion, InDesign을 각각 따로 검증. 환경 미정인 항목은 완료로 표시하지 않음 |

위 목록 사이의 CAD 후속은 아래 대기열에서 하나씩 선택한다. G3-5가 끝났다는 이유만으로 G4–G6와 B0–B5 전체를 같은 요청에서 실행하지 않는다.

공개 코드 후보와 직접 구현할 이미지 I2–I5/벡터/Scene/Copilot의 연결은 [재사용·구현 계획](product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md)을 따른다. UTIF만 채택했으며 다른 라이브러리와 편집기 전체를 설치한 상태가 아니다.

## CAD-BASICS 전체 개선의 작은 묶음

현재 지원표는 [CAD-BASICS](product/CAD-BASICS.md), 구현 카드의 단일 기준은 [CAD 구현 단위 설계](product/CAD-BASICS-IMPLEMENTATION-PLAN.md)다. B0–B4 기존 기능 보완, B5 기본 3D, X1–X7 새 객체·작성 방식·작도·UCS·clipboard·3D 패턴을 구분했다. 각 카드에 수정 위치·선행 조건·기하/소유권/참조/출력 지원 축·완료 검사가 있다.

**B3-A1/A2·B와 C1–C3는 완료했다.** C3 전체 브라우저 회귀 결과는 PROJECT-STATE에서 확인한다. 추가 OCS/기울어진 평면은 B3-A3로 따로 검토한다. 기존 B3-A는 A1/A2/A3의 상위 이름을 유지한다. 이후 관계 교체 B1-A/B 등을 독립 요청으로 수행한다.

B0–B5 전체 완료와 일반 CAD 전체 기능 동등성은 구분한다. 여기에는 상세 카드 표를 복제하지 않는다. 지원 범위를 지우거나 아직 구현하지 않은 카드를 완료로 올리지 않는다.

## Pro 5시간 한도의 약 15%를 목표로 하는 세션 분할

한도의 15%를 작업 시간이나 토큰 수로 정확히 환산할 수 없다. 각 행을 **한 요청**으로 실행하고 검수·기록 후 멈추는 방식으로 범위를 제한한다. 현재 CAD 묶음은 B3-C1–C3를 구현했다. 새 라이브러리/실제 provider/다른 CAD 카드를 동시에 시작하지 않는다.

사용자의 각도 치수 우선 요청에 따른 **B3-C2a → B3-C2b → B3-C3** 구현과 **G5-A1–A3** 검수는 끝났다. 다음 G5-B는 **B1 Query → B2 편집 한 종류**의 별도 요청으로 구분한다. B3-C의 수정 위치·계약·완료 경계는 [CAD 카드의 하위 설계](product/CAD-BASICS-IMPLEMENTATION-PLAN.md)에서 관리한다.

## 바로 다음 명령 — G6-A1 모델 뷰 저장 계약

2026-10-09 사용자 목표에 따라 1차 건축·기계 CAD, 2차 아트보드·벡터/이미지·프로토타입·슬라이드·LLM 순서로 변경했다. 위 B1 마감 당시의 B2 우선 후보는 2차로 보류한다. 상세 범위는 [1차/2차 목표](product/ARCHITECTURE-MECHANICAL-MILESTONE.md)를 따른다.

```text
WebCAD G6-A1 모델 뷰 저장 계약만 조사·구현·검수하고 기록 후 멈춰.
PROJECT-STATE.md, NEXT-STEPS.md, docs/product/ARCHITECTURE-MECHANICAL-MILESTONE.md,
docs/architecture/RVT-IFC-AXONOMETRIC-INTEGRATION.md를 먼저 읽어.
현재 CadViewport 표준 뷰/카메라, App 뷰 상태, document serialization,
명령/History와 기존 viewport browser 검사를 조사하고 기존 경로를 재사용해.
명명된 뷰의 projection·방향·target·프레이밍 저장/복원 계약을 정의하고,
문서·명령·migration·검증·Undo/Redo·save/reload를 구현해.
카메라 상태와 모델 transform/작업면을 혼동하지 않도록 검증하고
이전 저장 문서 호환, 잘못된 값의 원자적 거부, 원본 geometry 불변을 검사해.
지원하는 카메라 상태를 빠짐없이 조사한 뒤 데이터 계약을 결정해.
UI 연결은 G6-A2로 남기고 저장 뷰의 실제 사용자 경험 완료를 주장하지 마.
3D 분해도·section·도면 출력·RVT adapter·G5-B2는 자동 시작하지 마.
기존 G4/G5/치수 기능을 보존하고 reset/checkout/clean/대규모 재작성은 금지해.
집중 테스트 후 타입·전체 Node·architecture·production build를 검사하고,
viewport 실행 코드를 바꿨다면 실제 browser 회귀도 검증해.
실행한 검수와 미실행 검사를 구분해 PROJECT-STATE/NEXT-STEPS에 기록해.
```

## G5-B2 완료 범위의 실행 계약 (이력)

아래 계약으로 사용자가 요청한 **단일 2D Move**를 구현했다. 지원 대상·검수·남은 제한은 [B2 구현](implementation/G5-B2-COPILOT-MOVE-2026-10-09.md), 최신 전체 결과는 PROJECT-STATE를 따른다. 다른 편집 명령을 모두 허용한 상태가 아니다. 다음 실행 프롬프트는 위 G6-A1이다.

```text
WebCAD G5-B2의 기존 편집 명령 한 종류만 조사·구현·검수하고 기록 후 멈춰.
다른 CAD 카드/G6/실제 provider를 자동 시작하지 마.
Pro 5시간 한도의 약 15%를 목표로 하는 작은 세션으로 범위를 제한해.
실제 LLM 공급자/서버/키가 없으므로 mock transport와 실제 CAD 실행을 구별한다.

PROJECT-STATE.md, NEXT-STEPS.md, docs/WORK-SLICES-2026-10-06.md,
docs/implementation/G5-B1-COPILOT-QUERY-2026-10-09.md,
docs/verification/G5-B1-CLOSEOUT-2026-10-09.json,
docs/implementation/G5-A1-GATEWAY-BOUNDARY-2026-10-06.md,
docs/implementation/G5-A2-COPILOT-CONTEXT-2026-10-08.md와
docs/implementation/G5-A3-COPILOT-APPLY-2026-10-08.md,
apps/web/src/copilot, App.tsx의 Copilot handlers, documentQuery.ts, documentPlans.ts,
apps/web/tests/copilotGateway.browser.tsx, copilotContext.browser.tsx, copilotApply.browser.tsx,
copilotQuery.browser.tsx를 먼저 읽는다.
G4(v12), DXF·치수(v13/v14), gateway A1–A3의 취소/context/atomic Apply·결과 인계를 보존한다.
reset, checkout, clean, 대규모 재작성은 금지한다.

현재 B1 local Query와 A1–A3 생성 allowlist는 전체 회귀를 통과했다.
먼저 기존 Move/transform-object 후보의 실행 경로를 조사하고 finite 독립 2D drawing 등
지원 representation·ownership·대상 수·좌표/단위를 좁힌다. 복잡한 sketch/pattern/mesh/3D
편집을 같은 allowlist에 함께 열지 않는다. 실행 가능한 명령 한 종류만 명시적으로 허용하라.
read target은 편집 selection을 바꾸지 않으므로 이를 암묵적인 edit 권한으로 취급하지 않는다.
대상/영향/잠금/ownership, authoritative Preview/Apply, context stale/Cancel/경합,
실패의 mutation/history 0, 수동 편집 동등성과 한 Undo·결과 인계를 검증한다.
LLM이 임의 topology/소유권/문서 snapshot을 주입하거나 문서를 직접 mutate할 수 없게 한다.
기존 local Query와 생성 Plan/Apply workflow를 실제 browser에서 회귀 검증한다.

집중 Node/browser 검사를 먼저 수행하고 tsc -b, 전체 Node/browser,
check:architecture, production build로 마감한다.
실행한 결과만 PROJECT-STATE, NEXT-STEPS 및 새 B2 검수 문서에 기록한다.
```

후속 요청은 “분할 문서의 G6-A1만”처럼 행을 지정한다. 각 결과에는 통과한 명령, 실패/미실행 검사, 다음 재시작 파일을 남긴다. 최신 전체 결과는 PROJECT-STATE를 따른다. C3 당시 전체 회귀는 36 workflows/758 checks였다.
