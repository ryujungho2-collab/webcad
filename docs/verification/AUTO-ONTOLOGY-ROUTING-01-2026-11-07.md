# AUTO-ONTOLOGY-ROUTING-01 — 공개 API 라우팅 비교

**상태 — 부분 완료.** 공개 계약을 확인하고 지원 필드로 양방향 비교를 실행했다. 기존 질문을 SQL 실행으로 보낼 수 있는지는 검증하지 못했다.

## 실행 경로

NVIDIA Auto Ontology `1.2.0`의 인증된 `POST /api/chat/completions`를 사용했다. OpenAPI와 서버의 `ChatRequest`가 허용하는 필드는 `question`, `evidence`, `conversation_id`, `target_db`, `prediction`이다. `prediction: false`는 예측 경로를 제외하고 정보 조회와 계산 분류를 유지한다. `target_db`는 데이터베이스 범위를 지정한다. 내부 `calculation_only`는 대화형 코디네이터가 만드는 파이프라인 필드이며 공개 채팅 요청에 정의되어 있지 않다. [공개 OpenAPI](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/docs/openapi/auto-ontology-api.json) · [채팅 요청 모델](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/server/chat/helpers.py#L32-L64) · [내부 코디네이터](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/retrieval/interactive/coordinator.py#L419-L440)

## 기존 요청과 달라진 조건

기존 `qwen3:14b` 프로필, 질문 원문, `prediction: false`, 읽기 전용 합성 DB, 이전에 컴파일한 카탈로그를 사용했다. 컴파일 성공 시각이 이전 실행과 같은지 확인했다. 공개 `evidence` 필드에 원본의 실제 행을 읽기 전용 SQL로 조회하라는 지시만 추가했다. 이 필드는 분류기 프롬프트에 전달되지만 분류 결과를 강제하지 않는다. 이전 LIVE 캡처를 비교 기준으로 사용했다. 두 요청의 차이는 캡처된 JSON에서 검사했다. [분류기 코드](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/retrieval/text_to_sql/agents/question_intent.py#L263-L273) · [카탈로그 확인](../../output/verification/auto-ontology-routing-01/catalog-status.json)

## 방향별 SQL·행·시간

| 방향 | 기존 시간 | `evidence` 포함 시간 | 생성 SQL | 실제 DB 행 | 종료 경로 |
| --- | ---: | ---: | --- | --- | --- |
| 정방향 `profile` → Extrude | 34.905초 | 21.114초 | 미생성 | 미수집 | `information_agent`의 카탈로그 설명 |
| 역방향 `solid` → Profile | 28.109초 | 38.387초 | 미생성 | 미수집 | `information_agent`의 구조화 응답 검증 실패 |

두 요청 모두 HTTP 200과 SSE 종료가 관측됐다. 실제 원본 행을 조회하는 SQL 이벤트는 두 방향에서 모두 없었다. 각 조건·방향에서 한 번씩 측정한 시간이므로 성능 차이로 해석하지 않는다. [정방향 캡처](../../output/verification/auto-ontology-routing-01/forward-live.json) · [역방향 캡처](../../output/verification/auto-ontology-routing-01/reverse-live.json) · 라우팅 로그 (local-only, not in repository: `output/verification/auto-ontology-routing-01/routing-trace.log`)

## 비교 점수

두 방향 모두 미채점이다. 응답에 DB 결과가 없으므로 빈 결과 집합이나 누락 오류로 계산하지 않았다. 비교 스크립트는 실행된 SQL과 반환 행이 모두 있는 경우에만 기준 답안을 열도록 했다. [기계 판독 비교](../../output/verification/auto-ontology-routing-01/comparison.json) · [실행 스크립트](../../output/verification/auto-ontology-routing-01/run_routing.py)

## 제품 통합 판단

보류한다. 테스트한 배포의 공개 API에서 `evidence`를 추가해도 두 기존 요청은 SQL 경로에 진입하지 않았다. 실험을 마친 뒤 서비스와 모델 브리지를 정지했고, 합성 파일의 SHA-256은 이전과 같았다.

## 후속 원인 분리 (2026-11-07 KST)

**기존 양방향 질문의 최초 차단점은 의도 분류다.** 두 요청의 서버 로그는 `type=information`, `subtype=None`, `target_db=source`를 기록했다. `route_after_candidate_retrieval`은 해당 요청을 SQL 준비 전에 `information_agent`로 보내며, 이 노드는 `END`로 연결된다. 역방향의 `InformationAgentAction` 검증 오류는 그 경로에서 추가로 발생했다. SQLite 연결에 같은 컨테이너의 SQL 실행 함수를 직접 호출한 대조군은 `profile → solid`, `live`, `resolved` 행을 8.912ms에 반환했다. 이 대조군은 수동 SQL 실행 결과다. [그래프 라우팅 코드](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/retrieval/text_to_sql/text_to_sql_graph.py#L259-L263) · [종료 간선](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/retrieval/text_to_sql/text_to_sql_graph.py#L468-L476) · 분류와 검증 로그 (local-only, not in repository: `output/verification/auto-ontology-routing-01/diagnostic-trace.log`) · [수동 실행 결과](../../output/verification/auto-ontology-routing-01/diagnostic-direct-sql.json)

**SQL 경로에서는 별도의 두 문제가 재현됐다.** 공개 API에서 행 수를 묻는 질문과 `source_id`의 NULL이 아닌 값 수를 묻는 질문은 모두 `calculation/counting`으로 분류됐다. 각각 60.690초와 58.673초 뒤 SQL 및 행 없이 종료됐다. 로그에 남은 재작성 SQL은 `SELECT COUNT(*) FROM source.main.cad_relation;`이었다. [행 수 캡처](../../output/verification/auto-ontology-routing-01/diagnostic-public-count-live.json) · [열 값 개수 캡처](../../output/verification/auto-ontology-routing-01/diagnostic-public-count-column-live.json)

- `COUNT(*)`는 실제 열을 지정하지 않는다. `extract_tables_and_columns`가 열 목록이 비어 있는 테이블을 제거해 `parse_query_slim`에서 추출 테이블 0개로 처리된다. `cad_relation`과 `main.cad_relation`을 사용한 유효 SQL도 카탈로그 검증이 거부했지만, 같은 SQL을 SQLite에 직접 실행하면 1행을 셌다. `COUNT(source_id)`는 카탈로그 검증을 통과했다. [열 목록 필터](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/catalog/parsers/sqlglot_extractor.py#L750-L759) · [카탈로그 파서](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/catalog/sql_parse.py#L52-L67)
- `source.main.cad_relation`은 이 SQLite 연결에서 구문 오류를 일으킨다. `COUNT(source_id)`로 카탈로그 검증을 통과시켜도 SQLite에서 `near ".": syntax error`가 발생했다. 같은 표현식을 `cad_relation` 또는 `main.cad_relation`으로 실행하면 양쪽을 통과하고 1을 반환했다. [6개 조합 실측](../../output/verification/auto-ontology-routing-01/diagnostic-sql-name-matrix.json)

후속 진단에는 동일한 합성 카탈로그와 NVIDIA 1.2.0 컨테이너를 사용했다. 합성 파일의 해시는 실험 전후 일치했다. 결과와 로그를 보존한 뒤 실험 서비스를 정지했다. 제품 코드와 NVIDIA 소스는 수정하지 않았다.
