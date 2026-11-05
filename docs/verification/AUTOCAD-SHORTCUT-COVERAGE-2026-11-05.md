# WebCAD의 AutoCAD 실무 단축키 120개 대응표

검사 기준일 2026-11-05. [넥시폼 영상](https://www.instagram.com/reel/DfO8OXWRL1t/)에 붙은 항목 번호를 유지했다. 현재 작업 트리의 실제 키 라우팅, 노출된 UI, 명령 실행 경로를 기준으로 판정했다.

핵심 동작에 대응하는 항목은 **66/120 (55.0%)**이다. 이 가운데 같은 조작으로 시작하는 항목은 **16개**다. 부분 지원까지 포함하면 **97/120 (80.8%)**에서 관련 기능을 사용할 수 있다.

- **같은 조작**은 릴에 나온 입력 중 적어도 하나가 같은 핵심 동작을 시작한다는 뜻이다. 예를 들어 WebCAD의 `L`은 바로 선 도구를 켠다. 이 기준은 AutoCAD 명령행의 별칭 및 옵션 문법 호환을 뜻하지 않는다.
- **다른 조작**은 WebCAD 메뉴·도구·다른 입력으로 핵심 결과를 얻는 항목이다. 일반적인 대상 형상 및 옵션 범위 차이는 표에 기록했다.
- **부분 지원**은 전용 기능의 대상·출력·워크플로가 더 좁거나 관련 대체 기능이 있는 항목이다. `Ctrl+S`처럼 키는 같아도 저장 목적지가 다른 경우도 포함했다.
- **미확인**은 해당 동작에 대응하는 사용자 실행 경로를 현재 코드에서 찾지 못한 항목이다. 비슷한 이름의 내부 기능이나 수동으로 결과를 흉내 내는 방법만으로 구현 판정을 내리지 않았다.

| 범위 | 같은 조작 | 다른 조작 | 부분 지원 | 미확인 |
| --- | ---: | ---: | ---: | ---: |
| 기본 작도·편집 | 4 | 8 | 0 | 0 |
| 선택·편집 조작 | 8 | 3 | 0 | 1 |
| 치수·문자 | 0 | 7 | 4 | 1 |
| 레이어·화면 | 1 | 6 | 2 | 3 |
| 블록·복사·도면 관리 | 0 | 3 | 7 | 2 |
| 측정·좌표·정밀 설정 | 2 | 4 | 5 | 1 |
| 추가 작도·정밀 수정 | 1 | 10 | 1 | 0 |
| 주석·해치·표시 | 0 | 2 | 4 | 6 |
| 레이어 정리·블록 편집 | 0 | 2 | 3 | 7 |
| 도면 점검·출력 | 0 | 5 | 5 | 2 |
| **합계** | **16** | **50** | **31** | **23** |

대표 브라우저 검사는 기존 격리 러너로 실행했다. `shortcutGuide` 13개, `cadPilots` 30개, `draftingWorkflow` 16개 검사 모두 통과했다. 이 결과는 팔레트·키 안내, 기준점 복사·붙이기, UCS, 2D 작도·편집의 대표 동작을 확인한다. 120개 전체에 대한 브라우저 실행 결과는 아니다.

AutoCAD와 충돌하는 키는 특히 `P`(화면 이동 → 폴리선), `I`(블록 삽입 → 거리 측정), `E`(삭제 → 돌출), `F`(필렛 → 보기 맞춤), `H`(해치 → 숨기기), `X`(분해 → 자르기), `S`(신축 → 크기 조정)다. 비교 대상 입력을 그대로 익혀 쓰는 경우 이 차이가 가장 먼저 드러난다.

## 001–012 기본 작도·편집

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 001 | `L` | 같은 조작 | 2D에서 L → Line. | [키 매핑·안내][K] |
| 002 | `PL` | 다른 조작 | P 또는 Polyline 도구로 그린다. | [키 매핑·안내][K] |
| 003 | `C` | 같은 조작 | 2D에서 C → Circle. | [키 매핑·안내][K] |
| 004 | `REC` | 다른 조작 | R 또는 Rectangle 도구로 그린다. | [키 매핑·안내][K] |
| 005 | `TR` | 다른 조작 | X 또는 Modify → Trim. 경계 선택 후 대상 구간을 고른다. | [리본·도구][R] |
| 006 | `EX` | 다른 조작 | Shift+X 또는 Modify → Extend. 경계를 기준으로 늘린다. | [리본·도구][R] |
| 007 | `F` | 다른 조작 | Curve workflow → Fillet에서 2D 곡선 모서리를 둥글게 한다. F는 보기 맞춤이다. | [리본·도구][R] |
| 008 | `O` | 같은 조작 | 편집 가능한 도면 객체를 선택하고 O로 Offset을 연다. | [키 매핑·안내][K] |
| 009 | `M` | 같은 조작 | 선택 후 M으로 이동. 2D는 기준점 이동, 3D는 정밀 이동이다. | [앱 키 라우팅][A] |
| 010 | `CO / CP` | 다른 조작 | 2D Shift+C 또는 Copy by points. Ctrl+D는 제자리 복제 경로다. | [앱 키 라우팅][A] |
| 011 | `H` | 다른 조작 | Drafting → Associative hatch. H는 선택 숨기기다. | [Drafting][D] |
| 012 | `SC` | 다른 조작 | S 또는 Scale selection. AutoCAD의 S(STRETCH)와 충돌한다. | [키 매핑·안내][K] |

## 013–024 선택·편집 조작

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 013 | `MI` | 다른 조작 | Mirror에서 평면 곡선을 지정 축에 대칭 복제한다. | [배열·대칭][P] |
| 014 | `E` | 다른 조작 | Delete 또는 Inspector → Delete. E는 Extrude다. | [앱 키 라우팅][A] |
| 015 | `U / Ctrl+Z` | 같은 조작 | Ctrl+Z는 문서 Undo. U 별칭 경로는 확인되지 않았다. | [키 매핑·안내][K] |
| 016 | `Ctrl+Y` | 같은 조작 | Ctrl+Y로 문서 Redo. Ctrl+Shift+Z도 지원한다. | [키 매핑·안내][K] |
| 017 | `Esc` | 같은 조작 | 현재 도구 취소·단계 복귀, 대기 상태에서 선택 해제. | [앱 키 라우팅][A] |
| 018 | `Delete` | 같은 조작 | 선택한 편집 가능 객체를 삭제한다. | [앱 키 라우팅][A] |
| 019 | `Shift+클릭` | 같은 조작 | 선택된 객체는 제외한다. 미선택 객체에 적용하면 추가한다. | [선택 상태][SEL] |
| 020 | `왼쪽→오른쪽` | 같은 조작 | 빈 공간에서 왼쪽→오른쪽 드래그. 완전히 포함된 객체를 고른다. | [뷰포트 선택][V] |
| 021 | `오른쪽→왼쪽` | 같은 조작 | 빈 공간에서 오른쪽→왼쪽 드래그. 교차한 객체도 고른다. | [뷰포트 선택][V] |
| 022 | `Enter / Space` | 같은 조작 | 캔버스 대기 상태에서 지원되는 직전 명령 반복. 편집창과 버튼은 자기 입력을 처리한다. | [앱 키 라우팅][A] |
| 023 | `더블클릭` | 미확인 | 일반 캔버스 객체의 종류별 더블클릭 편집 경로를 확인하지 못했다. Inspector·F2·Edit Sketch 경로는 별도다. | [뷰포트 선택][V] |
| 024 | `RO` | 다른 조작 | Shift+R 또는 Rotate selection. 2D는 지정 중심 회전이다. | [앱 키 라우팅][A] |

## 025–036 치수·문자

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 025 | `DLI` | 다른 조작 | 선 선택 → Add dimension → Annotation Orientation에서 Horizontal 또는 Vertical. | [Properties][I] |
| 026 | `DAL` | 다른 조작 | 선 선택 → Add dimension. 기본 Aligned로 선 방향 길이를 표시한다. | [Properties][I] |
| 027 | `DCO` | 부분 지원 | Drafting → Continuous dimensions는 선·폴리선 구간을 연속 치수로 만든다. 기존 치수 끝을 골라 이어 붙이는 동작은 확인되지 않았다. | [Drafting][D] |
| 028 | `DBA` | 미확인 | 공통 시작점에 묶인 기준선 치수 생성 도구를 확인하지 못했다. | [Drafting][D] |
| 029 | `DRA` | 다른 조작 | 원 선택 → Add dimension으로 반지름 주석을 만든다. | [치수 생성][DIM] |
| 030 | `DDI` | 다른 조작 | 원 또는 원호 → Add diameter dimension. 균일 변환 등 검증을 거친다. | [치수 생성][DIM] |
| 031 | `DAN` | 다른 조작 | Draw → Angular Dimension에서 두 직선 모서리를 지정한다. | [리본·도구][R] |
| 032 | `D` | 부분 지원 | 치수별 단위·정밀도·화살표·글자 크기 편집. 이름 붙인 치수 스타일 관리자는 확인되지 않았다. | [Properties][I] |
| 033 | `DIM` | 부분 지원 | Add dimension이 선·원 종류에 따라 선형·반지름을 선택한다. 지름·각도는 별도 도구다. | [치수 생성][DIM] |
| 034 | `T / MT` | 부분 지원 | T로 단일행 Text를 연다. MTEXT의 문단·서식 편집과 MT 별칭은 확인되지 않았다. | [Drafting][D] |
| 035 | `DT` | 다른 조작 | T 또는 Draw → Text에서 단일행 문자, 위치·높이·각도를 편집한다. | [Drafting][D] |
| 036 | `TEXTEDIT` | 다른 조작 | 문자는 Drafting, 치수 문자는 Inspector Annotation에서 수정한다. | [Properties][I] |

## 037–048 레이어·화면

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 037 | `LA` | 다른 조작 | 왼쪽 Explorer → Layers에서 레이어를 관리한다. | [레이어 패널][LAY] |
| 038 | `MA` | 미확인 | 원본 객체를 찍어 대상 객체에 특성을 일괄 복사하는 도구를 확인하지 못했다. 라이브러리 스타일 적용은 별도다. | [라이브러리][LIB] |
| 039 | `Z → Enter → E → Enter` | 다른 조작 | Fit all geometry 버튼 또는 팔레트. F는 선택이 없을 때 전체에 맞춘다. | [키 매핑·안내][K] |
| 040 | `P` | 다른 조작 | 휠 버튼 드래그로 화면 이동. WebCAD P는 Polyline이다. | [키 매핑·안내][K] |
| 041 | `휠 회전` | 다른 조작 | Ctrl+휠로 커서 중심 확대·축소. 일반 휠은 화면 상하 이동이다. | [키 매핑·안내][K] |
| 042 | `휠 버튼 드래그` | 같은 조작 | 휠 버튼을 누른 채 드래그하면 화면을 이동한다. | [키 매핑·안내][K] |
| 043 | `Ctrl+0` | 부분 지원 | Explorer와 Properties를 각각 접을 수 있다. 한 키로 전체 UI를 접는 모드는 확인되지 않았다. | [화면 셸][SH] |
| 044 | `Ctrl+9` | 미확인 | 명령행 표시·숨김 경로가 없다. Ctrl+K는 명령 검색 팔레트다. | [화면 셸][SH] |
| 045 | `Ctrl+2` | 부분 지원 | Library에서 프로젝트·다른 WebCAD 파일의 컴포넌트와 제공 스타일을 탐색한다. DWG DesignCenter 전체 범위와 다르다. | [라이브러리][LIB] |
| 046 | `RE` | 미확인 | 사용자가 호출하는 REGEN 화면 재생성 명령을 확인하지 못했다. | [명령 팔레트][PAL] |
| 047 | `Ctrl+Tab` | 다른 조작 | 프로젝트 탭 클릭·방향키 또는 Alt+Shift+P로 전환. Ctrl+Tab은 브라우저에 맡긴다. | [키 매핑·안내][K] |
| 048 | `3DO` | 다른 조작 | 3D에서 Shift+휠 버튼 드래그 또는 Alt+휠로 시점을 회전한다. | [키 매핑·안내][K] |

## 049–060 블록·복사·도면 관리

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 049 | `B` | 다른 조작 | Components → Create 또는 Drafting → Define block from selection. | [컴포넌트 패널][COMP] |
| 050 | `I` | 다른 조작 | Components → Insert 또는 Drafting → Insert block. I 키는 거리 측정이다. | [Drafting][D] |
| 051 | `W` | 미확인 | 선택 객체·블록을 별도 DWG로 쓰는 경로를 확인하지 못했다. WebCAD·DXF 출력은 별도다. | [파일 메뉴][MENU] |
| 052 | `X` | 다른 조작 | 폴리선·사각형은 Explode, 블록 인스턴스는 Disband block. X 키는 Trim이다. | [리본·도구][R] |
| 053 | `AR` | 부분 지원 | 행·열 배열과 중심 기준 원형 배열이 있다. 임의 경로를 따라 배치하는 AR 옵션은 확인되지 않았다. | [배열·대칭][P] |
| 054 | `Ctrl+Shift+C` | 부분 지원 | Base Point Copy/Paste에서 기준점 복사. 같은 문서의 지원 독립 2D 도형에 한정된다. | [기준점 복사 계약][CLIP] |
| 055 | `Ctrl+V` | 부분 지원 | 위 도구에서 붙일 점을 정해 Review/Apply. OS 클립보드 Ctrl+V로 CAD 객체를 붙이는 경로는 확인되지 않았다. | [기준점 복사 계약][CLIP] |
| 056 | `Ctrl+Shift+V` | 미확인 | 클립보드 내용을 바로 블록으로 붙이는 경로를 확인하지 못했다. 블록 생성·삽입은 별도다. | [기준점 복사 계약][CLIP] |
| 057 | `PASTEORIG` | 부분 지원 | 같은 문서에서 복사 기준점과 동일한 좌표를 붙여넣기 대상으로 지정할 수 있다. 전용 명령과 문서 간 붙이기는 확인되지 않았다. | [기준점 복사 계약][CLIP] |
| 058 | `Ctrl+S` | 부분 지원 | 같은 키가 브라우저 로컬 복구본을 저장한다. 내려받은 원본 파일을 갱신하는 동작과 다르다. | [키 매핑·안내][K] |
| 059 | `Ctrl+Shift+S` | 부분 지원 | 같은 키로 WebCAD 파일 다운로드를 시작한다. AutoCAD의 파일명·포맷을 고르는 SAVEAS와 범위가 다르다. | [키 매핑·안내][K] |
| 060 | `XR` | 부분 지원 | DXF를 별도 잠긴 참조 레이어로 가져올 수 있다. 원본 DWG와 연결된 재로드·분리 관리는 확인되지 않았다. | [DXF 참조][DXF] |

## 061–072 측정·좌표·정밀 설정

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 061 | `DI` | 다른 조작 | I 또는 Measure distance에서 두 점을 잰다. | [리본·도구][R] |
| 062 | `AA` | 부분 지원 | 지원 닫힌 객체의 면적·둘레를 Inspector에서 확인. AREA처럼 임의 점을 이어 재는 전용 도구는 확인되지 않았다. | [Properties][I] |
| 063 | `LI` | 다른 조작 | 선택 객체의 종류·형상 수치·속성을 Inspector에서 확인한다. | [Properties][I] |
| 064 | `ID` | 부분 지원 | UCS Pilot에서 점을 찍으면 로컬 U,V가 입력된다. 전용 3축 점 좌표 조회 명령은 확인되지 않았다. | [UCS 및 기준점 도구][UCS] |
| 065 | `PR / Ctrl+1` | 다른 조작 | Properties 패널 열기 또는 Ctrl+K → Toggle Properties panel. | [명령 팔레트][PAL] |
| 066 | `CAL` | 부분 지원 | Variables와 지원 수치 입력에서 단위·수식을 평가한다. 독립 CAL 명령은 확인되지 않았다. | [변수·수식][VAR] |
| 067 | `Ctrl+8` | 미확인 | 빠른 계산기 패널을 확인하지 못했다. | [키 매핑·안내][K] |
| 068 | `OS` | 다른 조작 | 상태 표시줄 → Snaps에서 스냅 종류와 감지 반경 설정. | [스냅 설정][SNAP] |
| 069 | `F3` | 같은 조작 | 객체 스냅 켜기·끄기. | [앱 키 라우팅][A] |
| 070 | `F8` | 같은 조작 | 직교 모드 켜기·끄기. | [앱 키 라우팅][A] |
| 071 | `F10 / F11` | 부분 지원 | 도형 입력 중 Shift+A로 스냅 추적 기준을 잡고 Shift+L로 수평·수직 방향을 고른다. 극각은 직접 입력하고 잠글 수 있다. F10/F11 전환은 확인되지 않았다. | [동적 입력·추적][TRACK] |
| 072 | `F12` | 부분 지원 | 커서 주변 숫자·좌표·거리·각도 입력과 Tab 전환이 있다. F12 켜기·끄기는 확인되지 않았다. | [동적 입력·추적][TRACK] |

## 073–084 추가 작도·정밀 수정

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 073 | `A` | 같은 조작 | 2D에서 A로 Arc 작도. | [키 매핑·안내][K] |
| 074 | `POL` | 다른 조작 | Regular polygon 도구에서 변 수와 반지름을 지정한다. | [명령 팔레트][PAL] |
| 075 | `EL` | 다른 조작 | Ellipse 도구 또는 Ctrl+K에서 그리기·편집. | [명령 팔레트][PAL] |
| 076 | `XL` | 다른 조작 | Construction → Independent infinite line. | [보조선 작도][CON] |
| 077 | `SPL` | 다른 조작 | Spline/NURBS에서 통과점 또는 제어점으로 작성한다. | [명령 팔레트][PAL] |
| 078 | `BO` | 부분 지원 | Floor plan tasks → Make face에서 선택한 닫힌 경계로 면을 만든다. 내부점을 찍어 독립 경계 폴리선을 만드는 BO와 출력·조작이 다르다. | [경계·PURGE][FLOOR] |
| 079 | `S` | 다른 조작 | Modify → Stretch로 교차 영역의 꼭짓점을 이동한다. S 키는 Scale이다. | [리본·도구][R] |
| 080 | `CHA` | 다른 조작 | Curve workflow → Chamfer로 2D 곡선 모서리를 깎는다. | [리본·도구][R] |
| 081 | `J` | 다른 조작 | Modify → Join으로 연결 가능한 열린 곡선을 결합한다. | [리본·도구][R] |
| 082 | `PE` | 다른 조작 | Modify → Edit polyline에서 꼭짓점 추가·삭제, 열기·닫기, 선·호 전환. | [리본·도구][R] |
| 083 | `BR` | 다른 조작 | Break contour에서 한 점 분할 또는 두 점 사이 제거. | [윤곽 끊기][CONT] |
| 084 | `LEN` | 다른 조작 | Modify → Lengthen에서 전체 길이·증분·백분율 등을 편집한다. | [리본·도구][R] |

## 085–096 주석·해치·표시

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 085 | `AL` | 부분 지원 | Arrange로 경계·중심을 맞춘다. 기준점 쌍으로 회전·이동·축척하는 일반 ALIGN은 확인되지 않았다. | [명령 팔레트][PAL] |
| 086 | `OVERKILL` | 부분 지원 | Floor plan tasks에서 중복 경계를 진단한다. 일반 객체 중복·겹침 자동 정리는 확인되지 않았다. | [경계·PURGE][FLOOR] |
| 087 | `DRAWORDER` | 부분 지원 | Image Inspector에서 이미지 앞뒤 순서를 변경한다. 일반 벡터 객체·해치의 범용 표시 순서 명령은 확인되지 않았다. | [이미지 순서][IMG] |
| 088 | `HATCHEDIT` | 다른 조작 | 해치 선택 → Drafting에서 각도·간격을 수정한다. | [Drafting][D] |
| 089 | `HATCHTOBACK` | 미확인 | 해치 전체를 뒤로 보내는 사용자 명령을 확인하지 못했다. | [명령 팔레트][PAL] |
| 090 | `ST` | 미확인 | 문자 높이·회전은 편집할 수 있지만 글꼴·이름 붙인 문자 스타일 관리 도구는 확인되지 않았다. | [Drafting][D] |
| 091 | `MLEADER` | 부분 지원 | Assembly and drawings → Model note에 모델과 연결된 지시선 주석이 있다. 범용 다중 지시선 작성은 확인되지 않았다. | [모델 주석][NOTE] |
| 092 | `MLEADERSTYLE` | 미확인 | 다중 지시선 스타일 관리자를 확인하지 못했다. | [모델 주석][NOTE] |
| 093 | `DIMEDIT` | 다른 조작 | Annotation에서 치수 문자·방향·오프셋을 편집한다. 각도 치수는 전용 편집 경로를 쓴다. | [Properties][I] |
| 094 | `DIMSPACE` | 미확인 | 기존 치수의 간격을 일괄 정리하는 도구를 확인하지 못했다. | [Properties][I] |
| 095 | `DIMBREAK` | 미확인 | 치수선 겹침 지점에 틈을 넣는 전용 도구를 확인하지 못했다. | [Properties][I] |
| 096 | `DIMCENTER` | 미확인 | 원·호 중심 표시 주석 도구를 확인하지 못했다. 중심 스냅은 점 선택 기능이다. | [스냅 설정][SNAP] |

## 097–108 레이어 정리·블록 편집

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 097 | `LAYISO` | 미확인 | 레이어 단위 격리 명령을 확인하지 못했다. Isolate selection은 객체 단위다. | [레이어 패널][LAY] |
| 098 | `LAYUNISO` | 미확인 | 레이어 격리 이전 상태를 복원하는 전용 경로를 확인하지 못했다. | [레이어 패널][LAY] |
| 099 | `LAYOFF` | 다른 조작 | Layers에서 해당 레이어의 표시를 끈다. 객체를 클릭해 레이어를 끄는 방식은 아니다. | [레이어 패널][LAY] |
| 100 | `LAYON` | 부분 지원 | Layers에서 레이어별로 켤 수 있다. 모든 레이어를 한 번에 켜는 동작은 확인되지 않았다. | [레이어 패널][LAY] |
| 101 | `LAYFRZ` | 미확인 | 레이어 잠금·가시성은 있으나 별도 동결 상태는 확인되지 않았다. | [레이어 패널][LAY] |
| 102 | `LAYTHW` | 미확인 | 레이어 동결 해제 명령을 확인하지 못했다. | [레이어 패널][LAY] |
| 103 | `LAYMCUR` | 부분 지원 | Layers에서 레이어 행을 눌러 활성화한다. 도형을 찍어 그 레이어를 활성화하는 전용 경로는 확인되지 않았다. | [레이어 패널][LAY] |
| 104 | `LAYCUR` | 다른 조작 | 선택 객체의 Properties에서 현재 레이어를 대상 값으로 지정한다. | [Properties][I] |
| 105 | `BEDIT` | 부분 지원 | Components → Update from selection으로 정의를 교체하고 인스턴스를 갱신한다. 정의 내부를 직접 편집하는 별도 편집기는 확인되지 않았다. | [컴포넌트 패널][COMP] |
| 106 | `BCLOSE` | 미확인 | 별도 블록 편집 세션을 닫는 동작을 확인하지 못했다. | [컴포넌트 패널][COMP] |
| 107 | `ATTEDIT` | 미확인 | 블록 속성 태그·값의 전용 편집 경로를 확인하지 못했다. | [컴포넌트 패널][COMP] |
| 108 | `ATTSYNC` | 미확인 | 정의의 태그 변경을 인스턴스 속성에 동기화하는 명령을 확인하지 못했다. 블록 형상 갱신과 별개다. | [컴포넌트 패널][COMP] |

## 109–120 도면 점검·출력

| 번호 | AutoCAD 입력 | 판정 | WebCAD 경로와 범위 | 근거 |
| ---: | --- | --- | --- | --- |
| 109 | `PU` | 부분 지원 | Floor plan tasks → Review PURGE. 미사용 블록 정의·빈 미참조 레이어 대상이다. | [경계·PURGE][FLOOR] |
| 110 | `AUDIT` | 미확인 | 도면 전체 오류를 검사·수리하는 전용 명령을 확인하지 못했다. 출력 Preflight와 로드 검증은 별도다. | [파일 메뉴][MENU] |
| 111 | `RECOVER` | 미확인 | 손상 파일을 열어 수리하는 도구를 확인하지 못했다. 이전 유효 로컬 체크포인트 복구는 별도다. | [복구 체크포인트][REC] |
| 112 | `UNITS` | 부분 지원 | 문서 모델은 mm 기준이다. 필드별 단위 입력 및 치수 표시 단위가 있다. 문서 전체 UNITS 설정은 확인되지 않았다. | [Properties][I] |
| 113 | `UCS` | 부분 지원 | Inspector에서 사용자 평면 정의, UCS Pilot에서 선·원·이동에 적용. 전체 작도 도구의 좌표계를 바꾸는 방식과 다르다. | [UCS 및 기준점 도구][UCS] |
| 114 | `PLAN` | 다른 조작 | UCS Pilot → Look at active UCS로 활성 좌표계 정면에서 본다. | [UCS 및 기준점 도구][UCS] |
| 115 | `ISOLATEOBJECTS` | 다른 조작 | Isolate selection으로 선택 객체만 보여준다. | [격리·복원][VIS] |
| 116 | `UNISOLATEOBJECTS` | 다른 조작 | Exit isolation 또는 Show all objects. 레이어 가시성과 잠금은 별도다. | [격리·복원][VIS] |
| 117 | `Ctrl+P` | 다른 조작 | File → Plot PDF에서 PDF 출력 대화상자를 연다. Ctrl+P 전용 라우팅은 확인되지 않았다. | [파일 메뉴][MENU] |
| 118 | `PAGESETUP` | 부분 지원 | Plot PDF에서 종이·방향·축척 설정. 이름 붙인 레이아웃 설정과 출력 장치 관리자는 확인되지 않았다. | [PDF 플롯][PLOT] |
| 119 | `PREVIEW` | 부분 지원 | 아트보드 PDF에서 첫 페이지 미리 보기 제공. 활성 평면 Plot PDF는 용지 크기·내용·적합 여부를 요약한다. | [아트보드 PDF][PDF] |
| 120 | `EXPORTPDF` | 다른 조작 | File → Plot PDF 또는 Artboard PDF로 PDF 파일을 출력한다. | [파일 메뉴][MENU] |

[K]: ../../apps/web/src/input/shortcutCatalog.ts#L1
[A]: ../../apps/web/src/App.tsx#L1630
[R]: ../../apps/web/src/ribbon/Ribbon.tsx#L225
[D]: ../../apps/web/src/properties/DraftingPanel.tsx#L17
[P]: ../../apps/web/src/commands/interactionTools.ts#L4
[SEL]: ../../apps/web/src/state/selection.ts#L13
[V]: ../../apps/web/src/viewport/CadViewport.tsx#L1945
[I]: ../../apps/web/src/properties/PropertiesPanel.tsx#L768
[DIM]: ../../apps/web/src/state/dimensionCommands.ts#L18
[LAY]: ../../apps/web/src/explorer/views/LayersPanel.tsx#L85
[LIB]: ../../apps/web/src/library/LibraryPanel.tsx#L18
[SH]: ../../apps/web/src/app/AppShell.tsx#L169
[PAL]: ../../apps/web/src/commands/paletteCommands.ts#L29
[COMP]: ../../apps/web/src/explorer/views/ComponentsPanel.tsx#L45
[MENU]: ../../apps/web/src/menu/MenuBar.tsx#L115
[CLIP]: ../../apps/web/src/state/cadPilotCommands.ts#L18
[DXF]: ../../apps/web/src/interop/DxfPreparationDialog.tsx#L56
[UCS]: ../../apps/web/src/viewport/CadPilotTool.tsx#L60
[VAR]: ../../apps/web/src/properties/VariablesPanel.tsx#L51
[SNAP]: ../../apps/web/src/status/SnapSettings.tsx#L13
[TRACK]: ../../apps/web/src/viewport/CadViewport.tsx#L3411
[CON]: ../../apps/web/src/viewport/ConstructionTool.tsx#L23
[FLOOR]: ../../apps/web/src/interop/FloorPlanTaskPanel.tsx#L44
[CONT]: ../../apps/web/src/features/drawing-editing/ui/ContourTool.tsx#L223
[IMG]: ../../apps/web/src/properties/ImageInspector.tsx#L163
[NOTE]: ../../apps/web/src/viewport/ModelDrawingPanel.tsx#L43
[REC]: ../../apps/web/src/state/documentFile.ts#L47
[VIS]: ../../apps/web/src/App.tsx#L1615
[PLOT]: ../../apps/web/src/plot/PlotDialog.tsx#L49
[PDF]: ../../apps/web/src/export/ArtboardPdfDialog.tsx#L158

