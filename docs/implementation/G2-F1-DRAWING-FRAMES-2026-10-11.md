# G2-F1 도면 프레임 — 2026-10-11

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

기존 아트보드에 선택한 도면의 명시적 멤버·원본 기준점·축척을 저장하는 프레임을 추가했다. 프레임 배치는 모델 객체의 좌표나 transform을 변경하지 않는다. 작업 구역·프레임 연결·자동 시트 인계·연속 도면 합치기는 각각 G2-S1/F2, G6-D5-F1, G2-F3 후속이다.

## 사용

**2D Draft** 화면에서 **Draw frame**을 누르고 빈 영역을 드래그하면 빈 프레임 초안이 생긴다. 도면을 선택하고 **Frame selection**을 누르면 선택한 객체만 여백과 함께 감싼 프레임 초안이 생긴다. 최초 배치는 원본 오른쪽이다. 원본은 그대로 남고 프레임 안에는 같은 데이터를 참조하는 별도 표현이 나타난다. 기존 F는 화면 맞춤을 유지한다.

이름·종이 위치/크기·축척 분모·원본 기준점을 입력하고 Review frame → Apply frame으로 적용한다. 모델 100 mm는 1:2에서 프레임 안 50 mm로 표시된다. Fit members with padding은 입력한 종이 여백으로 내용 크기를 맞춘다. 멤버 checkbox는 추가/제거를 명시하며, 치수·주석도 포함할 항목을 사용자가 선택한다. 경계에 우연히 겹친 다른 객체는 포함하지 않는다.

캔버스에서 프레임을 클릭하면 편집기를 열고, 이름을 드래그하면 이동 초안, 오른쪽 아래 핸들을 드래그하면 crop 크기 초안을 만든다. 이동·크기 조절 뒤에도 Review/Apply가 필요하다. 크기 조절은 원본 확대가 아니며 축척은 별도 필드다. 입력을 타이핑하는 즉시 기존 Review가 무효화된다. Escape/Cancel은 초안을 버린다.

Artboards 패널에서 프레임을 활성화·Fit·숨김·잠금·삭제할 수 있다. 삭제는 프레임만 지우며 원본은 유지한다. 원본이 삭제되면 프레임은 unresolved로 표시되고 출력이 거부된다. 멤버를 제거/재지정해 복구한다. 동일 원본을 여러 프레임이 참조할 수 있고, 각 프레임은 독립 위치·crop·축척을 갖는다.

## 원본과 지원 범위

`CadArtboard.frame`에 `memberIds`, `sourceOrigin`, `denominator`를 저장한다. 파일 v28이 필요하며 기존 문서는 기존 최소 버전을 유지한다. v1–v28 읽기와 v27 이하 강등 거부, History/실제 재열기를 검수한다.

첫 범위는 같은 XY/XZ/YZ 작업면의 유한 drawing·drafting·dimension과 기존 모델 연관 정투영/단면의 2D 출력이다. 3D solid/sketch container·이미지·무한 작도는 명시적으로 거부한다. 프레임 편집/내용 표시는 2D 작업공간에서 제공하며 3D 공간의 프레임 내용 렌더는 후속이다. 내부 형상 편집은 원본 도면에서 수행한다.

모델 연관 뷰는 이미 원점·축척이 적용된 출력이므로, 원본 뷰 위치/축척을 정규화한 뒤 프레임 1:N을 적용한다. 원본 뷰 배치/축척이 바뀌어도 같은 모델 길이가 유지된다. 한 프레임의 모델 뷰 기준은 하나이며 서로 다른 투영도 연결은 G2-F2로 안내한다. 모델 갱신에서 출력 identity가 소멸/불명확하면 명시적 복구가 필요하다. 멤버의 layer/object visibility를 따르며 원본 읽기는 원본 layer lock과 독립이고 프레임 이동/편집은 프레임 lock으로 보호한다.

## 출력

프레임 캔버스, SVG 및 기존 PNG/PDF 출력은 `collectFrameExportItems`를 공유한다. 원본을 복제 변형하지 않고 종이 좌표로 표현을 변환하고 crop한다. 타원은 SVG ellipse/A 원본을 유지하고 다른 곡선의 기존 표시/출력 sampling 정책을 따른다. 치수 문자열은 원본 값을 유지하고 문자 크기/기하는 축척에 따라 표시된다. 종이 lineweight/dash는 기존 export 스타일을 따른다.

편집기에서 Export frame SVG와 **Export frame DXF (flattened)**로 현재 초안을 출력할 수 있다. PDF는 Apply 후 기존 File → Export Artboards PDF 메뉴에서 프레임을 선택한다. DXF는 종이 mm의 sampled curve LWPOLYLINE/기본 TEXT로 평탄화한다. 원본 곡선·연관 치수 의미·fill/dash/color를 보존하는 exact DXF가 아니다. UI에 손실을 표시하며, 회전/부분 잘림 문자를 정확히 처리할 수 없으면 SVG/PDF 사용 또는 crop 확대를 안내한다. 일반 모델 DXF export는 기존 원본 교환 명령이다.

## 검수

[마감 검수](../verification/G2-F1-CLOSEOUT-2026-10-11.json)에 실제 실행 수치와 최초 실패/수정을 기록한다. 독립 100→50 mm 표시, 명시적 소속·원본 보존, crop·반복 원본 프레임·생성/삭제/잠금/미해결, 원본 뷰 정규화, v28·Review/Undo·실제 native 입력/재열기·다운로드를 확인한다.

최종 전체 **1,087 Node / 54 suites / fail·skip 0**, 대상 native browser **7 workflows / 165 checks**(신규26), 타입·architecture **488 modules**·production build 통과. 실제 다운로드 PDF는70×50mm 한 페이지이며 독립 렌더로50×30mm 도면과10mm 여백을 확인했다. 전체 browser suite 재실행은 아니다.
