# UI-C4 프로젝트 시작 화면

2026-10-17 · 첫 지원 범위 완료. [사용법](../features/PROJECTS.md) · [검증 manifest](../verification/UI-C4-2026-10-17.json)

기본 시작 위치를 Home으로 바꾸고 최근 프로젝트 검색·닫힌 프로젝트 재열기·복구본 등록·빈 문서·파일 열기·독립 샘플 생성을 연결했다. 시작 화면 표시 여부는 문서와 별개로 저장한다. 기존 초기 프로젝트 계약과 H2 저장/복구 경로를 유지한다.

## 구현과 보존 조건

- ProjectHome은 최근 목록과 선택한 저장본만 읽는다. current가 손상되면 검증된 backup을 표시하고 원본 바이트를 교체하지 않는다. 읽을 수 없는 복구본은 오류로 표시한다. 목록에 없는 복구본은 검증 후 기존 H2 등록 경로로 추가한다.
- 미리보기는 마지막 저장본의 지원되는 XY 선·폴리라인·사각형·원·호 윤곽이다. 96 features, 원본 점 512/feature, 결과 점 2048/feature, 전체 8192점으로 제한한다. Worker/BRep/mesh를 요청하지 않는다. 3D·이미지·전체 도면 렌더링과 저장 전 실시간 편집은 포함하지 않는다.
- Home 진입 시 기존 iframe은 같은 위치에 유지하고 activity를 일시 정지한다. Continue는 비교 쌍·Undo·revision을 유지한다. 기본 시작 Home에서는 편집 iframe을 만들지 않는다.
- 주거 6×4m 윤곽과 기계 판 120×80mm 샘플은 자체 제작 자료다. 검증된 문서를 깊은 복제하고 새 프로젝트/문서 ID와 프로젝트별 asset namespace를 부여한다. checkpoint·asset·workspace 목록은 기존 transaction으로 게시하며 실패 시 되돌린다.
- 검색은 이름/ID와 한글 정규화를 지원한다. Enter로 첫 결과 열기, 아래 화살표로 카드 이동, Esc로 검색 해제/편집 복귀를 제공하며 IME 확정 Enter는 열기로 처리하지 않는다.

## 검증

전체 Node 1,309 tests / 54 suites / 실패 0. 신규 Node 6개, 실제 Edge Home 26개 검사와 기존 탭 19·복구 24·탭 탐색 27·관리 30·비교 25개 회귀를 확인했다. 타입·구조·production build도 통과했다. 기존 큰 chunk 경고는 남아 있다.

브라우저 검증은 기본 Home 시작, 한글 IME, 검색, 손상 current/backup 보존, 미등록 복구, 비교 세션/Undo 유지, 빈 문서, 샘플 복제 격리, quota 실패/Retry, 실제 파일 입력, 시작 옵션 재로드와 960px 화면을 포함한다. 기존 편집 전용 fixture는 startOnHome=false를 명시하고 신규 Home fixture에서 제품 기본값과 두 시작 옵션을 검증한다. 대형 프로젝트/장시간 성능 보장은 포함하지 않는다.

비교 회귀에서 비활성 iframe 클릭 후 다운로드 단축키가 동작하지 않는 문제를 발견했다. 활성 전환에도 Home 복귀용 탭 포커스를 적용한 것이 원인이었다. 포커스 복귀를 실제 Home 종료에만 제한한 뒤 두 창 다운로드를 포함한 비교 25개 검사가 통과했다.

![1440px 시작 화면](../../output/verification/project-home/home-1440.png)

![960px 시작 화면](../../output/verification/project-home/home-960.png)
