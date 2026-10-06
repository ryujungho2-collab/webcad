# 작업 범위 분할과 재시작 계약

2026-10-06. 기존 G0–G6와 CAD B0–B5의 목표를 작은 검증 가능한 결과로 구분한다. G3-5A/I1 이후 **G4-A, G4-B/C의 첫 원본·component·SVG 범위, CAD B3-A1/A2·B**를 함께 구현했다. 상세 완료 경계는 [실제 구현 기록](implementation/G4-CAD-BASICS-2026-10-06.md)을 따른다. 다음 실행은 G5-A 검수, 다음 CAD 구현은 B3-C다.

## 현재 작업 트리에서 이어받을 것

| 묶음 | 실제 상태 | 다음 담당의 책임 |
| --- | --- | --- |
| G3-5 자원 / I1 원본 교체 | source 공유·재업로드 제거·마지막 해제·원본 교체 마감. 당시 599 Node / 33 browser·686 checks / architecture 294 modules. 최신 전체는 PROJECT-STATE | 외부 실무자/native GPU/heap/VRAM·3 MiB 정책 평가. [측정과 제한](verification/G3-5-IMAGE-RESOURCES-2026-10-06.md), [원본 교체 검수](verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md) |
| G4-A / 첫 B·C | Scene v12·원본/finite nested component 선택 인계·row/column·숨김 collapse·state/time preview·target state 링크·재생·SVG 출력. draft 유지/동시 수정 충돌·scroll review를 수정. Node 7개·browser 24개 | 직접 layout handle·component override/variant·PPTX/GIF/영상과 실무자 평가 남음. 숨김 state를 variant로 표시하지 않음 |
| G5 첫 연결 | 로컬 규칙 유지 + 사용자 gateway 설정, 제한된 command response 검증, 취소·stale 차단, 공통 Review/Apply 연결. Node 3개, mock transport browser 8개 통과 | 실제 LLM 공급자·키·서버 연결 없음. 현재 허용 명령은 finite drawing/primitive 생성 1–20개. 공통 command/graph 자동화 전체 지원 아님 |
| G6 | 이번에 새 adapter 구현 없음 | 외부 연결 환경이 없으므로 오프라인 계약/fixture와 실제 연결 검증을 분리 |
| CAD B3-A1/A2·B | DXF bulge analytic 왕복과 Import/Export review, 일반 원/원호 Ø 주석·source 갱신·Trim/Join circular edge remap·v13. 신규 Node DXF 7/지름 4, browser DXF 18/지름 17 | 다음 B3-C 일반 각도 치수. B3-A3 OCS/tilted와 나머지 B/X 카드는 계획. 전체 CAD 기능 동등성 아님 |

작업 트리는 기존 수정과 untracked 파일이 많다. reset/checkout/clean이나 일괄 되돌리기를 하지 않는다. G4/G5를 G3 결과로 보고하거나 작업 트리에서 지우지 않는다. 파일 이름에 날짜가 있어도 문서에 적힌 검증 시점을 확인한다.

## 실행 단위

각 행은 독립 요청으로 선택할 수 있다. 여러 행을 요청한 경우 공통 회귀에서 함께 마감하되, 실제 완료 경계를 각각 기록한다. 한도 안에 특정 단계가 끝난다고 시간이나 사용량을 보장하지 않는다.

| 순서 | 범위 | 완료 경계 / 포함하지 않는 것 |
| --- | --- | --- |
| 완료 · G3-5A + I1 | 기존 자원 최적화 전체 회귀·측정 및 native 원본 교체 연결 | 타입·전체 Node/browser·architecture·workspace build 통과. cache/tile/WebGPU/G4/G5 새 기능 제외 |
| 완료 · G4-A 검수 | Scene/Auto Layout/state/link/player/v12 검수·결함 수정 | 같은 source identity·한 Undo·stale·잠금·저장·draft 유지/오류 복구 |
| 완료 · B3-A1/A2 | DXF bulge 입출력·단위·레이어 왕복·실제 review/파일 흐름 | sparse/final/signed arc·inch·회전/반사·exact vertices·subset 수락. A3 OCS/tilted·DWG/일반 spline 남음 |
| 4 · G5-A 검수 | 이미 작성된 gateway 설정·제안 검증·취소 경로 완성 | 실제 provider 없는 상태의 모의 검증임을 표시. 허용 명령과 preview 일치. API 키를 브라우저에 저장하지 않음 |
| B3-B 완료 / B3-C 다음 CAD | 일반 지름 주석 완료, 일반 각도 치수 다음 | 주석과 driver 구분·변경 전파·출력·오류·Undo. v13 지름, 일반 각도는 미구현 |
| G4-B 첫 범위 완료 | Scene source→Properties와 finite nested component 재사용 | 직접 layout handle·override/variant는 별도 후속. original identity 보존 |
| G4-C 첫 출력 완료 | 검토 state/time/layout의 정지 SVG와 손실 안내 | links/timing을 가진 독립 플레이어·PPTX/GIF/영상은 각각 후속 |
| 8 · G5-B | Query와 기존 편집 명령 한 종류를 gateway에 확대 | 실제 대상/영향/권한/preview와 수동 편집 동등성 검사. 전체 command allowlist를 한 번에 개방하지 않음 |
| 9 · G6-A | 현재 CAD의 Axo 뷰 계약·재현 가능한 preset | 카메라·Fit·출력의 첫 독립 과제. RVT import와 섞지 않음 |
| 10 · G6-B | 오프라인 source ID/unit/loss/asset manifest와 fixture import/export | 하나의 adapter boundary만 구현, review/atomic Apply. IFC/RVT를 실제 읽었다는 주장 금지 |
| 11 · G6-C 이후 | 실제 연결 환경이 준비된 adapter 한 종류 | Manim render, Revit/IFC, Notion, InDesign을 각각 따로 검증. 환경 미정인 항목은 완료로 표시하지 않음 |

위 목록 사이의 CAD 후속은 아래 대기열에서 하나씩 선택한다. G3-5가 끝났다는 이유만으로 G4–G6와 B0–B5 전체를 같은 요청에서 실행하지 않는다.

공개 코드 후보와 직접 구현할 이미지 I2–I5/벡터/Scene/Copilot의 연결은 [재사용·구현 계획](product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md)을 따른다. UTIF만 채택했으며 다른 라이브러리와 편집기 전체를 설치한 상태가 아니다.

## CAD-BASICS 전체 개선의 작은 묶음

현재 지원표는 [CAD-BASICS](product/CAD-BASICS.md), 구현 카드의 단일 기준은 [CAD 구현 단위 설계](product/CAD-BASICS-IMPLEMENTATION-PLAN.md)다. B0–B4 기존 기능 보완, B5 기본 3D, X1–X7 새 객체·작성 방식·작도·UCS·clipboard·3D 패턴을 구분했다. 각 카드에 수정 위치·선행 조건·기하/소유권/참조/출력 지원 축·완료 검사가 있다.

**B3-A1/A2·B는 완료**, 다음 CAD 요청은 **B3-C 일반 각도 치수**다. 추가 OCS/기울어진 평면은 B3-A3로 따로 검토한다. 기존 B3-A는 A1/A2/A3의 상위 이름을 유지한다. 이후 관계 교체 B1-A/B 등을 독립 요청으로 수행한다.

B0–B5 전체 완료와 일반 CAD 전체 기능 동등성은 구분한다. 여기에는 상세 카드 표를 복제하지 않는다. 지원 범위를 지우거나 아직 구현하지 않은 카드를 완료로 올리지 않는다.

## 바로 다음 명령 — G5-A 기존 gateway 검수

```text
WebCAD G5-A 기존 gateway 설정·제안 검증·취소·stale·Review/Apply를 검수하고 결함을 수정하라.
실제 LLM 공급자/서버/키가 없으므로 mock 검증과 실제 연결을 명확히 구별하라.
component variant, PPTX/영상 export, 새로운 CAD/G6 adapter는 이 검수에 포함하지 않는다.

PROJECT-STATE.md, NEXT-STEPS.md, docs/WORK-SLICES-2026-10-06.md,
docs/product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md와 Scene 관련 구현/테스트를 먼저 읽는다.
이미 구현한 G4(v12), 일반 지름(v13), DXF review와 Copilot gateway 변경을 보존한다.
reset, checkout, clean, 대규모 재작성은 금지한다.

gateway URL/transport/config 저장·요청 수명과 제한된 command 응답 경계를 조사한다.
API 키를 브라우저 저장소에 넣지 말고 실제 승인되지 않은 네트워크 환경을 만들지 않는다.
취소·늦은 응답·중복 Apply·문서 교체/변경·malformed command·source 잠금을 검증한다.
로컬 규칙 모드와 gateway mode가 같은 typed command·detached review/atomic Apply를 쓰는지 확인한다.
현재 허용 drawing/primitive 생성 1–20개와 Node 3개/mock browser 8개를 기준으로 삼는다.

실제 browser UI에서 설정→mock 제안→영향 검토→오류 수정/재시도→Apply→Undo/Redo를 검증한다.
tsc -b, 전체 Node/browser, check:architecture, production build로 회귀를 마감한다.
최신 통합 기준선은 PROJECT-STATE의 G4·CAD 결과를 따른다. 이전 599/33/686을 최신으로 쓰지 않는다.
처음 전체 browser의 PDF fetch 실패와 최종 전체 통과를 구분한 기록을 보존한다.
실행한 검수만 PROJECT-STATE, NEXT-STEPS와 gateway 검수 문서에 기록한다.
다음 CAD 독립 묶음은 B3-C 일반 각도 치수다.
```

후속 요청은 “분할 문서의 G5-A 검수”, “B3-C 일반 각도 치수 구현”처럼 행을 지정할 수 있다. 각 결과에는 통과한 명령, 실패/미실행 검사, 다음 재시작 파일을 남긴다.
