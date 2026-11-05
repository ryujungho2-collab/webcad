# 선택 문맥 도구

캔버스 위의 고정된 도구 줄은 현재 선택에 맞는 자주 쓰는 명령 세 개를 제안한다. **More selection tools**에서 추가 명령과 사용할 수 없는 이유를 확인한다. 선택을 바꿔도 도구 줄 높이와 입력 포커스를 자동으로 바꾸지 않는다.

| 대상 | 첫 도구와 편집 경로 |
| --- | --- |
| 선택 없음 | 2D는 선·사각형·텍스트, 3D는 박스·원기둥·스케치 작성 |
| 선·원호 | 이동·복사·Lengthen. 길이 입력 → Preview 확인 → Apply → Undo |
| spline/ellipse·기타 곡선 | 해당 곡선 편집기 또는 Curve workflow. 스케치 소유 곡선은 Edit Sketch |
| 솔리드 | 이동·회전·Edit values로 기존 Properties 열기. 객체 종류가 지원하는 수치만 편집 |
| 치수·drafting 주석 | Content, references & style로 기존 Properties 열기. 참조 상태·내용·스타일은 기존 대상별 편집기에서 확인 |
| 활성 일반 도면 프레임 | Crop & scale·Connect frames·Sheets. 기존 Review/Apply 편집기를 열며 연결/시트는 활성 프레임을 초기 대상으로 사용 |
| 혼합·기타 대상 | 공유 가능한 명령 또는 Properties/보기. 전문 편집을 위해 한 종류를 선택하라는 이유 표시 |

프레임 선택은 객체 선택을 비우고 해당 프레임을 활성화한다. 프레임 편집기가 열려 있으면 먼저 적용하거나 취소해야 다른 프레임 도구를 열 수 있다. 잠긴 프레임/레이어·숨긴 대상·지원하지 않는 조합은 이유와 함께 차단한다. 최종 적용 단계에서도 기존 명령 검증을 따른다.

**Esc**는 열린 More 메뉴를 닫고 버튼으로 포커스를 돌려준다. Tab으로 버튼을 탐색한다. 긴 이름과 좁은 캔버스에서는 제목을 줄이고 명령 영역을 가로 스크롤한다. 960px 및 패널을 접은 150% 확대 상당 화면을 검증했다. 리본 **Editing actions**에는 기존 Drafting·기준점 이동/복사/회전·Repeat command가 있으며 단축키도 유지한다.

도구 줄은 명령을 찾는 진입점이다. 기존 즉시 실행과 Review/Apply의 구분, 잠금·stale·참조·Undo 규칙을 바꾸지 않는다. 이미지·일반 아트보드·시트·stitch 전용 편집을 새로 제공하지 않으며 기존 패널과 Frames & sheets를 사용한다. 속성 정보 순서·단위·혼합값·접기는 [속성 패널](PROPERTIES.md)을 따른다.

[구현 기록](../implementation/UI-C2-SELECTION-TOOLS-2026-10-17.md) · [실행 검증](../verification/UI-C2-2026-10-17.json)
