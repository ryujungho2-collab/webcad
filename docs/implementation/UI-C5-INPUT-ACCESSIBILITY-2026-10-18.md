# UI-C5 상태·입력·접근성

2026-10-18 · 첫 지원 범위. [현재 사용법](../features/INPUT-ACCESSIBILITY.md) · [검증 manifest](../verification/UI-C5-2026-10-18.json)

하단 상태가 좁은 화면에서 사라지고 로컬 저장/다운로드 정보가 주로 툴팁에 있던 문제를 개선했다. 기존 저장·명령·Worker 계약을 호출하며 문서 schema와 외부 의존성은 추가하지 않았다.

## 변경

- SaveStatus는 현재 local/file 상태를 각각 표시하고 기존 save/download callback을 호출한다. 실패 시 재시도 버튼과 다운로드 경로를 유지한다. 파일 완료를 추정하지 않는다.
- GeometryTaskStatus는 Worker의 실제 단계·pending 개수를 표시하고 기존 프로젝트별 cancelKernelTasks를 호출한다. 취소 요청 결과를 polite 상태로 알리며 이미 완료한 Undo는 보존한다.
- ToolDisclosure는 키보드 열기·첫 입력 포커스·버튼 간 화살표/Home/End·Esc 복귀를 제공한다. 위치를 위/아래 공간에 맞추고 resize 시 닫힌 팝오버의 포커스를 복구한다. 닫힌 패널은 native popover의 hit testing 규칙을 따른다.
- shortcutRouter는 IME/229 History를 차단하고 열린 native popover의 Esc를 CAD 선택/도구 취소보다 우선한다. App과 명령 검색도 조합 키 판정을 공유한다. 공통 viewport와 점 변환의 capture 키 처리도 조합 키를 건너뛴다. 저장·다운로드·도구 메뉴 안내를 실제 shortcut catalog에 추가했다.
- 문맥 도구는 짧은 시각적 표시에 관계없이 registry의 전체 명령 이름을 aria-label로 제공하고 비활성 이유를 aria-describedby로 연결한다. 프로젝트 탭의 F2로 이름 변경 modal을 키보드로 열 수 있다.
- useModalDialog는 명령 검색·프로젝트 관리·이름 변경에서 native modal을 열고 초기 포커스를 정한다. 종료 시 호출 대상이 남아 있고 새 컨트롤이 포커스를 소유하지 않은 경우에만 복귀한다. 명령 실행은 같은 사용자 gesture 안에 유지한다.
- 명시적인 입력 포커스 테두리·상태 텍스트·polite/atomic 안내·Review busy 상태를 적용했다. 확대 화면 하단의 두 줄 높이를 확보하고 정밀 설정을 스크롤 가능하게 했다.

## 검증 방법과 발견 사항

신규 실제 UI fixture는 Home에서 키보드로 빈 프로젝트 작성 → 명령 검색 → 실 Worker 취소/재실행 → 단위 편집 → IME → 메뉴 → Undo/Redo → quota 실패/Retry → 파일 다운로드 → 도움말 → 960px/확대 → 복구 modal → 닫기/재열기를 검사한다. 저장 실패는 checkpoint 쓰기에만 quota 오류를 주입하고 입력은 CDP의 실제 key/pointer/IME를 사용한다. 다운로드 원본의 문서 ID를 확인한다.

기하 취소 시점은 실제 취소 click의 capture 단계에서 문서와 Undo를 읽어 비교한다. 최초 생성이 이미 완료되어 표시 작업만 남은 경우도 있으므로 취소가 완료된 편집을 삭제한다고 가정하지 않는다. 취소 응답과 후속 명령 성공을 함께 확인한다.

검증 중 포인터로 연 상태 메뉴의 Esc가 선택까지 해제하는 문제를 수정했다. 확대 시 기존 고정 footer 높이와 precision 높이 규칙 때문에 두 번째 줄이 잘리던 문제도 실제 화면과 경계 검사로 확인해 수정했다. 기존 historySelection fixture는 숨겨진 Explode를 직접 찾던 입력 helper를 공통 trusted pointer helper로 교체해 먼저 실제 메뉴를 열도록 했다. 기존 문서/선택/History 단언은 그대로 유지했다. 이름 변경에서는 IME 확정 Enter의 기본 폼 제출을 막고 한글 초안 보존과 별도 Esc 복귀를 확인했다. 저장 메뉴 보조 문구는 실제 computed 색상으로 4.5:1 이상의 대비를 확인했다. 텍스트 입력의 Undo는 CAD Undo를 호출하지 않으며 메뉴 탐색은 revision/history를 만들지 않는다.

실행 결과와 명령은 manifest에 기록한다. 전체 Node 1,311 / 54 suites / 실패 0. 신규 native UI 30개·기존 회귀 218개를 통과했다. 회귀는 문맥 도구 23·정밀 입력 15·History/선택 23·Home 26·비교 25·탭 탐색 27·관리 30·속성 28·키보드 활성화 21개다. 타입·구조·production build도 통과했다. 기존 500 kB 초과 chunk 경고는 남아 있다.

## 화면과 경계

![저장 실패와 별도 다운로드 상태](../../output/verification/accessibility-input/accessibility-1440.png)

![960px 상태 메뉴](../../output/verification/accessibility-input/accessibility-960.png)

![150% 상당 화면](../../output/verification/accessibility-input/accessibility-zoom-150.png)

Edge/SwiftShader의 작은 프로젝트 fixture를 기준으로 한다. 실제 스크린리더 음성·모든 브라우저·모든 CAD pointer 제스처의 키보드 대체나 접근성 인증은 포함하지 않는다. 기하 취소는 프로젝트 내 기하 작업 범위이며 저장소 transaction/파일 다운로드 취소와 구분한다.
