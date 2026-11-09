# AUTO-ONTOLOGY-JOIN-01 — 문서 소속 조인 검증

**결과 — 격리 실험에서 양방향 완전 일치.** 이전 SQL은 현재 선택 객체를 문서 소속 키로 사용했다. 새 관계 투영은 실제 문서 ID를 외래 키로 저장하고, 조회 뷰가 문서·끝점·양쪽 스케치 소유 정보를 결합한다.

## 변경과 적용 범위

승인된 단일 문서 합성 SQLite에서 별도 실험 파일을 만들었다. 원본 SHA-256을 확인하고 문서가 한 건일 때만 내보내기 문맥의 문서 ID를 관계에 붙인다. `cad_relation.document_id`는 `cad_document.document_id`를 참조한다. 조회용 투영에서 기존 선택 객체 필드를 제거했고, `cad_profile_extrude` 뷰는 외래 키로 문서와 결합한다. 소유자 목록은 양 끝에서 별도로 집계한다. 빈 목록은 SQLite가 `[]`로 반환한다. 이 모델은 합성 스냅샷에서 검증했다. 여러 제품 문서의 객체 ID 범위와 통합 저장 정책은 별도 설계가 필요하다. [합성 파일 생성기](../../output/verification/auto-ontology-join-01/build_fixture.py)

새 NVIDIA Auto Ontology 1.2.0 카탈로그에 파생 파일을 읽기 전용으로 마운트했다. 테이블·뷰 5개를 51.5초에 컴파일했다. 이전의 두 SQL 안정화 패치와 로컬 `qwen3:14b` 내부 계산 경로를 재사용했다. 질문 원문은 유지했고, `evidence`에 조회할 뷰와 필드·방향의 의미만 추가했다. 기준 답안과 예상 행은 모델 요청에 포함되지 않았다. 이 결과는 파생 스키마와 조회 안내를 함께 적용한 실험이다. [질의와 스키마 안내](../../output/verification/auto-ontology-join-01/questions-with-schema-evidence.json) · 컴파일 기록 (local-only, not in repository: `output/verification/auto-ontology-join-01/compilation-summary.log`)

## 검증 결과

| 방향 | 모델이 실행한 SQL의 필터 | 실제 행 | 기존 비교기 | 소요 시간 |
| --- | --- | ---: | --- | ---: |
| `profile` → Extrude | `source_id = 'profile'` | 1 | 완전 일치 1, 기타 오류 0 | 32.125초 |
| `solid` → Profile | `target_id = 'solid'` | 1 | 완전 일치 1, 기타 오류 0 | 87.064초 |

두 쿼리는 `main.cad_profile_extrude`를 한 번씩 실행했다. 각각 `test-document` revision `2`, `profile → solid`, `profile-to-extrude`, `live`, `resolved`, 양 끝의 누락 여부 `false`, 양쪽 소유 목록 `[]`를 실제 반환했다. 조회 관점은 요청의 객체 ID와 반환 끝점을 사용해 계산했다. 별도의 매개변수화된 직접 조회도 기존 비교기에서 양방향 완전 일치했다. [정방향 SQL](../../output/verification/auto-ontology-join-01/forward.sql) · [역방향 SQL](../../output/verification/auto-ontology-join-01/reverse.sql) · [모델 반환 행과 비교 점수](../../output/verification/auto-ontology-join-01/evaluation.json) · [직접 조회 대조군](../../output/verification/auto-ontology-join-01/direct-control.json)

독립 테스트로 무관한 두 번째 문서 제외, 유효하지 않은 문서 외래 키 거부, 누락된 끝점 행 보존, 양쪽에 여러 소유자가 있을 때 목록 독립성을 확인했다. 이 변형은 메모리에서만 실행했다. 실험 전후 원본과 파생 파일의 해시가 일치했다. 격리 컨테이너의 임시 패치를 복구하고 서비스를 정지했다. [합성 파일 검증 기록](../../output/verification/auto-ontology-join-01/fixture-checks.json)

제품 연동은 별도 판단으로 남긴다. 이번 검증은 합성 문서 한 건과 내부 계산 경로에 적용된다. 공개 API의 자연어 라우팅과 다중 문서 조회는 이 결과로 판단할 수 없다.
