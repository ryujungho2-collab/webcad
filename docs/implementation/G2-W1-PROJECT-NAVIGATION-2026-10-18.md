# G2-W1 프로젝트 내부 탐색

2026-10-18 · 첫 지원 범위 완료. [프로젝트 가이드](../features/PROJECTS.md) · [검증 manifest](../verification/G2-W1-2026-10-18.json).

왼쪽 Activity bar의 **Project navigation**에서 현재 프로젝트의 모델·평면/투영·단면·상세·시트를 찾고 바로 이동한다. 기존 Model tree는 편집 이력과 source 탐색용으로 유지한다. 문서 schema나 외부 의존성은 추가하지 않는다.

## 지원 범위

- Model: 원본 root 모델. 생성된 투영/단면 출력과 시트 title/frame 장식은 중복 모델 항목으로 노출하지 않는다.
- Plans and projections: 저장된 model projection. 모델의 투영 basis와 달리 생성된 도면은 paper XY이므로 그 출력 평면에서 선택·맞춤한다.
- Sections: model section의 곡선과 배경/해치/라벨 출력을 함께 찾는다.
- Details: detail frame link의 대상 프레임을 연다. 기존 확대 배율과 참조를 그대로 사용한다.
- Sheets: model sheet의 artboard로 이동한다. 축척·페이지 번호가 있으면 표시하며 일반 프레임 목록에 중복하지 않는다.
- Frames and drawings: 나머지 artboard/frame과 root 2D drawing/drafting/dimension/image 항목.

그룹은 접고 펼칠 수 있다. 이름·안정 ID·그룹·상태를 검색하며 검색 중에는 일치 항목의 그룹을 펼친다. 빈 프로젝트와 검색 결과 없음에 안내를 표시한다. native button의 Tab·Enter·Space 조작과 visible focus를 사용한다. 검색·접기·마지막 이동 표시는 현재 탐색 패널의 UI 상태이며 문서 저장 데이터가 아니다.

## 원본과 Undo 경계

`explorer/projectTree.ts`가 현재 document에서 참조 목록을 만들고, App의 이동 callback은 클릭 시 다시 대상 key를 조회한다. 삭제된 과거 row를 믿거나 geometry를 새로 만들지 않는다. 모델 이동은 3D/선택/카메라, 도면은 2D/작업 평면/선택/카메라, 프레임·시트는 기존 artboard 활성화 API만 사용한다. document command를 실행하지 않으므로 revision·형상·잠금·Undo를 바꾸지 않는다. 프로젝트별 기존 iframe/session 소유권을 유지한다.

숨겨진 대상·없는 출력·접힌 workspace section의 프레임은 이유를 표시하고 이동을 막는다. 잠금은 보기만 하는 탐색을 막지 않는다. unresolved와 missing reference 상태를 표시하며 자동 재생성이나 자동 재바인드를 수행하지 않는다. 현재 frame 작업이 진행 중이면 완료/취소 뒤 이동하도록 안내한다.

별도의 named camera snapshot은 기존 Model views에서, 스케치 편집과 feature source는 기존 Model tree에서 사용한다. 이 카드는 새 평면/단면/상세/시트를 생성하는 도구나 트리의 재부모화·순서 편집을 추가하지 않는다.

## 검증

- 전체 Node 1,349개 / 54 suites 통과. 신규 4개: 원본 참조·paper XY·중복 제외, Unicode/ID 검색, 숨김/잠금/접힘, 누락 및 unresolved 상태.
- 실제 Edge/SwiftShader UI·Worker 17개 통과: 여섯 그룹, 모델↔도면↔시트/상세의 실제 카메라 맞춤, 한글 검색·빈 결과·접기·키보드, revision/geometry/Undo 완전 불변, 기존 Model tree, 1440px·960px.
- 기존 native 회귀 70개: modelSheetSet 24, projectComparison 25, keyboardActivation 21. 기존 시트 출력/프로젝트별 명령·Undo 격리/키보드 활성화 유지.
- TypeScript 포함 프로덕션 build와 architecture 검사 통과. 기존 큰 bundle chunk 경고는 유지한다.

[1440px 화면](../../output/verification/project-tree/project-tree-1440.png) · [960px 화면](../../output/verification/project-tree/project-tree-960.png) · [native 보고서](../../output/verification/project-tree/native-report.json).
