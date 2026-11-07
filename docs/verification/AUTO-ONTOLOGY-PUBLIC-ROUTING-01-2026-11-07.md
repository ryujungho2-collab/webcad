# AUTO-ONTOLOGY-PUBLIC-ROUTING-01

공개 게이트웨이에서 명시적 행 필터 요청은 양방향 SQL 실행과 기준 답안 완전 일치를 달성했다. 기존 자연어 질문은 양쪽 모두 메타데이터 경로에 남았다.

## 비교 조건

NVIDIA Auto Ontology 1.2.0, `qwen3:14b`, 이전의 격리 SQL 패치 두 개, 같은 단일 문서 합성 카탈로그를 사용했다. 이전 조인 실험의 컴파일 성공 시각과 SQLite 해시가 일치함을 확인했다. SQLite는 읽기 전용으로 마운트했고, 재컴파일 없이 인증된 공개 `POST /api/chat/completions`에 네 건을 전송했다. 첫 두 건의 본문은 내부 계산 경로에서 성공한 실험의 공개 필드와 동일하다. 비교군은 `question`만 실제 행과 필터 열을 지정하는 문장으로 바꿨다. 모든 요청의 스키마 안내 `evidence`와 `prediction: false`는 같다. [이전 조인 검증](AUTO-ONTOLOGY-JOIN-01-2026-11-07.md) · [실행 스크립트](../../output/verification/auto-ontology-public-routing-01/run_public.py)

## 실행 결과

| 질문 조건 | 방향 | 실제 분류 | SQL 및 행 | 소요 시간 |
| --- | --- | --- | --- | ---: |
| 기존 질문 | 정방향 | `information` | SQL 없음, 미채점 | 18.109초 |
| 기존 질문 | 역방향 | `information` | SQL 없음, 미채점 | 28.860초 |
| 명시적 행 필터 | 정방향 | `calculation/match_based` | `source_id = 'profile'`, 1행 완전 일치 | 18.347초 |
| 명시적 행 필터 | 역방향 | `calculation/match_based` | `target_id = 'solid'`, 1행 완전 일치 | 23.122초 |

명시적 요청의 두 SQL은 모두 `main.cad_profile_extrude`를 조회했다. 실제 반환 행은 `test-document`, revision `2`, `profile → solid`, `profile-to-extrude`, `live`, `resolved`, 양 끝의 누락 플래그와 스케치 소유자 목록을 포함했다. 기존 비교기에서 양방향 완전 일치 1건씩과 나머지 오류 0건을 확인했다. 기존 문장의 HTTP 200과 SSE 종료는 DB 실행 성공을 뜻하지 않는다. [분류 로그](../../output/verification/auto-ontology-public-routing-01/routing-trace.log) · [정방향 SQL](../../output/verification/auto-ontology-public-routing-01/explicit-filter-forward.sql) · [역방향 SQL](../../output/verification/auto-ontology-public-routing-01/explicit-filter-reverse.sql) · [실제 행과 점수](../../output/verification/auto-ontology-public-routing-01/evaluation.json)

## 제품 진입 조건

이번 실험은 모델에게 조회 열이 알려진 요청의 실행 가능성을 확인했다. 각 조건·방향을 한 번씩 실행했으므로 라우팅 안정성, 일반 자연어 표현의 성공률, 응답 시간 분포는 미검증이다. 제품 파일럿에서는 WebCAD가 선택 ID와 조회 방향을 확인하고 허용된 조회 형태로 변환할 수 있어야 한다. 여러 문서에 같은 객체 ID가 있을 때의 격리, snapshot과 누락 참조, 시간 초과나 오류 시 기존 WebCAD 조회의 응답을 별도로 검증한다.

제품에 연결하거나 사용자 도면을 사용한 실행은 없었다. 임시 패치 두 파일을 원본으로 복구해 해시를 확인했고 실험 서비스를 정지했다.
