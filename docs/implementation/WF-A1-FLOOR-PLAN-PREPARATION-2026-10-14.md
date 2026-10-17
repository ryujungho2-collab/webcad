# WF-A1 평면도 준비 — 첫 구현

> **현재 기능 설명:** [평면도와 건축 콘텐츠](../features/FLOOR-PLANNING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-14. [전체 작업 흐름과 후속 카드](../product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md).

## 사용

**Copilot → Prepare floor plan…** 또는 **File → Import DXF…**에서 파일을 고른다. 이 안내 경로는 로컬에서 동작하며 파일을 gateway에 전송하지 않는다. 기존 자연어 planner 전체 확장이 아니라 같은 가져오기 Review를 호출하는 실제 작업 진입점이다.

1. Import source layers에서 남길 레이어를 고른다. Suggest walls & openings는 wall/door/window/opening/벽/문/창/개구부 **이름 기반 후보**를 고르고 별도 잠긴 참조 모드를 켠다. 사용자가 목록을 확인한 후 확정한다. 의미 인식 모델이 아니다.
2. File 단위를 쓰거나 mm/cm/m/inch/foot로 재해석한다. CAD 내부 결과는 mm다. cm로 선언한 길이400을 mm로 재해석하면 실제400mm가 되므로, 무조건 mm override를 선택하지 말고 알려진 치수로 검산한다.
3. 기준점 world X/Y/Z를 **단위 변환 후 mm**로 입력하면 그 점을0,0,0으로 옮긴다. OCS rotation/scale을 적용한 root 배치에서 한 번만 이동한다. block definition의 좌표를 중복 이동하지 않는다.
4. 독립 TEXT 제외, 사용하지 않는 수입 정의/레이어 생략, 별도 CAD 참조 레이어 잠금을 선택하고 Review preparation을 누른다. 입력 중에는 geometry 재계산을 하지 않는다.
5. 변환된 geometry·제외/의존 목록·단위를 확인하고 Import reviewed DXF로 한 번에 적용한다. 원본파일과 기존 문서 레이어는 변경하지 않는다. Undo 한 번으로 새 레이어·정의·도형·transform·잠금 모두 되돌린다.

참조 모드는 원래 레이어 이름을 `CAD / 이름`으로 보이는 새 레이어로 분리한다. 기존 같은 이름 레이어가 있어도 재사용/잠금하지 않는다. Layers에서 표시/숨김/잠금을 바꿀 수 있다. 여러 레이어를 하나의 소유 그룹으로 만드는 기능은 WF-A2/CAN-A1 후속이다.

## 보존·실패·preview

- 필터는 최상위 DXF 엔티티에 적용한다. 선택한 INSERT의 하위 블록/레이어/TEXT는 구성 전체를 보존하며 dependency layers를 표시한다. 원본의 블록 내부를 조각내어 창호 일부를 잃게 하지 않는다.
- used-only는 최상위 선택 엔티티에서 도달 가능한 블록과 실제 사용하는 레이어만 수입한다. 기존 WebCAD 문서를 대상으로 하는 PURGE는 아직 아니다. parser의 미지원 엔티티 경고는 계속 명시적으로 확인한다.
- 설정 변경 즉시 이전 Apply를 차단하고 이전 geometry preview를 숨긴다. 새 source와 맞는 proposal만 적용한다. 빈 레이어 선택/잘못된 수치/사라진 레이어/변경된 document는 원본을 보존한다. Cancel 및 늦은 preview 응답은 proposal을 폐기한다.
- 기존 preview가 authoring 원점과 숨긴 정의 멤버를 표시하던 문제도 수정했다. 실제 transformed world-XY 투영으로 standalone과 INSERT를 같은 좌표에서 표시한다. 숨긴 definition 멤버는 중복 표시하지 않는다. 기울어진 객체의 edge-on 투영은 납작해질 수 있음을 표시하며 실제3D placement는 보존한다.
- parse 결과는 한 번 읽어 재사용한다. 아직 대형 DXF parser Worker/chunk 취소나 성능 예산 완료는 아니다.

## 변경 파일

- `apps/web/src/interop/dxfPreparation.ts`: 순수 레이어/단위/블록 도달성 준비·보고.
- `dxfImport.ts`: parsed planner, world root offset, isolated reference lock batch.
- `dxfParser.ts`: 정확 엔티티 unit scaling 함수 재사용.
- `DxfPreparationDialog.tsx`, `DxfReviewDialog.tsx`, `App.tsx`: 실제 UI·stale/draft 차단·월드 preview.
- `copilot/CopilotPanel.tsx`, `explorer/ExplorerPanel.tsx`: Copilot 안내 진입점.
- `ui/palette.css`: 준비 UI·스크롤·중립 색상·입력/버튼.
- `tests/dxfPreparation.test.ts`, `tests/dxfPreparation.browser.*`, `tests/helpers/floorPlanFixture.ts`: 단위·의존성·잠금·stale·Undo·실제 UI·재열기 fixture.
- `scripts/browserChecks.mjs`, `scripts/browserInput.mjs`: 명시적인 테스트 파일/산출물 allowlist.

## 검증

최종 실행 결과는 [검증 JSON](../verification/WF-A1-2026-10-14.json)에 기록한다. Node에서는 sparse bulge/OCS/중첩 배치·exact curve override·단위·원점·잠금·Undo/Redo·WebCAD serialization·DXF export를 확인한다. Native는 File/Copilot 진입, 물리 클릭/입력/실제 파일 chooser, 설정 변경·invalid 차단, cancel/Undo/Redo/portable reopen을 사용한다. 전체 CAD suite 또는 대규모 성능 완료로 확대하지 않는다.

[실제 준비 화면](../../output/images/floor-plan-preparation-2026-10-14.png), [native report](../../output/verification/floor-plan-preparation-native-report.json).

## 남은 구현

WF-C0+A2: 자연어 intent 계약, 기존 문서 PURGE, source receipt·역좌표, 기준점 pick·단위 검산.
WF-B1 이후: 수입 선의 gap/duplicate/비평면 진단·면 생성, 벽·연관 개구부·직전 높이 반복.
CAN/MEAS/CMP: Fill/Hug/absolute·상위 캔버스·비례 텍스트/선/반지름/효과 scale, 정확 hover 거리, 인스턴스 콘텐츠 슬롯.
네이티브 DWG/2010 save·SKP·3D Warehouse는 지원하지 않는다.
