# UI-P3-B · 열린 프로젝트 탭 탐색

2026-10-17 첫 지원 범위 완료. 현재 사용법은 [프로젝트와 저장](../features/PROJECTS.md#열린-탭-탐색하기), 실행 결과는 [검증 manifest](../verification/UI-P3-B-2026-10-17.json)를 따른다.

고정 그룹, 그룹 안의 pointer/키보드 순서 변경, 열린 이름/ID 검색, 좌우 overflow 탐색을 구현했다. Alt+Shift+P로 검색하고 탭에 포커스가 있으면 방향키/Home/End로 전환한다. Alt+Shift+방향키는 순서 변경이다. 검색은 한글 조합 Enter를 무시하고 편집 입력의 단축키를 보호한다. Esc는 검색 또는 진행 중인 드래그를 취소한다.

`projectTabs`는 기존 v1 목록에 선택적 pinned 필드를 더한다. 이전 목록은 그대로 읽고 false는 생략해 읽기/쓰기 비교의 정규 형태를 유지한다. 닫힌 프로젝트의 위치·메타데이터·활성 ID를 보존한다. 고정과 이동은 기존 workspace 저장·backup·Retry 경로를 사용하며 모델 revision이나 Undo를 만들지 않는다.

`ProjectWorkspace`는 표시 탭 순서와 편집 iframe DOM 순서를 분리한다. 기존 편집 ID 순서를 유지하고 새 프로젝트만 추가해 pin/reorder 시 iframe을 재삽입하지 않는다. 비교 쌍과 각 문서의 명령/선택/Undo는 유지된다. iframe 안의 검색 요청은 기존 source/origin/generation 확인과 입력 차단 조건을 통과한 보이는 세션에서만 받는다.

실제 Edge 입력으로 8개 열린 프로젝트와 닫힌 1개를 사용했다. pointer 이동·Esc 취소·키보드 순서 변경·한글 검색/IME·iframe 단축키·입력 보호·1440/960px·저장 실패/Retry·닫기/재열기·새로고침 복원을 검증했다. A/B의 실제 iframe/contentDocument·revision·Undo가 유지되고 kernel 제출 수가 늘지 않음을 확인했다. 새로고침은 기존 복구 정책대로 각 문서를 복원하고 Undo는 새 세션이다.

검증: 전체 Node 1,297 / 54 suites / 실패 0, 대상 Node 23, 탭 탐색 native 27 checks. 기존 비교·탭·복구·관리 회귀와 빌드 수치는 manifest에 기록한다. Architecture 605 modules, production 434 modules. 기존 500 kB 초과 chunk 경고는 남아 있다.

- 1440px 검색 (local-only, not in repository: `output/verification/project-tab-navigation/tabs-search-1440.png`)
- 960px 검색 (local-only, not in repository: `output/verification/project-tab-navigation/tabs-search-960.png`)
- 새로고침 후 검색 (local-only, not in repository: `output/verification/project-tab-navigation/tabs-reopened-search.png`)

고정/일반 그룹 사이 직접 드래그는 지원하지 않는다. 그룹 변경은 고정 버튼으로 한다. 닫힌 프로젝트 검색은 기존 Projects 관리 화면을 사용한다. 카메라 동기화·같은 문서의 복수 편집 뷰·임의 도킹은 이번 범위가 아니다. 960px 미만과 시간 단위 대형 문서 메모리 보장은 이번 검증에 포함하지 않는다.
