# 공간 곡선 파빌리온 · XYZ와 단면 방향 인계

2026-10-25. [원본·STEP·3D 경로와 실제 단면](../../output/projects/spatial-pavilion/README.md).

라운지체어 다음 과제는 3D로 휘는 세 아치와 유기적 loft 캐노피의 11부품 파빌리온이다. 기존 cubic 계산은 XYZ를 지원했지만 공통 fitted 도구는 평면 좌표만 허용했다. 이를 선택적인 `space:"spatial"`로 연결하고, 원형 단면을 처음 경로 접선에 수직으로 맞추는 기존 커널 옵션을 `alignToPath`로 연결한다. 현재 공통 목록은 canonical 40 / MCP 43 / 사람 폼 14종이다. 이 과제의 공간 곡선과 접선 정렬은 기존 도구의 선택 인자로 연결했다.

`fittedCurveInSpace`를 공통 도구와 수동 spline 편집기에서 공유한다. planar는 기존 평면 검사를 유지한다. spatial은 XYZ를 그대로 보존하고 plane은 참조 뷰로 남긴다. `curve.reshape`에서 space 생략은 원본 정책 유지이며 `curve.adjust`도 같은 정책과 C2를 유지한다. nonplanar 원본을 planar로 바꾸는 제안은 전체 거절된다. 닫힌 공간 곡선을 planar section처럼 돌출하거나 닫힌 경로로 스윕하는 지원은 추가하지 않았다.

스윕은 기존 native exact NURBS 경로를 사용한다. 명시적인 접선 정렬은 [OCCT 공식 Add의 WithCorrection](https://www.occt3d.com/dev/doc/refman/html/class_b_rep_offset_a_p_i___make_pipe_shell.html)을 사용한다. 기본값 false는 기존 기울어진 단면 방향을 유지한다. straight path의 고정 frame도 정렬을 선택했을 때만 경로 방향을 기준으로 만든다. 단면 중심과 경로 시작점을 일치시켜야 하며 이 기능은 roll 제어가 아니다.

사람 폼과 `cad.context.sweep`는 같은 `inspectSweepSelection`으로 정확한 세계 NURBS 시작점·단위 접선·길이를 조회한다. 반전된 선택이나 닫힌 경로는 이유를 돌려주며 읽기는 선택 권한을 늘리지 않는다. 내부 언어 `스윕 접선 정렬`은 같은 `solid.sweep` 인자를 생성한다. 원호의 기존 샘플 경로는 이번 범위에서 변경하지 않는다.

형식 54는 공간 fitted 정책과 접선 정렬을 포함한다. source / 블록 / 프로파일 / 중첩 Boolean까지 버전 gate를 검사한다. raw spline 적용 시 명시적 정책의 유지·해제를 관리하며 C2 모드 정책과 충돌하지 않는다. 기존 내부 Design Study 점 대안도 공간 정책을 유지한다.

독립 기준은 production의 tangent-system과 다른 natural 2차 도함수 Thomas 풀이와 Simpson 속도 적분이다. 각 아치의 체적을 π × 65² × 길이와 비교한다. 기단은 주기 cubic의 DFT Green 면적 × 120, 여섯 받침판은 π × 180² × 24와 비교한다. 캐노피는 실제 BRep 유효성·경계·STEP 보존으로 검사한다. 지붕/아치의 실제 common volume을 측정한 뒤 Undo하여 원래 독립 부품과 가시성을 복원한다. 겹침 체적은 구조 접합 인증이 아니다.

사람과 자연어의 동일 결과, 실제 SDK stdio MCP와 공유된 원본 수정, 저장 후 재열기, 3D DXF와 실제 BRep 단면의 내보내기를 검사한다. 구조·시공·미적 품질 점수나 모든 수동 도구의 MCP 노출을 주장하지 않는다.

Smooth loft의 측정 경계는 입력 단면 Z3000–3280보다 넓은 약 Z2995.142–3289.582다. 설계 외피 Z2980–3300 안인지 검사하고 실제 경계를 그대로 보고한다. 새 `cadPreviewEvidence`가 volume과 XYZ BRep bounds를 사람 Review와 MCP pending-review 영수증에 함께 제공하므로 에이전트도 요청 치수와 결과 경계를 구분할 수 있다. 형상을 입력 범위로 임의로 잘라 맞추지 않는다.

공간 곡선을 SVG/PDF로 암묵적으로 평탄화하는 출력은 계속 거절한다. 정확한 WCS DXF와 실제 BRep에서 파생한 2D 단면을 제공한다. 대상 필터도 planar / spatial curves를 함께 표시하도록 이름을 정리했다. 대형 산출물의 재열기 검사는 기존 house 검사와 같은 IndexedDB checkpoint를 사용해 테스트 임시 저장 한도를 넘지 않게 했다.
