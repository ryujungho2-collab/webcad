# G6-D5-A2 도곽·정렬·다중 페이지 — 2026-10-11

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

기존 자동 시트 배치에 도곽, 정면·평면·우측면 정렬과 페이지 분할을 구현했다. `layout-model-sheet-set`은 전체 시트 묶음을 한 Review/Apply로 변경하고 `delete-model-sheet-set`은 원본 모델과 뷰를 유지하며 시트 묶음만 삭제한다. [검수 기록](../verification/G6-D5-A2-CLOSEOUT-2026-10-11.json), [실행 상태](../../NEXT-STEPS.md).

## 사용

View → Assembly and drawings → Model drawing sheet에서 **Automatic sheet layout → Title block and multiple pages**를 켠다. 종이 크기·origin·여백·간격·축척 후보·페이지 상한과 대상 뷰를 지정한다. **Standard 32 mm / Compact 24 mm** 도곽 템플릿을 선택하고 도면명·작성자·개정을 편집한다. 제목·축척·현재/전체 페이지 번호는 각 페이지에 출력한다. 템플릿 선택과 필드 편집을 지원하며 임의 도곽 그래픽 제작/import는 후속이다.

**Front / top / right alignment**는 같은 부품 집합의 정면 XZ·평면 XY·우측면 YZ를 묶는다. 정면과 평면은 공통 X, 정면과 우측면은 공통 높이를 유지한다. 같은 basis의 중복 뷰는 독립 배치를 선택해야 하며 두 개 이상을 정렬할 때 정면이 필요하다. 단면 뷰는 독립 그룹이다. 정렬 묶음과 각 뷰에 부착된 Leader·일반/chain 치수는 페이지 사이에서 분리하지 않는다.

Review는 후보별 실패 또는 페이지 수, 선택 축척, 페이지별 뷰 목록·종이 bounds와 도면 ghost를 보여 준다. 후보 중 **페이지 수가 가장 적은 결과**, 동률이면 **가장 작은 축척 분모**를 선택한다. Apply는 전체 페이지를 한 Undo로 변경한다. 저장된 시트 묶음을 선택해 필드·템플릿·축척·뷰를 다시 Review할 수 있다. 고정 뷰는 기존 페이지·절대 위치·축척을 유지하며 정렬 묶음 전체를 고정하거나 해제해야 한다.

**Output page**는 SVG/DXF의 대상 페이지를 선택한다. **Preview model sheet PDF**는 선택한 시트 묶음의 모든 페이지를 번호 순서대로 출력한다. 기본 아트보드 출력도 소유 뷰·주석·도곽을 함께 소비한다. 숨겨진 페이지는 전체 PDF 출력 전에 복구해야 한다.

## 배치·참조·보호

최대 64뷰·12축척 후보·16페이지를 지원한다. 회전 없는 결정적 휴리스틱이며 최적 packing을 보장하지 않는다. 한 페이지의 content 영역은 도곽 footer를 제외하고 A1의 문자·stroke·치수 bounds를 사용한다. 원호 전체 원 envelope와 system-ui 문자 폭의 보수적 envelope를 유지한다. 주석 내부 routing, 첫각법/사용자 투영 배치 규칙, 영구 정렬 solver는 포함하지 않는다.

기존 페이지의 sheet/artboard/title/frame ID와 모든 원본 뷰·출력 ID는 유지한다. 페이지가 늘면 새 페이지를 만들고 줄면 퇴역한 페이지의 도곽·제목·아트보드를 정리한다. 원본 모델·뷰·주석과 측정값은 삭제하지 않는다. 도곽 사각형의 정점·변 topology를 재편집에도 유지한다. 다른 시트의 뷰를 가져오거나 생성될 페이지 ID가 다른 시트를 덮어쓰는 경우는 거부한다.

전체 묶음의 잠긴 페이지·도곽 layer, 변경할 뷰/주석 lock, 고정 페이지 상한, field 폭 초과, unresolved 참조, overflow와 stale Review는 문서·History를 변경하지 않는다. 직접 도곽 이동/삭제나 페이지 크기·origin 변경은 시트 묶음 편집으로 안내한다. 모델 변경 후 재배치는 명시적 Review이며 자동으로 페이지를 다시 나누지 않는다.

## 저장과 출력

`ModelSheet.publication`에 set ID·페이지 번호/총수·템플릿·정렬·필드·frame IDs를 저장한다. 새 publication이 있는 파일은 **v26**, 기존 문서는 기존 최소 버전을 유지하며 v1–v25 읽기도 유지한다. 페이지 순서/소유권·공통 축척/필드·도곽 참조를 검증하며 publication을 v25로 낮춘 파일은 거부한다.

여백·간격·축척 후보·고정 checkbox·페이지 상한은 Review의 session 입력이다. 저장되는 값은 실제 페이지/뷰 배치·축척·도곽과 publication 메타데이터다. SVG/PDF는 종이 mm, DXF는 정확한 직선/원/호·폴리라인/문자를 사용한다. DXF 모델 연관 의미는 flatten되고 외부 font는 달라질 수 있다. 한글 font 임베딩·타원/spline/hidden line 출력 확대는 G6-D5-E1에서 진행한다.

## 검증

신규 Node 12개는 결정성·detached Review·다중 소유권·페이지 증감·정렬/고정·모델 치수·도곽 topology·ID 충돌·잠금·취소·stale·삭제·v26 저장/Undo를 검증한다. 실제 브라우저 24 checks는 3페이지 생성, 전체 PDF와 페이지별 SVG/DXF, Compact 1페이지 재배치, 정렬, 잠금/상한, 실제 cache 재열기를 검증한다.

다운로드한 [3페이지 A4 PDF](../../output/pdf/sheet-set.pdf)를 pdfinfo/pdftoppm으로 독립 렌더링해 도면·도곽 필드·페이지 번호와 종이 경계를 확인했다. [1페이지 렌더](../../output/pdf/sheet-set-preview-1.png), [2페이지 렌더](../../output/pdf/sheet-set-preview-2.png), [3페이지 렌더](../../output/pdf/sheet-set-preview-3.png). 실제 수정과 검증 실패/재실행은 검수 JSON에 기록한다. G6-D5 상위 전체 완료를 뜻하지 않으며 다음 CAD 카드는 **X2-A 타원 원본 기반**이다.

최종 전체 **1,060 Node / 54 suites / fail·skip 0**, 대상 native browser **7 workflows / 166 checks**, 타입·architecture **478 modules**·production build 통과. 전체 browser suite 재실행은 아니다.
