# G6-D6-P1 — 원본 교선 재사용과 시트 후보 공유

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

## 완료 범위

주석·이름·표시 및 종이 배치를 모델 형상 변경과 구분한다. 원본 feature type/전체 params(중첩 operand 포함)/world TRS의 정확한 서명을 **논리적인 source revision**으로 사용한다. 전역 document revision을 cache key로 쓰지 않는다. source/절단면이 같을 때만 교선을 재사용하고 형상·위치·절단 높이·crop 변경은 대응 검사/재계산으로 보낸다. numeric revision 필드를 새 파일 schema에 추가하지 않았다.

이전 P0/P1 수정의 section LRU(1,024 항목), 영향 없는 view 생략, 영향 view 내 동일 부품 교선 재사용을 유지한다. 이번에는 시트 후보의 원본 snapshot을 `refreshSheetLayoutGeometry`에 전달하여 **cache가 비어 있는 재열기 직후에도** resolved 도면의 원본이 같으면 analytic 교선을 paper scale/origin으로 변환한다. 두 번째 정투영 정렬 단계도 정렬 전 snapshot을 공유한다. 자동 단일 시트/시트 세트 Apply가 사용하는 마지막 갱신까지 같은 기준을 전달한다.

일반 HLR 투영도 동일한 assembly source revision·basis·출력 소유권일 때 저장된 가시/숨은 edge를 종이 좌표로 옮긴다. 실제 source 변경·방향 변경·출력 mapping 변경은 HLR 갱신 또는 명시적 복구로 이어진다. 전역 형상 cache를 무조건 신뢰하거나 최근접 edge를 새 참조로 연결하지 않는다.

## 정확도와 트랜잭션 계약

- source part와 feature의 동일성, 입력 params와 TRS, view basis/height/crop, resolved 상태와 output mapping을 확인한다.
- source revision이 같은 경우에만 paper 좌표를 옮기며 radius/points를 같은 scale로 변환한다. font/lineweight는 paper 크기를 유지한다.
- 숨은/소멸/모호한 source는 기존 unresolved 및 명시적 rebind 계약을 따른다.
- Review는 detached document에서 실행한다. source가 같은 경우라도 stale Review를 Apply하지 않는다.
- 잠긴 output/annotation/board는 기존 검사를 우회하지 않는다. Undo/Redo는 cache 내용에 의존하지 않고 문서 snapshot을 정확히 복원한다.

## 재현과 측정

`apps/web`에서 `npx tsx scripts/g6D6P1.ts`. 사용자 선택의 **56부품·5도면**을 사용하며 다음을 별도 phase로 기록한다.

1. 도면 전 모델 checkpoint에서 최초 3평면/2단면 생성. 첫 phase에는 OCCT 초기화가 포함된다.
2. 같은 source의 warmed 재생성. 실제 kernel task와 cache hit 수를 각각 기록한다.
3. 검증된 저장 도면을 다시 연 상태에서 주석/이름/show/hide.
4. 1:50/100/200 후보의 최초 및 warmed 다중 페이지 Review.
5. 리뷰된 후보 Apply, 한 History, exact Undo/Redo, stale 및 잠금 거절.

[개별 측정 결과](../../output/verification/g6-d6-p1-benchmark.json)를 기준으로 한다. 최초 원본 생성과 **이미 resolved인 도면의 최초 종이 배치**는 서로 다른 측정이다. 평균 하나로 합치지 않으며 Node 측정값을 GPU/브라우저 편집 응답 시간으로 일반화하지 않는다. 7도면의 실제 모델 편집 약12.6초는 이전 별도 native 결과이며 이번 5도면 배치 수치와 구분한다.

## 검수

- 56부품/5도면의 전체 scale/page 후보 및 Apply에서 kernel task와 cache lookup **0회**를 검사했다.
- 재열기된 일반 HLR의 paper 배치 역시 source kernel 및 cache lookup **0회**를 검사했다.
- 전체 Node 1,160 tests / 54 suites / fail·skip 0, 타입·architecture518·production build 통과.
- 실제 UI 자동 시트 19개·다중 페이지 시트 세트 24개 검사 통과. 전체 browser 페이지 재실행은 아니다.
- 기존 원본 모델/도면 fixture를 그대로 유지한다. 결과 파일: [완료 검수](../verification/G6-D6-P1-CLOSEOUT-2026-10-13.json).

캐시 항목 수는 bounded LRU이며, 매우 큰 개별 BRep 및 대형 assembly HLR의 최초 계산·원본 모델 편집 비용 자체를 제거한 것은 아니다. 건축 해치/전경·배경 표현과 타원/spline 지원은 후속 범위다.


## 이번 개별 측정

| Phase | 시간(ms) | Kernel tasks |
| --- | ---: | ---: |
| first source derivation: plan-1 | 2690 | 20 |
| first source derivation: plan-2 | 507 | 20 |
| first source derivation: plan-3 | 408 | 14 |
| first source derivation: section-aa | 1234 | 55 |
| first source derivation: section-bb | 1187 | 55 |
| warmed source derivation: plan-1 | 46 | 0 |
| warmed source derivation: plan-2 | 43 | 0 |
| warmed source derivation: plan-3 | 41 | 0 |
| warmed source derivation: section-aa | 47 | 0 |
| warmed source derivation: section-bb | 48 | 0 |
| annotation | 53 | 0 |
| rename | 57 | 0 |
| show source | 41 | 0 |
| hide source | 43 | 0 |
| first paper candidates after reopen (1:50/100/200) | 624 | 0 |
| warmed paper candidates (1:50/100/200) | 627 | 0 |
| Apply shared candidates | 16 | 0 |

최초 paper Review와 warmed paper Review 모두 원본 계산 0회다. Apply는 이미 검토한 proposal을 publish하는 별도 경로이며 Review 계산 시간이 포함되지 않는다.
