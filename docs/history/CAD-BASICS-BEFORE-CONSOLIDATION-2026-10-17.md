> 2026-10-17 기능 설명 통합 전 보존본입니다. 현재 사용법·지원 범위는 [기능 가이드](../features/README.md), 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따릅니다.

# 기본 CAD 기능 기준과 현재 공백

2026-10-11 **G6-D1/D2·D3 첫 adapter**: stable part 조립 위치·비파괴 분해도·정확한 주축 box/cylinder 윤곽을 Review/Apply·재생성·출력·v24·History에 연결했다. 일반 BRep/숨은선·종이 축척/연관 치수 시트는 후속이다. [사용·지원·검수](../implementation/G6-D123-ASSEMBLY-EXPLODED-PROJECTION-2026-10-11.md).

2026-10-11 **B2-C2 완료**: 독립 line–arc Chamfer와 열린 mixed arc free-end의 Chamfer/Fillet, bounded 교점·D1/D2·기존 ID/공유 정점·참조·Undo를 지원한다. [사용·검수·지원 경계](../implementation/B2-C2-OPEN-END-CORNERS-2026-10-11.md). 아래 과거 열린 arc end 미지원 설명은 당시 기록이다.

2026-10-11 후속 갱신: **B1-E2 호·혼합 스케치 구성 편집**을 실제 저장·solver·편집 명령·UI 범위에서 확대했다. [최신 지원·검수](../implementation/B1-E2-MIXED-SKETCH-EDITING-2026-10-11.md)를 따른다. 아래의 이전 호·혼합 미지원 설명은 최초 마감 당시의 경계이다.

2026-10-09 **B0-C**: 기본 root 해치/문자/치수/finite construction의 layer 숨김·잠금·선택·출력 공백을 보완했다. 활성 평면 SVG 문자의 Unicode/회전/정렬·text-only 다운로드, 치수 layer stroke·보조선 dash와 canvas-hidden construction 선택 제외를 검수했다. [실제 범위·표시/출력 정책·남은 경계](../implementation/B0-C-DRAFTING-VISIBILITY-2026-10-09.md). 보드 문자/치수와 nested member별 표시 정책은 별도 확대다.

2026-10-09 **B0-B**: 기본 작도·점 기반 Move/Copy/Rotate의 단위/좌표/활성 필드와 숫자 preview·Enter·클릭 확정을 일치시켰다. 입력 오류 복구, 사각형 치수·호 반지름/sweep, XY/XZ/YZ를 검수했다. [지원 범위와 실제 검수](../implementation/B0-B-PRECISION-INPUT-2026-10-09.md). primitive 지름/길이 reviewed pilot은 별도 후속이다.

2026-10-09 **B0-A**: 포커스된 Explorer/Ribbon 컨트롤의 Enter/Space가 행 선택·CAD 명령 반복과 충돌하던 결함을 수정했다. 캔버스 반복, 숫자 grip의 정확한 Apply/Cancel·포커스 복원, 문서 Undo/Redo는 유지한다. [대상별 native browser 검수·지원 경계](../implementation/B0-A-KEYBOARD-ACTIVATION-2026-10-09.md).

2026-10-10: **B2-D 블록 Stretch**의 전체 포함 이동·부분 포함 거부와 명시적 인계를 구현했다. [사용·검수·envelope 경계](../implementation/B2-D-BLOCK-STRETCH-2026-10-10.md)를 따른다.

2026-10-10: **B2-C arc–arc Fillet/Chamfer와 닫힌 line–arc/arc–arc 코너**를 완료했다. [지원·사용·검수](../implementation/B2-C-ARC-CORNERS-2026-10-10.md)를 따른다.

2026-10-10: **B2-B line–arc Fillet**의 해석 접점·bounded 유지 가지·복수 해 선택·Preview/Apply를 구현했다. [지원 대상·실제 검수·B2-C 경계](../implementation/B2-B-LINE-ARC-FILLET-2026-10-10.md)를 따른다.

2026-10-09: **B2-A1 두 독립 윤곽**에 이어 **B2-A2 내부 직선 코너의 두 거리 모따기**를 구현했다. D1/D2 단위·Swap/Equal·거리선·공통 Review/Apply·입력 유지/복구·결과 인계를 제공한다. [내부 코너의 치수/작도/돌출·원호/ID 보존·검수·한계](../implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md), [두 윤곽 Join 인계](../implementation/B2-A1-ASYMMETRIC-CHAMFER-2026-10-09.md)를 따른다. Sketch 소유·인접 호·3D 비대칭 모따기는 남는다.

2026-10-08 구현 갱신: 일반 각도 치수 **B3-C1–C3**의 두 straight edge·명시적 측정 가지·live 참조/Trim·Join 재연결·v14·캔버스 선택/반지름 핸들/검토·DXF/SVG/PDF 출력을 구현했다. [계산 근거](../implementation/B3-C1-ANGULAR-DIMENSION-2026-10-08.md)와 [실제 workflow·제한](../implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md)을 따른다. 기존 **B3-A1/A2 DXF bulge 왕복과 B3-B 일반 지름 치수**는 [지원·browser 근거](../implementation/G4-CAD-BASICS-2026-10-06.md)를 유지한다. B0–B5/X의 나머지 카드는 [CAD 구현 단위 설계](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md)를 따른다.

2026-10-05 갱신. CAD의 기준은 **정밀하고 간편한 기본 조작을 검증하고
공백을 메우되 차후 확장을 고려하는 것**이다. 일반 2D Join/Explode/Break와
기본 좌표 편집의 오류를 구현·수정했고, 정점 구성 편집·Lengthen·영역 Stretch를
추가했다. 상용 CAD 수준을 달성한 것은 아니다. 최신 범위와 검수는
[BASIC-CAD-CORE-EDITING-2026-10-04.md](../implementation/BASIC-CAD-CORE-EDITING-2026-10-04.md)에 있다.
공통 커널/솔버·작도·노드·BIM 등의 최신 요구사항과 지원 대조는
[SHARED-GEOMETRY-ARCHITECTURE.md](../architecture/SHARED-GEOMETRY-ARCHITECTURE.md)를 따른다.
실제 저장 관계 Query/Inspector와 연결 점 따라 이동 의도를 추가했다.
독립 점/무한선/반직선과 저장되는 중점→수직이등분선→교점 작도를 추가했다.
검수·저장/출력 경계는 [CONSTRUCTION-GEOMETRY-2026-10-04.md](../implementation/CONSTRUCTION-GEOMETRY-2026-10-04.md)에 있다.
확장 구속 10종과 Quadrant/Extension·스냅 설정을 추가했다. [범위와 검수](../implementation/EXTENDED-SKETCH-AND-SNAPS-2026-10-04.md)를 따른다.
곡선 Offset·자유 끝부분 Trim/Extend·두 객체 직선 코너와, 결과 선택·정밀 입력·다음 작업을 유지하는 [Curve workflow](../implementation/CURVE-WORKFLOW-2026-10-04.md)를 추가했다.
최신 기준은 필요한 기능을 편하게 연결해 작업을 끝내는 경험이다. 아래 기본 CAD 정확도 기준은 유지한다.

## 판단 기준

기계 스케치와 건축 도면 모두에 필요한 작성·선택·정밀 입력·형상 수정·치수·
저장/출력을 먼저 갖춘다. 3D 모델링의 기본도 따로 점검한다. 일반 도면의
측정 치수와 스케치의 구동 치수는 의미가 다르므로 각각의 지원 범위를 기록한다.

여기서 `경로 있음`은 명령과 사용 경로가 있다는 뜻이다. 모든 조합의 지원이나
실무 사용성 완료를 뜻하지 않는다. `제한 있음`은 일부 대상 또는 작업 방식만
지원한다. `없음`은 현재 공개 명령/스키마와 UI에 해당 편집 기능이 없다.
관련 테스트가 있어도 지원하지 않는 조합은 그대로 공백으로 분류한다.

## 현재 기능표

| 기본 작업 | 현재 상태 | 실제 범위와 남은 공백 |
| --- | --- | --- |
| 새 문서·열기·저장·자동 복구·Undo/Redo | 경로 있음 | 실패 원자성과 복구 검수 기록이 있다. 관계를 바꾸는 새 편집에도 같은 기준을 적용해야 한다. |
| 선택·다중 선택·윈도/교차 선택·그립·확대/이동/Fit | 경로 있음 | 겹친 대상 선택과 키보드 그립도 있다. 큰 문서와 실무자 작업 검수는 별도 남아 있다. |
| 선·다중선·사각형·원·호 | 경로 있음 / 제한 있음 | 5종을 만들 수 있다. 원은 중심/반지름, 호는 중심 기반 작성 경로다. 타원·스플라인 및 여러 작성 방식은 없다. |
| 절대/상대 좌표·거리/각도·단위·Ortho | 경로 있음 / 제한 있음 | 좌표, `@` 상대 입력, 극좌표와 잠금, 길이/각도 단위 입력이 있다. XY/XZ/YZ 작성과 자유/평면 면 연결 작업면을 지원하며, 평면 면에서는 스케치·치수·투영을 작성한다. 활성 UCS/WCS와 임의 frame Line/Circle·local Move pilot을 지원한다. Arc/Polyline 등 전체 도구 확대는 X5-C 후속이다. 입력 필드 전체의 단위·표시 일관성은 기본 과제로 검수한다. |
| 객체 스냅 | 경로 있음 / 제한 있음 | 끝점·중점·중심·교점·수직·접선·최근점·그리드·사분점·직선 연장과 종류별 설정이 있다. 작도 중 Shift+A로 추적점을 획득/해제하고 Shift+L 방향 잠금, Shift+N 복수 교점 후보 전환, Shift+R 해제, Alt 일시 억제를 지원한다. 추적은 저장되지 않으며 실제 기하 스냅과 정확한 숫자 입력을 우선한다. 접선 스냅은 지속되는 접선 구속과 다르다. |
| 이동·기준점 복사·회전·스케일·삭제·미러·배열 | 경로 있음 / 제한 있음 | 일반 도형과 스케치의 변환 경로가 있다. live 미러/배열은 2D 곡선이며 개별 편집은 원본/정의 또는 분리로 한다. 도형의 문서 간 클립보드 명령은 없다. |
| Join·Break·Explode | 경로 있음 / 제한 있음 | 일반 선/호/열린 다중선 Join, 정확한 선·호 Explode와 한 점 분할·두 점 사이 제거를 지원한다. Curve workflow의 Join은 같은 소유 스케치·작도·패턴·치수·live 솔리드 참조를 명시적으로 재연결한다. 일반 Break는 남길 조각을 고르고 치수·작도 point/edge/span/branch를 재연결한다. 일반 Explode는 정확한 선·호 분해와 조각 편집 뒤 Join에서 치수·작도·live profile·scene 관계를 복원한다. 단일 블록 인스턴스 해체는 world 복원·1단계/재귀 중첩과 정의/형제 보존을 지원한다. 스케치/패턴 Break·소유 adapter와 정의 격리 편집·override/variant는 후속이며 지원하지 않는 교체는 거부한다. |
| Lengthen·영역 Stretch | 경로 있음 / 제한 있음 | 열린 선/호/다중선의 전체 길이·증감·비율과 끝점 드래그를 지원한다. Stretch는 같은 작업면·높이의 영역 안 정점/끝점만 이동하며 원은 중심으로 판단한다. 사전 선택 없이 영역부터 시작할 수 있다. B2-D는 전체 envelope가 포함된 블록 instance를 rigid move하며 부분 포함 batch는 definition edit/명시적 Disband로 인계한다. B2-E는 완료된 스케치의 요청 점을 pin하고 구속/구동 치수를 유지하며 연결 자유점과 live solid를 재생성한다. 충돌은 명명하여 전체 거부하고 입력 수정으로 복구한다. 주석 Stretch, 비정렬 UCS와 스케치 Lengthen은 후속이다. |
| 다중선 구성 편집 | 경로 있음 / 제한 있음 | 일반 다중선/사각형의 정점 추가·삭제·열기/닫기와 미리보기/Apply가 있다. 호 정점 추가는 정확한 호를 분할하며 같은 원 위의 인접 호는 삭제로 다시 합친다. 서로 다른 곡선을 잇는 정점 삭제는 거부한다. 지정 변의 직선↔호 전환은 접속점을 고정하고 반지름·방향·치수/작도 재연결을 지원한다. 직선 스케치 다중선의 정점 삽입·삭제·열기/닫기는 구속·구동 치수·돌출 갱신과 함께 지원한다. 호·혼합 스케치 구성과 참조 재연결은 공백이다. |
| Trim / Extend | 제한 있음 | 선·호·원·사각형·선/호 다중선의 닫힌·중간 구간 Trim과 자유 끝부분 Trim/Extend를 지원한다. Curve workflow의 구간 Trim은 실제 경계 교점으로 제거하며 같은 소유 스케치·작도·중첩 패턴·치수·live 솔리드 참조를 갱신한다. 돌출 원본은 한 편집에서 다시 닫아 재생성한다. 원 Extend, 혼합 sketch bulge와 해치/블록 관계 교체는 지원하지 않는다. |
| Offset | 경로 있음 / 제한 있음 | 선·사각형·원·호와 열린/닫힌 직선+bulge 다중선을 지원한다. Fillet 이후 전체 윤곽도 해석적으로 Offset한다. 반지름 소멸·불가능 접속/교차·붕괴는 거부한다. 비균일 스케일과 기울어진 작업면은 후속이다. |
| 2D Fillet / Chamfer | 제한 있음 | 독립 사각형/다중선 내부 직선 코너와 두 객체의 직선 자유 끝부분을 지원한다. 양쪽 모두 D1/D2 모따기·단위·Swap/Equal·캔버스 거리선·공통 Review를 제공한다. 내부 코너의 edge 치수/작도/돌출은 한 transaction에서 갱신하며 다른 변의 원호를 보존한다. 두 객체는 원본 Trim/Extend와 연결체·Join/Offset 인계를 지원한다. B2-B의 독립 line–arc Fillet은 유한 접점·G1 유지 가지·복수 해 선택·반지름 안내를 지원한다. B2-C는 독립 finite arc–arc와 닫힌 line–arc/arc–arc 코너의 해석 접점·원호 길이 D1/D2·정점/해 선택·폐합/Offset을 지원한다. 독립 line–arc Chamfer·열린 mixed arc end·스케치 소유 코너·3D 비대칭은 후속이다. |
| 도면 치수·문자·해치 | 제한 있음 | 수평/수직/정렬 선형·반지름·지름·각도·연속 치수, 문자·연관 해치가 있다. 일반 치수는 원본 변경에 따라 갱신하고 Trim/Join 재연결·DXF/SVG/PDF 출력을 지원한다. 선형/반지름/지름/각도/연속 치수에 같은 표시 스타일(길이·각도 단위, 소수 자릿수, 글자/화살표/간격, 종이 축척)을 적용하며 측정값과 스케치 구동값은 바꾸지 않는다. 윤곽 교체 뒤 해치는 검토된 결과로 재지정한다. 아트보드 annotation 출력과 DXF의 치수 연관성 왕복은 후속이다. |
| 파라메트릭 스케치 | 제한 있음 | 일치·수평·수직·점 고정·거리·각도·반지름·지름 구속과 변수/식, 구속을 유지하는 드래그가 있다. 선/다중선의 연결 점 편집 의도로 이웃 자유점을 함께 움직일 수 있고 AB=50/BC=30/직각의 동시 유지를 검수했다. 평행/수직 전용, 동일 길이/반지름, 동심, 선–원/원–원 및 유한 호 접선, 점의 선/원/호 위와 대칭 구속을 지원한다. 관계 생성은 캔버스 미리보기/Apply, DOF/충돌, 저장·한 Undo에 연결한다. 타원/스플라인 관계와 독립 접점 잠금 파라미터는 후속이다. |
| 파생점 작도·출처 설명 | 경로 있음 / 제한 있음 | 독립 Point/무한 Line/Ray, 두 점의 선분/직선/반직선, 중점·수직이등분선과 직선 계열–원/직선 계열 교점의 저장·연쇄 재계산·Query/Inspector가 있다. 교점 분기, 전체 보조 형상 숨김과 원본 드래그의 작도 미리보기를 지원한다. 원–원/일반 곡선 교점과 작도 입력 정의 재지정은 후속 범위다. |
| 레이어·선종류·선두께·블록 | 경로 있음 / 제한 있음 | 레이어 생성·가시성·잠금·스타일, 블록 정의·삽입, G2의 정의 수정·선택 원본으로 교체와 중첩 component 평가·저장이 있다. 단일 블록 인스턴스 해체, G2의 정의 수정·선택 원본으로 교체와 중첩 component 평가·저장이 있다. 정의 내부 격리 편집, instance override/variant와 중첩 라이브러리 전용 browser 검수는 남아 있다. [G2 범위·근거](../implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md) |
| DXF·SVG·PDF 출력 | 제한 있음 | DXF의 일부 도형·TEXT·단순 BLOCK/INSERT, SVG와 지정 축척 PDF. LWPOLYLINE/지원 2D POLYLINE의 signed/sparse bulge·닫힌 마지막 호를 정확히 입력·Explode/Join·재출력한다. mm/inch·평면 내 회전/이동/균일 scale·반사 검수. Import/Export review에 단위·제외·부분집합 명시적 수락·stale 차단 추가. B3-A3에서 원·원호·bulge의 non-default OCS/elevation·임의 평면 배치와 기울어진 평면 선의 교환을 검수했다. [B3-A4](../implementation/B3-A4-DXF-PLACEMENT-2026-10-11.md)에서 TEXT/INSERT 비기본 OCS·중첩/반사 배치도 지원. 독립 curved non-uniform·TEXT width/oblique·INSERT array/attributes·thickness/mesh/fitted는 명시적 제외; DWG 미지원. 치수/해치는 DXF 선/문자로 출력되어 연관성은 WebCAD JSON에서 보존한다. |
| 3D 기본 작성·수정 | 경로 있음 / 제한 있음 | 기본 솔리드·돌출·회전·Sweep/Loft·합/차/교차·선택 엣지 Fillet/Chamfer와 원본 재생성이 있다. 평면 BRep 면 스케치의 치수·투영·live 돌출과 단일 Review/Apply의 blind/through 절삭, 면 로컬 위치·지름·깊이를 입력하는 원통형 Hole과 제거할 면·안쪽 두께를 지정하는 [Shell](../implementation/B5-E-SHELL-2026-10-10.md)을 지원한다. 나사/카운터보어·바깥쪽/가변 두께·3D 솔리드 미러/배열은 후속이다. |

## CAD 영역의 개선 묶음

B0–B5는 CAD 지원 범위와 검수 기준이다. 실제 구현 카드와 신규 확장 X는 [구현 단위 설계](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md)가 소유한다. 전체 제품의 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)와 [최종 기획 G0–G6](../IMPLEMENTATION-READINESS-2026-10-05.md)가 정한다. 아래 설명은 목표 범위이며 각 묶음의 전체 구현 완료를 뜻하지 않는다.

### B0. 기존 기본 조작의 계약 고정

선택/창 선택/그립, Enter·Esc·명령 반복, 기준점·상대/극좌표, 스냅과 단위를
짧은 작업 시나리오로 묶는다. 기존 검수를 재사용하고 누락된 실제 작업만
보강한다. 일반 도형·스케치 소유 도형·배열 인스턴스의 편집 의미와 선택
가능 여부를 명확히 한다. 지원하지 않는 대상은 무응답으로 끝내지 않는다.
이 단계는 기본 도구를 전면 재작성하는 작업이 아니다.

### B1. 선과 다중선의 구성 편집 — 첫 구현 묶음

일반 2D **Join → Explode → Break**의 첫 묶음은 구현·검수했다.
정점 구성/Lengthen과 일반 도형 영역 Stretch도 구현·검수했다.
곡선 Offset·자유 끝부분 수정·직선 코너와 닫힌/중간 구간 Trim·명시적 참조 재연결은 구현 기록의 범위에서 검증했다. [B1-A 일반 Break 조각·참조 보존](../implementation/B1-A-BREAK-REFERENCES-2026-10-09.md)과 [B1-B Explode→편집→Join 의존 복원](../implementation/B1-B-EXPLODE-JOIN-REFERENCES-2026-10-09.md), [B1-C 블록 인스턴스 해체](../implementation/B1-C-BLOCK-DISBAND-2026-10-09.md), [B1-D 지정 변 직선↔호 전환](../implementation/B1-D-EDGE-CONVERSION-2026-10-09.md), [B1-E 스케치 정점·변 구성 편집](../implementation/B1-E-SKETCH-VERTICES-2026-10-09.md)을 구현·검수했다. 원호 코너, 스케치 호·혼합 구성과 패턴 관계, 정의 격리 편집·override/variant는 남아 있다.
아래 항목의 전체 범위를 완료한 것은 아니다.

- Join: 순서나 방향이 섞인 선·호·다중선의 연결 가능한 경로를 실제 한
  다중선으로 만든다. 선만 가능한 Join에서 끝내지 않고 호의 bulge를 보존한다.
  가지 분기·불명확한 연결·작업면 불일치와 허용오차 밖의 틈은 진단한다.
- Explode: 일반 다중선/사각형을 정확한 선·호로 분해한다. 단순 블록 해체도
  같은 기하/배치 기준으로 연결한다. 새 조각의 위상 참조는 명시적으로 만든다.
- Break: 선택 위치 또는 두 위치로 선·호·다중선을 나눈다. 닫힌 윤곽을
  여는 결과와 제거/유지할 구간을 미리보기로 알 수 있어야 한다.
- 정점 추가/삭제, 열기/닫기와 Lengthen: 연결 방향·닫힘·곡률을 유지하면서
  구성과 길이를 편집한다. 그립 이동과 별개로 정확한 길이/증분을 받는다.

완료 기준: 닫힌 윤곽을 열고 수정한 뒤 재결합할 수 있으며, 호가 직선 샘플로
바뀌지 않는다. 불필요한 재작성 없이 원래 위치·레이어·선종류와 조각의 참조를
유지한다. 일반 도형의 첫 지원과 스케치 구속/블록 소유권 처리를 구분해 검수한다.

### B2. 기본 수정 명령의 대상 범위와 Stretch

곡선 다중선 Offset, 자유 끝부분 Trim/Extend와 두 객체 직선 Fillet/Chamfer를
연결했다. [닫힌·중간 구간 Trim과 참조 재연결](../implementation/CONTOUR-TRIM-REFERENCES-2026-10-04.md)도 구현했다. 원호가 참여하는 코너와 소유 관계의 재연결은 남아 있다.
일반 도형과 [B2-D 블록](../implementation/B2-D-BLOCK-STRETCH-2026-10-10.md), [B2-E 스케치](../implementation/B2-E-SKETCH-STRETCH-2026-10-10.md)의 영역 Stretch를 구현·검수했다. 닫힌 윤곽을 열거나 사각형을 일반 다중선으로
변환하는 결과는 편집 미리보기에 포함한다.

완료 기준: `사각형 → 코너 Fillet → 전체 Offset → 구간 Break/Trim → Join`
작업을 같은 정확한 윤곽 표현으로 끝낼 수 있다. Offset의 교차·접촉·반지름
소멸과 구속 충돌은 진단하며 잘못된 결과를 문서에 남기지 않는다.

### B3. 정밀 입력·스냅·기본 치수와 파일 왕복

- 스냅 종류 설정·사분점·연장 투영·격자 간격/취득 반경은 구현했다. 기준점/방향 추적과 입력 필드의 단위 일관성을 이어서 검수한다.
- 일반 지름·각도 치수 생성, source 갱신·Trim/Join 재연결·저장/출력은 구현했다. 기존 선형/반지름/지름/각도/연속 치수의 공통 스타일은 후속이다:
  문자·화살표·소수 자릿수·표시 단위. 표시 반올림으로 원본을 변경하지 않는다.
- DXF bulge 다중선의 정확한 입력·편집·출력·단위 왕복과 실제 파일 Review를 구현했다. [B3-A3](../implementation/B3-A3-DXF-OCS-2026-10-10.md)의 유한 analytic OCS/tilted plane 교환도 완료했다. TEXT/INSERT 비기본 OCS·중첩 배치는 B3-A4에서 완료했고 UCS Line/Circle·local Move pilot은 X5-A/B에서 완료했다.
  불가피한 근사/제외와 WebCAD JSON에만 보존되는 관계를 구체적으로 알린다.

완료 기준: 일반 도형의 **지름/각도 도면 치수**와 스케치의 **지름/각도 구동
치수**를 혼동하지 않는다. 가져온 곡선 윤곽을 편집·측정·내보낸 뒤에도 기하와
단위가 맞는다. PDF의 출력 축척과 도면 문자 크기를 실제 결과로 확인한다.

### B4. 스케치의 기본 관계

평행/수직 전용, 동일 길이/반지름, 동심, 선–원/원–원 접선, 점의 선/원 위와 대칭 관계를 구현했다.
영구 하위 참조, DOF/충돌, 캔버스 미리보기/Apply, 연결 드래그와 원형 안내, 저장·Undo·Query를 검수했다.
호 위 점은 방향 있는 실제 호 구간과 양 끝점을 포함하며, 선–호와 호–호/호–원 접선은 실제 접점이 유한 대상 위에 있을 때만 성립한다. 선택한 근접 접선 후보는 Preview와 명시적 Apply를 거쳐 영구 구속이 된다. 이 관계가 있는 파일은 v17로 저장한다. [B4 지원 범위와 검수](../implementation/B4-ARC-CONSTRAINTS-2026-10-10.md).

완료 기준: 두 직선과 원/호를 연결한 프로파일을 치수로 바꾸어도 접선과
주요 관계가 유지되고, 종속 솔리드가 갱신된다. 기본 구성 편집이 스케치
구속을 조용히 삭제하거나 일반 도형으로 바꾸지 않아야 한다.

### B5. 3D 기본 작업

2D/스케치 기준을 통과한 뒤 면 위 스케치와 작업면, 돌출 절삭·Hole·Shell을
기본 모델링 묶음으로 처리한다. 기존 Extrude/Revolve/Sweep/Loft/Boolean/
Fillet/Chamfer는 유지하면서 원본 수정·면/엣지 참조·체적과 파일 출력까지 검수한다.
기능 이름을 따로 제공하는 것과 도구 솔리드/Boolean 조합으로 가능한 것을 구분한다.

## 모든 기본 명령의 공통 완료 기준

1. 명령·수치 입력·실제 캔버스 경로와 대상 범위가 일치한다.
2. 모델 허용오차와 화면 스냅 픽셀을 혼용하지 않는다. 원/호는 해석 곡선으로
   보존하며 그리기용 tessellation을 편집 원본으로 쓰지 않는다.
3. 회전/이동한 원본과 XY/XZ/YZ에서 같은 작업의 정확한 결과를 확인한다.
4. 선택·입력·미리보기·취소는 문서 이력을 만들지 않고 확정은 한 Undo다.
5. 레이어·위상·연관 치수·변수·종속 솔리드의 영향을 확인한다. 참조를
   안전하게 옮길 수 없으면 영향을 알리고 거부하며 조용히 연결을 끊지 않는다.
6. 잠금·실패·늦게 도착한 계산·문서 변경은 부분 변경이나 오래된 적용을 남기지 않는다.
7. 전체 Undo/Redo와 저장/다시 열기가 기하뿐 아니라 관계까지 복원한다.
8. 지원하지 않는 조합을 거부하는 기존 테스트와 원하는 기하 결과를 검증하는
   테스트를 구분한다. 기능을 확장할 때 기존 제한 테스트는 새 의도에 맞춰 바꾼다.

## 기본 작업 검수 과제

| 과제 | 확인할 결과 |
| --- | --- |
| 기계 2D 윤곽 | 선/호 결합, 둥근 코너와 Offset, 구간 분할·재결합, 지름/각도 치수, 원본 수정 뒤 돌출·구멍의 독립 면적/체적 검증 |
| 건축 2D 도면 | 벽 윤곽의 Offset·개구부 Break/Trim, 교차 선택 Stretch, 레이어·연속 치수·문자, 지정 축척 PDF와 DXF 왕복 |
| 외부 곡선 도면 | 단위 있는 DXF의 bulge 입력, 끝점/접선 정확성, Join/Explode 후 동일 곡률, 재출력·재가져오기 기하 비교 |
| 기계 스케치/3D | 치수와 접선 관계 변경, 면 위 스케치·절삭·구멍·Shell, 재생성 실패/성공, 독립 체적과 STEP 출력 |

각 과제는 실제 클릭/입력으로 끝낸 뒤 Undo/Redo와 저장 복원을 확인한다.
첫 윤곽 구성 편집 시점의 검수는 Node 417개 / 49 suites와 브라우저 14과제
285개 검사였고, 이 중 새 윤곽/좌표 검수는 Node 22개와 실제 입력 20개다.
이후 확장한 최신 전체 결과는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다.
위 과제의 미구현 기능과 실무자 사용성 평가까지 통과했다는 뜻은 아니다.

## 확장과의 순서

live 2D 미러/배열과 기존 기능은 유지한다. 기본 CAD 정확도와 실패 원자성은 모든 확장에서 지킨다. 전체 CAD backlog를 전부 완료해야 벡터·이미지·레이아웃을 시작할 수 있다는 의미는 아니다. 각 확장의 지원 범위를 명시하고 공통 UI 경험을 연결한다. Shell은 기본 3D 기준에 포함하며, AI·mesh와 고급 CAD 기능의 실행 시점은 공통 대기열에서 결정한다.
정점 편집·Lengthen·Stretch와 첫 곡선 편집 묶음은 구현했다.
닫힌 윤곽 구간 수정·명시적 참조 재연결은 [구현 기록](../implementation/CONTOUR-TRIM-REFERENCES-2026-10-04.md)의 범위로 검증했다. 다음은 **공통 오류 복구·결과 인계의 남은 경계와 치수 편집/출력의 실무 평가**다.
기능별 버튼의 존재뿐 아니라 대상 재선택·재입력·도구 전환 없이 과제를 끝내는지 검수한다.

## 확인한 코드와 검수 기록

- [공개 명령 목록](../../packages/cad-commands/src/commands.ts),
  [도구 UI](../../apps/web/src/ribbon/Ribbon.tsx), [Inspector](../../apps/web/src/properties/PropertiesPanel.tsx).
- [Trim/Extend](../../apps/web/src/features/drawing-editing/geometry/lineEditing.ts),
  [Offset/코너/그립](../../apps/web/src/features/drawing-editing/geometry/drawingOperations.ts),
  [관련 제한 회귀](../../apps/web/tests/precisionRegression.test.ts).
- [해석 윤곽 편집](../../apps/web/src/features/drawing-editing/geometry/contourEditing.ts),
  [관계/소유권 보호 어댑터](../../apps/web/src/features/drawing-editing/commands/contourCommands.ts),
  [캔버스 편집](../../apps/web/src/features/drawing-editing/ui/ContourTool.tsx),
  [정확도·복구 검수](../../apps/web/tests/drawing-editing/contourEditing.test.ts).
- [스냅](../../apps/web/src/precision/snapEngine.ts), [스케치 구속 스키마](../../packages/cad-document/src/Sketch.ts),
  [일반 도면 치수](../../apps/web/src/precision/dimensionGeometry.ts).
- [DXF 입력](../../apps/web/src/interop/dxfParser.ts), [DXF 왕복 검수](../../apps/web/tests/interop.test.ts),
  [출력/편집 경계](../verification/WORKFLOW-VERIFICATION-2026-10-03.md), [기존 live 배열 범위](../architecture/LIVE-PATTERNS.md).

- [B5-F1/F2](../implementation/B5-F12-NUMERIC-PILOT-2026-10-11.md): 단일 cylinder Ø/R·길이·단위와 기존 sketch driver/변수·돌출 distance 수치 Review/Apply pilot 완료. 임의 BRep 치수 편집은 별도 확대다.

접선 원호·두 직선 접선 원, 독립 drawing 기준점 복사, UCS pilot의 실제 사용과 경계는 [X1-B2/B3·X4-A1·X5-A/B 구현](../implementation/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.md)을 따른다.

## 단면·주석·시트 후속 구현 — 2026-10-11

X6-D1/D2·G6-D4·X7-A/E·G6-D5/D6 첫 범위를 구현했다. View → Assembly and drawings에서 기본 평면 clipping·실제 직선/원/호 단면·live/snapshot Leader·모델 연관 일반 치수·수동 1:N 시트 SVG/PDF/DXF를 사용한다. 3부품 기계/단층 Boolean 건축 예제를 검수하며, 일반 BRep 정투영/숨은선·타원/spline·BIM·자동 시트·대규모 성능은 후속이다. [지원 경계](../implementation/SECTION-ANNOTATION-SHEETS-WORKFLOWS-2026-10-11.md).

G6-D5-A1 자동 시트 한 페이지 pilot도 [구현](../implementation/G6-D5-A1-AUTOMATIC-SHEET-LAYOUT-2026-10-11.md)했다. 기존 뷰와 연관 주석/치수의 paper bounds·축척 후보·고정·overflow를 Review/Apply로 배치한다. 다중 페이지·도곽·정렬은 G6-D5-A2 후속이다.
