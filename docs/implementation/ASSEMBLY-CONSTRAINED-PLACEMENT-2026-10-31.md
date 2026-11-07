# Phase 1B-0 — Assembly-Constrained Part Placement (2026-10-31)

**재배치 명령과 두 정책을 구현·검증했다.** 일반 CAD Assembly Inspector와 기존 MCP ToolSession이 같은 Native command/Preview/Apply를 사용한다. 새 solver/physics/kernel은 없다. 실제 간섭 후보의 결과는 명령 정확성과 별개로 기록한다.

## 사용 방법 / 산출물

Assembly joints → **Place Joint-owned part**에서 Child, 목표 XYZ(mm)·Euler XYZ(degrees), 명시적 descendant policy를 입력하고 Review part placement를 누른다. Preview는 source와 History를 변경하지 않는다. 바뀌는 world anchors나 기존 intent가 있으면 checkbox로 설계 의도를 재확인한 후 Apply한다. Cancel은 Preview와 ghost를 폐기한다.

- 실제 Native Preview 스크린샷 (local-only, not in repository: `output/verification/assembly-placement/placement-preview.png`)
- 브라우저 저장 문서 (local-only, not in repository: `output/verification/assembly-placement/placement.webcad.json`)
- 별도 거치대 후보 문서 (local-only, not in repository: `output/verification/assembly-placement/laptop-candidate.webcad.json`)
- World Matrix / Rest / anchor / Motion 원시 보고서 (local-only, not in repository: `output/verification/assembly-placement/laptop-report.json`)
- 브라우저 검사 (local-only, not in repository: `output/verification/assembly-placement/browser-report.json`), 기계 판독 summary (local-only, not in repository: `output/verification/assembly-placement/summary.json`)

스크린샷은 테스트 배치에서 제품 CadViewport와 실제 편집 패널을 실행한 것이다. 브라우저 Apply/Undo/Redo는 평가 복사본에서만 수행했다. v63 원본 파일은 보존했다.

## 기존 경로 조사와 명령 필요성

| 기존 기능 | 판단 / 재사용 |
|---|---|
| move-object / rotate-object, place-model-part | 일반 World Transform 편집이다. evaluator가 Grounded/Joint-owned 직접 변경을 거부하므로 이번 목표를 표현하지 못한다. 기존 검증은 유지한다. |
| assembly-joint-edit / reparent preserveWorld | 현재 World Pose에서 inverse motion을 포함해 Rest를 재계산한다. 입력은 origin/axis/limits 또는 parent이며 목표 Child World Pose나 descendant 정책이 없다. origin/parent를 우회 변경하지 않는다. |
| assemblyMatrix / jointMotion / evaluateAssembly / assertAssemblyPose | 기존 절대 자세 수학과 트리 evaluator를 그대로 사용한다. 새 제약 solver나 기하 복원은 만들지 않았다. |
| CommandBus / prepareCadCommand | 새 handler 하나만 기존 executor에 등록했다. detached transaction에서 실패하면 원래 source와 History를 보존한다. |
| previewCadCommand / applyCadPlan / discardCadPlan | 기존 Preview·stale 검사·Cancel·한 번 publication·Undo/Redo를 사용한다. placement report와 정확히 그 Preview에 속한 intent 확인 상태만 추가했다. |
| Document serialization | 기존 Rest Transform을 저장하므로 형식 변경이 없다. annotated 문서는 v63, 기존 SimReady v64도 계속 유효하다. 확인 checkbox는 문서나 History에 저장하지 않는다. |

기존 명령을 조합하면 Joint frame/parent를 바꾸거나 임시 detach/ground 상태가 필요하다. 이를 피하기 위해 **assembly-part-place** 하나와 public tool **assembly.part.place** 하나를 추가했다.

## 수학과 보존 정책

기존 evaluator는 `C = P × A(j) × B`를 사용한다. P는 부모 world matrix, A는 현재 angle의 parent-local Joint motion, B는 Rest다.

`A(j) = T(origin) × R(unitAxis, currentAngle) × T(-origin)`

목표 world pose Ctarget에 대해 incoming Rest:

`Bnew = inverse(P × A) × Ctarget`

- **Move Subtree:** incoming Rest만 재계산한다. 모든 하위 Rest와 Joint metadata/angle을 유지하며 기존 evaluator가 전체 subtree를 새 목표 자세에서 평가한다.
- **Preserve Descendant World Poses:** incoming Rest를 재계산한 후 직속 하위 edge마다 `Bchild_new = inverse(Ctarget × Achild) × Dold`를 계산한다. 직속 Child world가 유지되므로 더 깊은 후손 Rest를 바꾸지 않고 전체 후손 world를 유지한다. 비영각 outgoing Revolute에도 inverse A를 포함한다.

목표 pose는 Translation/Euler rotation/Scale[1,1,1]만 받으며 값은 유한하고 translation·rotation 각 성분 절댓값1,000,000 이하이다. Matrix/Shear 입력과 Scale 변경은 받지 않는다. 원본 parentId/childId, Joint type/angle/origin/axis/limits, 형상과 치수, 기존 intent annotation은 보존한다. 비교는 기존 matrix tolerance1e-7을 사용한다. 현재 angle을0으로 바꿔 bind하는 방식을 쓰지 않는다.

이 정책은 현 Joint state의 world 보존이다. 일반적인 서로 다른 조상 Joint를 향후 움직일 때도 모든 body가 같은 world에 남는다는 뜻이 아니다. 연결 위치, 실제 체결 가능성이나 구조적 타당성은 보증하지 않는다.

## 검증·권한·Preview

- Grounded 또는 non-owned root, no-op(동치 Euler 포함), 잘못된 참조·cycle·Rest, 지원하지 않는 scale/shear, 비유한/초과 범위를 거부한다.
- target 및 재계산되는 Rest의 endpoints가 locked이면 거부한다. Move Subtree에서 locked descendant가 실제 움직이는 경우에도 기존 evaluator가 거부한다. World Pose를 보존하더라도 locked Child의 Rest를 바꾸면 거부한다.
- 명시하지 않은 부품의 matrix 변화는 거부한다. Geometry를 재생성하는 의존 피처 변경도 이 최소 편집 경로에서 거부한다.
- Preview는 대상 before/target/after Transform·Matrix, Rest 변경 목록, 이동·보존 후손, anchor origin/axis before/after, 기존 annotation, 보존 조건을 표시한다.
- Native Apply는 stale revision/generation과 source snapshot을 재확인한다. anchor 변경 또는 관련 intent가 있으면 **정확히 그 Preview에 대한 native intent 확인**이 없을 때 Apply를 거부한다. UI panel과 공통 CommandReview 모두 checkbox를 제공한다.
- MCP 인자에는 확인/Apply bypass 필드가 없다. 모델은 canonical proposal만 만든다. `acknowledgeAssemblyPlacementIntent`는 native UI review 상태 API이며 MCP tool로 등록하지 않았다.
- 검토 조건을 여러 명령 속에 숨기지 않도록 이 명령은 batch 안에서는 지원하지 않는다. descendant 보존 Rest 변경은 이 단일 명령 안에서 원자적으로 처리한다.

## 실제 v63 거치대

원본 SHA-256: `d0936d1165146066adb43d96e2ece7a20bd93ddb3eca5d84d3d173eac2fbcd8f`. `stand-support`의 목표 translation은 [25,6,16]mm로, 원래 [25,6,26]에서 −10mm다. 회전·scale·치수는 그대로이며 Preserve Descendant World Poses를 명시했다.

변경 전 C (행 표시, 원시 JSON은 Three.js column-major):

```text
[-1.000000000, -0.000000000, -0.000000000, 25.000000000]
[0.000000000, -0.965925826, 0.258819045, 6.000000000]
[-0.000000000, 0.258819045, 0.965925826, 26.000000000]
[0.000000000, 0.000000000, 0.000000000, 1.000000000]
```

변경 후 C:

```text
[-1.000000000, -0.000000000, -0.000000000, 25.000000000]
[0.000000000, -0.965925826, 0.258819045, 6.000000000]
[-0.000000000, 0.258819045, 0.965925826, 16.000000000]
[0.000000000, 0.000000000, 0.000000000, 1.000000000]
```

- incoming `support` Rest translation: [-25,-6,6] → [-25,-6,-4]mm.
- outgoing `plate` Rest translation: [-95,-39.033218885,113.986537519] → [-95,-36.445028434,123.645795782]mm.
- `stand-plate`, `stand-lip`의 World Pose 보존. 이동하는 descendant 없음.
- `bearing` Revolute 전체 metadata/Rest 보존. World origin[0,0,20], axis[0,0,1] 보존.
- plate의 **Joint anchor world Z는45.318516526 →35.318516526mm**로 변한다. body pose 보존이 anchor 보존과 같지 않음을 Inspector에 표시하고 확인을 요구한다.
- support width50/depth12/height103.527618 및 plate240×200×6mm, 전체 features와 intentional-overlap / Designed mounting insertion 주석은 보존했다.
- 0°/90°/180° 절대 자세를 재평가하고 각 자세에서 plate world가 원본과 같음을 matrix로 확인했다.

관통 비교:

| angle | 원본 Common | 후보 raw 결과 |
|---:|---:|---|
| 0° | 964.6170736148283 mm³ | no-penetration |
| 90° | 964.6170736148283 mm³ | no-penetration |
| 180° | 964.6170736148283 mm³ | no-penetration |

후보 row의 commonVolume 필드는 **미보고(null/undefined)**다. 기존 inspector가 분리된 bounds로 Boolean Common 계산을 생략한 no-penetration 결과이며, 이를 숫자로 측정한0mm³로 바꾸어 보고하지 않는다. 단일 후보를 실제 검사한 결과이며 연속 경로·모든 부품 pair·하중/체결 적합성이나 최적 후보 탐색을 수행한 것이 아니다. 기존 insertion 의도는 자동 해제하지 않았다. 이 단계의 완료 판정은 안전한 재배치 명령이며 간섭 개선 설계의 확정 승인이 아니다.

## 집중 검증

- 새 placement + 기존 Assembly/Lifecycle + SimReady + Agent Native Preview gate: **24 tests 통과**.
- 실제 placement 브라우저: **13 checks 통과**. 정책 필수 선택, Preview/Cancel 불변, Rest/anchor 표시, intent 확인 전 Apply 거부, ToolSession과 native 일치, Apply1회 History, Undo/Redo, 파일 reopen을 검사했다.
- 기존 Assembly Lifecycle 대표 브라우저: **26 checks 통과**.
- 제품 build/TypeScript 통과. 대형 Vite chunk 경고는 남아 있다.
- incoming Fixed/비영각 Revolute, nonzero outgoing Revolute, leaf 및 여러 단계 subtree, 두 정책, locks/invalid/stale/no-op, 같은 UI/MCP command와 preview를 검사했다.
- 기존 테스트 파일이 같은 생성 fixture를 병렬로 읽고 쓰는 transient JSON 오류가 한 번 발생해 집중 Node 검사는 `--test-concurrency=1`로 실행했다. 제품 serializer 오류로 간주하지 않았다.
- 전체 Suite·전체 브라우저 감사·물리 시뮬레이션·실제 LLM 호출은 수행하지 않았다. GLB 디코딩/Renderer 자원 코드도 변경하지 않았다.

## 명시적 범위 / 다음 단계

강체 Fixed/Revolute 트리와 독립 BRep/Editable Mesh의 unit scale만 지원한다. Grounded/root 이동은 기존 별도 절차를 사용한다. procedural/datum, scale/shear, closed loop, physical attachment solver, batch placement, geometry 재생성 의존성은 이 최소 명령의 범위 밖이다.

기존 MCP `cad.propose` → ToolSession은 새 tool을 같은 registry에서 검증하며 native Review에서 사용자 Apply를 기다린다. 자연어 간섭 Agent의 작은 ordinary catalog 및 Phase1A의 보존 gate는 이번에 자동 확대하지 않았다. 다음 후보 탐색 단계에서는 명시적 target pose/policy와 허용되는 Rest 변경 집합을 그 Agent의 scope/보존 계약에 연결한 뒤 각 후보의 Motion 결과를 비교해야 한다. 단순히 새 tool을 전체 자연어 간섭 요청에 무제한 노출하지 않았다.

## 수정·재사용 파일

- `packages/cad-document/src/Assembly.ts`, `index.ts`: rigid target pose/정책 타입, 기존 저장 구조 유지.
- `packages/cad-commands/src/commands.ts`, `validator.ts`: canonical placement 명령1개.
- `state/assemblyCommands.ts`, `commandBus.ts`: 기존 evaluator/rebind와 원자적 검증.
- `state/documentPlans.ts`, `ui/CommandReview.tsx`: Preview report와 사용자 intent acknowledgement.
- `properties/AssemblyPartPlacementPanel.tsx`, CSS, `AssemblyPanel.tsx`: 일반 CAD Inspector 및 기존 ghost overlay.
- `copilot/cadToolContract.ts`, `assemblyTools.ts`: tool1개, 선택/잠금/Native 계약 재사용.
- `tests/assemblyPlacement.test.ts`, `.browser.*`, 기존 browser runner의 해당 page 등록.
