# 기본 CAD 조작과 첫 윤곽 편집 묶음

> 단계 기록: 아래 구현·검수 수치는 해당 시점의 근거다. 최신 지원 범위는 [CAD-BASICS](../product/CAD-BASICS.md), 최근 전체 검수는 [PROJECT-STATE](../../PROJECT-STATE.md), 다음 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다.

2026-10-04. 사용자의 기준은 **정밀하면서 간편하게, 기본 조작 검증과 공백 해소,
실무 사용, 차후 확장 고려**다. 이번 범위는 일반 2D Join/Explode/Break와
검수에서 드러난 기존 좌표/곡선 편집 오류다. 전체 기본 CAD 완성이나 실무자
작업 시간 단축을 의미하지 않는다.

## 구현한 작업 흐름

1. 일반 도형을 선택하고 Modify의 Join/Explode/Break 또는 Ctrl+K 명령 검색을 연다.
2. 초록 결과와 점선 원본을 캔버스에서 검토한다. Fit은 편집 패널 오른쪽의
   사용 가능한 화면으로 윤곽을 맞춰 형상이 패널 뒤에 가려지지 않도록 한다.
3. Break는 곡선 위 클릭 또는 U,V 좌표를 받는다. 길이는 mm/cm/in,
   `@` 상대 좌표와 극좌표는 첫 점을 기준으로 해석한다.
4. Enter 또는 Apply로 검토한 동일 제안을 한 번 적용한다. Esc/Cancel은
   문서와 이력을 변경하지 않고 캔버스 입력으로 복귀한다.
5. 확정은 한 Undo이고, 전체 Undo/Redo와 파일 저장 복원이 가능하다.
   대기 상태의 Enter/Repeat command는 현재 선택에서 마지막 윤곽 명령을 다시 연다.

| 명령 | 현재 지원 | 정확도/경계 |
| --- | --- | --- |
| Join | 순서/방향이 섞인 일반 선·호·열린 다중선 → 실제 한 다중선 | 호 sweep을 bulge로 보존한다. 닫힌 경로와 두 반원 루프도 구성한다. 가지 분기·떨어진 경로·작업면/높이 불일치를 거부한다. 같은 레이어와 construction 설정이 필요하다. |
| Explode | 일반 다중선/사각형 → 개별 선·호 | 이동/회전/스케일을 월드 기하로 반영하고 원래 레이어·스타일을 유지한다. 곡선 샘플을 선분으로 분해하지 않는다. 블록 해체는 아직 없다. |
| Break | 일반 선·호·원·다중선·사각형 | 한 점은 분할/열기, 두 점은 구간 제거다. 열린 경로는 두 위치 사이를 제거한다. 닫힌 경로는 첫 점→둘째 점의 저장 방향을 제거하며 Reverse points로 반대 구간을 고를 수 있다. |

Join/Explode 선택은 최대 256개, 교체 출력은 최대 4096개다. 모든 준비와 정책
검사는 문서 변경 전에 끝낸다. 기준 작업면은 XY/XZ/YZ이며 같은 면의 높이가
있는 도형을 보존한다. 기울어진 면과 비균일 스케일의 원/호는 해석 원으로
변환하지 않는다.

화면의 12px는 클릭 대상 획득에만 사용한다. 클릭은 해석 곡선에 투영한 정확한
좌표를 명령으로 보내고, 사용자가 입력한 좌표는 모델 허용오차로 별도 확인한다.
입력 좌표가 곡선에서 벗어나면 자동으로 옮기지 않고 이유와 함께 거부한다.
Join도 확대율이나 화면 스냅 픽셀이 아닌 모델 허용오차를 사용한다.

## 검수로 수정한 기존 기본 조작

- 원/호의 렌더 샘플과 정밀 계산에 중심의 작업면 높이를 반영했다.
- 180° 회전 등으로 면 법선이 반전되면 호/다중선의 sweep 방향도 반영한다.
- 그리기와 정밀 계산의 회전 기준점은 해석 곡선의 극값으로 계산한다.
  서로 다른 화면 분할 밀도가 기준점을 바꾸지 않도록 했다.
- Trim/Extend와 코너 Fillet/Chamfer, 닫기에서 경계 변화로 기준점이 바뀌어도
  이전 model-to-world 좌표계를 유지한다. 코너 미리보기에도 같은 보정을 적용한다.
- Inspector의 깨진 각도·면적·스케일 단위 표기를 °/mm²/× 등으로 복원했다.

## 관계 보호와 차후 확장

구성 교체는 새 위상 ID를 만든다. 선택한 원본이 스케치 구속, live pattern,
수식 바인딩, 치수/해치/솔리드의 참조에 참여하면 현재는 이유를 알리고 거부한다.
잠금·숨김·불명확한 결합·원/호의 타원화도 부분 변경이나 이력을 남기지 않는다.
기존 관계를 고정 주석으로 바꾸거나 조용히 삭제하지 않는다. 독립 복사본의
구성 편집과 원래 관계를 유지하는 편집을 구분한다.

- [contourEditing.ts](../../apps/web/src/features/drawing-editing/geometry/contourEditing.ts): 선/해석 호 경로,
  정렬/뒤집기/결합, 곡선 투영, 구간 절단과 원본 파라미터 변환.
- [contourCommands.ts](../../apps/web/src/features/drawing-editing/commands/contourCommands.ts): 소유권·연관 참조·
  스타일 정책, 원자적 교체와 새 위상 ID.
- [ContourTool.tsx](../../apps/web/src/features/drawing-editing/ui/ContourTool.tsx): 실제 입력·정밀 좌표·
  공통 검증 미리보기/Apply. UI와 자동화는 같은 공개 명령을 사용한다.

후속 스케치/블록 어댑터는 같은 해석 경로 연산을 사용하되 구속과 참조를
명시적으로 재연결해야 한다. mesh의 렌더 삼각형을 이 곡선 원본으로 사용하지 않는다.

## 검증 결과

- 전체 Node **417 tests / 49 suites** 통과.
- 전체 브라우저 **14과제 / 285 UI·Worker checks** 통과.
- 전체 패키지 TypeScript/production 빌드 통과. 기존 500kB 초과 chunk 경고는 남아 있다.
- 새 Node 22개: 독립한 길이/반지름/sweep·좌표 오라클, 선/호 결합과 분할,
  XY/XZ/YZ·반전/변환·큰 좌표, 실패 원자성·소유권·관계 보호,
  미리보기 취소/변경된 문서의 적용 거부·Undo/Redo·직렬화.
- 두 반원을 Join한 프로파일의 정확한 BRep 돌출 체적 `π·10²·8`과
  원본 점 수정 뒤 `π·11²·8` 재생성을 확인했다.
- 새 브라우저 20개: 실제 격리 Edge 마우스/키보드 입력으로 선택,
  Explode→Join→Break, 단위/상대 입력, 정확한 20mm 제거, Enter 적용/반복,
  Esc·포커스·Undo/Redo·파일 표현 복원·문서 변경 재검증·관계 보호·명령 검색.
- 둥근 100×60 윤곽의 독립 면적 `5600+100π`, 둘레 `280+10π`를 확인했다.

로그: `tmp/basic-cad-final-node.log`, `tmp/basic-cad-final-browser.log`,
`tmp/contour-node-final.log`, `tmp/contour-browser-final.log`, `tmp/basic-cad-final-build.log`.
캔버스 캡처: [cad-contour-preview.png](../../output/images/cad-contour-preview.png).

## 남은 기본 작업

후속 정점 추가/삭제·열기/닫기·Lengthen·영역 Stretch는
[BASIC-CAD-CORE-EDITING-2026-10-04.md](BASIC-CAD-CORE-EDITING-2026-10-04.md)에 기록한다.
첫 곡선 Offset·자유 끝부분 Trim/Extend·두 객체 직선 코너와 작업 인계는
[Curve workflow](CURVE-WORKFLOW-2026-10-04.md), 확장 스케치 관계·스냅은
[구속·스냅 기록](EXTENDED-SKETCH-AND-SNAPS-2026-10-04.md)에 있다.
닫힌/중간 구간 Trim·원호 코너·도면 지름/각도 치수·DXF bulge 입력 왕복,
블록 Explode와 구성 변경의 참조 재연결·기본 3D 보강은 남아 있다.

새 자동 과제는 현재 지원 범위를 확인한다. 실무자의 작업 시간·재시도 감소,
GPU/production에서 큰 문서의 피드백 지연, 전체 기계/건축 작업의 완성도는
별도 실무 검수가 필요하다. 전체 우선순위는 [CAD-BASICS.md](../product/CAD-BASICS.md)를 따른다.
