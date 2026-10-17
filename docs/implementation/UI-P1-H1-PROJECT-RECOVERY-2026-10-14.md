# UI-P1-H1 — 프로젝트 저장·복구 보강

> **현재 기능 설명:** [프로젝트와 저장](../features/PROJECTS.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-14. [NEXT-STEPS](../../NEXT-STEPS.md) 첫 미완료 카드의 실제 기능을 구현했다. 기준은 UI-P1의 프로젝트별 독립 문서/Undo/복구 저장소다.

## 사용

- `Save locally` / Ctrl+S는 이 브라우저의 로컬 복구본을 저장한다. 자동 저장도 같은 경로를 쓴다. 상단 상태는 `Local changes pending`, `Saved locally`, `Local recovery failed`를 구분한다.
- `Download file` / Ctrl+Shift+S는 휴대 가능한 `.webcad.json` 다운로드를 시작한다. 로컬 저장 상태와 별도 표시하며, 디스크 기록 완료를 확인하지 못하므로 `File download started · completion unverified`라고 안내한다. 편집/Undo/Redo 이후 현재 내용이 마지막 다운로드 snapshot과 같은지도 확인한다.
- 프로젝트 목록이 손상되면 편집기 대신 복구 화면을 연다. 기존 목록/문서/asset을 덮어쓰지 않는다. `Restore backup project list`로 검증된 이전 목록을 명시적으로 복원한다.
- 목록 백업도 읽을 수 없으면 `Find saved projects`로 namespace별 읽을 수 있는 checkpoint를 찾는다. 목록과 읽을 수 없는 항목 수를 확인한 뒤 `Restore recovered project list`를 누른다. 검색은 데이터 변경 없이 수행한다.
- `Download recovery data`는 프로젝트 목록, 손상 원문, 프로젝트 checkpoint/backup/asset을 raw JSON 묶음으로 다운로드한다. 일반 WebCAD 도면 파일과 다른 복구 자료이며 다운로드 자체로 저장 데이터를 수정하지 않는다.
- 저장 실패 시 해당 편집기는 유지하고 실패 이유와 `Retry` / `Retry local save`를 제공한다. 용량 문제를 해결한 뒤 재시도할 수 있다. 탭의 `!` 표시와 툴팁으로 비활성 프로젝트의 실패도 확인한다.
- 닫기는 정확한 checkpoint 성공 응답을 받은 후 수행한다. 실행 중인 문서 명령, 저장 실패, 편집기 재시작, timeout이면 열린 세션을 유지한다. 닫기와 재열기는 파일 다운로드를 수행하지 않으며 재열 때 Undo와 다운로드 표시를 새 세션으로 시작한다.

## 데이터와 응답 계약

`app/projectWorkspaceStore.ts`가 목록 검증·백업·명시적 복원·저장된 프로젝트 검색·raw archive를 소유한다. 정상 쓰기는 기존의 검증된 목록을 backup으로 남긴 뒤 primary를 쓴다. primary 쓰기 실패 시 이전 목록이 유지된다. 일반 쓰기로 손상 목록을 덮어쓸 수 없다. 명시적 복원은 최초 손상 목록 원문을 별도 키에 보관하고 검증된 fallback을 둔다. 사용자 도면 namespace를 삭제하지 않는다.

부모/편집기 메시지는 기존 channel + origin + 등록된 iframe의 contentWindow + 프로젝트 ID에 **편집 세션 generation**을 추가했다. `CheckpointGate`는 프로젝트 ID + generation + request ID + 10초 deadline이 모두 일치하는 응답만 허용한다. 이중 요청, timeout 후 과거 응답, 재열기/편집기 재시작 전 응답은 닫기를 완료할 수 없다. 응답을 기다리는 대상 편집기는 inert 상태로 두고 다른 탭 조작도 잠시 막는다.

`saveDocumentToCache()`는 저장 시작의 document ID/revision/session generation과 독립 snapshot을 캡처한다. 실제 checkpoint를 쓴 뒤 version이 그대로인지 확인하고 그 snapshot의 fingerprint/revision만 성공으로 보고한다. pending 명령이나 쓰기 실패는 성공 상태를 남기지 않는다. fingerprint는 revision을 제외하므로 Undo/Redo로 동일한 내용에 돌아온 경우를 비교할 수 있다. 부모에게 전체 fingerprint를 보내지 않는다.

읽을 수 없는 도면 checkpoint는 자동 저장/재시도로 초기 빈 문서가 덮어쓸 수 없다. 유효한 문서를 명시적으로 New/Open한 뒤에만 저장 경로가 다시 열린다. iframe 사이에서 전달된 Error/DOMException도 message를 보존해 실패 원인을 표시한다.

## 검증

- 대상 Node 14 checks: 목록 backup·손상 복원·quota 실패/재시도·복원 중 실패·두 namespace 검색·unreadable 보존·raw archive 범위·schema 검증, 이중 요청/과거 request/세션/deadline, 저장 snapshot/version 일치, unreadable 도면 재시도 덮어쓰기 방지, 기존 checkpoint 압축/backup/격리.
- 실제 Chromium `projectRecovery`는 손상 목록→raw 다운로드→백업 복원→실제 Box 편집/자동 저장→파일 다운로드→Undo/Redo, 실제 문서 command queue pending, quota 오류→저장/닫기 거부→재시도→재열기, manifest quota 실패/재시도, 두 목록 손상→검색 복구→전체 페이지 재열기를 확인한다.
- fault fixture는 테스트에서 실제 편집기의 Storage 쓰기와 command queue를 제한한다. 실제 사용자 경로는 CDP pointer와 hit-test로 실행한다. deadline/잘못된 request 응답은 Node gate 검증에서 시간을 명시적으로 진행시킨다.
- 기존 `projectTabs`와 `trustWorkflow`를 함께 재검증한다. 전체 CAD browser/Node suite를 실행한 것으로 확대하지 않는다.

최종 결과: 대상 Node **14 checks**, native browser **3 workflows / 58 checks**(`projectRecovery` 24 / `projectTabs` 19 / `trustWorkflow` 15), 타입·architecture **549 modules**·production build **402 modules** 통과. 기존 큰 JS chunk 경고는 남는다. 검증 명령과 범위는 [검증 기록](../verification/UI-P1-H1-2026-10-14.json)을 따른다.

## 지원 경계와 다음

현재 복구 저장소는 localStorage다. 목록을 primary/backup으로 보존하지만 브라우저 저장소 자체의 전체 삭제를 복원하는 기능은 아니다. raw archive는 지원 담당/수동 복구 자료이며 일반 도면처럼 Open project로 여는 UI나 archive import/migration은 아직 없다. 검증된 checkpoint 검색 복구는 이미 제공한다. 검색 복구에서는 원래 탭 표시 이름·닫힘 상태를 알 수 없으므로 document ID를 이름으로 사용하고 발견한 읽을 수 있는 프로젝트를 연다.

읽을 수 없는 namespace는 그대로 남는다. 닫은 프로젝트 검색/영구 삭제·orphan/asset 정리·200개 제한 관리·IndexedDB adapter는 **UI-P1-H2**로 이어간다. 비활성 render/Worker 비용·메모리 예산은 **UI-P2**, 좌우 분할은 **UI-P3**다. 파일 다운로드 표시와 Undo 이력은 열린 편집 세션에만 유지한다.
