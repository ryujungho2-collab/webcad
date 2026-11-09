# AUTO-ONTOLOGY-SQL-ISOLATION-01

**상태 — 부분 완료.** 내부 계산 경로에서 양방향 SQL을 실행했고, 두 결함을 독립 테스트로 재현·수정했다. 생성 SQL의 조인 의미가 틀려 양방향 완전 일치는 확보하지 못했다.

## 실행 경로

NVIDIA Auto Ontology 1.2.0의 격리 컨테이너에서 `stream_agent_response`에 내부 `calculation_only=True`를 전달했다. 기존 공개 요청의 질문과 `prediction`을 그대로 전달했으며, 내부 계산 모드는 기존 구현에 따라 공개 예측 선택을 무시한다. 읽기 전용 합성 SQLite, 기존 의미 계층, 로컬 `qwen3:14b` 역할 설정을 사용했다. 모델의 SQL 생성, 카탈로그와 의도 검증, SQLite 실행, 응답 정리를 모두 기존 그래프에서 수행했다. 공개 게이트웨이 라우팅은 별도 검증 항목이다. [NVIDIA 내부 경로](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/retrieval/interactive/coordinator.py#L419-L440) · [실행 스크립트](../../output/verification/auto-ontology-sql-isolation-01/run_inside.py)

## 최소 수정과 독립 검증

- `COUNT(*)`에서 명시 열이 없다는 이유로 테이블 참조를 버리던 추출기를 수정했다. 하나의 카탈로그 확인 테이블을 직접 집계하는 경우 테이블 참조를 남긴다. 이전에는 SQLite에서 `1`이 반환되는 SQL도 카탈로그 검증에 실패했다. 수정 후 검증과 실행이 모두 통과했고, 존재하지 않는 테이블의 집계는 거부됐다. 조인이나 CTE를 포함하는 `COUNT(*)`는 이번 수정으로 일반화하지 않았다.
- SQLite 검증 전에 AST로 테이블 이름을 보정했다. 현재 커넥터와 카탈로그에서 확인된 `source.main.<table>`만 `main.<table>`로 바꿨다. 이름 보정 후 기존 검증을 거쳐 실제로 `1`이 반환됐다. 다른 데이터베이스, 다른 스키마, 알 수 없는 테이블은 거부했고 문자열 리터럴은 보존했다. [실험 패치](../../output/verification/auto-ontology-sql-isolation-01/isolated-nvidia.patch) · [수정 전 독립 테스트](../../output/verification/auto-ontology-sql-isolation-01/unmodified-controls.json) · [수정 후 독립 테스트](../../output/verification/auto-ontology-sql-isolation-01/patched-controls.json)

## 방향별 실제 SQL·행·시간

| 상태 | 방향 | 소요 시간 | SQL 실행 시도 | 최종 반환 |
| --- | --- | ---: | ---: | --- |
| 수정 전 | 정방향 | 98.336초 | 8 | 0행. SQLite 이름 오류 뒤 재작성 SQL 실행 |
| 수정 전 | 역방향 | 194.049초 | 16 | 반환 없음. SQLite 이름 오류와 `r.document_id` 없는 열 오류 |
| 수정 후 | 정방향 | 47.251초 | 3 | 0행. [최종 실행 SQL](../../output/verification/auto-ontology-sql-isolation-01/patched-forward.sql) |
| 수정 후 | 역방향 | 44.487초 | 3 | 1행. [최종 실행 SQL](../../output/verification/auto-ontology-sql-isolation-01/patched-reverse.sql) |

두 수정 후 실행에서 세 부분 이름의 SQLite 구문 오류는 재현되지 않았다. 모델은 여전히 `cad_relation`에 없는 `r.document_id`를 만들어 첫 SQL 실행에 실패했고, 이후 문서의 현재 선택 객체 ID를 프로파일 ID에 연결했다. 실제 데이터는 선택 객체가 `solid`, 프로파일이 `profile`이다. 이 조건 때문에 정방향의 내부 조인은 행을 버렸고, 역방향의 외부 조인은 관계 행을 남기는 대신 문서 ID와 revision을 NULL로 반환했다. 별도 조회에서 이 조인 조건이 거짓이고 정방향에 추가된 `graph_relation = 'live-input'` 조건은 참임을 확인했다. [조인 진단](../../output/verification/auto-ontology-sql-isolation-01/join-diagnostic.json)

역방향 반환 행에는 `profile → solid`, `profile-to-extrude`, `live`, `resolved`, 양 끝의 누락 플래그 `0`이 있었다. 스케치 소유자 ID와 양쪽 소유자 목록은 반환되지 않았다. `sketch_missing: null`만으로 소유자 목록을 채우지 않았다. 방향·조건별 소요 시간은 각 1회 측정값이다. [실제 반환 행과 단계 기록](../../output/verification/auto-ontology-sql-isolation-01/evaluation.json)

## 기존 비교기

| 상태 | 방향 | 완전 일치 | 누락 | 소유 불일치 | 문서 ID·revision 불일치 |
| --- | --- | ---: | ---: | ---: | ---: |
| 수정 전 | 정방향 | 0 | 1 | 0 | 1 |
| 수정 전 | 역방향 | 미채점 | 미채점 | 미채점 | 미채점 |
| 수정 후 | 정방향 | 0 | 1 | 0 | 1 |
| 수정 후 | 역방향 | 0 | 0 | 1 | 1 |

문서 ID·revision 불일치에는 두 값이 미반환된 경우가 포함된다. 채점된 결과에서 근거 없는 추가, 방향 반전, 모드, 누락 상태, 조회 관점 오류는 모두 0이었다. 빈 결과의 의미 오류는 비교할 행이 없으므로 평가할 수 없다. [채점 스크립트](../../output/verification/auto-ontology-sql-isolation-01/score.py) · [비교 결과](../../output/verification/auto-ontology-sql-isolation-01/evaluation.json)

## 제품 통합 판단

보류한다. 두 수정은 SQL 실행 장애를 줄였지만 관계와 문서를 올바르게 결합하는 능력은 검증되지 않았다. 임시 패치는 격리 컨테이너의 두 파일에만 적용했고, 실험 뒤 원본 파일을 복구해 해시를 확인했다. 합성 DB의 SHA-256도 일치했고 실험 서비스는 정지했다.
