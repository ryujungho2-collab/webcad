# B · X · G · I 구현 순서와 추가 항목

2026-10-17 정합성 기준: 현재 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md#현재-실행-큐)의 **WF-Q1**이다. 아래 10-11~12의 ‘다음/최신’과 순위는 당시 이력이다. G6-D4-H1·X6-D2-E1·G6-D3-B2·G6-D6-W1·P2/P3 및 spline 첫 범위는 [PROJECT-STATE](../../PROJECT-STATE.md)의 후속 기록에서 완료했으며, 미지원 범위는 각 구현 기록을 따른다. 이 문서는 B/X/G/I 카드 분할과 의존 관계를 보존한다.

## 2026-10-11~12 실행 순서 이력

2026-10-12 후속 수정: G6-D6-P1/G6-D4-R1의 재현 문제와 G6-D3-B1/B2의 첫 line/circle/arc HLR을 구현했다. [수정 범위](../implementation/COURTYARD-P0-P1-FIXES-2026-10-12.md). 다음은 **G6-D4-H1 건축 도면 표현 → X6-D2-E1 타원 단면**, conic/seam 세부 정책은 G6-D3-B2 잔여로 유지한다. 아래 최초 검토 순서는 이 후속 기록보다 이전이다.
2026-10-12 우선순위 변경: [중정형 도서관 프로젝트 검증](COURTYARD-COMMONS-CAD-AUDIT-2026-10-12.md)에 따라 **G6-D6-P1 성능 보충 → G6-D4-R1 단면 편집·참조 안정화 → G6-D3-B1/B2 일반 BRep 입면/숨은선 → G6-D4-H1 건축 도면 표현 → X6-D2-E1 타원 단면 → G6-D6-W1 건축 프로젝트 마감** 순서로 진행한다. 아래 이전 순서보다 이 갱신을 우선한다. X2-A exact curve 계약은 이미 있고, 일반 BRep 첫 직선/원·호 입면 검증은 타원 단면 전체 완료를 기다리지 않는다. G6-D4-R1은 새 보충 카드이며 위 보고서가 완료 조건을 소유한다.

2026-10-11. 현재 코드와 완료 기록을 대조한 **실행 계획**이다. 이번에 기능을 구현하거나 제품 회귀 검사를 새로 실행한 기록은 아니다. 현재 구현은 [PROJECT-STATE](../../PROJECT-STATE.md), 실행 큐는 [NEXT-STEPS](../../NEXT-STEPS.md)가 소유한다.

최신 프레임 큐 갱신: **G2-F1/S1과 [G2-F2](../implementation/G2-F2-FRAME-CONNECTIONS-2026-10-11.md)를 완료**했다. [G6-D5-F1 자동 시트](../implementation/G6-D5-F1-FRAME-SHEETS-2026-10-11.md)도 완료했고 [G2-F3 연속 도면](../implementation/G2-F3-CONTINUOUS-FRAMES-2026-10-12.md) 첫 범위도 완료했다. 다음 추천은 **X6-D2-E1 실제 타원 단면**이다. 기존 CAD 기하 확대 **X6-D2-E1**은 별도 큐로 유지한다. 프레임/구역 작업에는 일반 HLR 또는 spline 전체가 필수 선행은 아니다.

## 결정

**CAD 수정 공백 → 수치 편집 → 접선 작성·복사·좌표계 → 부품/분해도·연관 도면 → 제작 기능 → 고급 곡선·외부 연결** 순서로 진행한다. B 전체를 모두 끝낸 뒤 X 전체, G 전체, I 전체를 차례로 구현하지 않는다. 같은 모델에서 숫자를 수정하고 도면을 갱신하는 1차 목표의 의존 관계에 따라 섞어서 실행한다.

최신 구현: [B3-A4](../implementation/B3-A4-DXF-PLACEMENT-2026-10-11.md)·[B5-F1/F2](../implementation/B5-F12-NUMERIC-PILOT-2026-10-11.md). X1-B2/B3·X4-A1·X5-A/B pilot도 [구현](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md)했고 X6-D1/D2·G6-D4·X7-A/E·G6-D5/D6 첫 범위도 완료했고 G6-D5-A1/A2·X2-A도 완료했고 다음 CAD 구현은 X6-D2-E1이며 곡선/HLR 확대 큐를 따른다.

후속 갱신: [B2-C2](../implementation/B2-C2-OPEN-END-CORNERS-2026-10-11.md)를 완료했다. **B3-A4·B5-F1/F2·X1-B2/B3·X4-A1·X5-A/B pilot·X2-A도 완료했고 다음 CAD 구현은 X6-D2-E1**이다. 다음에는 아래 표의 한 하위 카드씩 구현한다. 접선·복사·UCS pilot은 마감했고 G6-D1/D2와 D3 첫 adapter도 구현했다. [지원 경계](../implementation/G6-D123-ASSEMBLY-EXPLODED-PROJECTION-2026-10-11.md)를 따른다. 외부 provider·RVT 환경 준비는 내부 CAD 구현을 막지 않는다.

## 현재 기반과 실제 공백

| 계열 | 사용할 기반 | 다음 구현에 필요한 공백 |
| --- | --- | --- |
| B | B0–B5의 명시된 범위, B1-E2 혼합 sketch, B2-F2 선/호 Lengthen, 치수·구속·작업면·Hole/Shell, B2-C2·B3-A4, B5-F1/F2 수치 편집 pilot | 다중 원본 수치 Review·임의 BRep 치수 편집. sketch/pattern 소유 topology 변경과 면 Lengthen은 별도 확대 |
| X | X1-A/C/B1/B2/B3, X3-A/B1, 독립 drawing clipboard·활성 UCS pilot. 기존 analytic 원/호·stable topology·live 작도 | clipboard 관계 closure·UCS 전체 도구 확대, 실제 section, 종류별 주석. X2-A ellipse/elliptic arc 원본은 완료. Bezier/spline/NURBS 원본 및 일반 단면/HLR adapter는 후속 |
| G | 공통 명령/History, 보드·appearance·component 기반, 이미지, Scene/HTML player, gateway, 저장 모델 뷰·첫 exchange fixture | 부품/분해도와 주축 primitive 연관 도면은 구현. 일반 BRep/숨은선 확대, 공통 도구 세션 수명, instance override/격리 편집, 제작 도구 확대 |
| I | I1 decoder/원본 교체, 공유 asset, crop·rect/ellipse clip·opacity·기본 color 조정 | clipboard, 선택 영역/pixel mask, 필터 순서·retouch, 제한된 PSD. 현재 ellipse clip은 pixel mask가 아님 |

판단 근거:

- [primitive 편집](../../apps/web/src/properties/PropertiesPanel.tsx)은 `Number(...)`로 값 변환 후 `update-primitive`를 직접 dispatch한다. B5-F1/F2에서 cylinder 단위 포함 지름/길이 및 sketch/돌출 영향 Review→Apply pilot을 완료했다. 다른 primitive 확대는 후속이다.
- [ModelView](../../packages/cad-document/src/ModelView.ts)는 camera snapshot이며, [CadDocument](../../packages/cad-document/src/CadDocument.ts)에는 G6-D1/D2/D3의 부품·분해 표현·파생 도면 계약이 추가됐다. ModelView 카메라 저장과 modelPresentation 연관 도면을 구분한다.
- [출력 모델](../../apps/web/src/export/exportModel.ts)은 기존 drawing/drafting/image 출력과 솔리드 STL/STEP 경로를 제공한다. G6-D3 첫 adapter는 box/cylinder source 참조 정투영을 제공하며 일반 BRep/숨은선은 확대 큐다. 보드의 point/infinite-line/ray는 명시적 미지원이다.
- [ImageNode](../../packages/cad-document/src/ImageNode.ts)의 mask는 rect/ellipse, adjustment는 brightness/contrast/saturation이다. I2/I3를 현재 속성으로 완료 처리하지 않는다.
- [block 계약](../../packages/cad-document/src/CadDocument.ts)의 override는 정의 수준이다. placement별 override/variant 및 3D assembly와 구분한다.

## 1차 실행 큐 — 건축·기계 모델과 도면

아래 상태는 최신 구현 기록을 반영하며 G6-D1/D2는 완료, D3은 주축 primitive 윤곽 adapter 완료/일반 BRep·HLR 확대 대기, D4/D5/D6는 첫 범위 완료이며 일반 곡선/숨은선/교환 확대는 대기다. 기존 G6-C는 외부 adapter로 유지하고, 내부 모델 제작 연결은 G6-D로 분리한다. 기존 목표 문서의 번호를 없애지 않고 아래 ID와 대응시킨다.

| 순서 | 실행 카드 | 사용자 결과 / 선행 조건 |
| --- | --- | --- |
| 완료 | **B2-C2** | 독립 line–arc Chamfer, 열린 mixed arc end 연결. 유지 가지·유한 domain·D1/D2·참조/Undo를 먼저 마감 |
| 2 | **B5-F1 — primitive 수치 편집 pilot** · 완료 | cylinder의 Ø/반지름·길이를 단위 포함 입력으로 검토하고 실제 원본 parameter를 한 Apply로 변경. 종속 영향·오류 복구·Undo/재열기·STEP 검수. 임의 BRep 치수 편집은 제외 |
| 3 | **B5-F2 — sketch/돌출 수치 편집 pilot** · 완료 | 기존 구동 치수/변수·돌출 길이 경로를 F1과 같은 입력·영향 검토로 연결. 표시 주석과 driver를 구분하며 연결된 모델만 재생성 |
| 4 | **X1-B2** · 완료 | 시작점+방향 있는 시작 접선+끝점 호. 기존 arc로 저장, 단위/스냅/Review·일반/면 sketch·기존 출력 연결 |
| 5 | **X1-B3** · 완료 | 두 직선+반지름의 접선 원. 복수 후보·유한 선/연장선 정책. B2 접점 계산을 재사용하되 작도 명령으로 분리 |
| 6 | **X4-A1** · 완료 | 독립 drawing의 기준점 Copy/Paste. 첫 범위는 같은 문서, topology ID·배치·스타일 remap. X4-A2 dependency closure는 별도 |
| 7 | **X5-A → X5-B** · 완료 | 저장 work plane frame을 공유하는 활성 UCS/WCS와 Line/Circle·local Move pilot. 카메라·객체 배치와 구분. 일반 도구/교환 확대는 X5-C |
| 8 | **G6-D1 — 부품·조립 위치** · 완료 | 기존 독립 솔리드 3–5개의 안정 부품 ID·조립 위치·삭제/참조 계약. 목표 4a에 대응. 전체 mate solver 제외 |
| 9 | **G6-D2 — 비파괴 분해도** · 완료 | D1의 부품별 방향/거리·전체 분해량·저장 표현. 0에서 정확히 복귀. picking·측정·STEP은 표시 이동과 모델 위치를 구분. 목표 4b |
| 10 | **G6-D3 — 모델 연관 정투영** · 부분/첫 adapter 완료 | 모델 source/뷰/basis를 저장한 도면 뷰와 source edge 대응. 지원 BRep의 윤곽부터 시작하고 숨은선은 검증된 하위 범위로 확대. 목표 5a |
| 11 · 첫 범위 완료 | **X6-D1 → X6-D2 → G6-D4** | D1은 화면 clipping. D2는 실제 BRep×plane section curve. **G6-D4 — 건축 절단·단면**은 D2를 사용해 절단 높이/범위·개구부·단면 표시를 제공. 목표 5b. 중복 section 엔진을 만들지 않음 |
| 12 · A/E 첫 범위 완료 | **X7-A → X7-E** | Leader/문자와 측정→일반 주석 인계. source attachment·live/snapshot 구분·출력. ordinate/면적/호 길이(X7-B/C/D)는 필요한 도면별 확대 |
| 13 · 수동 시트 첫 범위 완료 | **G6-D5 — 시트·연관 치수·출력** · 추가 | D3/D4 뷰를 기존 G2 보드에 배치하고 종이 축척·치수 source·SVG/PDF를 연결. 모델 변경 후 갱신·missing/ambiguous 참조 복구. DXF는 지원 entity/loss 범위를 따로 검수. 목표 6 |
| 14 | **B3-A4 완료** | TEXT/INSERT의 비기본 OCS·중첩 배치 교환. annotation/block schema와 D5의 출력 범위를 대조. 사용자 우선 요청으로 앞당겨 지원 범위를 완료함 |
| 15 · 두 예제 완료, 성능 후속 | **G6-D6 — 건축·기계 workflow 마감** · 추가 | Ø20→Ø25·길이80→100과 단층 두께/높이/개구부 변경 → 재생성 → 정투영/단면·분해 표현 → 치수 시트 → 저장/Undo/출력. 목표 7. 실제 browser와 독립 기하 검증 |

X6-D1은 화면 preview를 위한 순서이며 D2 계산의 필수 수학 의존성은 아니다. X6-D2 첫 범위는 평면/원통 등 지원 BRep와 결과 직선/원/호를 명시한다. 타원·spline 단면이 필요한 입력은 **X2 지원 후 확대하거나 미지원으로 명시**한다. 처음부터 모든 솔리드 단면을 보장하지 않는다.

D3와 D4는 각각 구현할 수 있고 D5가 두 결과를 소비한다. D5가 D1/D2의 모든 확장이나 외부 IFC 연결을 기다릴 필요는 없다. 위 순서는 기본 실행 큐이며 독립 과제의 필수 의존성을 과도하게 늘리지 않는다.

## CAD 확대 큐 — 사용자 후속 요청 반영

기존 1차의 첫 지원 범위와 X2-A를 완료했으며 **X6-D2-E1 → G6-D3-B1/B2 → X2-C1/C2 → X6-D2-S1 → G6-D5-E1 → G6-D6-W1/P1**를 실행한다. [하위 카드·완료 기준](CAD-DRAWING-EXPANSION-PLAN-2026-10-11.md)을 새로 정의했다. G6-D5-A1 한 페이지 pilot과 [A2 도곽·정렬·다중 페이지](../implementation/G6-D5-A2-FRAMES-ALIGNMENT-MULTIPAGE-2026-10-11.md)와 [X2-A 원본](../implementation/X2-A-EXACT-ELLIPSE-2026-10-11.md)을 완료했고 나머지는 대기다. 타원 단면은 X2-A, rational spline 단면은 X2-C2를 선행한다. HLR 첫 범위는 지원 분석적 곡선이며 spline 출력은 S1 후 확대한다. X6-D2-P1 임의 평면·X6-D1-C1 화면 cap·G6-D4-H1 단면 hatch는 별도 후속이다. 아래 G1/G4/I 제작 큐는 이 CAD 확대 큐 뒤로 유지한다.

## 도면 작업 경험 추가 큐 — 프레임·작업 구역

[프레임·연결·작업 구역 계획](CAD-FRAMES-SECTIONS-PLAN-2026-10-11.md)을 추가했다. **G2-F1 프레임·G2-S1 작업 구역·[G2-F2 연결/정렬](../implementation/G2-F2-FRAME-CONNECTIONS-2026-10-11.md)은 완료**, **G6-D5-F1 자동 시트 인계도 완료**, **G2-F3 연속 도면 이어 붙이기**도 동일 뷰/독립 2D·수치 기준점·명시적 seam·시트/출력의 첫 범위에서 완료했다. 기본 위치는 위 CAD 확대 큐 뒤·아래 제작 큐 앞이며 X6-D2-E1의 현재 우선순위는 유지한다. 지정 요청 시 F1/S1은 기존 지원 도면으로 독립 구현 가능하다. 기존 A1/A2 배치/도곽을 재사용하고 F1/S1에 전체 spline/HLR을 선행으로 강제하지 않는다. 묶음 배치와 기준점으로 이어 붙이기는 별도 카드이며 모든 배치는 모델 좌표·실제 치수·참조를 유지한다.

## 2차 실행 큐 — 벡터·이미지·컴포넌트·제작

| 순서 | 실행 범위 | 이유 / 완료 경계 |
| --- | --- | --- |
| 16 | **G1 공통 session owner 첫 범위** | 도구 전환·문서 교체·Cancel·History·preview 작업의 수명/포커스를 통일. 이미 재현된 수명 결함이 있으면 해당 카드와 함께 앞당겨 수정. 모든 패널을 한 번에 재작성하지 않음 |
| 17 | **G4-B 정의 격리 편집 → instance override → variant** | 각 단계를 별도 카드로 마감. 안정 member ID·정의 변경/삭제 충돌·override reset·nested viewport/export를 먼저 마련한 뒤 variant를 연결 |
| 18 | **I4 이미지 clipboard** | I1 decoder·asset·원본 교체를 재사용하는 작은 독립 경험. 사용자 paste/read, 삽입/교체 대상·권한 실패·Cancel·단일 Undo. X4와 대상/실행 grammar만 공유 |
| 19 | **I2 선택 영역→pixel mask** | rectangle/polygon 영역의 좌표·해상도·비파괴 mask asset/소유권부터. shared source는 그대로 두고 placement별 편집. viewport·SVG/PNG/PDF·save/Undo 일치 |
| 20 | **I3 필터 한 종류 → 효과 순서 → 국소 retouch** | 기존 color 조정과 mask를 소비. 효과 순서/색공간·Worker 취소·원본 보존·pixel 기준·비용을 명시. brush/tile engine은 별도 범위 |
| 21 | **X2-B + G2 path node/import** | X2-A exact 원본은 위 CAD 큐에서 먼저 구현한다. 이후 Bezier 원본과 node editor·제한된 SVG import를 함께 연결. renderer/export만 추가하고 편집·snap·저장을 빼지 않음 |
| 22 | **G2 compound/Boolean → gradient/mask → text/font** | 각 표현 기능을 분리. compound는 fill rule/구멍·Boolean 결과 source, text는 font asset·shaping·text-to-path 손실. gradient는 curve solver의 필수 선행이 아님 |
| 23 | **G4-A 직접 layout → G4-C PPTX → APNG/GIF → 영상** | 배치 경험을 먼저 완료하고 포맷별 snapshot/편집 가능성·timing/link 손실 검토. 현재 HTML player는 유지. 동영상은 별도 encode/cancel/budget 계약 |
| 24 | **I5 composite → 레이어 mapping** | 제한된 PSD composite를 손실 Review와 asset 한도에 맞춰 먼저 검수. editable layers/effects는 후속. composite 단계는 I2 완료에 의존하지 않지만 기본 이미지 경험 뒤로 배치 |
| 25 | **G5-B2 편집 확대 → 실제 provider 한 곳** | Rotate/Scale 등 한 명령·대상 범위씩 추가, 수동 동등성·authoritative Preview/Apply 확인. 자연어 parsing 확대와 CAD 기하 구현을 구분. 실제 공급자 연결은 환경 준비 시 수행 |

I2는 현재 3 MiB 원본 asset/문서 정책에 mask bytes·History·동시 decode/preview를 어떻게 포함할지 먼저 설계한다. 3 MiB compressed bytes 통과를 CPU/GPU 메모리 안전성으로 간주하지 않는다. 기준점을 mask source pixel 좌표로 저장할지와 원본 교체 시 보존/재계산/거부 정책도 포함한다.

## 후속 큐와 순서를 바꿀 조건

- **X3-C1 → C2 → C3**(각 이등분선·외접원·내접원)은 기존 analytic source로 독립 실행 가능하다. 수학 작도가 주 업무로 바뀌면 순서 6 앞에 배치한다. 현재 건축·기계 모델 도면의 필수 선행은 아니다.
- **X2-C1 → C2**(B-spline→NURBS)는 위 CAD 큐로 승격했다. **X3-B2/B3**(ellipse/freecurve 교점)은 exact 원본·parameter domain·tolerance·영구 해 identity를 먼저 갖춘 뒤 구현한다. 교점을 node editor나 sampling 결과만으로 완료 처리하지 않는다.
- **X4-A2 → X4-B**는 sketch/작도/solid의 dependency closure와 문서 간 layer/asset/block/variable remap이다. 공유 clipboard 명령의 첫 범위 X4-A1을 완료한 다음 확대한다.
- **X6-A → B → C**(3D Mirror·Linear/Radial Pattern)는 stable source/slot·count 축소 참조·재생성·BRep validity가 선행한다. G6-D1과 identity 정책을 맞추되 일반 root solid pattern의 필수 수학 선행으로 assembly 전체를 강제하지 않는다. 반복 부품이 주 과제면 D3 전에 올린다.
- **B owner 확대**: sketch/pattern Break·코너 topology 변경, 면 부착/혼합 Lengthen은 구체적인 모델 작업에서 필요한 순서로 추가한다. geometry remap·constraint·종속 참조의 실패 정책 없이 guard만 해제하지 않는다.
- **G6-C 외부 adapter**: 필요한 실제 source fixture·교환 목표가 확보되면 IFC 등 한 포맷부터 수행한다. RVT/Manim/Notion/InDesign은 각 환경·손실 계약으로 분리한다. 외부 서비스 연결이 내부 D1–D6의 선행은 아니다.
- **G3-5/공통 성능 평가**는 단계마다 해당 workload에서 수행한다. native GPU/heap·Worker·History·export peak memory와 사용자 작업 시간을 따로 측정하며, 회귀 개수만으로 실무 평가 완료를 표시하지 않는다.

## 추가하거나 구체화할 항목

| 항목 | 계획 반영 | 필요한 이유 |
| --- | --- | --- |
| 수치 편집 pilot의 실행 ID | **B5-F1/F2 추가**, 목표 순서 3을 세분화 | 현재 계획은 이름만 있고 한 요청의 원본/편집 경계가 불명확 |
| 부품/분해/파생 뷰/시트의 실행 ID | **G6-D1–D6 추가**, 기존 목표 4a–7과 대응 | 카메라 저장·2D scene·fixture가 3D 모델 도면 완성으로 오해되는 것을 막고 실제 명령/문서/UI까지 연결 |
| 파생 도면 참조의 재연결 | **G6-D3/D4/D5에 포함** | 원본 edge 소멸·분할·모호함을 알리고 사용자 재지정. 가까운 edge로 조용히 갈아 끼우지 않음 |
| 보드의 보조 형상 출력 | **B0-C1 후속 / G6-D5 하위 범위**로 명시 | point 표식·무한선/ray를 종이 경계에 유한화. 기존 일반 주석 완료와 별도 |
| 도면 축척·lineweight·한글/font 계약 | **G6-D5·G2 text 하위 범위** | 모델 mm/종이 mm/화면 px를 분리하고 출력 전 font 및 지원 손실을 검토 |
| mask/effect 데이터와 자원 소유권 | **I2/I3 시작 계약** | 공유 원본·placement·History·export의 의미와 메모리 budget을 먼저 결정 |
| 출력/교환 손실과 source provenance | **D5·B3-A4·X2·I5·G4-C 공통 마감** | source identity를 지키며 정확한 geometry와 근사/flatten 결과를 구분 |

새 대형 엔진을 추가할 필요는 없다. BOM·전체 assembly mate·BIM semantic object·나사/counterbore·mesh 편집·협업은 현재 1차 완료의 필수 범위에 넣지 않는다. 필요한 실무 예제가 정해지면 기존 로드맵에서 후속 카드로 분할한다.

## 한 카드의 마감 기준

기하 계산만, 버튼만, 테스트만 추가하고 완료로 올리지 않는다. 명령 → 정확한 원본/참조 → Review/Apply·오류 복구 → 실제 viewport 선택/편집 → 해당 출력 → History/파일 재열기까지 지원 범위를 연결한다. 실패/Cancel/stale/잠금은 문서·History를 부분 변경하지 않아야 한다.

새 geometry/asset 종류는 evaluate·bounds·hit-test·snap·측정·solver 지원 여부·serialization·renderer·export matrix를 먼저 명시한다. 필요한 타입/구조/build·집중 회귀와 실제 UI workflow를 실행하고, 전체 회귀는 공통 경로 변경 또는 마감 필요에 맞춰 수행한다. 날짜·실행 명령·최초 실패/재검증을 기록한다. 계획 문서 변경의 확인은 링크/구조 검사이며 제품 테스트 통과 수를 늘리지 않는다.

현재 단면/주석/시트/두 예제의 구현과 후속 경계는 [기록](../implementation/SECTION-ANNOTATION-SHEETS-WORKFLOWS-2026-10-11.md)을 따른다. 전체 CAD/BIM milestone 완료를 뜻하지 않는다.
