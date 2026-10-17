# G6-D1/D2/D3 — 부품·분해도·연관 정투영

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-11. G6-D1/D2와 G6-D3의 첫 정확한 윤곽 adapter를 구현했다. 전체 mate solver와 일반 BRep 숨은선은 후속이다. [검수 기록](../verification/G6-D123-CLOSEOUT-2026-10-11.json), [다음 실행](../../NEXT-STEPS.md).

## 실제 사용

View → **Assembly and drawings** 또는 명령 검색에서 창을 연다. 기존 솔리드를 선택하고 Register/rebind part로 안정 부품 ID를 등록한다. Assembly position에서 모델 좌표 XYZ와 Euler 각도를 입력하고 Review → Apply한다. Review는 원본을 바꾸지 않고 모델 위치와 표시 위치를 나란히 보여준다. 성공한 배치는 이동/회전을 하나의 Undo로 복원한다.

Exploded display는 부품별 단위 방향·거리와 전체 amount 0–1을 저장한다. 거리에는 문서 길이 단위를 사용할 수 있다. Review의 표시 위치를 확인한 뒤 적용한다. amount 0 또는 Review assembled display로 모델 위치에 정확히 돌아온다. 저장 표현은 이후 다시 활성화할 수 있다. 부품을 제거해도 원본 솔리드는 남으며, 분해도/정투영이 참조하면 먼저 그 표현을 제거해야 한다. 원본 삭제는 안정 부품 ID를 유지하고 missing source를 표시한다. Register/rebind part로 새 원본을 명시적으로 지정한다.

Model projection에서 부품·Top XY / Front XZ / Right YZ·시트 원점·geometry scale을 지정한다. Review는 파생 윤곽 SVG를 보여주며 Apply는 소유된 drawing 출력을 만든다. 같은 창에서 저장 뷰 갱신·명시적 재연결·삭제를 수행한다. 원본의 Properties 수치 편집과 모델 배치 변경은 같은 transaction에서 윤곽을 갱신한다.

## 표시 위치와 모델 위치

분해 offset = direction × distance × amount이며 **viewport mesh에만** 더한다. 모델 TRS·원본 BRep·체적/길이 측정·STEP operand와 실제 Worker STEP bytes는 조립 위치를 유지한다. Fit은 표시된 mesh 범위를 사용하고 전체 객체 picking은 표시 위치에서 기존 객체 ID를 반환한다. 분해가 실제 이동을 만든 동안 얼굴 picking·TransformControls·포인터 거리 측정을 막고 조립 표시 복귀를 안내한다. Properties 모델 측정과 명시적 Assembly position 편집은 사용할 수 있다. offset이 모두 0이면 이 제한을 적용하지 않는다. 분해 애니메이션과 mate constraint는 제공하지 않는다.

## 정투영 지원과 참조 계약

첫 adapter는 **주축 방향 primitive box/cylinder의 부품별 정확한 외곽 윤곽**이다. box는 8개 corner/12개 분석 edge에서 투영 외곽을 구하고, cylinder는 축 방향에 따라 circle 또는 rectangle을 계산한다. mesh screenshot/표본 convex hull을 정확한 도면으로 취급하지 않는다. radial scale이 다른 cylinder, 임의 회전, extrude/boolean/fillet 등 다른 BRep feature는 지원 밖임을 알려준다. 부품 사이 가림·일반 HLR·내부 edge/숨은선·타원/spline은 구현하지 않았다.

각 뷰에 stable part ID, 모델 basis, 시트 origin/scale, output ID, 의미상 primitive source edge key를 저장한다. 이 key는 kernel의 임의 BRep edge identity와 다르다. 파생 출력은 **시트 XY** drawing이고 모델 투영 basis는 뷰 metadata에 별도로 보존한다. 원본 지름/폭/길이와 translation이 바뀌어도 correspondence가 같으면 drawing ID/topology를 유지한다. 원본이 사라지거나 방향 변경으로 edge 대응이 달라지면 이전 geometry를 보존하되 출력을 숨기고 unresolved로 만든다. 이때 측정·SVG/DXF export를 거부한다. 명시적 Review/rebind는 변경된 topology를 새 ID로 생성하며 가까운 edge로 조용히 대체하지 않는다.

소유된 drawing의 직접 Move/Delete/visibility 변경은 거부하고 source/view를 편집하도록 안내한다. 뷰 삭제는 그 출력도 제거한다. 출력 layer lock은 원본 변경과 재생성 전체를 원자적으로 거부한다. 부품목록/layer 변경은 새 뷰로 만들며 기존 뷰 재연결은 동일한 부품 집합을 유지한다.

## 출력·문서·이력

기존 G2 아트보드 렌더/SVG와 DXF drawing writer에 동일한 파생 geometry를 전달한다. 외부 SVG/DXF는 평탄한 geometry이며 모델 연관 metadata는 CAD JSON에 보존된다. 종이 축척·정렬·연관 치수 시트·PDF의 통합 작업은 **G6-D5**에서 마감한다. 분해도는 STEP에 반영되지 않는다. unresolved 뷰가 있으면 drawing export를 차단한다(DXF 객체 scope에서는 해당 출력만 검사).

modelPresentation이 있는 파일은 **v24**를 사용한다. 기존 v1–v23 읽기와 presentation 없는 문서의 최소 version 선택은 유지한다. stable parts·saved explosions·active display·projection output ownership을 저장/검증한다. source missing은 명시적 재연결을 위해 유지하지만 잘못된 output mapping은 파일 읽기에서 거부한다. detached Review, Cancel, stale rejection, Undo/Redo, 문서 new/open/recovery 경로까지 연결했다.

## 검수와 후속

Node와 native browser 결과는 연결된 JSON에 기록한다. 신규 browser는 실제 Ribbon/입력/Review/Apply·표시 위치 picking·원본 Properties 편집·STEP Worker·아트보드 SVG/DXF·실제 location.reload를 검수한다. 전체 browser suite와 대형 조립 성능 benchmark는 이번에 실행하지 않았다.

검수 중 기존 create-box의 기본 kind 처리, package named export, 동일 explosion 활성화가 amount 변경 batch를 취소하던 오류를 수정했다. 재열기 비교는 object key 삽입 순서 차이를 의미 차이로 판단하지 않도록 oracle을 정규화했다. 원본이 unresolved인 파생 geometry의 측정도 차단했다.

다음은 **X6-D1 → X6-D2 → G6-D4**이다. G6-D3의 일반 BRep adapter/HLR 확대와 G6-D5 시트/치수 계약은 별도 후속으로 남는다.
