# MEAS 후속: 치수선 직접 배치·편집

2026-10-18

저장된 치수의 문구 또는 기준 치수선을 선택해 드래그하면 연장선·화살표·문구를 함께 배치한다. 읽기 전용 미리보기 뒤 pointerup에서 기존 문서 명령 큐로 한 번만 확정한다. 원본 모델·측정값·A/B와 출력 평면은 그대로 유지한다.

## 구현

- `savedMeasurementPlacement.ts`: 카메라 ray와 저장된 월드 출력 평면의 교점으로 포인터를 mm 좌표로 변환한다. 직교/원근과 XY/XZ/YZ를 지원한다. 거의 평행한 ray, 잘못된 viewport, ±1,000,000 mm 밖의 배치는 거부한다.
- `SavedMeasurements.tsx`: 문구의 투명 hit rect와 기준선의 14px hit stroke, 선택 강조, 키보드 focus, 편집 toolbar와 실제 pointer capture를 추가했다. visible/current 항목만 편집할 수 있다. 클릭은 선택만 하고 3px 이상 이동해야 미리보기를 시작한다. 종료점이 원래 오프셋이면 명령을 만들지 않는다.
- 미리보기는 메모한 항목의 offset 복사본으로 기존 순수 치수 기하를 그린다. 문서·history·native kernel·출력 장면은 변경하지 않는다.
- `place-saved-measurement`는 ID/offset/documentId/expectedRevision을 검증한다. 직렬화된 명령 실행 시 문서 기준 버전·표시·참조 상태를 다시 확인하고 offset만 바꾼다. 동일 배치는 no-op이다. saved-only 명령으로 원본 재생성과 native 재측정을 건너뛰며 한 Undo snapshot만 만든다.
- epoch 변경, 비활성 도구, window blur, pointercancel/lost capture는 미리보기를 취소한다. 카메라/viewport stamp 변경도 취소한다. stamp는 OrbitControls의 미세 float 재계산을 흡수하되 실제 view 변경을 감지하도록 정규화한다. 휠은 passive:false native listener로 취소 후 기존 캔버스 탐색에 전달한다.
- 방향키는 저장 평면에서 1 mm, Shift 10 mm, Alt 0.1 mm를 한 번 배치한다. auto-repeat는 이력을 쌓지 않는다. IME 및 입력 필드 키는 가로채지 않는다. annotation focus의 Delete는 원본 객체를 삭제하지 않고 저장 치수만 삭제한다. Escape는 배치/선택을 취소하고 canvas focus를 돌린다. Ctrl/Cmd+Z/Shift+Z는 한 번만 Undo/Redo한다.
- 활성 작성·변환 도구가 있을 때 hit 영역을 제거하고 tab focus도 비활성화한다. 평면이 옆으로 보이면 추측 이동 대신 안내를 표시한다. project 전환/unmount에서는 capture를 정리한다.

## 저장·출력 및 범위

기존 version 46의 offset 두 값을 사용하므로 schema version은 바뀌지 않는다. 확정 뒤 기존 치수 장면을 통해 저장·재열기·SVG/PDF에 반영된다. 미리보기 중 출력은 마지막 확정 상태를 사용한다. 문구와 치수선의 독립 이동, 스냅, 자동 충돌 회피, 드래그 중 카메라 탐색의 동시 유지는 제공하지 않는다. 탐색은 미리보기를 취소하고 이어진다.

## 검증

- 최종 관련 Node 76개 통과. 배치 6개는 원근/직교·zoom·세 평면의 mm 복원, edge-on·예산 거부, 다수 미리보기→한 번 확정, native 작업/원본 불변, Undo/Redo, export 미리보기 불변, stale 및 실제 큐 경합을 검증한다.
- 새 실제 브라우저 17개 통과: native pointer capture, 미리보기 무변경, pointerup 단일 이력, native 재측정 없음, Ctrl+Z/Shift+Z, Escape, 휠 취소/탐색, 키보드 3가지 step, 모델 변경 stale, 기준선 드래그, 치수만 Delete, 재열기, resize 취소, 960px, 도구 gate 및 edge-on 안내.
- 기존 저장·출력 브라우저 14개와 지정 측정 25개 통과.
- `output/verification/measurement-placement`에 미리보기/960px PNG, 프로젝트, SVG, native report와 로그를 저장한다.

사용법: [측정](../features/MEASUREMENTS.md).

최종 마무리: 전체 Node 1468개/54 suites, 최종 관련 76개, 브라우저 17+14+25개 통과. 전체 패키지 build, architecture(691 modules), scoped diff whitespace 검사 통과. 최종 미리보기/960px 화면을 육안 확인했다.

[검증 manifest](../verification/MEAS-DIMENSION-PLACEMENT-2026-10-18.json).

후속: [치수 배치 스냅·겹침 정리](MEAS-DIMENSION-LAYOUT-2026-10-18.md)에서 정렬 스냅·Shift 축 고정과 그룹 간격 미리보기/적용을 추가했다.
