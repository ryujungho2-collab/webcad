# CAD-COMPONENT-01 — 2D 블록 정의의 선 끝점 편집

**Components → 정의 선택 → Edit component line**에서 선 멤버와 Start/End를 선택한다. 블록 로컬 평면의 좌표를 입력하고 **Review component line edit**을 눌러 변경 전후를 비교한다. **Apply**는 정의를 갱신하고 **Cancel**은 초안을 닫는다.

| 경로 | 구현 범위 |
| --- | --- |
| 정의 편집 | 안정적인 ID가 하나로 해석되는 직접 선 멤버 한 개, 끝점 한 개. 표준 XY/XZ/YZ 평면 좌표. 누락·중복 ID, 퇴화 선, 평면 밖 형상 및 같은 값은 거부한다. |
| 기하 | 기존 `drawingWorldToModel`과 `drawingTransformAfterEdit`를 사용한다. 정의 내부 멤버에 회전·스케일이 있어도 반대쪽 끝점이 고정된다. |
| 상태 | `update-block`의 검증된 끝점 편집 옵션으로 저장한다. 인스턴스는 기존 정의 참조를 평가한다. 인스턴스 Transform, 원본 도형, 독립 복사본, 토폴로지 ID 및 오버라이드는 유지한다. |
| 검토 | `BlockLineEditor.tsx`와 기존 `previewCadCommand`, `CommandReview`, `applyCadPlan`을 사용한다. 검토한 제안의 두 선을 패널에서 비교한다. 문서 변경 후에는 재검토가 필요하며, 같은 ID의 파일을 다시 열어도 이전 제안은 적용할 수 없다. |
| 저장 | 기존 블록 멤버 점과 Transform 필드를 사용한다. 새 스키마나 파일 버전이 필요하지 않다. Apply 한 번은 Undo 한 항목이다. |
| 범위 | 정의 변경은 공유 배치의 형상에 반영된다. 이 동작은 배치 자체의 편집과 별개다. 중첩 경로 탐색, 여러 멤버 일괄 편집, 3D 및 DXF 확장은 범위 밖이다. |

핵심 경로는 `precision/blockLineEdit.ts`, `state/registerDraftingCommandHandlers.ts`, `state/documentPlans.ts`, `explorer/views/{ComponentsPanel,BlockLineEditor}.tsx`다. 기존 Components의 **Update from selection**은 원래 동작을 유지한다.

`block-update`와 `block-editor-session`은 제한된 현재 지원 범위를 `partial`로 기록했다. 과거 105 BEDIT와 106 BCLOSE의 판정 및 매핑은 보존했다. [현재 인벤토리](WEBCAD-CAPABILITY-INVENTORY.json)

## 이번 검증

| 검사 | 결과 |
| --- | --- |
| 관련 단위·통합 7개 파일 | **64/64 통과**, 실패 0, skip 0. 회전·비균일 스케일 멤버, 잘못된 끝점, 중복 ID, 검토 만료, 기존 블록 편집·출력·온톨로지 포함 |
| Edge `blockLineEdit` | **12/12 통과**. 전후 비교, 취소, 오래된 검토안 차단, 두 배치의 뷰포트 갱신, 원본·독립 복사본·오버라이드 보존, Undo/Redo, 네이티브 다운로드·재열기 |
| Edge `componentsWorkflow` | **13/13 통과**. 기존 정의 생성·삽입·선택에서 갱신 및 출력 회귀 |
| Workspace 빌드 | **통과**, Vite 번들 크기 경고 유지 |
| 아키텍처 검사 | **통과**, 955개 모듈 |
| `git diff --check` | **통과** |

대표 브라우저 도형은 XY이며 인스턴스 하나에 90° 회전을 적용했다. 첫 집중 실행의 import 이름 오타와 테스트 fixture의 누락된 스타일 필드를 수정했다. 최종 실패는 없다. 전체 suite, 구버전 앱 왕복, 별도 XZ/YZ 브라우저 및 중첩 블록 편집 검증은 미실행이다. 이전 카드의 검사 결과는 각각의 보고서에 남겨 두었다.

```powershell
pnpm --filter @agent-webcad/web exec tsx --test tests/blockLineEdit.test.ts tests/draftingBlockBatch.test.ts tests/drawing-editing/explodeBlock.test.ts tests/drawing-editing/blockStretch.test.ts tests/vectorStyle.test.ts tests/exportModel.test.ts tests/ontologyCapabilities.test.ts
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=blockLineEdit
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=componentsWorkflow
pnpm build
pnpm --filter @agent-webcad/web check:architecture
git diff --check
```

로그는 `tmp/cad-component-01-*.txt`에 있다. 대표 결과는 `output/verification/cad-component-01/`의 `browser-report.json`과 `component-line-review.png`다. 이 카드의 검증 기준으로 ONTOLOGY-RELATION-01에 진입할 수 있다.
