# 현재 프로젝트 상태

문서 갱신: **2026-10-17**. 최신 제품 구현·검증 기준: **2026-10-16**. 다음 실행은 [NEXT-STEPS](NEXT-STEPS.md#현재-실행-큐)의 **WF-Q1 실제 주거 과제 검증**이다.

## 지원 범위 요약

| 영역 | 상태 | 현재 사용법·지원 범위 |
| --- | --- | --- |
| 프로젝트·복구·다중 세션 | UI-P1/H1/H2·UI-P2 지원 범위 완료 | [프로젝트와 저장](docs/features/PROJECTS.md) |
| 작도·참조 편집·스케치 | 카드별 지원 범위 | [정밀 작도와 편집](docs/features/DRAWING-EDITING.md) |
| 작업면·솔리드 | B5 지원 범위/pilot | [솔리드 모델링](docs/features/SOLID-MODELING.md) |
| 평면도·벽·콘텐츠 | WF-A1·C0/A2/B1·B2/B3·CMP-S1/WF-D1 첫 범위 완료 | [평면도와 건축 콘텐츠](docs/features/FLOOR-PLANNING.md) |
| 연관 도면·시트 | 카드별 지원 범위 | [도면과 출력](docs/features/DRAWINGS-OUTPUT.md) |
| 이미지·제작 | G2/G3·Scene/prototype 지원 범위 | [이미지와 장면](docs/features/IMAGES-SCENES.md) |
| Copilot | local Query/guided 작업·제한된 gateway 계약 | [Copilot](docs/features/COPILOT.md) |

사용법·수치 한도·미지원 조합은 위 대표 문서 한 곳에서 관리한다. 이 표는 진행 상태만 요약한다.

## 최신 검증 근거

2026-10-16 [CMP-S1/WF-D1 검증](docs/verification/CMP-S1-WF-D1-2026-10-16.json): 전체 Node **1,274 / 54 suites / 실패 0**, native 콘텐츠 **16**, 벽 **14**, 연관 도면 **32** checks. 타입·architecture **589 modules**·production build **427 modules** 통과. 기존 큰 chunk 경고는 남아 있다. 상세 대상 실행과 환경은 원본 JSON을 따른다.

이는 해당 날짜의 제품 검증이다. 2026-10-17 계획/문서 정리에서 실행한 링크·구조 검사를 제품 전체 회귀로 합산하지 않는다. [정합성 기록](docs/reviews/PLAN-CONSISTENCY-2026-10-17.md), [문서 정리 기록](docs/reviews/DOCUMENTATION-ORGANIZATION-2026-10-17.md).

## 남은 지원 경계

**WF-Q1 실제 주거 과제 발행 검증은 미완료**다. 기능별 미지원 조합은 위 대표 문서를, 예정 카드와 선행 조건은 [실행 큐](NEXT-STEPS.md)를 따른다. 지원 범위 일부의 완료를 전체 기능·실무 품질 보증으로 확대하지 않는다.

## 기록과 갱신

기존 날짜별 구현·실패·보충·측정 조건은 [2026-10-17 분리 이력](docs/history/PROJECT-STATE-2026-10-17.md)에 보존했다. 기능별 사용법은 [기능 가이드](docs/features/README.md), 실행 결과는 [검증 색인](docs/verification/README.md), 문서 갱신 책임은 [CHANGE-GUIDE](docs/architecture/CHANGE-GUIDE.md)를 따른다. 이 파일에는 현재 요약과 최신 근거만 유지한다.

<details>
<summary>이전 상세 절과 날짜별 기록</summary>

- <a id="날짜별-구현검증-이력"></a> [날짜별 구현·검증 이력](docs/history/PROJECT-STATE-2026-10-17.md#날짜별-구현검증-이력)

- <a id="최신-통합-구현검수-상태"></a> [최신 통합 구현·검수 상태](docs/history/PROJECT-STATE-2026-10-17.md#최신-통합-구현검수-상태)

- <a id="직전-b0-c-구현검수"></a> [직전 B0-C 구현·검수](docs/history/PROJECT-STATE-2026-10-17.md#직전-b0-c-구현검수)

- <a id="직전-b2-a2-내부-코너-구현검수"></a> [직전 B2-A2 내부 코너 구현·검수](docs/history/PROJECT-STATE-2026-10-17.md#직전-b2-a2-내부-코너-구현검수)

- <a id="직전-g5-b2-구현검수"></a> [직전 G5-B2 구현·검수](docs/history/PROJECT-STATE-2026-10-17.md#직전-g5-b2-구현검수)

- <a id="직전-구현검수-기준선"></a> [직전 구현·검수 기준선](docs/history/PROJECT-STATE-2026-10-17.md#직전-구현검수-기준선)

- <a id="제품-방향"></a> [제품 방향](docs/history/PROJECT-STATE-2026-10-17.md#제품-방향)

- <a id="현재-구현"></a> [현재 구현](docs/history/PROJECT-STATE-2026-10-17.md#현재-구현)

- <a id="구현-구조와-변경-계약"></a> [구현 구조와 변경 계약](docs/history/PROJECT-STATE-2026-10-17.md#구현-구조와-변경-계약)

- <a id="최근-검수"></a> [최근 검수](docs/history/PROJECT-STATE-2026-10-17.md#최근-검수)

- <a id="문서-관리"></a> [문서 관리](docs/history/PROJECT-STATE-2026-10-17.md#문서-관리)

</details>
