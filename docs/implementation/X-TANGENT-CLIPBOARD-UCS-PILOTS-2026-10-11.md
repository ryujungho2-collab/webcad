# X1-B2/B3 · X4-A1 · X5-A/B pilot 구현

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-11. 요청한 순서의 다섯 카드를 실제 작성 명령·Ribbon/검색·캔버스 Review/Apply에 연결했다. X1-B는 B1/B2/B3 지원 범위에서 완료, X4-A는 A1 완료/A2 대기, X5는 A/B pilot 완료/C 대기다. 다음 실행 카드는 G6-D1이다.

## 사용

Draw Ribbon 또는 명령 검색에서 다음 도구를 연다.

| 도구 | 입력과 결과 |
| --- | --- |
| Start Tangent Arc | 시작/끝 좌표·단위·상대/극좌표와 시작 접선 deg/rad. Reverse start tangent로 동일 원의 상보 sweep을 선택. 중심·반지름·sweep과 캔버스 ghost를 검토하고 Apply |
| Two Line Tangent Circle | 두 straight drawing line·반지름·중심 가지. 기본은 유한 선분 접점이며 Allow line extensions를 명시해야 연장선 후보를 사용. 중심/두 접점을 표시 |
| Base Point Copy/Paste | 독립 drawing 선택 후 world X,Y,Z 기준점을 입력하고 Copy. world 목표점을 입력하여 Review/Apply. 같은 clipboard를 반복 Paste |
| UCS Pilot | B5의 저장 work plane을 Active UCS로 선택하거나 Return to WCS. 로컬 U,V Line/Circle 또는 선택 객체의 U,V,N Move를 Review/Apply. Look at active UCS와 Fit pilot preview로 화면 맞춤 |

접선 원/호는 작성 시점에 획득한 기존 circle/arc 원본이다. 원본 직선을 편집해도 새 접선 원은 자동 이동하지 않는다. 영구 접선 구속이 필요한 경우 기존 sketch 관계 편집을 사용한다. 일반/면 sketch에는 기존 curve ID·반지름 driver·profile/돌출 경로로 편입한다.

## 계산·문서·이력 계약

- 시작 접선은 방향을 가진다. 왼쪽 법선 N과 chord D에서 k=|D|²/(2D·N), C=S+kN이며 k 부호가 sweep 방향을 정한다. 접선 반전은 같은 중심/반지름에서 큰 호와 작은 호를 전환한다. 평행 chord·겹친 끝점·비유한 값·허용오차 밖의 퇴화는 거부한다. 공개 명령 tangentAngle은 radian이다.
- 두 직선의 offset 교점에서 네 중심 가지를 계산하고 각 접점의 유한 도메인을 검사한다. 평행/일치 직선에는 isolated 중심이 없어 거부한다. 교점/접점 잔차도 공통 정밀도로 검사한다.
- Copy는 History를 만들지 않는다. 내부 clipboard는 document ID·기준점·독립 원본 params·배치·레이어·벡터 스타일의 복제이며 읽어온 payload 수정이나 원본 변경/삭제로 변하지 않는다. Paste마다 object/feature/geometry/topology ID를 새로 만들고 target−base world delta를 배치에 더한다. 일부 멤버 실패는 전체 거부하며 한 Paste는 한 Undo다.
- clipboard는 같은 문서의 1–64개 독립 finite line/polyline/rectangle/circle/arc/point를 지원한다. sketch·construction·pattern·parameter binding·solid·annotation의 관계 closure, 다른 문서, OS clipboard/Ctrl+V는 X4-A2 이후다. 지원 밖의 선택은 대상 이름과 이유를 표시한다. 타깃 레이어가 없거나 숨김/잠금이면 Paste를 거부한다.
- UCS active ID는 App session state다. frame은 기존 CadWorkPlane 문서 데이터다. 좌표계 선택/복귀는 History나 기존 객체를 변경하지 않으며 재열기에서 WCS로 시작한다. 면 source가 사라지거나 모호하면 새 작성/로컬 Move를 차단하고 기존 B5 명시적 재연결 경로를 사용한다.
- Line/Circle은 로컬 XY drawing과 기존 object TRS로 저장한다. 원의 모델 pivot을 frame basis와 함께 변환하여 정확한 world 중심을 유지한다. local Move의 delta는 origin을 더하지 않고 U/V/N 축으로만 world 변환한다. 기존 sketch/pattern/construction 소유는 해당 소유 편집으로 인계한다.
- 모든 Apply는 기존 detached proposal·문서 버전 검사·재생성·History 경로를 사용한다. 입력/문서/좌표계 변경은 이전 Review를 폐기한다. ray pick와 snap은 공통 frame resolver를 사용하며 Alt는 snap을 우회한다. UCS Fit과 화면 정렬은 활성 frame 방향을 유지하며 좌표 활성화 자체는 카메라를 바꾸지 않는다.

## 렌더링·출력

기존 drawing renderer, world geometry, sketch adapter, topology/driver 및 JSON 경로를 사용한다. 새 문서 schema/version은 필요하지 않다. 기존 DXF analytic OCS 경로로 기울어진 UCS 원을 실제 재가져오기하여 world 중심을 검증했다. 접선 arc/circle의 기존 아트보드 SVG 출력도 검증했다. UCS 전용 sheet/frame 참조·연관 정투영·모든 도구의 임의 평면 SVG/PDF 정책은 X5-C/G6-D 후속이다. 현재 보드는 기존 principal workPlane 선택/투영 계약을 따른다.

## 검수

전체 Node 1,016 tests / 54 suites, fail·skip 0. 신규 수치/관계/원자성 19 tests. 타입 검사·architecture 452 modules·전체 workspace production build 통과. 대상 native Edge/CDP 브라우저 7 workflows / 131 checks: cadPilots 30, x1EndpointRadiusArc 15, b5WorkPlanes 8, b5FaceSketch 5, basicEditWorkflow 31, dxfOcs 18, modelViews 24. 전체 browser suite 재실행은 아니다.

실제 화면에서 접선 반전/퇴화, 유한/연장선 후보, detached ghost, 반복 Paste/Undo, UCS 활성화와 로컬 작성/Move, 보이는 캔버스의 물리 포인터 snap/Alt, 캐시 저장 후 실제 location.reload 및 WCS 초기화를 검증했다. 수치 oracle은 원호 끝점/접선·접점·기울어진 world 배치·독립 체적·DXF 왕복을 비교한다.

검수 중 UCS 원 pivot 누락과 Fit의 기존 XY 복귀를 수정했다. 최초 포인터 검사는 입력값이 이미 같아 가려진 캔버스 클릭을 잡지 못했으므로 hit-test와 다른 끝점 획득으로 강화했고 실제 Fit 오류를 재현했다. 테스트 상수 scope, 필수 style fixture, 기존 solver/BRep 체적 허용오차와 SVG 폐합 assertion을 수정한 후 마감했다. [실행 증거](../verification/X-TANGENT-CLIPBOARD-UCS-PILOTS-2026-10-11.json).

## 후속

X4-A2는 소유 관계 closure·typed remap·지원 matrix, X5-C는 Arc/Polyline·작도·치수·pattern·교환 확대다. 다음 제품 실행은 G6-D1 부품 identity/조립 위치 → G6-D2 비파괴 분해도 → G6-D3 모델 연관 정투영이다.
