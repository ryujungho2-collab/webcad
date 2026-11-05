# MEAS 후속: 치수 배치 스냅·겹침 정리

2026-10-18

저장된 치수의 직접 배치에 평행 기준선 정렬 스냅, Shift 저장 평면 축 고정, 화면상 겹침 안내 및 일정 간격의 그룹 배치 미리보기/적용을 추가했다.

## 순수 배치 계산

`measurementLayout.ts`는 기존 치수 기하의 유한 기준선 방향을 정규화하고 같은 평면의 visible/current 치수 중 평행한 항목만 사용한다. 영 길이 기준선은 스냅·정리에서 제외한다. 방향 반전은 동일하게 취급하며 parallel tolerance는 1e-6이다.

스냅은 이동 기준선을 다른 기준선의 법선 위치로 옮기는 offset 보정이다. 보정 전후 점을 화면에 투영한 차이가 8px 이내일 때 가장 가까운 후보를 선택하고, 동률은 ID로 결정한다. Shift는 첫 이동량이 큰 평면 축을 키를 놓을 때까지 유지하고 다른 성분을 고정한다. 정렬 보정은 허용된 축으로만 계산하므로 축 고정을 위반할 수 없다. 해당 축으로 정렬할 수 없는 후보는 제외한다. Alt 또는 체크 해제는 스냅을 생략한다.

간격 정리는 선택 치수의 법선 위치를 anchor로 고정한다. 같은 평면의 유효 평행 그룹을 현재 법선 위치와 ID 순서로 정렬하고 anchor의 양쪽에 지정한 모델 mm 간격(0.1–1000 mm)을 적용한다. 기존 접선 성분은 보존한다. 계획은 변경되는 offset만 반환하고, 원본 문서·측정값을 변경하지 않는다. 전체 문서 예산 32개와 offset ±1,000,000 mm 한계를 유지한다.

겹침 검사는 화면상의 추정 문구 box 사이 교차와 다른 치수 선분의 문구 box 통과를 판정한다. 자기 선/문구 간 관계는 제외한다. 색상·summary·toolbar에 해당 치수 수를 표시한다. 이 검사는 viewport 안내이며 PDF 서체나 모델 물리 간섭의 보증 판정이 아니다.

## UI와 명령

- 기존 드래그 preview에 축/스냅 대상/초록 가이드를 포함하고 pointerup에서 이미 검증된 단일 placement 경로로 확정한다.
- 선택 toolbar에 정렬 스냅 체크, 간격 입력, 정리 미리보기/적용/취소를 제공한다. 간격 입력을 바꾸면 이전 계획을 폐기한다.
- 그룹 계획은 document version과 camera/viewport stamp에 묶인다. 문서·도구·화면·포커스 변화와 Escape는 기존 cancel 경로로 폐기한다. 미리보기에는 실제 출력 경로가 사용하는 offset 복사본만 사용한다.
- `layout-saved-measurements`는 1–32개 unique ID/유효 offset, documentId와 expectedRevision을 검증한다. 명령 큐 안에서 모든 항목의 상태를 먼저 확인한 다음 offset을 바꾼다. 한 항목이라도 무효면 전부 거부한다. revision/Undo는 한 번이며 원본 geometry나 native 거리 재측정은 수행하지 않는다.
- 기존 version 46 offset만 변경하므로 schema version은 유지한다. 적용된 위치는 저장/재열기/SVG/PDF에서 동일하게 사용한다.

## 범위

치수선 법선 정렬과 그룹 일정 간격이 지원 범위다. 문구의 독립 이동, 일반 오브젝트 스냅, 서로 다른 평면/방향 치수의 그룹 정리, 완전한 자동 충돌 해소는 포함하지 않는다. 짧은 치수의 긴 문구나 중첩 연장선 때문에 정리 후에도 경고가 남을 수 있다. 남은 경고를 확인하고 개별 배치해야 한다.

## 검증

- 새 Node 8개: 8px/zoom, 스냅 해제·축 고정, 숨김/다른 평면 제외, 사선 법선 간격/접선 보존, 화면 문구·선 교차, 계획 읽기 전용, 그룹 단일 Undo/Redo·native 작업 불변, stale/invalid atomic 거부.
- 새 실제 브라우저 15개: 겹침 표시, native snap guide/정확 배치/Undo, Alt, Shift, 그룹 preview/cancel/적용, anchor 보존, 한 번 Undo, native 재측정 없음, 문서 변경 계획 폐기, 960px controls.
- 화면과 검증 산출물: `output/verification/measurement-layout`.

사용법: [측정](../features/MEASUREMENTS.md).

최종 검증: 전체 Node 1476개/54 suites 및 마지막 Shift latch 보완을 포함한 관련 84개 통과. 실제 브라우저 새 15개와 기존 직접 배치 17개·저장/출력 14개·지정 측정 25개 통과. 960px에서 긴 안내가 화면 맞춤 버튼을 가리는 문제를 수정하고 회귀 검증했다. 최종 build와 architecture(694 modules) 통과.

[검증 manifest](../verification/MEAS-DIMENSION-LAYOUT-2026-10-18.json).
