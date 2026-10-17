# B2-F 호 포함각 Lengthen

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. 독립 원호를 선택하고 **Lengthen → Method → Included arc angle**에서 목표 포함각을 `180deg`, `180°`, `3.14159rad`처럼 입력한다. 입력은 양의 **크기**이며 원호의 기존 CW/CCW 방향과 선택한 고정 반대쪽 끝점은 유지한다. 편집기에는 같은 목표의 각도·world 단위 길이·반지름이 함께 표시된다. 반대로 **Total length**에 `62.8319mm`처럼 입력하면 환산된 포함각을 보여 준다. 실제 변경은 기존 Lengthen Preview/Apply·History·연관 참조 갱신 경로를 따른다.

명령 `lengthen-drawing`의 `mode: "angle"`은 값을 **도(deg)**로 받는다. UI만 `rad`를 deg로 변환한다. 목표 길이는 현재 world 반지름 × 목표 각도(rad)로 구하고 기존 analytic sweep 수정에 전달한다. 따라서 중심·반지름·객체/토폴로지 ID를 바꾸지 않고, 평면별 회전·반사·균일 scale에서도 결과를 world 길이로 측정한다. 0°는 입력/명령 검증에서, 360° 이상과 full-turn에 가까운 sweep은 기하 검증에서 거부한다. 거부·Cancel·stale Preview는 모델/History를 바꾸지 않는다.

지원 경계: 이 각도 모드는 **독립 원호**에만 적용한다. 선과 다중선의 Lengthen은 기존 전체 길이·증감·비율 입력을 사용한다. 혼합 다중선 말단 호의 각도별 독립 편집, 스케치 소유 호, 비균일 확대가 타원으로 되는 원호, 0/한 바퀴 호, 원의 자유 끝점 Extend는 별도 작업이다.

검증: 신규 Node 6개 포함 전체 **832/832, 54 suites**, 대상 `basicEditWorkflow` 실제 브라우저 **31 checks**. 각도↔길이의 독립 측정 대조, CW·XY/XZ/YZ 반사/회전, Preview/Apply·Undo/Redo·저장 재열기, 0/360°/비원호 원자적 거부를 확인했다. TypeScript, architecture/import·문서 링크 **386 modules**, production Vite build 통과. 전체 browser suite와 대형 도면 성능 평가는 이번 범위가 아니다. [실행 요약](../verification/B2-F-CLOSEOUT-2026-10-10.json).
