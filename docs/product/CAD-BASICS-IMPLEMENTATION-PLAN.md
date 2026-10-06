# CAD 기본기 확장과 구현 단위 설계

갱신일: 2026-10-06. 구현 카드와 지원 경계를 정하는 문서다. **B3-A1/A2 및 B3-B는 구현·검수 완료**, 나머지 신규 카드는 계획이다. [G4·DXF·지름 실제 결과](../implementation/G4-CAD-BASICS-2026-10-06.md)를 따른다. 현재 지원 범위는 [CAD-BASICS](CAD-BASICS.md), 제품 전체 실행 큐는 [NEXT-STEPS](../../NEXT-STEPS.md), 세션 분할은 [WORK-SLICES](../WORK-SLICES-2026-10-06.md)가 소유한다.

목표는 기계·건축 사용자가 정확한 도면을 작성하고, 관련 형상을 수정하고, 출력까지 마치는 것이다. 명령 수뿐 아니라 같은 입력·미리보기·복구·결과 인계를 완료 기준으로 삼는다. 아래 카드의 전체를 구현했다는 뜻은 아니다.

## 1. 무엇을 구분하는가

| 구분 | 범위 | 실행 원칙 |
| --- | --- | --- |
| 기존 기능 보완 B0–B4 | 조작, 윤곽 구성·참조, 코너·Stretch, 치수·교환, 스케치 관계 | 기존 명령과 계산 경로를 확장. 미지원 조합을 먼저 특정 |
| 기본 3D 확대 B5 | 면 참조·작업면, 면 위 스케치, Cut/Hole/Shell | 면 ID·원본 재생성 계약을 먼저 확보하고 한 연산씩 추가 |
| 신규 객체·작성 방식 X | 원/호 작성 방식, 타원·Bezier·Spline·Polygon, 작도·UCS·클립보드·3D 패턴 | 새 geometry 종류와 기존 종류의 새 작성 방식을 구분. B 전체 완료를 일괄 선행 조건으로 두지 않음 |
| 제품 통합 G2–G6 | appearance, component variant, image, scene, Copilot, 외부 adapter | 동일 문서 객체·명령을 소비. CAD 전용/일러스트 전용 곡선 원본을 이중 생성하지 않음 |

도구별로 다음 지원 축을 따로 기록한다. “Polyline 지원”만으로 아래 조합이 모두 가능하다고 표시하지 않는다.

- **형상**: 선·열린/닫힌 다중선·bulge 호·원·호·추가 곡선.
- **소유권**: 일반 drawing / sketch / construction 결과 / pattern source·member / component definition·instance.
- **배치**: XY/XZ/YZ, 이동·회전·균일/비균일 스케일·반사, 후속 사용자 작업면.
- **참조**: point/endpoint/segment/curve/whole-span, 측정 치수·구동 치수, 작도 branch, pattern slot, projection/extrusion, scene object reference.
- **전달**: 편집·측정·스냅·JSON·DXF·SVG·PDF·STEP 중 정확 보존/명시적 근사/미지원.

각 셀은 `검증됨 / 구현 중 / 예정 / 명시적 거부`로 구분한다. 버튼 노출과 브라우저 검증, 자동 회귀와 실무자 평가도 분리한다.

## 2. 공통 실행·정밀도·저장 계약

```text
도구 검색·리본·직접 편집·Inspector·Copilot
  → 같은 command parameter / 대상과 소유권 확인
  → detached Preview: 기하 계산 → topology/reference remap → 관계 재생성
  → 대상·영향·오류·복구 Review
  → 같은 draft + 같은 문서 버전일 때 Apply
  → 한 transaction / 한 Undo → 결과 선택 → 다음 도구
```

- `commandInteraction`의 판정을 모든 UI 진입점에서 사용하고, 실제 명령 계층에서도 payload·잠금·참조·문서 버전을 검증한다. mouse와 숫자는 같은 parameter를 변경한다.
- Preview/Cancel/실패는 원본·History에 변경을 남기지 않는다. 실행 중 문서 교체·Undo·다른 입력·취소가 생기면 늦은 결과는 폐기한다. 잘못된 대상을 선택해도 가능한 경우 도구와 입력을 유지한다.
- 정밀 기준은 [Precision.ts](../../packages/cad-document/src/Precision.ts)의 mm, sketch rad, object rotation deg 및 `linearToleranceAt`를 따른다. 화면 px 스냅 반경, 계산 허용오차, 사용자가 지정한 가공 공차, 출력 반올림을 혼용하지 않는다.
- 모델의 정확한 곡선과 표시용 tessellation을 분리한다. 새 spline의 길이 등 수치 적분이 필요한 값은 알고리즘·오차 기준을 정하고 근거 없이 exact라고 표시하지 않는다.
- 변경되지 않은 identity를 보존하고 대체된 부분은 명시적으로 매핑한다. 서로 다른 source가 합쳐지거나 branch가 모호하면 사용자가 선택하기 전에는 적용하지 않는다. 자동으로 첫 조각/가까운 면을 선택하지 않는다.
- 새 저장 필드는 serializer/version gate뿐 아니라 publish, batch rollback, History, new/open/recovery, preview diff, fixture까지 함께 확인한다. Scene은 v12, 일반 지름 주석은 v13이다. 새 의미가 없는 문서는 기존 최소 버전을 유지한다.
- G4 Scene의 멤버·상태·링크·track도 source 교체 영향에 포함한다. 분할 결과의 대표 객체가 불명확하면 명시적 재연결 또는 거부한다. 장면 표시 좌표를 CAD 원본 좌표로 굳히지 않는다.

## 3. 실제 코드의 책임과 수정 지점

아래는 존재하는 진입점이다. 설계만을 위해 새 engine/registry 패키지를 선행 생성하거나 전체 폴더를 이동하지 않는다. 이미 두 경로에서 필요한 계약부터 공통화한다.

| 책임 | 우선 수정 위치 | 바뀌는 것 |
| --- | --- | --- |
| 저장 모델·정밀도 | [cad-document](../../packages/cad-document/src), 특히 Feature/Sketch/Construction/Precision/serialization | 원본 데이터, identity·관계·단위·호환성 |
| 공개 명령 | [commands.ts](../../packages/cad-commands/src/commands.ts), [validator.ts](../../packages/cad-commands/src/validator.ts) | 수동/자동 입력이 공통으로 사용할 지원 범위 |
| 정확한 2D 연산 | [drawing-editing/geometry](../../apps/web/src/features/drawing-editing/geometry), [precision](../../apps/web/src/precision) | 교점·Offset·코너·곡선·측정·solver. UI나 singleton 문서에 의존하지 않음 |
| 소유권·참조 교체 | [contourCommands](../../apps/web/src/features/drawing-editing/commands/contourCommands.ts), [contourReferences](../../apps/web/src/features/drawing-editing/commands/contourReferences.ts), [sketchContourReferences](../../apps/web/src/features/drawing-editing/commands/sketchContourReferences.ts) | 어떤 관계를 어느 결과에 보존·재연결할지 결정 |
| 재생성·게시 | [commandBus](../../apps/web/src/state/commandBus.ts), [featureRegeneration](../../apps/web/src/state/featureRegeneration.ts), [documentPlans](../../apps/web/src/state/documentPlans.ts), [dispatchCadCommand](../../apps/web/src/state/dispatchCadCommand.ts) | 전체 성공 후 게시·한 History, 실패 원자성 |
| 공통 UX | [CurveWorkbench](../../apps/web/src/features/drawing-editing/ui/CurveWorkbench.tsx), [BasicEditTool](../../apps/web/src/features/drawing-editing/ui/BasicEditTool.tsx), [ContourTool](../../apps/web/src/features/drawing-editing/ui/ContourTool.tsx), [CommandReview](../../apps/web/src/ui/CommandReview.tsx), [PrecisionField](../../apps/web/src/ui/PrecisionField.tsx) | 대상·숫자·영향·오류 복구·결과 인계 |
| 치수·도면 요소 | [dimensionGeometry](../../apps/web/src/precision/dimensionGeometry.ts), [dimensionSource](../../apps/web/src/precision/dimensionSource.ts), [dimensionRefresh](../../apps/web/src/state/dimensionRefresh.ts), [draftingGeometry](../../apps/web/src/precision/draftingGeometry.ts) | 표시 치수와 구동 치수 구별, 원본 변경 추적, 문자·해치·블록 |
| 3D | [cad-kernel/operations](../../packages/cad-kernel/src/operations), [웹 Worker 경계](../../apps/web/src/cad), [sketchProfiles](../../apps/web/src/precision/sketchProfiles.ts) | BRep 연산·취소·면/엣지 참조·재생성 |
| 파일 전달 | [interop](../../apps/web/src/interop), [export](../../apps/web/src/export), [plot](../../apps/web/src/plot) | 포맷별 정확도·단위·손실·축척 |

`FeatureContract`의 현재 용도는 표현·parameter·측정 계약이다. 새 도구 capability/ownership 규칙을 여기에 무조건 추가하지 말고 먼저 명령의 실제 검증 결과를 재사용한다. 장기 공유 엔진 추출은 기능 확장과 별도 검증 묶음이다.

## 4. B0–B5 구현 카드

표의 각 ID는 별도 요청으로 선택할 수 있는 계획이다. 위험이 큰 행은 적힌 하위 단위만 실행한다. `전체 회귀`는 해당 행의 코드가 있는 현재 작업 트리에서 실행해야 한다.

### B0 — 조작·입력의 일관성

| ID | 한 번에 끝낼 사용자 결과 | 완료 검사 / 경계 |
| --- | --- | --- |
| B0-A | 선택→숫자/그립→Enter/Esc→반복→Undo 흐름의 기존 결함을 재현하고 한 종류 수정 | 일반/sketch/pattern/component 대상의 차이, 겹친 선택, 잠금, 입력 focus를 실제 browser에서 확인. 새 전역 UI 재작성 제외 |
| B0-B | 길이/각도/상대·극좌표 입력과 drag가 같은 계산 결과를 만들기 | 빈 값·입력 중 부호·단위·범위·반올림, XY/XZ/YZ. 기존 parser 재사용, 적용 전 값 덮어쓰기 금지 |
| B0-C | 해치·문자·선두께·보조 형상의 보이기/잠금/출력 의미 정리 | Layer와 construction visibility를 혼동하지 않음. 현재 object order/selection/hit-test·출력 과제로 한 결함씩 처리 |

B0 전체를 끝내야 모든 기능을 시작할 수 있는 것은 아니다. 각 기능의 관련 기본 조작 검사를 먼저 실행하고 발견된 결함만 해당 묶음에 포함한다.

### B1 — 구성 편집과 참조 연속성

| ID | 한 번에 끝낼 사용자 결과 | 선행 / 완료 검사 |
| --- | --- | --- |
| B1-A | Break 후 남길 조각과 참조를 선택해 치수·작도를 유지 | 기존 Trim/Join remap 재사용. point/segment/whole-span·branch, missing/locked/ambiguous 실패. sketch/pattern 확대가 크면 일반→sketch→pattern으로 별도 요청 |
| B1-B | Explode한 선·호를 재편집해 Join하고 의존 관계 복원 | B1-A의 참조 정책, 정확한 bulge와 ID, projection/solid/scene 입력 확인. “관계 제거 후 실행”을 기본값으로 만들지 않음 |
| B1-C | 블록 인스턴스 하나를 해체해 일반 도형으로 편집 | 다른 instance/definition 보존. world transform·레이어·문자·appearance, 중첩 1단계/재귀 해체를 명시적으로 구분; 비균일 변환 불가 곡선은 거부 |
| B1-D | 다중선의 지정 변을 직선↔호로 바꾸고 접속점 유지 | 제어점/곡률과 topology remap. 스케치 소유 도형 확대는 B1-E. 길이/반지름 불가능 입력은 유지·복구 |
| B1-E | 스케치 정점·변 구성 편집 후 구속·구동 치수·돌출 갱신 | B1-A/B/D 정책과 solver. 직선 구성 먼저, mixed bulge는 별도 지원 단계로 검증 |
| B1-F | 해치·연속 치수·변수 바인딩을 source 교체에 재연결 | 참조 소비자 한 종류씩 F1 해치→F2 연속 치수→F3 바인딩. 수식의 parameter 의미가 바뀌면 명시적 재지정 |

G2에서 정의 수정·중첩 component는 이미 존재한다. B1-C는 그 기능을 새로 만드는 것이 아니라 **인스턴스 해체**다. definition 격리 편집과 property override/variant는 G4-B 쪽 과제로 남긴다.

### B2 — 수정 명령의 실제 대상 확대

| ID | 한 번에 끝낼 사용자 결과 | 선행 / 완료 검사 |
| --- | --- | --- |
| B2-A | 두 거리 D1/D2로 비대칭 Chamfer, preview에서 어느 변의 거리인지 확인 | 기존 직선 corner 경로. swap·반대 방향·예각/둔각·너무 큰 거리, 한 Undo |
| B2-B | line–arc Fillet에서 유지할 가지·접점 확인 후 적용 | 정확한 해석 접점·허용 구간·여러 해 선택. arc–arc는 B2-C로 분리 |
| B2-C | arc–arc Fillet/Chamfer와 닫힌 윤곽 수정 | B2-B. 두 코너 연산도 별도 요청; 내/외접·불가능 반지름·Offset 후 접속 검증 |
| B2-D | 교차 영역 Stretch에 포함된 블록의 이동 의미를 제어 | 완전 포함 instance의 rigid move 먼저. 일부 구성 요소 변형은 definition edit 또는 명시적 detach로 인계, 조용한 전역 definition 변경 금지 |
| B2-E | 스케치 Stretch가 구속을 유지하거나 충돌 이유 표시 | 기존 connected drag·solver. 자유점/고정점/구동 치수, 연쇄 재생성, preview와 Apply 일치 |
| B2-F | Lengthen에서 호 각도 입력과 목표 길이 입력을 연결 | 반지름 유지, sweep 방향·full-turn/zero-sweep 경계, 측정 길이와 독립 대조 |

임의 비균일 transform에서 원호 Offset을 무조건 지원한다고 설계하지 않는다. 원이 타원이 되는 경우 X2의 표현 계약이 먼저 필요하다. 원의 Extend처럼 자유 끝이 없는 조합은 별도 의미 정의 전까지 안내와 함께 거부한다.

### B3 — 치수·스냅·정밀 전달

| ID | 한 번에 끝낼 사용자 결과 | 선행 / 완료 검사 |
| --- | --- | --- |
| B3-A1 · 완료 | DXF bulge 정확한 입력·Explode/Join·재출력·재가져오기 | sparse/final/signed arc·R12 elevation·inch·회전/반사·독립 길이/반지름·저장/이력 검수. exact control vertices |
| B3-A2 · 완료 | 실제 Import review→편집→Export 흐름 | 포함/제외·단위·subset acknowledgement, 실제 native file input·download/reimport·stale/Cancel·한 Undo·전체 회귀 |
| B3-A3 | 필요한 non-default OCS·기울어진 평면의 교환 확대 | A1/A2의 명시적 미지원 목록에서 과제 선택. 사용자 작업면이 필요한 경로는 B5-A/X5와 연결 |
| B3-B · 완료 | 원/허용 호의 일반 지름 치수 생성·leader 각도 재배치·source 변경 추적 | Ø·2r·양끝 화살표·deg/rad·source scale·Trim/Join edge remap·잠금 복구·v13·DXF TEXT. driver와 구별. canvas 주석 핸들은 후속 |
| B3-C | 두 선/변의 일반 각도 치수와 측정 가지 선택 | 같은 작업면, 교차 밖 연장·0/180°·평행·내각/외각, 원본 회전 후 측정, radians/degrees 변환 |
| B3-D | 선형/반지름/지름/각도/연속 치수의 공통 스타일 | D1 단위·자릿수→D2 글자/화살표/간격·종이 축척 별도 요청. 스타일 편집이 geometry/driver 값을 바꾸지 않음 |
| B3-E | 스냅 추적점 획득·해제·일시 억제와 방향 잠금 | transient UI state, 문서 저장/구속과 구별. 원본 삭제/숨김/문서 교체 시 해제, 정확 입력 우선순위 |
| B3-F | 복수 추적선 교점과 후보 전환 | B3-E. 후보 우선순위·기호/원본 표시·zoom 독립 픽셀 반경, 잡히지 않는 이유·해제 안내 |

#### B3-C의 작은 실행 단위 (아직 미구현)

G5-A 검수 다음에 일반 각도 주석을 시작한다. 기존 sketch angle constraint는 구동 치수이고 이 카드는 일반 주석이다. solver의 구동 각도 범위를 확대하지 않는다. 현재 일반 치수는 sourceObjectId/sourceSegmentId 한 쌍과 한 source input을 전제로 하므로, 두 선을 측정하는 기능을 renderer에만 추가해서는 완료할 수 없다.

| 하위 ID | 한 요청의 범위 | 다음 단계로 넘길 계약 |
| --- | --- | --- |
| B3-C1 | 순수 측정·표시 기하와 branch 계약, 독립 Node 검사 | 같은 XY/XZ/YZ 평면의 두 유효 직선/직선 변. 교점이 선분 밖에 있어도 supporting line으로 계산. 원호/bulge 변·퇴화·다른 평면 거부. 방향/끝점 순서와 내각·외각의 명시적인 측정 가지, 0/180° 및 평행/공선의 처리 정책을 확정. rad 계산·deg 표시·허용오차. 공개 도구·schema 추가 없음 |
| B3-C2a | typed create/update, 두 source/edge 참조와 refresh·history | C1. 각 source의 stable topology identity와 branch를 저장. 원본 회전/치수 수정 뒤 재측정, detached preview 불변성·실패 원자성·한 Undo. source 소멸/평면 변경 정책을 숨기지 않고 기존 일반 치수 동결 정책과 비교해 확정. UI 미완료로 기록 |
| B3-C2b | Trim/Join 참조 재연결·serialization·재로드 | C2a. 두 source를 각각 remap하며 모호한 변을 임의 선택하지 않음. 잠긴 downstream 치수와 삭제/원형 변 교체의 원자성. 새 의미가 있는 문서의 최소 버전 결정, 기존 v13 이하 호환·위장 downgrade 거부·reload/recompute 검사 |
| B3-C3 | 대상 2개/변 선택·측정 가지·표시 위치·Review/Apply 및 출력 | C2b. 검색/리본/우클릭의 같은 명칭, 공통 canApply·PrecisionField·영향/오류/복구·result handoff. 실제 browser Cancel/stale/Undo/Redo/저장, 원본 수정→치수 갱신과 DXF TEXT·기존 CAD SVG/PDF 출력 확인. 전체 Node/browser·타입·architecture·build 후 B3-C 완료 판단 |

C1/C2는 중간 구현이며 B3-C 지원표를 완료로 올리지 않는다. 최종 사용자 경로는 `두 선/변 선택 → 각도 주석 → 측정 가지·위치 review → Apply → 원본 회전/Trim/Join → 자동 갱신 → 저장/출력`이다. driving dimension, arc tangent angle, Leader/공통 style은 별도 카드로 유지한다. 실행할 세션과 검증 수치는 WORK-SLICES/PROJECT-STATE가 소유한다.

기존 `B3-A`는 A1–A3의 상위 이름으로 유지한다. A1/A2의 지원 범위가 검증되면 기본 왕복 묶음을 완료로 표시할 수 있으나, A3의 미지원 평면까지 지원한다고 적지 않는다.

### B4 — 호를 포함한 스케치 관계

| ID | 한 번에 끝낼 사용자 결과 | 선행 / 완료 검사 |
| --- | --- | --- |
| B4-A | point-on-arc가 원 둘레뿐 아니라 실제 호 구간을 유지 | parameter/branch·끝점 포함 규칙, wrap-around·퇴화, solver residual과 DOF, drag/수치 동일 |
| B4-B | line–arc 접선이 실제 접점·구간을 만족 | B4-A. 기존 line–circle의 무한원 조건을 그대로 쓰지 않음. 접점 branch·잠금·불가능 입력 |
| B4-C | arc–arc 및 arc–circle 접선 관계 | B4-B의 의미 재사용. 내/외접·접점 소멸·치수 편집·돌출까지 검증 |
| B4-D | 자동 접선 후보를 보고 명시적으로 영구 구속으로 확정 | B4-A/B/C 지원 대상만. 일시 스냅과 영구 constraint를 분리, 과구속 진단·취소 |

### B5 — 면 참조부터 기본 솔리드 작업까지

| ID | 한 번에 끝낼 사용자 결과 | 선행 / 완료 검사 |
| --- | --- | --- |
| B5-A1 | 사용자 작업면의 origin·basis·normal과 좌표 변환 계약 | 기존 XY/XZ/YZ 저장 호환. 재사용 가능한 frame을 정의하되 바로 모든 도구를 강제 전환하지 않음 |
| B5-A2 | planar face에 붙는 frame과 안정적인 source 참조 | A1, face identity·모호/소멸 복구. 가장 가까운 다른 면으로 자동 이동 금지 |
| B5-B | 면에서 스케치→치수→projection→돌출, 원본 수정 후 따라가기 | A2, B4 중 필요한 관계. 비평면은 안내하고 거부. 면 참조 복구와 save/reload |
| B5-C | 프로파일의 돌출 절삭을 한 reviewed command로 실행 | 기존 Extrude/Boolean 계산 재사용, source/tool ownership·깊이/방향·through 조건. 내부 두 작업이 두 Undo가 되지 않음 |
| B5-D | 정확한 위치·지름·깊이의 기본 Hole | C·면 참조. 초기 원통형 구멍부터, 관통/막힌 구멍을 단계 구분. 나사/counterbore는 별도 추가 |
| B5-E | 제거할 면과 두께를 지정하는 Shell | 면 참조·커널 유효성·최소 형상 조건. 불가능 두께/자기 교차/면 분기에서 원자적 거부 |

각 3D 단계는 원본 치수 변경 뒤 재생성, 독립적인 체적/면적·유효성, Undo/Redo, 저장·STEP 결과를 확인한다. 새 Hole/Shell feature가 필요하면 type·kernel protocol·regeneration·measurement·export의 기존 solid 종류 분기를 모두 점검한다.

## 5. 기본기 밖으로 밀려나지 않도록 남겨 둘 확장 X

X는 계획 구분자이며 새 모듈이나 별도 기하 엔진의 이름이 아니다. 각 하위 항목도 한 요청씩 실행한다.

| ID | 확장 범위 | 필수 선행·정확도 경계 |
| --- | --- | --- |
| X1 | X1-A 3점 원/호 → X1-B 두점+반지름/접선 작성 → X1-C 정다각형 | 기존 circle/arc/polyline 원본 재사용. 공선·해 없음·복수 branch, 작성 방식만 달라도 동일한 편집/치수 경로 |
| X2 | X2-A Ellipse → X2-B Bezier → X2-C Spline/NURBS | 각각 schema/evaluate/bounds/hit-test/snap/measure/serialize 먼저, 공개 UI·정밀 핸들·import/export까지 같은 묶음의 완료 기준. solver·Offset·Boolean 지원은 별도 matrix 셀 |
| X3 | X3-A 작도 정의 재지정 → X3-B 원–원/곡선 교점 → X3-C 각 이등분선·외접원·내접원 | 기존 dependency graph·expression 유지. 기존 branch가 사라지면 오류와 재지정, 좌표만 저장하지 않음. 이후 자취/함수/벡터·Euclidean 제한 모드 별도 |
| X4 | X4-A 문서 내부 기준점 clipboard → X4-B 문서 간 붙여넣기 | 새 IDs와 dependency closure·asset/definition remap, 잠금·외부 참조·원본 누락 정책. JSON/command로 복사하며 render mesh를 원본으로 복사하지 않음 |
| X5 | 명명된 UCS 저장·전환과 작업면 기반 작성·수정 확대 | B5-A1 공유. 단일 UCS pilot 도구부터, viewport 이동과 문서 객체 변환 구별. 모든 기존 도구에 별도 좌표 계산을 복제하지 않음 |
| X6 | X6-A 3D Mirror → X6-B Linear Pattern → X6-C Radial Pattern → Section | 기존 2D recipe/slot 의미와 BRep geometry 경계를 연결. negative transform 방향·solid validity·source 편집, 기존 2D 인스턴스를 mesh 복제로 대체하지 않음 |
| X7 | Leader·좌표/면적/호 길이 치수·측정 결과 인계, 문자 편집 확대 | B3의 source/style/단위 계약 재사용. 항목별로 일반 주석과 driving 제약 지원을 구분 |

평면 Boolean/Shape Builder·compound path는 X2와 G2 벡터 편집의 공동 과제다. 정확한 curve source와 fill rule·허용오차를 먼저 정하고 직선 윤곽→원호→새 곡선 순서로 나눈다. mesh 편집·BIM·협업은 [PRODUCT-ROADMAP](PRODUCT-ROADMAP.md)의 별도 단계이며 CAD 기본 묶음의 완료를 무한히 늘리는 조건으로 쓰지 않는다.

## 6. 첫 구현 B3-A1의 구체 계약

사용자 흐름은 `외부 곡선 DXF → 원본 선/호 윤곽 → 측정·수정 → DXF → 다시 열기`다. LWPOLYLINE과 지원 2D POLYLINE의 직선/bulge 열린·닫힌 윤곽에 아래 계약을 구현했다. 이전 reader의 bulge 제외와 writer의 sample-point 출력을 양쪽에서 교체했다. 추가 OCS/width/mesh 등 미지원 의미는 명시적 제외다.

1. parser는 순서 있는 vertex 레코드로 선택적 bulge를 해당 정점에 귀속시킨다. 누락된 bulge를 앞당겨 다른 변에 붙이지 않는다. 잘못된 숫자·중복/부족 좌표·퇴화 변·지원 불가 mesh/width/extrusion 의미는 조용히 0으로 바꾸지 않는다.
2. import는 좌표/길이에만 단위 배율을 적용하고 bulge와 각도 의미를 보존한다. 닫힌 윤곽의 마지막 변, 중복 닫힘 정점, 반사에 따른 방향을 별도 fixture로 검증한다. 생성은 기존 공개 명령의 한 batch다.
3. export는 exact control points/arc 의미에서 작성한다. 이동·평면 내 회전·균일 scale·허용 반사의 결과를 동일 원호로 전달한다. 비균일 scale/OCS 등 아직 정확히 표현할 수 없는 조합은 구체적인 미지원 대상으로 알린다.
4. 가져오기에서 일부 미지원 entity가 있으면 포함/제외 목록과 단위를 먼저 검토한다. 사용자가 검토한 지원 subset을 가져오는 정책과 실행 도중의 partial mutation은 구분한다. 실패한 명령 batch는 전체를 되돌린다.
5. round-trip 검사는 writer와 reader가 공유하는 오류를 놓치지 않도록 raw group-code fixture·독립 중심/반지름/끝점/호 길이·닫힌 면적을 함께 사용한다. 적어도 mm와 inch, 양/음 bulge, sparse bulge, 폐곡선 마지막 호, 회전/반사를 포함한다.
6. Node 통과만으로 사용자 완료를 보고하지 않는다. A2에서 실제 파일 선택·미리보기·Apply·내려받기·재가져오기와 Undo/Redo를 확인하고, 미지원 평면은 A3에 정확하게 남긴다.

구현 위치는 [dxfParser](../../apps/web/src/interop/dxfParser.ts), [dxfImport](../../apps/web/src/interop/dxfImport.ts), [dxfWriter](../../apps/web/src/interop/dxfWriter.ts), [DxfReviewDialog](../../apps/web/src/interop/DxfReviewDialog.tsx)다. Autodesk 공식 group codes·raw fixture·독립 기하 검수와 지원 한계는 [실제 기록](../implementation/G4-CAD-BASICS-2026-10-06.md)에 있다. 다른 CAD 앱에서의 외부 파일 교환 평가는 별도로 남는다.

## 7. 우선순위와 통합 과제

G3-5A/I1, G4-A 및 G4-B/C의 첫 범위, CAD B3-A1/A2/B는 마감했다. **다음 CAD 카드는 B3-C 일반 각도 치수**, G5-A 등과의 교차 순서는 NEXT-STEPS를 따른다. B0의 해당 기본 조작을 각 묶음의 선행 회귀로 사용한다.

다음 CAD 우선 후보는 `B1-A/B → B2-A → B4-A/B → B3-D/E/F`다. X1과 작도 재지정은 해당 사용자 과제가 필요할 때 독립 실행할 수 있다. B5-A1 이후 면 참조·3D 단계는 단계별 선행 조건을 충족해야 한다. 큰 solver/topology/schema 변경 두 종류를 같은 요청에 묶지 않는다.

| 실제 과제 | 통합 확인 | 관련 카드 |
| --- | --- | --- |
| 외부 기계 윤곽 | DXF bulge→Break/Fillet→Join→지름/각도 치수→재출력 | B3-A/B/C, B1-A/B, B2-A/B |
| 건축 평면 수정 | 벽 Offset→개구부 Trim→블록 배치/해체→Stretch→연속 치수→축척 PDF | B1-C/F, B2-D/E, B3-D, 기존 Offset/Trim |
| 접선 프로파일 | line/arc→치수/접선→제어된 drag→projection→extrude | B4-A/B/C, B1-E |
| 부품 수정 | source 치수→face sketch→Cut/Hole/Shell→STEP | B5-A1..E |
| 통합 제작 인계 | CAD 원본 수정→component/scene 관계 확인→보드 출력→같은 명령의 Copilot review | B1 참조 정책, G2/G4/G5 |

모든 과제는 성공뿐 아니라 invalid input, missing/ambiguous reference, locked layer/member, Cancel, stale preview, Undo→Redo, save→reload→recompute를 포함한다. geometry-only snapshot 대신 관계·ID·문서 전체와 history까지 대조한다.

## 8. 완료·분할·기록 방법

한 구현 요청은 **카드 하나의 지원 조합 + 공통 UX + 영속성/관계 + 관련 검증**까지를 기본 단위로 한다. parser-only 또는 UI-only 중간 작업은 `구현 중`으로 남기고 최종 완료 조건을 축소하지 않는다. 문제가 커지면 다음 하위 ID와 재현 테스트를 남기며 멈추고, 다른 기능을 추가로 시작하지 않는다.

기능 수정 중 관련 Node와 해당 native browser workflow를 먼저 실행한다. 카드를 완료로 올릴 때는 다음을 현재 작업 트리에서 실행한다. 새 browser 페이지는 runner에 등록한다.

```sh
pnpm --filter @agent-webcad/web exec tsc -b
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web check:architecture
pnpm --filter @agent-webcad/web test:browser
pnpm build
```

지연을 고쳤다는 주장은 같은 fixture의 반복 전후 측정으로 뒷받침한다. renderer/Worker 시간과 사용자 작업 시간, 추정 bytes와 실제 heap/VRAM을 구분한다. 문서만 수정한 이번 작업은 architecture/링크 검사만 실행하며 이전 기능 테스트 수를 새 실행 결과로 올리지 않는다.

후속 요청 템플릿:

```text
CAD-BASICS-IMPLEMENTATION-PLAN.md의 [카드 ID]만 구현·검증하고 기록 후 멈춰.
PROJECT-STATE와 NEXT-STEPS에서 선행 조건 및 dirty worktree를 먼저 확인해.
기존 command/preview/remap/solver/History를 재사용하고 대상·미지원 조합을 먼저 확정해.
기하를 단순화하거나 테스트를 약화하지 말고 실제 클릭/숫자·저장/Undo·실패 원자성을 검사해.
실행한 검사와 미실행 검사를 구분하고 CAD-BASICS 지원표, 구현/검수 기록,
PROJECT-STATE, NEXT-STEPS를 실제 결과에 맞게 갱신해. 다음 카드를 자동 시작하지 마.
```

문서 책임: 이 파일은 카드·선행 조건·설계 경계, CAD-BASICS는 실제 지원표, WORK-SLICES는 세션 크기, NEXT-STEPS는 실행 순서, PROJECT-STATE는 실제 구현·검증 상태, implementation/verification은 근거를 소유한다. 같은 카드 목록을 여러 파일에 복제하지 않는다.
