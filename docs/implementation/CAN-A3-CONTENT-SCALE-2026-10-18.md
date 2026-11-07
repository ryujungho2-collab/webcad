# CAN-A3 콘텐츠 비례 확대

2026-10-18 첫 지원 범위 구현. [사용법](../features/CANVASES.md#콘텐츠-비례-확대--can-a3).

## 조작과 원본 계약

Resize는 Canvas 경계 편집, Reflow는 CAN-A2 명시적 Flex 배치, Scale contents는 새 `scale-canvas-contents` 명령으로 구분한다. 루트 원점을 고정한 균등 배율만 제공한다. 원본 CAD 물리 치수나 구속을 변경하지 않는다. 직접 소유 모델은 도면 프레임 사용을 안내하며, X/Y 비균등 곡선 변환은 구현하지 않고 거부한다.

`canvasScalePlan.ts`는 소유 하위 Canvas와 일반 도면 Frame, workspace section, 이미지 배치의 제안 명령을 계산한다. source/reference는 공유를 유지하고 참조는 제외 목록에 표시한다. Canvas 크기/위치, 작업 구역 크기/위치, Flex의 길이 값과 offset은 같은 배율로 바꾼다. Flex 모드/weight는 유지하고 자동 reflow는 하지 않는다. 상위 외부 캔버스 규칙은 자동 편집하지 않는다.

Frame은 종이 size/origin과 denominator를 변경한다. size × denominator가 유지되어 원본 crop 범위와 sourceOrigin은 보존된다. 곡선의 샘플/analytic ellipse 축·spline 제어점과 텍스트는 기존 Frame 출력 매핑을 사용한다. 새 누적 paperStrokeScale은 line weight/dash에, paperTextScale은 글자 높이에 적용한다. 기본 글자/선 확대와 종이 단위 고정 옵션을 모두 반복 적용할 수 있다. 지원 채움과 벡터 모양은 기존 출력 경로를 따른다.

이미지는 model-mm 캔버스에서 기존 scale-object/move-object 명령으로 배치만 바꾼다. 원본 bitmap/asset/hash, crop, mask, opacity와 색 보정은 유지한다. 색 보정은 길이 속성이 아니다. 별도 shadow/blur 길이 속성은 현재 문서 모델에 없으며 새 효과 지원을 주장하지 않는다.

## 보호와 검토

기존 source 명령과 검증/연관 재생성을 통과하며 내부 단계의 revision 진행과 거부 결과를 확인한다. 잠금/숨김, mixed units/plane, 결과 예산, 연결·연속 프레임, 시트 배치 소유를 우회하지 않는다. 작업 구역의 프레임도 각각 한 번만 변환한다. 실패·stale·Cancel은 전체 rollback한다. 검토는 변경 전후 수치, 제외 이유, 최대 네 개 프레임의 실제 SVG 제안 출력을 표시하며 한 번의 Apply/Undo로 확정한다.

Frame 스타일 계수와 발행/연속 프레임 snapshot은 v45 판별에 포함한다. downgrade를 거부하고 snapshot 스타일 수치를 검증한다. 연속 프레임의 source snapshot 비교도 스타일 변경을 stale로 감지한다. Frame 스타일이 없는 파일은 이전 v43/v44 등의 최소 버전을 계속 사용한다.

## 검증

- 전체 Node 1,406개/54 suites 통과. 이후 snapshot 스타일 보호와 실제 검토 미리보기 보강은 최종 집중 49개(CanvasScale 14, FrameSheets 16, FrameStitches 19)로 검증했다. 수치는 중복 합산하지 않는다.
- 관련 CanvasFlex/Frame/Workspace/Image를 포함한 집중 63개도 통과했다.
- 신규 native browser 20개: 분리 검토/취소, 원점 기준 배치와 크기, 글자/선 확대와 종이 고정, 원본 불변/native 제출 0, 한 Undo/Redo, 잘못된 배율, 960px, SVG/PDF Worker 출력, v45 저장/재열기.
- 실제 PDF와 page JPEG를 생성했다. SVG와 PDF는 같은 collectArtboardExportItems → artboardPngSvg 입력으로 analytic ellipse/글자와 종이 크기를 공유한다. 생성 page JPEG의 곡선·글자·선 배치를 시각적으로 확인했다. PDF는 기존 래스터 발행 형식이며 새 벡터 PDF 구현이 아니다.
- 최종 빌드와 아키텍처 672 모듈 검증, 기존 Flex browser 회귀 24개 통과. 결과는 [manifest](../verification/CAN-A3-2026-10-18.json)에 기록했다.

v45 파일 (local-only, not in repository: `output/verification/canvas-scale/scale.webcad.json`) · SVG (local-only, not in repository: `output/verification/canvas-scale/scale.svg`) · PDF (local-only, not in repository: `output/verification/canvas-scale/scale.pdf`) · PDF 페이지 (local-only, not in repository: `output/verification/canvas-scale/scale-page.jpg`) · 960px (local-only, not in repository: `output/verification/canvas-scale/scale-960.png`) · native report (local-only, not in repository: `output/verification/canvas-scale/native-report.json`).

직접 원본 CAD의 물리 치수 확대, 다른 단위로의 변환, 비균등 변환, 연결/연속 프레임·발행 시트의 그룹 확대는 이 지원 범위에 포함하지 않는다. 각 소유 도구가 있는 배치를 변경하려면 먼저 해당 도구에서 편집/해제한다.
