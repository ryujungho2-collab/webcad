# G6-D6-P4 캐시·cold HLR

2026-10-18 · 첫 지원 범위 완료. [현재 도면 가이드](../features/DRAWINGS-OUTPUT.md) · [프로젝트 자원 수명](../features/PROJECTS.md) · [검증 manifest](../verification/G6-D6-P4-2026-10-18.json).

native source/retained slab에 byte 추정 예산과 개수 LRU, 명시적 해제 및 Worker 계측을 추가한다. 첫 source의 exact global HLR에서는 투영 경계가 분리된 그룹과 요청 안의 동일 배치 그룹을 이용한다. 입력 문서나 Undo를 잘라 메모리를 줄이거나 mesh silhouette로 바꾸지 않는다.

## 캐시 소유권과 예산

| 소유 자원 | 정책 | 수치의 의미 |
| --- | --- | --- |
| Native source | Worker당 128개·64MiB 추정 예산 | UTF-16 recipe key + topology/곡선·곡면 poles/knots/triangulation 모델. native malloc 계측이 아님 |
| Native retained slab | 별도의 128개·64MiB 추정 예산 | source와 독립 LRU, 실제 intersection 결과만 보관 |
| JS 결과 cache | 기존 active64MiB·inactive16MiB·30초 뒤0 | P2의 key+payload 예산 유지 |
| 실행 중 shape·출력 | task가 clone을 소유 | LRU의 소유 참조와 분리. 위 cache 상한은 transient working set을 포함하지 않음 |
| WASM Worker/GPU | 기존 P2 유휴 반환 유지 | capacity·GPU payload와 native 추정 bytes를 서로 바꾸어 쓰지 않음 |

native 추정식은 base16KiB + face4KiB·edge1KiB·vertex128B 방문 비용, spline poles128B/knots32B, triangulation node96B/triangle24B를 합한 뒤 4배한다. 공유 topology 반복 방문은 보수적으로 중복 계산한다. 방문 200,000회 초과·미지원 representation·추정 실패는 해당 cache 참조를 보관하지 않고 정확 계산 결과만 전달한다. 한 항목이 byte 예산보다 크면 다른 결과를 생략하지 않고 해당 항목만 uncached로 계산한다.

캐시 원본을 반환하지 않고 task 소유 native wrapper clone을 반환한다. 퇴출/clear는 cache 소유 wrapper를 한 번 delete한다. mesh 생성 전에는 geometry를 깊이 복사하고 triangulation은 복사하지 않아, 공유 native triangulation이 cache byte 추정치를 몰래 증가시키지 않는다. 실패한 build는 등록하지 않는다. 이번 cache/HLR 경로의 임시 explorer·adaptor·triangulation/shape wrapper를 명시적으로 해제한다. 기본 형상 maker와 mesh 변환의 mesher/progress·face/point/normal/triangle wrapper도 finally에서 해제한다.

`resources` Worker 작업은 기존 직렬 큐에서 query/configure/clear를 수행한다. configure는 기존 상한 이내에서만 낮추거나 복원한다. 직접 Node adapter에서 active operation과 겹치는 resource 제어는 거절한다. JS result 소유 참조도 함께 해제하는 명시적 경로를 제공하며 pending Promise 소비자는 결과를 계속 받는다. 늦은 결과가 지워진 cache에 다시 등록되지 않는 기존 P2 계약을 유지한다.

통계의 phase는 total의 모든 bookkeeping을 포괄하는 완전한 분해는 아니다. 통계는 estimatedBytes/byteLimit·개수·hit/build·evictions·releasedHandles·oversize·unknownEstimates, activeOperations, 마지막 HLR의 source/bounds/update/hide/extract 시간을 구분한다. Worker 응답과 `projectKernelMetrics().nativeResources`에 연결했다. Worker 해제/취소/restart 때 snapshot을 비우므로 이전 Worker의 수치가 새 Worker에 남지 않는다. 마지막 성공 응답의 snapshot이며 중단 중인 OCCT 내부의 실시간 malloc 값을 뜻하지 않는다.

## Boolean source 생성과 수명

현재 OCCT binding의 Fuse/Cut/Common 생성자가 실제 Boolean을 완료한다는 것을 native `IsDone()`으로 확인했다. 기존 코드는 생성자 뒤에 `Build`를 다시 실행하고 builder와 두 progress range를 반환하지 않았다. 완료된 작업은 다시 Build하지 않으며, 미완료인 경우에만 한 번 Build를 시도한다. 반환 shape의 독립 handle을 얻은 뒤 builder/progress를 finally에서 delete한다. 실패·cache 퇴출·clear 뒤에 이 객체가 source/result를 계속 붙잡는 문제도 제거했다. placement 실패의 task wrapper와 HMR 종료 후 늦은 source/slab 등록도 정리한다.

이 변경 전의 독립 5회 원시값은 [Boolean 정리 전 보고서](../../output/verification/kernel-p4/pre-boolean-cleanup-report.json)로 보존한다. 최종 연결 R5의 source 구간을 따로 비교해 분리 그룹 cache hit와 Boolean 최초 계산 비용을 혼용하지 않는다.

## 첫 source의 정확 HLR

OCCT의 tolerance를 포함하는 analytic BRep box를 실제 observer 평면으로 보수적으로 투영한다. XY box가 닿거나 겹치는 부품의 연결 성분은 같은 global occlusion 그룹에 둔다. 깊이 방향의 분리는 화면 가림 분리의 근거로 사용하지 않는다. void/open/불확실 box, 큰 좌표의 불충분한 수치 여유, 잘못된 basis, 4,096개 초과 입력은 전체 global HLR로 돌아간다. 경계 접촉과 수치 여유를 포함해 판정한다.

분리된 그룹 중 geometry recipe·rotation·scale·상대 3D translation·source 순서가 정확히 같은 그룹은 요청 안에서 한 번만 HLR을 계산한다. 동일한 가림 관계와 곡선을 공통 translation으로 종이 평면에 옮기고 original sourceIndex/hidden/edgeClass를 유지한다. clipped slab과 큰 좌표의 수치 여유가 부족한 경우에는 이 instance 재사용을 적용하지 않는다. 한 연결 그룹에는 instance signature를 만들지 않아 추가 직렬화 비용을 피한다. 전체 출력의 10,000 edge 예산을 그룹마다 확인한다. 출력은 exact line/conic/finite spline이며 sampling을 재사용 근거로 사용하지 않는다. 이 map은 한 작업이 끝나면 사라지고 이전 결과 cache hit를 cold 개선으로 계산하지 않는다.

## 계측 결과

[중앙값·min/max와 원시 표본](../../output/verification/kernel-p4/benchmark-summary.json). 각 칸은 중앙값 (최소–최대), ms다. global 대조군은 같은 byte accounting을 켠 기존 전체 assembly HLR 경로이며 P3의 예전 binary와 비교한 값이 아니다.

| 조건 · 각 mode 5회 | Global 대조군 | 분리·동일 배치 재사용 |
| --- | --- | --- |
| 분리 배치 · fresh source 계산, 초기화 제외 | 95.6 (81.7–105.5) | 37.0 (32.3–51.0) |
| 분리 배치 · 같은 source / HLR 재계산 | 84.2 (76.2–168.0) | 30.0 (21.6–66.5) |
| 분리 배치 · 일부 source 변경 | 92.6 (71.0–189.6) | 43.2 (35.8–127.7) |
| 분리 배치 · 명시적 회수 후 재생성 | 73.2 (65.4–187.9) | 25.3 (21.8–37.0) |
| 분리 배치 · fresh Worker 전체 wall time | 2462.4 (2307.2–2727.3) | 2298.6 (2128.0–2469.3) |
| R5 56부품 · source+HLR, 초기화 제외 | 2997.9 (2871.5–3725.1) | 2891.6 (2790.8–3168.8) |

분리·반복 배치의 **fresh source 계산 구간 중앙값은 약 61.3% 감소**했다. 한 요청 안에서 8개 그룹 중 2개만 OCCT HLR로 계산하고 6개는 같은 정확 결과를 공통 translation으로 옮긴다. 이 수치는 Worker 초기화를 포함한 전체 wall time의 개선율이 아니다. 부분 source 변경 결과도 이 fixture에 한정한 관측이며 변경 종류에 따른 일반적 개선을 보장하지 않는다. 연결 R5의 global/partitioned 차이를 그룹 가속으로 해석하지 않는다.

Boolean·기본 형상 builder 수명 정리 전후의 **R5 global 경로**를 각 5개 독립 Worker에서 비교하면 source 중앙값은 **2240.1→1138.1ms**, source+HLR 계산 구간은 **4382.9→2997.9ms**로 약 **31.6% 감소**했다. native HLR Update/Hide 자체의 개선율을 뜻하지 않으며, 서로 다른 5회 실행 묶음의 before/after 관측이다. 무작위 binary A/B나 최초 화면/Review 전체 응답 시간 비교는 아니다. 전후 원시값·min/max와 phase는 summary에 함께 기록한다.

## 계측 조건과 지원 경계

[실제 Worker 원시 보고서](../../output/verification/kernel-p4/native-report.json). 16 solids/8개 독립 occlusion 그룹은 각 mode에 독립 Worker 5개를 사용한다. mode 순서를 교대하며 fresh cold·같은 source에서 HLR 재계산·변경 source·명시적 회수 후 재생성을 구분한다. 같은 격리 브라우저/Vite 세션에서 Worker를 독립 생성하며 network/compiled-code cache는 초기화하지 않는다. Worker/WASM 초기화와 전송을 포함하는 wallColdMs, 초기화를 제외한 source/HLR phase를 따로 기록한다. 중앙값과 min/max·모든 원시 표본을 남기며 5표본 p95는 주장하지 않는다.

실제 R5 56부품도 독립 Worker 5개에서 mode 순서를 교대한 paired run으로 비교한다. 각 mode 직전에 source/slab을 clear하지만 두 번째 mode의 WASM/JIT는 warm이다. 전체 R5는 한 연결 그룹이므로 분리된 반복 배치의 개선율을 R5 전체에 적용하지 않는다. 분리만 적용했던 초기 계측도 [별도 원시값](../../output/verification/kernel-p4/partition-only-report.json)으로 보존한다.

기존 문서/Undo·실행 중 source/출력·active GPU working set·WASM allocator capacity와 전체 프로세스 RSS는 이 cache 예산의 상한이 아니다. source 추정은 엄밀한 native live allocation의 upper bound나 allocator 측정이 아니다. 시간 단위 soak·남은 연결 조립체의 HLR Update/Hide 병목·전역 다중 문서/Undo byte 제한은 후속이다. cache 부담이 큰 경우 정확한 재계산으로 성능과 메모리 재사용을 절충한다.

기하와 wrapper 소유권은 현재 repo의 native 검증을 따른다. 깊은 복사와 triangulation 분리의 API 의미는 [OCCT Copy reference](https://www.occt3d.com/dev/doc/refman/html/class_b_rep_builder_a_p_i___copy.html), tolerance를 포함한 bounds의 API는 [OpenCascade.js AddOptimal reference](https://ocjs.org/reference-docs/classes/BRepBndLib)를 참고했다. 런타임 의존성은 바꾸지 않았다.

## 최종 검증

- 전체 Node 1,345개 / 54 suites 통과, 실패 0. P4 신규 10개를 포함한 집중 회귀 33개 통과.
- 실제 브라우저 UI/Worker 70개: byte 퇴출·정확 재생성·독립 Worker·동등 곡선·Review/Apply/Undo/Redo·stale/잠금·독립 cold/warm 5회 계측.
- 기존 native 회귀 128개: conicProjection 22, sectionPresentation 17, ellipseSection 18, spline 19, modelSheetSet 24, taskScope 6, projectPerformance 22. 다중 R5의 cache/GPU/Worker 유휴 반환과 문서별 격리·재열기를 포함한다.
- TypeScript 포함 전체 `pnpm build` 통과. 기존 500kB chunk 경고는 유지된다. architecture 639 modules와 문서 링크 검사 통과.
- 명령·환경·원시 보고서·로그는 [검증 manifest](../verification/G6-D6-P4-2026-10-18.json)에 기록한다.
