# CAD 확장 X 구현 계획 검토

2026-10-10. B5-E 완료 뒤 현재 소스와 X1–X7 계획을 대조했다. 이 문서는 구현 순서와 완료 조건을 보완한 계획이며, 아래 신규 카드의 구현 완료를 의미하지 않는다.

이후 **X1-A/C·X1-B1·X3-A·X3-B1을 구현·검수했다**. 현재 지원 범위는 [3점 원·호 구현](../implementation/X1-A-THREE-POINT-CURVES-2026-10-10.md), [정다각형 작성](../implementation/X1-C-REGULAR-POLYGON-2026-10-10.md), [두 끝점+반지름 원호](../implementation/X1-B1-ENDPOINT-RADIUS-ARC-2026-10-10.md), [작도 정의 재지정](../implementation/X3-A-CONSTRUCTION-REASSIGNMENT-2026-10-10.md), [원/호 교점](../implementation/X3-B1-CIRCULAR-INTERSECTIONS-2026-10-10.md), 상태는 [NEXT-STEPS](../../NEXT-STEPS.md)가 소유한다. 후속 X1-B2/B3·X4-A1·X5-A/B pilot도 [구현](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md)했다. X4-A2·X5-C 등 나머지는 계획 상태다.

## 검토 결론과 현재 근거

기존 X의 방향은 유지하되 신규 geometry, 입력 방식, 참조 편집, 문서 복사, 좌표계와 BRep 패턴을 각각 분리한다. X 번호는 반드시 실행 순서를 뜻하지 않는다. X2 전체 완료를 다른 X의 선행 조건으로 두지 않는다.

| 영역 | 확인한 현재 코드 | 계획에서 보완할 부분 |
| --- | --- | --- |
| X1 작성 | [Sketch](../../packages/cad-document/src/Sketch.ts), [명령](../../packages/cad-commands/src/commands.ts)에 circle/arc/polyline과 standalone/sketch 생성 경로가 있다 | 작성 방식별 계산과 세션을 추가하되 새로운 도형 종류를 만들지 않는다. standalone과 sketch 완료를 따로 검증한다 |
| X2 곡선 | [FeatureContract](../../packages/cad-document/src/FeatureContract.ts), Sketch, [렌더](../../apps/web/src/viewport/drawingRenderer.ts)의 지원 곡선은 선·원·호·polyline이다. 이미지의 ellipse mask는 CAD ellipse가 아니다 | exact source, parameter domain, stable node/segment identity와 지원 matrix가 먼저 필요하다 |
| X3 작도 | [Construction](../../packages/cad-document/src/Construction.ts), [계산](../../apps/web/src/precision/constructionGeometry.ts), [명령](../../apps/web/src/state/constructionCommands.ts)은 live 작성과 직선–직선/원·호 교점을 제공한다 | X3-A가 공개 재지정 명령/UI를 제공하고 X3-B1은 원–원/호의 중심선 signed branch를 별도로 저장한다. 신규 곡선의 branch identity는 해당 X2 이후 정한다 |
| X4 복사 | [duplicate-object](../../apps/web/src/state/commandBus.ts)는 새 객체 ID와 독립 snapshot을 만든다 | 기준점 clipboard와 여러 종류의 관계 closure/remap은 별도 구현이다. 기존 Copy 도구를 clipboard 완료로 간주하지 않는다 |
| X5 좌표계 | [WorkPlane](../../packages/cad-document/src/WorkPlane.ts)에 명명된 임의 frame이 있으나 [workPlane](../../apps/web/src/precision/workPlane.ts), Sketch와 [pointInput](../../apps/web/src/precision/pointInput.ts)은 기본 평면/2D 입력 계약을 사용한다 | 저장된 frame과 활성 작성 좌표계, 카메라 모델 뷰를 구별하고 pilot 도구부터 연결한다 |
| X6 패턴 | [Pattern](../../packages/cad-document/src/Pattern.ts)의 recipe와 검증은 drawing·2D 평면 전용이다. [커널 transform](../../packages/cad-kernel/src/operations/transforms.ts)은 일반 transform 경로가 있다 | 기존 pattern 타입을 그대로 solid에 붙이지 않는다. 커널 transform 존재만으로 반사·단면 지원이 완료된 것도 아니다 |
| X7 주석 | [측정](../../apps/web/src/precision/measurements.ts), [치수 갱신](../../apps/web/src/state/dimensionRefresh.ts)의 길이/면적·치수 기반이 있다 | 측정 수치 표시, live 일반 주석, driving solver를 각각 구분하고 종류별 카드를 만든다 |

## 권장 실행 순서

1. **X1-A → X1-C → X3-A → X3-B1**: 기존 도형과 그래프를 재사용해 3점 작성·정다각형·작도 재지정·원–원 교점부터 완성한다.
2. **X1-B1 → X1-B2 → X1-B3 → X3-C1/C2/C3**: 복수 해 선택과 live 작도 범위를 확대한다. X1은 작성 시점의 값, X3는 저장된 입력 참조를 따른다는 차이를 유지한다.
3. **X5-A → X5-B → X6-A → X6-B → X6-C**: B5 작업면 기반을 활성 좌표계에 연결하고 부품 배치·반사·배열을 만든다. X6-A/B/C의 world 좌표 수치 명령은 X5 전체 완료 없이 구현할 수 있다.
4. **X4-A1 → X4-A2 → X4-B**, **X7-A/B/C/D/E**: 재사용과 도면 인계를 확대한다. 앞 단계 전체 완료를 요구하지 않고 각 카드의 선행 계약만 충족하면 진행한다.
5. **X2-A → X2-B → X2-C1 → X2-C2**, 그 뒤 **X3-B2/B3**: 새 곡선은 별도의 큰 작업 흐름으로 진행한다. 전체 solver 교체나 모든 곡선 Offset 지원을 최초 객체 작성과 묶지 않는다.
6. **X6-D1 → X6-D2**, **X5-C**: 화면 단면과 실제 단면 도형, 더 많은 도구의 임의 좌표계 지원을 각각 확대한다.

제품 과제로 우선순위를 바꾸어도 된다. X1-A/C·X1-B1·X3-A·X3-B1은 완료했으며 X1-B2/B3·X4-A1·X5-A/B pilot까지 완료했으며 다음 제품 실행은 **G6-D1**이다. [후속 구현 검토](CAD-X-NEXT-IMPLEMENTATION-REVIEW-2026-10-10.md)에 재사용 경로·시작 접선 방향·퇴화 판정·완료 조건을 정리했다. X3-B 전체는 부분 완료이며 B2/B3는 해당 X2 원본 계약이 선행한다.

## 실행 카드와 완료 조건

### X1: 기존 도형의 새 작성 방식

| 카드 | 첫 구현 범위 | 완료 조건 / 제외 |
| --- | --- | --- |
| X1-A | 순서 있는 3점 원과 시작–통과–끝 3점 호 | 중복/공선/근공선을 허용오차로 판정하고 큰 좌표에서 수치 안정성 검증. 호는 두 번째 점을 통과하는 방향을 선택하고 180° 경계를 검증. standalone·sketch 작성, 정확 중심/반지름/길이, 기존 편집·치수·돌출·교환 연결 |
| X1-C | 중심·변 수·반지름·회전각의 정다각형 | 내접/외접 반지름을 명시. closed polyline의 고유 vertex/segment IDs, 제한된 변 수, 독립 둘레/면적 검증. 생성 뒤 자유 편집 가능하며 정다각형 관계를 영구 구속하는 기능은 별도 |
| X1-B1 | 두 끝점+반지름 원호 (완료) | chord≤2R, 중심 가지와 sweep을 명시적으로 Review. 직경 조건·해 없음·양방향·일반/면 sketch·기존 편집/출력을 검수했다 |
| X1-B2 | 시작점+시작 접선 방향+끝점 원호 (완료) | 선택 접선 방향과 유한 해·퇴화 조건을 검증. 선택한 직선에서 방향을 읽더라도 최초 범위는 작성 시점의 값이며 live 접선 관계는 별도 표시 |
| X1-B3 | 두 직선에 접하는 지정 반지름 원 (완료) | 직선 도메인과 접점, 복수 중심 후보 선택. 임의 spline 접선 작성은 이 카드에서 제외 |

X1-B는 B1/B2/B3 모두 끝날 때 완료한다. X1의 입력 계산을 circle/arc 원본에 환원하고, 렌더 샘플로 중심·반지름을 역산하지 않는다.

### X2: 신규 곡선 종류

| 카드 | 원본 모델·첫 범위 | 완료 조건 / 별도 확장 |
| --- | --- | --- |
| X2-A | 중심·평면 frame·주축 방향·두 반지름의 full Ellipse, standalone | 축/회전 정밀 편집, exact evaluate/bounds/closest point·선택·중심/사분점/접선 스냅, analytic 면적·오차 제한 길이, SVG/DXF의 지원 표현과 왕복. 비균일 transform의 원→ellipse 변환은 명시적 변환 정책으로 검증. ellipse arc는 별도 범위 |
| X2-B | stable anchor/control IDs의 cubic Bezier path | 열린/닫힌 path와 corner/smooth node 의미, control handle 편집·미분·구간 extrema bounds·hit-test/snap·오차 제한 길이/면적. SVG cubic path 왕복, DXF exact 변환 또는 오차 명시 근사 지원을 구현 전 결정 |
| X2-C1 | 비유리 B-spline의 degree·control points·knots | knot multiplicity·domain·control point 수·폐합/주기 의미와 평가 검증, 정밀 핸들·교환. Bezier로 내보내는 경우 exact 구간 분해 여부를 검증 |
| X2-C2 | rational NURBS의 weights·knot/node 편집 | C1 이후 weight/denominator·차수/매듭 변경의 형상 의미와 수치 안정성. rational 곡선의 SVG 근사는 오차를 명시하고 DXF 지원은 독립 fixture로 검증 |

X2-C는 C1/C2 모두 끝나야 완료다. C1/C2의 periodic curve 지원 여부와 최초 차수/노드 수 한도는 구현 전 확정한다. NURBS 원본을 sampling된 polyline만으로 저장하지 않는다. 첫 신규 곡선 schema는 standalone drawing에 넣고, sketch geometry/solver로 들어가는 지원은 별도 matrix로 관리한다. 각 카드의 공개 UI·정밀 핸들·저장과 선언한 교환 범위까지 통과해야 해당 객체 카드를 완료로 올린다.

### X3: live 정의와 가지

| 카드 | 첫 구현 범위 | 선행·완료 조건 |
| --- | --- | --- |
| X3-A | 기존 작도의 source/element/branch 재지정 | 정의·inputs·계산 cache·종속 형상을 한 트랜잭션으로 수정. 자기 참조·간접 cycle·잠긴 종속 결과·타 평면 거부. 임의 operation 변경/결과 kind 변환은 최초 범위에서 제외 |
| X3-B1 | 원–원, 원–호, 호–호 교점 | 기존 두 source의 순서와 중심선에 대한 signed side를 저장. 접선 시 한 점·분리·포함·동심·일치 원을 구별. 해 병합/소멸 시 다른 해로 자동 이동하지 않으며 Review와 명시적 재지정을 제공 |
| X3-B2 | ellipse가 포함된 교점 | X2-A 이후. 유한 parameter domain·근접 중근·잔차/거리 오차·해 identity 계약을 먼저 정함 |
| X3-B3 | Bezier/spline 곡선 교점 | 해당 X2 이후. parameter interval 기반 해 분리와 overlap 판정. 배열 index/가까운 점으로 영구 branch를 대체하지 않음 |
| X3-C1/C2/C3 | 각 이등분선 / 외접원 / 내접원 | interior/exterior 가지와 순서 있는 참조를 저장. 외접원은 X1-A 계산 재사용, 결과는 live circle. 0각·공선·퇴화 삼각형과 원본 변경 재생성 검증 |

현재 작도는 해가 사라지는 source 편집을 실패시키는 경로가 있다. X3의 첫 범위도 **편집 전체 거부와 입력 복구**를 기본으로 한다. unresolved 상태로 저장하는 방식을 추가하려면 cache validation·종속 재생성·측정·출력 정책을 함께 설계한다. B5의 face missing 정책을 작도에 부분적으로 복사하지 않는다.

### X4: clipboard와 관계 복사

| 카드 | 범위 | 선행·완료 조건 |
| --- | --- | --- |
| X4-A1 | 같은 문서의 독립 drawing 기준점 copy/paste (완료) | 복사 내용은 문서 데이터이며 Copy는 History를 만들지 않고 Paste만 한 Undo. 기준점→목표점의 world delta, 반복 붙여넣기의 신규 object/feature/topology IDs, 원본 변경/삭제 뒤 clipboard 불변성. 최초 지원 밖의 선택은 구체적으로 거부 |
| X4-A2 | sketch·작도·pattern·solid·주석 등의 관계 closure | typed remap 목록과 지원 matrix를 구현. 부분 sketch 선택은 소유 sketch/구속을 포함하거나 명시적으로 거부. 외부 source를 조용히 끊지 않으며 hidden source 포함 목록을 Review. 기존 독립 snapshot 복제와 구별 |
| X4-B | 문서 간 붙여넣기 | 독립 payload version·크기 한도·형식 검증. layer/style, variable/binding, block/member/override, image asset, face sketch/work-plane source, solid history 참조를 remap. 같은 이름/ID 충돌과 assets dedup을 Review하고 전체를 한 번에 적용 |

X4-A는 A1/A2 모두 끝나야 완료다. 시스템 clipboard 단축키는 입력 필드의 기본 Ctrl/Cmd+C/V를 유지하며 캔버스에 포커스가 있을 때만 CAD 경로가 소유한다. 내부 payload로 먼저 검증하고 브라우저 clipboard 접근 실패는 내부 복사 경로와 분리해 안내한다. `JSON.stringify` 결과의 문자열 전체 치환으로 참조를 remap하지 않는다. Scene/Artboard/교환 receipt를 포함한 문서 전체 복제는 X4-B의 최초 기본 범위가 아니며 matrix에 별도로 명시한다.

### X5: 작업면을 활성 작성 좌표계로 연결

| 카드 | 범위 | 완료 조건 |
| --- | --- | --- |
| X5-A | 기존 명명된 frame 재사용·활성 UCS 선택·WCS 복귀 (완료) | session active ID와 문서 frame을 구분. 전환이 기존 객체를 변환하지 않는지 검증. active ID를 파일에 보존할지는 구현 전 결정하며, 보존하면 파일/복구/History 계약도 포함. face source missing 시 작성 차단·명시적 복구 |
| X5-B | 임의 frame Line/Circle 작성 + 로컬 Move pilot (완료) | 공통 frame resolver, local↔world 입력·ray pick·snap·미리보기·정밀 입력을 연결. 파일 재열기 뒤 같은 world geometry. X1과 기존 기본 평면 회귀. camera/model view는 별도 |
| X5-C | Arc/Polyline·작도·치수·pattern·교환 확대 | 도구별 지원 matrix. 기존 `SketchWorkPlane`을 무작정 string으로 넓히지 않고 frame 참조와 기본 평면 호환을 검증. DXF/SVG/PDF에서 임의 평면 투영/제외 정책을 명시 |

X5-A/B가 pilot 마감이고 X5 전체 완료는 C까지다. B5의 frame 저장 기능은 재사용하며 별도의 중복 UCS 좌표 계산을 만들지 않는다.

### X6: BRep 변환·배열·단면

| 카드 | 범위 | 완료 조건 |
| --- | --- | --- |
| X6-A | plane origin+normal에 대한 3D Mirror | 별도 live solid recipe/feature 계약. 음수 object scale은 현재 저장 검증에서 허용되지 않으므로 반사를 object scale로 위장하지 않음. handedness·face/wire 방향·양의 체적·validity·source 이동/치수와 STEP 검증 |
| X6-B | world 3D 방향·간격·개수 Linear Pattern | 고유 source+slot identity, source 포함/제외 의미, count 축소 시 참조 처리, 개수 한도·Worker 비용. 각 결과는 BRep이며 source 편집을 추종 |
| X6-C | axis origin+direction·각도·개수 Radial Pattern | 전체 원과 부분 원의 각도 분배·끝 슬롯 중복을 명시. X6-B의 slot/삭제/재생성 정책 재사용 |
| X6-D1 | viewport clipping plane | 화면만 자르고 원본/체적/STEP은 보존. 단면 채움 여부, 카메라 전환, 저장 여부를 표시. 이것만으로 CAD 단면 생성 완료를 보고하지 않음 |
| X6-D2 | solid×plane의 실제 section curve | 독립 커널 연산. 다중 loop·구멍·접선·면과 일치하는 퇴화·곡선 종류를 판정. exact 단면 도형과 측정/주석/2D 출력 연결; 표시 샘플을 정확한 원/호로 위장하지 않음 |

X6-D2가 원/호 외 곡선을 만들면 X2 지원이 필요하거나 해당 결과를 미지원으로 명시해야 한다. 모든 solid의 section을 X6-D1/D2 첫 범위에서 보장하지 않는다. 배열 slot을 줄일 때 참조가 있는 슬롯을 자동 renumber하거나 조용히 삭제하지 않는다.

### X7: 종류별 일반 주석과 측정 인계

| 카드 | 첫 범위 | 완료 조건 |
| --- | --- | --- |
| X7-A | Leader + 문자 위치/문구 편집 | world/plane attachment와 text/style 원본, 선택·정밀 위치·SVG/DXF/PDF 결과 |
| X7-B | ordinate 좌표 주석 | 명시적 datum/frame·axis·source point와 단위, datum 변경/소멸 정책 |
| X7-C | closed contour 면적 주석 | source loop·구멍·면적 단위·오차 basis, self-intersection/열린 윤곽 거부 |
| X7-D | arc length 주석 | bounded arc 방향·sweep·source identity·길이 단위, supporting circle 전체 길이와 구분 |
| X7-E | 측정 결과→주석 인계 | live 참조 또는 고정 snapshot을 사용자에게 명시. 측정 provenance·단위/정밀도 보존 |

최초 X7은 일반 주석이다. solver driving constraint와 font shaping/text-to-path는 별도 확장으로 두고 완료 범위를 명확히 표시한다.

## 모든 카드의 공통 마감 기준

새 source 종류는 evaluate·bounds·hit-test·snap·measurement·serialization·UI·renderer·export의 지원 matrix를 먼저 기록한다. sampling tolerance는 표시와 교환용을 구별하고 수치 적분 측정은 analytic/BRep 측정과 오차 기준을 구분한다. X2는 standalone부터 명시된 지원 묶음을 완료하며 sketch solver, Offset/Trim/Boolean, extrusion profile 지원을 자동 완료로 올리지 않는다.

공개 명령은 기존 detached Preview→Apply와 게시 직전 revision 검증을 사용한다. source/branch/값/좌표계 변경은 검토를 무효화한다. Cancel·잠금·missing/ambiguous reference·invalid input의 문서 전체/History 불변성을 검증하고, 한 Undo→Redo·save→reload→recompute·관련 실제 브라우저 흐름을 확인한다. geometry/source schema 변경에는 file version gate와 구버전 호환 정책을 함께 반영하되 계획에서 버전 번호를 선점하지 않는다.

렌더링뿐 아니라 G2 artboard/vector style/component override와 G4 scene/source 참조, DXF/SVG/PDF/STEP 중 해당 지원 출력도 점검한다. X2 export에서 exact source와 approximation의 구분, X4에서 관계/asset remap, X6에서 BRep validity와 독립 체적/면적을 검수 증거로 남긴다. 이 검토에서 구현 테스트를 새로 실행한 것으로 기록하지 않는다.

2026-10-11 마감: X1-B2/B3·X4-A1·X5-A/B pilot 완료. active UCS는 session state로 결정했고 파일 재열기에서 WCS로 복귀한다. X4-A2·X5-C는 대기다. [최신 구현·지원 경계](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md).
