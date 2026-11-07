# ONTOLOGY-RELATION-01 — 2D 프로파일과 Extrude 관계 조회

2D 프로파일 후보 또는 일반 Extrude 하나를 선택하고 **Properties → Dependencies → Profile ↔ Extrude**를 연다. 두 객체의 ID와 관계를 확인하고 **Download relation JSON**으로 같은 조회 결과를 저장한다.

| 항목 | 계약 |
| --- | --- |
| 근거 | `queryProfileExtrudeRelations(document, objectId)`는 `buildDependencyGraph`가 저장된 입력으로 구성한 엣지를 사용한다. 기존 `liveFeatureInputs`가 live/snapshot을, `featureContract`가 끝점의 기하 표현을 분류한다. |
| 방향 | 정방향은 항상 프로파일 ID에서 Extrude ID로 향한다. 선택을 바꾸면 `viewedFrom`만 outgoing에서 incoming으로 바뀐다. |
| 소유 | 스케치 소유 ID와 누락 상태를 기존 `sketch-owner` 엣지에서 읽는다. 레이어 ID와 피처 ID는 별도 필드다. |
| 누락 | 기록된 입력 객체나 그 피처가 없으면 원래 ID를 유지하고 `missing-source` 또는 `missing-source-feature`를 반환한다. 기록이 없는 독립 복사본은 빈 관계 배열이다. |
| 유효 범위 | 일반 프로파일 Extrude의 직접 입력이다. Face Sketch, Hybrid Datum, 건축 슬래브, 간접 경로는 범위 밖이다. `resolved`는 조회한 ID와 표현을 해석했다는 뜻이다. |
| 상태 | 화면과 다운로드가 동일한 보고서를 사용한다. 문서 ID·revision과 코드 근거를 포함한다. 조회는 문서·History를 변경하지 않으며 문서 교체와 revision 갱신 때 다시 계산한다. |

기존 Inspector의 `DependencyNotice.tsx`에서 같은 그래프를 기존 설명과 신규 조회에 공유한다. 기존 다운로드 경로를 사용하며 별도 그래프 저장소는 없다.

대표 JSON 발췌:

```json
{
  "schema": "webcad.profile-extrude-relations.v1",
  "document": { "id": "test-document", "revision": 2 },
  "selectedObjectId": "solid",
  "relations": [
    {
      "direction": "profile-to-extrude",
      "viewedFrom": "incoming",
      "mode": "live",
      "status": "resolved",
      "source": { "objectId": "profile" },
      "target": { "objectId": "solid" }
    }
  ]
}
```

온톨로지에 `profile-extrude-relations`를 `inspection / read-only / supported`로 추가했다. 명령과 MCP 도구는 추가하지 않았으며 2026-11-05의 120개 매핑과 판정은 보존했다. [현재 인벤토리](WEBCAD-CAPABILITY-INVENTORY.json)

## 이번 검증

| 검사 | 결과 |
| --- | --- |
| 집중 단위·통합 4개 파일 | **48/48 통과**, 실패 0, skip 0. live/snapshot, 스케치 소유, 독립 복사, 누락 입력, 분리된 결과 및 문서·History 불변 |
| Edge `profileExtrudeRelations` | **9/9 통과**. 양방향 Inspector 조회, JSON 다운로드 일치, Undo/Redo, 같은 ID의 이전 파일 재열기 |
| Edge `dependencyWorkflow` | **9/9 통과**. 기존 스케치 해석·의존성 Inspector 및 기존 조회 회귀 |
| Workspace 빌드 | **통과**. Vite 번들 크기 경고 유지 |
| 아키텍처 검사 | **통과**, 959개 모듈 |
| `git diff --check` | **통과** |

첫 브라우저 실행은 저장 파일의 revision으로 재열기 후 활성 revision을 맞출 수 있다고 가정해 마지막 검사에서 실패했다. 기존 로더가 현재 활성 revision을 증가시키는 동작을 기준으로 검사했다. 최종 실패는 없다. 전체 suite, 외부 Auto Ontology 및 다른 피처 유형의 검증은 미실행이다. 이전 카드 결과는 각 보고서에 있다.

```powershell
pnpm --filter @agent-webcad/web exec tsx --test tests/profileExtrudeRelations.test.ts tests/dependencyGraph.test.ts tests/extendedSketchRelations.test.ts tests/ontologyCapabilities.test.ts
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=profileExtrudeRelations
pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=dependencyWorkflow
pnpm build
pnpm --filter @agent-webcad/web check:architecture
git diff --check
```

실행 로그는 `tmp/ontology-relation-01-*.txt`에 있다. 실제 다운로드 JSON, Inspector 화면과 브라우저 보고서는 `output/verification/ontology-relation-01/`에 있다. 다음 실험의 기준 데이터로 이 JSON을 사용할 수 있다.
