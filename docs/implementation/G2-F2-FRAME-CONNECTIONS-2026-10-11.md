# G2-F2 프레임 연결·자동 정렬 — 2026-10-11

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

기존 G2-F1 도면 프레임과 G2-S1 작업 구역을 연결하는 기능을 구현했다. 모델/도면 원본을 보존하며 기준 프레임과 종속 프레임의 관계를 저장하고, 배치안만 검토 후 적용한다. 전체 **1,116 Node / 54 suites / fail·skip 0**, 타입·architecture **498 modules**·production build와 대상 native browser **7 workflows / 186 checks**를 통과했다. 전체 browser 재실행은 아니다. [마감 기록](../verification/G2-F2-CLOSEOUT-2026-10-11.json)을 따른다.

## 사용

1. 2D에서 **Link frames**를 누르고 **Source / anchor**와 **Dependent frame**을 선택한다. **Connections** 목록이나 연결 안내선의 이름으로 기존 관계를 다시 편집한다.
2. **orthographic**은 front/top/right 역할·배치 방향·종이 mm 간격을 지정한다. front↔top은 위/아래, front↔right는 좌/우로 배치한다. 공통 모델 X 또는 Z 좌표를 맞추므로 서로 다른 crop 기준점에도 동일한 모델 좌표가 정렬된다. 축척은 같아야 하며, 기존 모델 투영의 실제 basis와 부품 목록이 역할에 맞는지 검사한다.
3. **section**은 이미 있는 단면 도면에 연결한다. 원본의 정규화 모델 좌표에서 두 절단선 끝점·좌/우 보기 방향·번호를 지정한다. 원본 프레임에 절단선/화살표/번호, 대상에 같은 단면 번호·축척을 표시한다. 모델 연관 뷰에서는 실제 단면 basis/height와 절단선 위치도 대조한다.
4. **detail**은 같은 원본의 확대 프레임에 연결한다. 대상 프레임 crop에서 상세 범위를 유도하므로 crop 편집 시 원본의 상세 표시도 갱신된다. 범위는 원본 crop 안에 있어야 하고 대상 축척 분모가 더 작아야 한다. 원본에는 상세 범위/번호, 대상에는 상세 번호/축척을 표시한다.
5. **part**는 조립/부품 도면 양쪽에 있는 source part를 명시한다. 모델 뷰는 등록 부품과 뷰의 부품 목록을 대조한다. 독립 2D에서는 양쪽 프레임이 같은 선택 도면 객체를 참조해야 한다. source identity와 부품 번호를 저장하고 양쪽 출력에 표시한다.
6. **Review frame connection → Apply frame connections**로 연결과 종속 트리 배치를 한 번에 적용한다. 화면에 배치 초안과 이동 좌표를 보여 주며 한 Undo다. 다른 도구/작업면 진입·문서 교체·외부 수정은 검토를 무효화한다. 잘못된 단위/수치 입력도 Apply를 허용하지 않는다.
7. 기존 연결의 **Review connected layout**은 현재 프레임 크기/crop 기준으로 종속 트리를 다시 맞춘다. 프레임 origin/size를 독립 편집하면 `Needs layout Review`, 참조가 잘못되면 `Unresolved`로 표시한다. 모델 변경 자체가 프레임 crop을 자동으로 확장하거나 연결 배치를 조용히 이동시키지는 않는다. 필요한 crop은 F1에서 명시적으로 편집하고 재정렬한다.
8. **Review connected move**의 X/Y는 연결된 전체 트리를 같은 delta로 이동한다. 선택한 관계의 상위 root를 찾아 모든 종속 프레임을 한 번씩 이동하며 구역 간 연결도 지원한다. 구역 소속과 구역 자체 origin은 그대로다. 기존 구역 전체 이동은 해당 구역의 프레임만 이동하므로 구역 밖 연결의 drift를 표시하고 이후 재정렬한다.
9. **Keep dependent frame fixed**는 대상 위치를 고정한다. 이미 올바른 위치의 프레임을 고정해야 한다. 고정 또는 잠금 대상이 움직여야 하는 배치/묶음 이동은 전체를 거부한다. 고정 프레임은 F1 수치 이동과 S1 구역 이동에서도 보호한다. 기준 프레임 고정은 기존 아트보드 잠금을 사용한다.
10. **Review detach connection**은 관계와 그 관계의 주석만 제거한다. 위치·프레임·모델은 유지한다. 종속의 하위 관계는 새 root 아래에서 유지한다. 연결된 프레임 삭제/작업면 변경은 먼저 관계를 해제하도록 안내한다.

## 계약과 출력

선택적인 `CadDocument.frameLinks`와 v30 파일을 사용한다. 관계는 `fromId/toId`, 유형별 참조, 방향·간격·고정 여부를 가진다. 구조는 프레임당 부모 하나인 방향성 트리/forest이며 순환, 중복 부모, 모순된 정투영 역할, 중복 유형별 참조 번호, 다른 presentation 작업면, 일반 아트보드/시트 멤버를 거부한다. 연결된 프레임의 최종 사각형 겹침도 거부한다. 연결 밖의 다른 프레임과의 충돌 회피/자동 packing은 다음 시트 단계다.

배치는 프레임 origin만 바꾸며 모델 TRS·실제 치수·뷰 원본·프레임 crop·축척을 보존한다. 모델 투영의 원본 origin/scale 정규화와 기존 시트 정투영의 공통 좌표 정렬 계산을 재사용한다. 연결 유형/번호는 저장된 참조이고 새 기하 생성이나 Boolean/Join이 아니다.

정투영 역할/축척, 단면선·화살표·번호, 상세 범위·번호, 부품 번호는 `collectFrameExportItems`를 통해 프레임 화면과 SVG/기존 PNG/PDF/평탄화 DXF가 같은 표시를 소비한다. 프레임 간 점선 안내선은 화면 전용이며, 안내선 라벨 위의 Ctrl-wheel도 카메라 확대/축소로 전달한다. 구역을 접으면 연결 안내선도 숨기지만 프레임 출력과 참조 주석은 유지한다. SVG/PDF는 crop·선 스타일을 유지하고, F1 DXF의 sampled polyline·TEXT 평탄화와 색·dash·연관 정보 손실은 그대로 표시한다. 참조 글자 크기는 종이 mm에서 실제 좌우/상하 여유 공간을 고려한다. 대상 이름과 축척은 두 줄로 표시하며 1mm보다 작은 글자가 필요하면 crop 확대/번호 축약을 안내한다. 너무 작은 crop은 명시적으로 거부한다.

원본 객체/뷰가 없어지거나 모델 단면 높이·참조 조건이 바뀌면 명확한 `Unresolved` 진단과 출력 거부를 제공한다. 유효한 새 source/crop/cut로 연결을 다시 Review하거나 해제할 수 있다. 파일 구조 검사와 모델 참조의 현재 해결 가능성은 구분해 저장된 미해결 관계를 재열기 후 복구할 수 있다.

## 지원 경계와 다음 단계

- XY/XZ/YZ의 같은 presentation 작업면 프레임끼리 지원한다. 서로 다른 model basis의 투영이 XY 도면으로 표시되는 기존 adapter도 지원한다. 임의 camera/3D 화면상의 연결 배치는 제외한다.
- 모델 연관 정투영/단면 기하는 기존 G6/X6 adapter의 지원 범위다. F2가 새 HLR/곡선/단면 기하를 생성하지 않는다. 독립 2D의 역할/절단 위치는 사용자가 명시한다.
- 상세 crop은 대상 프레임의 source 범위 그대로이며 자동 margin/주석 재배치나 자동 crop 확장은 제공하지 않는다. 번호는 명시적으로 편집하며 자동 번호 매김은 시트 후속이다.
- 관계 하나씩 원본/대상 프레임을 선택해 트리를 구성한다. 임의 다중 부모 네트워크나 mate solver는 지원하지 않는다.
- 다음은 **G6-D5-F1 프레임·구역 자동 시트**다. 작업 프레임과 종이 위 배치 identity를 분리하고, 이 연결 트리를 하나의 배치 묶음으로 보존한다. **G2-F3 연속 도면 이어 붙이기**는 그 다음이다. **X6-D2-E1**은 별도 CAD 기하 확대 큐다.

## 검수 결과

신규 Node 18개는 실제 모델 box의 front/top 정투영, 실제 section height와 절단 참조, assembly/part source identity를 포함한다. Native UI 36개는 네 연결 유형, 단위 입력, Review ghost 프레임/안내선, 고정/잠금·모순 역할 거부, 구역 간 이동, bounds 변경 후 reflow, 해제, 번호 출력, Undo와 실제 v30 재열기를 검사했다. source 50mm 선분이 원본 1:2에서25 paper mm, 상세1:1에서50 paper mm임을 독립 수치로 확인했다.

기존 workspaceSections25, drawingFrames26, modelSheetSet24, historySelection23, artboardPdfWorkflow21, artboardsWorkflow31도 통과했다. 접힌 종속 프레임도 PDF 5페이지에 포함되고 source/상세 페이지를 pdfinfo/pdftoppm로 독립 확인했다. 최초 DXF 검수에서 상세 번호의 가장자리 텍스트 crop 문제를 발견해 실제 여유 공간 기준 크기·최소1mm·이름/축척 두 줄 표시로 수정했고, 최종 native SVG/DXF/PDF 다운로드를 통과했다.
