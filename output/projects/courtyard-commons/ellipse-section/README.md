# Courtyard Commons — exact ellipse section

기존 도서관·메이커센터의 원본 천창을 그대로 사용한 타원 단면 검증이다. 56부품·9도면·6페이지(기존 A2 5 + 새 A3 1)이며, 기존 7도면은 유지했다.

- `courtyard-commons.webcad.json`: 실제 원본 모델과 전체 도면, schema35
- `courtyard-commons.pdf`: 실제 앱에서 다운로드한 6페이지 PDF
- `skylight-sheet.svg`, `skylight-sheet.dxf`: 새 천창 전체 타원/반쪽 타원호의 정확한 출력
- `page-6.png`: 앱 PDF의 독립 렌더링
- `project-report.json`, `native-project-report.json`: 실제 원본/출력/재열기 검증
- `ellipse-section.*`, `native-report.json`: 작은 원통으로 실제 UI 작성·crop·주석·Undo를 검증한 별도 A4 pilot

Z13500 절단에서 반장축2078.460969mm·반단축1800mm다. 닫힌 타원의 매개변수 seam은 병합해 반쪽 타원호를 하나로 유지한다. 주석은 전체 중심과 실제 crop 끝점에 부착한다. 타원 해치·일반 ellipse HLR/background·spline은 아직 지원하지 않는다. 기존 설계의 프로그램 주석 배치와 대형 편집 성능은 별도 마감 대상이다.
