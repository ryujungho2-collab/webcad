# CAN-A1 상위 캔버스

2026-10-18 구현. 현재 사용법·지원 범위는 [상위 캔버스](../features/CANVASES.md)가 소유한다.

## 데이터와 명령

`CadDocument.canvases` / `CadCanvas`는 units(model-mm/paper-mm), 작업면, 절대 origin/size, 잠금, typed Own/Reference 멤버를 가진다. 부모는 Own canvas 링크에서 도출한다. 객체·프레임·작업 구역·투영/단면/시트·장면의 stable ID를 유지한다. 프레임의 memberIds는 모델 표현 참조로 보존하고 작업 구역/시트의 기존 아트보드 소유도 중복 검사한다.

소유 단위 공간/작업면 불일치, 중복 소유, 소유/참조 DAG cycle, 누락 원본과 깊이·개수 한도를 검증한다. Object prototype 속성 이름을 실제 원본으로 인정하지 않는다. 잠긴 소유 조상은 하위 계층 편집을 차단한다. 컨테이너 삭제는 원본을 삭제하지 않고 incoming canvas 링크를 같은 transaction에서 해제하며 잠긴 참조 캔버스는 거부한다.

upsert-canvas/delete-canvas/organize-canvases는 기존 detached Preview/Apply·세션 stale·한 Undo 경로를 사용한다. 캔버스 전용 명령/배치는 CAD regeneration을 생략한다. 다른 명령이 원본을 제거하는 경우에는 최종 Canvas graph 검증으로 dangling reference를 거부한다. 멤버/부모 변경은 원본 TRS와 프레임 배치에 적용하지 않는다.

## 호환성과 UI

v43은 계층이 있는 문서에만 사용한다. v1–v42 파일에 새 필드를 숨긴 downgrade를 거부한다. legacyCanvasHierarchy는 명시적인 Organize Review에서 모델/종이·작업면별 루트를 만들며 기존 workspace sections/frames/model presentations를 수정하지 않는다. 연관 출력은 모델 원본 소유와 분리해 기존 투영/단면/시트 참조로 접근한다. 종이 경계는 기존 아트보드 범위와 여백으로 잡는다.

publish/history/batch rollback/file load/test restore의 optional graph 처리를 연결했다. portable 및 프로젝트 bundle은 v43 graph를 보존하며 revision 비교에도 canvases 항목을 추가했다. 기존 파일을 단순히 열면 계층을 자동 생성하지 않는다.

Project navigation에 계층 생성·검색·소유/참조 편집·부모 이동·잠금/삭제 Review와 typed target navigation을 연결했다. 접기는 UI 상태다. 2D 경계는 별도의 표시 Line group으로 만들고 native CAD source/출력에는 추가하지 않는다. 그룹 갱신/해제 시 GPU geometry/material을 반환한다. graph가 없으면 표시 그룹도 만들지 않는다.

960px 모서리 검증에서 기존 정사영 fitBounds가 좁은 aspect에서 가로를 자르는 문제를 확인했다. limiting aspect를 반영해 경계를 모두 포함하도록 보완했고 960px 실제 입력 검증에 포함했다.

## 검증과 증거

- 전체 Node 회귀 1,379개 / 54 suites 통과. 이후 prototype-property 회귀를 포함한 Canvas 집중 10개 통과. 독립/공유 소유, cycle/단위/잠금, batch rollback/Undo, 원본 삭제 guard, stale/cancel, 구버전 load 및 v43/bundle 왕복을 확인했다.
- 모델+투영+단면+시트+프레임+작업 구역 fixture에서 source fields·출력 장면 불변과 추가 native task 0을 확인했다.
- 실제 브라우저 canvasHierarchy에서 migration→부모 변경→오류 Review→공유 참조→잠금/해제→삭제/Undo→960px 경계 맞춤→SVG 비교→save/reload를 수행했다. 최종 수치와 회귀 결과는 [manifest](../verification/CAN-A1-2026-10-18.json)를 따른다.
- [portable 문서](../../output/verification/canvas-hierarchy/canvas.webcad.json), [SVG](../../output/verification/canvas-hierarchy/paper.svg), [1440px](../../output/verification/canvas-hierarchy/canvas-1440.png), [960px](../../output/verification/canvas-hierarchy/canvas-960.png), [네이티브 보고서](../../output/verification/canvas-hierarchy/native-report.json).

Flex/reflow, 콘텐츠 비례 scale, CAD 부모 변환 상속, PDF 신규 발행 검증은 이번 범위가 아니다. 기존 Section/Frame 표현과 저장 좌표를 보존하는 계층 기반을 완료했다.
