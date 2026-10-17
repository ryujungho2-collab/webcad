# Courtyard Commons R5 — CAD workflow closeout

앱의 File Open으로 [편집 가능한 프로젝트](courtyard-commons.webcad.json)를 연다. 56부품·14연관 도면·10페이지·schema38이다. 층고/중정/계단/출입구 원본 수정, 12개 공간 주석과 3개 live 중정 치수를 포함한다.

- [평면과 단면 / A2 4쪽](issue-plans.pdf)
- [네 방향 입면 / A2 4쪽](issue-elevations.pdf)
- [출입구 검토 / A3 1쪽](issue-entry.pdf)
- [천창 검토 / A3 1쪽](issue-skylight.pdf)

같은 폴더의 페이지별 SVG/DXF는 CAD export 산출물이다. PDF는 앱에서 96dpi로 출력했고 10쪽을 독립 렌더링하여 확인했다. File PDF에서 실제 publication set을 선택한다. 10쪽 동시96dpi는 현재 메모리 예산을 초과하므로 네 권으로 출력한다.

[프로젝트 수치](report.json), [실제 UI/출력/재열기 검증](native-report.json), [구현과 남은 범위](../../../../docs/implementation/G6-D6-W1-ARCHITECTURAL-ISSUE-2026-10-13.md).

개념 설계 검증 fixture다. 구조·피난·법규·접근성과 시공 상세는 검증하지 않았다. 다음 보충은 대형 연관 출력 성능 P2다.
