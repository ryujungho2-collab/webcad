# AI Design Agent Phase 1B-1 — 검증 보고 (2026-10-31)

실제 qwen3-coder-32k 모델의 조회 → 유한 후보 제안 → detached Native 평가 → 실제 결과에 근거한 제한된 비교 → Native Preview를 연결했다. **설계 개선은 확인되지 않았다. Apply하지 않았고 원본·실행 문서·History를 보존했다.**

수정 파일은 apps/web/server/localCopilot.ts, server/assemblySearchModel.ts, src/copilot/assemblyCandidateSearch.ts, src/properties/AssemblyCandidateSearchPanel.tsx, properties/AssemblyPanel.tsx, scripts/browserChecks.mjs 및 집중 테스트 두 파일이다. 기존 Ollama Gateway와 context guard, captured CadToolSession, bounded cad.inspect/modelReadEvidence, assembly.part.place → prepareCadCommand → 기존 CommandBus, 절대 Assembly evaluator/motionPose, assembly.motion.inspect, native previewCadCommand/intent acknowledgement/applyCadPlan과 CadViewport ghost를 재사용했다. 새 MCP 편집 도구·CommandBus·Assembly Graph·Solver·Kernel·Physics Engine을 추가하지 않았다. GLB 디코딩·Renderer 자원 관리 코드는 수정하지 않았다.

실험은 기존 v63 거치대의 input-copy.webcad.json 하나를 사용했다. 새 synthetic fixture는 만들지 않았다. 실행 중 문서는 메모리의 복사본이고, 검토 결과 파일은 별도의 detached Preview 직렬화다.

실제 모델과 조회 기록:

| 단계 | prompt tokens | output tokens | Gateway 경과 ms | 모델 요청 |
|---|---:|---:|---:|---|
| 1 | 908 | 63 | 1315.2 | assembly.inspect |
| 2 | 1383 | 65 | 1160.8 | cad.inspect |
| 3 | 1694 | 101 | 1800.9 | assembly.motion.inspect |
| 4 | 1961 | 162 | 2901.4 | 후보 제안 |
| 5 | 3170 | 119 | 2149.6 | Native 결과 비교 |

완료 실행은 실제 chat 5회, 입력 9116 / 출력 510 tokens다. 전부 done_reason=stop이며 num_ctx=16384, num_predict=1024, truncate=false다. 최대 실제 입력은 3170 tokens / 보수적인 최대 UTF-8 입력 10549 bytes다. runtime.json의 Ollama 0.40.13 /api/ps는 context_length=16384, 모델 digest eeeb44fe74ffdad8bbf5dded1307b5d023c09e50bd01b9a5d25e10f8952d278d를 보고했다. 잘린 출력이나 context shift를 사용해 성공을 판정하지 않았다.

모델이 실제로 요청한 read는 assembly.inspect(intentOffset=0,intentLimit=16), cad.inspect(stand-support,stand-plate), assembly.motion.inspect(bearing,0..180,90도 간격,대상 두 부품,exceptions=[],tolerance=1e-6)다. 모델에는 한 단계당 필요한 read 도구 하나만 제공하며, 성공한 조회와 bounded 요약만 다음 입력으로 전달했다. GLB 원본·전체 노드 JSON은 전달하지 않았다. 모델이 본 Motion 요약은 raw Common 체적과 의도 주석을 구분한다.

Native evaluator의 4-part/6-pair 검사와 하네스의 상위 3개 Preview 재검사는 모델의 read 호출로 세지 않았다. live.json의 reads, events(actor=model/model-read/native-evaluator), modelCalls(실제 HTTP body/응답/토큰), previews를 구분해 저장했다. 브라우저 검사는 이 실제 실행 결과를 재생하며 **새 모델 호출은 0회**다. Native Preview 재검사는 브라우저의 실제 Worker에서 수행했다.

첫 시도는 read 3회 후 모델이 0 이동을 반복 제안해 후보 평가 전에 실패했다. 실제 chat 6회/전체 11회이며 first-attempt-live.json에 그대로 보존했다. 성공 좌표를 주입하지 않고, 0이 제외된 사전 유한 격자로 응답 schema를 제한했다. 현재 반복 차단은 rationale과 후보 순서가 바뀌어도 동일한 거부 이동 집합을 재시도하지 않는다. 이 수정은 단위 테스트로 확인했으며, 실패했던 첫 시도가 수정 후에 실제 재실행됐다고 주장하지 않는다.

탐색의 사전 경계는 각 축 ±15 mm, 총 이동량 ≤20 mm, baseline 포함 ≤6개, 모델 chat ≤8회, 총 120초, 통합 요청 ≤120회, 입력 ≤8 MiB다. 모델은 축별 ±6/±12 mm로 구성된 12개 유한 offset 중 최대 5개를 선택하고 그 안에서 범위를 제안한다. 알려진 Z −10 mm 좌표는 이 격자와 모델 입력에 없다. 기존 B2 per-run 한계(8 parts,13 samples,128 rows,160 requests,30초,task 5초,48k result,256 MiB WASM)는 유지했다. 실제 각 run은 4 parts/3 samples/18 rows다. Native command validation에서 관측한 submittedTasks 증가도 통합 카운트에 포함한다. 이 카운트는 캐시를 포함한 보수적 검사 요청 수이며 물리적인 OCC 내부 호출 횟수나 메모리 수치가 아니다.

후보 결과 — 모든 회전/scale은 원본 유지, 모든 하위 부품 World Pose 유지:

| 후보 | Δ XYZ mm | 목표 World XYZ mm | 이동 mm | 0° Common mm³ | 90° Common mm³ | 180° Common mm³ | 하드 제약 / 완료 | Native 후보 ms |
|---|---|---|---:|---:|---:|---:|---|---:|
| c0 | [0, 0, 0] | [25, 6, 26] | 0.000000 | 964.617074 | 964.617074 | 964.617074 | true/true | 223.3 |
| c1 | [-12, 0, 0] | [13, 6, 26] | 12.000000 | 964.617074 | 964.617074 | 964.617074 | true/true | 182.6 |
| c2 | [-6, 0, 0] | [19, 6, 26] | 6.000000 | 964.617074 | 964.617074 | 964.617074 | true/true | 163.9 |
| c3 | [6, 0, 0] | [31, 6, 26] | 6.000000 | 964.617074 | 964.617074 | 964.617074 | true/true | 164.7 |
| c4 | [12, 0, 0] | [37, 6, 26] | 12.000000 | 964.617074 | 964.617074 | 964.617074 | true/true | 152.5 |
| c5 | [0, -12, 0] | [25, -6, 26] | 12.000000 | 964.617074 | 964.617074 | 964.617074 | true/true | 157.3 |

baseline의 raw Common은 964.6170736148283 mm³다. 후보의 약 1e-12 수준 차이는 tolerance 아래이므로 관통 감소로 인정하지 않았다. 0°는 BRep pair evaluation이고 90°/180°는 기존 Native evaluator가 증명한 상대 운동 불변성에 따른 reuse다. 6개 후보에 108개 행, 18개 BRep pair evaluation 행, 72개 reuse 행을 기록했다. 서로 다른 각도마다 독립 Boolean을 실행했다고 보고하지 않는다. AABB 분리는 no-penetration / 체적 미보고로 유지한다. unknown/unsupported/partial은 불완전 상태로 남기고 비교 선택 대상에서 제외한다.

전체 탐색 13366.0 ms 중 Gateway 모델 단계 합계 9327.9 ms, 결정적 Native 후보 평가 합계 1044.4 ms다. 모델이 요청한 초기 read 및 통신/초기화는 별도이며 이 합계에 겹쳐 더하지 않았다. 통합 검사 요청은 82/120이다. 후보별 Native 경과와 Motion stats는 summary.json에 있다. 사용자 Preview/최종 Apply 직전 fresh revalidation은 검색 이후 별도 bounded Motion run이며 검색 카운트와 혼합하지 않는다.

명령과 수학적 보존:

각 후보는 assembly.part.place(objectId=stand-support,targetWorldPose,descendantPolicy=preserve-descendant-world) 하나로 표현된다. 부모 incoming Joint Rest는 Bnew=inverse(P×A)×Ctarget이며, 현재 angle을 포함한 A를 사용한다. 자식 World Pose를 유지하는 outgoing Joint Rest는 inverse(Ctarget×Achild)×Dold다. 이 fixture에서는 support와 plate의 Rest만 재계산된다. bearing의 parent/child/type/origin/axis/angle/Rest 전체가 원본과 같고 모든 feature/치수/의도 주석, plate/lip/다른 객체 World Pose는 현재 자세 및 0°/90°/180°에서 보존된다. 새 형상이나 위치 명령 우회는 없다.

| 후보 | support Rest XYZ → | plate Rest XYZ → | 변경 plate World Anchor XYZ → |
|---|---|---|---|
| c1 | [-13, -6, 6] | [-107, -39.033218885, 113.986537519] | [13, 11.176380902, 45.318516526] |
| c2 | [-19, -6, 6] | [-101, -39.033218885, 113.986537519] | [19, 11.176380902, 45.318516526] |
| c3 | [-31, -6, 6] | [-89, -39.033218885, 113.986537519] | [31, 11.176380902, 45.318516526] |
| c4 | [-37, -6, 6] | [-83, -39.033218885, 113.986537519] | [37, 11.176380902, 45.318516526] |
| c5 | [-25, 6, 6] | [-95, -50.624328801, 117.092366061] | [25, -0.823619098, 45.318516526] |

기존 support Rest XYZ=[-25,-6,6], plate Rest XYZ=[-95,-39.033218885,113.986537519], plate World Anchor=[25,11.176380902,45.318516526]다. 회전 값의 매우 작은 차이는 부동소수점 재분해 오차다. summary.json에 각 후보의 실제 전체 World/Rest 4×4 column-major Matrix와 Anchor 전후를 저장했다. 예로 c1 World Matrix(아래는 읽기 쉬운 row 표시):

```text
before
[-1, 0, 0, 25]
[0, -0.965925826, 0.258819045, 6]
[0, 0.258819045, 0.965925826, 26]
[0, 0, 0, 1]
after
[-1, 0, 0, 13]
[0, -0.965925826, 0.258819045, 6]
[0, 0.258819045, 0.965925826, 26]
[0, 0, 0, 1]
```

접촉·Anchor·Intent 위험과 비교:

실제 모델의 검토 순서는 c1,c2,c5이며 각각 ANCHOR_CHANGED,INTENT_REVIEW를 근거로 반환했다. schema와 검증은 실제 Native fact code만 허용해 측정하지 않은 체적·거리·설계 타당성을 자유 문장으로 만들 수 없게 했다. 화면 설명은 검증한 코드를 사람이 읽을 문장으로 표시한다. 자유 서술형 기하학적 reasoning 능력을 입증한 것은 아니다.

모델은 c2의 6 mm보다 c1의 12 mm를 먼저 골랐고 Z축을 탐색하지 않았다. 따라서 최적 순위나 충분한 공간 탐색을 입증하지 못했다. UI는 모든 후보의 각도별 체적과 이동량을 함께 표시하고 상위 최대 3개만 Preview 선택한다. 어느 후보도 baseline보다 우월하다고 자동 판정하지 않았다. 현재 결과만으로는 기존 설계를 유지할 이유가 충분하다.

6개 후보 모두 support/turntable은 contact, plate/lip은 contact를 유지했다(이 두 쌍의 Common=0은 실제 BRep 결과다). 다른 주요 쌍의 새 관통이나 기존 접촉 분리는 관측되지 않았다. 그러나 모든 편집 후보는 plate Joint World Anchor를 이동시키므로 체결 가능성은 확인되지 않는다. 기존 intentional-overlap / Designed mounting insertion 주석은 정확히 보존되며 현재 측정도 겹침 상태다. 직접적인 측정 불일치는 없지만 Anchor 변경의 설계 의도는 사용자 재확인이 필요하다.

독립 회귀 기준 Z −10 mm는 AI 후보가 아니다. independent-regression.json에서 target pair는 AABB no-penetration / Common 미보고이고 support/turntable에 **3726.994249476299 mm³의 새 관통**이 검출됐다. TARGET_NOT_DETECTED뿐 아니라 CONTACT_LOSS_RISK,OTHER_PAIR_WORSE,INTENT_MEASUREMENT_MISMATCH가 함께 기록된다. 따라서 목표 쌍 미검출만으로 좋은 설계가 되지 않는다. 이 회귀 좌표·결과는 모델 입력으로 제공하지 않았다.

Native Review와 불변성:

c1/c2/c5의 실제 detached Preview가 각각 성공했다. 선택 시 최신 문서에서 native command validation, 하드 제약, 0/90/180 Motion을 다시 검사한 뒤 기존 Preview plan을 만든다. UI는 변경 전후 Transform, Rest, 이동/보존 하위 객체, 각도별 결과와 Anchor를 표시한다. 후보 변경은 기존 acknowledgement를 제거하고, generation/문서가 바뀌면 결과·ghost·Preview를 폐기한다. 취소는 AbortSignal과 ticket guard로 늦은 결과를 버린다. 실제 Apply 버튼은 intent acknowledgement 후에만 활성화된다. 사용자가 누르면 최신 문서에서 다시 Native 검사하고, 원래 검토한 plan에 대해 기존 큐의 stale/intent 검사를 통과해야만 Apply된다. 이 실험과 새 브라우저 검사는 Apply 버튼을 누르지 않았다.

원본 및 input-copy SHA-256:

```text
d0936d1165146066adb43d96e2ece7a20bd93ddb3eca5d84d3d173eac2fbcd8f
```

sourceUnchanged=true,copyUnchanged=true,documentUnchanged=true,Apply=0,History=0. 원본 파일은 재작성하지 않았다. Preview 파일만 별도 이름으로 저장했다.

집중 검증은 unit.log의 **37/37**(후보/제약/0/no-op/중복/정책/budget/unknown·미보고/잠금 rollback/보존/stale/cancel/반복차단/기존 placement/MCP/Undo·Redo/reload/Phase1A/Gateway/v64), browser-report.json의 **15/15**(실제 모델 결과 재생, Native Worker Preview, 미승인/ack/후보 전환/취소/동일 JSON generation stale, History 불변, React StrictMode), simready-b1-browser.log의 **57/57**, build.log의 production build 성공이다. Browser는 SwiftShader 검사이며 실제 GPU 성능 결과로 보고하지 않는다. 기존 큰 번들 경고는 남아 있다. 전체 unit suite/전체 브라우저 감사는 실행하지 않았다.

다음 최소 개선은 모델의 후보 선택에 3축 coverage를 요구하고, 같은 관통 상태에서 최소 이동량을 먼저 비교하도록 검증 가능한 이유 코드를 확장하는 것이다. 유한 예산과 native fact provenance를 유지해야 한다. 접촉 변화·Anchor·의도 불일치는 관통 감소와 별도 게이트로 계속 보여야 한다. 범용 Solver나 자동 Apply, 연속 충돌 보증, 체결 적합성 판정은 여전히 범위 밖이다.

증거: output/verification/ai-agent-phase-1b1/{live.json,first-attempt-live.json,summary.json,runtime.json,independent-regression.json,browser-report.json,candidate-preview.png,c1-preview.webcad.json,c2-preview.webcad.json,c5-preview.webcad.json,unit.log,build.log}. 실행 하네스 live.mts와 보고 생성기 report.mts도 같은 디렉터리에 보존했다.
