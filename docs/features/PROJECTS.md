# 프로젝트와 저장

[기능 가이드](README.md) · [후속 계획](../product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md)

한 탭은 독립 문서다. 여러 도면 뷰·시트는 같은 프로젝트 안에서 원본을 공유할 수 있다. 이 문서는 탭, 저장/복구, 프로젝트 관리와 비활성 세션의 현재 동작을 관리한다.

## 열기와 전환

상단 **＋**, New document/Ctrl+N은 새 탭을 만든다. **Open project**나 Open document는 기존 프로젝트를 유지하며 파일을 새 탭에 연다. 탭 클릭 또는 탭에 포커스를 둔 좌우/Home/End로 전환한다. 이름 더블클릭은 workspace 표시 이름만 바꾼다.

열린 탭을 전환하면 각 문서의 Undo/Redo·선택·2D/3D·화면 상태를 유지한다. **×**로 닫을 때는 최신 로컬 저장 완료를 기다린다. 명령 실행 중·저장 실패·응답 timeout이면 세션을 유지한다. **Closed projects**나 Projects에서 다시 열 수 있다.

**닫기·새로고침·재열기는 새 Undo 세션**이다. 도면과 탭 목록은 복구하지만 이전 Undo·선택·카메라·미확정 preview는 복구 대상이 아니다. 닫기는 복구본 삭제가 아니다.

## 로컬 저장과 파일 다운로드

| 동작 | 결과와 확인할 상태 |
| --- | --- |
| **Save locally / Ctrl+S** | 이 브라우저의 복구본 저장. Saved locally와 Local recovery failed를 구분한다. 자동 저장도 같은 경로다. |
| **Download file / Ctrl+Shift+S** | 이미지 원본을 포함한 휴대 가능한 `.webcad.json` 다운로드 시작. 브라우저가 실제 디스크 기록 완료까지 확인하지는 않는다. |
| **Projects → Export WebCAD file** | 열린 문서는 현재 snapshot, 닫힌 문서는 검증된 checkpoint/backup에서 내보낸다. 열린 문서는 로컬 저장 실패 중에도 내보낼 수 있으나 문서 명령 실행 중에는 기다려야 한다. |

큰 문서와 이미 이관한 프로젝트는 IndexedDB에 current/backup·내장 asset을 원자 저장하고 작은 문서는 localStorage를 유지한다. 사용자가 저장 위치를 선택할 필요는 없다. 강제 종료에서는 마지막 완료된 저장까지 복구하며 미완료 편집까지 보장하지 않는다.

## 실패에서 복구하기

저장 실패는 **Retry / Retry local save**로 재시도한다. 목록이 손상되면 복구 화면에서 **Restore backup project list**를 사용한다. 백업 목록도 읽을 수 없으면 **Find saved projects → Restore recovered project list**로 유효 checkpoint를 찾는다. **Download recovery data**는 손상 원문을 포함한 복구 자료이며 일반 도면 파일과 다르다.

문서 current가 손상됐을 때는 유효 backup을 사용한다. 읽을 수 없는 데이터를 빈 문서 자동 저장으로 덮지 않는다. 다른 창과 저장이 충돌하면 현재 편집을 파일로 내보낸 뒤 재열기 안내를 따른다.

## 프로젝트 관리와 자원

**Projects**에서 이름/ID 검색, 열린·닫힌·미등록 복구본 필터, 최근 시각과 용량 추정을 확인한다. **Add recovered project**는 미등록 유효 복구본을 목록에 등록한다. **Delete project…**는 닫힌/미등록 프로젝트를 대상으로 확인 후 영구 삭제하며 모델 Undo로 복구되지 않는다. **Clean unused images…**는 current/backup 어느 쪽에서도 쓰지 않는 이미지에만 적용한다.

비활성 프로젝트는 렌더·화면 작업을 줄이고 파생 cache/GPU·유휴 Worker를 반환한다. 복귀 시 필요한 표시 자원을 다시 만든다. 전체 프로세스·문서·Undo의 무제한 메모리 상한이나 시간 단위 운영을 보장하지 않는다. 좌우 분할 비교·탭 고정/순서 이동·실시간 협업은 후속 계획이다.

## 구현·검증 근거

| 근거 | 확인할 내용 |
| --- | --- |
| [탭](../implementation/PROJECT-TABS-2026-10-14.md) · [저장 복구](../implementation/UI-P1-H1-PROJECT-RECOVERY-2026-10-14.md) | 독립 세션, 닫기 응답, 복구/다운로드 상태 |
| [프로젝트 관리](../implementation/UI-P1-H2-PROJECT-MANAGER-2026-10-14.md) | 삭제·이미지 정리·실패/중단 복원 |
| [대형 저장소](../implementation/UI-P2-S-DURABLE-STORAGE-2026-10-15.md) · [작업 취소/메모리](../implementation/UI-P2-C-TASKS-MEMORY-2026-10-16.md) | IndexedDB 이관, 두 문서/20회 전환과 측정 한계 |
