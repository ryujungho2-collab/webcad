# B3-A4 — TEXT/INSERT OCS·중첩 배치

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-11. 지원 범위 구현과 실제 메뉴 왕복 검수를 완료했다. 검수는 [공통 마감 기록](../verification/B3-A4-B5-F12-CLOSEOUT-2026-10-11.json)을 따른다.

- 비기본 normal의 TEXT 기준점/중앙 정렬·각도·높이·elevation·단위를 object TRS에 연결한다. 실제 문자 축을 OCS로 내보내며 XY/XZ/YZ와 기울어진 배치를 유지한다.
- INSERT의 OCS 내부 회전과 WCS 위치를 합성한다. 블록 배치에 한해 signed nonzero scale을 명령과 JSON 검증에서 허용한다. 일반 모델 scale의 양수 계약은 유지한다.
- BLOCK 기록 순서와 무관하게 하위 정의부터 생성한다. elevated base는 멤버 translation에 반영하고 정의 base는 0으로 정규화한다. 중첩 참조·반사·비균등 배율을 flatten하지 않는다. missing/cyclic 정의는 이름을 포함한 제외 사유를 제공한다.
- Import Review는 중첩 선과 문자도 포함한다. 일반 drawing은 authoring plane, 문자/블록은 world XY 투영이며 edge-on label은 축소될 수 있다. 실제 3D 배치는 투영 미리보기와 독립적이다.
- 레이어 결과 ID와 객체 ID가 같을 때 선택이 중복되어 INSERT를 두 번 출력하던 실제 메뉴 문제를 수정했다. 가져오기 선택은 보이는 객체만 고유하게 구성하고 exporter도 대상 ID를 중복 제거한다.

지원 경계: baseline left/center TEXT, 표준 글꼴·균일 직교 문자 축, 유한 block hierarchy다. TEXT width/oblique/mirror flag/다른 alignment, thickness, INSERT array/attributes/zero scale은 명시적 제외다. 독립 TEXT의 비균등·shear 축은 출력 경고다. 중첩 배치의 비균등 축척은 INSERT 구조로 보존한다. DXF는 WebCAD의 constraint·association·vector fill/opacity/override identity·font 자원을 저장하는 포맷이 아니다. DWG는 미지원이다. 완전한 CAD metadata 보존은 WebCAD JSON을 사용한다.

구현 위치: `interop/dxfParser.ts`, `dxfImport.ts`, `dxfOcs.ts`, `dxfWriter.ts`, `DxfReviewDialog.tsx`, `state/registerDraftingCommandHandlers.ts`, 명령/serialization schema. 신규 Node 8 tests와 실제 Edge/CDP 15 checks. 표준 AAA 축을 독립 계산한 중첩 위치, portable JSON, detached Review·stale·단일 Undo·실제 파일 다운로드/재가져오기를 검수했다.

좌표 계약 근거: Autodesk [INSERT group codes](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-DXF/files/GUID-28FA4CFB-9D5E-4880-9F11-36C97578252F.htm), [Arbitrary Axis Algorithm](https://help.autodesk.com/cloudhelp/2021/ENU/AutoCAD-DXF/files/GUID-E19E5B42-0CC7-4EBA-B29F-5E1D595149EE.htm).
