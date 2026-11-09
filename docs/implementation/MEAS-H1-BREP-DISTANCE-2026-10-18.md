# MEAS-H1 후속: 솔리드/BRep 거리

2026-10-18 구현. [현재 사용법과 지원 범위](../features/MEASUREMENTS.md#솔리드brep-거리--meas-h1-후속).

## 거리와 관계의 구분

기존 호버 패널에 닫힌 양의 체적 BRep 쌍을 연결했다. 기본 숫자와 A/B 표시는 **표면 경계 간 최단거리**다. 포함된 물체의 경계 간격이 양수여도 재료 영역은 겹치므로 재료 분리 거리와 관계 상태를 별도로 표시한다. 두 값을 바꿔 표시하거나 포함 간격을 자유 공간으로 해석하지 않는다. 관통 깊이나 signed distance를 계산한 것은 아니다.

cad-kernel의 `operations/distance.ts`는 valid closed solid/solid compound를 검사하고 원본 face compound에서 OCCT `BRepExtrema_DistShapeShape`를 실행한다. 입력과 witness는 world mm다. 렌더 mesh/triangulation/AABB를 거리로 대체하지 않는다. witness는 kernel이 반환한 face/edge/vertex 위 점이다. 지지 형상의 최적 경계·정확 기하 질량으로 read-only signature를 만들며 document/object/revision과 함께 식별한다. 편집용 persistent topology key나 face/edge 직접 선택 API로 사용하지 않는다. 바인딩에서 얻지 못한 매개변수를 0으로 가장하지 않는다.

Common BRep volume으로 separated/contact/overlap/source-contained/target-contained/coincident/indeterminate를 나눈다. 포함/일치는 체적 허용 오차를 사용하는 수치 판정이며 그 허용 오차를 함께 제공한다. 극소 공통 체적이나 Boolean/체적 판정 실패는 indeterminate로 남기며, 실패하면 재료 분리 거리도 unavailable이다. 신뢰할 수 있는 경계 witness는 계속 표시한다. Boolean cavity 안의 물체는 재료 겹침이 없으므로 포함으로 잘못 분류하지 않는다.

OCCT 기본 deflection은 1e-6 mm, 지원 입력은 1e-7–0.01 mm다. 결과의 `accuracy: brep`, `boundKind: kernel-tolerance`와 수치 band는 커널 설정이며 곡선 solver의 수학적 chord/hull 오차 구간이나 certified interval로 주장하지 않는다. volumeTolerance는 max(1e-12, min(Va,Vb)×1e-9) mm³다. 접촉은 경계 거리가 선형 허용 오차 이내이고 공통 체적이 0인 범위를 포함한다.

## 실행과 수명

기존 Worker protocol에 distance 연산을 추가했다. 두 source operand를 기존 retained BRep builder와 동일한 T·R(XYZ)·S 변환 경로로 만든다. measurement 단계에서 실행하고 native handle은 finally로 해제한다. shape retention은 기존 byte/count LRU를 사용하며 거리 결과는 triangle buffer를 생성하지 않는다.

호버 orchestration은 순수 precision 모듈에서 state/hoverDistance.ts로 옮겨 kernel 호출 경계를 지킨다. 유한 도면 기하 계산기는 그대로 순수하다. settled 결과는 기존 64-entry revision/generation cache를 재사용하며, 기본/명시 허용 오차를 서로 다른 키로 구분한다. read-only 결과와 operand는 복제하며 caller 수정·문서 편집/Undo·세션 변경으로 stale 결과를 발행하지 않는다. active Worker 취소는 기존 KernelWorkerClient의 task 단위 terminate/retry를 사용한다. Node 회귀 adapter는 실행 전후 signal을 확인한다.

솔리드는 Shortest 3D만 지원한다. projected/axis, 혼합 drawing/BRep, 열린 face/shell·free face가 섞인 compound는 명시적으로 거부한다. 몸체당 32 solids/4096 faces·16단계 nesting, BRep 레이어 적격 후보 8개 제한이 있다. 숨김/격리·잠금 opt-in은 기존 정책을 유지한다. 레이어 최근접 기준은 경계 거리이며 미지원 후보를 별도로 노출한다. 분해 표시/모델 clipping은 실제 보이는 위치와 원본 witness가 다를 수 있어 assemble/disable을 안내한다.

## 검증

- 전체 Node 1,437개/54 suites 통과. 최종 허용 오차 cache 보정과 분해/clip guard 회귀는 집중 46개(BRep 13, 기존 finite hover 18, Worker client 15)로 검증했다. 중복 합산하지 않는다.
- BRep: separated/rotated/nonuniform, face/edge/corner contact, overlap, nested/reversed/coincident, curved sphere/다른 XYZ 고도, Boolean cavity, read-only/Undo/cache tolerance, layer closest, projected rejection, aborted task, retained source reuse/no mesh cache, open/free face rejection, exploded/clipping guard.
- 신규 native browser 16개: 실제 solid mouse hover와 Worker, 두 support mark, boundary/material 구분, read-only/History, 정확히 한 native 작업과 반복 cache, layer actual nearest body, projected rejection, 960px, overlap/Undo/containment, 실제 Worker abort/fresh-worker retry, Esc.
- 기존 finite hover browser 19개 회귀 통과. 최종 build와 architecture 679 모듈 검증도 통과했고 [manifest](../verification/MEAS-H1-BREP-2026-10-18.json)에 기록했다.
- 960px/포함 스크린샷에서 경계 간격과 재료 분리 거리 0이 함께 표시됨을 확인했다. viewport query이며 파일 schema·PDF 출력은 변경하지 않았다.

960px (local-only, not in repository: `output/verification/brep-distance/brep-960.png`) · 포함 상태 (local-only, not in repository: `output/verification/brep-distance/contained.png`) · 메타데이터 (local-only, not in repository: `output/verification/brep-distance/distance.json`) · 원본 파일 (local-only, not in repository: `output/verification/brep-distance/source.webcad.json`) · native report (local-only, not in repository: `output/verification/brep-distance/native-report.json`).
