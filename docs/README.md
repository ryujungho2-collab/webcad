# 문서 안내

최신 판단과 실행 순서는 루트의 [PROJECT-STATE](../PROJECT-STATE.md), [NEXT-STEPS](../NEXT-STEPS.md)를 따른다. 날짜가 붙은 검수 기록은 해당 시점의 결과이며, 최신 전체 테스트 수를 대신하지 않는다.

수정 시작점은 [CHANGE-GUIDE](architecture/CHANGE-GUIDE.md)다. 문제별 코드 위치·동작 영향·검증 범위와 각 문서의 갱신 책임을 연결한다. 폴더/import 규칙은 DIRECTORY-STRUCTURE, 현재 사실은 PROJECT-STATE, 다음 순서는 NEXT-STEPS가 각각 소유한다. 로드맵의 타입·패키지 이름은 구현 완료를 의미하지 않는다.

2026-10-05 기획 및 실행: G0·G1, G2 Artboard/Vector/Component 기반, G3 image import·placement·mask·opacity·canvas crop·color adjustment를 구현·검수했다. G3 현재 동작은 누적 구현·검수 기록, 최신 전체 결과는 [PROJECT-STATE](../PROJECT-STATE.md), 다음 실행은 [NEXT-STEPS](../NEXT-STEPS.md)가 소유한다. 날짜별 G0/G1/G3-1 초기 검수 수치는 해당 시점의 기록이다.

| 목적 | 문서 |
| --- | --- |
| 1차/2차 제품 목표 | [1차 건축·기계 CAD / 2차 아트보드·제작·LLM](product/ARCHITECTURE-MECHANICAL-MILESTONE.md) |
| CAD B2-A1/A2 기본 수정 공백 | [두 독립 윤곽의 D1/D2·Join](implementation/B2-A1-ASYMMETRIC-CHAMFER-2026-10-09.md), [내부 코너 D1/D2·공통 review·원호/참조 보존·관계 갱신](implementation/B2-A2-INTERNAL-CHAMFER-2026-10-09.md), [A2 마감 증거](verification/B2-A2-CLOSEOUT-2026-10-09.json) |
| 현재 범위 분할·재시작 프롬프트 | [각도 C1–C3·G5-A/B1·B2 첫 범위 / 다음 G6-A1 모델 뷰 계약](WORK-SLICES-2026-10-06.md) |
| G5-B2 gateway 편집 첫 범위 | [단일 2D Move·대상/좌표 계약·관계 갱신·원자성·인계](implementation/G5-B2-COPILOT-MOVE-2026-10-09.md), [659 Node·40 browser/859 checks·build/321 module guard](verification/G5-B2-CLOSEOUT-2026-10-09.json) |
| G5-B1 local Query 구현·전체 검수 | [선택/명시적 target·잠금/측정·취소·버전 경합·수동 인계](implementation/G5-B1-COPILOT-QUERY-2026-10-09.md), [651 Node·39 browser/834 checks·build/318 module guard](verification/G5-B1-CLOSEOUT-2026-10-09.json) |
| G5-B1 중단 당시 기록 | [Node/타입까지의 checkpoint](implementation/G5-B1-QUERY-CHECKPOINT-2026-10-09.md), [당시 집중 Node 15개](verification/G5-B1-CHECKPOINT-2026-10-09.json). 최신은 B1 closeout |
| G5-A3 Apply·잠금·경합 구현/검수 | [게시 전 취소·owner 재검증·새 요청 보호·결과 인계](implementation/G5-A3-COPILOT-APPLY-2026-10-08.md) |
| G5-A3 전체 검증 요약 | [643 Node·38 browser/799 checks·타입/build/313 module guard](verification/G5-A3-CLOSEOUT-2026-10-08.json) |
| G5-A2 패널 draft·요청 context 구현/검수 | [activity 왕복, off-panel 응답, context 변경과 늦은 제안 폐기](implementation/G5-A2-COPILOT-CONTEXT-2026-10-08.md) |
| G5-A2 전체 검증 요약 | [Node/browser·타입/build/architecture와 mock 연결 경계](verification/G5-A2-CLOSEOUT-2026-10-08.json) |
| 일반 각도 치수 C1 계산·branch·표시 기하 | [실제 계약·오류·검수와 UI/명령/저장 미완료 경계](implementation/B3-C1-ANGULAR-DIMENSION-2026-10-08.md) |
| 일반 각도 치수 C2/C3 참조·명령·UI·출력 | [두 source remap·v14·검토/Apply·브라우저 검증과 남은 범위](implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md) |
| B3-C3 전체 검증 요약 | [636 Node·36 browser/758 checks·타입/build/308 module guard](verification/B3-C3-CLOSEOUT-2026-10-08.json) |
| B3-C1 전체 검증 요약 | [628 Node·기존 browser 35/734·타입/build/304 module guard](verification/B3-C1-CLOSEOUT-2026-10-08.json) |
| G5-A1 응답·취소 경계 구현/검수 | [stalled body·late response 종료, ownership 주입 거부·복구 workflow](implementation/G5-A1-GATEWAY-BOUNDARY-2026-10-06.md) |
| G5-A1 전체 검증 요약 | [618 Node·35 browser/734 checks·빌드/타입/301 module guard](verification/G5-A1-CLOSEOUT-2026-10-06.json) |
| G4·CAD 최신 구현 및 검수 | [원본·component 인계·state/time/link·SVG·DXF review·지름 v13](implementation/G4-CAD-BASICS-2026-10-06.md) |
| G4·CAD 전체 검증 결과 요약 | [613 Node·35 browser/729 checks·빌드/타입/301 module guard](verification/G4-CAD-CLOSEOUT-2026-10-06.json) |
| CAD 구현 카드·선행 조건·책임 분리 | [B0–B5 보완 및 X1–X7 신규 기능 설계](product/CAD-BASICS-IMPLEMENTATION-PLAN.md) |
| 공개 코드 재사용·직접 구현·기존 CAD/제작 계획 연결 | [코덱·PSD/폰트/벡터/PPTX 후보와 native 이미지 원본 교체](product/CREATIVE-REUSE-IMPLEMENTATION-PLAN.md) |
| G3-5 자원 최적화·전체 자동 회귀 마감 | [동일 fixture 전후 수치·수명 검사·남은 외부 평가](verification/G3-5-IMAGE-RESOURCES-2026-10-06.md) |
| 원본 교체·TIFF·이미지 편집 연결 검수 | [실제 preview/Cancel/Apply·source identity·전체 검사·제한](verification/CREATIVE-IMAGE-HANDOFF-2026-10-06.md) |
| 수정 위치·영향·문서 갱신 | [CHANGE-GUIDE](architecture/CHANGE-GUIDE.md) |
| 다음 구현 전 최종 기획 | [IMPLEMENTATION-READINESS-2026-10-05](IMPLEMENTATION-READINESS-2026-10-05.md) |
| 기능 기준·제품 방향 | [CAD-BASICS](product/CAD-BASICS.md), [PRODUCT-ROADMAP](product/PRODUCT-ROADMAP.md), [통합 제작 제품 방향](product/UNIFIED-CREATIVE-SUITE-ROADMAP.md) |
| 공통 모델·확장 구조 | [공통 기하](architecture/SHARED-GEOMETRY-ARCHITECTURE.md), [디렉토리 규칙](architecture/DIRECTORY-STRUCTURE.md), [스케치](architecture/PARAMETRIC-SKETCH.md), [재생성](architecture/PARAMETRIC-REGENERATION.md), [수식](architecture/VARIABLES-AND-EXPRESSIONS.md), [live 패턴](architecture/LIVE-PATTERNS.md), [오픈소스 제작 통합](architecture/OPEN-SOURCE-CREATIVE-INTEGRATION-2026-10-05.md) |
| 웹 런타임 자원 | [WebGPU·Worker·캐시 전략](architecture/WEB-RUNTIME-RESOURCE-STRATEGY.md) |
| 수학 애니메이션 | [Manim 연동 계획](architecture/MANIM-MATH-ANIMATION-INTEGRATION.md) |
| BIM·RVT·Axo | [RVT·IFC·Axonometric 연동 계획](architecture/RVT-IFC-AXONOMETRIC-INTEGRATION.md) |
| BIM 출판·외부 앱 오케스트레이션 | [BIM 목록·검토·출판](architecture/BIM-PUBLICATION-ORCHESTRATION.md) |
| 최신 편집 구현 | [구간 Trim·참조 재연결](implementation/CONTOUR-TRIM-REFERENCES-2026-10-04.md), [곡선 작업 연결](implementation/CURVE-WORKFLOW-2026-10-04.md), [구속·스냅](implementation/EXTENDED-SKETCH-AND-SNAPS-2026-10-04.md), [작도 관계](implementation/CONSTRUCTION-GEOMETRY-2026-10-04.md), [아트보드 모델](implementation/ARTBOARDS-2026-10-05.md), [G2 아트보드·벡터·컴포넌트](implementation/G2-ARTBOARD-VECTOR-COMPONENTS-2026-10-05.md), [기본 편집](implementation/BASIC-CAD-CORE-EDITING-2026-10-04.md), [윤곽 구성](implementation/BASIC-CAD-EDITING-2026-10-04.md) |
| G3 이미지 편집 | [G3-1 RasterAsset/ImageNode 기초](implementation/G3-IMAGE-ASSET-2026-10-05.md), [placement·mask·opacity·crop·color adjustment·Artboard PNG/PDF 구현](implementation/G3-2-4-IMAGE-EDITING-2026-10-05.md), [최신 browser·Node·build 검수와 timing sample](verification/G3-2-4-IMAGE-EDITING-2026-10-05.md), [G3-1 당시 기준선](verification/G3-1-IMAGE-WORKFLOW-2026-10-05.md) |
| 캔버스 편집 경험 | [편집 의도](implementation/CANVAS-EDIT-INTENT.md), [직접 편집](implementation/DIRECT-EDIT-EXPERIENCE.md), [구속 이동 안내](implementation/CONSTRAINT-GUIDED-DRAG.md), [대상 선택](implementation/CANVAS-TARGET-EXPERIENCE.md) |
| 검수·성능·한계 | [기본 검수](verification/CORE-VERIFICATION-2026-10-03.md), [작업 흐름 검수](verification/WORKFLOW-VERIFICATION-2026-10-03.md), [편집 벤치마크](verification/CAD-EDIT-BENCHMARK-2026-10-03.md), [성능](verification/PERFORMANCE.md), [UX 점검](verification/UX-AUDIT-2026-10-03.md) |
| 코드 리뷰 | [2026-10-04 구조·의존·테스트 리뷰](reviews/CODE-REVIEW-2026-10-04.md), [interaction 감사·구현·남은 경계](reviews/INTERACTION-AUDIT-2026-10-04.md) |
| 관계 UX 성능 | [Preview/경로 조회 전후 측정](verification/INTERACTION-PERFORMANCE-2026-10-04.md) |
| G0 실행·아트보드 검증 | [실행 환경·원자성·실제 패널 workflow](verification/G0-ARTBOARDS-2026-10-05.md) |
| G1 첫 세션 개선 | [명령 전환·History·포커스·큰 문서 관측 지연](verification/G1-SESSION-CONTINUITY-2026-10-05.md) |
| G1 후속 검수 | [100개 이력 상한·분기·선택/위상 참조·같은 파일 재열기](verification/G1-HISTORY-IDENTITY-2026-10-05.md) |

## 갱신과 삭제 기준

- 현재 구현·최근 전체 검수는 PROJECT-STATE, 다음 실행 순서는 NEXT-STEPS, 기능별 대상·제한은 CAD-BASICS가 소유한다. 로드맵에는 이후 확장과 통과 기준을 둔다. 완료 이력을 루트 문서에 반복하지 않는다.
- 구현 문서는 해당 단계의 사용법·정책·검수, 검수 문서는 측정 조건·출력·한계를 보존한다. 오래된 테스트 수와 “다음” 항목을 최신 판단으로 사용하지 않는다.
- 후속 구현으로 바뀐 제한은 근거 문서를 연결해 갱신한다. 중복된 원칙은 소유 문서에 통합하고, 고유한 기하/측정/검수 근거가 없는 임시 기록은 삭제한다. 삭제·이동 시 들어오는 링크도 갱신하고 `check:architecture`를 실행한다.

2026-10-04 정리: 상태·다음 작업·로드맵의 중복 이력을 줄이고 완료/미완료를 정정했다. `DESIGN-PASS.md`의 유효한 표현 원칙은 [디렉토리 안내](architecture/DIRECTORY-STRUCTURE.md)에 통합했으며 오래된 raw status/build 출력 문서는 삭제했다. 날짜가 있는 고유한 구현·검수 기록은 유지한다.
