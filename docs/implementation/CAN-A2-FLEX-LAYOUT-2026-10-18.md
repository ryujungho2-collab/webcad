# CAN-A2 Flex 배치

2026-10-18 구현. 현재 사용법은 [상위 캔버스](../features/CANVASES.md#flex-배치--can-a2)를 따른다.

## 계산과 데이터

기존 Canvas에 optional layout, CanvasMember에 optional layout 규칙을 추가했다. v44는 이 설정이 있을 때만 사용하고 v43 이하에 새 규칙을 숨긴 downgrade는 거부한다. 기존 CAN-A1 문서의 좌표 계약은 바꾸지 않는다.

CanvasFlex.ts는 의존성 없는 순수 상자 계산기다. Row/Column, Wrap, Gap/Padding, start/center/end alignment, start/center/end/space-between distribution, Fixed/Hug/Fill, min/max와 Fill weight를 처리한다. 공간은 canvas size−padding에서 flow gap/fixed/min을 제외해 분배하고 max에 걸린 잔량을 재분배한다. Hug는 flow만 포함하며 absolute는 별도 넘침을 진단한다. 루트 Fill의 부모 부족, Hug/Fill 같은 축 의존, Wrap/Hug 주축과 재귀/평가 예산은 결정적으로 거부한다. 부모 멤버의 Fixed 제약은 자식의 intrinsic Hug/Fill보다 우선한다. 외부 Yoga 패키지나 새로운 런타임 의존성은 추가하지 않았다.

## 원본 배치 연결

canvasFlexPlan은 소유 하위 canvas/종이 artboard/workspace section의 실제 배치를 계산한다. 프레임 원본 크기·crop·denominator를 바꾸지 않으며 Fill은 슬롯 공간을 분배한다. 원본이 흐름 슬롯을 넘으면 거부한다. 참조는 source에 고정한다. 연결 frame의 delta가 다르면 단독 재배치를 거부하고 전체 연결 work area를 사용하도록 안내한다. 시트·scene·모델 연관 뷰는 전용 배치 도구가 소유한다.

모델은 기본 absolute이며 사용자가 모델 translation을 명시적으로 허용했을 때만 기존 move-object 명령을 실행한다. 모델 크기/scale 변경은 없다. frame은 update-artboard, 구역은 upsert-workspace-section을 통과하므로 기존 잠금/fixed/stitch/발행 소유 규칙을 재사용한다. 하위 canvas의 잠금/소유 조상도 검증한다.

apply-canvas-flex와 설정 upsert를 한 detached batch로 검토한다. 내부 단계 하나라도 거부되거나 revision을 진행하지 못하면 전체 rollback한다. 배치 단계 실행은 기존 검증/연관 재생성을 거치며 새 명령으로 source edit 보호를 우회하지 않는다. metadata 변경과 제안 위치를 한 번에 Apply/Undo한다. 결과 report를 CadPlanPreview에서 수집해 실제 제안 상자와 위치 수치를 표시한다. Cancel/stale는 원본을 유지한다.

## UI와 저장

Canvas editor의 Enable Flex, 축별 제약, 멤버 규칙 disclosure, Earlier/Later, 모델 이동 선택, Review Flex layout을 연결했다. preview SVG는 제안 상자이며 원본 geometry 복제/출력이 아니다. 절대 넘침 경고와 흐름 오류를 구분한다. 저장/복구/history/bundle은 기존 Canvas snapshot 경로로 v44를 유지한다.

## 검증

- 전체 Node 회귀 1,392개/54 suites 통과. 이후 Fixed parent boundary 회귀 추가를 포함한 CanvasFlex/CanvasHierarchy/workspaceSections 집중 34개 통과. 이 수치는 중복 합산하지 않는다.
- 신규 네이티브 canvasFlex 24개: row/wrap/Hug, column, ordering, Fill max redistribution, absolute, 순환/overflow 오류, detached/cancel/one Undo/Redo, 원본 crop/scale 보존, native task 증가 0, local SVG linework 동일, 960px, v44 save/reload.
- 기존 canvasHierarchy 28개 회귀 통과. 최종 build/architecture와 결과는 [manifest](../verification/CAN-A2-2026-10-18.json) 참조.
- portable v44 (local-only, not in repository: `output/verification/canvas-flex/flex.webcad.json`), 원본 프레임 SVG (local-only, not in repository: `output/verification/canvas-flex/frame.svg`), 1440px (local-only, not in repository: `output/verification/canvas-flex/flex-1440.png`), 960px (local-only, not in repository: `output/verification/canvas-flex/flex-960.png`), native report (local-only, not in repository: `output/verification/canvas-flex/native-report.json`).

자동 상시 reflow나 내용 비례 scale은 하지 않는다. 사용자가 Review Flex로 재계산/적용한다. 배치 상자의 한계는 Canvas의 1e7 mm 크기/위치 예산과 기존 계층 한도를 따른다. source bounds는 layout용 외접 경계이며 정확 CAD 거리/witness가 아니다. PDF는 별도로 재발행하지 않았다. 다음 CAN-A3가 콘텐츠 비례 확대를 소유한다.
