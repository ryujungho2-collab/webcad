# CAD B계열 보충 검토

2026-10-11 B2-C2 후속: [독립 line–arc Chamfer·열린 mixed 끝 연결](../implementation/B2-C2-OPEN-END-CORNERS-2026-10-11.md)을 완료했다. 기존 미지원 설명과 우선순위는 당시 검토 기록이며 다음 실행은 B5-F1이다.

2026-10-11 최신 후속: B1-E2와 B2-F2를 완료했고, 기존 구현 전반의 스타일·곡률·grip·solver→solid 연결을 [통합 보강](../implementation/CAD-INTEGRATION-HARDENING-2026-10-11.md)했다. 아래 우선순위와 미지원 설명은 검토 당시 기록이다.

최신 후속: **B0-C1 아트보드 문자·치수 출력을 완료했다.** [출력·지원 경계](../implementation/B0-C1-ARTBOARD-ANNOTATIONS-2026-10-10.md), [955 Node·75 browser 마감 증거](../verification/B0-C1-CLOSEOUT-2026-10-10.json). Point/무한선/ray는 별도 후속이며, 다음 B 보충 권장은 B1-E2다.

후속 갱신: **B3-G1 → B3-D3를 구현·검수 완료했다.** [공통 교점·PDF 크기 계약](../implementation/B3-G1-D3-PRECISION-OUTPUT-2026-10-10.md), [946 Node·70 browser 마감 증거](../verification/B3-G1-D3-CLOSEOUT-2026-10-10.json). 아래 재현과 우선순위는 구현 전 검토 기록이며, 현재 상태는 NEXT-STEPS를 따른다. 다음 B 보충 권장은 B0-C1이다.

2026-10-10. B0–B5 마감 문서, 현재 명령의 소유권/지원 guard, 스냅·치수·시트 출력과 면 참조 경로를 대조했다. **기존 범위의 구현은 유지하되 보충이 필요하다.** X 작성 기능을 계속 늘리기 전에 정밀 스냅과 PDF 스타일 불일치를 먼저 보강하는 편이 좋다.

이번 검토는 소스 대조와 세 가지 실행 재현이다. 전체 B 브라우저 suite나 전체 Node suite를 새로 실행한 검수는 아니다. 이전 928 Node 마감과 이번 증거를 구분한다. [실행 재현 증거](../verification/CAD-B-SUPPLEMENT-REVIEW-2026-10-10.json).

## 확인한 결함과 출력 공백

### 1. B0-B/B3 스냅과 작도 계산의 정밀도 차이 — 우선 수정

[snapEngine](../../apps/web/src/precision/snapEngine.ts)의 유한 선–원 교점은 직접 이차방정식 판별식을 계산하며 원–원 교점은 고정 1e-9 경계를 쓴다. [constructionGeometry](../../apps/web/src/precision/constructionGeometry.ts)와 [circularIntersection](../../apps/web/src/precision/circularIntersection.ts)은 이동/정규화 계산과 `linearToleranceAt`를 쓴다. 같은 형상에 서로 다른 교점/접선 판정이 가능하다.

실행 재현:

- 선 (0,0)→(1e9,0), 중심 (5e8,0), R=5: 스냅 교점은 x=499999993.925999와 500000006.07400095다. 독립 해석값/작도 경로는 x=499999995와 500000005다. 반지름 잔차는 약 **1.074 mm**로 해당 좌표의 모델링 tolerance를 크게 넘는다.
- R=5 두 원의 중심 거리 10+1e-8: 스냅은 해 없음, 작도는 tolerance 내 접선으로 처리한다.

큰 좌표 사례가 모든 일반 크기 도면에서 재현된다는 뜻은 아니다. 하지만 acquired snap 위치는 실제 작성 좌표가 되므로 표시만의 문제도 아니다. B3-G1에서 공통 안정 교점 helper를 쓰고, 유한 선/호 domain과 중복 해 제거는 스냅 역할로 유지한다. 독립 잔차·접선 경계·큰 좌표·CW/CCW·endpoint 포함 검사를 추가한다.

### 2. B3-D PDF 글자 크기 미반영 — 우선 수정

[planPlot](../../apps/web/src/plot/plotPlan.ts)은 일반 dimension을 `resolveDimension`으로 해석하지만 글자에는 `DIMENSION_TEXT_MM=3.5`를 사용한다. drafting 문자/연속 치수는 `modelSize`로 종이 축척을 적용하는 다른 경로다.

`style={textHeight:6,paperScale:2}`인 선형 치수를 1:1로 출력하면 활성 평면 SVG 글자 크기는 **12**, PDF 계획은 **3.5 mm**다. 단위/측정 글자와 선분 geometry는 해석된 값을 사용하지만 일반 치수의 글자 크기는 스타일을 따르지 않는다. B3-D의 모든 PDF 표시값이 일치한다고 한 기존 설명에는 이 보강이 필요하다.

B3-D3에서 model 크기와 paper 크기 정책을 명시하고 일반/연속 치수·문자가 같은 축척 계약을 따른다는 것을 1:1/1:10/fit에서 검증한다. 사용자 스타일 지정값이 실제 출력에 반영돼야 하며 측정값·driver는 바뀌지 않아야 한다.

### 3. B0-C/G2 아트보드 주석 출력 — 기능 보충

[collectArtboardExportItems](../../apps/web/src/export/exportModel.ts)는 root dimension, drafting text, point/infinite-line/ray를 명시적으로 거부한다. 실제 dimension 한 개가 있는 보드에서도 이 거부를 재현했다. 활성 평면 SVG/PDF의 주석 출력이 존재해도 아트보드 SVG/PNG/PDF 지원이 완료된 것은 아니다.

이는 조용한 누락을 막는 의도적인 지원 경계다. 건축·기계 도면 시트 workflow에서는 채워야 할 공백이다. B0-C1/G2 연결로 SVG 문자/치수부터 추가하고 PNG/PDF 합성·font·회전·clip·stacking·layer/purpose를 함께 검수한다. 무한선/ray는 보드 clip window로 유한화하고 point의 출력 표식 크기를 별도로 정한다. 먼저 다른 완료 범위와 구분된 하위 카드로 구현한다.

## B0–B5 전체 판단

| 계열 | 현재 범위 | 필요한 보충 / 분류 |
| --- | --- | --- |
| B0 | 기본 키 조작·단위/좌표·root 표시/잠금 검수 | 스냅 정밀도와 보드 주석 출력 우선. 모든 도구의 키 ownership 완료로 확대 해석하지 않음 |
| B1 | 일반 root Break/Explode/Join/변 전환, block Disband, 직선 sketch 정점, hatch/chain/binding 재연결 | **B1-E2 호·혼합 sketch 구성 편집**이 가장 직접적인 다음 보충. sketch/pattern Break/Explode adapter는 별도 단계. G4 정의 격리/override와 혼동하지 않음 |
| B2 | root 직선/호 코너, block 전체 포함 rigid move, sketch Stretch, standalone arc Lengthen | **B2-F2 sketch Lengthen**, B2-C2 독립 line–arc Chamfer/열린 mixed arc end 연결. owner 코너는 constraint remap 선행. 부분 block Stretch는 Disband/definition 인계 정책을 유지해도 됨 |
| B3 | DXF finite analytic OCS·주석·style·기본 작성 추적 | PDF 크기 결함·스냅 공통 정밀도 우선. B3-A4 TEXT/INSERT 비기본 OCS, DXF associative dimension 왕복은 별도 교환 확대. 전역 style preset/Move 추적은 사용성 후속 |
| B4 | 유한 호 point/tangent·명시적 영구 후보·반지름 driver | 현재 계약을 뒤집을 근거 없음. 접점 위치 고정 구속은 선택 확대, ellipse/spline은 X2 선행. B1-E2에서 arc topology 변경 시 기존 관계 보존/거부를 다시 검수 |
| B5 | 작업면·면 sketch·절삭·Hole·inward Shell과 원본 추종 | 기존 재지정·잠금·해 소멸/export 차단 경로는 유지. UCS는 X5, 정투영/단면/조립 도면은 별도 목표 카드. counterbore/나사·닫힌 hollow/outward Shell은 필요에 따라 확대하며 기존 카드 결함으로 분류하지 않음 |

B1-E2가 필요한 근거: [basicDrawingCommands](../../apps/web/src/features/drawing-editing/commands/basicDrawingCommands.ts)는 sketch 정점 편집에서 arc segment/bulge를 명시적으로 거부한다. 최근 X1 작성으로 독립 sketch arc를 더 쉽게 만들 수 있어도 이 구성 편집 guard가 풀린 것은 아니다. B1-D의 sketch 직선↔호 전환도 자동 완료로 볼 수 없다.

B2의 범위도 구분한다. [B2-C 구현](../implementation/B2-C-ARC-CORNERS-2026-10-10.md)은 독립 arc–arc와 닫힌 mixed 코너를 지원하지만 독립 line–arc Chamfer, 열린 mixed arc end, sketch/pattern owner 코너까지 지원하지 않는다. 이것들은 의도적 경계이며 보충 우선순위는 실제 작업빈도로 정한다.

## 권장 실행 카드

아래 ID는 이번 검토에서 제안한 **보충 카드**이며 아직 구현하지 않았다. 기존 완료를 통째로 취소하는 상태 변경은 하지 않는다.

| 순서 | ID | 완료할 결과 |
| --- | --- | --- |
| 1 | **B3-G1** | 스냅/작도의 안정 교점·tolerance를 통일. 실제 snap 입력이 독립 잔차 범위 안에 들고 접선/domain 판정이 일치 |
| 2 | **B3-D3** | 일반 치수 PDF 글자 크기/style·paper scale 계약 수정. 1:1/1:10/fit·일반/연속 치수·SVG 비교 |
| 3 | **B0-C1** | 아트보드 문자·치수의 SVG/PNG/PDF 전달. 레이어/표시·회전·clip·문자 크기 검수. G2와 공동 연결 |
| 4 | **B1-E2** | 호·혼합 sketch 구성 편집/직선↔호 전환. topology와 point-on-arc/tangent/driver 참조 보존, 명시적 remap 또는 원자적 거부·돌출 갱신 |
| 5 | **B2-F2** | sketch 선/호 Lengthen을 소유 sketch/solver를 통해 처리. 고정/구동 충돌은 입력 유지하며 전체 취소 |
| 6 | **B2-C2** | 독립 line–arc Chamfer·열린 mixed arc end 연결의 domain/유지 가지/참조 정책 |
| 7 | **B3-A4** | 비기본 TEXT/INSERT OCS의 위치·회전·높이·중첩 배치·손실 Review/왕복 |

1–2는 이미 존재하는 입력/출력의 신뢰성 보강이므로 X1-B2보다 먼저 권장한다. 3–5는 건축·기계 실무 workflow의 사용 범위를 넓힌다. 6–7 및 B5 추가 기능은 구체적인 도면 과제에 따라 순서를 바꿀 수 있다. 사용자 UCS·ellipse/spline·부품/분해도·모델에서 파생되는 도면은 기존 X/G6·분야별 목표에 남겨 중복 계획을 피한다.

## 문서 상태 보정

NEXT-STEPS의 완료는 각 카드에 적힌 최초 지원 범위의 완료다. B1-E의 혼합 호, B1-D의 sketch owner, B2-F의 sketch 대상은 확장 대기임을 더 분명히 표시한다. 과거 B1-F1/F2 문서의 ‘F2/F3 후속’은 당시 기록이며 현재 F1–F3는 완료다. 최신 보충 목록은 이 문서와 NEXT-STEPS를 따른다.
