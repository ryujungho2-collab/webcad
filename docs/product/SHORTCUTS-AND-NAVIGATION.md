# 단축키와 화면 조작

기준일: 2026-10-09. Windows 기준. 이 문서는 **현재 구현**과 **향후 추천**을 구분한다.

## 앱에서 확인하기

캔버스에서 **Ctrl+K**를 누르면 명령 검색창이 열린다.

- **Commands · 기능**: 기능명으로 검색하고 클릭 또는 Enter로 실행한다. 한국어와 영어 모두 검색할 수 있다.
- **Shortcuts · 단축키**: 현재 구현된 키보드 단축키와 마우스 조작을 함께 확인한다.
- `텍스트`, `자르기`, `회전`, `Tab`, `Ctrl+Wheel`, `Ctrl+Shift+Z`처럼 기능명 또는 키 조합으로 검색한다.
- 선택이나 작업공간 때문에 실행할 수 없는 기능도 목록에 남고, 사용할 수 없는 이유를 표시한다.
- 마우스 조작 설명은 읽기용이다. Enter를 눌러도 도면이 변경되지 않는다.
- 검색창에서 ↑/↓는 목록 이동, Enter는 실행, Esc 또는 Ctrl+K는 닫기이다. Tab/Shift+Tab은 검색창 내부 컨트롤을 순회한다.
- 단축키가 없는 기능은 `Menu / 메뉴`로 표시한다. 단축키가 없다고 기능이 없는 것은 아니다.

텍스트 입력칸과 모달 편집기에서는 입력을 우선한다. Ctrl+K는 캔버스에서 사용한다. 한글 IME 조합 중에는 전역 도구 단축키를 실행하지 않는다.

## 비교 결과와 선택 원칙

CAD는 AutoCAD를 대표 사례로 조사했다. 아래 AutoCAD 키는 대부분 **명령 별칭**으로, 명령줄에서 입력하고 확정하는 방식이다. 디자인 앱의 즉시 도구 전환 키와 실행 방식이 다르다. 모든 CAD 제품이 같은 단축키를 쓰는 것은 아니다.

| 기능 | AutoCAD | Figma Design | Illustrator | Photoshop |
| --- | --- | --- | --- | --- |
| 텍스트 | T → MTEXT | T | T | T |
| 원·타원 | C / EL | O | L | U 도형 그룹 |
| 사각형 | REC | R | M | U 도형 그룹 |
| 선·경로 | L / PL | P 펜 | P 펜, 역슬래시 선 | P 펜, U 선 도형 |
| 객체 선택·이동 | M 이동 | V | V 선택 | V 이동 |
| 객체 회전 | RO | 선택 핸들로 회전 | R | 자유 변형; R은 **화면 회전** |
| 크기 조절 | SC | K | S | Ctrl+T 자유 변형 |
| C의 의미 | 원 | 공통 원 도구 키가 아님 | 가위 | 이미지 크롭 |
| 화면 이동 | CAD 탐색 명령 | H / Space+드래그 | H / Space | H / Space |

위 비교의 공식 근거: [Autodesk 단축키·명령 별칭](https://www.autodesk.com/shortcuts/autocad), [Figma 텍스트·도형·펜](https://help.figma.com/hc/en-us/articles/26620239826199-Layers-101-Explore-layer-types), [Figma 크기 조절](https://help.figma.com/hc/en-us/articles/32588834922391-Create-an-illustration-using-transforms-effects-and-text-on-a-path), [Figma 선택](https://help.figma.com/hc/en-us/articles/18770195788951-Create-a-reusable-icon-grid), [Figma 탐색](https://help.figma.com/hc/en-us/articles/15297425105303-Explore-design-files), [Illustrator 기본 단축키](https://helpx.adobe.com/illustrator/using/default-keyboard-shortcuts.html), [Photoshop 공식 단축키 PDF](https://helpx.adobe.com/content/dam/help/en/photoshop/using/default-keyboard-shortcuts/photoshop-keyboard-shortcuts.pdf).

이 앱의 추천은 위 자료와 현재 제품 기능을 바탕으로 한 설계 판단이다. 사용자 시간이나 오타율을 측정한 실험 결과는 아니다.

1. 여러 앱에서 뜻이 일치하는 **T=텍스트, V=선택**을 우선한다.
2. CAD 작업 빈도가 높은 **L=선, C=원, O=Offset**을 유지한다. C에 자르기까지 겹치게 배정하지 않는다.
3. **R=사각형 / Shift+R=객체 회전**, **C=원 / Shift+C=기준점 복사**처럼 도형과 변형을 구분한다. 선택 유무만으로 R이나 C의 뜻이 바뀌지 않는다.
4. 자르기는 **X**, 연장은 **Shift+X**로 묶는다. Figma 벡터 편집에서 X가 Cut인 점도 참고했지만, 경로 분할과 CAD Trim은 동일한 기능이 아니다. [Figma 벡터 편집](https://help.figma.com/hc/en-us/articles/360039957634-Edit-vector-layers)
5. 단축키는 실행 가능한 기능에만 붙이고, 미구현 추천을 현재 단축키 목록에 섞지 않는다.
6. 숫자·좌표·텍스트를 입력하는 중에는 해당 도구가 키를 소유한다. 전역 단축키로 입력을 빼앗지 않는다.

## 현재 구현된 조합

| 키 | 기능 | 조건·설명 |
| --- | --- | --- |
| Ctrl+K | 기능·단축키 검색 | 캔버스에서 열기 |
| V | 객체 선택 | 대기 상태에서 선택 모드 |
| F2 | 직접 선택 | 정점·모서리·면의 직접 편집 모드 전환 |
| L / P | 선 / 폴리선 | 편집 가능한 2D 작업공간 |
| R / C / A | 사각형 / 원 / 호 | 편집 가능한 2D 작업공간 |
| T | 텍스트 추가 | 2D, 활성 레이어 잠금 해제, 활성 스케치 종료 후. Drafting의 새 Text 입력을 연다. 기존 텍스트가 선택돼 있어도 새 텍스트를 준비한다. |
| M 또는 G | 이동 | 편집 가능한 선택. 2D는 기준점·대상점, 3D는 정밀 변형 |
| Shift+C | 기준점 복사 | 2D에서 선택한 객체 반복 배치 |
| Shift+R | 객체 회전 | 2D는 지정 중심, 3D는 정밀 회전 |
| S | 크기 조절 | 편집 가능한 선택 |
| O | Offset | 선택한 편집 가능 도형 |
| X / Shift+X | Trim / Extend | 선택한 도형을 경계로 자르기·연장 |
| I | 거리 측정 | 두 점 측정 |
| E | 돌출 | 지원되는 닫힌 프로파일; 활성 스케치 종료 후 |
| F | 보기 맞춤 | 선택이 있으면 선택, 없으면 전체 |
| H | 선택 숨기기 | 현재 구현은 Hand가 아니라 Hide |
| F3 / F8 | 스냅 / 직교 잠금 | 활성 도구에서도 지원 |
| 1 / 2 / 3 / 0 | 위 / 앞 / 오른쪽 / 등각 | 표준 보기; 명령 검색에서는 2D 제한 사유 표시 |
| 5 | 원근·직교 투영 전환 | 3D에서만 |
| Ctrl+N / Ctrl+O | 새 문서 / 열기 | 입력·활성 도구의 키 소유 규칙 적용 |
| Ctrl+S / Ctrl+Shift+S | 저장 / 다른 이름 저장 | 입력 중에는 해당 편집기 규칙 적용 |
| Ctrl+Z | 실행 취소 | 텍스트 입력 중에는 입력창 자체 Undo 우선 |
| Ctrl+Y / Ctrl+Shift+Z | 다시 실행 | 도면 기록 Redo |
| Ctrl+A / Ctrl+D | 전체 선택 / 복제 | 대기 상태에서 사용 |
| Delete | 삭제 | 선택한 편집 가능한 객체 |
| Enter / Space | 마지막 명령 반복 | 캔버스 대기 상태. 도구 실행 중 Enter는 확정 |
| Esc | 입력 취소·단계 복귀·종료 | 활성 도구에 따라 단계적으로 처리 |

Ctrl+C/X/V 클립보드 복사·잘라내기·붙여넣기를 객체 편집용으로 새로 구현한 것은 아니다. Ctrl+D 복제와 Shift+C 기준점 복사는 구분한다. X가 Trim이어도 Ctrl+X를 Trim으로 가로채지 않는다.

## 현재 마우스 조작

| 조작 | 기능 |
| --- | --- |
| 일반 휠 | 상하 이동 |
| 트랙패드 가로 스크롤 | 좌우 이동 |
| Shift+휠 | 좌우 이동 |
| Ctrl+휠 | 마우스 위치를 중심으로 확대·축소; Mac은 Cmd도 지원 |
| Alt+휠 | 2D 화면 회전 / 3D 모델 주위를 회전 |
| 휠 버튼 드래그 | 화면 이동 |
| Shift+휠 버튼 드래그 | 3D 자유 회전 |

화면 회전과 **객체 회전(Shift+R)**은 구분한다. 뷰 조작은 도면 기하와 실행 취소 기록을 바꾸지 않는다. 도구가 탐색을 잠그거나 작업공간 전환 애니메이션이 진행되는 동안에는 휠 조작도 잠긴다.

## Tab과 Ctrl+Tab: 공식 비교

| 프로그램 | Tab / Shift+Tab | Ctrl+Tab 계열 |
| --- | --- | --- |
| AutoCAD | 동적 좌표 입력에서 다음 입력칸으로 이동 | 다음 도면 / 이전 도면 |
| Figma | 선택한 객체의 다음·이전 형제, UI 포커스 이동 | 웹에서는 브라우저 탭 전환. 데스크톱 전용 매핑은 이번 공식 자료에서 확정하지 않음 |
| Illustrator | 전체 패널 숨김 / 도구·컨트롤을 제외한 패널 숨김 | 공식 목록의 문서 전환은 **Ctrl+F6 / Ctrl+Shift+F6**. Ctrl+Tab을 기본 키라고 단정하지 않음 |
| Photoshop | 전체 패널 숨김 / 도구·옵션을 제외한 패널 숨김; 입력칸에서는 포커스 이동 | 다음 문서 / 이전 문서 |
| Edge 브라우저 | 다음·이전 포커스 | 다음 탭 / 이전 탭 |

공식 근거: [AutoCAD 동적 좌표 입력](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-DidYouKnow/files/GUID-683349C0-E5C2-4E16-8846-5523E71172A9.htm), [AutoCAD 도면 전환](https://www.autodesk.com/shortcuts/autocad), [Figma 객체 선택](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects), [Figma 키보드 접근성](https://help.figma.com/hc/en-us/articles/35063862380311-Accessibility-at-Figma), [Illustrator 기본 단축키](https://helpx.adobe.com/illustrator/using/default-keyboard-shortcuts.html), [Photoshop 패널 표시](https://helpx.adobe.com/photoshop/desktop/get-started/learn-the-basics/hide-show-panels.html), [Photoshop 문서 전환 PDF](https://helpx.adobe.com/content/dam/help/en/photoshop/using/default-keyboard-shortcuts/photoshop-keyboard-shortcuts.pdf), [Edge 단축키](https://support.microsoft.com/en-gb/edge/keyboard-shortcuts-in-microsoft-edge).

## 우리 앱의 Tab 결정과 추천

**현재 적용: Tab은 현재 작업 안에서 이동하고, Ctrl+Tab은 브라우저에 맡긴다.**

- 일반 UI·입력칸: Tab은 다음 포커스, Shift+Tab은 이전 포커스.
- Ctrl+K: 검색창·보기 버튼·닫기 버튼 사이를 이동한다. 목록은 ↑/↓로 이동한다.
- Direct 모드 캔버스: Tab으로 편집점에 진입하고 이후 편집점의 키보드 포커스 규칙을 따른다.
- 도형 작성 또는 기준점 이동·복사: Tab은 길이·각도 입력 전환, Shift+Tab은 잠금 해제. 회전 입력은 이 전환을 사용하지 않는다.
- Ctrl+Tab / Ctrl+Shift+Tab: 앱의 전역 기능을 배정하지 않았다. 도형 입력과 명령 검색창의 Tab 핸들러도 Ctrl/Meta/Alt 조합을 처리하지 않도록 했다.

**향후 추천이며 아직 미구현:**

| 후보 | 추천 용도 | 이유 |
| --- | --- | --- |
| Ctrl+Tab / Ctrl+Shift+Tab | 데스크톱 앱의 다음·이전 문서 | 다중 문서가 도입되면 사용. 2D/3D 모드나 객체 선택에는 배정하지 않음 |
| Ctrl+역슬래시 | 좌우 패널 전체 접기·복원 | Tab의 포커스·정밀 입력 역할을 지키면서 캔버스 확보. 현재는 Ctrl+K에서 Explorer / Properties를 각각 토글 |
| H / Space+드래그 | Hand / 일시 화면 이동 | Figma·Adobe 탐색과 맞추기. 도입 시 현재 H=Hide와 Space=반복을 함께 바꿔야 함 |
| Ctrl+Shift+H | 선택 숨기기 후보 | H를 Hand에 양보할 때 별도 배정; 현재 구현 키가 아님 |
| Enter | 마지막 명령 반복 | Space를 일시 Pan으로 옮긴 뒤 반복 키를 Enter로 통일 |
| A / Shift+A | 직접 선택 / 호 후보 | 벡터 편집 비중이 높아지면 검토. 현재 A=호와 F2=직접 선택 유지 |
| P | 폴리선·펜 계열 | 현재는 폴리선. 베지어 펜이 도입되면 도구군 설계와 함께 결정 |

탭키로 객체를 순환 선택하는 기능은 현재 새로 넣지 않았다. 브라우저와 포커스 접근성, 편집점 순환, 정밀 입력의 우선순위를 먼저 유지한다.

## 구현 위치

- `apps/web/src/input/shortcutRouter.ts`: 키 실행 규칙과 문맥 제한.
- `apps/web/src/input/shortcutCatalog.ts`: 명령 검색창에 표시하는 키와 탐색 설명.
- `apps/web/src/commands/paletteCommands.ts`: 실행 가능한 기능과 검색 키워드.
- `apps/web/src/commands/CommandPalette.tsx`: 기능·단축키 보기, 검색·포커스 이동.
- `apps/web/src/viewport/wheelNavigation.ts`: 휠 이동·확대·회전.

단축키 변경 시 실행 규칙, 검색창의 표시, 버튼 설명, 이 문서를 함께 갱신한다. 숫자 변형에서 X/Y/Z가 축 잠금인 것은 활성 도구의 문맥 동작이며, 대기 상태의 X=Trim과 충돌하지 않는다.
