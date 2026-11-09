# Assembly B2.5 검증 — 2026-10-30

## 결론

제한된 B2.5 범위를 구현하고 대표 브라우저 검증을 통과했다. 기존 BRep 측정과 Joint 운동학을 유지하면서 구조적 상대운동, 기하 판정, 사용자 의도를 분리한다. 범용 충돌·물리·자동 수정은 구현하지 않았다.

## 이번 세션 실행 결과

| 검사 | 결과 | 근거 |
|---|---|---|
| 집중 단위·통합 | 30/30, 실패·skip 0, 약4.03초 | output/verification/assembly-b25/focused.log |
| 신규 triage tests | 위 30개에 5개 포함 | apps/web/tests/interferenceTriage.test.ts |
| 대표 Edge 브라우저 | 31/31 | output/verification/assembly-b25/browser-report.json |
| Web TypeScript 검사 | exit 0, 진단 없음 | output/verification/assembly-b25/types.log |
| 전체 unit / workspace build / 전체 browser audit | 미실행 | 요청된 예산 준수 |

명령 (apps/web에서):
- pnpm exec tsx --test tests/interferenceTriage.test.ts tests/assemblyMotion.test.ts tests/assembly.test.ts tests/assemblyLifecycle.test.ts tests/cadMcpServer.test.ts
- pnpm exec tsc --noEmit -p tsconfig.json
- node scripts/browserChecks.mjs --page=interferenceTriage

최종 브라우저는 새 HTML에서 기존 Assembly A + B2 native UI 시나리오를 재사용하고 주석 시나리오만 추가한다. B1 lifecycle은 이번 집중 단위·통합 검사에 포함됐으며 B1 브라우저 전체는 재실행하지 않았다. 이전 전체 제품 감사 결과를 이번 성공으로 계산하지 않는다.

## 실제 기하 결과

| 사례 | 관측값 | 해석 |
|---|---|---|
| 실제 거치대 support / plate, 0/90/180° | 각 964.6170736148 mm³ (비교 허용차1e-5) | 동일 driver subtree → 구조적 불변 penetration |
| 브라우저 plate / box 장애물 | 0/180° 각200.00000000000006 mm³, 90° AABB 미교차 | 운동 의존 penetration / 검사한90° 미검출 |
| 큰 장애물이 plate를 포함, 0/360° | 체적이1e-7 이내 동일 | 동일한 값이어도 cross-group → 운동 의존 유지 |
| base / shaft 등 기존 접촉 | 기존 B2 contact 유지 | 양의 체적 관통·unknown과 구분 |
| synthetic unknown + explicit exception | unverified | exception으로 성공/clear 처리하지 않음 |

수치는 기존 OpenCascade Common과 기존 tolerance 정책에서 얻었다. AABB 미교차 row는 측정하지 않은 체적을 0으로 생성하지 않는다.

이번 대표 브라우저의 두 부품/세 샘플 MCP report: 약202.1ms, kernel calls6, AABB filtered1, candidates2, worker WASM capacity104,857,600 bytes. 이는 작은 warm 실행 관측값이며 cold startup / 최대 메모리 / 대형 조립체 성능 보장이 아니다.

## 주석·상태 검증

- 네 intent 모두 raw penetration을 유지한다.
- intentional-overlap Preview/Cancel/Apply 및 제거를 실제 UI에서 수행했다.
- UI 주석 변경·제거 전후 raw row의 angle / status / Common 체적 / 구조 분류가 동일하다.
- 단위 검사에서는 metadata Preview/Apply/Undo/Redo/Remove 전후 kernel submittedTasks가 정확히 동일했다.
- geometry context 전체가 주석 변경 후 동일하다. 원본 Joint 각도·형상 자동 수정 없음.
- v63 serialize / deserialize, 실제 native openDocumentFile 재로드에서 설명 보존.
- 마지막 주석 제거 후 기존 Assembly v62 출력. v62에 metadata를 억지 삽입한 파일 거부.
- missing pair와 과도한 note는 원자적으로 거부.
- 기존 B2 read-only MCP/UI parity, 실제 Worker 취소, 문서 generation 변경 후 결과/preview 폐기 포함.
- metadata read는 기존 assembly.inspect의 page로 확인했다.

## 최초 브라우저 실패와 수정

첫 시도는 기존 B2 검사들을 통과한 뒤 새 시나리오의 7-part 문자열을 입력하다 `Invalid test text`로 종료했다. 기존 물리 입력 도우미는 일반 페이지의 한 번 입력을64자로 제한한다. 제품 CAD 결함이 아니라 테스트 fixture와 입력 도우미 계약 불일치였다.

테스트 scope를 stand-support / stand-plate / motion-obstacle / stand-base / stand-shaft의 대표5개(64자)로 줄였다. 입력 제한, assertion, 실제 기하 기능은 완화하거나 삭제하지 않았다. 이후 한 번의 재실행에서31개 모두 통과했다. 현재 미해결 신규 실패는 없다.

정렬 변경으로 기존 B2 DOM 순서는 우선순위 순이 된다. 각도별 결과 동등성 검사는 data-motion-angle로 비교하도록 조정했고, 새 검사는 실제 DOM triage 우선순위를 별도로 확인한다. Preview 버튼은 원래 raw row index를 사용한다.

## 산출물과 제한

- 설계: [ASSEMBLY-B25](../architecture/ASSEMBLY-B25.md)
- 스크린샷: output/verification/assembly-b25/interference-triage.png (주석 편집 화면), assembly-motion-180.png (기존 pose/highlight)
- 주석 파일: output/verification/assembly-b25/annotated-laptop.webcad.json
- 기계 판독 요약: [ASSEMBLY-B25.json](ASSEMBLY-B25.json)

기존 B2 제한 유지: 한 Revolute driver, 고정된 다른 Joint 각도, rigid tree, unit scale, independent closed BRep, 최대8 parts /13 samples /128 rows /160 kernel calls /30s 전체 /5s task. 기존 Sculpt 예산과 Mesh/열린 Shell 미지원 정책은 변경하지 않았다.

같은 driver 내 상대변환 불변은 형상 간섭이 올바른 설계라는 뜻이 아니다. intentional-overlap은 사용자 주석일 뿐 물리적 적합성 승인도 아니다. 주석은 object pair에 속하며 형상이나 연결 의미가 바뀌어도 자동 재추론하지 않는다. 결과는 이산 샘플에 한정된다.

전체 제품의 이전 미해결 항목 및 architecture 문서 링크 부채는 이번 종료 판단에서 별도 유지한다. 후속 B3는 이 제한된 B2.5 기반에서 진행할 수 있으나 연속 충돌·접촉 물리·자동 형상 수정의 준비 완료를 의미하지 않는다.
