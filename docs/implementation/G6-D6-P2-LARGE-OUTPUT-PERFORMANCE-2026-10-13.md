# G6-D6-P2 대형 연관 출력 성능 보충 — 2026-10-13

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

후속 P3 retained slab 보충과 spline 출력 pilot은 [P3 기록](G6-D6-P3-RETAINED-SLAB-2026-10-13.md), [곡선 지원 경계](SPLINE-NURBS-OUTPUT-2026-10-13.md)를 따른다. 아래 수치는 P2 당시 기록이다.

R5 56부품·14도면·3400문서 객체/3344 scene 객체에서 반복 검색과 원본 BRep 재생성을 줄였다. 정확한 교선/HLR, 참조 correspondence, 잠금, stale Review, Worker 취소와 완전한 Undo snapshot을 유지한다.

## 구현

- 시트 주석 이동은 feature index를 한 번 구성한다. 수천 출력마다 전체 features를 다시 검색하던 quadratic 경로를 제거했다.
- scene의 drafting 생성에 이미 찾은 feature를 전달하고 clipping 적용에도 한 번 만든 index를 사용한다. 기존 render signature에 따른 mesh/transform/visibility 분리는 유지한다.
- 단면 decoration의 은퇴 출력은 소유 membership을 한 번씩 정리한다. 각 출력의 존재/잠금 검사는 유지하고 실패는 detached transaction에서 rollback한다.
- 종이 bounds는 좌표를 순차 집계한다. 전체 좌표를 Math.min/max의 함수 인자로 펼치지 않아 150000점 도면도 처리한다. 선 굵기/glyph/회전/보수적 여백의 계산 결과는 유지한다.
- Worker runtime에 최대128개의 원본 BRep handle LRU를 추가했다. 전체 중첩 params의 내용이 key이며 외부 placement는 각 task에서 별도로 적용한다. 성공 형상만 보존하고 각 task에 reference-counted clone handle을 반환한다. 이는 analytic geometry를 공유하며 deep BRep 복사를 의미하지 않는다. eviction/명시적 clear/HMR에서 보존 handle을 delete한다. Worker 취소·reset은 Worker와 WASM heap을 종료하고 새 Worker에서 다시 계산한다. 출력 곡선/mesh 결과 cache와 별개이므로 다른 방향·단면도에서 같은 원본을 재사용한다. 캐시는 문서/Undo에 저장되지 않는다.

## 측정

동일 머신의 관찰값이며 최초와 warmed를 합산한 평균으로 성능을 주장하지 않는다. 결과 cache를 우회한 raw HLR도 별도로 측정했다. [정량 검수](../verification/G6-D6-P2-CLOSEOUT-2026-10-13.json), [재실행 script](../../apps/web/scripts/courtyardPerformance.ts).

| 경로 | 이전 | 보충 후 |
| --- | --- | --- |
| R5 14도면 종이 위치 이동, 최초 Node | 1280.2ms | 157.3ms |
| 같은 이동 warmed 5회 | 이전 단일 실행만 있음 | p50 119.8ms / p95 136.9ms |
| raw 56부품 HLR 최초 | 4497.7ms | 4211.3ms |
| raw HLR 반복 | 1839.3ms | 726.8ms |
| native 최초 scene, 각각 단일 실행 | 41324ms (W1 기록) | 17332ms |
| native 저장 입면 방향 Review, 각각 단일 실행 | 8573ms (W1 기록) | 4098ms |

첫 HLR에는 WASM 초기화와 원본 생성이 포함된다. warmed raw HLR은 결과 cache를 우회하며 원본 48개 build 이후 추가 build0/hits112/entries48이었다. 830개 analytic 출력의 전체 JSON이 보충 전과 정확히 같다. 종이 이동의 14개 bounds도 정확히 같다.

R5 천창 radius1800→2000 원본 편집은 첫 Node Review8154ms, 반복596–656ms, Apply106–129ms, Undo93–98ms였다. Native에서 새 원본 Review10740ms, Apply 화면 동기화878ms/29 remesh, Undo 동기화934ms/29 remesh를 기록했다. 1228개 표시 상태 변화는 topology/visibility loss의 unresolved 처리이며 다른 물리적 edge로 추측 연결하지 않는다. Undo는 모든14도면/참조/발행을 정확히 복원한다. 이 원본 편집은 W1의370명령 수정과 다른 작업이므로 두 수치를 직접 비교하지 않는다.

10/50/100개 분리 box raw HLR에서는 각 크기별 첫 source 실행+5 warmed 실행, exact cold/warm equality와128-entry bound를 기록했다. warmed p50/p95는 각각24.1/28.7ms,126.7/140.2ms,302.9/318.5ms다. 10개 첫 실행은 WASM 로딩을 포함하며 이후 크기는 module이 warm이다. 실제 건축100부품 성능의 근거로 사용하지 않는다. p95는 작은5표본의 descriptive nearest-rank 값이다.

## 검증과 다음 범위

전체 Node1191/54 suites fail·skip0, 타입·architecture533·production build 통과. R5 실제 Worker/scene/원본 Review/Undo/PDF4권10쪽/재열기40, 기존 자동 시트19·건축 표현17·conic22로 총4 workflows/98 native checks를 검수했다. 전체 browser 재실행은 아니다. W1 PDF와 동일한 페이지 수/byte 수로 실제 재출력했고 출력 디자인은 변경하지 않았다.

회귀는 meshing 전후 analytic HLR equality, placement 분리, 중첩 원본 수정/이전 key 복원, 실패 비보존,140개 원본 eviction/clear, R5 종이 bounds·live 참조·원본 불변,150000점 bounds를 포함한다. 기존 전체 suite가 잠금/참조손실/stale/Worker 취소·재시도와 교환 정확도를 계속 검증한다.

다음은 **G6-D6-P3 retained slab·cold source HLR 비용 보충**이다. 변경된 원본 집합의 정확한 전역 HLR/half-space clipping은 계속 계산하며 새 원본 편집10.7초와 최초 scene17.3초가 남는다.128개 handle 수 제한은 엄격한 WASM byte 예산을 뜻하지 않는다. snapshot/Undo는 수십–백여ms로 기록했고 완전한 snapshot 계약을 유지했다. 실시간 성능 완료나 모든 건축/기계100부품 대응을 주장하지 않는다.
