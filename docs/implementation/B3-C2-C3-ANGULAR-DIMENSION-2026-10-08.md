# B3-C2/C3 — 두 참조 각도 치수

2026-10-08. 기준선 `ddedef2`. 사용자가 C2a → C2b → C3를 순서대로 요청했다. C1의 순수 측정을 같은 문서·명령·History에 연결한다.

## C2a: 완료

`AngularDimensionDefinition`은 first/second의 objectId·segmentId, 명시적인 두 ray 방향과 CW/CCW, 표시 반지름·선택적 문자를 저장한다. 두 참조는 같은 객체의 서로 다른 직선 모서리여도 된다. create/update 명령은 실제 world/profile segment를 조회하여 파생 snapshot을 만든다. 폴리라인을 endpoint chord로 대체하거나 원호를 직선화하지 않는다.

detached command 실행과 모든 원본 재생성 뒤 두 참조를 다시 계산한다. 스냅샷·inputs·geometry를 같은 transaction에 게시하고 History 한 단계로 복원한다. 각도는 rad, 기존 길이는 mm라는 명시적 render 단위를 가진다. 반지름·영역·문자만 바꾸는 편집은 원본을 움직이지 않는다.

원본 삭제·참조 소실·평행/일치·다른 평면·곡선으로 변경하면 원본 수정 전체를 거부한다. 잠긴 치수에 영향을 주는 원본 수정도 거부한다. 일반 transform으로 치수만 원본에서 떨어뜨리는 작업은 반지름/영역 편집으로 안내한다. 기존 단일 원본 치수의 source 삭제 동결 정책은 유지한다.

새 통합 4개와 C1 10개 집중 테스트가 통과했다. 원본/History 불변인 preview·실패, 한 Apply, 두 참조 refresh, Undo/Redo, reflex, 잠금, 같은 polyline의 두 모서리를 검사한다. TypeScript 및 architecture 306 modules 검증 통과. C2a 시점에는 공개 UI·파일 v14·Trim/Join 두 참조 remap이 아직 없으며 C2b/C3에서 이어간다.
