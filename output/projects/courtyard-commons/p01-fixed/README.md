# Courtyard Commons — P0/P1 수정 검증

File → Open에서 `courtyard-commons.webcad.json`을 연다. Model views의 `01 Courtyard axonometric`으로 모델을 확인한다. Assembly and drawings에서 저장 단면 Review/Apply 및 저장 시트 세트를 확인한다.

56부품·2,425.76㎡ / 평면 3개·단면 2개·남측/동측 입면 2개 / A2 1:100 5페이지. `sheet-1.svg`~`sheet-5.svg` 및 DXF, 실제 앱 PDF와 native-report, 성능 report를 같은 폴더에 둔다.

첫 analytic HLR 범위는 선/원/원호다. 타원/스플라인은 거절하며 경사 채광부를 입면에서 제외했다. 평면의 배경 투영·해치·건축 기호와 주석의 공간별 앵커는 후속 작업이다. 졸업설계 제출 완성본이 아니다.

재현: `apps/web`에서 `npx tsx scripts/courtyardP01.ts`, `node scripts/browserChecks.mjs --page=courtyardStudio --artifacts`.

PDF 검증 출력은 72dpi이다. A2 5페이지의 96dpi 출력은 기존 aggregate pixel 한도를 넘으므로 UI에서 명시적으로 거절한다. 대형 recovery checkpoint는 압축 저장하며 portable WebCAD JSON은 변경하지 않는다.
