# 구현 기능 전반 통합 보강

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-11. 범위는 현재 구현된 B0–B5·X 작도와 G1/G2/G3/G4/G5/G6 연결이다. 공개 명령 → 검토/적용 → 구속·연쇄 갱신 → viewport/출력 → History/파일 경로를 점검했다. 외부 provider 실연결과 아직 작성하지 않은 X/G6 신규 기능은 기존 상태를 유지한다.

## 실제 수정

| 문제 | 수정 | 영향 범위 |
| --- | --- | --- |
| 스케치 재계산으로 vectorStyle 소실 | 공통 projection adapter가 기존 appearance를 보존. 구동 치수·변수·Stretch·구성 편집·면 작업면 갱신의 모든 호출에 연결 | B1/B2/B3/B4/B5, G2 viewport/export |
| 스케치 Copy의 스타일 소실 | 새 geometry ID와 원본 appearance 대응을 별도로 유지해 복제 시 전달 | B1 Copy, G2 |
| 스케치 Inspector에서 Appearance 편집 누락 | 기존 Review/Apply vector editor를 선택한 스케치 도형에 연결 | G1/G2, B1 |
| 원호 끝점 grip의 atan2 경계에서 방향/major sector 변경 | 저장된 CW/CCW 방향을 유지하는 sweep으로 각도 복원, 겹치는 끝점 거부 | B0/B1/B4, X1 작성 후 편집 |
| 혼합 호 grip 결과에서 solver 곡률 누락 | point 위치와 함께 solver가 계산한 polyline 원본을 반환 | B1-E2/B4 |
| 혼합 호 Scale이 반지름 driver를 곡률 변경으로 우회 | rigid transform 검토 시 원호 반지름도 일시적으로 고정. 충돌 시 전체 거부, 영구 구속 추가 없음 | B1 Scale/B4 |
| 스케치 선·호 Lengthen 미지원 | 소유 스케치에서 끝점·반지름·stable ID를 유지하며 구속 solve, 연결 도형·live solid 재생성, 충돌 진단·단일 Undo | B2-F2 |
| 같은 원의 혼합 호가 내접 관계로 수락됨 | stable arc edge의 실제 반지름으로 퇴화 내접을 검사하고 원자적으로 거부 | B4/B1-E2 |
| 연속 치수의 기본값으로 Apply가 제출되지 않음 | 화살표 크기·paper scale의 min/step 불일치를 수정. 유효한 소수 입력 허용 | B3/G1 실제 Drafting UI |
| 스케치가 닫혔지만 후속 BRep가 invalid | 수렴 목표를 1e-8까지 정밀화. 모델 허용오차의 성공 판정은 유지하여 불필요한 거부 방지 | B2/B4/B5 공통 solver→kernel |

## B2-F2 사용

스케치 편집을 Finish한 뒤 선 또는 원호를 선택하고 Modify → Lengthen을 연다. Total/Delta/Percent, 원호 Included angle, 시작/끝점 선택을 기존 미리보기에서 사용한다. 선택한 선의 고정 끝점 또는 원호 중심·반지름을 유지한다. 연결된 형상은 기존 구속을 따라 움직이며 driver 충돌은 Apply를 막는다. 입력은 수정해 다시 검토할 수 있다.

지원은 기본 XY/XZ/YZ 평면의 선·독립 호이다. 혼합 경로의 topology 변경은 Edit polyline을 사용한다. 면 부착 스케치 Lengthen과 placement가 적용된 스케치는 별도 확장이다. 외부 치수·패턴·live solid는 공통 재생성 트랜잭션을 통과하며 실패 시 부분 적용하지 않는다.

## 검수 범위와 증거

- 전체 Node: **971 tests / 54 suites, 실패·skip 0**. 새 통합 회귀 10개는 production 수정의 결과를 검사한다. 구속된 직선 4개의 닫힌 profile을 10→15로 Lengthen한 뒤 실제 kernel mesh 체적 300→450도 확인했다.
- 등록 브라우저 **74개 페이지 / 최종 1,377 checks 통과**. 최초 전체 실행은 71개 통과·3개 실패였고, 실패한 세 페이지를 단독 재실행했다. 최초 결과와 재실행을 [검수 JSON](../verification/CAD-INTEGRATION-HARDENING-2026-10-11.json)에 구분해 기록했다.
- deliveryWorkflow는 실제 폼의 `min`/`step` 불일치로 기본값 3·1이 유효하지 않아 브라우저가 submit을 막았다. 입력 준비 대기만으로 해결되지 않았으며, production 입력 조건 수정 후 16 checks 통과했다.
- contourTrimWorkflow·precisionInput은 최초 입력 전달 `Failed to fetch` 후 소스 변경 없이 단독 재실행에서 각각 21·15 checks 통과했다. 최초 실패의 원인을 제품 결함 또는 HMR로 확정하지 않는다.
- editSketchVertices 28 checks에는 실제 Inspector Appearance 적용·재계산 후 유지, 스케치 원호 Lengthen 포함각 120°·반지름 보존·Undo가 포함된다.
- TypeScript·architecture **439 modules**·production build 통과.

범위별로 B0/B1 선택·기본 편집·구성 편집·History, B2 윤곽/블록/스케치 수정, B3 치수·DXF·출력, B4 호 구속, B5 작업면·면 sketch·절삭/Hole/Shell, X 작도, G1 조작/세션, G2 아트보드·벡터, G3 이미지, G4 컴포넌트, G5 gateway의 검토/적용, G6 저장 모델 뷰를 기존 브라우저 시나리오로 회귀 확인했다. 외부 실제 LLM provider 접속은 이 검수에 포함하지 않는다.

완료된 기능에서 발견된 공통 결함을 수정했다. 기존 시나리오 통과가 모든 입력 조합을 보증하지는 않으며, 대기 기능은 별도로 유지한다. 다음 B 보충은 B2-C2 독립 line–arc Chamfer/열린 코너다. 면 부착·혼합 경로 Lengthen, 비기본 TEXT/INSERT OCS, Point·무한선/ray의 아트보드 출력은 후속이다.
