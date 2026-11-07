# AUTO-ONTOLOGY-POC-01 — NVIDIA Auto Ontology 사전 실험

**부분 완료.** NVIDIA 공식 경로를 확인하고, 승인된 합성 도면 결과의 SQLite 변환과 읽기 전용 비교를 실행했다. NVIDIA 서비스의 의미 계층 컴파일 및 질의 결과는 이번 환경에서 확인 불가다.

## 공식 근거

| 항목 | 확인 결과 |
| --- | --- |
| 명칭·공개 범위 | **NVIDIA Auto Ontology**. NVIDIA 공식 소개와 공개 저장소에서 확인했다. 조사한 소스는 `c447003f72a822301e927196a4ecb5b597c308d5`다. NGC에는 백엔드 컨테이너 1.2.0이 공개 목록에 있다. [NVIDIA Developer](https://developer.nvidia.com/topics/ai/agent-knowledge-foundation) · [공식 저장소](https://github.com/NVIDIA/auto-ontology/tree/c447003f72a822301e927196a4ecb5b597c308d5) · [NGC 백엔드](https://catalog.ngc.nvidia.com/orgs/nvidia/-/containers/auto-ontology/-) |
| 실행 | 공식 Quickstart는 Docker Compose와 PostgreSQL/pgvector, 웹 UI, 모델 역할 설정을 사용한다. 기본 예시는 NVIDIA API 키를 사용한다. 역할별 모델 URL을 설정할 수 있고 추론·임베딩·재순위에 맞는 호환 엔드포인트가 필요하다. [Quickstart](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/README.md#quickstart) · [모델 설정](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/.env.example) |
| 입력·출력 | SQLite는 UI 등록이 아닌 `CONNECTION_STRINGS`의 `sqlite://` 경로를 사용한다. 소스 구현은 테이블, 열, PK와 FK를 조회한다. 공식 API에는 Auto Ontology/Apache Ossie 모델 YAML 교환과 인증된 Chat SSE가 있다. WebCAD JSON 직접 입력 경로는 확인하지 못했다. [연결 계약](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/docs/connections.md) · [SQLite 커넥터](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/connectors/sqlite.py) · [공식 API](https://nvidia.github.io/auto-ontology/) |
| 라이선스·데이터 | Auto Ontology 소스는 Apache-2.0이다. 호스팅 모델, DB 및 선택형 예측 서비스는 각자의 조건을 적용한다. NVIDIA API Catalog 시험 약관 §§2–3은 입력·출력의 처리, 예외적 보존, 서비스·모델 개선 및 보안 로그 조건을 설명한다. 기본 호스팅 연결을 로컬 처리로 간주할 수 없다. [소스 라이선스](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/LICENSE) · [외부 서비스 고지](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/README.md#notice-and-disclaimer) · [API 시험 약관 §§2–3](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf) |

공식 SQLite 구현은 파일 경로를 일반 연결로 연다. 다음 배포에서는 합성 DB만 읽기 전용 볼륨으로 연결해야 한다. 카탈로그를 저장하는 별도 실험용 PostgreSQL은 컴파일을 위해 쓰기가 필요하다. [SQLite 커넥터](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/auto_ontology/connectors/sqlite.py) · [Compose 구성](https://github.com/NVIDIA/auto-ontology/blob/c447003f72a822301e927196a4ecb5b597c308d5/docker-compose.yml)

## 실험 범위 및 결과

- 입력은 이전 카드의 브라우저 다운로드와 바이트가 같은 1,583바이트 합성 JSON이다. SHA-256은 `b903856b2bfa98bf481cc6ff8870a372ed1f34956ec6b3b607f582ea362b8bab`다. 기준 답안은 `test-document` revision 2, 선택 `solid`, `profile → solid`, `incoming`, `live`, `resolved`, 양 끝 누락 없음, 스케치 소유 목록 비어 있음이다.
- Python 3.14.7 / SQLite 3.50.4 표준 라이브러리로 문서·객체·스케치 소유·관계 4개 테이블을 생성했다. 생성한 36,864바이트 DB를 `mode=ro`로 다시 열고 SQL 결과를 기준 답안과 대조했다. DB에는 합성 데이터와 관계 근거 필드만 담았다. 코드 경로는 로컬 원본 JSON에만 있다.
- Docker Compose 5.5.1 클라이언트는 확인했으나 Docker Linux 엔진 파이프 연결이 실패했다. `uv`와 Auto Ontology 패키지가 없고 NVIDIA 키나 역할별 모델 엔드포인트가 환경 변수에 설정되지 않았다. 설치된 Ollama 목록에서도 별도의 임베딩·재순위 모델을 확인하지 못했다. NVIDIA 커넥터, 컴파일, 모델 질의, 데이터 처리 동작의 실측은 미실행이다.

| 지표 | 로컬 SQLite 변환·조회 | NVIDIA 실행 |
| --- | ---: | --- |
| 완전 일치 관계 | 1/1 | 미실행 |
| 누락 | 0 | 미실행 |
| 근거 없는 추가 | 0 | 미실행 |
| 방향 반전 | 0 | 미실행 |
| live/snapshot 혼동 | 0 | 미실행 |
| 소유·누락 상태·선택 방향·revision 차이 | 각각 0 | 미실행 |
| 소요 | 93.467 ms | 미측정 |

오류를 하나씩 주입한 비교기 대조군 8개에서 의도한 항목을 모두 검출했다. 별도 메모리 대조군에서 snapshot·누락·스케치 소유 값이 있는 행도 그대로 복원했다. 파일 무결성, FK 검사, 읽기 전용 연결의 쓰기 거부를 별도로 확인했다. 이 숫자는 변환과 비교기의 동작을 보여 준다. 외부 모델 품질은 측정하지 못했다.

## 재현과 판단

저장소 루트에서 아래 명령을 실행한다. 별도 패키지 설치나 네트워크 연결이 필요 없다.

```powershell
python output/verification/auto-ontology-poc-01/run_local.py
```

같은 디렉터리에 원본 `input.json`, 채점용 `baseline.json`, `source.sqlite3`, 읽기 쿼리 `read-relations.sql`, `local-result.json`, `comparison.json`을 남겼다. 이후 실제 결과를 기준 답안의 형태로 별도 저장하면 `run_local.py --candidate <파일>`로 점수를 계산할 수 있다. 이 옵션은 외부 서비스에 접속하지 않는다.

제품 통합 판단은 보류한다. 확인된 적용 지점은 CAD가 기록한 관계를 SQL로 질의하는 읽기 전용 의미 계층이다. 제품 코드, 명령, 작업 트리의 이전 변경은 보존했다. 이번 실험에서 외부로 전송한 합성 입력이나 사용자 도면은 없다. 다음 실험은 Docker 또는 승인된 격리 서버, 설정한 모델 역할별 엔드포인트, 읽기 전용 합성 DB 연결을 준비한 뒤 진행한다.
