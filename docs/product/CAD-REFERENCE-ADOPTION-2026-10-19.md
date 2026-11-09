# 2D·3D CAD 외부 사례와 적용 기준

검토일: 2026-10-19. 사용자 요청에 따라 SolidCraft뿐 아니라 자연어 모델링, 브라우저 기하, 구속, 도면화, 파일 탐색 사례를 함께 조사했다. **2D와 3D를 함께 최종 제품 범위로 두고, 기존 3D 기반을 활용할 수 있는 과제는 지금 선택할 수 있다.** 제품 목적은 [자연어 CAD 목적](NATURAL-LANGUAGE-CAD-PURPOSE-2026-10-19.md), 실제 착수 순서는 [실행 큐](../../NEXT-STEPS.md#현재-실행-큐)가 소유한다.

후속 구현(2026-10-19): [COPILOT-SOLID-01](../implementation/COPILOT-SOLID-01-2026-10-19.md)에서 아래 A 과제의 첫 지원 범위와 선택 솔리드의 후속 치수 편집을 구현·검증했다. 아래 비교 조사와 평가 후보 명세는 당시 설계로 유지하며 실제 지원 범위는 기능 가이드를 따른다.

이번 산출물은 비교 조사와 적용 설계다. 외부 코드를 제품에 복사하거나 새 의존성을 설치하지 않았으며, 아래 제안은 구현 완료가 아니다. 공식 문서·공개 소스와 현재 작업 트리를 대조했다. SolidCraft GIF의 일부 장면을 브라우저에서 확인했으며 다른 앱을 실행해 성능이나 정확도를 비교한 결과는 아니다.

## 무엇을 어디서 가져올 것인가

각 행의 ‘적용’은 외부 프로젝트의 주장과 구분한 우리 설계 판단이다.

| 사례 / 공식 근거 | 확인한 방식 | 우리 쪽 적용 | 재사용 형태 |
| --- | --- | --- | --- |
| **SolidCraft** — [MCP](https://github.com/tangency-labs/solidcraft/blob/355154fa9bce1ef2993679718daef35f09e849c9/docs/mcp.md), [도구 구현](https://github.com/tangency-labs/solidcraft/blob/355154fa9bce1ef2993679718daef35f09e849c9/crates/mcp/src/tools.rs), [Backend](https://github.com/tangency-labs/solidcraft/blob/355154fa9bce1ef2993679718daef35f09e849c9/crates/mcp/src/backend.rs) | 도구 검색·설계 조회·위상·측정·실행이 공통 엔진으로 연결. 변경 결과에 생성/변경/제거 body를 구분 | 사용 가능한 명령과 입력 조건을 에이전트에 제공하고 실행 결과 ID를 다음 요청의 대상으로 인계. UI·자동화의 명령 구현 공유 | 명령/결과 계약과 작업 흐름을 우선 적용. Rust 커널 도입은 별도 결정 |
| **Zoo Design Studio** — [설계 원칙](https://github.com/KittyCAD/modeling-app/blob/e06f86c3f3c8181029e8fc671142ef5199ee29a8/README.md) | GUI 조작과 KCL 코드가 같은 설계 원본을 수정. 3D 뷰는 호스팅 엔진의 영상 스트림 | 직접 편집과 자연어 편집이 같은 피처/파라미터를 변경하고, 변경 이유와 영향을 함께 표시 | 원본 일치·편집 상호 연결을 참고. 우리 문서를 KCL로 교체하거나 호스팅 엔진에 종속시키는 결정은 아님 |
| **CadQuery** — [모델링 범위](https://github.com/CadQuery/cadquery/blob/33361dc1b5b70bc83ce36f1b34a01ca85dfca80a/README.md), [selector 계약](https://cadquery.readthedocs.io/en/latest/selectors.html) | GUI 없이 파라메트릭 모델 생성. 면/모서리를 방향·종류·위치와 논리 조합으로 선택 | “가장 위의 평면”, “Z축과 평행한 모서리”, “지름 6mm인 구멍”을 구조화된 조회로 해석. 부품 recipe와 치수 변형 평가 참고 | selector 개념을 기존 위상 조회에 맞춰 구현. Python 모델을 브라우저 원본으로 추가하지 않음 |
| **replicad** — [소개](https://replicad.xyz/docs/intro/), [웹 앱 통합](https://replicad.xyz/docs/use-as-a-library/) | OpenCascade 기반 브라우저 모델링 라이브러리. WASM 계산을 Worker에 두고 Three.js 표시와 연결 | 기존 Worker의 계산/표시 경계를 대조하고, 부족한 기하 helper를 개별적으로 평가 | TypeScript/웹 구조와 가까운 소규모 코드·adapter 후보. 기존 커널과 중복 WASM을 싣기 전 이점 측정 |
| **FreeCAD** — [제품 구조](https://github.com/FreeCAD/FreeCAD/blob/871850d6fac66031e24226ab5368d1138f80299e/README.md) | 구속된 2D 스케치→3D 피처→생산 도면, 파라미터 이력 편집, Python API | 3D 수정 후 평면·단면·치수·시트가 갱신되는 과제 참고. 별도 프로그램에서 STEP를 다시 읽어 수치 비교 | 작업 경험·외부 비교 실행 후보. 우리 코드와 같은 OpenCascade 계열이므로 독립 커널 검증으로 표현하지 않음 |
| **SolveSpace** — [구속 기술](https://solvespace.com/tech.pl) | 기하 조건을 방정식으로 표현. 미구속 스케치의 드래그와 3D/작업면 투영 구속을 설명 | 구속 상태·해결 실패·작업면 기준을 명확히 보여주고, 미구속 드래그에서 예상 밖 점프를 평가 | 동작·수학적 원리 참고. 기존 solver와 다른 solver의 소스를 섞어 바로 교체하지 않음 |
| **Online 3D Viewer** — [지원 범위](https://github.com/kovacsv/Online3DViewer/blob/d025663dcdd101527e87971d9ae2cf16f02949b4/README.md) | 다양한 3D 포맷의 브라우저 탐색과 별도 viewer 라이브러리 | 외부 파일의 구조·표시·진단과 가져오기 결과 탐색 참고 | importer/viewer adapter 후보. 표시 성공을 편집 가능한 파라메트릭 모델 복원으로 판정하지 않음 |

SolidCraft의 상세 관찰은 [개별 검토 기록](SOLIDCRAFT-REFERENCE-2026-10-19.md)에 둔다. 참고 대상은 역할별로 넓히되 비슷한 엔진을 여러 개 설치하는 것을 진척으로 세지 않는다.

## 현재 코드와 실제 격차

2026-10-19 작업 트리의 코드를 읽어 확인한 범위다. 새 회귀 테스트를 실행해 기능 완결성을 입증한 표가 아니다.

| 현재 기반 | 확인한 위치 | 외부 사례에서 가져와 보강할 부분 |
| --- | --- | --- |
| 기본 솔리드·Extrude/Revolve/Sweep/Loft/Boolean/Fillet/Chamfer/Shell 계약 | [FeatureContract](../../packages/cad-document/src/FeatureContract.ts), [커널 연산](../../packages/cad-kernel/src/index.ts) | 새 커널 작성보다 기존 연산을 자연어 계획의 도구로 연결 |
| 의존 피처 순서와 변경 후 재생성 | [featureRegeneration](../../apps/web/src/state/featureRegeneration.ts) | 변경한 파라미터·영향 피처·실패 지점을 UI와 에이전트가 같이 읽는 결과 |
| 원본·구속·변수·영향·정확 측정 조회 | [documentQuery](../../apps/web/src/state/documentQuery.ts) | 전체 문서 대신 과제에 필요한 조회를 단계적으로 수행. 조회한 버전과 적용 버전을 대조 |
| 로컬 생성 계획과 preview, 제한된 gateway | [copilotPlan](../../apps/web/src/copilot/copilotPlan.ts), [copilotConnection](../../apps/web/src/copilot/copilotConnection.ts) | gateway의 공개 capability는 현재 create-drawing/create-primitive/move-object. 3D 피처·변수 변경·후속 참조를 연결할 검증된 도구 계약이 필요 |
| 위상 fingerprint와 실제 픽킹 | [topology](../../packages/cad-kernel/src/operations/topology.ts), [brepPicking](../../apps/web/src/viewport/brepPicking.ts) | 면 조건 조회·후보 수·원본 revision·재생성 후 재해석. 위치/면적이 바뀌어도 fingerprint가 항상 유지된다고 가정하지 않음 |
| 공통 계획/명령/트랜잭션과 Worker | [documentPlans](../../apps/web/src/state/documentPlans.ts), [commandBus](../../apps/web/src/state/commandBus.ts), [kernel.worker](../../apps/web/src/cad/kernel.worker.ts) | 에이전트도 같은 검토/실행/취소/복구 경계를 사용. renderer나 transport별 원본을 추가하지 않음 |

현재의 핵심 격차는 **보유한 3D 연산과 코파일럿이 발견·호출·검사할 수 있는 범위 사이의 차이**다. 실제 provider 연결도 미완료이므로 도구 확대와 모델의 자연어 이해 능력을 각각 검증한다. 최신 지원 범위는 [Copilot 가이드](../features/COPILOT.md)를 따른다.

## 우선 적용할 설계 묶음

이 목록은 후속 구현 후보의 상대적 우선도다. 실행 큐에 자동 등록하지 않는다.

1. **명령 발견과 결과 조회.** 명령마다 입력 schema, 단위, 대상 종류, 현재 사용 가능 여부/이유, 영향 및 복구 경계를 노출한다. 결과는 생성·변경·제거한 객체/피처 ID와 진단을 담는다. “방금 만든 구멍”은 마지막 화면 위치보다 실행 결과와 원본 관계로 찾는다. 단순 공개 명령 전체 허용 대신 gateway의 지원 범위를 명시적으로 확장한다.
2. **생성과 수정이 이어지는 3D 과제.** 스케치→돌출→구멍→파라미터 수정 과제를 기존 commands와 plans로 연결한다. 높이를 바꾸기 위해 모델을 지우고 다시 생성하지 않는다. 원본 피처/참조와 한 요청의 Undo 경계를 유지한다.
3. **의미 있는 면·모서리 조회.** body ID, 좌표계, 평면/원통 종류, 방향, 수치 조건으로 후보를 좁힌다. 결과에 후보 ID와 선택 근거를 표시한다. 0개/여러 개/소멸한 참조는 별도 결과로 돌려주며 하나를 임의로 선택하지 않는다. 조건 selector도 영구적인 위상 ID 문제를 자동 해결하지는 않는다.
4. **작업 단계와 피처 영향 표시.** 생성·구속·피처 편집에 맞춰 패널과 선택을 연결하고, 수정 전후 값·영향받는 피처·오류·복구 대상을 표시한다. 피처 의존 이력과 Undo 목록은 서로 다른 정보로 취급한다. 새 타임라인 외형을 먼저 붙이기보다 현재 History/Model/Properties에서 이 정보에 접근하게 한다.
5. **측정과 화면을 같이 사용하는 반복.** 모델 생성 후 bbox·체적·개수·위상/참조 검사와 표준 뷰를 읽고, 요구 조건을 만족하지 못하면 재계획한다. screenshot은 구멍 위치나 가려짐을 보조하고 수치 검사를 대신하지 않는다. 응답은 기본 요약과 필요 시 상세 조회로 나눈다.
6. **3D에서 도면·출력까지 연결.** 생성/후속 수정 후 연관 평면·단면·치수가 갱신되고 저장·재열기·STEP 또는 도면 출력에서 유지되는지 확인한다. 외부 viewer의 포맷 수보다 이 왕복의 의미 보존을 우선한다.

공통 도구 계약의 초안은 `discover → query → plan → review/apply → inspect → revise/export`다. 각 요청은 문서 ID/revision, 명시 단위·좌표계, 검증된 대상과 전제 조건을 사용한다. 실패 결과에는 실패한 단계·이유·복구 상태를, 성공 결과에는 변경 객체와 검사 요약을 남긴다. 이는 인터페이스 설계이며 현재 실행 가능한 API 명칭은 아니다.

## 첫 3D 평가 과제 후보

숫자와 판정식을 먼저 정해 둔다. 아래는 우리가 작성한 평가 명세이며 아직 실행 결과가 없다. 한 사례만 외워서 통과하지 않도록 치수·표현을 바꾼 별도 평가 요청도 둔다.

### A. 구멍 네 개가 있는 판

- 요청: “80×50×4mm 판을 만들고, 각 모서리에서 두 방향으로 10mm 들어온 위치에 지름 6mm 관통 구멍을 네 개 만들어줘.”
- 좌표: 바닥 XY, 원점은 판의 왼쪽 아래, +Z로 두께. 구멍 중심은 (10,10), (70,10), (10,40), (70,40)mm.
- 후속 요청: “폭을 100mm로 늘려도 모서리에서 10mm 거리는 유지해줘.” 오른쪽 구멍 X가 90mm로 갱신되어야 한다. 단순 좌표 고정과 관계 유지의 차이를 검사한다.
- 판정: 각각 연결된 유효 솔리드 1개, bbox 80×50×4 → 100×50×4, 반지름 3mm의 관통 원통면 4개와 중심/축 확인. 체적은 `80*50*4 - 4*pi*3^2*4` → `100*50*4 - 4*pi*3^2*4`mm³.
- 편집 가능한 원본/관계, Undo/Redo, 저장·재열기, STEP 재열기에서 같은 형상 조건을 확인한다. STEP는 기하 교환이며 우리 피처 이력 보존 파일과 구분한다.

### B. 위가 열린 케이스

- 요청: “외형 80×50×30mm, 벽과 바닥 두께 2mm, 윗면이 열린 케이스를 만들어줘.” 첫 과제는 필렛·나사 보스 없이 직각 케이스로 제한한다.
- 후속 요청: “높이만 40mm로 바꿔줘.” 외형 폭·깊이, 벽/바닥 두께와 열린 방향을 보존한다.
- 판정: `V = W*D*H - (W-2*t)*(D-2*t)*(H-t)`로 22,112 → 27,152mm³. 단면의 내측 폭 76mm·깊이 46mm와 바닥 두께를 확인한다. 체적 하나만 맞는 다른 형상은 탈락이다.
- 불가능한 벽 두께 등 잘못된 입력은 명확히 거절하고 기존 모델과 이력을 보존한다. 이후 보스·패턴·필렛은 별도 과제로 추가한다.

### C. 생성에서 도면 발행까지

- A 또는 B의 동일 원본에서 평면/정면/단면을 만들고 필요한 치수를 배치한다. 모델 치수 변경 후 파생 뷰와 치수의 갱신 또는 명시적 stale/복구 상태를 확인한다.
- 원본 저장·재열기와 PDF/DXF 결과를 따로 검사한다. 카메라 표시·투영선·절단선·해치와 실제 솔리드 기하를 혼동하지 않는다.

기하 허용오차는 과제별로 실행 전에 고정한다. 이 단순 mm 부품의 첫 제안값은 길이 절대 0.001mm, 체적 상대 1e-6이며 출력 정밀도/커널 버전에 따라 근거를 기록해 조정한다. 측정에 사용한 커널·도구 버전, 입력, 기대식과 실제 값, 실패 및 복구를 함께 남긴다. FreeCAD/CadQuery와 우리 엔진은 OCCT 계열을 공유하므로 해석식 검사를 별도로 유지한다. 자연어 평가에서는 지원되지 않는 조건을 누락하거나 임의 좌표로 바꾸는 것도 실패로 센다.

## 출처 고정과 코드 재사용

아래 SHA는 검토 시 GitHub API에서 확인한 기본 브랜치 HEAD다. 문서의 `latest` URL은 움직일 수 있으므로 실제 코드 이식 때는 해당 SHA의 파일과 라이선스를 다시 고정한다. SolidCraft 0.8 GIF의 파일 커밋은 `302dd7e3431523ad711a193b53716ed4e5e09ca1`이며 현재 HEAD와 다르다.

| 프로젝트 | 확인한 HEAD | 저장소 라이선스 표기/원문 |
| --- | --- | --- |
| SolidCraft | `355154fa9bce1ef2993679718daef35f09e849c9` | [MIT](https://github.com/tangency-labs/solidcraft/blob/355154fa9bce1ef2993679718daef35f09e849c9/LICENSE-MIT), [Apache-2.0](https://github.com/tangency-labs/solidcraft/blob/355154fa9bce1ef2993679718daef35f09e849c9/LICENSE-APACHE) |
| Zoo Design Studio | `e06f86c3f3c8181029e8fc671142ef5199ee29a8` | [MIT](https://github.com/KittyCAD/modeling-app/blob/e06f86c3f3c8181029e8fc671142ef5199ee29a8/LICENSE) |
| CadQuery | `33361dc1b5b70bc83ce36f1b34a01ca85dfca80a` | [Apache-2.0](https://github.com/CadQuery/cadquery/blob/33361dc1b5b70bc83ce36f1b34a01ca85dfca80a/LICENSE). GitHub API의 NOASSERTION보다 실제 LICENSE 원문을 기준으로 기록 |
| replicad | `e4b05f67dc4e2393a876ce8c5064a9c93db05bf1` | [저장소 MIT 표기](https://github.com/sgenoud/replicad/tree/e4b05f67dc4e2393a876ce8c5064a9c93db05bf1) |
| FreeCAD | `871850d6fac66031e24226ab5368d1138f80299e` | [LGPL-2.1 원문](https://github.com/FreeCAD/FreeCAD/blob/871850d6fac66031e24226ab5368d1138f80299e/LICENSE) |
| SolveSpace | `8ef723e145fbe3f1d19e74667c59df795d9d3479` | [GPL-3.0 원문](https://github.com/solvespace/solvespace/blob/8ef723e145fbe3f1d19e74667c59df795d9d3479/COPYING.txt) |
| Online 3D Viewer | `d025663dcdd101527e87971d9ae2cf16f02949b4` | [저장소 MIT 표기](https://github.com/kovacsv/Online3DViewer/tree/d025663dcdd101527e87971d9ae2cf16f02949b4) |

실제 가져오는 단위는 helper·adapter·테스트 사례 등으로 작게 정하고 출처 파일/SHA, 수정 내용, 고지와 전이 의존성을 기록한다. 설계 아이디어 참고, 소스 이식, 패키지 도입, 외부 프로그램 비교 실행은 각각 구분한다. 공개 앱의 프런트엔드 라이선스가 호스팅 서비스·커널·샘플 자산의 이용 조건까지 대신하지 않는다.
