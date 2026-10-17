# G5-B2 — Copilot의 선택된 2D 도형 Move

> **현재 기능 설명:** [Copilot](../features/COPILOT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. 사용자의 명시적 G5-B2 요청으로 gateway 편집 명령 **한 종류**를 확대했다. 기준선은 G5-B1 `3d1cab9`이며 이전 요청에서 수정한 1차/2차 목표 문서는 보존했다. 실제 LLM 공급자·서버·인증은 연결하지 않았다. 최신 검수 수치는 [PROJECT-STATE](../../PROJECT-STATE.md)를 따른다.

## Before → 발견 → 변경

기존 gateway는 finite drawing/primitive 생성만 허용했다. 기존 `move-object`는 수동 정밀 이동·속성 편집에서 이미 사용하는 absolute world translation 명령이지만 gateway에는 대상 권한·ownership·좌표 계약이 없었다. Copilot ghost와 결과 인계도 생성만 가정해 `createdIds`가 비어 있는 편집은 완료 후 검사할 수 없었다.

새 [copilotEdit](../../apps/web/src/copilot/copilotEdit.ts)은 현재 **편집 selection 한 개**에서 대상 계약을 만든다. B1 Query의 별도 read target은 편집 권한으로 쓰지 않는다. [gateway 경계](../../apps/web/src/copilot/copilotConnection.ts)는 이 계약과 응답을 검증하고, App은 preview 전과 Apply 게시 직전에 실제 문서/선택/작업면으로 재검증한다. 기존 commandInteraction·detached preview·atomic Apply·취소/context 계약을 그대로 사용한다.

잠긴 연관 거리 치수를 둔 회귀가 수정 전 `true !== false`로 실패했다. 일반 치수 reconciliation이 source 변경 후 잠금 확인 없이 좌표를 갱신하는 문제였다. [dimensionRefresh](../../apps/web/src/state/dimensionRefresh.ts)에 거리·반지름·지름 갱신 및 삭제 source 동결의 잠금 검사를 추가했다. 잠긴 downstream 치수가 필요한 Move는 전체 transaction을 거부하고 원본/History를 보존한다. 각도 치수의 기존 잠금 검사도 유지한다.

Preview 실패를 authoritative `canApply`에 연결한 뒤 첫 전체 browser run은 기존 39 workflows/834 checks를 통과하고 새 Move의 ready 단계에서 멈췄다. 갱신되는 중점의 단일 좌표를 polyline ghost로 렌더링해 ghost 하나가 실패한 것이 원인이었다. 단일 path는 기존 point renderer로 처리하도록 고쳤고 Move 단독 25 checks를 다시 통과했다. 실패 검사를 없애거나 Apply를 강제로 허용하지 않았다. 수정 전 전체 로그는 `output/g5-b2-browser-before-point-fix-2026-10-09.log`에 보존했다.

## 지원 계약

- 독립 root finite 2D drawing 한 개: line/polyline/rectangle/circle/arc. 현재 작업면과 같은 XY/XZ/YZ, 평면을 유지하는 transform과 uniform in-plane scale을 지원한다. 회전된 원/원호와 bulge polyline도 원본 params/topology를 보존한다.
- `translation`은 **월드 축 기준 절대 배치 translation**, mm, 각 값 ±1,000,000 이내다. 모델 control point 좌표나 delta가 아니다. 같은 값을 두 번 더하지 않는다. 작업면 normal 축의 기존 translation을 정확히 유지한다.
- 스케치/작도/패턴 소유 도형, inputs가 있는 파생 도형, 부품/3D/vector/component/image/dimension, 무한직선/반직선/점, 다중 대상, 작업면 밖 이동, nonuniform/tilted transform은 이 gateway Move에서 거부한다. 기존 수동 도구를 제거하지 않는다.
- Move는 standalone 명령이다. 생성과 혼합 batch, 여러 Move, nested batch, layer/topology/params/ownership 주입은 거부한다. rotate/scale/delete 등 다른 편집 명령은 allowlist에 넣지 않았다.
- 선택한 source에 연결된 치수·작도·패턴·돌출 등이 있다면 기존 detached 재생성 경로가 검증한다. 지원 도형 하나를 움직일 수 있다는 것이 모든 downstream 조합의 신규 검수를 의미하지 않는다.

요청 version 1에 `move-object` capability와 bounded `edit` 계약을 추가했다. 적격 대상 ID/이름/작업면/현재 translation 또는 disabledReason만 보낸다. 원본 control point, 전체 document, raster bytes는 보내지 않는다. 기존 생성 응답 계약은 유지한다. mock gateway의 Move 응답 예:

```json
{
  "version": 1,
  "summary": ["Move the selected drawing"],
  "command": {
    "type": "move-object",
    "objectId": "selected-drawing-id",
    "translation": [10, 20, 0]
  }
}
```

대상은 요청 `edit.target.id`와 정확히 같아야 한다. 서버 summary/ghost가 주장하는 효과는 Move review에 사용하지 않는다. 표시 이름·현재/결과 translation은 로컬 계약에서 만들고, amber source/teal result ghost는 **실제로 평가된 detached plan**의 world drawing paths에서 만든다. 표시에 쓰는 sampled path를 원본 geometry로 저장하지 않는다. preview 실패 시 authoritative `canApply`가 Apply를 차단한다.

Apply 후 기존 객체를 선택하고 completed review·Inspect result로 기존 Properties에 인계한다. source/layer/작업면/선택/prompt/provider 설정이 바뀌면 새 Plan이 필요하다. Cancel은 게시 전 Apply와 late 응답을 폐기한다. Local rule parser는 기존 생성/profile/extrusion 경로를 유지하며 자연어 Move parsing을 추가하지 않았다.

## 실제 workflow와 검수

[Node 회귀](../../apps/web/tests/copilotEdit.test.ts) 신규 **8개**: 선택 권한/metadata bounds, field 주입과 no-op/nonfinite/off-plane/batch 거부, 실제 representation/ownership/visibility, 독립 world 좌표 oracle, dimension+midpoint 갱신, params/topology 안정성, v14 저장/재열기, 한 Undo/Redo, 수동 Move 동등성, stale Apply, 잠긴 downstream, 패턴 멤버, XZ/YZ elevation, 회전된 원/원호·bulge 원본/측정 보존을 검사한다.

[실제 browser page](../../apps/web/tests/copilotEdit.browser.tsx)는 [전체 runner](../../apps/web/scripts/browserChecks.mjs)에 등록했다. React·CAD transaction·CDP pointer **25 checks**로 다음을 수행했다. Gateway response만 mock이며 실제 공급자 연결 증거가 아니다.

`Model tree 선택 → gateway Plan → 대상/현재·결과 mm 입력값 확인 → Impact 펼치기 → canvas preview 켜기/끄기 → Clear → 다시 Plan → Apply → Undo/Redo → Inspect result → 잘못된 대상/작업면 오류 → 수정/재검토 → queued Apply Cancel·선택 변경 → late response 취소 → target 잠금 → locked downstream 오류 → Unlock·재검토 → 다중 선택 거부`.

실제 캔버스 screenshot에서 Move result ghost 색상 픽셀이 preview를 숨기면 감소하는지 확인했다. 초기 3D 카메라에서는 해당 2D 도형이 화면 밖에 있었으므로 사용자의 기존 2D/Fit 조작으로 프레이밍한 뒤 같은 픽셀 oracle을 통과시켰다. Apply 전 exact document와 past/future가 불변이며, source length 50 mm와 midpoint [25,40,0]를 확인한다. 인계 후 모델 트리에서 정확한 source가 선택되는지도 검사한다.

## 남은 제한

최종 전체 **659 Node / 54 suites / fail·skip 0**, **40 browser workflows / 859 checks**, 타입·architecture/import·문서 링크 **321 modules**, workspace production build가 통과했다. [마감 검증 요약](../verification/G5-B2-CLOSEOUT-2026-10-09.json)에 명령·로그·수정 전 실패와 범위를 보존한다. main 1,058.73 kB / viewport 619.05 kB의 기존 >500 kB 경고는 유지된다. B1의 651 Node / 39 browser·834 checks는 이전 기준선이다.

이번 slice는 성능 최적화가 아니다. 실제 provider 지연/인증·다중 사용자·대형 문서/heap/GPU benchmark를 실행하지 않았다. preview의 전체 document clone/graph 비교 비용과 기존 큰 build chunk 경고는 남는다. 화면 밖 결과를 자동 Fit하는 기능, 드래그/정밀 입력을 Copilot Plan에 다시 연결하는 UI, 다중 대상/다른 편집 allowlist는 별도 후속이다. 다음 구현은 사용자의 1차 건축·기계 목표에 따른 G6-A1이며 자동 시작하지 않는다.
