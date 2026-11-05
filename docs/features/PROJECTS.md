# 프로젝트와 저장

[기능 가이드](README.md) · [후속 계획](../product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md)

한 탭은 독립 문서다. 여러 도면 뷰·시트는 같은 프로젝트 안에서 원본을 공유할 수 있다. 이 문서는 탭, 저장/복구, 프로젝트 관리와 비활성 세션의 현재 동작을 관리한다.

## 프로젝트 시작 화면

앱은 기본으로 **Home**에서 시작한다. 최근 목록에서 이름/ID를 검색하고 열린 항목·닫힌 항목·목록 밖 복구본을 필터링한다. 카드를 고르면 마지막 저장본의 지원되는 XY 윤곽과 revision을 표시하고 **Open selected project**로 연다. 검색에서 Enter는 첫 목록 결과를 열며 한글 조합 확정은 프로젝트를 열지 않는다.

미리보기는 저장된 기본 선/폴리라인/사각형/원/호의 일부다. 저장 전 편집·3D·이미지·전체 도면은 편집기에서 확인한다. 손상된 current 대신 검증된 backup을 표시할 수 있지만 탐색만으로 복구본을 덮어쓰지 않는다. **Recovery & storage**는 기존 복구 관리자를 열고 목록 밖 복구본은 검증 후 등록한다.

**Blank project**, **Open WebCAD file**, 주거/기계 샘플로 새 프로젝트를 시작한다. 자체 제작 샘플은 매번 새 프로젝트/문서 ID와 별도 asset 저장 공간을 갖는 독립 복제다. 저장 실패 시 기존 목록을 보존하고 Retry로 다시 시도한다.

상단 **Home**으로 돌아와도 열린 편집기와 비교 쌍의 Undo·선택은 유지된다. **Continue editing**으로 이어서 작업한다. 시작 화면의 표시 옵션은 문서와 별개로 저장하며 해제하면 다음 실행에서 활성 편집기를 바로 연다. [구현·화면](../implementation/UI-C4-PROJECT-HOME-2026-10-17.md) · [검증](../verification/UI-C4-2026-10-17.json).

## 열기와 전환

상단 **＋**, New document/Ctrl+N은 새 탭을 만든다. **Open project**나 Open document는 기존 프로젝트를 유지하며 파일을 새 탭에 연다. 탭 클릭 또는 탭에 포커스를 둔 좌우/Home/End로 전환한다. 이름 더블클릭은 workspace 표시 이름만 바꾼다.

열린 탭을 전환하면 각 문서의 Undo/Redo·선택·2D/3D·화면 상태를 유지한다. **×**로 닫을 때는 최신 로컬 저장 완료를 기다린다. 명령 실행 중·저장 실패·응답 timeout이면 세션을 유지한다. **Closed projects**나 Projects에서 다시 열 수 있다.

**닫기·새로고침·재열기는 새 Undo 세션**이다. 도면과 탭 목록은 복구하지만 이전 Undo·선택·카메라·미확정 preview는 복구 대상이 아니다. 닫기는 복구본 삭제가 아니다.

## 두 프로젝트 비교하기

서로 다른 프로젝트 두 개를 열고 상단 **Compare**를 누른다. 각 창 안을 클릭하거나 **Activate**를 누르면 그 프로젝트가 활성 편집 대상으로 표시된다. 각 문서의 선택·Undo/Redo·메뉴·내보내기는 독립적이다.

- 가운데 구분선을 드래그하거나 구분선에 포커스를 두고 좌우 화살표로 크기를 조절한다. Shift+화살표는 크게 조절, Home/End는 양 끝의 허용 크기, 더블클릭은 반반 배치다.
- 창 위 목록에서 비교 대상을 바꾼다. 반대 창에 표시된 프로젝트를 고르면 위치를 맞바꾸며 같은 편집기를 복제하지 않는다. 다른 탭을 클릭하면 활성 창의 프로젝트를 교체한다.
- 좁은 비교 창은 캔버스를 넓게 유지한다. 양옆 **Show Explorer / Show Properties**로 패널을 펼치고 같은 버튼으로 접는다. 파일 다운로드는 File 메뉴나 Ctrl+Shift+S를 사용한다.
- **Single view**는 활성 프로젝트 하나만 표시한다. 다른 프로젝트는 열린 세션으로 남아 Undo·선택·화면 상태를 유지한다. 비교 중 한 프로젝트를 닫으면 로컬 저장 후 나머지 창의 단일 보기로 돌아온다.

비교 쌍·크기·활성 프로젝트는 새로고침 후 복원하지만 Undo는 새 세션이다. 두 창은 각각 렌더하고 화면에 없는 탭만 일시 정지한다. 두 카메라의 동기화는 후속 범위다.

편집기 하단의 저장 상태·재시도·단축키·포커스 규칙은 [상태와 키보드](INPUT-ACCESSIBILITY.md)를 따른다.

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

화면에 없는 프로젝트는 렌더·화면 작업을 줄이고 파생 cache/GPU·유휴 Worker를 반환한다. Worker의 native source와 retained slab도 각각 128개·64MiB 추정 byte 예산 및 LRU/명시적 해제를 사용한다. cache 소유 참조·실행 중 task clone·JS payload·GPU payload·WASM capacity를 분리해서 계측한다. native 추정치는 allocator live allocation이나 RSS 상한이 아니다. [P4 정책과 계측](../implementation/G6-D6-P4-CACHE-COLD-HLR-2026-10-18.md). 복귀 시 필요한 표시 자원을 다시 만든다. 전체 프로세스·문서·Undo의 무제한 메모리 상한이나 시간 단위 운영을 보장하지 않는다. 실시간 협업은 후속 계획이다.

## 열린 탭 탐색하기

탭의 ◇ 버튼으로 고정하면 고정 그룹이 앞에 표시된다. ⠿ 핸들을 드래그하거나 탭에 포커스를 둔 채 **Alt+Shift+←/→**로 같은 그룹 안에서 순서를 바꾼다. 드래그 중 **Esc**는 취소한다. 그룹을 바꾸려면 고정/해제를 사용한다. 고정과 순서는 로컬 목록에 저장되며 닫았다 다시 연 프로젝트도 고정을 유지한다.

**Find tab / Alt+Shift+P**는 열린 프로젝트의 이름/ID를 검색한다. **↑↓ → Enter**로 선택하고 **Esc**로 닫는다. 한글 조합 중 Enter는 프로젝트를 전환하지 않으며 텍스트 입력 중에는 검색 단축키를 가로채지 않는다. 닫힌 프로젝트는 **Closed projects**에서 다시 연다.

탭에 포커스가 있으면 **←/→/Home/End**로 전환한다. 긴 제목과 많은 탭은 좌우 스크롤 버튼으로 탐색하고 검색으로 선택한 탭은 보이는 위치로 이동한다. **Ctrl+Tab**은 브라우저에 남겨 둔다. 탭 고정/순서 변경은 편집 iframe을 재배치하지 않아 기존 Undo와 비교 창 위치를 유지한다. 목록 저장 실패는 기존 설정을 보존하고 **Retry**로 재시도한다.

## 구현·검증 근거

| 근거 | 확인할 내용 |
| --- | --- |
| [탭](../implementation/PROJECT-TABS-2026-10-14.md) · [저장 복구](../implementation/UI-P1-H1-PROJECT-RECOVERY-2026-10-14.md) | 독립 세션, 닫기 응답, 복구/다운로드 상태 |
| [좌우 비교 — UI-P3-A](../implementation/UI-P3-A-PROJECT-COMPARISON-2026-10-17.md) | 두 창 편집/크기 조절, iframe·Undo 유지, 1440/960px, 비교 복원 |
| [탭 탐색 — UI-P3-B](../implementation/UI-P3-B-TAB-NAVIGATION-2026-10-17.md) | 고정·순서 저장·검색·키보드/IME·overflow·실패 후 재시도 |
| [프로젝트 관리](../implementation/UI-P1-H2-PROJECT-MANAGER-2026-10-14.md) | 삭제·이미지 정리·실패/중단 복원 |
| [대형 저장소](../implementation/UI-P2-S-DURABLE-STORAGE-2026-10-15.md) · [작업 취소/메모리](../implementation/UI-P2-C-TASKS-MEMORY-2026-10-16.md) | IndexedDB 이관, 두 문서/20회 전환과 측정 한계 |

## 프로젝트 내부 탐색

왼쪽 **Project navigation**을 열면 Model, Plans and projections, Sections, Details, Sheets, Frames and drawings 그룹에서 현재 프로젝트의 원본과 도면을 찾을 수 있다. 이름·ID·그룹·상태로 검색하고 항목을 누르면 해당 모델/도면/프레임으로 화면을 맞춘다. Tab·Enter·Space로도 이동할 수 있다.

탐색과 그룹 접기는 모델 수정이나 Undo를 만들지 않는다. 숨김·누락·접힌 작업 영역은 이동할 수 없는 이유를 표시하며 잠긴 대상도 보기 이동은 가능하다. Needs update는 재계산/재바인드가 필요한 기존 도면 상태이고, 이동만으로 자동 수정하지 않는다. 스케치·feature source 편집은 기존 Model tree, 저장한 카메라는 Model views를 사용한다. [지원 범위와 검증](../implementation/G2-W1-PROJECT-NAVIGATION-2026-10-18.md).

재사용 도면 부품·선·해치는 [Component and style library](REUSABLE-LIBRARY.md)에서 검색·미리보기·삽입한다. 현재 프로젝트 정의와 다른 WebCAD 파일의 지원되는 block을 사용할 수 있다.


## 프로젝트 묶음 공유와 revision 비교

상단 **Share bundle**에서 프로젝트를 선택하고 **Download project bundle**을 누른다. `.webcad.bundle.json` 하나에 최대 20개 프로젝트와 이미지 원본을 담으며 파일 한도는 16 MiB다. 열린 프로젝트는 현재 편집본, 닫힌 프로젝트는 저장된 복구본을 사용한다. 다운로드 완료는 브라우저에서 확인한다.

받은 파일은 **Share bundle → Open project bundle**로 연다. 각 프로젝트의 revision·객체/이미지 수와 ID 충돌을 확인한다. **Compare with local project → Compare revisions**로 로컬 문서와 ID별 추가/삭제/변경 수를 비교한다. 다른 로컬 대상을 선택하면 다시 비교한다. revision 숫자는 공통 조상이나 최신 버전 판정이 아니다.

**Import all projects as new copies**를 확인한 뒤 **Import project copies**로 가져온다. 기존 프로젝트는 유지하고 새 프로젝트/문서 ID를 부여한다. 첫 복사본은 열리고 나머지는 Closed projects에서 찾는다. 문서 내부 참조와 이미지 ID는 독립 프로젝트 안에서 유지한다. 검토 취소는 Esc 또는 Close bundle sharing이다. 저장 작업 중에는 완료/실패까지 대기한다.

잘못된 파일·누락/변조 이미지·공간 부족은 가져오기를 거부한다. 저장 실패 시 전체 묶음을 롤백하며 중단된 작업은 다음 시작에 복구한다. 브라우저 저장 공간은 파일 한도보다 작을 수 있다. 목록이 다른 창에서 바뀌면 검토를 다시 연다. 실시간 공동편집·서버 동기화·자동 병합은 별도 범위다. [구현과 검증](../implementation/UI-P4-PROJECT-BUNDLES-2026-10-18.md).


Project navigation의 [Canvases 계층](CANVASES.md)에서 모델·작업 구역·프레임·시트의 소유와 공유 참조를 편집한다. 기존 프로젝트 단위/ID·형상·축척은 유지한다.
