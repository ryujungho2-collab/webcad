# CAD-DIMSTYLE-01 — 이름 붙인 선형 치수 표시 설정

선형 치수 하나를 선택하고 **Properties → Dimension styles**에서 이름을 입력한 뒤 **Save dimension style**을 누른다. 대상 선형 치수를 하나 이상 선택하고 **Saved preset → Apply dimension style**을 실행한다.

- 프리셋에는 길이 단위, 소수 자릿수, 문자 높이, 화살표 크기만 저장한다. 원본에 명시값이 없으면 기존 기본값(mm, 2, 4, 3)을 확정한다.
- 적용은 대상별 기존 스타일에 네 값을 복사한다. 치수 문자 오버라이드, 문자 간격, 종이 배율, 치수선 위치, 측정점, 구동값, 소스 ID 및 피처 입력은 유지한다. 문자 오버라이드가 있으면 해당 문자열이 우선한다.
- 명령 하나가 History 한 항목이다. 같은 값을 다시 적용하면 History를 추가하지 않는다. 잠긴 레이어, 숨김, 없는 ID, 선형 치수 이외의 대상을 섞으면 전체 적용을 거부한다.
- 이름 앞뒤 공백을 제거하고 대소문자와 유니코드 호환 표기가 같은 이름을 중복으로 처리한다. 이름은 최대 80자, 문서당 최대 100개다. 기존 치수 Inspector의 범위에 맞춰 소수 자릿수 0–6, 높이와 화살표 크기 0.01–10,000을 허용한다.
- 선택적 `dimensionStylePresets`를 기존 네이티브 파일 버전 안에서 저장한다. 프리셋이 없는 파일을 열면 현재 목록도 비워진다. 이전 앱은 프리셋 UI와 목록 보존을 지원하지 않으며, 이미 적용된 값은 기존 치수 스타일 필드로 저장된다. 이전 앱 왕복 실행은 하지 않았다.

## 코드와 출력

| 경로 | 변경 및 지원 |
| --- | --- |
| Inspector | `DimensionStylePresets.tsx`를 `PropertiesPanel.tsx`에 연결. 단일 선택 저장 및 다중 선택 적용 |
| CommandBus | `registerDimensionCommandHandlers.ts`에 저장·적용 등록. 기존 치수 스타일 해석과 선택 검증을 재사용하고 기하 재생성은 생략 |
| 파일과 History | `DimensionStyle.ts`에서 필드·이름 검증, `CadDocument.ts`와 `serialization.ts`에 저장 계약 추가. 파일 교체와 스냅샷 복원에서 목록 교체 |
| 뷰포트 | 기존 `resolveDimension`과 치수 렌더러가 네 값을 사용. Edge에서 Inspector 표시와 실제 뷰포트 렌더 완료 확인 |
| 활성 평면 SVG | 기존 선분과 텍스트 내보내기를 통해 네 값을 사용. 실제 다운로드에서 형식화된 텍스트와 문자 높이 확인. 화살표 선분은 집중 테스트로 비교 |
| 벡터 PDF Plot | 선분과 텍스트를 통해 네 값을 사용. Plot의 화살표 선분과 생성 PDF의 텍스트·글꼴 크기를 집중 테스트로 확인. PDF 뷰어 픽셀 비교와 아트보드 PDF의 별도 브라우저 검증은 미실행 |
| DXF | 이름 붙인 프리셋이나 DIMSTYLE 교환은 이번 범위 밖 |

`dimension-edit`의 명령·UI·지원 범위를 갱신했다. 032의 2026-11-05 부분 지원 판정과 기존 매핑은 보존했다. [현재 인벤토리](WEBCAD-CAPABILITY-INVENTORY.json)

## 이번 검증

| 검사 | 결과 |
| --- | --- |
| 집중 테스트 7개 파일 | **62/62 통과**, skip 0. 다중 대상 원자성, Undo/Redo, 파일 검증과 교체, 기존 치수 및 온톨로지 포함 |
| Edge `dimensionStylePresets` | **10/10 통과**. Inspector 저장, 두 치수에 적용, 필드 비교, Undo/Redo, 실제 SVG 다운로드, 네이티브 다운로드 및 재열기 |
| Edge `draftingVisibility` | **17/17 통과**. 기존 치수·도면 가시성 및 출력 회귀 |
| Workspace 빌드 | **통과**. Vite 번들 크기 경고는 기존과 동일 |
| 아키텍처 검사 | **통과**, 950개 모듈 |
| `git diff --check` | **통과** |

이번 결과에 실패한 검사는 없다. 이전 카드의 통과 기록은 해당 보고서에 있다. 전체 suite, 구버전 앱 교환, DXF DIMSTYLE 교환은 실행하지 않았다.

```powershell
pnpm --filter @agent-webcad/web exec tsx --test tests/dimensionStylePresets.test.ts tests/dimensionWorkflow.test.ts tests/dimensionGeometry.test.ts tests/angularDimensionWorkflow.test.ts tests/diameterDimension.test.ts tests/artboardAnnotations.test.ts tests/ontologyCapabilities.test.ts
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=dimensionStylePresets
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=draftingVisibility
pnpm build
pnpm --filter @agent-webcad/web check:architecture
git diff --check
```

실행 로그는 `tmp/cad-dimstyle-01-*.txt`에 있다. 브라우저 세부 결과와 대표 화면은 `output/verification/cad-dimstyle-01/`의 `browser-report.json`, `dimension-style-preset.png`에 있다.

CAD-LAYER-01, CAD-STYLE-01, CAD-ORDER-01 변경 위에 이 카드를 완료했다. 이 카드의 검증 기준으로 CAD-COMPONENT-01에 진입할 수 있다.
