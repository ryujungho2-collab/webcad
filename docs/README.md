# 문서 안내

갱신: 2026-10-17. **[NEXT-STEPS 통합 안내](../NEXT-STEPS.md)**에서 기능별 대표 문서·계획·현재 실행 큐를 함께 확인한다. 이 파일은 전체 자료의 분류별 색인이다. 현재 사용법·지원 범위는 대표 가이드, 날짜별 구현/검증 기록은 당시 근거를 관리한다.

## 먼저 읽을 문서

| 필요한 정보 | 문서 |
| --- | --- |
| 실행·검증 명령 | [프로젝트 README](../README.md) |
| 지금 지원하는 기능과 사용법 | [기능별 가이드](features/README.md) |
| 프로젝트의 진행·검증 상태 | [PROJECT-STATE](../PROJECT-STATE.md) |
| 다음 작업과 완료 조건 | [NEXT-STEPS](../NEXT-STEPS.md#현재-실행-큐) |
| 평면도→모델→시트 작업 | [평면도와 건축 콘텐츠](features/FLOOR-PLANNING.md) → [도면과 출력](features/DRAWINGS-OUTPUT.md) |
| 프로젝트 열기·저장·복구 | [프로젝트와 저장](features/PROJECTS.md) |
| 코드 수정 위치·검증·문서 책임 | [CHANGE-GUIDE](architecture/CHANGE-GUIDE.md), [디렉토리 규칙](architecture/DIRECTORY-STRUCTURE.md) |

## 전체 문서 색인

| 분류 | 내용 |
| --- | --- |
| [기능별 가이드](features/README.md) | 기능마다 하나로 통합한 현재 사용법·지원 범위 |
| [제품·계획](product/README.md) | 기능 기준, 장기 목표, 카드별 설계·선행 조건 |
| [구조·공통 계약](architecture/README.md) | 코드 위치, 의존 방향, 문서/기하/자원 계약 |
| [날짜별 구현 기록](implementation/README.md) | 당시 동작·설계 이유·실패 처리와 검증 근거 |
| [검증·측정](verification/README.md) | 날짜별 Markdown/JSON 결과, 환경·시나리오·출력 |
| [리뷰·감사](reviews/README.md) | 발견한 문제, 대조 근거, 정리 결과 |
| [실행·문서 이력](history/README.md) | 루트에서 분리한 상세 기록과 초기 인계 |
| [검증 입력](fixtures/README.md) | 문서와 함께 보관하는 재현 fixture |

색인에는 각 폴더의 모든 Markdown/검증 JSON을 연결한다. 카드 ID나 날짜를 알고 있으면 해당 색인에서 검색한다. 실제 산출물은 구현/검증 기록이 연결하는 output 파일을 따른다.

## 갱신 규칙

- 현재 사용법·지원 범위는 features의 대표 문서, 진행 상태는 PROJECT-STATE, 실행 순서는 NEXT-STEPS, 후속 설계는 product 문서가 소유한다.
- 기능 설명을 계획/상태 문서에 복사하지 않는다. 날짜별 구현 근거는 implementation, 실제 실행 결과는 verification에 보존하고 대표 문서에서 연결한다.
- 새 문서는 역할에 맞는 폴더에 만들고 그 폴더의 README 색인을 갱신한다. 이 안내는 분류나 대표 진입점이 바뀔 때 갱신한다.
- 과거 실패·측정·지원 경계는 날짜와 함께 보존한다. 후속 구현이 있으면 근거를 연결하며 과거 결과를 최신 수치로 덮어쓰지 않는다.
- 이동 시 상대 링크와 제목 앵커를 확인하고 `pnpm --filter @agent-webcad/web check:architecture`를 실행한다. 오래된 문서의 고유 근거를 확인하기 전 삭제하지 않는다.

[계획서 정합성 대조](reviews/PLAN-CONSISTENCY-2026-10-17.md) · [이번 문서 정리 범위](reviews/DOCUMENTATION-ORGANIZATION-2026-10-17.md) · [이전 전체 안내 보존본](history/DOCUMENT-INDEX-2026-10-17.md)
