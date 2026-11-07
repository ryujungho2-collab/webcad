# C2 라운지체어 · 곡률 연속과 편집 정책

2026-10-24. CAD 원본·STEP·2D 윤곽·실제 단면 (local-only, not in repository: `output/projects/c2-lounge-chair/README.md`).

앞선 S자 조명은 열린 NURBS를 실제 스윕에 연결했다. 이번 라운지체어는 좌판에서 등받이로 이어지는 12점 윤곽과 양쪽 루프 프레임을 C2로 보간한다. 사람은 C1 윤곽과 600 mm 돌출을 만들고, 공통 폼과 내부 자연어로 같은 점을 C2로 변환한다. 사람·실제 SDK stdio MCP가 같은 등받이 점을 옮긴 결과도 비교한다. 이후 MCP가 구멍을 가진 두 프레임, 가로대, 레이어·마감과 실제 단면을 작성한다.

새 geometry executor나 canonical 도구를 만들지 않았다. 기존 `curve.fitted` / `curve.reshape`의 선택 인자 `continuity`와 기존 `curve.adjust`를 사용한다. 생략 시 생성은 C1, 수정은 원본 방식을 유지한다. C2는 open natural / closed periodic uniform cubic interpolation이며 strength는 1로 고정한다. bounded pivoted system을 XYZ에 대해 같이 풀고, 정확한 cubic Bezier span을 기존 B-spline 기반으로 보낸다. 닫힘 이음새까지 1차·2차 도함수가 이어지며 native 커널에는 표시 샘플을 보내지 않는다.

공통 폼은 C1 / C2와 현재 원본 접합부의 곡률 벡터 차이를 보여준다. `cad.curve`도 같은 bounded 분석을 읽는다. 도함수·곡률 차이는 실제 cubic pole에서 분석적으로 계산하며 stationary join에서는 곡률이 정의되지 않음을 표시한다. 이는 미적 점수가 아니다. 수동 SplineTool의 through-point 편집에도 같은 보간 모드를 연결했다. 내부 Design Study의 점 이동은 C2를 유지하며, C2에 strength-only smoothing을 적용하려 하면 C1 전환 또는 점 이동을 명시하도록 거절한다.

대칭 곡선은 C1과 C2의 basis가 같을 수 있으므로 저장된 모드를 형상만 보고 추측할 수 없다. 형식 53이 C2 편집 정책 `fitContinuity`를 보존한다. 원본·블록·중첩 프로파일·Boolean의 버전 gate를 검사하고, C2라고 표시된 basis를 재계산해 확인한 뒤에만 맞춤 편집을 허용한다. 기존 무표식 C1은 우선 유지한다. C1 전환이나 raw NURBS 편집은 C2 정책을 해제한다. 원래 0.1/1.5 강도의 부동소수점 복원 오차도 유효 범위 안에서 clamp해 최대 강도 원본이 편집 불가가 되던 경계를 보완했다.

독립 기준은 생산 코드의 접선 연립방정식과 다른 DFT 대각화를 이용해 주기 cubic의 2차 도함수를 구한다. 각 span의 Green 면적을 정확한 3점 Gaussian 적분으로 계산한 뒤 실제 돌출 폭을 곱한다. 좌판과 두 프레임은 이 값, 두 가로대는 원기둥 공식으로 비교한다. 실제 STEP의 새 reader로 다섯 부품을 재검사한다. CAD 원본 재열기·Undo·사람/자연어/MCP 결과 동일성을 별도로 확인한다.

모드 연속성은 uniform parameter에 대한 C2다. 개별 접선 핸들, 다른 곡선 사이의 구속, 비균일 parameterization, 자동 곡률 최적화 또는 미적 판정은 추가하지 않았다. 가구는 개념 모델이며 인체공학·하중·접합부·제작 검증의 통과를 주장하지 않는다.

실제 UI/Worker/SDK stdio MCP 검사 42개, 단위·통합 검사 89개 통과. 조명 36 / 키오스크 48 / 공통 인계 38 / MCP bridge 24 / 고급 도구 17 / 수동 spline 19개도 통과했다. production build는 기존 chunk 경고만 남기며 architecture 검사 815개 모듈과 문서 링크가 통과했다. 실제 메인 CAD에서 수동 spline 편집기도 Through points / C2 / closed로 복원되는 것을 확인했다. [검증 기록](../verification/CHAIR-HANDOFF-2026-10-24.json).
