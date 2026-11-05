# UI-P4 공유/협업 기반

2026-10-18. 현재 사용법: [프로젝트와 저장](../features/PROJECTS.md#프로젝트-묶음-공유와-revision-비교).

## 구현

상단 Share bundle에서 열린/닫힌 프로젝트를 선택하고 `Projects.webcad.bundle.json`을 내보낸다. 열린 프로젝트는 기존 checkpoint 메시지의 현재 편집본 snapshot을 사용하고 닫힌 프로젝트는 localStorage/IndexedDB의 검증된 checkpoint를 읽는다. 손상 current를 backup으로 대체한 경우에는 먼저 복구하도록 안내한다. 편집 중 명령과 snapshot 실패/timeout은 다운로드를 진행하지 않는다.

묶음 v1은 프로젝트 ID·제목·portable CAD 문서·export 시각을 포함한다. 1–20개 프로젝트 / UTF-8 16 MiB로 제한한다. 이미지 원본은 각 문서에 내장하며 문서 참조와 이미지 SHA-256·길이를 검증한다. 무효 포맷/버전·중복 프로젝트 ID·누락 이미지·checksum 불일치는 저장 전에 거부한다.

가져오기 Review에서 incoming revision·객체/이미지 수·ID 충돌을 표시하고 비교할 로컬 프로젝트를 선택한다. objects/features/sketches/layers/artboards/rasterAssets/componentLibrary/workPlanes/scenes의 ID별 추가·삭제·변경 수와 나머지 문서 설정/순서 차이를 표시한다. JSON 키 순서는 차이로 세지 않으며 배열 순서는 유지한다. revision 수치만으로 최신/공통 조상을 추정하지 않는다.

충돌 정책은 **항상 새 복사본**이다. 사용자가 명시적으로 확인한 뒤 전체 묶음을 가져온다. 각 프로젝트 namespace와 문서 ID를 새 UUID로 바꾸며 문서 내부 객체 ID/참조·asset의 content ID는 해당 독립 세션 안에서 유지한다. 기존 라이브 iframe·document·Undo를 교체하지 않는다. 첫 복사본을 열고 나머지는 Closed projects에 둔다. 새로고침 후에도 같은 저장 문서 ID/기하를 복원하며 Undo는 기존 계약대로 새 세션이다.

## 원자 저장과 복구

기존 H2 storage journal에 bounded `targets`를 추가했다. 기존 단일 target 레코드는 그대로 복구하고 다중 target도 명시된 namespace와 workspace primary/backup만 변경할 수 있다. 가져올 모든 checkpoint/asset을 메모리에 준비한 뒤 하나의 journal로 저장한다. quota/게시 실패 시 전체 원복하며 중단은 다음 부팅에서 복구한다. 다른 창의 list/namespace 변경은 guard로 거부한다. 저장 공간 부족 시 일부 프로젝트만 성공으로 보고하지 않는다. quota가 localStorage 수용량보다 크면 가져오기는 실패하며 기존 데이터는 보존한다.

## 검증

- 전체 Node 회귀: 1,368개 / 54 suites 통과. 이후 비교 키 순서 처리·용량 검증 2개 추가를 포함한 관련 Node 30개 통과(중복 집계하지 않음).
- 신규 네이티브 브라우저 projectBundle: 열린/닫힌 프로젝트 export, 실제 파일 import, 충돌 Review, 이미지 보존, 기존 편집기 유지, 새로고침 복구. 결과 수는 [manifest](../verification/UI-P4-2026-10-18.json) 참조.
- 프로젝트 관리/좌우 비교 브라우저 회귀와 전체 build/architecture 결과는 manifest에 기록한다. 기존 빈 문서 테스트는 현재 시작 모드에 맞춰 네이티브 3D 버튼을 누른 뒤 Box를 사용하도록 보완했다.
- [실제 묶음](../../output/verification/project-bundle/Projects.webcad.bundle.json), [Review 화면](../../output/verification/project-bundle/bundle-review.png), [브라우저 보고서](../../output/verification/project-bundle/native-report.json).

## 지원 경계

파일로 공유하는 로컬 협업 기반이다. 자동 병합/덮어쓰기, 원격 서버/계정/권한/동기화, 실시간 공동편집, 변경 이력 그래프/공통 조상 판정, 형상 차이 overlay는 포함하지 않는다. 묶음 export는 프로젝트별 snapshot이며 모든 프로젝트의 동일 시점 분산 snapshot을 보장하지 않는다. 다운로드는 브라우저 전달 시작만 확인한다. 기존 CAD 출력 경로는 변경하지 않았고 PDF를 별도로 재발행하지 않았다.
