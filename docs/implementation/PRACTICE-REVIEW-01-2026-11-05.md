# PRACTICE-REVIEW-01 — 요구조건·검사 범위·수정 근거

## 판단 수정

주택 R0/R1은 실무 납품 수준이나 산업디자인 완성으로 인정하지 않는다. 유효한 솔리드, 많은 부품, 검사 통과 수는 공간 품질·시공성·설계 정보 완결성을 입증하지 않는다. 이번 목표는 **무엇을 요구했고, 무엇을 검사했고, 무엇이 부족한지**를 CAD 안에서 추적하고 실제 결함을 수정하는 것이다.

기준 조사:

- [RIBA Plan of Work 2020 공식 설명](https://www.riba.org/work/insights-and-resources/riba-plan-of-work/) 및 [공식 단계별 개요](https://www.riba.org/media/syneeeto/2020ribaplanofworkoverviewpdf.pdf): Technical Design은 제작·시공에 필요한 상세 정보, 역할과 정보 요구를 포함한다. 이를 이 CAD의 품질 평가에 참고하며 한국 인허가 기준으로 적용하지 않는다.
- [buildingSMART IDS 공식 설명](https://www.buildingsmart.org/standards/bsi-standards/information-delivery-specification-ids/): 요구 정보를 기계가 검사할 수 있게 명시한다는 원칙을 참고한다. IDS는 IFC 기반이며 이번 JSON 요구조건/보고서는 IDS·IFC·BCF 구현 또는 준수 선언이 아니다.

## 실무 검토에 필요한 입력과 기능

| 검토 축 | 프로젝트가 제공/확정할 정보 | 검사에 추가할 것 | 필요한 제품 기능 / 현재 상태 |
| --- | --- | --- | --- |
| 요구조건 | 용도, 대지, 사용자, 단위, 층 기준, 요구 공간·치수, 담당자, 근거와 가정 | 필수 정보 누락·상충, 임의 기본값 사용 | 현재 쌍별 목적/최소 간격 명시와 근거 JSON 구현. 프로젝트 요구조건 저장·개정은 후속 |
| 공간 사용 | 실 경계, 출입 관계, 가구 사용·수납/유지보수 영역 | 단순 비관통과 최소 여유를 구분, 문 여닫이, 통로 연속성 | 이번 정적 BRep 최소 간격 검사 구현. 기존 native 벽 경로 검사는 제한적. 실/문 그래프·전체 경로·연속 swept envelope는 후속 |
| 계단·층 연결 | FFL, 계단 단수·디딤판·참·머리높이·지지와 난간 연결 | 전체 이동 경로 머리높이, 층 접합, 지지/체결 누락 | R1은 상부 슬래브 8지점 표본에 그침. 계단 의미 모델과 연속 검사 필요 |
| 외피·접합 | 벽/바닥/지붕 재료층, 창호 설치 단면, 방수/단열/배수, 체결/공차 | 겹침·틈, 층의 단절, 배수/관통부 상세 누락 | 정적 쌍별 간격은 이번 도구 사용 가능. 다층 벽·접합 관계·상세 템플릿과 제작 공차는 후속 |
| 도면 | 도면 목록, 축척·표제·개정, 평/입/단/상세 연결, 필수 치수 | 원본/출력 누락·stale, 연관 치수 부재, 시트 누락/축척 불일치 | 이번 inventory 검사 구현. 기존 Output preflight 유지. 치수 체계의 충분성·상세 참조 완결성은 후속 |
| 수정/협업 | 변경 사유, 대상/보존 조건, 검토자, 승인 상태 | 수정 전후 결함, 관련 도면 영향, Undo/Redo·재열기 | 이번 공통 UI/MCP 검사·JSON 내보내기·수정 시 무효화 구현. 영속 이슈 담당/상태·승인 이력은 후속 |
| 구조·설비·법규 | 현장·관할·구조/MEP/방재 설계 및 책임 전문가 | 분야별 요구 누락과 검토 근거 연결 | 자동 판정하지 않음. 외부 검토 기록/근거 연결부터 설계할 것 |
| 설계 품질 | 공간 위계, 비례, 재료, 사용 시나리오, 비교안 | 실제 평면·단면·장면과 전문가 평가 | 테스트 수로 점수화하지 않는다. 모델링 상세량을 미적 품질로 대체하지 않는다 |

## 이번 구현

Copilot의 **실무 검토 · 간격과 도면** 패널과 공통 read 도구 **`cad.coordinationReview`**를 추가했다. 패널과 MCP는 동일한 native 검사 함수를 호출한다. 별도 복제 모델이나 화면 이미지 판독으로 측정을 대체하지 않는다.

- 쌍마다 객체 ID 2개, 검토 목적, `minimumClearanceMm` 필요. 0은 비관통 검사이며 통행 적합성 기준이 아니다.
- 실제 BRep 최단 표면거리와 Common 체적을 함께 검사. 내부에 완전히 포함된 물체는 양수 표면거리가 있어도 체적으로 실패한다.
- 의도적 겹침 주석이 있어도 원 측정값과 실패는 보존한다. 임의 예외 처리 없음.
- 누락/지원 불가/계산 실패/시간 초과는 `unknown`. 요청한 모든 쌍의 행과 검사 수를 남기며 미확인을 통과에 합산하지 않는다.
- native 도면별 원본 연결, 출력 객체, 표시되고 resolved인 연관 치수의 존재, 시트/표제/축척을 검사. 정적 텍스트/치수를 자동으로 연관 치수라고 간주하지 않는다.
- 연관 치수가 하나 있다는 사실은 치수 체계의 완결성이 아니다. 출력 객체가 있다는 사실도 선 표현/단면 품질의 승인 근거가 아니다.
- 문서 ID/revision/generation, 요구조건, 객체 ID, 측정값·허용오차, 미검사 범위를 JSON으로 내보낸다. 문서/선택/요구 변경 시 UI 결과를 제거하며 계산 중 문맥 변경도 거부한다.
- UI는 부재 0개면 도면만, 2–7개면 모든 쌍을 검사한다. MCP는 최대 24개 명시 쌍·32개 도면. 전체 361부품을 검사했다고 주장하지 않는다. 한 쌍 최대 8초, 전체 최대 30초.
- gateway의 `실무 검토`/`도면 검토`/`coordination review` 요청 범위에 공통 조회 도구를 노출했다. 로컬 임의 자연어 해석의 완성이나 실제 외부 모델 사용 검증은 아니다.

전체 판정은 결함이 있으면 `issues-found`, 없더라도 `incomplete`. 분야별 전문가 검토와 미확인 요구가 남는 한 자동 납품 승인을 내지 않는다. 사용자 문서 스키마나 원본을 읽기 도구가 변경하지 않는다.

## 실제 주택에서 발견한 결함과 수정

검토 화면 (local-only, not in repository: `output/projects/three-storey-house/coordination/review.html`) · 원본 CAD (local-only, not in repository: `output/projects/three-storey-house/coordination/house.webcad.json`) · 요구조건 (local-only, not in repository: `output/projects/three-storey-house/coordination/requirements.json`) · 수정 전 (local-only, not in repository: `output/projects/three-storey-house/coordination/r1-review.json`) · 수정 후 (local-only, not in repository: `output/projects/three-storey-house/coordination/repaired-review.json`).

1. R1 생성 코드는 주방 통로를 1200mm로 설명했으나, 아일랜드 상판과 벽측 상판의 실제 간격은 **1120mm**였다. 기존 검사는 관통 여부만 확인하므로 통과했다. 1200mm는 이 과제의 설계 목표이며 법정 최소치가 아니다.
2. 아일랜드 본체와 상판의 원본 2D를 Y+80mm 이동하는 단일 native batch로 **1200mm**를 확보했다. 주변 1층 벽 9개와의 상판 관통도 재검사했다. 이 수정은 실제 통행 경로 전체나 가구 사용성 승인이 아니다.
3. 2층 침대/책상 기존 수정은 재검사 통과. 1층 서/북 벽 접합 중복은 여전히 실패한다.
4. 5개 도면은 원본/출력 연결이 유지되지만, 각 도면의 연관 치수와 native 시트 배치가 없어 **10개 항목 미확인**이다. 기존 HTML/SVG 출력은 native 시트와 같지 않다.
5. 12쌍 모두 실제 측정. 수정 후 11쌍 기준 충족/1쌍 실패, 도면 inventory 20행 중 10행 존재 확인/10행 미확인. 이는 설계 완성도 점수가 아니다.
6. 단일 Undo/Redo는 revision 외 문서 전체를 복원하고, 수정본 저장/재열기도 일치한다. R1은 보존했다. 새 보고서에 각 native 파일의 SHA-256을 기록한다. 이번 수정본은 native+GLB이며 새 STEP 납품 검증은 하지 않았다.

## 검증

- 결함 주입: 비관통 5mm 간격이 요구 10mm에 실패 → 원본 이동 → 통과 → Undo 실패 → Redo 통과.
- 완전 포함 양수 표면거리, 의도 겹침 유지, 누락/비BRep/실패/시간초과, 잘못된/중복 요청, 계산 중 문맥 변경을 검사.
- 도면 누락·stale·출력 누락·연관 치수 부재/숨김·시트 결함 검출. 실제 연관 치수 생성으로 존재 검사 해소.
- 공식 MCP SDK가 native runtime을 통해 같은 5mm 실패를 반환하고 문서/Undo를 보존함을 확인.
- 실제 Chromium/Worker에서 입력·검사·JSON 저장·대상 선택·수정 시 무효화·Undo/재검사 10개 확인.
- 대상 Node 검사 합계 **33개 통과**(신규 9 + output preflight 5 + MCP runtime 4 + MCP server 5 + 코파일럿 연결 10, 두 실행의 중복은 제외). 실제 UI/Worker **10개 통과**. `tsc -b`와 Vite production build, architecture 927모듈/문서 링크 검사 통과. 전체 저장소 테스트 스위트를 재실행한 것은 아니다. Vite의 기존 큰 번들 경고는 남는다.
- 타입 검사 중 기존 OCCT spline refit enum 바인딩의 `{}`/`GeomAbs_Shape` 선언 불일치를 발견해 생성자 인자 타입으로만 명시했다. 런타임 수치나 알고리즘은 변경하지 않았다.

재현 (저장소 루트):

```powershell
pnpm --filter @agent-webcad/web exec tsx --test tests/coordinationReview.test.ts tests/outputPreflight.test.ts tests/cadMcpRuntime.test.ts tests/cadMcpServer.test.ts tests/copilotConnection.test.ts
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=coordinationReview
pnpm --filter @agent-webcad/web exec tsx scripts/verifyHouseCoordination.ts
pnpm --filter @agent-webcad/web exec tsx scripts/buildHouseCoordinationReview.ts
pnpm --filter @agent-webcad/web check:architecture
pnpm --filter @agent-webcad/web build
```

## 이어서 구현할 순서

1. **외벽–창호–바닥 한 접합부**: 명시적인 재료층/부품 역할과 연결 요구를 저장하고, 겹침/틈/단열·방수 단절 및 설치/교체 공간을 상세 단면에서 검토한다. 단순 box 추가로 대체하지 않는다.
2. **요구조건·이슈의 영속 저장**: 담당자, 근거, 적용 범위, 버전, 수정 전후 증거, 미확인/확인필요/해결 상태. 형상이 바뀌면 해결 근거를 재검사 대상으로 돌린다. JSON 수동 보관은 현재 임시 범위다.
3. **실–문–층의 의미 관계**: 생활/정비 영역, 문 회전 영역, 연속 경로, 계단으로 확장. 가구 2개 사이 최단거리로 보행 가능을 선언하지 않는다.
4. **도면 요구 목록과 치수 연결**: 전체/부분/개구부/레벨 치수, 상세 참조, 평·입·단면 수정 영향. 실제 UI와 MCP로 같은 수정을 한 뒤 도면 재발행까지 인계 검사.

각 단계의 완료 기준은 결함 사례를 검출하고, 수정 후 관련 요구를 다시 검사하며, 미지원 범위를 설명할 수 있는 것이다. 100% 산업용·자동 설계 완성을 단계 종료 조건으로 가장하지 않는다.
