# G6-D6-W1 건축 프로젝트 마감 — 2026-10-13

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

중정형 도서관·메이커센터의 CAD 설계 변경 → 연관 도면 갱신 → 주석/시트 → 발행 → 재열기 첫 workflow를 마감했다. 졸업설계의 공간·구조·법규 심사를 완료했다는 의미는 아니다.

## 실제 구현

- 저장 투영의 반대 관찰 방향을 UI Review/Apply와 연결했다. 수직 방향을 유지하며 실제 반대쪽 가림을 계산한다. 관찰 면 변경은 이전 edge 참조를 폐기해 다른 물리적 면에 조용히 연결하지 않으며 Undo는 정확히 복원한다.
- 건축 입면의 숨은선 생략을 추가했다. 실제 HLR occlusion은 유지하고 숨은 출력만 제외한다. 표시 변경의 가시 edge identity, 잠금/stale/Undo 계약과 schema38 저장을 검증했다.
- 실제 단면 background에 연관 치수를 연결했다. 종이 배치/축척 후에도 모델 mm를 측정하며 해치 decoration은 치수 원본에서 제외한다.
- primitive/돌출/혼합 sketch control 편집을 원자적 batch로 묶었다. 중간의 임시 비폐합 상태 대신 최종 유효 형상에서 의존 도면을 갱신한다. source 이름과 주석 이름도 읽기 쉽게 유지한다.
- File PDF가 CAD publication set을 번호순 전체 묶음으로 출력한다. 특정 한 페이지도 명시적으로 선택할 수 있다. 기존 raster 메모리 예산은 유지한다.

## 실제 프로젝트

[편집 가능한 R5와 출력 안내](../../output/projects/courtyard-commons/issued-r5/README.md). 56부품 identity를 유지하며 370개 원본 명령을 한 Review/Apply로 적용했다. 층고4500mm, 중정14×14m, 계단28단·단높이160.714mm·폭1600mm, 출입구5200mm로 변경했다. 실제 바닥 BRep 체적으로 면적812/764.88/764.88㎡, 총2341.76㎡를 확인했다.

14연관 도면, 주석12개, 중정 치수3개를 10페이지/4권으로 발행했다. 평면·단면 1:100 A2 4쪽, 네 방향 입면 1:100 A2 4쪽, 출입구 검토 1:20 A3 1쪽, 천창 검토 1:50 A3 1쪽이다. 전 페이지 SVG/DXF에서 skipped=0이다. PDF는 실제 앱 Worker의 96dpi raster 출력이며 벡터 PDF가 아니다.

## 검증과 한계

전체 Node1188/54 suites fail·skip0, 타입·architecture532·production build 통과. 프로젝트 native35 checks에서 실제 Three.js 계단 높이/폭, 방향/주석/치수 Review·Undo, 네 권 PDF의 물리 페이지 수, schema38 cache 재열기와 깨끗한 history를 검증했다. Poppler로 PDF10쪽을 독립 렌더링해 전부 육안 확인했다. 기존 도면32·입면24·프레임 시트24·conic22를 재실행해 총5 workflows/137 native checks를 통과했다. 전체 browser 재실행은 아니다. 정량 결과는 [정량 검수](../verification/G6-D6-W1-CLOSEOUT-2026-10-13.json)를 따른다.

단일 Node 수정 Review29.526초/Apply0.204초, native 최초 scene41.324초/방향 Review8.573초다. 각기 다른 경로의 단일 측정이며 평균이나 대규모 실시간 성능의 근거로 사용하지 않는다. 다음은 G6-D6-P2 대형 소유 출력 성능 보충이다. 10쪽 동시96dpi 출력은17,814,075 pixels로16,000,000 예산 초과를 명시하고 네 권으로 출력한다.

일반 spline/parabola/hyperbola HLR, 타원 해치, BIM room/stair solver와 구조·피난·접근성/법규 검토는 남는다. 천창과 출입구는 개념 검토 형상이며 시공 상세가 아니다.
