# B2-C arc–arc와 닫힌 윤곽 코너

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. 독립 유한 원호 두 개의 Fillet/Chamfer와 닫힌 다중선의 인접 line–arc/arc–arc 코너를 구현했다. 두 연산을 각각 독립 기하 oracle과 실제 UI로 검증했다.

## 사용

독립 원호 두 개를 선택하고 Modify → Curve workflow → Fillet 또는 Chamfer를 연다. Fillet은 Radius, Chamfer는 D1/D2에 길이 단위를 입력한다. Pick target branch / Pick second branch는 남길 부분을 지정한다. 미지정 시 각 첫 segment의 35% 위치를 사용한다. 복수 해는 Tangent solution에서 T1/T2 좌표를 비교해 선택한 뒤 Review/Apply한다.

닫힌 다중선 하나를 선택한 경우 **Closed contour corner**를 켜고 Corner의 Vertex를 선택한다. D1은 선택 정점으로 들어오는 segment, D2는 나가는 segment의 길이다. 원호에서는 chord가 아니라 원호를 따라 잰 길이로 절단한다. 첫 정점에서 마지막 segment와 첫 segment를 연결하는 코너도 지원한다. 적용 후 같은 객체가 유지되어 Offset 등 다음 작업을 진행할 수 있다.

독립 원호 적용은 두 원본 trim과 connector 하나 생성, 내부 코너 적용은 동일 닫힌 contour의 두 trim과 connector segment 삽입을 한 Undo로 게시한다. Preview와 Cancel은 문서/History를 변경하지 않는다. radius·거리·가지·정점·대상·문서가 바뀌면 기존 선택과 Review를 무효화한다.

## 기하·보존 계약

Fillet 중심은 원본 원 C1/C2에 대해 signed R±r 거리의 두 원을 해석적으로 교차시켜 구한다. 중심과 원본 중심의 방향으로 접점을 구하고 실제 유한 sweep 내부, 유지 pick, 양쪽 진행 방향의 G1 접선 조건을 모두 만족하는 후보만 남긴다. 내접/외접과 CW/CCW, 객체 순서, elevated XY/XZ/YZ, 평면 회전·균일 scale·반사를 보존한다. display tessellation으로 접점을 계산하지 않는다.

독립 arc–arc Chamfer는 실제 유한 원호의 교점을 코너로 삼고 D1/D2를 원호 길이로 각각 이동한다. 닫힌 코너는 이미 공유한 정점을 기준으로 인접 segment를 자른다. 거리 소멸, 범위 밖 접점, pick를 제거하는 해, full circle/동심 무한 해, 비유한 수치, 자기교차·퇴화 폐합은 거부한다. 자동 연장은 하지 않는다.

원본 standalone arc의 center/radius와 남길 endpoint, 객체/기존 topology ID를 보존한다. 닫힌 contour는 선택 vertex ID를 첫 접점에 유지하고 새 vertex와 connector ID를 추가한다. incoming/outgoing segment ID와 다른 segment/bulge는 유지하며 결과는 closed polyline이다. 공통 명령 재생성·관계 갱신·잠금·stale plan·History·파일 저장 계약을 재사용한다. serialization version 변경은 없다.

`connect-drawings`와 `edit-drawing-corner`의 optional `solutionIndex`는 0–7 정수다. 실제 해가 여러 개인 경우 생략을 거부하고, 현재 후보에 없는 index도 거부한다. 기존 line–line 경로에는 이 index가 필요하지 않다.

## 지원 경계

동일 작업면/elevation/layer/construction purpose의 **독립 finite arc 두 개**, 그리고 **독립 닫힌 polyline의 line–arc/arc–arc 인접 코너**가 범위다. 기존 직선 내부 코너와 line–arc Fillet은 계속 지원한다. 독립 line–arc Chamfer, 열린 mixed contour의 arc end 연결, 스케치/패턴/작도 owner 코너, ellipse/비균일 scale/기울어진 작업면, 3D 코너는 후속이다. 스케치 구속을 가진 소유 윤곽을 일반 도형처럼 수정하지 않는다. connector를 live corner recipe로 저장하는 기능은 추가하지 않았다.

Chamfer의 자주색 선은 코너에서 절단점까지의 위치 안내다. 숫자 D1/D2의 측정 경로는 원호 자체이며 이 선의 chord 길이가 아니다. Fillet 안내선은 실제 반지름이다.

## 검수

신규 Node 10개는 독립 sqrt(7)/sqrt(44) 내·외접 좌표, 원호 길이 sin/cos Chamfer, 순서/CW/CCW/작업면/변환, 닫힌 첫·중간 정점의 기존 ID/폐합, line–arc와 arc–arc 수정 후 Offset, detached Review·한 Undo/Redo·JSON reload, 불가능 값/소멸/잠금/stale 원자적 거부를 검사한다. 기존 B2-A2의 인접 원호 일괄 거부 테스트는 새 지원 범위에 맞춰 갱신했다.

신규 native Edge/CDP arcCorners **22 checks**는 실제 App/Worker에서 원호 두 개의 각 연산·복수 해 select·D1/D2 입력·안내선·Review/Apply·한 Undo, closed toggle/정점 select·폐합·History를 검사한다. 기존 lineArcFillet 17, asymmetricChamfer 18, internalChamfer 18, curveWorkflow 20도 통과했다. 전체 **792 Node / 54 suites / fail·skip 0**, 대상 **5 browser workflows / 95 checks**, architecture **374 modules**와 workspace production build를 통과했다. 전체 browser suite 및 GPU/대형 문서 benchmark는 재실행하지 않았다. [검수 증거](../verification/B2-C-CLOSEOUT-2026-10-10.json).
