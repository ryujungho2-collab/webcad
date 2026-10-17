# B2-C2 독립 line–arc Chamfer와 열린 혼합 경로 끝 연결

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-11. 기본 XY/XZ/YZ에 놓인 독립 선·원호와 열린 mixed polyline 끝 변의 Chamfer/Fillet을 기존 공개 명령·Curve workflow에 연결했다. 기존 B2-B/B2-C의 standalone Fillet·닫힌 코너 계약을 유지한다.

## 사용

두 도형을 선택하고 **Modify → Curve workflow → Chamfer**를 연다. D1은 첫 도형, D2는 두 번째 도형에 적용되며 `mm`, `cm`, `in` 등 기존 길이 단위를 사용한다. Swap D1/D2 또는 Use equal distances를 사용할 수 있다.

**Pick target branch / Pick second branch**로 남길 부분의 내부 점을 지정한다. 기본 pick은 각 첫 segment의 35%이므로, mixed 경로의 마지막 끝 변이나 원하는 가지는 직접 선택한다. pick은 적용 후에도 남아야 한다. 공유 정점 쪽을 제거하는 해는 허용하지 않는다.

Corner solution에서 복수 교점의 T1/T2 접점을 비교해 하나를 명시적으로 선택한다. 보라색 D 안내선은 직선에서 선분, 원호에서 원호를 따라 표시한다. Chamfer의 D는 원호 chord 길이가 아니라 source 호 길이다. 입력/가지/후보 변경은 Review를 무효화하며 Apply는 검토한 한 트랜잭션만 게시한다.

열린 mixed 경로의 arc 끝은 **Fillet**도 사용할 수 있다. 이 경우 기존 해석 접선 원 계산을 재사용하고 반지름/contact guide를 표시한다. 적용 후 Join result로 두 유지 도형과 connector를 연결할 수 있다.

## 기하와 보존

- Chamfer는 선택한 두 free end의 실제 bounded 교점에서 시작한다. D1/D2를 각 직선/호의 길이 parameter로 독립 이동시킨다. 원호는 중심·반지름·CW/CCW와 major sweep을 유지한다.
- 교점이 범위 밖인 지지 원/연장선을 사용해 새 코너를 만들지 않는다. 두 직선의 기존 supporting-line Chamfer 계약은 그대로 유지한다. 접하기만 하는 퇴화 corner, 일치 곡선, full circle, 접점/거리 소멸, 제거될 pick, 잘못된 값·없는 후보는 거부한다.
- mixed 경로는 첫/마지막 segment만 선택할 수 있다. 첫 변은 start만, 마지막 변은 end만 바꾼다. 공유 정점·다른 변·bulge·기존 control/edge ID·appearance를 유지한다.
- 계산은 정확한 world line/arc로 수행한 뒤 원본 모델 frame으로 복원한다. model bulge는 원래 signed sweep의 남은 비율로 갱신해 회전·평면 균일 축척·반사에서 방향을 보존한다. 비균일 축척으로 ellipse가 된 원호는 거부한다.
- 두 원본 객체 ID를 유지하고 별도 connector 하나를 생성한다. 기존 transaction의 치수/작도·종속 재생성·잠금·stale 검증을 사용한다. 관계를 조용히 삭제하거나 다른 source로 바꾸지 않는다. 실패/Cancel은 원본과 History를 바꾸지 않으며 한 Undo/Redo로 복원한다.
- 저장 형식/파일 버전·명령 payload 변경은 없다. 기존 analytic arc와 polyline bulge로 저장한다. 기존 DXF·viewport·아트보드 export가 갱신된 원본을 소비한다.

## 실제 변경 위치

| 파일 | 역할 |
| --- | --- |
| [openEndCorners](../../apps/web/src/features/drawing-editing/geometry/openEndCorners.ts) | selected free-end 검증, world/model 복원, bounded line/arc Chamfer D1/D2 후보 |
| [arcCorners](../../apps/web/src/features/drawing-editing/geometry/arcCorners.ts) | 공통 Chamfer 경로와 mixed 끝 Fillet의 analytic adapter |
| [connectDrawings](../../apps/web/src/features/drawing-editing/geometry/connectDrawings.ts) | 선택 끝 segment kind로 새 경로에 인계 |
| [명령 handler](../../apps/web/src/features/drawing-editing/commands/registerDrawingCommandHandlers.ts) | 기존 원본 갱신/connector 트랜잭션, distinct source guard |
| [CurveWorkbench](../../apps/web/src/features/drawing-editing/ui/CurveWorkbench.tsx) | 후보·D1/D2·실제 호 길이 안내·Preview/Apply/Join |

## 검수

신규 Node **12 tests**: 독립 sin/cos 접점과 선/호 길이, source 순서·CW/CCW·elevated XY/XZ/YZ, mixed 첫/마지막 arc·arc–arc·Fillet, 공유 정점/ID/style, 회전/scale/반사, 복수 해, 치수·midpoint 작도 연쇄 갱신, locked dependent/stale/소멸·off-curve·잘못된 유지 가지·비균일 scale 원자성, DXF bulge·보드 출력·후속 Join·JSON/Undo 왕복을 검사했다.

실제 Edge/CDP `openEndChamfer` **28 checks**: standalone/mixed 선택, 단위 입력·Swap, line/arc-length guide, 소비/잘못된 거리 입력 복구, 명시적 후보·Apply/Undo/Redo/Cancel·Join 인계를 검사했다. 초기 브라우저 검사는 테스트의 Model 탭 이동·폼 selector·default pick 위치 및 guide 조회 범위 때문에 실패했고, 테스트를 실제 도구/유지 가지에 맞춘 뒤 통과했다. 그 과정에서 product 실패를 테스트 timeout으로 숨겨 완료 처리하지 않았다.

기존 `arcCorners` 22, `lineArcFillet` 17, `asymmetricChamfer` 18, `internalChamfer` 18, `curveWorkflow` 20도 통과했다. 대상 브라우저 **6 workflows / 123 checks**이며 전체 등록 브라우저를 재실행한 결과는 아니다. 전체 Node **983 / 54 suites / fail·skip 0**, TypeScript·architecture **442 modules**·production build 통과. [마감 증거](../verification/B2-C2-CLOSEOUT-2026-10-11.json).

## 지원 경계와 다음

sketch/pattern 소유 코너·construction definition·블록 내부 편집, 기울어진 사용자 frame의 코너, ellipse/spline, mixed 내부 공유 코너의 topology 변경은 별도 adapter다. source·connector의 동일 layer/construction purpose 정책을 유지한다. 종속 재생성이 미지원 관계·잠금·해 소멸을 만나면 전체 Apply를 거부한다.

다음 구현은 [통합 실행 순서](../product/B-X-G-I-IMPLEMENTATION-ORDER-2026-10-11.md)의 **B5-F1 primitive 지름/길이 수치 편집 pilot**이다. B3-A4의 비기본 TEXT/INSERT OCS는 후속 큐에 남긴다.
