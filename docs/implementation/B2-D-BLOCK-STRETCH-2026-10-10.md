# B2-D 블록 영역 Stretch

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. 기존 `stretch-drawings`에 블록 instance의 전체 포함 rigid move와 부분 포함 거부 의미를 연결했다. 블록 정의나 다른 instance를 자동 변경하지 않는다.

## 사용

독립 도형과 블록 instance를 선택한 뒤 Modify → **Stretch**를 연다. 선택 없이 시작하면 현재 작업면의 표시·잠금 해제된 독립 도형과 블록을 후보로 사용한다. 기존 crossing area 포인터 입력 또는 Area first/second U,V와 Displacement dU,dV의 단위 입력을 사용한다. 두 영역 코너의 입력 방향은 상관없다.

블록은 **측정 envelope 전체가 영역 안에 있을 때만** instance placement의 translation에 world delta를 더한다. 정의, member geometry, block ID, 객체 ID, rotation/scale과 sibling instance는 유지한다. 도형과 블록이 함께 있으면 일반 도형의 포함된 정점/끝점은 기존 Stretch 의미로 변형되고 블록은 전체가 이동한다.

영역 밖 envelope는 이동하지 않는다. 부분 포함이면 Apply를 막고 블록 이름과 **definition edit 또는 명시적 Disband block** 인계를 표시한다. 일반 도형과 혼합한 batch도 전체가 거부된다. 구성 요소를 바꾸려면 Cancel drawing edit 후 블록을 선택해 기존 Disband block에서 결과를 검토·적용하고, 나온 독립 도형을 Stretch한다. 해체의 지원/참조 제한은 B1-C를 따른다. 전역 definition 변경을 Stretch의 부수 효과로 실행하지 않는다. 정의 격리 편집 UI 확대는 기존 G4-B 후속이다.

녹색 result/점선 amber before는 member geometry와 envelope를 보여준다. 완전 포함 블록은 envelope의 네 모서리를 표시한다. Fit edit preview, detached Preview/Apply, canvas Enter, Cancel/Escape와 한 Undo/Redo를 사용한다.

## 포함 판정과 기하

전체/부분/밖은 작업면에 정렬된 **model envelope AABB**로 구분한다. 원본 선·다중선·bulge 원호·원과 nested placement를 읽고 renderer와 같은 origin/pivot 행렬을 합성한다. 원호/원은 affine 변환 후 U/V/normal의 해석 극값을 구한다. 원호의 양 끝점만 포함된 경우에도 중간 원호가 영역 밖이면 전체 포함으로 판단하지 않는다. 반사·회전·비균일 scale/shear가 있는 원은 ellipse의 극값을 계산해 이동 여부를 정하며, 원본을 새 형상으로 변환하지 않는다.

drawing 외 text/chain/hatch/floor-plan은 기존 drafting renderer의 합성 결과를 포함한다. **문자는 보수적인 model envelope**를 사용한다. 실제 OS font glyph ink와 동일한 bbox가 아니며, 높이를 기준으로 UTF-16 unit마다 2 em와 padding을 확보한다. anchor만 포함된 문자를 전체 포함으로 처리하지 않는다. 공백이 많은 블록이나 문자에서는 envelope가 실제 보이는 선/글자보다 클 수 있다. 빈 내부 공간과 영역이 겹치는 경우에도 envelope 기준 부분 포함이다. 화면 픽셀 stroke 두께는 model envelope에 포함하지 않는다.

XY/XZ/YZ의 평면·높이가 일치해야 한다. 다른 작업면/높이는 밖으로 취급하며 실제 3D/기울어진 비평면 geometry는 거부한다. 중첩은 64 levels/4096 members까지 측정한다. 순환/누락된 정의, 빈 블록, 무한선/ray, 지원 밖 member와 비유한 좌표는 거부한다. 일반 스케치·pattern/construction 소유 instance는 owner 도구 또는 명시적 detach가 필요하다. 독립 주석 Stretch와 스케치 구속 Stretch(B2-E)는 후속이다.

## 명령·보존

새 명령이나 serialization version은 필요하지 않다. 기존 `stretch-drawings`의 objectIds/작업면/영역/delta 계약을 재사용한다. 모든 일반 도형 변경과 블록 이동을 준비한 뒤 적용하며, 부분 포함/잠금/잘못된 입력/재생성 실패는 공통 transaction을 거부한다. Preview는 immutable proposal에서 member별 path와 envelope를 제공한다. 문서가 바뀐 stale plan은 기존 fingerprint/version 검사로 Apply를 거부한다.

순수 측정/분류는 `geometry/blockStretch.ts`, 정책·mutation은 `commands/basicDrawingCommands.ts`, 입력·표시는 `ui/BasicEditTool.tsx`에 있다. App의 선택/무선택 후보에 block instance를 포함하고, `documentPlans.ts`는 별도 member paths를 제공한다. 공유 `drawingTransformMatrix`를 export하여 rendering pivot 계산을 재사용한다.

## 검수

새 Node 8개는 정의/sibling/member/ID 보존과 정확한 rigid world delta·Review·한 Undo/Redo·JSON reload, 혼합 batch의 부분 포함 원자성, 밖/높이 불일치, endpoint만 포함된 원호의 극값, 회전/반사/비균일 circle의 독립 sqrt 극값, nested placement, text envelope, XY/XZ/YZ·잠금·stale를 검사한다.

신규 native Edge/CDP **blockStretch 18 checks**는 실제 App/Worker의 블록 선택→Stretch, 부분 포함 차단·인계 안내, mm/cm 입력, member/envelope/4개 마커 Preview, 잘못된 값 복구·Cancel/포커스, reversed area corners·canvas Enter, 정의/sibling 보존·한 Undo/Redo·JSON reload, line+block 혼합 Apply/Undo를 확인한다. 기존 basicEditWorkflow 24·explodeBlock 15도 통과했다. 최종 **800 Node / 54 suites / fail·skip 0**, 대상 native browser **3 workflows / 57 checks**, 타입·architecture/import·문서 링크 **379 modules**와 workspace production build 통과다. main **1,138.65 kB / gzip 344.24 kB**, viewport **654.75 kB / gzip 177.82 kB**, 기존 large chunk 경고 유지. 전체 browser suite/대형 문서/GPU benchmark는 재실행하지 않았다. 최종 숫자와 로그는 [마감 증거](../verification/B2-D-CLOSEOUT-2026-10-10.json)를 따른다.

마감 중 공유 adapter에 별도 스케치 Stretch 코드가 추가되어 공통 conflict 오류 타입을 `precision/sketchConflict.ts`로 분리하고 기존 state export를 유지했다. command가 state에 의존하지 않도록 정리했으며 solver 실패의 never-return 경로를 명시해 타입 검사를 통과시켰다. 해당 스케치 기능의 완료 여부는 B2-E 검수 범위다.
