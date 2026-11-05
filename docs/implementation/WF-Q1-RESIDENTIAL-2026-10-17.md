# WF-Q1 소형 주거 과제 발행 검증

> 현재 사용법: [평면도와 건축 콘텐츠](../features/FLOOR-PLANNING.md). 2026-10-17, 아래 한 건의 지원 범위로 완료. 외부 실측/고객 도면이나 시공도서 적합 판정은 아니다.

## 과제와 제출 파일

자체 작성한 6,000 × 4,000mm 주거 검증 DXF를 실제 Edge UI로 준비했다. 외곽/내벽 5개, 출입문과 실내문 2개, 창 1개, 2인 소파, 지름 1,000mm 원형 홀을 가진 바닥/천장을 한 문서에서 구성했다. 직선 벽의 높이는 2,700mm, 최초 두께는 200mm다. 층 바닥은 상면 0/두께 150mm, 천장은 하면 2,700/두께 100mm다.

콘텐츠는 빈 box placeholder가 아니다. Boolean으로 만든 문틀+문짝(890×140×2,090), 관통 창틀+중간틀(1,490×140×1,190), 좌판+등받이+팔걸이+하부 받침 소파(1,800×800×900)를 사용했다. 테스트 시작 시 이 **라이브러리 원본 3개만 명령으로 준비**하고, 정의 캡처와 네 인스턴스 배치는 실제 UI로 수행했다. 단일 완성 solid 지원 범위를 사용하며 다중 부품 assembly나 유리·힌지 상세 제품 모델은 아니다.

- [제출 묶음 및 재실행 안내](../../output/projects/residential-q1/README.md)
- [WebCAD v42 원본](../../output/projects/residential-q1/residential.webcad.json) · [입력 DXF](../../output/projects/residential-q1/source.dxf)
- [최초 A3 1:50 PDF](../../output/projects/residential-q1/issue-01-50.pdf) · [수정 A3 1:50 PDF](../../output/projects/residential-q1/issue-02-50.pdf) · [수정 A3 1:100 PDF](../../output/projects/residential-q1/issue-03-100.pdf)
- 각 PDF와 같은 이름의 SVG/DXF 및 Poppler PNG를 함께 제출했다. 최종 원본은 수정된 1:100 시트다.

## 실제 UI에서 수행한 경로

1. DXF 가져오기 → 레이어 역할 → 미사용/주석/진단 그룹 제외 → 중첩 블록 의존 레이어 유지. 미리보기 두 점으로 6,000mm를 검산하고 기준점을 (0,0)으로 지정, 참조 레이어 잠금, Import Undo/Redo.
2. 잠긴 참조의 0.05mm 테라스 틈을 명시적 bridge로 수리하고 면 생성. 같은 참조의 직선 중심선 5개에서 벽 생성, 창턱 900mm인 창과 문 2개 생성.
3. 세 콘텐츠 정의를 캡처하고 Natural size와 5mm padding으로 창/문 개구부 슬롯 및 소파 공간 슬롯 배치. 홀을 가진 Timber 바닥과 White plaster 천장 생성.
4. 실제 배치된 모델 11개를 등록하고 XY/Z=1,200 평면, XZ/Y=1,500 단면을 생성. retained background와 절단 해치를 켜고 A3 420×297mm 1:50 시트에 배치, UI 버튼으로 PDF/SVG/DXF 다운로드.
5. 내벽 두께를 200→250mm로 수정하면서 명시적 도면 rebind 포함. 두 뷰의 resolved 상태와 변경된 출력, 한 Undo/Redo의 전체 문서 동등성 확인. 1:50 재발행, 같은 시트를 1:100으로 변경해 다시 다운로드.
6. 로컬 저장 및 실제 file input으로 WebCAD 재열기. 새 Undo 세션, 문서 내용·슬롯·참조·resolved 뷰를 대조. 시트는 모델과 겹치지 않도록 **원점 (10,000,10,000)** 에 두고 2D → Fit active artboard로 검토한다. SVG/DXF도 이 명시적 종이 좌표 원점을 유지한다.

## 발견하고 수정한 문제

**잠긴 참조 입력 경로 누락:** 엔진은 잠긴 DXF를 읽어 면/벽/slab을 만들지만, 전역 편집 선택은 잠긴 객체를 제거했다. 모델 트리 클릭 뒤 작업 패널에는 `0 selected sources`가 표시되어 작업이 막혔다. `FloorPlanTaskPanel`에 **Choose locked reference sources**를 추가했다. 작업 입력만 별도로 선택하며 전역 편집 선택과 원본 잠금을 바꾸지 않는다. 결과는 활성 편집 레이어에 생성하고, 선택/문서 revision 변경 시 기존 Review를 무효화한다. 같은 UI 검사에서 잠긴 소스를 사용한 면·벽·바닥·천장 생성을 확인했다.

**기존 Q1 테스트의 결함:** 최초 7개 중 6개 실패. DXF block에 배열 대신 문자열을 전달해 문자별로 끊은 fixture, 잘못 펼친 layer 속성, 자기 T 접합인 테라스, 존재하지 않는 cabinet/ceiling, 개구부 차감 전후 체적을 동시에 요구하는 식, 잘못된 bridge 인덱스와 Undo 전후 snapshot, 범위를 벗어난 창, v42 필드 없는 문서의 버전 기대를 수정했다. 도면 변경 검증은 안정된 출력 ID의 변경이 아니라 실제 SVG 기하 변경을 비교한다. 실형상 콘텐츠 검사를 추가해 Q1 Node 검사는 8개다.

**UI 사용상 주의:** 두 번째 새 도면은 Saved drawing에서 저장 도면을 선택한 뒤 New로 전환했다. New가 이미 선택된 상태에서 같은 값을 다시 고르는 것만으로는 새 identity가 생성되지 않는다. 모델과 시트를 같은 원점에 두면 화면에 겹치므로 이번 파일은 종이 원점을 분리했다. 이 두 항목은 추가 UX 개선 후보이며 출력 데이터 누락으로 분류하지 않는다.

## 검증 결과

| 검사 | 결과 |
| --- | --- |
| Node 전체 | 1,281 tests / 54 suites / 실패 0, 약 43.4초 (디버그 스크래치 제거 후 최종 재실행) |
| 주거 Q1 Node 검사 | 8/8. 전체 실행 0 실패로 콘텐츠·벽·DXF 준비·floor 회귀를 함께 확인 |
| 실제 Edge / React / Worker / SwiftShader | 주거 21 checks 통과 |
| 기존 floorTasks UI 회귀 | 18 checks 통과 |
| TypeScript / architecture / production build | 통과 / 592 modules / 427 modules; 기존 큰 chunk 경고 유지 |
| 독립 PDF 검사 | 3개 모두 1페이지·A3 420×297mm, Poppler 렌더·육안 확인 |
| 독립 원본 검사 | v42, 모델 11개, resolved 단면 2개, 콘텐츠 4개, 누락 feature 입력 0, 참조 잠금 유지 |

PDF와 SVG에서 한글 제목·뷰 이름, 1:50/1:100, 절단/배경/해치 0.5/0.18/0.13mm 선 굵기와 원형 홀을 확인했다. 원형 홀 중심의 빈 픽셀과 경계 픽셀을 독립 검사했고, 내벽 변경 전후 PDF 픽셀 차이도 확인했다. 종이 경계 잘림은 Node에서 의도적 바깥 배치의 DXF 거부로 검증했다. PDF는 기존 **96dpi raster PDF** 경로이며 CAD 벡터 보존본은 SVG/DXF다.

동시 실행한 기존 floorTasks UI는 kernel 초기화/돌출 preview 대기 18초를 초과했다. 주거 실행 종료 후 **단독 재실행 18/18 통과**했다. 이 시도는 통과 수치에 합산하지 않으며 병렬 브라우저 성능 보증으로 해석하지 않는다. 최초 샌드박스 내부 브라우저 실행도 사용할 수 없어 기존 테스트 runner를 승인된 외부 실행으로 검증했다.

최종 제출 파일은 발행 대조 후 Poppler로 다시 렌더해 독립 검사 스크립트를 재실행했고, 3개 PDF·SVG/DXF·원본·입력 DXF의 SHA-256이 재검산과 일치한다. 잠긴 참조 입력 경로 누수와 기존 Q1 테스트 결함 수정 외에 개발 디버그 스크래치(tmpDebug·check-validator·debug-override)는 병합 전에 제거했다.

기계 판독 증거: [검증 manifest](../verification/WF-Q1-2026-10-17.json), [UI report](../../output/projects/residential-q1/native-report.json), [독립 검사 및 SHA-256](../../output/projects/residential-q1/independent-report.json).

## 지원 범위와 남은 항목

중복 2개·0.1mm gap·T 접합·대좌표·중첩 블록·단위 불일치·잠김은 주거 fixture/Node 검사로, 1mm gap·Z 편차·자가교차는 기존 floorTasks 회귀로 진단했다. 정상 UI 발행에서는 원거리 진단 그룹을 명시적으로 제외했다. 모든 부정 fixture를 UI로 반복한 것은 아니다.

벽은 독립 butt end로 코너 자동 융합이 없다. 창은 개방 프레임이며 유리 제품 상세가 없고, 문짝 개폐 동작·정확 충돌/법정 이격은 검증하지 않았다. 원형 홀은 기하·출력 검사 목적이며 생활 안전/난간 설계가 아니다. 급배수·위생기구·전기·치수 체계·법규를 갖춘 완성 주택 설계나 외부 DWG/SKP 상호운용, 장시간/전체 프로세스 메모리 상한도 이번 완료에 포함하지 않는다. CAN/MEAS/IO 및 G6-D5-Q1 출력 전 점검은 별도 카드로 남는다.
