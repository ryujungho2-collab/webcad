# B2-B line–arc Fillet

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. 두 객체 사이의 직선–유한 원호 Fillet을 구현했다. 기존 직선–직선 Fillet과 D1/D2 Chamfer는 유지한다.

## 사용

직선과 독립 원호를 선택한 뒤 Modify → **Curve workflow → Fillet**을 연다. 반지름에는 mm/cm/in 등 길이 단위를 입력한다. **Pick target branch / Pick second branch**로 남길 구간을 각각 클릭한다. 명시적 클릭 전에는 각 첫 segment의 35% 위치를 유지 가지로 사용한다.

해가 하나면 접점 T1/T2를 자동으로 Preview한다. 여러 해가 있으면 **Tangent solution**에서 접점 좌표를 비교해 하나를 선택해야 Apply할 수 있다. 자주색 안내선은 connector 중심에서 각 접점까지의 실제 월드 반지름을 나타낸다. 값·대상·가지·문서가 바뀌면 선택과 이전 review를 무효화하고 재계산한다. 선택 변경도 새 detached Preview를 생성한다.

Apply 버튼 또는 canvas Enter는 원본 두 도형의 trim과 독립 connector arc 생성을 한 transaction으로 게시한다. 원본 객체 ID와 topology control/segment ID를 유지한다. 기존 결과 인계를 따라 세 객체가 선택되고 Join result를 제공한다. Cancel/Escape는 문서·History를 바꾸지 않는다. 필드나 select의 Enter는 기존 native 입력 소유권을 따른다.

## 정확한 기하와 허용 구간

접점 계산은 display tessellation을 사용하지 않는다. 직선 양쪽의 거리 r인 offset line과 원호 중심을 기준으로 반지름 R+r 및 |R−r|인 원의 해석 교점을 구한다. 이 교점이 Fillet 중심 후보이며 수직 투영으로 직선 접점, 중심 방향으로 원호 접점을 구한다. R−r의 부호로 내부/포함 접촉을 구분한다. 동심으로 무한 해를 만드는 locus는 제외한다. 중근은 한 후보이며 반원 connector의 방향도 유지 가지에 대한 G1 접선 조건으로 선택한다.

직선 접점은 선택한 유한 end segment의 내부, 원호 접점은 실제 start/end angle 사이의 내부에 있어야 한다. 남길 부분에 클릭한 점이 있고 길이가 양수여야 하며, 기존 다중선의 shared vertex는 이동하지 않는다. 두 접점에서 connector와 남길 branch의 진행 방향이 같은 G1 접선을 이루는 후보만 남긴다. 불가능 반지름·끝점 소멸·범위 밖 접촉·pick가 접점과 겹침·수치 overflow는 적용을 거부한다. supporting line/circle 밖으로 임의 연장하거나 원호를 facet으로 근사하지 않는다.

지원은 **독립 finite arc 한 개 + 직선 또는 열린 contour의 직선 자유 끝 segment 한 개**, 동일 XY/XZ/YZ 작업면·elevation·layer·construction purpose다. 객체 순서, CW/CCW, 원호의 유한 major sweep, 평면 내 회전·균일 scale·반사를 보존한다. 실제 모델 프레임에 contact를 역변환하고 arc의 원본 center/radius와 retained endpoint를 유지한다. 비균일 scale로 타원이 된 원호·기울어진 작업면·full circle·닫힌 contour·arc–arc·mixed contour의 arc end는 거부한다. 스케치/패턴/작도 소유 형상은 owner tool이 필요하다.

내부 코너와 line–arc Chamfer는 이번 범위에 포함하지 않는다. arc–arc Fillet/Chamfer 및 닫힌 윤곽은 B2-C다. connector는 독립 editable arc이며 live corner recipe를 추가하지 않는다.

## 명령·관계·보존

기존 `connect-drawings`에 optional `solutionIndex`를 추가했다. Fillet에서 0–7 정수만 허용하고 실제 후보가 없으면 거부한다. 여러 해의 index를 생략하면 명시적인 선택 안내와 함께 거부한다. index는 현재 radius/branch/source에 대한 후보이므로 공통 plan의 document version/fingerprint 검증으로 stale Apply를 막는다. 새 serialization version은 필요하지 않는다.

공통 command 준비·재생성·Preview/Apply·History를 재사용한다. source와 downstream 잠금, ID 충돌, 재생성/관계 실패는 전체 도면과 History를 복원한다. 연결되지 않은 profile에 connector를 자동 편입하는 정책은 추가하지 않는다. 치수 등 현재 소유 관계는 공통 갱신에 따라 재생성하며 지원 불가능한 관계는 transaction을 거부한다.

변경 위치: `geometry/lineArcFillet.ts`, `geometry/connectDrawings.ts`, `commands/registerDrawingCommandHandlers.ts`, `ui/CurveWorkbench.tsx`, command 타입/validator.

## 검수

신규 Node 7개는 독립 sqrt(80) 접점/반지름 oracle, 두 객체의 topology·한 Undo/Redo·portable reload, CW/CCW·선택 순서·XY/XZ/YZ, 반사/회전/scale 프레임, multiple solution, 중근 반원, no-fit/overflow·잠긴 dependent·stale·치수 갱신을 검사한다.

신규 native Edge/CDP **lineArcFillet 17 checks**는 실제 App/React/Worker에서 두 branch 포인터 pick, 단위 입력·정확한 접점/radius 안내·no-fit/잘못된 입력·취소/포커스·잠금·canvas Enter·결과 인계·한 Undo/Redo·JSON reload·복수 해 select/review/Apply를 확인한다. 기존 curveWorkflow 20·asymmetricChamfer 18도 검수했다. 최종 **782 Node / 54 suites / fail·skip 0**, 대상 native browser **3 workflows / 55 checks**, 타입·architecture/import·문서 링크 **370 modules**·workspace production build가 통과했다. 수치와 로그는 [마감 증거](../verification/B2-B-CLOSEOUT-2026-10-10.json)를 따른다. 전체 browser suite나 실무자/GPU benchmark를 실행한 것은 아니다.
