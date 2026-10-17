# B1-C 블록 인스턴스 해체·일반 도형 복원

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. **단일 인스턴스 해체 범위를 구현했다.** 정의 격리 편집·override/variant와 아트보드 전용 참조 adapter는 별도 검증 단위로 남긴다.

Disband는 배치된 drafting block 인스턴스 하나를 member의 world geometry로 되돌린다. 선·호·다중선·원·점·무한선·반직선은 world 좌표로 bake한 drawing으로, 문자·연속 치수는 변환한 drafting으로 복원한다. 정의·다른 인스턴스·참조 관계는 그대로 두며, 참조된 인스턴스의 교체는 명시적 해제 뒤에만 실행한다.

## 사용과 검토

배치된 인스턴스를 선택해 Modify → Disband를 연다. 캔버스는 복원 결과를 번호(Result 1..n)로 표시하고 목록에 종류·레이어를 함께 보인다. 중첩 블록은 기본 1단계까지만 풀어 배치된 nested instance로 남기며, 체크박스로 재귀 해체를 고를 수 있다. 미리보기는 원본·History를 바꾸지 않으며 유효 preview에서만 Apply/Enter를 허용한다.

Apply는 인스턴스 제거와 member 복원을 하나의 transaction에 담는다. 복원 결과가 선택되며 바로 이어서 편집할 수 있다. Cancel/Escape는 detached plan만 폐기한다. 문서가 바뀐 stale plan은 적용할 수 없다. Undo/Redo는 인스턴스와 결과 ID까지 복원한다.

## 공개 명령 계약

`explode-block`에 `objectId`와 선택 필드 `recursive?: boolean`을 사용한다. 생략하면 1단계 해체다. 대상은 visible·잠금 해제된 drafting block 인스턴스 하나이며 패턴 member·스케치 소유·표현식 구동은 거부한다. 다른 feature가 입력·source로 참조하거나 scene artwork·behavior에 포함된 인스턴스는 관계를 먼저 해제해야 한다.

복원 결과는 member 레이어(없으면 인스턴스 레이어)에 identity transform으로 만든다. 선·다중선은 변환한 점·bulge를, 원·호는 균일 scale에서만 중심·반지름·각도를, 문자는 점·높이·각도를, 연속 치수는 점·offset·높이를 world에 맞춰 bake한다. 중첩 인스턴스의 1단계 배치는 두 배치를 합성해 분해한 placement로 유지한다. 비균일 scale의 원·호·문자·연속 치수와 위치를 params에 담을 수 없는 floor-plan member는 원본/History 변경 없이 실패한다. 새 document field는 없으며 serialization 버전을 유지한다.

## 검수

새 Node 6개(`explodeBlock.test.ts`): 90° 회전 배치의 선·호·문자 world 복원과 정의·형제 인스턴스 보존, 1단계 중첩 배치 합성과 재귀 평탄화, 비균일 곡선·floor-plan 실패, missing/잠금/표현식/scene 실패, stale apply, 해체 선의 편집·Join 복귀. 독립 좌표·반지름·각도·높이 기대값, detached preview 원본 불변, 한 History entry와 Undo/Redo·serialize/deserialize를 검사했다.

새 `explodeBlock` native Edge/CDP workflow 15 checks: 실제 React/Worker에서 선택 게이트·결과 번호·검토 문구·Cancel·Apply·정의/형제 보존·해석 원호·문자·한 Undo/Redo·해체 선 이동·저장 재로드·팔레트 진입을 검사했다. fixture만 공개 명령으로 준비하며 실제 조작은 키·포인터를 사용한다.

최종 검수 수치와 로그는 [마감 증거](../verification/B1-C-CLOSEOUT-2026-10-09.json), 통합 현재 상태는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다.

## 남은 경계

- 정의 격리 편집과 instance override/variant는 G4-B 후속이며 확대하지 않았다.
- 참조된 인스턴스는 재연결 routing 없이 명시적 해제를 요구한다. B1-A/B의 참조 재연결 정책을 블록에 확장하지 않았다.
- floor-plan member와 비균일 scale의 곡선·문자·연속 치수는 교체 뒤에 다시 시도해야 한다.
- 새 대형 문서 latency·실무자·GPU/VRAM benchmark는 없다. 기존 large chunk warning은 유지한다.

## 2026-10-09 재검증 보완

B1-B·C·D 상태를 재확인하며 중첩 45° 회전과 비균일 scale의 조합을 추가 검수했다. 기존 `planeFrame`은 두 축 길이만 비교해 길이가 같은 전단을 uniform으로 잘못 판정했고, 1단계 중첩 배치는 전단 행렬을 TRS로 손실 분해했다. 축의 직교성과 저장 작업면을 검사하고, 배치 분해 뒤 원래 행렬과 재합성 결과를 비교하도록 수정했다. 정확히 표현할 수 없는 곡선·문자와 중첩 배치는 원본·History 변경 없이 거부한다. 재귀 해체의 직선은 affine world 점 복원을 계속 지원한다.

추가 Node 2개가 실패를 재현한 뒤 수정 후 통과했다. 기존 6개를 포함한 B1-C Node는 8개다. 최초 마감 기록과 이번 대상별 재검증을 구분하며, 최종 결과는 [B1-B·C·D 재검증 증거](../verification/B1-BCD-RECHECK-2026-10-09.json)를 따른다.
