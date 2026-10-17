# G6-D6-P3 retained slab·전역 HLR 비용 보충 — 2026-10-13

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

P2 이후에도 단면 배경에서 매번 모든 source의 두 half-space Boolean을 생성하던 비용을 보충했다. 가림은 계속 정확한 전체 assembly HLR로 계산한다.

## 구현과 계약

- 실제 OCCT AddOptimal BRep bounds에 shape tolerance를 포함한다. slab 밖과 완전히 안인 경우만 보수적으로 판정한다. 경계 접촉·불확실한 bbox는 정확한 Boolean으로 내려간다. 샘플 meshBounds로 판정하지 않는다.
- 부분 slab 형상은 전체 중첩 source params·외부 TRS·clip normal/height/keep/depth의 내용 key로128-entry LRU에 보존한다. source LRU128과 별개이며 방향을 달리하는 HLR도 같은 slab을 공유한다. 성공 source의 task-owned reference-counted handle만 반환한다. 실패는 저장하지 않고 eviction/clear/HMR에서는 보존 handle을 delete한다.
- 빈 slab을 제거해도 원래 sourceIndex를 유지한다. 전역 occlusion, sharp/outline·hidden 분류·curve domain·참조 대응을 그대로 사용한다. 변경/잠금/stale/Undo와 Worker 취소/재시도 계약을 완화하지 않았다.
- WASM heap capacity 계측을 추가했다. 측정100MiB는 전체 OCCT heap의 할당 용량이며 live cache bytes가 아니다. Worker 종료는 heap을 해제하지만 cache clear 자체가 capacity를 줄인다는 주장은 하지 않는다.

## R5 측정

56부품·14도면·3400문서 객체 fixture를 유지했다. [정량 기록](../verification/G6-D6-P3-CLOSEOUT-2026-10-13.json).

단일 Node 새 원본 Review는 P2 기록8154ms, P3 첫 기록6961ms, 최종 코드 기록7838ms였다. 최종 warmed는497–560ms, Apply101–144ms, Undo95–132ms다. 최초·warmed를 합친 평균이나 일정한 개선율을 주장하지 않는다. 모든 실행의1254 변경과 정확한 Undo를 확인했다.

동일 native R5 workflow의 단일 실행은 최초scene14723ms·원본Review8758ms·관찰 방향Review3346ms다. P2 기록17332/10740/4098ms와 구분해 보관했다. 실시간 편집 완료를 의미하지 않는다.

결과 cache를 우회한 raw56부품 slab+HLR 첫4163ms(모듈 초기화 포함), 반복105ms였다. 정확한195개 전체 curve JSON이 일치한다. 처음11 partial clip builds/5inside/40outside, 반복에서 추가clip build0/11slab hits였다. 새 방향/가림은 여전히 전체 HLR 계산이다.

## 검증과 후속

경계 접촉, exact Boolean 대비 HLR equality, sourceIndex, 중첩 source 변경/이전 key 복원,132slab eviction/clear, 잘못된depth 거절을 회귀했다. R5실제 Worker/scene·원본 수정/Undo·4권10쪽 발행·재열기40검사도 통과했다. 공유 최종 검증과 build는 정량 기록을 따른다.

다음 요청된 [Spline/NURBS → native section/HLR → 출력](SPLINE-NURBS-OUTPUT-2026-10-13.md)도 이어서 구현했다. 새로운 source 집합의 native global HLR 비용과 byte-weighted native resource budget은 후속이다.
