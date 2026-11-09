# 공통 CAD 도구와 gateway 계약

2026-10-24: 일반 gateway 응답에 상호 배타적인 `recipe`/`clarification` 분기를 추가했다. 클라이언트가 필수 파라미터를 검증·질문하고 템플릿을 일반 CAD 명령으로 컴파일한다. 조회 루프와 Review/Apply를 재사용하며 canonical/MCP 도구 수는 바꾸지 않는다. [JSON 계약과 단계형 계획](../implementation/COPILOT-STAGED-RECIPES-01-2026-10-24.md).

2026-10-23: 이 공통 JSON 도구 계약 위에 공식 SDK의 표준 stdio MCP 서버를 연결했다. MCP 검색/호출·문맥 ID·검토 영수증과 로컬 bridge의 설정·한도는 [CAD MCP](CAD-MCP.md)에서 관리한다. 내부 엔진은 동일한 계약을 직접 사용한다.

2026-10-19. 구현된 첫 계약이다. [Copilot 사용법](../features/COPILOT.md), [구현·검증](../implementation/CAD-TOOLS-01-2026-10-19.md)을 함께 읽는다. 이 문서는 gateway 개발자가 사용하는 도구 schema·조회/계획 경계를 소유한다. 실제 모델 provider나 MCP 서버를 설치한 문서는 아니다.

## 같은 계산·실행 경로

`cadToolContract.ts`의 40개 도구 schema를 로컬 shortcut과 gateway가 함께 사용한다. `cadToolSession.ts`가 캡처한 문서/선택/레이어 문맥에서 조회 또는 계획을 수행하고 `cadModelingTools.ts`가 기존 CAD 명령으로 변환한다. `previewCadCommand → applyCadPlan`이 실제 커널 검증·영향·게시·Undo를 처리한다. 도구가 문서 원본이나 UI 상태를 직접 덮어쓰지 않는다. [3D 확장 2차](../implementation/CAD-TOOLS-02-2026-10-19.md)에서 원본 곡선·모서리 조회와 회전/스윕/로프트/필렛/모따기/셸을 추가했다. [Native 건축 연결](../implementation/COPILOT-NATIVE-ARCHITECTURE-01-2026-10-23.md)은 기존 벽·개구부·바닥·연관 절단 기능을 같은 계약에 연결한다.

| 조회 도구 | 반환 |
| --- | --- |
| `cad.tools` | 인자 없으면 간결한 색인(이름·라벨·readOnly)과 단위·한도. `names`(최대 16개)를 주면 해당 도구의 설명·inputSchema. 전체 카탈로그가 64 KiB 읽기 한도에 닿아 2026-11-04 분리 |
| `cad.objects` | 이름/ID 검색, 최대 20개, total/truncated와 selected/visible |
| `cad.inspect` | 최대 10개 객체의 유형·표현·잠금·원본/스케치 ID·숫자 파라미터·참조 문제 |
| `cad.measure` | 원본 기하의 측정 근거·유효성·bbox·체적/면적/길이. BRep와 직선/직선 polyline/rectangle에 실제 world bounds; 곡선의 샘플 bbox를 정확한 범위로 오인하지 않음 |
| `cad.faces` | 최대 64개 면 키와 평면 판정·world frame, total/truncated |
| `cad.parameters` | 현재 선택 솔리드의 지원 길이 치수와 driver |
| `cad.edges` | 최대 64개 모서리 key와 world XYZ 대표 점, total/truncated. 탐색 순번은 반환하지 않음 |
| `cad.architecture` | 최대 10개 부재의 native 벽/슬래브 정의, 변환 전 벽 frame, host transform, 관련 도면 상태. 읽기는 선택 권한을 부여하지 않음 |
| `cad.pathClearance` | 명시한 native 벽 1–64개·XY 경로 2–32점·레벨/몸체 반경/높이의 제한된 통과 여유. 직선·수직·단위 축척 벽만 지원. 가구/계단/문짝/범위 밖 객체 제외 |

| 모델링 도구 | 기존 명령과 지원 범위 |
| --- | --- |
| `scene.layer` | 보이는 잠금 해제 레이어 생성, 이름/색상 명시, 작업 레이어 유지 |
| `scene.objects` | geometry 뒤 새 결과 또는 선택한 독립 개체 최대 20개의 이름·레이어·표시·재료 편집 및 개체별 delta XYZ 이동. 재료는 BRep만 허용 |
| `draft.text` | 작업면의 명시한 world XYZ에 정적 일반 텍스트 작성 |
| `draft.linearDimension` | 명시한 두 점으로 실제 길이를 계산한 정적 치수, 값 위조 없음 |
| `sketch.create` | XY/XZ/YZ 원점 평면 스케치 |
| `sketch.rectangle` | 고정 원점과 폭/높이 치수 구속을 가진 사각형 |
| `sketch.circle` | 고정 중심과 반지름 치수 구속을 가진 원 |
| `solid.primitive` | box/cylinder/sphere/cone/torus, 종류별 필수 숫자 파라미터와 world XYZ 배치 |
| `solid.extrude` | 선택/직전 생성 윤곽의 연관 돌출. 외곽과 내측 원을 함께 주면 관통 구멍을 포함한 단면 생성 |
| `solid.boolean` | 선택/직전 생성 솔리드의 union/cut/intersect, 입력을 숨기고 원본 관계를 가진 결과 생성 |
| `solid.hole` | 선택된 기존 솔리드의 정확한 면에 작업면을 연결하고 원형 관통/막힌 구멍 생성 |
| `solid.parameter` | `cad.parameters`의 key를 사용한 단일 길이 치수 변경. 다른 쓰기 도구와 혼합하지 않음 |
| `curve.circle` | XY/XZ/YZ 방향과 world XYZ 중심을 가진 편집 가능한 원. 평면 높이를 달리해 로프트 단면 생성 |
| `curve.polyline` | 같은 평면 위 world XYZ 점 2–64개, open 경로 또는 3점 이상 closed 윤곽 |
| `solid.revolve` | 닫힌 단일 윤곽을 원점 통과 작업면 로컬 x/y축으로 0.001–360도 회전 |
| `solid.sweep` | 닫힌 단일 윤곽과 open line/arc/polyline 경로를 연결 |
| `solid.loft` | 명시 순서의 닫힌 단면 2–10개, ruled/smooth 선택 |
| `solid.fillet` | 선택된 기존 솔리드의 정확한 모서리 key 1–32개에 양수 반지름 필렛 |
| `solid.chamfer` | 같은 모서리 계약으로 양수 거리의 대칭 모따기 |
| `solid.shell` | 선택된 기존 솔리드에서 정확한 면 key 1–10개를 제거하고 양수 두께만큼 안으로 offset |
| `wall.create` | XY start/end, height/thickness/baseLevel, hosted openings로 native 벽 생성. 숨겨 보존한 중심선 원본에 연결. 기본 butt; startMiter/endMiter로 명시한 ±80° 끝 절단 |
| `wall.opening` | 선택한 native 벽의 정확한 opening ID를 생성/수정. along은 원본 시작점부터 개구부 중심까지의 거리. kind/side/width/height/sill 명시 |
| `wall.update` | 선택한 native 벽의 height/thickness/baseLevel 수정, 기존 개구부 보존. 선택적으로 원본 start/end 및 startMiter/endMiter 수정 |
| `slab.create` | 선택한 또는 같은 제안에서 먼저 만든 닫힌 XY polyline 윤곽의 floor/ceiling 생성, level/thickness 명시. 외곽/홀 원본 연결 |
| `drawing.section` | 선택한 BRep 또는 같은 건축 제안에서 만든 부재의 최대 64개 부재의 실제 XY/XZ/YZ 절단 도면. height는 basis 법선의 world 좌표. replaceExisting=true로 정확한 기존 view의 원본 집합을 명시 교체 |
| `drawing.refresh` | 선택한 부재의 관련 단면/투영을 기존 정의로 명시적으로 재생성 |

실제 필드·범위는 런타임 schema가 기준이다. 추가 필드를 거절하며 숫자는 finite여야 한다. 모델링 길이는 0.001–10000mm, 좌표는 ±1000000mm이고 기존 치수 편집은 해당 driver의 더 좁은 한도를 적용할 수 있다. 새 output ID는 영문자로 시작하는 48자 이내 식별자이며 기존 ID와 충돌하면 거절한다.

## 요청과 조회 왕복

기존 version 1 요청에 `tools` catalog와 `toolContext`를 추가했다. 기존 `context`, `edit`, `solid`, `capabilities`도 유지한다. 새로운 gateway는 첫 응답으로 다음과 같이 조회를 요청할 수 있다.

```json
{
  "version": 1,
  "toolCalls": [
    {"id":"inspect-1","name":"cad.inspect","arguments":{"objectIds":["selected-body"]}},
    {"id":"measure-1","name":"cad.measure","arguments":{"objectIds":["selected-body"]}},
    {"id":"faces-1","name":"cad.faces","arguments":{"objectId":"selected-body"}}
  ]
}
```

브라우저가 캡처된 로컬 문서를 조회하고 같은 gateway에 기존 요청과 누적 `toolResults`를 보낸다. 결과는 `{id,name,ok,version,result?,error?}`다. version은 documentId/revision/generation이고 조회 오류도 제한된 진단으로 돌려준다. 전체 feature params, 전체 의존 graph, mesh/raster bytes를 보내지 않는다. 선택 밖 객체도 읽을 수 있지만 조회 자체가 편집 selection을 바꾸지는 않는다.

한 응답은 조회 또는 모델링 중 한 종류만 담는다. 읽기 최대 4회 왕복, 회당 8개, 누적 결과 64KiB, 계획 요청 전체 30초 deadline을 적용한다. call ID는 세션 전체에서 유일해야 한다. 문서 버전·선택·prompt 등 계획 문맥이 바뀌거나 취소하면 늦은 응답/조회 결과를 폐기한다.

## 최종 모델링 제안

새로운 모델링 제안도 `toolCalls` 형식이다. 예를 들어 빈 문서에 스케치와 돌출을 만들려면 다음을 반환한다.

```json
{
  "version": 1,
  "toolCalls": [
    {"id":"sketch-1","name":"sketch.create","arguments":{"id":"baseSketch","plane":"XY"}},
    {"id":"rectangle-1","name":"sketch.rectangle","arguments":{"id":"baseProfile","sketchId":"baseSketch","origin":[0,0],"width":80,"height":50}},
    {"id":"extrude-1","name":"solid.extrude","arguments":{"id":"baseBody","profileObjectIds":["baseProfile"],"distance":20}}
  ]
}
```

브라우저는 이를 실행 가능한 **미게시 계획**으로 변환한다. 실제 원본 기하를 계산한 미리보기·수치·영향을 사용자가 검토한 뒤 Apply한다. 한 제안은 최대 20개 도구 호출이며 한 transaction/Undo다. 앞선 단계 결과 ID는 뒤 단계 입력으로 사용할 수 있다. 기존 입력은 캡처된 선택에 있고 표시/잠금/참조 조건을 통과해야 한다. Boolean이 소비한 입력은 같은 계획에서 다시 사용하지 않는다. 전체 실패 시 중간 스케치나 솔리드를 게시하지 않는다.

기존 `{"version":1,"summary":[...],"command":...}` 제안도 기존 allowlist로 처리한다. 이 경로의 권한을 전체 CadCommand로 넓히지 않았다. `toolCalls`와 `command`를 한 응답에 혼합하지 않는다.

## 면과 구멍 좌표

`cad.faces`의 `frame`은 world 좌표의 origin/xAxis/yAxis/normal이다. `solid.hole.center=[u,v]`는 그 면의 로컬 좌표이며 world XY가 아니다. world 점 `p`를 사용할 때 `u=(p-origin)·xAxis`, `v=(p-origin)·yAxis`로 변환한다. 구멍 원 전체가 실제 선택 면 위에 놓이는지 기존 Hole 계산이 검사한다.

관통 구멍은 `through:true`와 diameter/center/faceKey를 주고 depth를 생략한다. 막힌 구멍은 `through:false`와 양수 depth를 준다. 면 키는 조회한 원본 revision의 정확한 identity다. 새로 만든 솔리드의 면을 사용하려면 먼저 그 모델을 Apply하고 다음 요청에서 조회한다. 같은 제안 안에서 아직 없는 body의 임의 face key를 만들어 쓰지 않는다.

로컬 “윗면 중심” shortcut은 +Z 법선 중 가장 높은 유일한 평면의 frame 원점을 사용한다. 같은 높이의 후보가 여럿이거나 결과가 잘렸다면 명시적인 면 선택을 요구한다. 면 원점이 빈 공간에 있거나 원이 경계를 넘으면 Hole 미리보기에서 거절한다. 재생성 후 면 identity가 사라지면 기존 repair 정책을 따른다. 유지된 예전 형상은 검토용이며 미해결 참조를 현재 기하로 측정하거나 새 연산의 입력으로 사용하지 않는다.

## 회전·경로·단면·마감

`curve.circle.center`와 `curve.polyline.points`는 world XYZ mm다. plane은 XY/XZ/YZ에 평행한 방향이며 원점에서 떨어진 평면도 허용한다. polyline의 닫힘은 `closed`로 지정하고 마지막 점에 첫 점을 반복하지 않는다. 회전의 axis는 **작업면 로컬 축**이다. 예를 들어 XZ 평면의 y축 회전은 world Z축 회전이며 회전축은 world 원점을 통과한다. 스윕은 profile과 path가 서로 달라야 한다. 회전/스윕/로프트는 구멍 없는 단일 닫힌 단면을 받으며 잘못된 단면·자기 교차·불가능한 연산은 실제 preview에서 전체 거절한다.

로프트 예시: `curve.circle`로 XY 방향 원을 world `[0,0,0]`, `[0,0,30]`에 각각 만들고 `solid.loft {id,profileObjectIds:[bottomId,topId],ruled:true}`로 연결한다. 단면 나열 순서가 연산 순서다. 곡선도 일반 원본 피처로 저장되어 후속 수동 편집 시 연관 솔리드가 재생성된다.

스윕은 기존 path의 world point spine을 사용한다. line/polyline 경로를 그대로 연결하며 arc 경로는 기존 표본을 직선으로 잇는 근사다. 해석적 원호 spine으로의 확장은 포함하지 않았다.

`cad.edges.points`는 객체의 이동/회전/축척을 반영한 world 대표 표본이다. 정확한 곡선 길이 측정치가 아니며 key는 원본 형상의 로컬 identity를 그대로 유지한다. `solid.fillet/chamfer.edgeKeys`에 정확한 key를 전달한다. 로컬 “수직 모서리”는 모든 표본의 world X/Y가 같고 Z가 변하는 직선 모서리만 고른다. 조회가 잘렸거나 해당 모서리가 없으면 거절한다.

필렛·모따기·셸은 새 솔리드를 먼저 Apply한 후 다음 요청에서 위상을 조회한다. 마감 결과 ID는 명시적으로 지정하여 같은 계획의 Boolean 등 후속 연산에 사용할 수 있다. 중복/사라진 key와 선택 밖 원본, 비단위 축척 원본, 커널이 만들 수 없는 반지름/거리/두께는 거절한다. 셸의 면은 정확히 하나로 해석되어야 하며 재생성 후 해석되지 않는 면은 명시적으로 다시 선택한다. 가까운 다른 면이나 모서리로 대체하지 않는다.

2026-10-23: `cad.curve`로 회수 가능한 fitted source/placement를 조회하고, `curve.fitted` 생성, `curve.reshape` 원본 수정, `curve.adjust` 단일 통과점 delta를 지원한다. 수정은 선택된 독립·표시·잠금 해제 원본에 한정하며 source 평면/닫힘/배치를 보존한다. [내부 엔진과 선택 모델](../implementation/COPILOT-INTERNAL-OPTIONAL-01-2026-10-23.md).

건축 쓰기 도구는 서로 같은 제안에 사용할 수 있지만 일반 도형/주석 쓰기와는 별도로 검토한다. `wall.opening/update.refreshDrawings`는 관련 도면 재연결을 같은 transaction/Undo에 포함한다. native 검증이 개구부 범위·중복·잠금·참조 실패를 검사한다. 이 도구의 추가는 모델이 건축을 자동 설계하거나 미적으로 판단한다는 뜻이 아니다. `cad.pathClearance`는 벽/문의 정의로 유한 선분과 점유 구간의 정확한 2D 거리를 계산하며, 전체 3D 충돌/자동 경로/피난 인증으로 해석하지 않는다.
