# Assembly B2.5 — Interference Triage & Design Intent

검증일: 2026-10-30. 범위: 기존 B2 이산 강체 간섭 결과의 구조적 분류와 사용자 의도 주석.

## 재사용 및 통합 지점

- `apps/web/src/state/assemblyMotion.ts`: 기존 B2 preflight, AABB, invariant cache, inspectSolid / measureSolidDistance / Boolean Common, Worker 취소·예산·stale 검사를 유지한다.
- `assemblyCommands.ts`: 기존 validateAssembly / assertAssemblyPose / evaluateAssembly / 절대 Joint 변환을 재사용한다. 새 Assembly Solver나 기하 커널은 없다.
- `AssemblyMotionPanel.tsx`, `assemblyPreview.ts`, 기존 CadViewport: 결과 선택 시 기존 분리된 pose preview / pair highlight를 사용한다.
- `documentPlans.ts`, `dispatchCadCommand.ts`, CommandBus, history, documentFile: 주석 변경도 기존 Review/Apply/Cancel 및 Undo/Redo 경로를 통과한다.
- `copilot/assemblyTools.ts`, `cadToolContract.ts`: 기존 read-only 도구를 확장한다. AI 모델 호출, 자동 수정은 없다.

## 구조적 상대운동 판정

검사 전에 기존 코드로 Joint tree / unit-scale rigid parts / 저장된 world pose를 검증한다. 기존 B2의 driver subtree 탐색을 `drivenAssemblyParts`로 추출해 분류와 캐시가 같은 증거를 사용한다.

선택된 Revolute driver의 child 이하를 M, 나머지를 S라 하자. 다른 Joint 각도가 고정된 조건에서:
- 둘 다 M 또는 둘 다 S: 상대 강체 변환 불변. `relativeMotion: invariant`.
- 하나만 M: driver 각도에 의존. `relativeMotion: motion-dependent`.

M 내부의 모든 부품은 동일한 driver 운동을 받으므로 두 world frame 사이에서 그 운동이 상쇄된다. 이 판정은 선택된 driver에만 해당하며, 다른 Joint를 움직였을 때까지 불변임을 뜻하지 않는다. 시작·끝 측정 체적이 같아도 cross-group pair를 불변으로 판정하지 않는다.

이 관계는 기하 판정과 독립이다. unsupported/unknown에 상대운동 정보가 있어도 검증된 관통이나 clearance가 되지 않는다. 구조 증거가 없는 과거 penetration row는 triage에서 unverified로 남긴다.

## 결과와 설명

새 `state/interferenceTriage.ts`는 raw report를 변경하지 않고 파생 배열만 정렬한다.

1. motion-dependent-penetration
2. invariant-penetration
3. contact
4. no-penetration
5. unverified (unknown, unsupported, 구조 증거 없는 penetration)

정렬 이후에도 Preview 버튼은 원래 row index와 pair를 사용한다. 원래 status / baseStatus / Common 체적 / 거리 / tolerance / B2 explicit exception은 보존한다. 한국어 규칙 설명은 부품명, 수치, 구조적 관계, 사용자 의도와 불일치를 표시한다. 샘플 사이의 미검사 각도를 보증하지 않는다.

Contact와 미검출은 기존 B2 및 measureSolidDistance의 판정을 그대로 사용한다. 공차 이하의 불확정 체적을 contact로 임의 변환하지 않는다.

## 사용자 의도 메타데이터

새 `packages/cad-document/src/InterferenceIntent.ts`:

`CadDocument.interferenceIntents?: Record<pairKey, {pair:[idA,idB],intent,note}>`

- pair는 사전순 정렬한 두 object ID. key는 JSON.stringify(pair).
- intent: intended-contact / intentional-overlap / forbidden-interference / undecided.
- note: 최대 1,000자, 최대 128쌍. 서로 다른 기존 객체만 참조한다.
- 주석과 연결된 객체를 삭제하려면 먼저 해당 주석을 제거해야 한다. 임의의 참조 재연결이나 의도 자동 상속은 없다.
- B2 request.exceptions와 별도다. intentional-overlap은 exception을 만들지 않으며 원래 penetration을 계속 표시한다.

새 단일 command `assembly-pair-intent`의 intent=null은 삭제이다. 기존 validator와 detached transaction에서 검증한다. Handler는 metadata와 revision만 갱신한다. 이 command에 한해 geometry regeneration 및 커널 준비 검사를 생략한다. 형상/Transform/Joint를 수정할 수 있는 경로가 아니다.

UI의 `InterferenceIntentEditor`는 선택 pair의 intent / 설명을 Review → Apply 또는 Cancel한다. 결과 수치와 의도는 별도로 표시한다.

## 캐시 및 stale

UI는 검사 시작 시 revision과 interferenceIntents를 제외한 정확한 직렬화 context를 보관한다. 주석 편집·Undo/Redo로 이 context가 변하지 않으면 raw rows, 측정 시간·통계는 유지하고 report version을 현재 publication으로 갱신한다. 주석만 바꿀 때 새 커널 계산을 요청하지 않는다.

기하/Joint/객체명 등 context가 바뀌면 기존 cancel/discard 동작을 사용한다. 다른 입력 범위·공차·exception 변경도 결과를 무효화한다. 이 비교는 hash 추정이 아닌 전체 JSON 비교이며 큰 문서에서는 CPU 비용이 있을 수 있다. 새로운 대형 모델 성능 측정은 이번 범위에서 하지 않았다.

MCP ToolSession의 엄격한 document generation 검증은 유지한다. UI의 동일 context 결과 재사용으로 MCP 세션의 stale 권한을 완화하지 않는다.

## 저장 및 호환성

- 주석 property가 존재하면 파일 version 63. 기존 v62 Assembly와 v1..v61 로딩 유지.
- v62 이하 파일에 주석을 숨겨 넣으면 명시적으로 거부한다.
- 마지막 주석 제거 시 property를 삭제한다. 다른 최신 기능이 없는 기존 Assembly는 다시 v62로 저장한다.
- v63을 모르는 과거 앱은 v63 파일을 열 수 없다. 하위 호환 파일이 필요하면 주석을 명시적으로 제거해야 한다.
- 원본 laptop 프로젝트와 기존 v62 fixture는 수정하지 않았다. 새 annotated-laptop.webcad.json은 별도 파생 검증 파일이다.
- 결과 report 자체는 저장하지 않는다. 주석만 저장하며, 형상 변경 시 재검사가 필요하다.

## MCP

- `assembly.motion.inspect`: 같은 B2 read-only 계산, raw rows에 구조적 `relativeMotion` 추가.
- `assembly.inspect`: `designIntents` page 반환. intentOffset 기본0, intentLimit 기본8/최대16, total / nextOffset 포함.
- 새 write 도구, 자동 Apply 또는 주석 생성 AI는 추가하지 않았다. 이번 단계의 주석 편집 UI는 기존 검토 명령 경로를 사용한다.

## 변경 파일

새 파일: InterferenceIntent.ts, interferenceTriage.ts, InterferenceIntentEditor.tsx, interferenceTriage.test.ts, interferenceTriage.browser.html.

통합 변경: CadDocument.ts / index.ts / serialization.ts; cad-commands commands.ts / validator.ts; assemblyMotion.ts / assemblyCommands.ts / commandBus.ts / dispatchCadCommand.ts / documentPlans.ts / history.ts / documentFile.ts; AssemblyMotionPanel.tsx; copilot assemblyTools.ts / cadToolContract.ts; tests/helpers/documentHarness.ts / assembly.browser.tsx; scripts/browserChecks.mjs.

검증 및 미실행 범위는 [검증 보고](../verification/ASSEMBLY-B25.md)에 기록한다.
