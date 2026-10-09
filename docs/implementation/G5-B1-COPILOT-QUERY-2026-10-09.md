# G5-B1 — Copilot의 명시적 local Query

2026-10-09. [중간 저장](G5-B1-QUERY-CHECKPOINT-2026-10-09.md), 커밋 `df20323`에서 이어받아 **G5-B1 구현·전체 검수를 완료했다.** B2 편집 명령 확대와 실제 LLM 공급자 연결은 포함하지 않는다.

## Before → 발견한 문제

공통 `queryCadDocument`는 실측과 저장 관계를 읽을 수 있었지만 Copilot에는 대상을 명시적으로 읽는 UI가 없었다. 중간 구현은 선택 읽기를 연결했으나 공통 편집 selection이 잠금·숨김 객체를 제외해 해당 객체의 제한을 읽을 수 없었다. downstream 객체 탐색도 source 탐색과 같은 버튼 명칭을 사용했다.

브라우저 회귀에서 문서 수정 직후 재조회가 `The document changed`로 거부되는 경합을 재현했다. 읽기 세션이 마지막 React render의 version을 캡처해 이미 게시된 수정과 새 Query의 version을 다르게 취급했다. native click capture에서 문서 변경 알림을 먼저 게시하는 결정적 fixture로 수정 전 실패를 확인했다.

## 변경과 공유 경계

- 선택 읽기와 별도 **Read target**을 제공한다. Find read target은 이름/참조로 검색하고 최대 50개 선택지를 표시한다. 잠금·숨김 객체를 읽어도 캔버스의 편집 selection이나 잠금을 바꾸지 않는다. Object/Layer 진단 ID는 상세 표시로 둔다.
- `copilotQuery.ts`는 공통 Query를 소비하는 bounded DTO다. 최대 50개 대상, 64 KiB UTF-8 결과, 30초 deadline, 20개 source/affected 목록과 10개 solve group을 반환하며 전체 수와 잘린 표시를 알린다. 원본 raster bytes·feature params·전체 graph를 결과나 gateway로 보내지 않는다. ID는 자르지 않는다.
- `useCopilotQuery.ts`는 App 소유 read session이다. 요청 순간의 **authoritative documentVersion**을 캡처하고 문서/선택/explicit target 변경·Cancel에 이전 reader를 폐기한다. activity 이동은 정상 결과를 보존하며 늦은 응답은 새 결과를 덮지 못한다.
- `CopilotQueryPanel.tsx`는 단위/측정 출처, stored source, potentially affected objects, constraint 수/DOF/잔차, 제한·오류/복구를 표시한다. 영향 객체는 Inspect affected object, 원본은 Inspect source로 구분한다. 선택할 수 없는 객체는 제한 이유와 직접 read target을 쓰는 방법을 제공한다.
- Open Layers → Unlock → 같은 대상 재조회, Inspect object/source → Model tree/Properties, Edit Sketch → 기존 editor로 연결한다. 편집 인계는 앞선 command tool의 transient state를 정리한다. 긴 결과는 기존 explorer 내부 scroll을 사용하고 기본 패널 스타일과 명칭을 유지한다.

`documentQuery.ts`는 선택 중복 제거·AbortSignal/한도·layer 제한 설명·feature output index를 추가하고 raster bytes를 snapshot에서 제외했다. 실측·관계 계산은 기존 엔진을 사용한다. 저장 schema/v14, Plan/Apply allowlist, provider 요청 payload는 바꾸지 않았다. Read 결과를 LLM으로 전송하는 설명 endpoint는 아직 없다.

## 실제 workflow와 테스트 증거

새 [browser page](../../apps/web/tests/copilotQuery.browser.tsx)를 [전체 runner](../../apps/web/scripts/browserChecks.mjs)에 등록했다. 실제 React·OCCT Worker·CDP pointer로 **35 checks**를 수행했다. worker transport에서 한 cold inspect 요청만 보류하는 fixture를 사용하며 취소 후에는 실제 Worker를 다시 실행한다. Gateway는 기존 Plan/Apply 회귀에서만 mock 응답을 사용한다.

검증한 흐름:

- `Empty selection 안내 → Model tree 선택 → Read selection → 50 mm 실측/치수·작도 영향 → dimension 읽기 → Inspect source → 원본 선택`.
- `Sketch source 읽기 → 4 constraints/DOF 확인 → owning Sketch로 편집 인계 → Finish → locked target 읽기 → Open Layers → Unlock → 같은 target 재조회`.
- `Construction 정의/Live source → missing reference·복구 → unsupported nonuniform circle 오류 → 클릭 경계에서 원본 수정 → authoritative version으로 재조회`.
- `cold Worker read → Cancel/선택 변경/같은 document generation 변경/explicit target 변경 → 새 read → 실제 늦은 Worker 응답 무시`.
- `native 다중 선택 3개 → 긴 결과 내부 스크롤 → 기존 gateway Plan/Apply의 실제 pointer hit-test → 한 Undo로 기준선 복원`. Query 자체는 network 0이며 기존 Plan 요청만 1회 전송했다. unhandled rejection 0을 검사했다.

[Node Query 검사](../../apps/web/tests/copilotQuery.test.ts) **8개**는 독립 수치 oracle(원 2πr/πr², box 10×6×8), sketch 관계·단위·잠금, 대상/결과 bounds, raster payload 미접근, missing/unsupported 오류, Cancel/deadline/late 응답, context 변경을 검사한다. 문서 JSON/past/future가 불변이며 read 뒤 Undo future가 유지된다. v14 save/reload 후 object 측정/관계와 serialization이 같고 Undo/Redo를 보존한다.

최종 전체 Node **651 tests / 54 suites / fail·skip 0**, browser **39 workflows / 834 checks**가 통과했다. `tsc -b`, architecture/import·문서 링크 **318 modules**, workspace `pnpm build`도 통과했다. [마감 검증 요약](../verification/G5-B1-CLOSEOUT-2026-10-09.json)에 명령·로그·이전 실패와 지원 경계를 기록한다. 원시 로그는 로컬 생성 파일로 Git에서 제외한다. 중간 저장의 집중 15개와 A3의 643 Node / 38 browser·799 checks는 이전 기록이다.

## 측정과 남은 제한

집중 browser의 동일 7객체 문서에서 3개 대상을 9회 warm read한 p95는 **1.1 ms**, 전체 suite의 같은 표본은 **0.7 ms**였다. UI pointer/렌더 지연을 제외한 local Query 표본이며 Edge/SwiftShader·warm OCCT cache 조건이다. 실제 provider·큰 문서·heap/VRAM benchmark나 최적화 전후 비교는 아니다. 전체 회귀와 동시에 실행한 별도 표본에서는 p95 32 ms가 나왔으므로 짧은 표본을 실무 성능 보장으로 사용하지 않는다. Main 1,053.95 kB / viewport 618.81 kB의 기존 >500 kB 경고는 유지된다.

Cancel/deadline은 reader 대기와 결과 게시를 중단한다. 다른 사용자가 공유하는 Worker/cache 작업은 강제 종료하지 않는다. synchronous snapshot/graph 계산에는 hard CPU deadline이 없으며 전체 문서 크기에 비례하는 계산·메모리 비용이 남는다.

Query 오류 요약은 현재 immediate source 누락을 감지한다. 더 깊은 upstream 누락·변수/binding 오류의 대상별 진단은 추가 과제다. 저장된 관계를 설명하며 좌표를 보고 설계 의도를 추론하지 않는다. 실제 LLM 공급자·서버·인증, B2 편집 command, G6 외부 연결은 후속 범위다.
