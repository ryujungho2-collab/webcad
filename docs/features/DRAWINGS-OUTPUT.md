# 도면과 출력

[기능 가이드](README.md) · [후속 곡선/출력 계획](../product/CAD-DRAWING-EXPANSION-PLAN-2026-10-11.md)

이 문서는 모델 뷰·부품·연관 도면·프레임·시트와 CAD 교환을 관리한다. 원본 작도는 [정밀 작도](DRAWING-EDITING.md), 일반 이미지 아트보드와 Scene 출력은 [이미지와 장면](IMAGES-SCENES.md)을 따른다.

## 모델 뷰와 연관 도면

**View → Model views**에서 현재 카메라를 Save current view로 저장한다. Recall/Rename/Update/Delete로 관리하며 Ctrl+K에서도 저장 뷰를 호출할 수 있다. Recall은 카메라/투영·프레이밍을 복원하고 원본·작업면·Undo를 바꾸지 않는다. 활성 스케치가 있으면 먼저 Finish한다.

**View → Assembly and drawings**에서 Part/Placement/Explosion/Projection, Clipping/Section/Note/Sheet/Dimension을 사용한다. 등록 부품의 조립 위치와 비파괴 분해도, 연관 정투영·실제 BRep 단면을 Review/Apply로 만든다.

Clipping은 화면 절단이며 원본 BRep/STEP을 절삭하거나 cap을 만드는 기능이 아니다. Section은 XY/XZ/YZ 평면·높이·범위와 실제 BRep의 교선을 만든다. 정확 line/circle/arc/ellipse 및 지원되는 spline 단면/HLR을 원본과 연결한다. 소유 출력은 해당 도면에서 편집하고 참조 소멸/모호한 위상 대응은 재연결한다.

## 건축 표현·주석

**BRep section → Architectural section presentation**에서 남길 방향/깊이·배경선·해치 간격/각도·선 굵기·이름을 지정한다. 배경은 남긴 BRep의 HLR이며 해치는 닫힌 analytic 경계와 홀을 사용한다. 열린/모호한 경계는 해치를 생략하고 진단한다. **타원/spline 단면·HLR 지원과 타원/spline 해치 지원은 다르며 후자는 후속**이다.

Leader/문자와 길이·지름·면적 값은 live 또는 snapshot으로 붙인다. 일반 연관 치수는 모델 값을 표시하고 모델 driver가 되지 않는다. 원본/배치 변경 뒤 도면·주석의 resolved/stale 상태를 확인한다.

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

periodic/fit-only SPLINE DXF 입력, 네이티브 DWG/SKP·DWG2010·3D Warehouse는 완료 범위 밖이다. 파일 확장자를 바꿔 지원 형식으로 취급하지 않는다.

## 구현·검증 근거

- [모델 뷰](../implementation/G6-A2-MODEL-VIEW-UI-2026-10-09.md), [부품/분해도](../implementation/G6-D123-ASSEMBLY-EXPLODED-PROJECTION-2026-10-11.md), [단면·주석·시트](../implementation/SECTION-ANNOTATION-SHEETS-WORKFLOWS-2026-10-11.md).
- [건축 표현](../implementation/G6-D4-H1-ARCHITECTURAL-EXPRESSION-2026-10-13.md), [타원 HLR](../implementation/G6-D3-B2-CONIC-SEAM-2026-10-13.md), [spline 출력](../implementation/SPLINE-NURBS-OUTPUT-2026-10-13.md).
- [프레임](../implementation/G2-F1-DRAWING-FRAMES-2026-10-11.md), [연속 도면](../implementation/G2-F3-CONTINUOUS-FRAMES-2026-10-12.md), [자동 다중 시트](../implementation/G6-D5-A2-FRAMES-ALIGNMENT-MULTIPAGE-2026-10-11.md), [프레임 시트](../implementation/G6-D5-F1-FRAME-SHEETS-2026-10-11.md).
- [실제 건축 발행](../implementation/G6-D6-W1-ARCHITECTURAL-ISSUE-2026-10-13.md), [오프라인 fixture](../implementation/G6-B-OFFLINE-FIXTURE-2026-10-09.md). 대형 출력 성능 측정은 각 기록의 규모/cold/warm 조건에 한한다.
