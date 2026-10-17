# B0-A — 포커스된 컨트롤과 CAD 명령의 키 소유권

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. B0-A 카드에서 기존 조작 결함 **한 종류**를 재현·수정했다. 기본 조작 전체의 완성이나 B0-B/C 완료를 의미하지 않는다.

## Before → 원인 → 변경

숫자 Move를 끝낸 뒤 Explorer의 Hide 버튼에 포커스를 놓고 실제 Enter를 누르면, 부모 객체 행이 키를 가로채 객체를 다시 선택했다. Ribbon 버튼의 Enter/Space는 App의 마지막 CAD 명령 반복과 충돌했다. 활성 PointTransform의 capture listener도 컨트롤의 Enter를 명령 좌표 확정으로 해석할 수 있었다.

기존 `isCadKeyboardBlocked`에 키를 전달해 Enter/Space에 한해 button·link·disclosure 및 버튼/메뉴/탭/체크 컨트롤의 activation을 해당 컨트롤에 맡긴다. App·캔버스 도구·PointTransform·DirectEditReview가 같은 판정을 사용한다. Explorer 행은 행 자체에 도착한 키만 처리하고 자식 버튼의 이벤트는 처리하지 않는다.

텍스트 편집/모달의 기존 키 소유권과 `isCadHistoryBlocked`의 별도 History 판정은 유지한다. 캔버스 Enter의 반복, 행 자체의 Enter/Space 선택, 숫자 Review의 Enter 적용/Esc 취소를 구분한다. 문서 모델·명령 기하·serialization v14는 변경하지 않았다.

## 실제 workflow와 회귀

`keyboardActivation`은 실제 App·React·Worker와 Edge의 native CDP 키/포인터를 사용한다. fixture 생성만 공개 CAD 명령으로 준비하며 대상 조작은 UI에서 수행한다.

- 일반 선의 숫자 Move → Hide Enter → Show Space → Ribbon Direct/Object activation → 캔버스 Enter 반복 → 숫자 Move 한 번 적용.
- 비텍스트 버튼에 포커스한 Ctrl+Z/Y가 문서 History를 복원.
- 일반 drawing·sketch source·pattern member·component의 visibility와 전체 참조/정의 보존. locked layer는 문서/History 변경 및 반복 fallback 없이 거부.
- Explorer 행 Enter로 겹친 대상과 별도로 component 선택 → 숫자 Move → definition 불변.
- sketch radius grip Enter → 잘못된 숫자 Enter의 오류/원본 불변 → `5mm` Enter로 정확한 radius=5 및 한 History → 재편집 Esc로 취소·grip focus 복원.

수정 전 동일 native 검사는 첫 Hide Enter에서 실패했다. 수정 후 신규 **21 checks**가 통과했다. 기존 테스트의 기대를 약화하거나 합성 이벤트로 바꾸지 않았다.

## 검증과 성능

최종 **677 Node / 54 suites / fail·skip 0**, **43 browser workflows / 916 checks**, 타입·327 module architecture/import·문서 링크·workspace production build가 통과했다. 전체 결과는 [마감 증거](../verification/B0-A-CLOSEOUT-2026-10-09.json)와 [현재 상태](../../PROJECT-STATE.md)를 따른다. 동시 작업이 단축키·휠 코드를 변경하고 있어, B2-A2 커밋 `a57a6ac`에 B0-A 변경만 더한 임시 복사본에서도 검사한다. 기존 설치 의존성은 재사용하며 Vite의 파일 접근 허용 범위만 해당 설치 경로에 맞춘다. 동시 작업의 미검증 변경을 B0-A 커밋에 넣지 않는다.

대형 문서 latency·실무자 재시도·GPU/VRAM benchmark는 이번 범위에서 측정하지 않았다. production build 크기와 >500 kB 기존 경고는 별도 기록하며 속도 향상으로 주장하지 않는다.

## 남은 범위와 다음 카드

B0-B의 단위/상대·극좌표/drag 수치 일치, B0-C의 layer/construction 표시·잠금·출력 의미는 후속이다. 모든 도구·입력 장치·접근성 조합의 키 ownership을 검수한 것은 아니다. 새 컨트롤을 추가할 때도 native activation과 canvas command repeat를 동시에 확인한다. 다른 채팅의 휠/단축키 변경은 별도 작업으로 보존한다.
