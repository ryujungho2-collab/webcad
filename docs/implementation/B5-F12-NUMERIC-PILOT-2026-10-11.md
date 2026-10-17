# B5-F1 → B5-F2 — 수치 편집 pilot

> **현재 기능 설명:** [솔리드 모델링](../features/SOLID-MODELING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-11. cylinder 원본 → 기존 sketch driver/변수 → 돌출 distance 경로를 구현·검수했다. [마감 증거](../verification/B3-A4-B5-F12-CLOSEOUT-2026-10-11.json).

B5-F1: 단일 cylinder Inspector의 Dimensions에서 Diameter Ø/Radius R와 Length를 입력한다. mm/cm/m/in/ft를 허용하며 모드를 바꿀 때 현재 draft의 물리 크기를 유지한다. Review에서 정규화한 parameter 값과 실제 Worker의 before/after volume, 종속 객체 영향을 확인한다. Apply는 검토한 동일 proposal을 한 번 게시하고 한 Undo에 묶는다. draft 변경·선택/문서 변경은 proposal을 폐기한다. 오류 입력은 draft를 유지하고 설명한다. 숨겨진 Boolean 원본도 편집 가능하며 잠긴 종속 결과는 원본과 결과를 함께 거부한다. 복제된 독립 원본은 변경하지 않는다.

B5-F2: 기존 sketch Inspector/canvas driver 편집을 재사용한다. radius/diameter driver에 R/Ø/⌀ prefix와 길이 단위를 허용하고 driver kind/ID는 유지한다. Constraint Review에 실제 연결된 solid의 volume을 표시한다. 구동 치수와 표시 주석의 차이를 Inspector에서 설명한다. 변수에 묶인 Inspector 값은 직접 덮어쓰지 않고 기존 Edit variables 흐름으로 이동한다. 기존 Variables Review가 expression·종속 값·체적·Apply/Undo를 담당한다. 단일 extrusion Inspector distance는 F1과 같은 Review/Apply로 변경하며 음수 거리를 허용한다. sketch 변화는 연결된 projection/live extrusion만 재생성한다.

지원 경계: cylinder 단일 선택, 기존 numeric sketch constraints/variables, 기존 extrusion distance다. 임의 BRep 측정값을 driver로 승격하거나 여러 primitive의 수치를 동시에 검토하는 기능은 포함하지 않는다. 다중 primitive와 다른 primitive의 기존 편집 동작은 유지한다. 표준/면 sketch 구속·변수·돌출은 기존 명령의 지원 경계를 따른다. 새 numeric Review는 수치·체적·영향 목록을 표시하며 solid ghost mesh를 추가하지 않는다. sketch solved geometry preview는 기존 canvas에 표시한다. source binding을 제거하지 않으며 부착 face 소멸은 기존 명시적 rebind 정책을 따른다.

구현 위치: `properties/NumericModelEdit.tsx`, `PropertiesPanel.tsx`, `SketchInspector.tsx`, `precision/sketchAnnotations.ts`. 기존 `previewCadCommand → applyCadPlan`, source parameter regeneration, Variables UI, JSON/STEP를 재사용한다.

신규 Node 6 tests, 실제 Edge/CDP numericPilot 21 checks. 단위·모드 전환·invalid/stale·연결/독립 모델·잠긴 종속 결과·한 Undo/Redo·재열기·실제 STEP Worker export를 검수했다. 기존 variablesWorkflow 20 checks도 통과했다.
