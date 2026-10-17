# UI-P2-S 대형 문서 저장소 보충

> **현재 기능 설명:** [프로젝트와 저장](../features/PROJECTS.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-15. 우선순위: **UI-P2-S → UI-P2-C → WF-C0+A2**. R5 두 프로젝트의 localStorage 복구 백업에서 실제 quota 초과를 확인했기 때문에 저장 신뢰성을 먼저 보충한다.

## 구현

- 직렬화 문자열 1,048,576자 이상의 문서와 이미 이관한 프로젝트는 IndexedDB에 저장한다. 작은 프로젝트는 기존 localStorage 경로를 유지한다. 이관 뒤 문서가 작아져도 다시 localStorage로 되돌아가지 않는다.
- 기존 `agent-webcad-storage-operations` DB를 v2로 올리고 `documents` store를 추가한다. `undo` 삭제 journal은 유지한다. 다른 창이 업그레이드를 막으면 원본을 보존하고 재시도 안내를 표시한다.
- 프로젝트 ID별 current/backup은 이미지 원본을 내장한 self-contained WebCAD snapshot이다. 정확한 문서/asset을 한 strict readwrite transaction으로 commit한다. snapshot 간 동일 이미지 ID라도 각 복구본이 자기 원본/이름을 보존한다.
- 처음 이관할 때 이전 유효 local checkpoint를 backup으로 가져온다. IDB commit 전에는 local 원본을 지우지 않는다. 이관 원본 key/value receipt를 기록하고 그와 일치하는 데이터만 정리한다. 중단된 정리는 다음 시작 때 검증 후 재시도하며 다른 창이 쓴 다른 원본은 보존한다.
- 저장 시작 snapshot/version을 고정하고 같은 세션의 저장을 직렬화한다. 대기 중 source가 바뀌면 쓰기 전 중지한다. 쓰는 동안 변경되면 saved ack를 내지 않고 최신 revision 재시도를 요청한다. pending 상태와 실제 transaction 완료를 구분한다.
- 저장 token의 compare-and-swap으로 다른 창의 먼저 완료된 저장을 덮지 않는다. 충돌 시 현재 편집 세션과 파일 export를 보존하고 reload 전에 export하도록 안내한다.
- 프로젝트 닫기는 async 저장 완료 응답 후에만 iframe을 해제한다. New/Open에서 유효한 파일을 연 경우와 autosave/Retry/Save 모두 새 저장 API를 사용한다.
- 시작 시 `DocumentRecoveryGate`가 실제 복구본을 검증한 뒤 App을 mount한다. 손상 current는 유효 backup으로 복원한다. IDB 데이터가 누락됐거나 둘 다 읽을 수 없으면 빈 문서를 mount/자동 저장하지 않고 재시도를 제공한다.
- Projects의 상세 검증·닫힌 문서 export·unlisted 복구 검색·용량 추정·raw archive가 IDB도 포함한다. 작은 local index는 다시 만들 수 있는 메타데이터이며 원본 문서가 아니다.
- durable 프로젝트의 삭제는 local 목록/index 변경과 기존 crash journal을 사용한다. durable document 삭제와 committed journal marker는 같은 IDB transaction에 넣는다. commit 전 실패는 목록/index를 복원하고 문서를 유지하며, commit 후 recovery는 삭제한 문서를 되살리지 않는다. 삭제 직전 token도 다시 확인한다.

## 사용과 지원 경계

기존 Save locally / 프로젝트 닫기 / Projects export 동작을 그대로 사용한다. 저장 위치를 수동으로 선택할 필요가 없다. 이름/단위/참조/Undo 데이터는 변경하지 않는다. File export는 저장 실패 시에도 live snapshot으로 계속 가능하다.

IndexedDB에도 브라우저 디스크 quota와 사용자 데이터 삭제의 한계는 있다. 실패를 성공으로 보고하거나 유효 백업을 지워 공간을 만드는 방식으로 처리하지 않는다. 명시적 **프로젝트 닫기**는 최신 저장을 기다린다. 브라우저 강제 종료/프로세스 kill에서는 마지막 완료된 transaction까지 복구하며 마지막 미완료 편집까지 보장하지 않는다.

이미지는 첫 범위에서 snapshot마다 내장한다. image content-address store의 추가 중복 제거, 문서 delta 저장, streaming serialize/parse 및 JS/GPU cache byte 예산은 이번 완료 범위가 아니다. 기존 동기 `saveDocumentToCache`는 local 경로 호환용이며 실제 UI는 `saveDocumentRecovery`를 사용한다.

## 변경 파일

- `app/projectDatabase.ts`, `app/durableRecovery.ts`: DB upgrade, 원자적 snapshot, token CAS, 이관 receipt/index 복구.
- `state/documentFile.ts`, `state/documentRecovery.ts`: async 정확 revision ack, recovery gate 연결, 검증 함수 공유.
- `app/DocumentRecoveryGate.tsx`, `main.tsx`, `App.tsx`: 읽기 완료 후 편집기 시작, 실제 Save/Retry/Close 연결.
- `app/projectStorageTransactions.ts`, `projectManagerStore.ts`, `ProjectManager.tsx`, `ProjectWorkspace.tsx`: 삭제 commit/복구, 검색/내보내기/index/raw archive.
- `tests/durableRecovery.browser.*`, `projectPerformance.browser.tsx`, probe/runner: 실제 IDB failure/backup/conflict/delete와 R5 migration/close/reopen/reload.

## 검증

[최종 검증 요약](../verification/UI-P2-S-2026-10-15.json), [실제 IndexedDB backend 검사](../../output/verification/ui-p2-s-durable-native-report.json), [R5 두 프로젝트 검사](../../output/verification/ui-p2-s-r5-native-report.json).

실패 이관의 local 원본/이미지 보존, 같은 내부 ID 격리, self-contained export, 손상 current의 실제 backup 이미지 복원, stale window 거부, 실패/중단/commit 삭제 복구, cleanup 중단 후 재개, 누락 durable 데이터의 빈 문서 방지를 검사한다. R5는 실제 56부품/14뷰/10페이지 원본 두 개를 사용해 두 저장 성공, 각 Undo·DXF, Worker 재시작, 닫기/재열기, 실제 페이지 새로고침 후 두 문서 복원을 확인한다. 전체 PDF 발행이나 전체 CAD suite 재실행으로 확대하지 않는다.

최종 결과: **Node29·browser107(backend15/R5 19/recovery24/manager30/tabs19), 타입·architecture567·production411·diff whitespace 통과**. R5 두 checkpoint 모두 saved. Cold11.8/9.4초·warm4회175.4/183.3/179.5/198ms는 단일 실행/CDP 입력 포함 관측이며 이전 실행 대비 속도 향상 주장으로 사용하지 않는다.
