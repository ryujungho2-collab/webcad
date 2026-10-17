# B5-A 사용자 작업면과 평면 면 연결

> **현재 기능 설명:** [솔리드 모델링](../features/SOLID-MODELING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. B5-A1/A2는 작업면을 정의·저장하고, 기존 BRep 솔리드의 평면 면에서 작업면을 만들거나 다시 연결하는 범위다.

## 사용자 동작

- Inspector의 **Work planes**에서 이름·원점·X/Y 방향을 입력해 자유 작업면을 만든다. 두 축으로 오른손 법선을 계산하고 단위 길이·직교성을 검사한다. 목록에서 작업면을 삭제할 수 있다.
- 솔리드의 면을 선택한 뒤 **Attach selected face**로 면 연결 작업면을 만든다. 선택 면이 평면이어야 하며 원본과 레이어가 표시되고 잠금 해제되어야 한다.
- 원본 형상 변경으로 저장된 면 키가 사라지거나 중복되면 `missing` 또는 `ambiguous` 상태를 표시한다. 사용자가 새 면을 선택하고 **Rebind selected face**를 실행해야 연결이 바뀐다. 이전 위치와 가까운 면으로 자동 재연결하지 않는다.

## 문서·해석 계약

`CadDocument.workPlanes`는 선택적 별도 컬렉션이다. 각 항목에 `id`, `name`, world/mm `origin`, 단위 직교 `xAxis`·`yAxis`·`normal`을 저장한다. 기존 XY/XZ/YZ 스케치/도면 필드는 그대로 두어 이전 파일과 작성 동작을 유지한다. 작업면을 포함한 파일은 v18이며 구버전 파일의 동적 최소 버전 계약은 유지한다. 명령은 `upsert-work-plane`, `attach-work-plane-face`, `rebind-work-plane-face`, `delete-work-plane`이고 Preview/Apply·History·파일 복구에서 같은 필드를 사용한다.

면 연결에는 원본 객체 ID와 mesh의 정확한 `topologyId`를 저장한다. 해석할 때 원본 BRep를 재생성하고 해당 키를 정확히 한 번 찾은 뒤 객체의 현재 배치 변환을 적용한다. 평면성은 실제 면 꼭짓점으로 검사한다. 원본 객체 또는 키가 없으면 `missing`, 중복이면 `ambiguous`, 휜 면이면 `non-planar`를 반환한다. 저장된 frame은 마지막 선택 결과를 검토할 수 있게 남지만 소멸된 참조의 대체 frame으로 사용하지 않는다.

현재 면 키는 동일 형상에 대해 결정적이다. 원본 형상 파라미터가 바뀌어 키가 달라지면 사용자가 의도한 새 면을 명시적으로 다시 선택해야 한다. 면 위 스케치·치수·투영·돌출/절삭은 [B5-B/C](B5-B-C-FACE-SKETCH-CUT-2026-10-10.md)에서 구현했다. 작업면을 활성 UCS로 전환하는 흐름은 X5에 남는다.

## 검증

`b5WorkPlanes.test.ts`가 좌표 왕복·기존 축, 명령 검증·v18·Undo/Redo, 솔리드 이동 추종, 형상 변경/삭제 뒤 참조 소멸·재연결, 구면 거부·중복 키 분류를 검사한다. `b5WorkPlanes.browser.tsx`가 Inspector와 실제 BRep 면 선택, 자유/면 연결 작업면, History, 참조 소멸 표시와 명시적 재연결을 검사한다. 실행 결과는 [B5-A 마감 증거](../verification/B5-A-CLOSEOUT-2026-10-10.json)를 따른다.
