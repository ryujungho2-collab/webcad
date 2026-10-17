# UI-P2 다중 프로젝트 성능 — 2026-10-15

> **현재 기능 설명:** [프로젝트와 저장](../features/PROJECTS.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

## 이번 구현

- 부모 workspace는 등록된 iframe의 project ID/세대와 실제 활성 탭을 이용해 activity를 전달한다. 자식은 부모 window/origin/channel/ID/generation을 모두 확인한다. 문서 visibility도 함께 반영한다.
- `app/projectActivity.ts`의 프레임 스케줄러로 뷰포트·스케치/직접 편집/곡선/프레임/이미지 등 화면 루프를 정지·재개한다. 전역 브라우저 API를 덮어쓰지 않는다. 비활성 동안 pending callback을 보존하고 해제된 도구의 callback은 취소한다.
- iframe을 유지하므로 선택·카메라·React 입력·Undo를 보존한다. Scene 재생은 비활성 시간만큼 앞으로 뛰지 않도록 복귀 시 기준 시각을 재설정한다.
- 비활성 상태에서 60초 간격으로 Worker 유휴 여부를 확인한다. 실행/대기 작업이 없을 때만 Worker/WASM을 반환하고 다음 요청에 새 Worker를 만든다. 짧은 탭 전환은 warm Worker를 유지한다. 문서 명령·저장·내보내기를 탭 전환 때문에 취소하지 않는다.
- 기존 task ID/Worker identity 검증·queued/active cancel 계약을 보존한다. 새 Worker는 이전 task ID를 재사용하지 않는다. JS의 mesh/measurement 캐시와 GPU 장면은 유지하므로 전체 메모리 반환이나 byte 예산 완료라고 주장하지 않는다.

## 검증과 측정

실행 결과는 [R5 native report](../../output/verification/ui-p2-r5-native-report.json)에 기록한다. Cold는 각 프로젝트의 실제 56부품이 Three.js scene에 도달하는 시간, warm은 물리 탭 클릭부터 해당 frame scheduler의 첫 callback까지 시간이다. CDP 입력·poll 지연이 포함되므로 순수 renderer 지연으로 해석하지 않는다. 두 최초 로드와 4회 전환은 제한된 단일 실행이며 통계적 대규모 성능 주장이 아니다.

대상 Node에는 scheduler pause/resume/cancel 및 Worker 유휴 반환·진행 작업 보존·재시작이 포함된다. 기존 projectTabs는 실제 Undo/Redo·저장·닫기·재열기·namespace 격리를 검증한다. 저장소 관리/복구는 해당 browser 회귀로 검증한다.

## 남은 범위

**UI-P2-C 작업 scope·메모리 예산**을 후속으로 유지한다. 화면용 계산과 문서용 계산의 명시적 scope/AbortSignal 분리, 비활성 화면의 불필요한 기하 요청 취소/재개, JS/GPU retained bytes/가능한 WASM capacity 관측, cache byte 예산과 장시간 반복 전환이 남는다. 이번에는 진행 중인 계산을 안전상 무조건 취소하지 않는다. 기존 namespace/Undo/저장 계약을 보존하며 다음 작업으로 마감한다.

## 실제 발견한 저장 용량 한계

R5 두 개의 현재본/백업을 로컬에 보관하는 도중 `QuotaExceededError`가 발생했다. 두 프로젝트의 저장 성공을 주장하지 않는다. 테스트는 이 오류만 명시적으로 기록하고 문서/Undo 보존과 self-contained 파일 export를 별도로 검사한다. 다른 오류는 실패 처리한다. 백업을 지워 성공처럼 만들거나 축소 fixture로 대체하지 않는다.

따라서 **UI-P2-S 큰 문서 비동기 저장·용량 복구**를 대형 프로젝트 완료의 선행으로 추가한다. H1/H2의 journal·namespace·checkpoint·닫기 실패 보존 계약을 유지하는 IndexedDB 문서/asset 이관, migration·quota·중단 복구와 실제 R5 두 도면 재열기가 필요하다. 파일 export 경로는 유지한다. UI-P2-C와 S가 끝나기 전 UI-P2 전체 완료 또는 대형 다중 프로젝트 상용 준비 완료로 표기하지 않는다.

## 2026-10-15 결과

- R5 native **16 checks 통과**. 두 프로젝트 모두 실제 56부품을 scene에서 확인했다. 각 metadata 편집/Undo, 전체 WebCAD snapshot, 각 첫 연관 투영의 DXF skipped0을 검사했다. 전체 PDF 4권 재발행을 이번 검사에 포함하지 않았다.
- Cold scene: **17,438.8ms / 15,332.9ms**. Warm 전환4회: **186.6 / 185.9 / 179.7 / 185.5ms**. 단일 실행, Chromium/SwiftShader, 입력/관측 지연 포함.
- 비활성 callback은 1.2초 관측 중 추가 **0회**. Worker 제출 작업은 두 세션 각각23회; 유휴 반환 후 A의 새로운 기하 작업으로24회가 됐고 B는23회 그대로다. A Worker 반환1회 후 Undo 정상.
- JS mesh cache는 세션당23 entries를 유지했다. GPU/JS heap bytes 또는 WASM 실제 live bytes를 측정한 수치가 아니며 ‘메모리 X MB 절감’으로 바꾸어 말하지 않는다.
- local checkpoint: A 성공, B quota 초과. B의 도면/Undo·portable export는 보존했다. [최초 quota 실패 기록](../../output/verification/ui-p2-r5-initial-quota-report.json)을 별도 보존했다.
- 초회 테스트는 Vite 모듈 로딩 실패로 fixture가 시작되지 않아 개발 서버 준비 후 다시 실행했다. 최종 fixture는 모듈 초기화 실패도 즉시 보고하도록 보충했다. 실패 실행을 성능 표본에 섞지 않았다.

최종 회귀: Node44(이전 DXF 마감31 포함), browser119(projectPerformance16/projectTabs19/projectRecovery24/projectManager30/scenesWorkflow30), 타입·architecture563·production408·diff whitespace 검사 통과. [검증 요약](../verification/UI-P2-2026-10-15.json). 전체 CAD suite를 재실행한 결과는 아니다.

2026-10-15 후속: **UI-P2-S 저장소 보충을 지원 범위로 완료**했다. 실제 R5 두 문서가 모두 저장되고 닫기/재열기 및 페이지 reload를 통과한다. [구현·검증](UI-P2-S-DURABLE-STORAGE-2026-10-15.md). 다음은 **UI-P2-C 작업 scope·메모리 예산**이며 전체 P2는 여전히 진행 상태다.
