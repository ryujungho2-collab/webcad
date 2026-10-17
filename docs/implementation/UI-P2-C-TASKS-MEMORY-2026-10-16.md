# UI-P2-C 작업별 취소·메모리 예산

> **현재 기능 설명:** [프로젝트와 저장](../features/PROJECTS.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-16. UI-P2-S의 저장·백업·닫기·재열기 계약 위에서 화면 작업의 수명과 반환 가능한 캐시/장면 자원을 관리한다.

## 구현

- `KernelWorkerClient.request`에 AbortSignal을 연결했다. 대기 요청은 Worker로 전송하기 전에 취소한다. 실행 중 OCCT는 협력 취소가 불가능하므로 해당 Worker를 종료하고, 취소되지 않은 문서/출력 요청은 새 Worker에서 이어 간다. task ID/Worker identity 검증으로 늦은 응답을 무시한다. Abort listener는 완료/실패/취소 때 해제한다.
- 같은 signal로 묶인 요청을 한꺼번에 취소할 때 이미 aborted인 대기 작업을 먼저 거른다. 화면 burst마다 Worker를 생성·종료하는 비용을 방지한다.
- `viewGeometryService`에서 화면 scope를 명시한다. viewport의 모델 sync·BRep 선택 topology·extrusion/fillet/chamfer/Copilot ghost는 effect별 controller를 갖고, 문서 변경·도구 변경·unmount 때 해당 요청을 취소한다. 프로젝트 비활성화는 모든 화면 scope를 중지한다.
- 문서 검증·치수/측정·단면/투영·STEP 출력은 기존 보호 경로를 유지한다. 탭을 바꿨다는 이유로 취소하지 않는다. 사용자가 기존 전역 Cancel을 명시한 동작은 유지한다.
- 같은 파라미터여도 진행 중인 서로 다른 취소 scope끼리는 Promise를 공유하지 않는다. 완료한 정확한 결과만 재사용한다. 취소/예산 퇴출된 요청의 늦은 결과는 cache에 재등록하지 않는다.
- 장면에 늦게 만들어진 GPU mesh는 즉시 dispose한다. 비활성/취소된 scene sync가 clipping/선택 후보를 뒤늦게 바꾸지 못하게 했다. 유휴 반환 시 TransformControls와 renderer render-list의 모델 참조도 해제한다. 복귀할 때 현재 문서에서 장면·선택 도구·직접 선택 후보를 다시 구성한다.

## 예산과 반환 정책

| 자원 | 정책 | 수치의 의미 |
| --- | --- | --- |
| JS 결과 cache | 프로젝트당 active64MiB, 비활성 직후16MiB, 30초 뒤0 | mesh/topology/measurement/section/projection **키+결과 payload의 계산상 bytes**. typed buffer 중복 참조는 한 번 계산, pending 예약64KiB. 개수 제한도 유지 |
| GPU 모델 장면 | 비활성30초 뒤 geometry/material/texture dispose 및 Map 해제 | vertex/index buffer bytes와 texture base RGBA/mipmap 추정. grid/gizmo 등 고정 UI 자원 및 드라이버 오버헤드는 별도 |
| WASM Worker | 비활성60초에 작업이 없을 때 반환. 보고된 capacity128MiB 초과는 1초간 유휴 후 반환 | **capacity**이며 live shape bytes가 아니다. 실행/대기 문서 작업을 중단하는 강제 메모리 상한이 아님 |
| 계측 기록 | cache hit mark는 종류당128개, key 원문 대신 길이 | 거대한 JSON key를 성능 기록이 계속 붙잡는 문제 방지 |

LRU는 byte budget을 넘는 순간 cache 소유 참조를 퇴출한다. 단일 결과가 예산보다 크면 소비자에게 결과는 전달하되 cache에는 보관하지 않는다. 입력 문서·Undo·현재 표시 중인 장면·실행 요청·내보내기 결과를 이 cache budget으로 잘라 버리지 않는다. 따라서 **전체 프로세스 메모리64MiB 상한**이라고 해석하지 않는다. 활성 GPU working set은 도형을 누락시키지 않고 계측하며, 유휴 모델 장면만 반환한다. 대형 문서 자체·Undo byte 정책과 kernel source/slab별 byte LRU는 별도 성능 과제다.

긴 비활성 이후에는 다시 mesh를 계산할 수 있어 첫 복귀가 짧은 탭 전환보다 느리다. 문서·카메라·선택·도구 입력·Undo는 유지한다. 작은 전환은 기존 장면을 유지한다. 기본값은 프로젝트별이므로 많은 열린 문서의 원본/Undo 합계까지 전역 상한을 보장하지 않는다.

## 계측

`projectKernelMetrics()`는 cacheBytes/cacheLimitBytes/evictions, gpuPayloadBytes/releasedGpuScenes, workerResident/workersCreated/cancelledTasks, wasmCapacityBytes/retainedSources/retainedSlabs를 분리해서 제공한다. viewCancellations는 비활성화로 scope를 중지한 횟수이며 실제 Worker 요청 취소 수는 cancelledTasks다. capacity를 얻지 못하면 null을 보고하며 0으로 추정하지 않는다. WASM live allocation과 JS/GPU 실제 heap은 제공하지 않는다.

## 검증

[검증 요약](../verification/UI-P2-C-2026-10-16.json), [실제 Worker scope/byte 퇴출](../../output/verification/ui-p2-c-task-scope-native-report.json), [R5 두 프로젝트](../../output/verification/ui-p2-c-r5-native-report.json).

- Node: LRU bytes/oversize/late pending/typed array 공유/cycle, GPU shared buffers, active-document/queued-view와 active-view/queued-document 양방향 취소, burst 취소 Worker 수, 기존 retained slab/HLR·R5 14view 이동·복구 회귀.
- Native Worker: 실제 view 취소 후 보호된 문서 volume24 유지, 다시 mesh 생성, item limit에 닿기 전에 긴 key로 **실제64MiB byte eviction** 유도. 이 stress 입력은 cache key 비용을 시험하는 격리 fixture이며 CAD 기능으로 긴 문자열을 권장하는 것이 아니다.
- Native R5: 두 문서의 실제56부품·20회 전환·긴 비활성 cache/GPU 반환·실제 GPU UUID 재생성·Worker 복귀·각 Undo/DXF/저장·닫기/재열기·페이지 reload. 최초 로드와 반복 전환을 분리한다. 한 실행의 제한된 표본이며 장시간 운영/무제한 프로젝트 성능으로 확대하지 않는다.

최종 R5 단일 실행(Chromium/SwiftShader): cold scene9,272.5/8,102ms, warm 전환20회196.5–278.4ms. 전환에는 실제 입력/관측 지연이 포함되어 렌더 시간만의 수치가 아니다. 비활성 반환 검사는 cache/GPU payload0을 확인하고, 복귀 이후 표본은 모델 GPU payload12,898,366bytes와 새 UUID·예산 이하 cache를 확인했다. WASM capacity는104,857,600bytes로 별도 보고했다. before/after 평균 개선율이나 장시간 성능을 주장하지 않는다.

## 변경 파일

`cad/cacheBudget.ts`, `kernelWorkerClient.ts`, `kernelGeometryService.ts`, `viewGeometryService.ts`, `kernelProtocol.ts`, `kernel.worker.ts`; `app/useProjectActivity.ts`; `viewport/CadViewport.tsx`, `gpuPayload.ts`; 관련 Node/native fixture·probe·runner.
