# G4 장면 작업과 CAD 기본 치수·DXF 왕복

> **현재 기능 설명:** [이미지와 장면](../features/IMAGES-SCENES.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-06. G4-A 기존 장면 검수, G4-B의 원본 선택·유한 벡터 component 연결, G4-C 첫 SVG 출력과 CAD B3-A1/A2·B3-B를 구현했다. G4 전체 또는 CAD B0–B5/X 전체 완료 기록이 아니다. 최신 전체 검수는 [PROJECT-STATE](../../PROJECT-STATE.md)가 소유한다.

## Before → 문제 → 변경

| 기존 상태 | 발견한 문제 | 구현한 변경 |
| --- | --- | --- |
| 장면 panel에 배치·state·link·재생 경로 있음 | 원본 revision이 바뀌면 미저장 장면 입력을 덮어씀 | 저장 장면 baseline과 편집 draft를 구별. 원본 변경은 draft를 유지하고 재검토, 동시 장면 변경은 충돌을 안내하고 Apply 차단 |
| 숨김 state 및 prototype target 있음 | 숨김 객체가 Auto Layout 공간을 차지하고 링크가 target state를 지정하지 못함 | 숨김 객체는 배치 전 제외. editor state/time preview와 target state 선택·저장·이동 |
| Scene 멤버는 object ID 참조 | 원본 Properties 인계와 component artwork 출력이 이어지지 않음 | 멤버 선택이 기존 Properties/원본 ID로 이어짐. 같은 평면의 유한 벡터 nested component 평가; text/tilt/지원 불가 member는 부분 출력 대신 거부 |
| 장면 panel Review가 고정 영역에 있음 | Review가 커질 때 하단 동작 공간을 압박 | Review는 내부 scroll, Apply/Cancel/Present/Export 동작은 고정 footer |
| Scene player만 있음 | 검토한 상태·시간의 결과 파일 없음 | 저장된 clean scene의 SVG. board 크기·clip·background, state/time·layout·source image/style를 같은 evaluation 결과로 출력 |
| DXF bulge를 제외하거나 표본 점열 출력 | 선택적 code 42가 정점에 귀속되지 않고 곡률·편집 원본을 잃을 수 있음 | 순서 있는 vertex 레코드와 exact control vertex/해석 arc writer. 단위·부호·닫힘·회전/반사 보존 |
| Import 즉시 실행, Export 즉시 다운로드 | 제외 목록·단위·원본 변화를 검토할 단계 없음 | DXF detached Review. 포함/제외·단위, 지원 부분집합 명시적 수락, stale 차단, Cancel·한 Apply/Undo |
| 일반 반지름 주석만 있음 | 스케치의 지름 구속과 별개인 일반 지름 주석 없음 | 원/원호 supporting circle의 Ø 치수·양끝 화살표·각도 정밀 입력·미리보기·한 Apply·source 갱신 |
| 치수 검토 창이 selection Properties에 포함 | source 레이어 잠금 후 선택 해제로 창과 입력이 사라짐 | 검토 창 생명주기를 선택 Properties와 분리. 오류·입력 유지, Cancel/재검토 가능 |

## 실제 사용자 흐름

### Scene: CAD 원본에서 장면과 결과 SVG로

1. 아트보드와 도형/이미지를 만들고 원본 객체를 선택한다.
2. Explorer의 **Scenes → New scene from selection**에서 이름, Free/Row/Column, gap/padding을 입력한다. mm/cm 입력을 유지하며 overflow를 고쳐 같은 draft를 재검토한다.
3. **Scene sources**에서 원본을 선택하면 기존 Properties로 이어진다. 장면 배치는 CAD 원본 transform을 이동시키지 않는다.
4. 숨김 state와 entry track을 추가한다. editor의 preview state/time으로 시작·중간·완료 pose를 확인한다. 숨김 멤버는 layout 공간에서도 제외한다.
5. 링크의 target scene과 target state를 지정하고 Apply한다. 발표에서 artwork를 클릭하면 지정된 state로 이동한다.
6. 저장 장면과 같은 draft일 때 **Export scene SVG**로 현재 preview pose를 다운로드한다. 미저장 draft는 먼저 Apply하거나 Cancel해야 한다. 출력은 문서/History를 변경하지 않는다.

숨김 state는 component variant가 아니다. scene source로 지원하는 component는 같은 principal plane의 유한 drawing 및 그런 component의 중첩이다. text/chain/tilted/non-finite member는 별도 output adapter가 필요하다. 전용 component 내부 격리 편집·property override/variant와 canvas에서 layout 배치 자체를 끄는 핸들은 이번에 추가하지 않았다.

### DXF: 파일 → 정확한 곡선 → 편집 → 파일

**File → Import DXF… → 실제 파일 선택 → 단위·포함/제외·preview 검토 → Apply → Explode/Join → File → Export DXF… → 검토 → Download reviewed DXF → 다시 Import**를 브라우저에서 실행했다. inch의 semicircle/chord를 25.4 mm 반지름·50.8 mm chord로 독립 측정했다. 지원 부분집합을 수락해도 실행 전 Cancel은 아무 객체/레이어를 만들지 않는다. Apply의 레이어 생성과 모든 객체 삽입은 한 Undo다.

- LWPOLYLINE 및 지원 2D POLYLINE은 sparse/signed bulge, 마지막 닫힌 변과 중복 닫힘 sentinel을 보존한다. 원본 좌표·길이만 단위 배율을 받고 bulge는 무차원 값으로 유지한다.
- vertex 중복/부족 좌표, invalid numeric/count/bulge, 퇴화 변, width/thickness, spline/mesh/fitted 의미와 non-default OCS는 제외 이유를 표시한다. vertex Z를 임의로 header elevation으로 덮어쓰지 않는다.
- XY-aligned, 평면 내 회전·이동·균일 scale·지원 반사의 곡선 출력은 exact control vertices와 bulge를 사용한다. 비균일/기울어진 곡선과 non-default OCS는 explicit exclusion이며 tessellation으로 바꾸지 않는다. straight principal-plane 경로는 기존 3D POLYLINE 출력을 사용한다.
- DXF 수치 출력은 소수 12자리 반올림이다. 저장 모델의 exact analytic 의미와 파일 숫자의 유한 정밀도를 구분한다.
- annotation/hatch 출력은 기존처럼 linework/TEXT다. WebCAD reference graph·driving relation을 DXF 재가져오기로 복원하지 않는다. 내부 관계 보존은 WebCAD JSON을 사용한다.

형식 해석은 Autodesk의 [LWPOLYLINE group codes](https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm), [POLYLINE flags](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-DXF/files/GUID-ABF6B778-BE20-4B49-9B58-A94E64CEFFF3.htm), [VERTEX bulge](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-0741E831-599E-4CBF-91E1-8ADBCFD6556D.htm)와 raw group-code fixture에 대조했다. 모든 DXF dialect 또는 다른 CAD 앱과의 외부 왕복 평가를 완료한 것은 아니다.

### 지름: 생성 → 재배치 → 원본 수정 → 재연결 → 출력

원/원호 선택 → **Properties → Add diameter dimension** → leader angle(deg/rad) → linework preview → Apply → 선택된 **Diameter / Annotation**에서 angle 재배치 → 원본 scale → Ø 값 자동 갱신 → Undo/Redo → JSON/DXF 출력.

일반 지름은 **측정 주석**이다. 원호의 sweep 길이가 아니라 supporting circle의 `2r`를 표시한다. 스케치 소유 객체의 driver는 기존 Sketch Inspector의 Diameter 구속을 사용한다. source가 non-uniform/out-of-plane이 되면 기존 측정 주석 정책대로 마지막 지원 측정을 유지하고, 다시 지원 가능한 형상으로 편집하면 갱신한다. source 삭제는 마지막 값을 동결하고 연결을 해제한다. 임의 곡선의 유효 지름을 추정하지 않는다.

원→Trim→남은 원호→명시적 circular edge 선택→Join→source scale에서 같은 dimension ID와 reference를 갱신한다. 잘못된/누락된 edge는 기존 atomic remap 검증으로 거부한다. 지름을 포함한 파일은 **serialization v13**으로 저장해 구형 reader의 조용한 주석 손실을 차단한다. Scene-only 파일은 기존 v12, 이전 지원 파일은 기존 최소 버전을 유지한다.

## 검수 근거

- [scenes.test](../../apps/web/tests/scenes.test.ts): 7개. 원본 불변성·배치·animation·숨김 collapse·target state·locked/stale/graph·component nested identity·부분 text 거부·v12·Undo/Redo.
- [dxfBulge.test](../../apps/web/tests/dxfBulge.test.ts): 7개. 독립 group-code·sparse/final signed arc·inch·R12 elevation·malformed exclusions·preview/Explode/Join/save/history·mirror/rotation/scale·비균일 및 locked batch·선택 출력의 component definition 범위.
- [diameterDimension.test](../../apps/web/tests/diameterDimension.test.ts): 4개. XY/XZ/YZ linework 및 실제 2r·v13 gate·source scale/leader·Trim/Join/edge remap·missing/locked/stale·삭제 동결·DXF TEXT.
- 실제 native pointer/keyboard/file 흐름: [scenesWorkflow](../../apps/web/tests/scenesWorkflow.browser.tsx) 24 checks, [dxfWorkflow](../../apps/web/tests/dxfWorkflow.browser.tsx) 18 checks, [diameterWorkflow](../../apps/web/tests/diameterWorkflow.browser.tsx) 17 checks. 모두 [실제 runner](../../apps/web/scripts/browserChecks.mjs)에 등록했다.
- 기존 `patterns.test`의 정수 문자열 `40\n4` 비교는 높아진 DXF 숫자 정밀도에서 실패했다. analytic CIRCLE 3개 검사를 유지하고 parser가 읽은 세 원의 radius·독립 예상 center XYZ를 수치 허용오차로 검사하도록 보강했다. 테스트를 삭제하거나 writer의 정밀도를 되돌리지 않았다.

최종 전체 **613 Node / 54 suites / fail·skip 0, 35 browser workflows / 729 checks**, 타입·architecture 301 modules·workspace build·diff check 통과. [커밋에 보존하는 결과 요약](../verification/G4-CAD-CLOSEOUT-2026-10-06.json)과 PROJECT-STATE의 로컬 실행 로그를 따른다. 이전 599/33/686 및 G4 최초 4 Node/16 browser는 변경 전 기준이다.

이번 전체의 기존 4000×4000 resource fixture는 두 placement에 texture 1개·upload-version 증가 0, 9회 warm edit p95 0.2 ms를 유지했다. Edge/SwiftShader의 `WebGL render + gl.finish` 관측이며 source byte 316,992·estimated RGBA 64,000,000 bytes다. native GPU/heap/VRAM이나 새 Scene/DXF 작업의 지연 측정은 아니다. main bundle 1,018.50 kB·viewport 607.53 kB의 기존 chunk-size 경고도 유지된다.

## 남은 과제

- CAD 다음 카드: **B3-C 일반 두 선/변 각도 치수**. B3-A3 OCS/tilted exchange, 공통 dimension style, 원호 접선/코너, Break/Explode 관계 보존 확대·block 해체·UCS·새 곡선·face sketch/Hole/Shell은 별도 카드로 남긴다.
- G4 다음 확대: 직접 layout handle, component override/variant, 새로운 output 한 종류(PPTX 또는 GIF/APNG 등)와 변환 손실 review. SVG 출력은 정지 pose이며 animation/link behavior를 포함한 독립 presentation 파일이 아니다.
- G5 gateway는 기존 mock 검수 상태이며 실제 provider/서버 미연결이다. G6 실제 외부 연결도 없다.
- 이번 기능 회귀는 실무자 task time/retry나 Scene/DXF 대형 문서 p95 개선을 증명하지 않는다. 큰 Scene의 evaluation은 아직 전체 export collection/feature 탐색을 사용한다. 별도 측정 후 index/incremental 최적화를 판단한다. 기존 이미지 GPU resource/plan-path benchmark의 조건과 수치를 새 기능 성능으로 재표기하지 않는다.
