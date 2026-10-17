# G6-D5-F1 프레임·구역 자동 시트 — 2026-10-11

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

선택 프레임/작업 구역을 A4/A3 종이 페이지로 배치하는 첫 범위를 완료했다. 원래 프레임과 작업 구역, 원본 모델/파생 뷰를 이동하지 않는다. `CadArtboard.frameSheet`가 별도의 출력 identity와 종이 mm 배치를 저장한다. G2-F3 연속 도면 이어 붙이기는 다음 카드다.

## 사용

1. 2D에서 **Frame sheets**를 연다. 구역/프레임을 체크한다. 접힌 구역도 출력 대상이다. 구역 선택 순서와 각 구역의 프레임 순서를 먼저 적용하고, 명시적 프레임 선택 순서를 이어서 적용한다. 중복 참조는 한 번만 배치한다.
2. A4/A3 가로/세로, Standard/Compact 도곽, 도면명/작성자/리비전, 여백/간격, 최대 페이지 수와 출력 아트보드 시작 위치를 정한다.
3. **Scale divisors**는 기존 프레임 축척에 적용하는 공통 축소 배수다. `1`은 원래 축척, `2`는 1:10 프레임을 1:20으로 출력한다. 후보별 결과를 표시하며 적은 페이지를 우선하고 같은 페이지 수에서는 큰 도면 축척을 선택한다. 읽을 수 없는 참조/프레임 라벨은 후보에서 제외한다.
4. **Review frame sheets**에서 실제 종이 장면과 페이지 번호·프레임 이름·유효 축척을 확인한다. **Fit sheet N**으로 페이지를 탐색하고 **Apply frame sheets**로 한 Undo에 게시한다. 설정 변경/외부 문서 변경은 기존 Review를 무효화한다. Cancel은 원본을 유지한다.
5. **Saved sheet sets** 또는 종이 페이지 라벨로 기존 묶음을 편집한다. 고정은 연결/정렬 그룹 전체를 선택하며 이전 종이 위치와 페이지를 유지한다. 원본 작업 프레임을 평행 이동해도 고정된 종이 위치는 그대로다. 기존 용지/축소 배수/도곽 변경 또는 crop 변경은 고정을 해제하고 검토한다.
6. Review에서 페이지별 **SVG**, **DXF (flattened)**를 다운로드한다. Apply 이후 **File → Export Artboards PDF → Frame sheets · 묶음 이름**을 선택하면 원본 작업 프레임을 제외하고 번호순 종이 페이지만 출력한다. 이 scope는 모든 페이지가 표시되어 있어야 한다.
7. **Review delete frame sheets → Apply**는 종이 묶음만 삭제한다. 원본과 구역은 보존하며 Undo로 복원된다.

## 배치·참조·저장 계약

- 한 연결 끝점만 선택해도 전체 F2 트리를 포함한다. 구역 경계를 넘는 연결도 한 페이지에 유지한다. 이미 연결된 프레임은 F2의 Review layout으로 정렬을 마친 상태여야 한다. 그룹을 용지에 담을 수 없으면 overflow로 거부하며 분할하지 않는다.
- 기존 A1/A2의 결정적 사각형 packing과 모델 공통 좌표 정렬을 재사용한다. 독립 배치는 연결 묶음 내부의 상대 위치를 보존한다. Orthographic 옵션은 같은 부품의 파생 front/top/right 프레임을 공통 모델 축으로 정렬한다. 중복 basis·축척 충돌·다른 연결 종속 구성이 있으면 명시적 F2 연결/정렬을 요청한다.
- 여러 페이지에서도 공통 축소 배수를 사용해 상세 확대 비율을 보존한다. 프레임 크기와 참조 라벨·caption을 검사하고 도곽/표제란 여백을 예약한다. 회전 packing/임의 빈틈 채우기는 하지 않는다.
- 종이 배치는 `frameId`, frame의 멤버/crop/축척 계약, 원래 프레임 크기, 로컬 종이 위치를 저장한다. 모델 geometry는 복제하지 않는다. 모델/원본 도면 수정은 기존 연관 파이프라인을 통해 출력에 반영한다. workspace origin/구역 접기는 종이 배치에 영향을 주지 않는다.
- 프레임 crop/축척/멤버·연결 참조가 바뀌면 **Re-layout required**로 출력/화면에서 진단한다. 잘못된 상태를 이전 도면인 것처럼 출력하지 않는다. source가 사라지거나 모델 뷰가 미해결이면 기존 F1/F2 guard가 동작한다.
- 모든 종이 페이지는 잠금 시 재배치/묶음 삭제를 막는다. 개별 종이 origin/size/plane/frame 변경이나 페이지 삭제는 직접 명령에서 거부한다. 참조되는 원본 프레임을 삭제하려면 먼저 시트 묶음을 제거한다.
- 새 저장 계약은 v31이다. 이전 최소 버전은 유지한다. 종이 페이지 순서·중복 source·메타데이터 불일치·부족한 source·용지 밖/겹친 배치는 재열기에서 거부한다. History, cache, New/Open과 batch rollback은 기존 artboards snapshot 경로를 사용한다.

## 출력과 지원 경계

`collectFrameSheetItems`를 viewport/SVG/PNG/PDF/DXF가 공통 소비한다. 각 종이 프레임의 유효 축척으로 가상 presentation을 계산하므로 정투영 역할·단면선/번호·상세 crop/번호·부품 번호가 올바른 종이 축척으로 그려진다. 프레임마다 SVG clipPath를 유지해 원본 crop 밖 글자가 옆 프레임에 새지 않는다. 프레임 이름/유효 축척, 도곽, 표제란과 Page N/count를 출력한다.

DXF는 기존 sampled LWPOLYLINE/TEXT 평탄화 계약이며 fill·dash·color·association을 유지하지 않는다. 부분 crop/회전/basis 텍스트는 DXF로 충실히 표현할 수 없어 거부하고 SVG/PDF를 안내한다. TEXT 경계 검사는 left/center 정렬에 맞춰 계산하도록 보강했다. PDF는 기존 Worker의 raster PDF이고 vector PDF/일반 HLR/spline 전체/연속 도면 병합은 이번 카드에 포함하지 않는다. 지원 도면/타원 원본은 기존 F1/X2-A 출력 계약을 따른다.

## 검수

전체 **1,132 Node / 54 suites / fail·skip 0**, 신규 frameSheets **16 tests**, 타입·architecture **504 modules**·production build 통과. 대상 native browser **8 workflows / 210 checks**이며 전체 브라우저 재실행은 아니다. frameSheets24, drawingFrames26, frameLinks36, workspaceSections25, modelSheetSet24, artboardPdfWorkflow21, artboardsWorkflow31, historySelection23.

원본/구역 보존, 실제 Review ghost/설정 변경/Cancel/Apply/Undo/Redo, 부분 고정 거부, SVG/DXF 다운로드, 묶음 scope PDF, v31 캐시 재열기를 확인했다. Node는 실제 box 기반 front/top/right 파생 정렬과 상세 확대, 후보 라벨 적합성, 원본 수정/재배치 진단, crop clip, 잠금/삭제/batch rollback과 파일 손상을 추가 확인한다. 50mm 선분이 1:2에서 25 paper mm, 추가 divisor2에서 12.5 paper mm임을 검증했다.

다운로드 PDF를 Poppler로 독립 검사했다: A4 landscape **2페이지**, `841.89 × 595.276pt`. [PDF](../../output/pdf/frame-sheets.pdf), [SVG](../../output/pdf/frame-sheets-page-1.svg), [DXF](../../output/pdf/frame-sheets-page-1.dxf), [1페이지 미리보기](../../output/pdf/frame-sheets-preview-1.png), [2페이지 미리보기](../../output/pdf/frame-sheets-preview-2.png). 상세 증거는 [마감 기록](../verification/G6-D5-F1-CLOSEOUT-2026-10-11.json)을 따른다.
