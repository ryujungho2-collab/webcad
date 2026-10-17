# G5-A1 — Gateway 응답과 요청 종료 경계 검수

> **현재 기능 설명:** [Copilot](../features/COPILOT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-06. G5-A 전체가 아닌 첫 작은 검수 묶음이다. 기준선 `291c1c3`의 gateway 생성 제안·공통 Review/Apply를 보존하고 응답/취소 경계만 수정했다. 후속 실행 범위는 [WORK-SLICES](../WORK-SLICES-2026-10-06.md), 현재 전체 검증 수는 [PROJECT-STATE](../../PROJECT-STATE.md)가 소유한다.

## 발견한 문제와 수정

1. fetch가 header를 반환한 뒤 body의 `reader.read()`가 멈추면 controller abort만으로는 요청이 끝나지 않았다. 추가한 deadline 테스트가 실제로 timeout까지 종료되지 않는 실패를 재현했다. fetch와 각 body read를 같은 abort promise와 경쟁시켜 signal을 따르지 않는 transport에서도 종료한다. finally에서 timer/listener를 제거하고 reader를 해제하며, stream cancel 자체가 끝나지 않아도 사용자 취소를 기다리게 하지 않는다. 늦은 header response와 HTTP/media type/크기 때문에 거부한 body도 cancel한다.
2. 공개 CAD validator가 신뢰된 내부 경로용 추가 params를 허용해, gateway의 create-drawing에 sketchId/topology/pattern/sourceObjectId를 넣어도 응답 검증을 통과했다. flat batch의 1–20개 생성 명령만 검사하고 명령/객체 종류별 필드를 제한했다. nested batch·기존 소유권·참조 메타데이터를 거부한다. 잘못된 kind·closed 값·무한 primitive 수치·잘못된 batch label도 거부한다. gateway가 보내는 임의 ghost/HTML은 계속 무시하고 ghost를 검증된 command에서만 만든다.
3. JSON 구문 실패는 raw parser error로 끝났다. malformed JSON 오류에 response 수정과 Plan 재시도 안내를 제공한다. streaming 64 KiB 상한은 문자 수가 아닌 UTF-8 bytes로 계산하며 chunk 경계가 한글 byte 중간에 와도 정상 summary를 복원한다.

수정 위치: [copilotConnection](../../apps/web/src/copilot/copilotConnection.ts). 공통 CAD validator/solver/serialization/command allowlist를 전면 변경하지 않았다. gateway는 finite line/polyline/rectangle/circle/arc 및 기존 solid primitive의 생성 제안만 지원한다.

## 실제 사용자 workflow와 회귀

`Copilot → Gateway 선택 → Prompt → Plan → Review → Apply → Undo → Redo`를 실제 React/Worker와 browser pointer 입력으로 검사했다. transport만 mock이다. unsupported sketch ownership이 들어온 제안은 원본 문서와 prompt를 유지한 채 오류를 보여준다. 응답을 수정해 같은 prompt로 Plan을 재시도하면 detached review가 생성되고 한 Apply/Undo/Redo로 복원된다. response body가 끝나지 않는 경우 Cancel request가 reader를 해제하고 prompt와 문서를 보존한다. 기존 prompt 수정·취소 후 늦은 응답·요청 중 문서 변경 검사도 유지했다.

- [gateway Node](../../apps/web/tests/copilotConnection.test.ts): 기존 3 + 신규 5 = **8 tests**. timeout, abort를 무시하는 transport, 끝나지 않는 cancel promise, late response body 해제, UTF-8 byte cap, rejected body 정리를 포함한다.
- [gateway browser](../../apps/web/tests/copilotGateway.browser.tsx): 기존 8 + 신규 5 = **13 checks**. 기존 runner 등록 유지. 실제 LLM 공급자/server/API key는 연결하지 않았다.
- 전체 실행 명령: `pnpm --filter @agent-webcad/web exec tsc -b`, `pnpm --filter @agent-webcad/web test`, `pnpm --filter @agent-webcad/web check:architecture`, `pnpm --filter @agent-webcad/web test:browser`, `pnpm build`.
- 최종 전체 **618 Node / 54 suites / fail·skip 0**, **35 browser workflows / 734 checks**, 타입·architecture 301 modules/문서 링크·workspace build 통과. 증거: 로컬 `output/g5-a1-*-2026-10-06.log`, 커밋에 보존하는 [검증 요약](../verification/G5-A1-CLOSEOUT-2026-10-06.json). 문서 연결 중 Node architecture 검사가 새 기록 파일의 미생성 링크 1개를 잡았으며 파일 생성 후 전체 Node와 architecture를 다시 실행해 통과했다. 기능 테스트를 약화하지 않았다.

이번 작업은 지연 최적화 benchmark가 아니다. 10 ms 테스트 deadline으로 hang 종료를 검사한 결과를 실서비스 p95 또는 Pro 사용량으로 표시하지 않는다. 기존 main/viewport >500 kB build 경고도 이 묶음의 해결 범위에 포함하지 않는다.

## 다음 묶음과 남은 경계

- **G5-A2**: CopilotPanel의 로컬 draft/connection state는 activity 왕복 시 초기화될 수 있다. off-panel 요청 완료와 selection/workPlane/활성 layer 변경 중 request context를 일관되게 검토·취소하는 정책을 구현·검수한다. API key를 브라우저 저장소에 넣지 않는다.
- **G5-A3**: 중복 Apply/clear 경합, 현재 layer와 gateway가 명시한 layer의 일치, locked target·batch 부분 실패, local rule mode와 동일한 결과 인계 등을 검수하고 전체 G5-A 완료를 판단한다. A1 통과로 이 경로까지 완료됐다고 표시하지 않는다.
- **B3-C1 → C2a → C2b → C3**: 일반 각도 주석의 계산/branch, 두 source 참조·refresh, Trim/Join·저장, UI/출력 순으로 진행한다. [CAD 하위 설계](../product/CAD-BASICS-IMPLEMENTATION-PLAN.md)를 따른다. 이 묶음에서 각도 치수 코드를 구현하지 않았다.

전체 command/graph 자동화 개방, 실제 provider/gateway server, API key 배포, G6 외부 adapter, component variant/PPTX/영상은 미구현 상태를 유지한다.
