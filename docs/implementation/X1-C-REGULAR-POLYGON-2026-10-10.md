# X1-C 정다각형 작성

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10 구현·검수 완료. 현재 상태와 다음 실행은 [NEXT-STEPS](../../NEXT-STEPS.md)가 소유한다.

## 입력과 동작

Draw Ribbon의 **Regular Polygon** 또는 검색의 **Draw regular polygon**에서 중심 U/V, 변 수, 반지름 유형, 반지름과 회전각을 입력한다. 길이는 mm/cm/m/in/ft, 각은 deg/rad를 지원한다. 변 수는 정수 3–128이다.

- **Inscribed**: 원에 내접하는 다각형. 입력 반지름은 중심→꼭짓점, 회전각은 첫 꼭짓점의 방향이다.
- **Circumscribed**: 원에 외접하는 다각형. 입력 반지름은 중심→변의 수직거리(내접원 반지름), 회전각은 첫 변의 바깥 법선 방향이다.

꼭짓점은 평면의 U/V 기준 반시계 방향이며 마지막에 첫 꼭짓점을 중복하지 않는다. 회전은 도 단위로 정규화해 계산한다. 영점/음수 반지름, 비정수/범위 밖 변 수, 비유한 값, 좌표 정밀도에서 붕괴하는 변과 측정 overflow를 거부한다.

입력 중 점선 형상·둘레·면적을 보여준다. **Review polygon**은 분리된 문서에서 명령을 검증하고 **Apply polygon**만 한 History 항목으로 저장한다. 입력/문서 변경은 검토를 무효화하고 늦게 도착한 검토 결과를 폐기한다. 취소·Escape는 문서를 변경하지 않는다. **Fit polygon preview**로 형상을 화면에 맞출 수 있다.

## 기존 파이프라인 연결

`create-regular-polygon`은 입력을 검증한 뒤 기존 `create-drawing` 또는 `add-sketch-geometry`로 닫힌 polyline을 생성한다. standalone XY/XZ/YZ와 일반·resolved face sketch를 지원하며 중심은 해당 평면 로컬 좌표다. 면 스케치는 저장된 frame으로 world 좌표를 변환한다. 대상 없음/타 평면/unresolved face/잠긴 레이어는 기존 트랜잭션에서 거부한다.

기존 drawing/sketch topology로 고유 vertex/segment IDs를 생성한다. 문서 schema를 추가하지 않는다. 작성 후 일반 꼭짓점 편집, 제약/치수, 렌더링, live 돌출, 직렬화, Undo/Redo, closed polyline DXF와 아트보드 SVG 경로를 재사용한다. 스케치 꼭짓점을 이동하면 정다각형 형태를 자유롭게 바꿀 수 있으며 종속 돌출은 다시 계산된다.

## 검증

- Node 대상 10개: 삼각형·사각형·육각형의 독립 길이/면적, 꼭짓점 거리·변의 수직거리, 1e9 좌표, 입력 경계·overflow, detached review, 저장·Undo/Redo, 고유 topology, 꼭짓점 편집 뒤 정확한 돌출 체적, XY/XZ/YZ/면 frame, DXF·아트보드 SVG, 잠금·stale plan.
- 실제 브라우저 13 checks: 단위·내접/외접·회전, transient review, 미리보기, draft 변경, 한 Undo, 입력 오류 복구, 취소, 문서 변경 무효화, 스케치 topology와 rad 입력, Escape.
- 통합 Node 887개 / 54 suites / fail·skip 0, 3점 원·호 브라우저 회귀 10 checks, 타입·architecture 421 modules·production build 통과.

[마감 증거](../verification/X1-C-CLOSEOUT-2026-10-10.json).

## 지원 경계

정다각형 입력은 작성 시점의 좌표를 결정한다. 반지름·변 수의 영구 파라미터 recipe나 항상 정다각형을 유지하는 구속은 저장하지 않는다. 자동 구속을 추가하지 않아 자유 꼭짓점 편집을 보존한다. 임의 standalone UCS와 3D 방향 배치는 X5, 새 접선 작성 방식은 X1-B 후속이다.
