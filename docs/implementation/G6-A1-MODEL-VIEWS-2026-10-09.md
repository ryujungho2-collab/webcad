# G6-A1 명명된 모델 뷰 저장 계약

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. 문서·명령·카메라 복원 계약을 구현했다. Ribbon/검색/저장 뷰 선택 UI는 G6-A2 후속이다.

## 조사와 데이터 계약

기존 `CadViewport`는 PerspectiveCamera와 OrthographicCamera를 유지한다. 표준 Top/Front/Right/Isometric, OrbitControls target, Fit, pan/orbit, 2D 평면 내 회전, zoom, clipping과 host aspect resize를 사용한다. 2D는 항상 정투영이며 projection 전환 시 현재 프레이밍을 변환한다. 모델 Rotate와 작업면 변경은 별도 경로다.

선택적 `CadDocument.modelViews`는 ID별 `CadModelView`를 저장한다. 뷰는 `id`, `name`, `camera`만 갖는다. 카메라는 world/mm 좌표 `eye`, `target`, 단위 `up`, `near`, `far`, `zoom`과 다음 투영 값을 갖는다.

| 투영 | 프레이밍 |
| --- | --- |
| perspective | 수직 `fov`(degree), 저장 당시 `aspect` |
| orthographic | `left`, `right`, `top`, `bottom`(zoom 적용 전 mm) |

up은 실제 카메라 orientation의 위쪽 축을 캡처하므로 평면 내 회전/roll을 보존한다. eye/target이 같은 값, up의 길이 오류·보기 방향과 평행, 비유한 값, 잘못된 near/far·zoom·프러스텀·fov/aspect를 거부한다. ID/이름은 1–200자이고 이름은 공백 없이 시작/끝나며 대소문자 구분 없이 중복을 거부한다. 컬렉션은 최대 256개다. 위험한 prototype ID와 정의되지 않은 카메라 필드도 거부한다.

작업면, 모델 transform, layer visibility, section/crop, 객체 선택, Fit 대상 ID를 저장하지 않는다. 프레이밍은 저장 시점의 숫자 snapshot이며 모델 변경 후 자동 Fit하지 않는다. view offset/film offset은 현재 viewport에서 사용하지 않으며 adapter도 정확하게 저장할 수 없는 offset camera를 명시적으로 거부한다.

## 명령·복원

- `upsert-model-view`: 새로운 ID는 생성, 기존 ID는 카메라/이름을 교체한다. 동일 값은 변경 없이 거부한다.
- `delete-model-view`: 기존 ID를 제거한다. 마지막 뷰를 지우면 선택적 collection도 제거한다.
- 공통 `previewCadCommand → applyCadPlan`을 사용하고 Impact에 Model views 생성/수정/삭제를 보여준다. 검토 중 문서가 바뀌면 stale apply를 거부한다. view-only batch도 한 History entry다.
- `captureModelViewCamera(camera, target)`는 Three 카메라에서 detached 데이터를 만든다. `cameraFromModelView(cameraState, aspect?)`는 detached 카메라를 복원한다. aspect 생략 시 저장 투영을 재현하며, 새 aspect에서는 수직 프레이밍과 정투영 프레임 중심을 유지한다. OrbitControls·App 모드·활성 카메라 연결은 A2가 담당한다.

뷰만 다루는 명령은 모델 재생성과 kernel 측정을 실행하지 않는다. 잠긴 live 돌출 모델에서도 objects/features/sketches/layers/bindings를 그대로 보존한다. geometry를 포함한 batch는 기존 모델 검증을 유지한다.

## 저장 호환과 문서 수명

modelViews가 있는 파일만 **v15**로 저장한다. v1–v14 파일은 빈 컬렉션을 추가하지 않고 그대로 읽는다. 낮은 버전 파일에 modelViews를 끼워 넣으면 거부한다. v15는 map/ID/이름/카메라를 검증하며 손상 파일이 live document/History를 교체하지 않는다. 뷰가 없는 문서는 기존 최소 version 선택을 유지한다.

History 복원, batch rollback, proposal publish, 파일 열기·New, autosave/recovery의 optional field 처리를 연결했다. 이전 뷰가 남는 현상 없이 이전 문서로 전환한다. recovery의 정상 checkpoint·손상 current에서 이전 backup 복구도 검증했다.

## 검수와 제한

신규 Node 9개는 생성/preview/Impact·수정/이름 변경·삭제·Undo/Redo·stale·입력 alias·잘못된 카메라/중복 이름/failed batch·v1–v14/v15·공개 파일 열기/New·recovery·손상 파일 거부·잠긴 live solid 원본 불변을 검사한다. 실제 Three 카메라의 world point→NDC를 대조해 정투영·원근·비대칭 frustum·zoom·roll·큰 좌표·clipping과 aspect 변경을 검증한다.

전체 Node 764개/54 suites/fail·skip 0, 타입·workspace build·architecture 통과. 기존 native browser wheelNavigation 11 checks와 sessionContinuity 24 checks를 회귀 실행했다. **저장 뷰 UI workflow나 전체 browser suite를 실행한 것은 아니다.** `CadViewport`/App의 실행 경로는 바꾸지 않았다. [검수 증거와 로그](../verification/G6-A1-CLOSEOUT-2026-10-09.json)를 따른다.

G6-A2 UI, 3D 조립/분해, section/crop, 연관 도면 출력, RVT/IFC와 외부 adapter는 이 범위에서 시작하지 않았다. 새 latency·GPU·실무자 benchmark는 없다. 기존 large chunk warning은 유지된다.
