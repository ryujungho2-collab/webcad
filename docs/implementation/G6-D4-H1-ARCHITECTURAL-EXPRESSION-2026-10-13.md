# G6-D4-H1 건축 도면 표현

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

후속 B2에서 ellipse/elliptic-arc HLR과 단면 background를 구현했다. 아래 검증 수치는 당시 기록이며 타원 해치와 일반 spline은 계속 제외한다. [후속 지원 정책](G6-D3-B2-CONIC-SEAM-2026-10-13.md).

2026-10-13. 기존 실제 BRep 교선에 건축 표현을 연결했다. 원본 모델과 cut 출력의 참조 계약을 유지하며, 배경·해치·이름은 별도 소유 출력으로 생성한다.

## 사용

View → Assembly and drawings → BRep section에서 Architectural section presentation을 켠다. 남기는 방향/깊이, 배경선, 해치의 종이 간격과 각도, 절단/배경/해치 선 굵기(mm), 도면 이름을 지정한다. Review는 detached, Apply는 한 Undo다. 저장된 도면을 선택하면 옵션과 비기본 레이어·시트 배치를 복원한다.

## 실제 구현

- 절단선은 기존 analytic line/circle/arc 교선과 ID를 사용한다. 건축 옵션을 끄면 기존 레이어 스타일로 돌아간다.
- 배경은 원본 BRep를 절단면의 지정 방향 및 유한 깊이로 exact half-space intersection한 뒤 OCCT HLR로 투영한다. 남긴 부분의 가시 선만 출력하고 교선과 정확히 같은 경계는 제거한다.
- 해치는 부품별 닫힌 경계의 analytic scanline even/odd 교차로 만든다. 동일 부품의 내부 loop는 구멍으로 비운다. 열린 경계, 분기, 교차/접촉/겹침이 모호한 경계는 해당 부품의 해치를 생략하고 경고한다. 종이 간격은 축척 변경 후에도 유지한다.
- 배경/해치/라벨은 도면 소유 출력이다. 직접 이동/삭제를 거절하고, 도면 삭제/옵션 해제 때 정리한다. 소스 소멸이나 재연결 실패 때 함께 숨긴다. 잠금·stale Review는 원자적으로 거절한다.
- 원본/절단면/깊이가 같은 scale/placement 변경은 이전 배경을 종이 좌표로 옮겨 BRep를 재계산하지 않는다. 해치는 새로운 종이 간격으로 재생성한다.
- 실제 Three.js, 아트보드 bounds/자동 시트, SVG·PDF·DXF에 소유 출력을 포함한다. v34는 옵션/소유 관계/경고를 보존하고 손상된 소유 관계 및 하위 버전 선언을 거절한다.

## 검증 프로젝트

[프로젝트](../../output/projects/courtyard-commons/h1-expression/README.md)는 56부품·3평면/2단면/2입면·A2 5페이지다. 건축 표현을 적용한 5개 도면에서 교선 454개, 배경 279개, 해치 2,029개와 라벨 5개를 생성했다. 1/2층 계단 각각 두 부품의 열린/모호한 절단 경계는 해치에서 제외했다. 나머지 도면 경고는 없다. 페이지별 DXF skipped=0이며 schema34 round-trip을 확인했다.

단일 Node 생성 실행은 도면별 약1.6–4.3초, 7도면 시트 재배치 약44초였다. warmed/대규모 평균으로 일반화하지 않는다. BRep 중복 계산 제거와 별개로 수천 소유 선의 문서 복사·bounds·배치 비용은 남아 있다.

전체 Node **1,166/54 suite**, fail/skip0, 타입·architecture **524 modules**·production build 통과. 대상 native **5 workflows/113 checks**(작은 H1 17, 실제 프로젝트21, 기존 도면32/시트19/시트세트24). 실제 프로젝트의 원본 창 폭 편집·Undo/Redo·저장 도면 Review/Apply·재열기를 검증했다. 72dpi A2 5페이지 PDF(596,201bytes)를 다운로드하고 독립 렌더링으로 모든 페이지를 확인했다. 96dpi는 기존 aggregate pixel budget에 따라 명시적으로 거절한다. [정량 검수](../verification/G6-D4-H1-CLOSEOUT-2026-10-13.json).

성공한 단일 native 실행의 창 폭 변경은 **54.578초**(command measure39.062초), 최초 scene24.552초였다. 앞선 병행 실행은66.196초였으며 직후 CDP 입력5초 timeout으로 끝났다. 테스트의 큰 프로젝트만 입력 timeout30초로 늘린 뒤 전체 흐름을 마감했다. 이것은 제품 반응성 개선이 아니며 두 실행을 평균내지 않는다.

## 지원 경계와 다음

재료별 패턴/BIM 의미, 문·창·계단 기호, 배경 면의 채움, 임의 spline/ellipse 투영은 포함하지 않는다. 지원하지 않는 배경 곡선은 전체 작업을 진단하고 sampled 선으로 바꾸지 않는다. 기존 프로젝트의 프로그램 주석은 원래 동일 cut-edge 앵커 배치가 남아 있어 도면 가독성 마감이 필요하다. 이 프로젝트를 졸업 설계 제출물 완료로 보지 않는다.

다음은 **G6-D6-P2 대형 소유 출력 성능 보충**을 먼저 진행한다. 영향 뷰의 bounds/index와 출력 갱신, 문서 snapshot/Undo 비용, retained geometry 재사용 및 화면 rebuild 비용을 각각 측정·개선한다. 정확한 geometry·stale·잠금·Undo 계약을 유지하고 이 56부품/7도면 fixture의 최초/warmed 시간을 구분한다. 그 뒤 **X6-D2-E1 타원 단면**: 기울어진 천창의 실제 타원 교선을 원본 X2-A 계약, crop, 연관 주석/시트 및 출력까지 연결한다. 이후 잔여 conic/seam 정책과 G6-D6-W1 건축 프로젝트 마감을 진행한다.
