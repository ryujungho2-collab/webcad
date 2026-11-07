# UI-C3 · 속성 패널 정리

2026-10-17 첫 지원 범위 완료. 현재 사용법은 [속성 패널](../features/PROPERTIES.md), 수치는 [검증 manifest](../verification/UI-C3-2026-10-17.json)를 따른다.

## 정보 순서와 수명

PropertiesContent의 실제 DOM 순서를 선택 요약 → 치수·위치·주석 → 표현·측정 → 고급 관계/이름/일반 설정으로 옮겼다. InspectorSummary는 선택 전체의 종류·잠금·숨김·누락 참조를 설명한다. FrameInspector는 활성 프레임의 종이 치수·위치·축척을 먼저 보여 주고 기존 프레임 편집기로 연결한다. SketchInspector는 구동 치수와 solve 상태를 앞에 두고 의존성 상세를 뒤로 옮겼다.

PropertySection의 InspectorSectionScope는 `agent-webcad-inspector-v1`에 대상 종류/항목별 접기 설정만 저장한다. 손상·저장 실패에서는 기본값 또는 현재 UI 상태를 유지한다. 문서·History·복구 schema를 바꾸지 않는다. 자식 편집기는 접어도 마운트를 유지한다. `active`의 기존 열기 동작과 `keepOpen`의 검토/오류 표시를 구분해 기존 도구를 잠그지 않으면서 진행 중인 Review를 숨기지 않는다. Shell의 일반 생성 설정은 기본적으로 접고 선택·검토·오류가 있으면 펼친다.

선택 ID에 따라 PropertiesContent와 스케치/주석 편집 초안을 새로 시작한다. 기본 필드의 blur 적용은 이전 대상 ID에만 실행되며 새 선택의 초안을 덮어쓰지 않는다. NumericField는 단위 입력과 Esc 취소, 조합 Enter 보호를 제공한다. 객체 이름/주석의 조합 Enter도 조기 확정을 막는다.

## 편집 경로

primitivePropertyEdit는 기존 parseLength와 update-primitive/batch 명령을 사용한다. 제출한 필드만 바꾸고 각 객체의 다른 치수는 보존한다. 잘못된 값·잠금·지원 불가에는 변경하지 않고 선택 요약 아래에 오류를 표시한다. Position/Rotation도 입력한 축만 기존 planBulkTransformEdit로 전달한다. 원기둥/돌출·스케치·벡터 표현·프레임은 기존 Review/Apply와 Undo를 재사용한다.

VectorStyleEditor는 기본 스타일을 앞에, gradient 상세를 펼침 영역에 둔다. Drafting의 연속 치수 스타일도 기본 위치/수치 뒤의 펼침 영역이다. browser physicalInput은 숨은 속성 영역을 강제로 누르는 대신 실제 disclosure 버튼을 먼저 눌러 펼친 뒤 hit-test한다.

## 검증

전체 Node 1,303 / 54 suites / 실패 0. 신규 단위/다중 선택 patch·잘못된 입력/잠금·UI 설정 테스트 3개. 실제 Edge UI로 primitive·원기둥·스케치·프레임·연관 주석·다중 선택의 편집/Review/Undo, 선택 중 입력 수명, 단위 변환, Esc, 잠금, 접기/재열기, 한글 IME·긴 이름·960px를 검증했다. 속성 UI 28 checks·기존 회귀 151 checks가 통과했다. 상세 명령은 manifest를 따른다.

Appearance에서 `.2cm` 선 두께를 입력해 Apply한 뒤 exact 선 좌표를 비교했다. 실제 SVG의 `stroke-width="2"`와 실제 다운로드된 raster PDF 내부 JPEG를 독립 디코딩해 해당 선 위치의 두께를 검사했다. 문서 스타일만 확인하고 출력 검증을 생략하지 않았다. PDF는 기존 96 dpi JPEG 평탄화 경로다.

- 프레임 속성 요약 (local-only, not in repository: `output/verification/inspector-properties/inspector-frame.png`)
- 960px 속성 패널 (local-only, not in repository: `output/verification/inspector-properties/inspector-960.png`)
- 스타일 적용 SVG (local-only, not in repository: `output/verification/inspector-properties/inspector-style.svg`)
- 동일 프레임의 PDF (local-only, not in repository: `output/verification/inspector-properties/inspector-style.pdf`)

Architecture 615 modules, production 441 modules. 기존 큰 chunk 경고는 남아 있다. 모든 솔리드의 새 driver·혼합 종류의 스타일 일괄 편집·새 문서 schema·외부 파일 상호운용 확대는 이번 범위가 아니다.
