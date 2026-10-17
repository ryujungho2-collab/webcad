# 계획서 정합성 정리

2026-10-17. 문서의 현재 상태·선행 관계·실행 순서를 2026-10-16까지의 구현 및 검증 기록과 대조했다. 제품 기능이나 회귀 검사 결과를 새로 완료 처리하지 않는다. 현재 작업 트리의 기존 변경은 보존한다.

## 실행 기준과 문서 역할

- **실행 순서:** [NEXT-STEPS 현재 실행 큐](../../NEXT-STEPS.md#현재-실행-큐). 다음은 **WF-Q1 실제 주거 과제 검증**이다.
- **현재 사실과 이력:** [PROJECT-STATE](../../PROJECT-STATE.md). 날짜별 ‘다음/현재’와 테스트 수는 당시 기록이며 현재 큐를 덮어쓰지 않는다.
- **카드 범위와 완료 조건:** [평면도 계획](../product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md), [워크스페이스 계획](../product/WORKSPACE-UX-AGENT-PLAN-2026-10-14.md). 완료는 명시한 지원 범위에 한한다.
- **제품 목표:** PRODUCT-ROADMAP과 UNIFIED-CREATIVE-SUITE-ROADMAP. 단계 번호·목표 타입은 구현 여부나 우선순위가 아니다.
- **초기 인계:** IMPLEMENTATION-READINESS, WORK-SLICES, B-X-G-I 순서 및 CREATIVE-REUSE의 과거 큐는 설계·이력으로 보존한다.

## 상태 대조

| 카드 | 현재 상태와 근거 | 남은 경계 |
| --- | --- | --- |
| UI-P1-H1/H2 | [복구](../implementation/UI-P1-H1-PROJECT-RECOVERY-2026-10-14.md)·[관리](../implementation/UI-P1-H2-PROJECT-MANAGER-2026-10-14.md) 완료 | 닫기/재열기는 새 Undo 세션 |
| UI-P2 / S / C | 렌더 억제·[대형 저장소](../implementation/UI-P2-S-DURABLE-STORAGE-2026-10-15.md)·[취소/메모리](../implementation/UI-P2-C-TASKS-MEMORY-2026-10-16.md) 지원 범위 완료 | 시간 단위 운영·전체 프로세스/문서·Undo 상한·source/slab byte 예산 |
| WF-A1·C0/A2/B1 | [준비](../implementation/WF-A1-FLOOR-PLAN-PREPARATION-2026-10-14.md)·[guided 작업/PURGE/진단/면](../implementation/WF-C0-A2-B1-2026-10-16.md) 지원 범위 완료 | 임의 자연어·자동 교차 분할/일괄 수리·임의 UCS/spline 면 |
| WF-B2/B3 | [직선 벽/준비된 footprint·연관 개구부](../implementation/WF-B2-B3-2026-10-16.md) 지원 범위 완료 | 자동 코너 융합·곡선 host·커서 면 pick |
| CMP-S1/WF-D1 | [단일 슬롯·수평 slab·단색 마감](../implementation/CMP-S1-WF-D1-2026-10-16.md), [검증 JSON](../verification/CMP-S1-WF-D1-2026-10-16.json) 첫 범위 완료 | 다중 슬롯/assembly·중첩 정의·외부 remap·텍스처·정확 거리/문짝 sweep |
| WF-Q1 | **미완료·바로 다음** | 실제 주거 파일로 전체 발행·수정/재발행·재열기 증거 필요 |
| CAN-A1/A2/A3·MEAS-H1 | 계획/대기 | 단일 슬롯의 fit·AABB 경고로 상위 Flex/호버 측정을 완료 처리하지 않음 |
| UI-P3-A/B·UI-C2/C3 및 CAD 보충 | 현재 큐의 후속/병행 후보 | 병행 가능 표시는 착수/완료 증거가 아님 |
| IO-DWG1 | 별도 대기 | 네이티브 DWG/SKP·DWG2010·3D Warehouse 지원으로 확대하지 않음 |

콘텐츠 schema의 `ContentSlot`은 space/opening 중 하나이며 인스턴스는 슬롯 하나를 가진다. `ArchitecturalSlab`은 floor/ceiling·source IDs·level·thickness를 저장한다. 이를 [문서 계약 코드](../../packages/cad-document/src/ArchitectureContent.ts), [콘텐츠 명령](../../apps/web/src/state/architectureContentCommands.ts), [작업 UI](../../apps/web/src/interop/ArchitectureContentPanel.tsx), [대상 검사](../../apps/web/tests/architectureContent.test.ts)와 대조했다. 기존 1,274 Node·native 16/14/32 등의 수치는 10-16 기록이며 이번 실행 결과가 아니다.

## 바로잡은 불일치

1. NEXT-STEPS 안의 ‘다음은 B2’, 위임안 상단의 ‘P2 대기’, 평면도 계획의 ‘A1 외 모두 대기’를 현재 카드 상태로 수정했다.
2. 평면도 기반/공백 표에서 이미 구현된 PURGE·receipt·진단·벽 의미·단일 슬롯을 현재 기반으로 옮겼다.
3. CMP-S1 첫 범위가 CAN-A1/A2 전체를, WF-D1 첫 범위가 MEAS-H1을 선행으로 요구하는 표기를 수정했다. 상위 컨테이너·정확 거리의 목표는 유지한다.
4. WF-Q1의 ‘마감’을 ‘바로 다음·미완료’로 명확히 하고, G6-D5-Q1 출력 전 점검과 G6-D6-P4 성능 보충을 전체 ID로 구분했다.
5. Dexie 미채택과 직접 IndexedDB 저장소 구현을 구분했다. 외부 후보의 라이선스/버전은 당시 조사 기록이며 재조회하지 않았다.
6. 초기 기획·B/X/G/I·날짜별 상태 기록에 이력 경계를 두었다. 통합 제작 로드맵의 direct crop·색 보정·PNG/PDF·prototype 전체 미구현 문장을 후속 검증 기록으로 정정했다.
7. 현재 큐에 날짜 없는 앵커를 사용하고 기존 날짜 앵커를 호환용으로 유지했다. README와 문서 인덱스에서 현재 기준을 찾을 수 있게 했다.

## WF-Q1의 첫 완료 조건

완료된 준비·벽/개구부·콘텐츠/마감 경로로 작은 주거 평면 한 건을 수행한다. CAN/MEAS/IO 전체 구현은 필수 선행이 아니다.

- 실제 UI에서 DXF 단위·기준점·레이어/참조를 확인하고 진단→면→벽/개구부→슬롯 창호/가구→바닥/천장을 연결한다. 창호/가구의 단일 solid 지원 조건과 placeholder 여부를 기록한다.
- 같은 모델에서 평면/단면·A3 시트를 만들고 1:50/1:100 단위·선 굵기·한글·슬롯·홀·잘림·stale/참조 상태를 확인한다. 의도적으로 지원 밖인 fixture는 진단 결과로 기록한다.
- 벽/개구부 또는 가구를 수정해 연관 출력 갱신·한 Undo/Redo·재발행을 확인하고 WebCAD 파일을 저장/재열기한다.
- WebCAD 원본과 PDF/SVG/DXF, 실제 UI 증거·검증 명령/결과·누락/지원 한계를 남긴다. 다운로드한 PDF는 독립 렌더링해 확인한다. 기존 콘텐츠 fixture만으로 이 과제를 완료 처리하지 않는다.

## 이번 검증 범위

`pnpm --filter @agent-webcad/web check:architecture` 통과: **591 modules**, geometry/command/type 경계와 문서 링크 검사. 변경 문서의 상태/선행을 대조했고 날짜 없는 현재 큐 앵커와 과거 앵커의 호환을 확인했다. 대상 문서 `git diff --check`와 현재 큐의 오래된 상태 문구 검사도 통과했다. 제품 코드 변경이 없으므로 Node/browser 전체 회귀·production build는 재실행하지 않았다. 과거 측정과 제품 한계는 원래 기록에 보존한다.
