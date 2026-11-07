# AUTO-ONTOLOGY-PILOT-01 — Inspector 읽기 전용 파일럿

**완료 — 등록된 스냅샷의 읽기 전용 파일럿.** 합성 Fixture의 실제 Inspector에서 성공 조회, 시간 초과, 문서 변경과 파일 재열기 후 늦은 응답 폐기를 확인했다. 실제 사용자 도면과 다중 문서의 외부 카탈로그 운용은 미검증이다.

기존 Properties → Dependencies → Profile ↔ Extrude 조회에 선택적 외부 확인을 추가했다. native 관계를 즉시 표시하고, 세션 동의 후 **Explain with Auto Ontology**로 별도 확인을 요청한다. 기존 관계 보고서와 일치한 실제 반환 행에서 설명을 만든다. 모델의 자유 서술은 표시하지 않는다.

## 요청과 데이터 정책

`queryProfileExtrudeRelations`와 기존 문서 버전·세션 변경 알림을 재사용한다. 선택 객체에서 정방향 `source_id` 또는 역방향 `target_id` 필터를 생성하고 문서 ID·revision을 함께 지정한다. 공개 API의 `prediction: false`와 스키마 안내를 사용한다. 요청은 문서 기하, 레이블, 전체 문서 또는 기준 답안을 모델에 전달하지 않는다. native 관계 사실은 같은 origin의 서버가 스냅샷과 대조하는 데 사용한다.

서버 설정은 기본 비활성화다. 로컬 Vite 개발 서버와 preview 서버에서 다음 환경 변수를 사용한다.

| 설정 | 의미 |
| --- | --- |
| `CAD_AUTO_ONTOLOGY_URL` | 루프백 Auto Ontology 게이트웨이 origin |
| `CAD_AUTO_ONTOLOGY_API_KEY` | 서버에만 보관하는 API token |
| `CAD_AUTO_ONTOLOGY_SNAPSHOT` | 명시적으로 등록한 스냅샷 JSON 파일의 절대 경로 |
| `CAD_AUTO_ONTOLOGY_ALLOW_PRODUCT_METADATA=1` | `dataClass: product` 등록 허용. 기본값은 허용하지 않음 |

등록 파일은 `dataClass`, `document: {id, revision}`, canonical `relations`를 포함한다. [검증용 합성 등록 파일](../../output/verification/auto-ontology-pilot-01/synthetic-snapshot.json)을 참고한다. `dataClass: synthetic`의 등록은 그 문서·revision과 관계 사실에만 적용된다. 제품 스냅샷은 서버 설정과 세션 동의가 모두 필요하다. 등록되지 않은 문서나 revision은 외부 요청 전에 거부된다. 데이터 변경 시 등록과 외부 카탈로그를 운영자가 함께 갱신해야 한다.

## 응답과 실패 처리

서버는 완료된 SQL 조회에서 나온 행만 받아 문서 ID·revision, 양 끝 ID·방향·live/snapshot·상태·소유·누락 플래그와 행 수를 native 사실과 대조한다. 필드가 빠졌을 때 값을 보충하지 않는다. 검증된 사실만 정해진 형식으로 설명한다. 브라우저는 요청 ID와 문서·세션·revision·generation을 다시 확인한다.

문서 변경·선택 변경·세션 교체·취소는 진행 중 요청을 중단한다. 응답이 늦게 도착해도 현재 Inspector에 적용하지 않는다. 서버와 클라이언트에 시간 한도를 적용하고 실패 시 native 결과를 유지한다. 동의는 현재 문서 세션의 메모리에만 보관되며 파일 재열기 후에는 다시 필요하다. 조회는 CommandBus 편집이나 History 항목을 만들지 않는다.

## 구현과 검증 경로

- [기존 Inspector 연결](../../apps/web/src/properties/DependencyNotice.tsx)과 [외부 확인 UI](../../apps/web/src/properties/AutoOntologyRelationPilot.tsx)
- [공유 요청·응답 검증](../../apps/web/src/ontology/profileExtrudePilot.ts)과 [동일 origin 서버 프록시](../../apps/web/server/autoOntologyPilot.ts)
- [집중 테스트](../../apps/web/tests/autoOntologyPilot.test.ts)와 [실제 브라우저 페이지](../../apps/web/tests/autoOntologyPilot.browser.tsx)

브라우저 `autoOntologyPilot`은 제품 프록시·검증기를 사용하고 업스트림에만 테스트용 응답을 주입한다. `autoOntologyPilotLive`는 위 환경 변수로 실제 로컬 NVIDIA 게이트웨이를 사용하며 명시적으로 선택할 때만 실행한다. 결과는 `output/verification/auto-ontology-pilot-01/`에 저장한다. 전체 제품 브라우저 감사와 전체 unit suite는 이번 검증 범위에 포함하지 않는다.

## 이번 실행 결과

| 검사 | 결과 |
| --- | --- |
| 집중 테스트 | `autoOntologyPilot`, `profileExtrudeRelations`, `ontologyCapabilities` 합계 30/30 통과 |
| 제어된 업스트림 브라우저 | 14/14 통과. 동의, native 우선 표시, 양방향, revision 불일치·비정상 응답·강제 시간 초과, Undo/Redo와 같은 ID 파일 재열기 후 stale 응답 폐기 |
| 실제 NVIDIA 브라우저 | 7/7 통과. localhost 게이트웨이에서 양방향 SQL 실행과 행 대조, Inspector 설명, 문서·History 불변 |
| 기존 관계 조회 브라우저 | 9/9 통과 |
| 타입 검사 | 기존 웹 tsconfig와 서버의 Node·Vite 타입을 포함한 검사 통과 |
| 아키텍처 검사 | 964 모듈 통과 |
| `git diff --check` | 통과. 기존 CRLF 안내 유지 |

[제어된 브라우저 보고서](../../output/verification/auto-ontology-pilot-01/autoOntologyPilot/browser-report.json) · [실제 연결 보고서](../../output/verification/auto-ontology-pilot-01/autoOntologyPilotLive/browser-report.json) · 실제 게이트웨이 SQL 기록 (local-only, not in repository: `output/verification/auto-ontology-pilot-01/live-provider-trace.log`) · [실제 Inspector 화면](../../output/verification/auto-ontology-pilot-01/autoOntologyPilotLive/verified-inspector.png)

실제 SQL은 각각 `source_id = 'profile'` 또는 `target_id = 'solid'`와 함께 `document_id = 'test-document' AND revision = 2`를 포함했다. 실제 배포에는 앞선 실험에서 검증한 SQLite 패치 두 개를 일시 적용했다. 검증 후 원본 파일을 복구하고 실험 token을 폐기했으며 서비스를 정지했다.

초기 제어된 브라우저 실행에서 테스트 미들웨어의 등록 순서와 등록 가능한 파일 이름을 수정했다. 실제 제품에서는 객체 선택에 따른 Inspector 재마운트가 동의를 잃는 문제를 수정했다. 두 브라우저를 동시에 실행할 때 파일 재열기 후 CDP 클릭이 5초 제한 시간을 넘긴 실행이 있었고, 해당 검사는 단독 재실행에서 통과했다. 원래 검사와 assertion은 유지했다. 서버만의 별도 타입 검사 첫 실행은 Node·Vite 선언과 strict 설정을 빠뜨려 실패했고, 저장소에 설치된 선언과 웹과 같은 strict 설정을 사용해 통과했다.

Workspace 빌드, 전체 unit suite, 전체 브라우저 감사는 미실행이다. 과거 카드의 통과 기록은 이번 결과와 구분한다.
