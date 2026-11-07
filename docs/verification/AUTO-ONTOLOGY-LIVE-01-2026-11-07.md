# AUTO-ONTOLOGY-LIVE-01 — 실행 전 점검과 격리 실행 결과

**최종 상태 — 부분 완료.** 공식 NVIDIA 1.2.0 배포에서 모델 네 역할과 읽기 전용 마운트를 확인했고, 합성 데이터의 의미 계층을 컴파일했다. 두 모델에서 양방향 질의를 실제 전송했으나 모두 메타데이터 경로에서 종료됐다. 아래 사전 점검과 연결 점검의 `차단` 상태는 당시 기록이다.

## 격리 실행 (2026-11-07 KST)

`webcad-ao-live01` Compose 프로젝트에서 NVIDIA 백엔드·게이트웨이 `1.2.0`과 전용 pgvector 카탈로그를 실행했다. 게이트웨이와 백엔드 공개 포트는 Windows 루프백에 바인딩했다. 수집기와 백엔드에 합성 SQLite 파일 하나를 `RW=false`로 마운트했고, 양쪽에서 무결성 검사와 `SQLITE_READONLY` 쓰기 거부를 확인했다. 원본 SHA-256은 실험 후에도 동일했다. [배포 이미지 다이제스트](../../output/verification/auto-ontology-live-01/live-deployment.json) · [마운트 검사](../../output/verification/auto-ontology-live-01/live-mount.json)

추론·비추론 역할에는 Ollama `qwen3:14b`와 별도 비교 프로필 `qwen3-coder-32k:latest`를 사용했다. 임베딩은 `nomic-embed-text`, 재순위는 로컬 ONNX `cross-encoder/ms-marco-MiniLM-L6-v2`였다. 두 프로필 모두 백엔드 컨테이너 내부에서 역할별 HTTP 200과 실제 응답을 확인했다. 카탈로그의 고정 2,048차원과 Nomic의 768차원 차이로 첫 수집이 실패했다. 모든 검색·수집 벡터에 동일하게 0을 추가하는 실험용 어댑터로 코사인 유사도를 보존하며 연결했다. 초기 컴파일에서는 로컬 채팅 응답이 시간 한도를 넘겼다. 어댑터에서 토큰 필드 호환, 최대 2,400토큰, 구조화 응답의 thinking 비활성화를 적용했다. 성공한 컴파일은 4개 테이블에서 36.9초 걸렸다. 대체 모델은 같은 컴파일 결과를 사용했다. [역할 검사](../../output/verification/auto-ontology-live-01/live-model-roles.json) · 컴파일 로그 (local-only, not in repository: `output/verification/auto-ontology-live-01/compilation-summary.log`)

| 모델 | 방향 | HTTP / SSE | 생성 SQL | DB 반환 행 | 소요 시간 |
| --- | --- | --- | --- | --- | --- |
| `qwen3:14b` | 정방향 `profile` | 200 / 종료 | 미생성 | 미수집 | 34.905초 |
| `qwen3:14b` | 역방향 `solid` | 200 / 종료 | 미생성 | 미수집 | 28.109초 |
| `qwen3-coder-32k` | 정방향 `profile` | 200 / 종료 | 미생성 | 미수집 | 118.611초 |
| `qwen3-coder-32k` | 역방향 `solid` | 200 / 종료 | 미생성 | 미수집 | 109.574초 |

네 실행 모두 메타데이터를 조회하는 `information_agent`로 라우팅됐다. 이 경로는 원본 행을 조회하지 않는다. `qwen3:14b`는 도구 액션에 `answer`를 포함했고, `qwen3-coder-32k`는 답변 액션에 도구 필드를 포함해 `InformationAgentAction` 검증에 실패했다. 게이트웨이는 완료 이벤트와 함께 원본 데이터가 조회되지 않았다고 응답했다. 일치·누락·추가·방향·live/snapshot·소유·누락 상태·revision은 양방향 모두 미채점이다. 반환이 없었던 결과를 빈 SQL 결과 집합으로 간주하지 않았다. [NVIDIA 정보 에이전트 코드](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/retrieval/text_to_sql/agents/information_agent.py) · 최초 모델 검증 로그 (local-only, not in repository: `output/verification/auto-ontology-live-01/attempt-qwen3-14b/routing-validation.log`) · 대체 모델 검증 로그 (local-only, not in repository: `output/verification/auto-ontology-live-01/routing-validation.log`)

네 캡처의 요청 본문이 `questions.json`의 해당 `request`와 일치함을 확인했다. 채점기 구조를 확인하는 준비 과정에서 기준 답안 파일을 로컬에서 미리 열었다. 질의 본문이나 카탈로그 마운트에 기준 답안을 포함한 적은 없고, 답안에서 채운 반환 값도 없다. 사용자 도면과 저장소 데이터는 외부로 전송하지 않았다.

실행 결과 JSON과 SSE, 로컬 배포 레시피와 실행 스크립트를 보존했다. 실험 서비스를 정지하고 전용 카탈로그 볼륨을 보존했다. 기존 요청으로 실제 DB 행을 반환하는 능력은 확인되지 않아 제품 통합 판단은 보류한다. [기계 판독 평가](../../output/verification/auto-ontology-live-01/live-evaluation.json) · [재현 절차](../../output/verification/auto-ontology-live-01/deployment/README.md)

## 최초 실행 전 점검

**당시 상태 — 차단.** Docker 엔진은 재확인에서 응답했다. 당시 환경에서 사용할 수 있는 역할별 모델 엔드포인트를 확인하지 못해 격리 카탈로그 배포·컴파일·질의 단계로 진행하지 않았다. 이전 [POC 보고서](AUTO-ONTOLOGY-POC-01-2026-11-07.md)의 제품 통합 보류 판단을 유지했다.

## 실행 근거

| 항목 | 이번 확인 |
| --- | --- |
| Docker | 첫 프로브에서 Linux 엔진 파이프 연결 실패. 재확인에서 `desktop-linux` 엔진 29.8.1과 Compose 5.5.1 확인. 로컬 Auto Ontology/pgvector 이름에 해당하는 이미지·컨테이너는 발견되지 않았다. |
| 배포 버전 | POC에서 사용한 공식 소스 기준은 `c447003f72a822301e927196a4ecb5b597c308d5`, 공개 백엔드 태그는 1.2.0이다. 실제 배포 버전은 미확정이다. 승인된 원격 격리 서버도 확인되지 않았다. [NGC 백엔드](https://catalog.ngc.nvidia.com/orgs/nvidia/-/containers/auto-ontology/-) |
| 모델 역할 | `DEFAULT_MODELS`, `REASONING`, `NON_REASONING`, `EMBED`, `RERANK`의 `ENDPOINT`·`API_KEY`·`MODEL` 환경 변수를 값 노출 없이 확인했다. 설정을 발견하지 못했다. NVIDIA 키도 확인되지 않았다. 로컬 Ollama에 설치된 5개 모델의 `/api/show`에는 embedding 기능이 없었고 재순위 엔드포인트도 확인되지 않았다. [공식 모델 역할 설정](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/.env.example) |
| 읽기 전용 | 승인된 POC `source.sqlite3`를 로컬에서 `mode=ro`로 열었다. 무결성 검사 통과, FK 위반 0, 쓰기 시도는 `SQLITE_READONLY`로 거부됐다. 전후 SHA-256은 `baaed1af1334c5e7ce76b3c72c17ba8a1f1494ba06285c97092e9eaf2348ce75`로 같았다. NVIDIA 컨테이너 마운트는 미검증이다. |

## 실제 질의와 비교

정방향은 `profile`이 입력인 직접 Extrude 관계, 역방향은 `solid`에 기록된 직접 프로파일 관계를 묻도록 준비했다. 질문은 `output/verification/auto-ontology-live-01/questions.json`에 있다. 요청의 `request`에는 기준 답안이나 예상 SQL이 포함되지 않는다.

| 경로 | 의미 계층 | 생성 SQL | 실제 반환 행 | 소요 시간 | 점수 |
| --- | --- | --- | --- | --- | --- |
| NVIDIA 정방향 | 미실행 | 미생성 | 미수집 | 미측정 | 미채점 |
| NVIDIA 역방향 | 미실행 | 미생성 | 미수집 | 미측정 | 미채점 |
| 로컬 사전 검증 | 해당 없음 | 기존 고정 SQL | `profile → solid`, live, revision 2 | 35.024 ms | 1/1 일치, 나머지 오류 0 |

로컬 수치는 SQLite 열기, 무결성·쓰기 거부 확인, 기존 쿼리 읽기와 해시 확인을 포함한다. 외부 모델의 누락·추가·방향·의미·revision 오류 수치는 모두 미측정이다. 사용자 도면 및 저장소 데이터 전송은 없었다.

## 재현과 재개 조건

1. `docker version --format '{{.Server.Version}}'`와 `docker compose version`으로 엔진과 클라이언트를 확인한다. 공식 예제에서 요구하는 모델 역할별 연결을 준비하고, 격리 실험의 모델 엔드포인트에서 실제로 사용할 수 있는지 확인한다.
2. 별도 카탈로그를 구성하고 합성 DB 파일 하나만 커넥터를 사용하는 컨테이너에 읽기 전용으로 마운트한다. 예를 들어 컨테이너 내 `/fixtures/source.sqlite3`에 마운트할 경우 SQLite 연결 값은 `sqlite:////fixtures/source.sqlite3`이다. 실제 마운트의 읽기 전용 속성과 원본 해시를 확인한 뒤 Semantic Compilation을 시작한다. [연결 설정](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/docs/connections.md) · [SQLite 커넥터](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/connectors/sqlite.py)
3. 인증된 게이트웨이의 `POST /api/chat/completions`에 두 질문의 `request`를 별도로 보낸다. 각 질의의 최종 `result.answer.sql_code`, `sql_response_from_db`, 소요 시간을 저장한다. SQL이나 DB 행이 빠진 응답은 성공으로 채점하지 않는다. [공식 SSE 계약](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/docs/conversation-api.md)
4. 반환 행을 채점 형식으로 정규화한다. `selectedObjectId`는 질문의 조회 문맥이며, `viewedFrom`은 반환된 두 끝점에서 해당 ID가 어느 쪽인지로 계산한다. DB의 `viewed_from`은 최초 WebCAD 내보내기의 관점이다. 반환된 끝점이나 관계 방향, 의미, 상태, 소유, revision을 기준 답안에서 채우지 않는다. 확인할 수 없는 필드는 누락으로 기록한다.
5. POC `run_local.py`의 `compare`를 불러와 정방향은 LIVE `forward-baseline.json`, 역방향은 POC `baseline.json`과 대조한다. 두 답안은 질의 요청과 분리해 유지한다.

기계 판독용 준비 상태·로컬 검증 결과는 `output/verification/auto-ontology-live-01/preflight.json`에 있다. 현재 후속 단계는 새 기능 카드가 아니라 모델 환경이 준비된 뒤 동일 카드의 실제 질의를 재개하는 것이다.

## 재개 점검 (2026-11-07 11:11 KST)

**상태 — 차단.** `desktop-linux` Docker 엔진 29.8.1과 Compose 5.5.1은 응답했다. 현재 Docker 컨텍스트에서 이미지와 컨테이너는 각각 0개였으며, Compose 프로젝트와 승인된 원격 실험 배포도 확인되지 않았다. 실제 Auto Ontology 배포 버전은 미확인이다.

- `DEFAULT_MODELS`, `REASONING`, `NON_REASONING`, `EMBED`, `RERANK`의 엔드포인트·모델·키 설정은 현재 프로세스 환경에서 발견되지 않았다. Ollama에서 5개 모델의 메타데이터를 읽었고 모두 채팅 계열 기능을 보고했다. 배포에서 사용할 추론·비추론 연결은 미검증이며, 임베딩 모델과 재순위 연결은 발견되지 않았다.
- 합성 `source.sqlite3`를 로컬 SQLite `mode=ro`로 다시 열었다. 무결성 검사는 `ok`, 외래 키 위반은 0건, 쓰기 시도는 `SQLITE_READONLY`로 거부됐다. SHA-256은 이전 점검값과 같고 재개 점검 전후에도 같았다. 격리 컨테이너에서의 파일 마운트는 미검증이다.
- `questions.json`의 정방향과 역방향 `request`를 로컬에서 확인했다. 카탈로그 컴파일과 요청 전송은 미실행이다. 두 방향 모두 SQL, DB 반환 행, 시간, 정규화 결과와 비교 점수는 미수집이다. 비교 오류 건수도 미측정이다. 위 표의 로컬 점수는 이전 점검 기록이다.
- 재개 점검의 기계 판독 결과는 `output/verification/auto-ontology-live-01/resume-preflight.json`에 있다. 다음 실행은 승인된 격리 배포에서 모델 역할별 호출과 합성 DB 마운트를 검증한 뒤 진행한다. 제품 연동 판단은 보류한다.

## Docker 연결 분리 점검 (2026-11-07 11:16 KST)

- Docker 엔진 29.8.1과 Compose 5.5.1이 다시 응답했다. `docker manifest inspect nvcr.io/nvidia/auto-ontology:1.2.0`도 Linux amd64 매니페스트를 반환했다. 활성 컨텍스트에 배포는 여전히 없었다. 매니페스트 조회에서 이미지 레이어 다운로드나 컨테이너 실행은 수행하지 않았다.
- Windows의 프로세스·사용자·시스템 환경에서 Auto Ontology 역할별 연결 설정을 찾지 못했다. Ollama API의 모델 목록은 응답했다. CAD 데이터가 없는 별도 `qwen3:14b` 로컬 채팅 확인 요청은 클라이언트에서 30,037 ms 후 시간 초과됐다. 원인은 미확인이다. 이 요청은 배포 역할 검증이나 두 방향의 본 질의에 해당하지 않는다.
- 합성 파일 해시는 기존 읽기 전용 검사와 일치했다. 실제 마운트, 의미 계층 컴파일, 방향별 SQL·반환 행·채점은 격리 배포가 준비될 때까지 미실행이다.
