# X1-A 3점 원·3점 호

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. 기존 circle/arc 원본을 사용하는 새 작성 방식을 구현했다. 새 geometry 종류나 파일 버전은 추가하지 않는다.

## 사용 흐름

Draw Ribbon의 **3-Point Circle**, **3-Point Arc** 또는 검색의 같은 도구로 시작한다. 원은 원주 위의 세 점, 호는 **시작점 → 통과점 → 끝점**을 입력한다. 포인터·스냅 또는 기존 `x,y`, `#x,y`, `@x,y`, `@length<angle`과 mm/cm/in 등의 단위를 사용할 수 있다. 세 번째 점 전까지 문서는 변경하지 않고 유효한 후보 원/호를 미리 표시한다. 유효한 세 번째 점을 클릭/Enter로 확정하면 기존 작성 도구처럼 한 객체와 한 Undo 항목을 만든다.

3점 호의 숫자 입력은 점 좌표/상대 길이·방향이다. 기존 중심–시작–끝 Arc 도구의 마지막 sweep 입력과 구분한다. 호는 통과점을 실제로 지나는 CW/CCW 방향을 선택하며 반원과 180°보다 큰 호도 지원한다. 부적절한 세 번째 점은 오류를 표시하고 앞의 두 점·수치 draft를 유지한다. 입력을 수정하거나 Esc로 취소할 수 있다.

standalone XY/XZ/YZ, 일반 sketch와 resolved face sketch에서 작성할 수 있다. face sketch는 해당 임의 frame을 사용한다. 공개 `create-three-point-curve` 명령은 drawing 종류·세 world point·기본 workPlane·선택적 sketchId/layerId/id를 받고, 동일한 순수 계산으로 검증한 뒤 기존 `create-drawing` 또는 `add-sketch-geometry`로 적용한다. 작업면 밖 점, 잠긴 layer, missing/unresolved sketch와 퇴화 입력은 detached 문서에서 전체 거부한다. 같은 명령의 Preview/Apply도 지원한다.

## 정확도와 기존 편집 연결

세 점을 첫 점 기준으로 이동하고 최대 chord 길이로 정규화한 뒤 circumcenter를 계산한다. 좌표 크기에 따른 linear tolerance, angular conditioning, 저장된 중심에서 세 점까지의 반지름 잔차를 검사한다. 중복·공선·근공선과 표현 가능한 정밀도를 벗어나는 입력은 거부한다. 렌더 샘플로 중심·반지름을 역산하지 않는다.

저장 원본은 기존 중심·반지름과 원호 시작/끝 각도, 고유 topology/point IDs다. 반지름/지름 치수·기존 핸들 편집·원 프로파일 돌출·live 치수 변경 재생성·측정·DXF 경로를 그대로 사용한다. 일반 작성의 three-point 입력은 작성 시점의 값이며 별도 live 참조를 저장하지 않는다. 스케치에서도 고른 원주 점을 중심 Coincident 구속으로 잘못 연결하지 않도록 자동 구속 추론은 적용하지 않는다. 생성 뒤 기존 명시적 구속을 추가할 수 있다. 세 원주 점에 대한 영구 live 관계는 X3 후속 범위다.

## 검증

Node는 큰 좌표의 독립 중심/반지름, CW/CCW·반원·major arc의 signed sweep, 중복/공선/근공선/비유한 입력, 수치 입력 의미, Preview/Apply·Undo/Redo·저장, 원의 독립 면적과 돌출 체적, 원/호 radius driver·고유 endpoint identity, major CW arc DXF 왕복, XZ/YZ·face sketch와 잠금 원자성을 검증한다. 브라우저는 실제 Ribbon·단위 입력·세 번째 점 오류 복구·마우스 수치 확정·Cancel·standalone/sketch 원·호·Undo/Redo를 확인했다.

[마감 증거](../verification/X1-A-CLOSEOUT-2026-10-10.json)를 따른다. 기존 Circle/Arc 도구와 파일 표현은 유지한다. 임의 standalone UCS 작성은 X5, 두점+반지름·접선 작성은 X1-B, 정다각형은 X1-C 후속이다.
