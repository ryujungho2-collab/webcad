# WebCAD Capability Ontology (MVP)

2026-11-06. WebCAD에 실제로 있는 기능·명령·제약을 기계가 조회할 수 있게 정리한 **설명용** 모델이다. 실행 여부는 이 모델이 아니라 기존 `validateCommand`, CommandBus 핸들러, Copilot 도구 계획기가 정한다. `preconditions` 문자열을 실행하는 검증 엔진은 만들지 않았다.

- 코드: [apps/web/src/ontology/capabilities](../../apps/web/src/ontology/capabilities/index.ts)
- 인벤토리: [WEBCAD-CAPABILITY-INVENTORY.json](../verification/WEBCAD-CAPABILITY-INVENTORY.json) — `capabilityInventory()` 출력과 같음(테스트로 확인)
- 테스트: [ontologyCapabilities.test.ts](../../apps/web/tests/ontologyCapabilities.test.ts)
- 출발 자료: [AutoCAD 단축키 120개 대응표](../verification/AUTOCAD-SHORTCUT-COVERAGE-2026-11-05.md)

## 재사용한 기존 계약

새 레지스트리를 만들지 않고 기존 정의를 타입이나 대조 대상으로 썼다.

| 계약 | 위치 | 사용 방식 |
| --- | --- | --- |
| 명령 타입 | `CadCommand["type"]` (packages/cad-commands/src/commands.ts) | `commandTypes`의 타입. 없는 명령 이름은 컴파일에서 거부 |
| 명령 검증 | `validateCommand` switch (validator.ts) | 테스트가 모든 명령 타입의 `case` 존재를 확인 |
| 명령 실행 | `createDocumentCommandExecutor` (state/commandBus.ts) | 테스트가 `CommandBus.prototype.registerHandler`를 감시해 핸들러 등록을 실제로 수집 |
| MCP 도구 | `CAD_TOOLS`, `CadToolName` (copilot/cadToolContract.ts) | `mcpTools`의 타입. `readOnly`와 `kind`의 일치를 테스트 |
| 키 라우팅 | `routeCadShortcut`, `routeHistoryShortcut`, `CadShortcutAction` (input/shortcutRouter.ts) | `shortcutActions`의 타입. 실제 라우터로 도달 가능 여부 확인 |
| 명령 팔레트 | `createPaletteCommands` (commands/paletteCommands.ts) | 142개 ID를 런타임에 열거해 `paletteIds` 확인 |
| 대상 분류 | `GeometryRepresentation`, `featureContract` (cad-document) | `targetKinds` 어휘와 객체 분류 브리지 |

## 초안 타입에서 바꾼 점

| 항목 | 변경 | 이유 |
| --- | --- | --- |
| `commandTypes` | `string[]` → `CadCommand["type"][]` | 존재하지 않는 명령을 적을 수 없게 한다 |
| `mcpTools` | `string[]` → `CadToolName[]` | 같은 이유 |
| `targetKinds` | 자유 문자열 → `GeometryRepresentation` 또는 `representation:kind`와 소수의 비기하 대상 | 기존 표현 분류를 재사용하고 객체 브리지와 맞춘다 |
| `executor` 추가 | `command-bus`/`history`/`ui-state`/`file-io`/`read-only`/`none` | Undo/Redo(History 스냅샷)와 화면 동작이 "명령 없는 문서 편집"으로 뒤섞이지 않게 한다 |
| `ui` 추가 | 팔레트 ID, 키 동작, 기타 화면 경로 | UI 접근 경로를 원본 레지스트리와 대조할 수 있게 한다 |
| `priorVerification`, `needsVerification` 추가 | 기존 검증 기록과 미해결 질문 | 이번 실행 결과와 이전 기록을 구분한다 |
| `evidence` | `{file, symbol}` 유지 | 테스트가 파일 존재와 심벌 포함을 확인 |

`kind`와 `support` 값은 초안 그대로다. `unconfirmed`는 "사용자 경로를 찾지 못함"이며 미구현을 뜻하지 않는다.

## 120개 항목 매핑 결과

판정(같은 조작 16 / 다른 조작 50 / 부분 31 / 미확인 23)은 대응표를 그대로 옮겼다. 테스트가 문서 표의 120행을 다시 읽어 번호·입력·판정을 한 줄씩 비교한다. 같은 기능을 가리키는 항목은 하나의 기능으로 묶었다. 예를 들어 007 `F`와 080 `CHA`는 `curve-corner`, 054·055·057은 `base-point-clipboard`, 020·021은 `selection`이다.

기능은 87개다. 지원 44 / 부분 23 / 미확인 20이며, 실행 주체는 command-bus 43 / ui-state 15 / none 20 / file-io 4 / read-only 3 / history 2다. 참조하는 명령 타입은 62개, MCP 도구는 14개다. `extrude`와 `driving-dimension-edit`는 120개 항목에는 없지만 대표 기능 검증을 위해 추가했다.

| 기능 ID | 지원 | 실행 | 명령 | MCP | 대응 항목 |
| --- | --- | --- | --- | --- | --- |
| `draw-2d-curve` | supported | command-bus | `create-drawing` | `curve.polyline` `curve.circle` | 001, 002, 003, 004, 073 |
| `move` | supported | command-bus | `move-object` `move-in-ucs` | `scene.objects` | 009 |
| `base-point-clipboard` | partial | command-bus | `paste-drawing-snapshot` | — | 054, 055, 057 |
| `dimension-annotation` | supported | command-bus | `create-dimension` | `draft.linearDimension` | 025, 026, 029, 033 |
| `dimension-edit` | supported | command-bus | `update-dimension` | — | 032, 036, 093 |
| `driving-dimension-edit` | supported | command-bus | `update-primitive` `update-extrude` `set-sketch-dimension` `set-variable` | `solid.parameter` | — |
| `extrude` | supported | command-bus | `create-extrude` `update-extrude` | `solid.extrude` | — |
| `undo` | supported | history | — | — | 015 |
| `redo` | supported | history | — | — | 016 |
| `trim` | supported | command-bus | `trim-contour` `trim-drawing` | — | 005 |
| `extend` | supported | command-bus | `extend-drawing` | — | 006 |
| `curve-corner` | supported | command-bus | `edit-drawing-corner` | — | 007, 080 |
| `offset` | supported | command-bus | `offset-drawing` `offset-sketch-geometry` | — | 008 |
| `copy-by-points` | supported | command-bus | `duplicate-object` | — | 010 |
| `hatch` | supported | command-bus | `create-drafting` `update-drafting` | — | 011, 088 |
| `scale` | supported | command-bus | `scale-object` | — | 012 |
| `rotate` | supported | command-bus | `rotate-object` | — | 024 |
| `pattern` | partial | command-bus | `create-pattern` `update-pattern` `detach-pattern` `delete-pattern` | — | 013, 053 |
| `delete` | supported | command-bus | `delete-object` | — | 014, 018 |
| `cancel-tool` | supported | ui-state | — | — | 017 |
| `selection` | supported | ui-state | — | — | 019, 020, 021 |
| `repeat-command` | supported | ui-state | — | — | 022 |
| `double-click-edit` | unconfirmed | none | — | — | 023 |
| `diameter-dimension` | supported | command-bus | `create-dimension` | — | 030, 033 |
| `angular-dimension` | supported | command-bus | `create-dimension` `update-dimension` | — | 031, 033 |
| `continuous-dimension` | partial | command-bus | `create-drafting` | — | 027 |
| `baseline-dimension` | unconfirmed | none | — | — | 028 |
| `text` | partial | command-bus | `create-drafting` `update-drafting` | `draft.text` | 034, 035, 036 |
| `layer-management` | supported | command-bus | `create-layer` `rename-layer` `set-layer-visible` `set-layer-locked` `set-layer-style` `delete-layer` | `scene.layer` | 037, 099, 100 |
| `active-layer` | partial | ui-state | — | — | 103 |
| `move-to-layer` | supported | command-bus | `move-object-to-layer` | `scene.objects` | 104 |
| `match-properties` | unconfirmed | none | — | — | 038 |
| `view-navigation` | supported | ui-state | — | — | 039, 040, 041, 042, 048 |
| `panel-visibility` | partial | ui-state | — | — | 043, 065 |
| `command-line-toggle` | unconfirmed | none | — | — | 044 |
| `library-browse` | partial | ui-state | — | — | 045 |
| `regen` | unconfirmed | none | — | — | 046 |
| `project-tabs` | supported | ui-state | — | — | 047 |
| `block-define` | supported | command-bus | `define-block` `define-component-content` | — | 049 |
| `block-insert` | supported | command-bus | `insert-block` `place-component-content` | — | 050 |
| `block-update` | partial | command-bus | `update-block` | — | 105 |
| `block-attributes` | unconfirmed | none | — | — | 107, 108 |
| `block-editor-session` | unconfirmed | none | — | — | 106 |
| `write-block-file` | unconfirmed | none | — | — | 051 |
| `explode` | supported | command-bus | `explode-drawings` `explode-block` | — | 052 |
| `paste-as-block` | unconfirmed | none | — | — | 056 |
| `save-local` | partial | file-io | — | — | 058 |
| `download-file` | partial | file-io | — | — | 059 |
| `dxf-reference-import` | partial | file-io | `record-dxf-source` | — | 060 |
| `measure-distance` | supported | read-only | — | `cad.measure` | 061 |
| `inspect-properties` | supported | read-only | — | `cad.inspect` `cad.objects` | 062, 063, 065 |
| `point-coordinate` | partial | ui-state | — | — | 064 |
| `variables-expressions` | partial | command-bus | `set-variable` `remove-variable` `set-parameter-binding` `remove-parameter-binding` | — | 066 |
| `quick-calculator` | unconfirmed | none | — | — | 067 |
| `snap-settings` | supported | ui-state | — | — | 068, 069 |
| `ortho-toggle` | supported | ui-state | — | — | 070 |
| `tracking-dynamic-input` | partial | ui-state | — | — | 071, 072 |
| `regular-polygon` | supported | command-bus | `create-regular-polygon` | — | 074 |
| `ellipse` | supported | command-bus | `create-drawing` `update-ellipse` | — | 075 |
| `spline` | supported | command-bus | `create-drawing` `update-spline` | `curve.fitted` `curve.reshape` `curve.adjust` | 077 |
| `construction-line` | supported | command-bus | `create-construction` `create-drawing` | — | 076 |
| `make-face` | partial | command-bus | `create-drawing` | — | 078 |
| `stretch` | supported | command-bus | `stretch-drawings` | — | 079 |
| `join` | supported | command-bus | `join-drawings` `connect-drawings` | — | 081 |
| `edit-polyline` | supported | command-bus | `edit-polyline` `convert-contour-edge` | — | 082 |
| `break-contour` | supported | command-bus | `break-drawing` | — | 083 |
| `lengthen` | supported | command-bus | `lengthen-drawing` | — | 084 |
| `arrange-align` | partial | command-bus | `move-object` | — | 085 |
| `duplicate-boundary-diagnosis` | partial | read-only | — | — | 086 |
| `image-draw-order` | partial | command-bus | `reorder-image` | — | 087 |
| `general-draw-order` | unconfirmed | none | — | — | 089 |
| `text-style` | unconfirmed | none | — | — | 090 |
| `model-note` | partial | command-bus | `upsert-model-note` | — | 091 |
| `leader-style` | unconfirmed | none | — | — | 092 |
| `dimension-spacing` | unconfirmed | none | — | — | 094 |
| `dimension-break` | unconfirmed | none | — | — | 095 |
| `center-mark` | unconfirmed | none | — | — | 096 |
| `layer-isolate` | unconfirmed | none | — | — | 097, 098 |
| `layer-freeze` | unconfirmed | none | — | — | 101, 102 |
| `purge` | partial | command-bus | `purge-unused` | — | 109 |
| `document-audit` | unconfirmed | none | — | — | 110 |
| `recover-file` | unconfirmed | none | — | — | 111 |
| `units` | partial | ui-state | — | — | 112 |
| `ucs` | partial | command-bus | `upsert-work-plane` `create-ucs-drawing` `move-in-ucs` | — | 113 |
| `ucs-look-at` | supported | ui-state | — | — | 114 |
| `isolate-selection` | supported | ui-state | `show-all-objects` | — | 115, 116 |
| `plot-pdf` | partial | file-io | — | — | 117, 118, 119, 120 |

## 대표 기능의 계약 검증 (2026-11-06 실행)

테스트 프로세스 메모리의 문서에서 실제 함수를 호출했다. 저장된 CAD 파일은 열거나 바꾸지 않았다.

| 기능 | 확인한 연결 | 확인한 거부·제한 |
| --- | --- | --- |
| 2D 생성 | `L` → `line`(2D·잠기지 않은 레이어만). UI `create-drawing` Preview는 문서를 바꾸지 않음. MCP `curve.polyline` 계획 → `create-drawing` → Preview 성공 | 잠긴 활성 레이어·3D 작업 공간에서 `L`은 동작하지 않음. 비평면 점은 `plane`으로 거부 |
| 이동 | UI `move-object` Preview. MCP `scene.objects` → `move-object` → Apply 후 이동값 확인 | 선택되지 않은 기존 객체는 `scene.objects`가 거부 |
| 기준점 복사·붙여넣기 | `copyDrawingClipboard` → `clipboardPasteCommand` → `paste-drawing-snapshot` → Apply. 새 ID, 입력 없는 독립 도형, 이동량 반영, 원본 불변 | 입력이 있는 도형·스케치 소유 도형·빈 선택은 복사 거부. 다른 문서 ID는 클라이언트와 **핸들러 양쪽에서** 거부 |
| 치수 변경 | 주석 `planDimensionFromSelection` → `create-dimension` Preview. 구동 치수 `solid.parameter` → 선언된 명령 범위 안에서 Preview 성공 | 값이 같으면 `unchanged`로 거부 |
| Extrude | `E`는 `canExtrude`일 때만 동작. MCP `solid.extrude` → `create-extrude` → Apply, 결과 피처 `extrude` | **열린 프로파일은 MCP 계획 단계를 통과하고 Preview에서 핸들러가 거부**("does not form a closed loop") |
| Undo/Redo | `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z` 라우팅. 게시한 명령을 `undoDocument`로 되돌리고 `redoDocument`로 복원 | 명령 타입이 아니며 MCP 도구에도 없다 |

모든 대표 기능에서 계획·UI가 실제로 만든 명령(배치 내부 포함)이 레코드의 `commandTypes` 안에 있음을 확인했다.

## 확인되지 않은 지원 범위

- 대응표의 미확인 23개 항목(기능 20개)은 그대로 `unconfirmed`다. 실행 경로를 주장하지 않는다는 규칙을 테스트로 고정했다.
- `dimension-spacing`: 저장된 측정 치수의 간격 정리(`layout-saved-measurements`)가 후보다. 일반 치수 DIMSPACE와 같은지는 확인하지 않았다.
- `isolate-selection`: UI 격리는 뷰포트 React 상태다. `isolate-object` 명령 핸들러는 있지만 UI 호출 위치를 찾지 못했다.
- `base-point-clipboard`: `Ctrl+Shift+C`/`Ctrl+V` 키 라우팅은 없다. 팔레트 `base-point-clipboard`의 Pilot 도구 경로만 확인했다. `Shift+C`는 점 기준 복사(`duplicate-object`)다.
- 대표 6개 외 기능의 사전 조건·제한은 대응표와 정적 코드 읽기에 근거한다. 동적 거부 조건은 실행으로 확인하지 않았다.
- 120개 전체 브라우저 실행은 하지 않았다. 대응표 작성 시점의 브라우저 결과(shortcutGuide 13, cadPilots 30, draftingWorkflow 16)는 이전 기록이며 이번에 다시 실행하지 않았다.

## 객체·관계 온톨로지와의 연결 인터페이스

```ts
interface ObjectOntologyBridge { targetKindsOf(objectId: string): TargetKind[] }
documentObjectBridge(document)        // featureContract 기반 최소 구현 (wall, slab, component-instance, image, block-instance 포함)
candidateCapabilitiesForObject(bridge, objectId, query?)   // 선언된 targetKinds만으로 후보를 고른다
findCapabilities({ kind, support, executor, targetKind, text })
capabilitiesByCommandType(type) / capabilitiesByMcpTool(tool) / capabilitiesByPaletteId(id)
shortcutMapping(no) / shortcutItemsForCapability(id)
```

후보는 "이 객체 종류에 대해 서술된 기능"일 뿐이다. 관계 온톨로지가 생기면 `targetKindsOf`가 벽-개구부, 피처 입력, Joint 같은 관계를 반영하도록 교체한다. 예를 들어 기준점 복사는 입력이 있는 도형을 거부하는데, 지금은 이 사실을 `preconditions` 문장으로만 표현한다.

## 연결에 필요한 변경 제안 (이번에 수정하지 않음)

1. **명령 타입 런타임 목록**: `packages/cad-commands`에서 `CAD_COMMAND_TYPES`를 내보내면 validator 소스 파싱이 필요 없다.
2. **MCP 조회 도구**: `cad.capabilities` 읽기 도구를 추가해 이 인벤토리를 외부 에이전트가 조회하게 한다. `cadToolContract.ts`와 `cadToolSession.ts` 수정이 필요하다.
3. **Extrude 계획 단계 검사**: 열린 프로파일을 `planCadModelingTools`에서 미리 거부하면 MCP 응답이 빨라진다. 현재도 Preview에서 거부되므로 안전성 문제는 아니다.
4. **`isolate-object`**: UI가 쓰지 않는 핸들러다. 의도된 API인지 정리가 필요하다.
5. **`checkArchitecture.ts` 규칙**: `src/ontology`가 UI·state를 런타임 import하지 않도록 고정한다. 지금은 테스트 한 개가 이를 확인한다.
6. **문서 색인**: `docs/architecture/README.md`와 `docs/verification/README.md`에 이 문서와 인벤토리를 추가한다. 이번 작업의 파일 소유 범위 밖이다.

## 갱신 방법

레코드를 바꾸면 인벤토리 JSON을 다시 생성해야 테스트가 통과한다. 생성은 `capabilityInventory()`를 `JSON.stringify(value, null, 1)`로 쓰면 된다. 생성 스크립트는 파일 소유 범위 때문에 저장소에 넣지 않았다.
