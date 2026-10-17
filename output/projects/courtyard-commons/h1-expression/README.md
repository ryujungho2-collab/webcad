# Courtyard Commons — H1 건축 표현 검증

3층 중정형 도서관·메이커센터의 56부품 모델에 건축 도면 표현을 적용했다. 3평면·2단면·2입면, 1:100 A2 5페이지다.

- `courtyard-commons.webcad.json`: 앱에서 여는 원본 및 도면, schema34
- `sheet-1.svg` … `sheet-5.svg`, 대응 DXF: 실제 소유 출력
- `courtyard-commons.pdf`: 실제 앱의 PDF Worker 다운로드
- `report.json`: 도면별 교선/배경/해치/경고와 단일 실행 시간
- `native-report.json`, `native-small-report.json`: 실제 UI/Worker 검증

절단선을 굵게, 남긴 부분의 가시 배경선을 얇게, 닫힌 절단 영역을 종이 간격 해치로 표시한다. 구멍은 비운다. 계단 일부의 열린 경계는 경고 후 해치를 생략한다. 기존 프로그램 주석의 배치와 장거리 리더는 아직 설계 표현 마감이 필요하다. ellipse/spline, 건축 기호, 재료/BIM 의미는 다음 범위다.
