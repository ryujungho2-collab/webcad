# Courtyard Commons — CAD 검증 프로젝트

3층 중정형 도서관·메이커센터. 가상 54×44m 대지 / 연면적 2,425.76㎡ / 56개 등록 부품.

## 프로젝트 열기

앱의 File → Open에서 `courtyard-commons.webcad.json`을 연다. View → Model views에서 `01 Courtyard axonometric`을 Recall하면 건물 전체를 볼 수 있다. 모델 트리에서 L1/L2/L3/roof 레이어를 분리해 층별 구성을 확인한다. 도면 시트는 Assembly and drawings의 저장 시트 세트에서 확인한다.

- `courtyard-commons.webcad.json`: 편집 가능한 최종 검증 문서.
- `model-before-drawings.webcad.json`: 도면 생성 전 모델 체크포인트.
- `baseline.webcad.json`: 출입구 폭 변경·시트 생성 전 체크포인트.
- `sheet-1.svg` ~ `sheet-4.svg`, 같은 이름의 DXF: A2 / 1:100 도면 출력.
- `courtyard-commons.pdf`: 실제 앱 PDF 다운로드 경로에서 생성하는 검수용 출력.
- `axonometric.png`: 실제 Three.js 화면 캡처.
- `report.json`: 면적·체적 변경·지원 한계·명령 소요 시간.
- `native-report.json`: 실제 브라우저 편집·출력·재열기 검수 결과.
- `DESIGN-BRIEF.md`: 설계 의도와 프로그램, 설계 미완료 사항.

## 검증 범위와 한계

공개 CAD 명령으로 기하 모델을 만들고 실제 UI에서 개구부 편집·Undo/Redo·출력·저장 재열기를 검사한다. 모델을 처음부터 전부 마우스로 작성한 검증은 아니다. 평면 3개와 단면 2개를 자동 시트에 배치했다. Boolean 형상/돌출 계단의 일반 입면, 경사 채광부의 타원 단면은 현재 제품에서 생성하지 못하므로 완료 도면에 포함하지 않았다.

출입구 4,000→4,800mm 변경은 체적과 Undo/Redo를 검사한다. 이 변경은 선택한 절단면의 선을 바꾸지 않아 참조 재연결이 필요하지 않았다. 별도 실제 UI 검증의 1층 남측 창 폭 28,000→30,000mm 변경은 1층 평면의 참조 소멸을 검사하고 원래 상태로 되돌린다.

A3 1:100 배치는 실패하여 A2로 확장했다. A2 4페이지 배치 Apply는 약 118초였으며 Review 시간은 제외한 값이다. 주석 추가도 약 3초씩 소요되어 반복 설계에는 성능 보충이 필요하다. Native 시간은 Vite 개발 서버와 자동화 브라우저의 측정값이며 사용자 GPU 성능으로 일반화하지 않는다.

졸업설계 제출 완성본이 아니다. 입면·상세·승강기·피난·구조·설비·대지 조사와 공간 설계의 발전이 남았다. 특정 대학의 공식 심사 기준 충족을 주장하지 않는다.

## 재현

`apps/web`에서 `npx tsx scripts/courtyardStudio.ts`로 모델과 도면을 생성한다. `--resume`은 baseline 체크포인트 이후부터 재개한다. `node scripts/browserChecks.mjs --page=courtyardStudio --artifacts`로 실제 UI 검수를 실행한다.

다음 구현: **G6-D6-P1 성능 → G6-D4-R1 단면 편집/참조 → G6-D3-B1/B2 일반 입면/숨은선 → G6-D4-H1 건축 도면 표현 → X6-D2-E1 타원 단면**.

PDF 시각 검수: 현재 평면은 cut-only 교선이므로 절단면 아래 계단/중정 경계 등 배경 정보가 없다. 주석 리더는 작성 스크립트의 앵커 선택 때문에 한 점에 모인다. 제출용 완성 도면이 아닌 결함 발견용 증거로 사용한다. 자세한 판정은 `docs/product/COURTYARD-COMMONS-CAD-AUDIT-2026-10-12.md`를 참조한다.

P0/P1 수정 후 최신 검증 프로젝트는 `p01-fixed/README.md`를 따른다. 원래 5도면 문서는 비교 fixture로 유지한다.
