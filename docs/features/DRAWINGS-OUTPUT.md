# 도면과 출력

[기능 가이드](README.md) · [후속 곡선/출력 계획](../product/CAD-DRAWING-EXPANSION-PLAN-2026-10-11.md)

이 문서는 모델 뷰·부품·연관 도면·프레임·시트와 CAD 교환을 관리한다. 원본 작도는 [정밀 작도](DRAWING-EDITING.md), 일반 이미지 아트보드와 Scene 출력은 [이미지와 장면](IMAGES-SCENES.md)을 따른다.

2층 카페 과제 (local-only, not in repository: `output/projects/large-cafe/README.md`)에서 12장 2D 발행과 재사용 CAD 에셋, 실제 UI 편집/저장/재열기를 검증했다. 모델 공간 DXF의 치수는 원본 표시 높이와 이동·회전·균등 축척을 보존한다. 시트 DXF의 종이 좌표·표현 축척과 구분한다. [과제와 출력 보완 기록](../implementation/CAFE-2F-01-2026-10-20.md).

## 모델 뷰와 연관 도면

**View → Model views**에서 현재 카메라를 Save current view로 저장한다. Recall/Rename/Update/Delete로 관리하며 Ctrl+K에서도 저장 뷰를 호출할 수 있다. Recall은 카메라/투영·프레이밍을 복원하고 원본·작업면·Undo를 바꾸지 않는다. 활성 스케치가 있으면 먼저 Finish한다.

**View → Assembly and drawings**에서 Part/Placement/Explosion/Projection, Clipping/Section/Note/Sheet/Dimension을 사용한다. 등록 부품의 조립 위치와 비파괴 분해도, 연관 정투영·실제 BRep 단면을 Review/Apply로 만든다.

Clipping은 화면 절단이며 원본 BRep/STEP을 절삭하거나 cap을 만드는 기능이 아니다. Section은 XY/XZ/YZ 평면·높이·범위와 실제 BRep의 교선을 만든다. 정확 line/circle/arc/ellipse 및 지원되는 spline 단면/HLR을 원본과 연결한다. 소유 출력은 해당 도면에서 편집하고 참조 소멸/모호한 위상 대응은 재연결한다.

## 건축 표현·주석

**BRep section → Architectural section presentation**에서 남길 방향/깊이·배경선·해치 간격/각도·선 굵기·이름을 지정한다. 배경은 남긴 BRep의 HLR이며 해치는 검증된 닫힌 곡선 경계와 홀을 사용한다. 열린/모호한 경계는 해치를 생략하고 진단한다. **타원·유한 elliptic arc·양의 가중치 spline/NURBS 해치도 지원**한다. 정확한 곡선 구간에서 교차를 구하며 구멍은 같은 부품의 even/odd 링으로 비워 둔다. 범위 잘림에 임의 cap이나 폐합 선을 추가하지 않는다. 종이 축척 변경 후에도 해치 간격과 선 굵기는 종이 mm다.

곡선 경계 검증은 1e-7 종이 mm 해상도와 유한 예산을 사용한다. 512 source edges·1,024 Bézier pieces·4,000 행·20,000 stroke 한도가 있으며 접촉/자기교차/중복·특이/미수렴 경계·불충분한 좌표 정밀도는 진단한다. 복잡도 판정 실패는 해당 부품 해치를 생략하고, 행/stroke 한도 초과는 간격을 늘리도록 Review 오류를 낸다. 원본 곡선을 폴리라인으로 고치거나 빈 영역을 임의로 채우지 않는다.

해치는 소유된 직선 stroke로 화면·SVG·PDF·DXF에 공유된다. DXF HATCH entity를 추가한 것은 아니다. 기존 degree 1–8·256-pole·양의 가중치와 유한 domain 계약을 유지하며 periodic/fit-only DXF는 아래 별도 경계다. spline 원본 편집 후 대응이 모호해지면 unresolved를 확인하고 해당 단면에서 Review/Apply로 재연결한다. [곡선 해치 구현·검증](../implementation/G6-D4-H2-CURVE-HATCH-2026-10-18.md).

Leader/문자와 길이·지름·면적 값은 live 또는 snapshot으로 붙인다. 일반 연관 치수는 모델 값을 표시하고 모델 driver가 되지 않는다. 원본/배치 변경 뒤 도면·주석의 resolved/stale 상태를 확인한다.

## 정확 HLR과 재계산 자원

native source와 retained slab은 각각 Worker당 128개·64MiB의 **추정 byte 예산**으로 관리한다. 예산 밖/추정 불가 항목은 보관하지 않고 정확하게 다시 계산한다. 형상·실행 중 출력·문서/Undo를 생략하지 않는다. 캐시의 native clone과 mesh용 geometry를 분리해 triangulation이 캐시 추정을 몰래 키우지 않게 한다. Worker 유휴 반환과 JS 결과/GPU 예산은 [프로젝트 가이드](PROJECTS.md)를 따른다.

정확 HLR은 observer 평면의 보수적 BRep 경계가 분리된 경우에만 독립 가림 그룹을 계산한다. 같은 요청 안의 geometry·rotation·scale·상대 배치가 동일한 그룹은 exact 곡선을 공통 translation으로 재배치한다. 닿거나 겹침·불확실/큰 좌표는 global 경로를 유지하고 clipped slab에는 instance 재사용을 적용하지 않는다. 연결된 대형 조립체 전체가 빨라진다는 뜻은 아니다. [G6-D6-P4 구현·계측](../implementation/G6-D6-P4-CACHE-COLD-HLR-2026-10-18.md).

## 프레임과 작업 구역

**2D Draft → Draw frame**은 빈 프레임, **Frame selection**은 선택한 멤버만 포함한 프레임 초안을 만든다. 이름·종이 위치/크기·원본 기준점·축척을 지정해 Review/Apply한다. 경계에 겹친 객체가 자동으로 멤버가 되지 않으며 주석도 명시적으로 포함한다.

프레임 이동/crop 크기 변경은 원본 모델 크기를 바꾸지 않는다. 예를 들어 모델 4000mm를 1:50에 배치하면 종이 표현은 80mm다. 원본이 사라지면 unresolved로 표시하고 출력 전에 멤버를 재지정한다. 작업 구역은 프레임을 묶고 탐색/접기에 사용하며 원본 모델 소유 컨테이너와 구분한다.

**Stitch frames**는 같은 평면·축척의 2–16개 프레임을 common model coordinates 또는 두 기준점으로 연결한다. 세 번째 orientation witness로 방향/반전을 확인하고 seam crop·정확 중복 정책을 Review한다. 같은 모델 뷰 하나 또는 독립 2D 도면 범위이며 반사/scale 정렬·여러 다른 모델 뷰의 임의 병합은 지원하지 않는다. 원본 프레임 정의가 바뀌면 Review source로 갱신한다.

## 시트 배치와 발행

**Model drawing sheet → Automatic sheet layout → Title block and multiple pages**에서 종이·여백·간격·축척 후보·뷰·도곽을 지정한다. 정면/평면/우측면 정렬과 주석을 함께 검토한다. 최대 64뷰·12축척 후보·16페이지의 결정적 배치이며 최적 packing이나 임의 도곽 제작을 보장하지 않는다.

Output page는 SVG/DXF 한 페이지를, Preview model sheet PDF는 시트 묶음을 출력한다. 독립 프레임/작업 구역은 **Frame sheets**에서 시트로 배치한다. 발행 전 숨김·누락·stale·축척·잘림·글꼴과 출력 경고를 확인한다.

## 형식별 지원과 손실

| 형식/경로 | 지원과 제한 |
| --- | --- |
| WebCAD | 편집 의미·관계·내장 asset을 보존한다. 저장/재열기 동작은 [프로젝트](PROJECTS.md)를 따른다. |
| DXF | 단위·OCS·지원 블록/TEXT·bulge와 해당 경로의 exact ELLIPSE/SPLINE을 사용한다. Import/Export Review의 제외·손실을 확인한다. source/model-sheet와 frame DXF의 지원 계약은 다르며 frame 곡선은 명시적 sampled presentation 경로다. |
| SVG/PDF 곡선 | spline paper chord tolerance 0.02mm를 표시한다. SVG는 지원 원본/근사 정보를 포함하고 PDF는 raster 출력이다. 외부/system font 차이와 font 미내장 한계를 확인한다. |
| STEP/STL | 해당 솔리드 export 경로를 사용한다. 깨진 face 참조 등 unresolved 상태는 먼저 재연결한다. 화면 clipping이 원본 export를 절삭하지 않는다. |
| 오프라인 exchange fixture | 독립 선/사각형 JSON 부분집합과 출처·단위·손실 계약이다. 실제 IFC/RVT 변환 완료가 아니다. |

DXF SPLINE 입력은 반복 전 poles가 degree+1개 이상이고 명시적으로 degree개 poles/weights가 반복된 periodic basis를 원래 seam과 유한 domain의 nonperiodic 곡선으로 변환한다. cyclic 편집/periodic flag 손실은 별도 Review 동의를 받는다. fit-only는 열린 degree 3 비유리·2–86점·접선 없는 natural C2 cubic을 chord-length parameter로 재구성한다. fit-point 잔차/선언 tolerance와 원본 점 사이 형상 오차를 알 수 없음을 고지하며 별도 동의 후 가져온다. 단위 override 전 원본 단위의 source-wide 고지를 표시한다. 제외 동의와 변환 동의는 다르다.

SPLINE WCS 좌표는 normal을 OCS 변환으로 적용하지 않는다. 가져온 뒤 pole/weight/domain 편집과 exact finite SPLINE 재출력·재입력을 지원하며, 변환 후 WebCAD는 명시적 control/knot basis를 저장한다. 원래 fit editing·periodic 편집 의미는 저장하지 않는다. implied cyclic poles, 닫힌/periodic/끝점 접선 fit-only, custom LTYPE/font portability는 후속이다. [G6-D5-E2 지원·검증](../implementation/G6-D5-E2-CURVE-DXF-2026-10-18.md).

네이티브 DWG/SKP·DWG2010·3D Warehouse는 완료 범위 밖이다. 파일 확장자를 바꿔 지원 형식으로 취급하지 않는다.

## 구현·검증 근거

- [모델 뷰](../implementation/G6-A2-MODEL-VIEW-UI-2026-10-09.md), [부품/분해도](../implementation/G6-D123-ASSEMBLY-EXPLODED-PROJECTION-2026-10-11.md), [단면·주석·시트](../implementation/SECTION-ANNOTATION-SHEETS-WORKFLOWS-2026-10-11.md).
- [건축 표현](../implementation/G6-D4-H1-ARCHITECTURAL-EXPRESSION-2026-10-13.md), [타원 HLR](../implementation/G6-D3-B2-CONIC-SEAM-2026-10-13.md), [spline 출력](../implementation/SPLINE-NURBS-OUTPUT-2026-10-13.md).
- [프레임](../implementation/G2-F1-DRAWING-FRAMES-2026-10-11.md), [연속 도면](../implementation/G2-F3-CONTINUOUS-FRAMES-2026-10-12.md), [자동 다중 시트](../implementation/G6-D5-A2-FRAMES-ALIGNMENT-MULTIPAGE-2026-10-11.md), [프레임 시트](../implementation/G6-D5-F1-FRAME-SHEETS-2026-10-11.md).
- [실제 건축 발행](../implementation/G6-D6-W1-ARCHITECTURAL-ISSUE-2026-10-13.md), [오프라인 fixture](../implementation/G6-B-OFFLINE-FIXTURE-2026-10-09.md). 대형 출력 성능 측정은 각 기록의 규모/cold/warm 조건에 한한다.

## 출력 전 점검

**File → Output preflight** 또는 명령 검색의 Output preflight로 연다. 저장된 model sheet의 **Check sheet output**은 해당 시트 세트를 선택한다. 점검할 페이지와 PDF/SVG/DXF 형식을 고르면 실제 출력 scene의 썸네일과 페이지별 진단이 나온다.

누락·갱신 필요 참조, 축척 불일치, 해당 writer의 지원 밖 형상은 오류다. 주석 잘림 가능성, 곡선 근사와 frame DXF 평탄화는 경고이며 checked output 전에 동의한다. 폰트 대체·PDF 래스터화 같은 형식 정책은 별도 안내다. 주석 경계는 보수적인 글자 영역 추정이므로 실제 썸네일도 확인한다.

**Show target**으로 이동해 기존 도구에서 수정한 뒤 **Recheck output**한다. 점검과 이동은 형상·잠금·Undo를 바꾸지 않는다. 수정은 기존 Review/Apply/Undo를 사용한다. PDF는 DPI/총 픽셀 예산을 미리 검사하며 큰 프로젝트는 **Sheet set**으로 나눠 출력한다. Checked output은 확인한 scene을 기존 출력기로 보낸다. 기존 직접 출력 명령도 유지된다. [구현·검증·지원 경계](../implementation/G6-D5-Q1-OUTPUT-PREFLIGHT-2026-10-18.md).

## 외부 주거 CAD 가져오기 보완

DWG는 앱에서 직접 읽지 않습니다. 외부 도구에서 DXF로 변환한 뒤 **File → Import DXF**로 가져옵니다. 변환 자체의 손실과 앱의 제외/변환을 구분해서 확인하세요.

MTEXT는 내용과 문단을 편집 가능한 text 행으로 가져옵니다. 서체·rich formatting·자동 줄바꿈·정확한 attachment는 근사입니다. DIMENSION은 원본 표시 블록을 정적 블록으로 보존하며 연관성·치수 객체 편집 의미는 유지하지 않습니다. 폭 있는 polyline은 중심선, SOLID는 채움을 보존합니다. 이러한 변환 동의와 미지원 객체 제외 동의는 별개입니다.

원본에서 숨긴 객체는 가져오기에서 제외하며, 같은 원인의 제외 건수를 묶어 표시합니다. 기본은 배치된 블록의 재귀 의존만 가져옵니다. 준비의 **Omit unused blocks and layers**를 끄고 다시 Review하면 미사용 정의도 포함할 수 있습니다. 누락된 블록은 자동으로 다른 도형으로 추측하지 않습니다.

외부 도면의 모델 좌표 SVG를 바로 종이 도면으로 비교하지 말고, 기존 Drawing frame의 실제 축척과 종이 크기를 지정해 출력하세요. 검증 과제는 A3 1:150으로 발행했습니다. 직선 경계 HATCH는 구멍을 포함한 단색 채움·패턴을 정적 삼각형·선 블록으로 변환합니다. Gradient·곡선 경계는 제외합니다. ACI/truecolor와 ByBlock·ByLayer·블록 layer 0 표현 상속을 지원하며 문서 v48로 저장합니다. 고급 동적 블록과 해치 연관성은 보존하지 않습니다. DXF 재출력은 SOLID/선이며 native HATCH가 아닙니다.

[외부 도면 검증·현재 한계](../implementation/EXT-CIVIL-01-2026-10-18.md).

[2차 개선·실제 파일 검증과 한계](../implementation/EXT-CIVIL-02-2026-10-19.md).

대형 DXF 검토는 준비 단계와 처리 개수를 표시하며 Cancel/Escape로 준비 또는 대기 중인 Apply를 취소할 수 있습니다. 게시가 끝난 뒤에는 Undo를 사용합니다. 파일 parse와 일부 동기 검증은 즉시 중단되지 않습니다. 모델 탐색기는 100행씩 표시하고 검색은 전체 객체를 찾습니다. [3차 구현·측정과 경계](../implementation/EXT-CIVIL-03-2026-10-19.md).

[주거 도면 수정·복원 검증](../implementation/EXT-CIVIL-RESTORE-01-2026-10-19.md): 실제 가져온 선·문 블록·문자 등을 수정한 뒤 Undo와 원래 값 직접 입력으로 복원하고 저장/재열기·DXF 왕복을 확인했습니다. 건축 벽·문 개구부의 의미 기반 연동을 검증한 것은 아닙니다.
