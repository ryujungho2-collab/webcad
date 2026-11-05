# 속성 패널

Properties는 **선택 이름·종류·잠금·참조 상태 → 치수·위치 → 표현 → 고급 정보** 순서로 표시한다. 긴 이름은 두 줄까지 보이고 전체 이름은 툴팁에서 확인한다. 잠금·숨김·혼합 종류·누락 참조 안내는 고급 항목을 접어도 보인다.

| 대상 | 편집 방법 |
| --- | --- |
| 박스·구·원뿔·토러스 | Dimensions에 길이 입력. `mm`, `cm`, `m`, `in`, `ft`를 지원한다. Enter 또는 포커스 이동으로 적용하며 Esc는 현재 입력을 취소한다. |
| 같은 종류의 여러 primitive | 다른 값은 `Mixed`. 입력한 치수만 모두에게 적용하며 다른 치수는 각 원래 값을 유지한다. 한 번의 Undo로 되돌린다. |
| 위치·회전·배율 | Position은 길이 단위, Rotation은 `deg`/`rad`, Scale은 배율을 입력한다. 수정한 축만 적용한다. Rotation & scale은 펼쳐 본다. |
| 원기둥·지원하는 돌출 | 기존 수치 편집의 Review → Apply → Undo. 값이 바뀌면 이전 Review를 사용할 수 없다. |
| 스케치 | solve 상태·DOF를 먼저 확인하고 Dimensions & relations에서 구동 치수를 검토·적용한다. 참조 면/구속 진단을 확인한다. |
| 곡선 표현 | Appearance의 선·채움·불투명도·선 두께. Gradient settings는 펼쳐 본다. 미리보기 후 Apply하거나 Cancel한다. |
| 연관 치수 | Annotation에서 내용·단위·표현을 편집한다. 표시 치수는 모델을 구동하는 스케치 치수와 다르다. |
| 활성 프레임 | 종이 mm의 크기·위치·축척과 member 상태를 확인한다. Edit frame crop & scale로 기존 Review/Apply 편집기를 연다. |

Identity·Dependencies·General 같은 고급 정보와 각 항목의 접기 상태는 대상 종류별 UI 설정으로 저장한다. 문서 revision과 Undo에는 포함하지 않는다. 진행 중인 수치/표현 Review와 오류를 확인해야 하는 영역은 열린 상태를 유지한다.

기본 치수·위치는 포커스를 떠날 때 **원래 대상에** 적용한다. 다른 객체를 선택하면 새 대상의 값으로 입력을 다시 시작한다. 검토 중이던 수치·표현·스케치/주석 초안은 새 선택에 옮겨 적용하지 않는다. 이름 입력의 한글 조합 Enter는 확정 동작으로 사용하지 않는다.

혼합 종류에 대한 전체 스타일 일괄 편집이나 모든 솔리드의 새 수치 driver를 제공하지 않는다. 기존 지원 대상·잠금·stale·참조 검증을 그대로 따른다. 프레임 표시 편집은 source 치수를 바꾸지 않는다. 저장·재열기와 Undo 세션은 [프로젝트와 저장](PROJECTS.md)을 따른다.

[구현·검증](../implementation/UI-C3-INSPECTOR-2026-10-17.md) · [검증 manifest](../verification/UI-C3-2026-10-17.json)
