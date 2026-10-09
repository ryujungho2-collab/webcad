# B2-A2 — 내부 코너 두 거리 모따기

2026-10-09. 대상은 **독립 polyline/rectangle의 두 직선이 만나는 내부 코너**다. 두 독립 윤곽의 자유 끝부분을 잇는 [B2-A1](B2-A1-ASYMMETRIC-CHAMFER-2026-10-09.md)과 구별한다. 최신 전체 검수는 [PROJECT-STATE](../../PROJECT-STATE.md), 실행 큐는 [NEXT-STEPS](../../NEXT-STEPS.md)가 소유한다.

## 이전 문제 → 변경

Properties의 내부 Chamfer는 한 숫자로 양쪽을 잘라 즉시 적용했다. 어느 변에 어떤 값을 쓰는지와 연결 치수·돌출의 영향을 적용 전에 검토하기 어려웠다. 또한 기존 코너 계산이 다른 변의 bulge·arc kind·curve ID를 지워 직선으로 바꾸는 문제를 발견했다.

- `edit-drawing-corner.secondDistance`를 추가했다. `distance`는 이전 변 D1, `secondDistance`는 다음 변 D2이며 생략하면 D1과 같다. Fillet에 D2를 전달하면 payload를 거부한다.
- `distanceSpace: "world"`는 월드 mm를 균일한 작업면 스케일로 나눠 같은 순수 코너 계산에 전달한다. 생략한 기존 명령은 model 단위를 유지한다. 새 Chamfer UI는 world 계약을 명시한다.
- 원래 control ID는 이전 변의 잘린 접점에 남기고 새 control/connector ID를 만든다. 이전·다음 변 및 다른 변의 ID·bulge·arc kind와 curve ID를 보존한다. 새 모따기 recipe를 저장하는 기능은 아니다.
- Offset의 해석 교점·겹침·면적 검사를 코너 결과에서도 재사용한다. 열린 윤곽의 새 자체 교차도 거부한다. 원호를 샘플링해 직선으로 대체하지 않는다.
- `CornerTool`이 `PrecisionField`, `CommandReview`, `commandInteraction`, detached plan을 사용한다. 현재 draft와 reviewed key가 다르거나 원본 버전/잠금이 바뀌면 Apply/Enter가 막힌다. 패널 body만 스크롤하고 Fit/Apply/Cancel footer는 남긴다.
- Properties hover 정리는 검토 세션을 닫지 않는다. 검토 중 캔버스 그립과 다른 도면 편집 pointer 경로를 차단한다. 도구 전환/문서 초기화는 세션을 정리한다.

## 실제 사용자 흐름

`2D → 윤곽 선택 → Direct로 코너 선택 → Properties Chamfer → D1/D2 단위 입력 → Swap/Equal → Fit 및 캔버스 거리선 → 영향 검토 → 오류 수정 → Apply/Enter → 수정 윤곽 선택 → 다음 CAD 작업`

황색 D1은 코너에서 이전 변의 접점까지, 청색 D2는 다음 변의 접점까지다. 초록색은 검토된 결과와 영향받는 drawing path, 점선 황색은 원본이다. Impact review는 치수·돌출 등 변경된 관계의 종류와 객체를 보여 준다. 내부 ID는 reference diagnostics에 둔다.

D1/D2가 변 전체를 소모하면 해당 거리와 변을 명시한다. 잘못된 단위, 잠금, 비균일 스케일, 퇴화·자체 교차, 인접 호는 입력/대상을 유지한 상태로 오류를 표시한다. 잠금을 풀면 같은 입력으로 재검토한다. Cancel은 문서와 History를 바꾸지 않고 캔버스에 포커스를 돌려준다.

성공 시 기존 contour ID가 선택되고 현재 대상에 맞는 `Edit result vertices`, `Dimension result`, `Pattern result`, `Extrude result` 등의 기존 인계 동작을 제공한다. 연결된 일반 edge 치수·각도 치수와 live profile/extrusion은 동일 transaction에서 갱신된다. 한 Undo/Redo가 전체를 복원한다.

## 코드와 검증 소유권

| 역할 | 위치 |
| --- | --- |
| 공개 명령/검증 | `packages/cad-commands/src/commands.ts`, `validator.ts` |
| 정확한 코너·월드 거리 변환 | `apps/web/src/features/drawing-editing/geometry/drawingOperations.ts` |
| 해석 자체 교차/겹침 검사 | `apps/web/src/features/drawing-editing/geometry/curvedOffset.ts` |
| 문서 정책/commit | `features/drawing-editing/commands/registerDrawingCommandHandlers.ts` |
| 검토·입력·오류·인계 | `features/drawing-editing/ui/CornerTool.tsx` |
| 진입/세션/캔버스 | `properties/PropertiesPanel.tsx`, `App.tsx`, `viewport/CadViewport.tsx`, `cornerPreview.ts` |
| 관계/정확성 regression | `apps/web/tests/drawing-editing/internalChamfer.test.ts` |
| 실제 React/Edge native pointer·keyboard/Worker | `apps/web/tests/internalChamfer.browser.{html,tsx}`, `scripts/browserChecks.mjs` |

Node 검사는 35°/125° 코너의 코사인 법칙, 첫/닫는 코너의 순서, 상승된 XY/XZ/YZ의 회전·반사·스케일, 비편집 점의 월드 위치, 기존 대칭/local 동작, 영향 없는 원호, 거리 소모·교차·잠금·경합 원자성을 검사한다. 연관 edge 길이/각도와 실제 Worker solid를 독립 oracle로 확인한다. 20×10 mm 직사각형의 D1=3/D2=7, 높이 5 mm에서 체적은 `(200−3×7/2)×5 = 947.5 mm³`다.

브라우저 검사는 native hit testing으로 코너를 선택해 입력·거리선·영향 review·Swap/Equal·오류 복구·즉시 draft 무효화·Cancel·잠금/Enter·결과 선택/인계·v14 reload·Undo/Redo를 수행한다. Serialization 버전은 v14를 유지한다.

## 남은 경계

- Sketch 소유 윤곽, derived construction, pattern instance의 코너는 소유 도구로 편집한다. standalone pattern source를 수정하는 경로와 구별한다.
- 편집할 코너의 인접 호는 미지원이다. 다른 코너의 기존 원호는 보존한다. line–arc는 B2-B, arc–arc는 B2-C다.
- world 거리 UI는 균일한 작업면 스케일을 요구한다. 기존 local 명령의 단위는 바꾸지 않는다.
- 모따기 recipe를 다시 여는 영속 정의, 스케치 구속 재작성, 3D 비대칭 Chamfer는 추가하지 않았다.
- 영향 review는 변경 요약과 drawing path다. 새 돌출의 전체 3D transient mesh를 별도로 표시하는 패널은 아니다.
- 큰 문서 latency·실사용 GPU·동시 사용자·실무자 작업 시간 benchmark는 이번 범위에서 실행하지 않았다. 생산 build 크기 비교만 전체 검수 기록에 남긴다.
