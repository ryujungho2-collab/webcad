# UI-P3-A · 두 프로젝트 좌우 비교

> 현재 사용법: [프로젝트와 저장](../features/PROJECTS.md#두-프로젝트-비교하기). 2026-10-17, 두 개의 서로 다른 열린 프로젝트를 비교하는 첫 범위를 완료했다. UI-P3-B 탭 고정/순서 이동/검색은 다음 카드다.

## 사용자에게 생기는 변화

상단 Compare로 활성 프로젝트와 다른 열린 프로젝트를 좌우 배치한다. 각 창의 목록에서 대상을 바꾸고, 다른 탭을 선택하면 현재 활성 창만 교체한다. 반대 창에 이미 보이는 프로젝트를 고르면 서로 바꿔 같은 문서를 두 편집 iframe으로 복제하지 않는다.

창 내부의 pointer/focus 진입과 Activate 버튼이 활성 표시·상단 저장 상태를 갱신한다. 실제 메뉴/키보드는 포커스를 가진 문서 안에서 처리하며 부모가 CAD 명령을 다른 iframe으로 전달하지 않는다. 양쪽의 작성·선택·Undo/Redo·다운로드를 실제 UI로 확인했다.

가운데 구분선은 pointer capture로 드래그한다. iframe 위를 넘어갈 때 입력이 빠지지 않도록 드래그 중에만 보호 레이어를 표시한다. 키보드 좌우/Shift+좌우/Home/End, 더블클릭 50:50을 제공한다. 일반 비율은 25–75%이고 960px에서는 각 창이 320px 이상 남도록 조정한다. 현재 검증 화면은 1440/960px이다.

Single view는 활성 창 하나를 표시하며 다른 열린 편집기는 해제하지 않는다. 비교 창 하나를 닫으면 기존 checkpoint 응답을 받은 뒤 나머지 창으로 단일 복귀한다. 새로고침에서는 비교 쌍/비율/활성 프로젝트와 각 복구 문서를 다시 열고 Undo는 새 세션이다.

## 세션과 레이아웃 구현

- `ProjectWorkspace`의 프로젝트별 section과 iframe을 같은 부모·같은 key로 유지하고 CSS 위치/폭만 바꾼다. 비교 헤더도 항상 같은 위치의 DOM 노드로 두며 단일 보기에서 숨긴다. 실제 iframe 요소·contentDocument·Undo history·선택의 동일성을 검증했다.
- `projectComparison`은 문서 schema와 분리된 `agent-webcad-project-comparison-v1` 표시 설정을 관리한다. 손상/누락/중복 pair는 단일 보기로 대체한다. 표시 설정 저장 실패는 현재 편집을 유지하고 Retry를 제공한다.
- 두 보이는 iframe에 activity를 보내 렌더를 유지하고 나머지는 기존 P2 방식으로 정지한다. focus 통지는 기존 origin/source/project ID/generation 확인 후 보이는 세션에서만 받는다. 저장/닫기 중에는 두 창 입력을 잠시 막고 기존 checkpoint gate를 따른다.
- 900px 이하의 비교 편집기는 기존 일반 보기의 패널 접기 설정을 유지하면서 별도 compact 패널을 쓴다. Explorer/Properties는 필요할 때 겹쳐 펼쳐 캔버스를 압축하지 않는다. 단일 보기로 돌아오면 원래 일반 보기의 접기 상태를 사용한다.
- 레이아웃을 위해 외부 패키지를 추가하지 않았다. 기존 CSS와 pointer capture를 채택했고 실제 두 iframe의 무재로드를 합격 기준으로 사용했다. Dockview/react-resizable-panels를 설치한 API/성능 비교는 수행하지 않았으며 라이브러리 비교 벤치마크를 주장하지 않는다.

## 검증과 증거

실제 Edge/SwiftShader/React/Worker 검사 **25 checks**: A/B 작성·Undo와 키보드 Undo 격리, 양쪽 실시간 렌더, 활성 표시, compact 패널, pointer/keyboard 구분선, 단일 복귀·선택/Undo 보존, 두 문서 source revision과 kernel 제출 작업 불변, 960px 캔버스 공간/overflow, 세 번째 프로젝트 교체·비표시 세션 정지, 반대 창 선택의 교환, 양쪽 실제 WebCAD 다운로드, 닫기/저장·살아남은 iframe 보존, 새로고침 비교/비율/복구/새 Undo를 검증했다.

- 실제 UI report (local-only, not in repository: `output/verification/project-comparison/native-report.json`)
- 1440px (local-only, not in repository: `output/verification/project-comparison/comparison-1440.png`) · 960px (local-only, not in repository: `output/verification/project-comparison/comparison-960.png`) · 재열기 (local-only, not in repository: `output/verification/project-comparison/comparison-reopened.png`)
- A 다운로드 원본 (local-only, not in repository: `output/verification/project-comparison/comparison-a.webcad.json`) · B 다운로드 원본 (local-only, not in repository: `output/verification/project-comparison/comparison-b.webcad.json`)
- [실행 manifest](../verification/UI-P3-A-2026-10-17.json)

대상 Node **33/33**, 전체 Node **1,291 tests / 54 suites / 실패 0**(약 47.3초), TypeScript·architecture **600 modules**·production **431 modules** 통과. 기존 큰 chunk 경고는 유지한다. 기존 native 프로젝트 탭 **19**·복구 **24**·관리 **30 checks**도 통과했다.

재실행:

```powershell
pnpm --filter @agent-webcad/web exec tsx --test tests/projectComparison.test.ts tests/projectWorkspaceStore.test.ts tests/projectSession.test.ts tests/projectActivity.test.ts tests/projectManagerStore.test.ts tests/shortcutRouter.test.ts
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=projectComparison --artifacts
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=projectTabs
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=projectRecovery
```

## 남은 경계

첫 범위는 두 프로젝트의 수동 좌우 비교다. 카메라 동기화, 같은 프로젝트의 두 뷰, 임의 다중 docking, 탭 고정/순서 변경/검색, 원격 공동편집은 포함하지 않는다. 작은 두 문서의 레이아웃 변경에서 추가 kernel 제출 0을 검사했으며 대형 두 문서/시간 단위 세션의 전체 메모리·성능 상한으로 확대하지 않는다. 960px 미만의 조밀한 편집 도구 배치는 추가 UX 범위다. 브라우저 파일 다운로드는 기존과 같이 시작 여부만 확인하며 OS의 최종 디스크 기록 완료를 확인하지 않는다.
