# AI Design Agent Phase 1B-2 — 실제 검증 (2026-10-31)

**탐색·평가 기능 구현은 완료했다. 실제 노트북 거치대의 설계 개선은 확인하지 못했다.** Test A는 NO_PROVEN_IMPROVEMENT / 원본 유지, 별도 합성 Fixture Test B는 IMPROVED_WITH_REVIEW다. 합성 결과를 실제 거치대 설계 성공으로 집계하지 않는다. 어느 경우도 Apply하지 않았으며 원본·입력 복사본·History를 보존했다.

수정·재사용: 기존 server/assemblySearchModel.ts, copilot/assemblyCandidateSearch.ts, properties/AssemblyCandidateSearchPanel.tsx를 수정했다. assemblySearchPolicy.ts는 공유 finite lattice/부품 목록, assemblyCandidateRanking.ts는 기존 Native 결과에 대한 순수 분류·정렬 함수다. 새 Solver/Kernel/Physics Engine/AI framework/CAD 명령은 없다. 기존 Gateway/context guard, captured CadToolSession, cad.inspect, assembly.motion.inspect, assembly.part.place, prepareCadCommand/CommandBus, 절대 Assembly evaluator, B2 invariant reuse, Native Preview/intent acknowledgement/Apply를 그대로 사용한다. GLB decoder·Renderer·자원 관리 코드는 수정하지 않았다.

초기 모델 제안은 정확히 3개이며 X/Y/Z를 각각 포함해야 한다. baseline+초기 3개를 검사한 후 모델이 관측 결과를 보고 남은 0~2개를 배분한다. 최대 6상태를 넘지 않고 초기 상태를 다시 decode/evaluate하지 않는다. ±6/±12 mm의 축방향 finite lattice(12점), 축별 ±15 mm/총 20 mm envelope, no-op/중복/대상/policy/원래 문서 generation·전체 snapshot, source Assembly, 각 placement frame 및 잠금/하드 제약을 검사한다. coverage 실패는 예산 안에서 재제안하며 같은 거부 offset 집합은 rationale/순서가 달라도 차단한다. 실패·취소·예산 소진은 INCOMPLETE/partial이다. deterministic fallback은 구현하거나 사용하지 않았다.

실제 모델 실행은 각 6회, 전체 12회다. 각 실행 최대 8회, num_ctx=16384, num_predict=1024, truncate=false를 유지했고 모든 실제 응답이 stop으로 끝났다. Test A 최대 입력 3653 tokens, Test B 3130 tokens다. 성공 좌표나 B-oracle/C-regression 결과는 모델 입력에 없다. 실제 read는 Assembly→대상 2개 cad.inspect→6개 부품 Motion 순서다. task-scoped 도구는 단계별 1개 read 도구이며 이후 편집 schema는 assembly.part.place만 허용한다. 모델에는 기존 bounded Motion 요약과 검증된 fact/risks 및 bounded Native 순위만 전달했다. 원본 GLB/전체 노드 JSON은 전달하지 않았다.

| Test A 단계 | 실제 요청 | 입력 tokens | 출력 tokens | Gateway ms |
|---|---|---:|---:|---:|
| 1 | assembly.inspect | 924 | 63 | 6003.7 |
| 2 | cad.inspect | 1415 | 65 | 1179.6 |
| 3 | assembly.motion.inspect | 1726 | 117 | 2008.5 |
| 4 | 3축 초기 선택 | 2011 | 147 | 2690.1 |
| 5 | Native 관측 후 추가 선택 | 3089 | 157 | 2894.9 |
| 6 | Native 순위 설명 | 3653 | 124 | 2391.1 |

| Test B 단계 | 실제 요청 | 입력 tokens | 출력 tokens | Gateway ms |
|---|---|---:|---:|---:|
| 1 | assembly.inspect | 884 | 63 | 1438.9 |
| 2 | cad.inspect | 1350 | 65 | 1193.7 |
| 3 | assembly.motion.inspect | 1613 | 118 | 2000.1 |
| 4 | 3축 초기 선택 | 1823 | 143 | 2586.3 |
| 5 | Native 관측 후 추가 선택 | 2705 | 191 | 3205.3 |
| 6 | Native 순위 설명 | 3130 | 99 | 2072.4 |

A.json/B.json은 실제 HTTP 요청/모델 응답/토큰, model-read와 native-evaluator events, 최종 Native ranking, 모델의 별도 explanation, 하네스 Preview를 구분한다. oracle은 모델 전에 실행한 독립 Native precheck이며 실제 AI 선택이 아니다. B-setup-failure.json은 Fixture 준비 단계의 잘못된 필드 가정을 수정하기 전 오류이며 모델 호출 0회다. 실패를 성공 로그에서 삭제하거나 모델 호출로 세지 않았다.

검사는 stand-base, stand-shaft, stand-turntable, stand-support, stand-plate, stand-lip 전체 6개다. 15쌍×0°/90°/180°=45행/상태를 기록한다. 움직이는 4개와 고정된 2개 사이 8쌍도 포함한다. 동일 강체 상대관계인 7쌍은 각도 간 14행을 reuse한다. invariant reuse와 AABB 분리를 독립 Boolean 측정으로 세지 않는다. moving/stationary 행은 motion-dependent이며 각 샘플에서 다시 검사한다. 연속 구간 무충돌은 보증하지 않는다.

전체 검색은 240개 보수적 kernel/request, 120초, 입력 8 MiB, baseline 포함 6상태로 제한한다. 4→6개 부품 확대 때문에 기존 통합 120 요청을 240으로 명시적으로 늘렸으며 per-run B2 한계(8 parts/13 samples/128 rows/160 requests/30초/task 5초/result 48k/WASM 256 MiB)는 변경하지 않았다. source read의 Motion 요청과 command preflight에서 관측한 submittedTasks 증가도 통합 카운트에 포함한다. 이 수치는 캐시를 포함하는 요청 수이며 물리적 OCC 내부 호출 횟수가 아니다. 사용자 Preview/Apply 직전 fresh revalidation은 검색 이후 별도 B2 bounded run이다. budget-partial.json은 실제 Native 요청 한계를 0으로 설정한 실패 회귀로, 요청 0과 INCOMPLETE를 기록한다.

Native 순위는 hardValid/complete/모든 행 supported/명시적 geometry·relations·nonTargetPoses 보존을 먼저 요구한다. 이후 목표 관통의 유의미한 감소, 다른 쌍 신규/기존 관통 악화, 접촉·장착 손실, 이동 거리, Anchor/intent 순으로 비교한다. 감소량·증가량은 max(before tolerance,after tolerance,1e-6)보다 커야 하며 동일 결과의 작은 수치 차이는 이동 거리보다 우선하지 않는다. 이미 관통하던 다른 쌍의 체적 증가도 OTHER_PAIR_WORSE다. AABB Common 미보고는 그대로 undefined이며 숫자 0을 생성하지 않는다.

추천 목록은 목표 개선이 있고 다른 관통 악화 및 접촉/장착 손실이 없는 후보만 포함한다. Native 비교 순서와 추천은 다르다. 위험한 목표 감소 후보가 비교의 앞에 있어도 우월/추천 후보가 아니며, UI에 비교 전용으로 표시한다. 개선안이 없으면 추천 목록은 빈 배열이고 다음 문장을 표시한다: **검사한 후보 범위에서 개선안이 확인되지 않았습니다.** LLM은 Native comparisonIds 순서를 바꿀 수 없고 실제 fact code만 설명할 수 있다. 순서를 바꾸거나 측정하지 않은 사실을 추가하면 validation feedback/실패가 된다. 물리적 체결/제조 적합성은 이 세 상태의 의미에 포함되지 않는다.

Test A — 실제 거치대:

| 후보 | Δ XYZ mm | World XYZ mm | 이동 mm | 0° Common mm³ | 90° Common mm³ | 180° Common mm³ | complete |
|---|---|---|---:|---|---|---|---|
| c0 | [0, 0, 0] | [25, 6, 26] | 0.00 | 964.617074 | 964.617074 | 964.617074 | true |
| c1 | [-12, 0, 0] | [13, 6, 26] | 12.00 | 964.617074 | 964.617074 | 964.617074 | true |
| c2 | [0, -12, 0] | [25, -6, 26] | 12.00 | 964.617074 | 964.617074 | 964.617074 | true |
| c3 | [0, 0, -12] | [25, 6, 14] | 12.00 | 미보고 · no-penetration | 미보고 · no-penetration | 미보고 · no-penetration | true |
| c4 | [0, 0, 6] | [25, 6, 32] | 6.00 | 3726.994245 | 3726.994245 | 3726.994245 | true |
| c5 | [0, 6, 0] | [25, 12, 26] | 6.00 | 964.617074 | 964.617074 | 964.617074 | true |

초기 [-12,0,0],[0,-12,0],[0,0,-12]가 XYZ를 모두 포함했고 추가 [0,0,6],[0,6,0]은 초기 Native 결과 후 모델이 선택했다. X/Y 후보는 원래 964.6170736148283 mm³에서 측정 공차를 넘는 개선이 없었다. 6 mm Y 이동은 같은 측정 결과인 12 mm X/Y보다 우선했다. Z −12는 target pair가 AABB 미검출/체적 미보고지만 support/shaft에 0° **1021.8915847434097 mm³**, support/turntable에 **3726.9942494763 mm³**의 새 관통을 만들었다. 90°/180° shaft/support는 각각 독립 BRep 검사에서 약 1021.891585 mm³다. Z +6은 target Common이 **3726.994245375468 mm³**로 악화되고 turntable/support 접촉도 잃었다.

Native 비교 순서 c3→c5→c1→c2→c4, 설명/검토용 c3,c5,c1, **추천 없음**, 기본 원본 유지다. c3의 비교상 위치를 설계 우월성으로 해석하지 않는다. 6개 모두 유효/complete지만 설계상 우월 후보는 없다. 모델은 Native 순서를 그대로 반환했고 위험 사실과 NO_PROVEN_SUPERIORITY를 설명했다. Anchor 이동과 원본 intentional-overlap / Designed mounting insertion의 의미 재확인은 유지한다. 원본 주석을 수정하지 않는다.

| 항목 | Phase 1B-1 실제 실행 | Phase 1B-2 Test A |
|---|---:|---:|
| 탐색 축 | 2 (X/Y) | 3 (X/Y/Z) |
| 상태 / 유효 후보 | 6 / 5 | 6 / 5 |
| 검사 부품 / 행(상태당) | 4 / 18 | 6 / 45 |
| 모델 호출 | 5 | 6 |
| 입력 / 출력 tokens | 9116 / 510 | 12818 / 673 |
| 통합 보수적 요청 | 82 | 143 |
| 검색 총 ms | 13366.0 | 21933.5 |
| Native 후보 합계 ms | 1044.4 | 1433.7 |
| 같은 체적에서 이동 비교 | 모델이 12 mm 우선 | Native가 6 mm 우선 |
| 개선 없을 때 | 비교 3개, 추천 구분 약함 | NO_PROVEN_IMPROVEMENT / 추천 0 |

이는 서로 다른 후보와 검사 범위의 실제 관측이며 동등 조건 성능 벤치마크가 아니다. 비용 증가는 6개 부품 안전 검사와 추가 모델 단계에 따른다. 자원 최적화 성공이라고 보고하지 않는다.

Test B — 독립 합성 Fixture:

작은 6-box Fixture 하나만 추가했다. support=30×30×20, plate=100×100×4, target baseline Common=1800 mm³이고 다른 4개 부품은 멀리 분리했다. target intent는 명시적 forbidden-interference다. 따라서 이 명시적 원치 않는 target overlap 제거를 장착 접촉 보존 의무로 오인하지 않으며, 물리적 연결을 인증하지도 않는다. Native oracle은 모델 전에 baseline,+X6,+Y6,+Z6,−Z6,−Z12의 6상태만 검사했다. X/Y 불변, +Z 악화, −Z6/−Z12의 미검출을 확인한 B-oracle.json을 독립 저장했고 모델에는 제공하지 않았다.

| 후보 | Δ XYZ mm | World XYZ mm | 이동 mm | 0° Common mm³ | 90° Common mm³ | 180° Common mm³ | complete |
|---|---|---|---:|---|---|---|---|
| c0 | [0, 0, 0] | [0, 0, 0] | 0.00 | 1800.000000 | 1800.000000 | 1800.000000 | true |
| c1 | [-6, 0, 0] | [-6, 0, 0] | 6.00 | 1800.000000 | 1800.000000 | 1800.000000 | true |
| c2 | [0, -6, 0] | [0, -6, 0] | 6.00 | 1800.000000 | 1800.000000 | 1800.000000 | true |
| c3 | [0, 0, -6] | [0, 0, -6] | 6.00 | 미보고 · no-penetration | 미보고 · no-penetration | 미보고 · no-penetration | true |
| c4 | [0, 0, -12] | [0, 0, -12] | 12.00 | 미보고 · no-penetration | 미보고 · no-penetration | 미보고 · no-penetration | true |
| c5 | [0, 6, 0] | [0, 6, 0] | 6.00 | 1800.000000 | 1800.000000 | 1800.000000 | true |

실제 모델은 XYZ 초기 선택에서 −Z6을 찾았고 초기 평가 후 −Z12와 +Y6을 추가했다. Native는 두 clear 후보 중 6 mm를 12 mm보다 우선했다. 추천/설명 순서 c3→c4, **IMPROVED_WITH_REVIEW**다. target AABB 미검출은 Common=0 측정이 아니다. 다른 쌍 악화/기존 contact 손실은 검사된 각도에서 검출되지 않았지만 Joint Anchor·설계 의도·체결 적합성의 사용자 검토는 남는다. Oracle 성공, AI 선택 성공, 실제 노트북 거치대 실패를 분리한다.

Test C — Z −10 mm 독립 회귀:

모델 입력 lattice 밖의 기존 회귀 좌표이며 production model 경로에서는 거부된다. C-regression.json의 6-part Native 결과는 support/plate AABB 미검출/체적 미보고, support/turntable **3726.994249476299 mm³**, 새로 포함한 shaft/support **563.2316836893605 mm³**다. CONTACT_LOSS_RISK,OTHER_PAIR_WORSE,INTENT_MEASUREMENT_MISMATCH를 모두 기록하고 추천 목록에서 제외했다. 다른 쌍의 신규·기존 악화·접촉 손실도 같은 분류 함수를 거친다. 체결 적합성은 미검증이다.

Matrix/제약/Review:

기존 식 Bnew=inverse(P×A)×Ctarget과 outgoing inverse(Ctarget×Achild)×Dold를 유지했다. 지원대 translation만 바뀌고 회전/scale·bearing의 origin/axis/angle/Rest·모든 형상/치수·plate/lip/비대상 World Pose는 보존된다. Rest 재계산은 incoming support/outgoing plate뿐이다. summary.json은 실제 각 후보 World Pose/World Matrix, Rest 전후 Transform과 4×4 Matrix, World Anchor 전후, 전체 Native 결과를 저장한다. AI 숫자 생성으로 Matrix를 만들지 않았다.

후보 선택은 최신 source에서 Native command/6-part Motion/하드 제약을 다시 검사하고 기존 detached Preview를 생성한다. Native Review의 before/after/Rest/Anchor/intent acknowledgement를 유지한다. 선택 변경은 승인 상태를 지우고, 취소/문서 generation 변경은 결과/ghost/plan을 폐기한다. 최종 사용자 Apply 클릭 직전에도 fresh 재검사를 하고 기존 큐의 stale/snapshot/acknowledgement guard를 통과해야 한다. 자동 Apply는 없다.

A와 B 하네스의 Native Preview가 성공했고, 실제 브라우저 Worker에서도 두 상태를 재검사했다. 브라우저는 실제 모델 로그 재생이며 새 모델 호출 0회다. Fixture 전환 하네스는 문서 ID로 CadViewport를 재마운트하고 revision/렌더 완료를 동기화한다. 초기 시각 QA에서 남았던 이전 문서 형상은 하네스에서 수정했으며 Renderer 코드는 변경하지 않았다. 대표 Browser 19/19, 집중 Unit 43/43, production build 성공이다. 부족한 축의 한 번 재제안(7회 bounded unit replay), 반복 거부, no-op/중복/lattice/보존/기존 관통 악화/공차 내 동률/잠금 rollback/stale/cancel/zero budget/Native 순위 강제와 기존 placement/MCP/Undo·Redo/reload/Phase1A/Gateway/SimReady v64를 검증했다. 전체 suite와 전체 Browser audit은 실행하지 않았다. Browser는 SwiftShader이며 실제 GPU 성능으로 보고하지 않는다. 기존 큰 bundle 경고는 남는다.

실행 비용은 A 입력/출력 12818/673 tokens, 모델 17167.8 ms, Native 후보 1433.7 ms, 검색 21933.5 ms, 요청 143/240이다. B는 11505/679 tokens, 모델 12496.8 ms, Native 후보 921.4 ms, 검색 13844.3 ms, 요청 91/240이다. B-oracle의 3402.1 ms/81 요청은 이 모델 탐색 밖의 사전 검증이며 Kernel cache를 데웠으므로 A/B Native 시간을 공정한 성능 비교로 해석하지 않는다.

원본 SHA-256: d0936d1165146066adb43d96e2ece7a20bd93ddb3eca5d84d3d173eac2fbcd8f. originalUnchanged=true. A/B 각각 documentUnchanged=true,copyUnchanged=true,Apply=0,History=0이다. 입력 hash는 A=d0936d1165146066adb43d96e2ece7a20bd93ddb3eca5d84d3d173eac2fbcd8f, B=97c68d363d2d383e6d2fe3cf295bf67248ba0e8c4ca66a22c812a6eab1d9a472. 원본 파일은 재작성하지 않았고, 출력 Preview/검증 파일만 별도로 만들었다.

최소 다음 단계는 기존 유한 예산 안에서 반대 부호의 축 선택 다양성을 검토하고, 실제 체결/접촉 설계 의도를 사용자가 명확히 지정하도록 하는 것이다. 새 일반 Solver나 연속 충돌/제조 적합성 주장, 무승인 Apply로 범위를 넓히지 않는다. 모델 비교는 검증한 fact code 설명에 한정되며 자유 서술형 기하 추론의 정확성을 인증하지 않는다.

증거 위치: output/verification/ai-agent-phase-1b2/{A.json,B.json,B-oracle.json,C-regression.json,budget-partial.json,summary.json,A-input.webcad.json,B-input.webcad.json,A-c3-preview.webcad.json,B-c3-preview.webcad.json,browser-report.json,candidate-preview.png,synthetic-preview.png,unit.log,build.log,live.mts,report.mts}.
