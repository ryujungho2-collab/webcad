# 중정형 도서관 검증 P0/P1 수정

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

## 실제 변경

- P0: 비활성 Drawing frames/Workspace sections/Frame connections/Frame sheets/Frame stitches 도구막대를 숨기는 기존 수정을 유지하고 직접 편집 및 프레임 회귀를 확인한다.
- 성능: 모델 원본 feature params/TRS와 뷰/출력의 실제 변경을 비교하여 영향 없는 단면/투영을 건너뛴다. 문서 revision만으로 전체를 재계산하지 않는다. 모델 visibility, 이름, 주석은 새 section kernel task를 만들지 않는다. 파일 재열기 직후 cache가 비어 있어도 이전 resolved 뷰의 동일 원본 부품 교선을 재사용하여, 영향 뷰 안의 변경되지 않은 부품까지 다시 자르지 않는다. 동일 원본/절단면의 analytic section LRU는 1,024개로 제한하고 오류/취소 결과를 삭제한다. HLR은 전체 assembly/투영축에 따른 32개 LRU. 호출자는 clone 결과를 받는다. 종이 scale/origin은 원본 cache key에 들어가지 않는다. 갱신과 bounds/validation의 feature 조회는 output-index Map을 사용한다.
- 캔버스: drawing의 ownership/status/topology metadata는 GPU geometry 서명에서 분리했다. 실제 점/원·원호/스타일·HLR 점선 정보는 계속 서명에 포함한다. 참조가 unresolved가 될 때 visibility는 갱신하되 동일한 1,337개 입면 render object를 버렸다가 다시 만들지 않는다. 실제 브라우저에서 object identity 유지와 stale 출력 숨김을 검사했다.
- 단면 참조: 정확한 정지 꼭짓점과 유일한 동일 방향·인접 관계로 선 그래프를 대응시킨다. 전체 일대일 대응이 증명될 때 기존 sourceKey/object/topology를 유지한다. 최근접점, 커널 explorer 순서, edge 수만으로 연결하지 않는다. 새 branch, 소멸, 뒤집힘, 기준점 없는 이동 component, 모호한 연결은 안전하게 unresolved/rebind로 남긴다. 저장된 sectionFrame을 사용하여 종이 이동/축척 뒤에도 대응을 유지한다. 일반 회전/자유곡면의 영구 kernel topology naming 완료는 아니다.
- 저장 단면 UI: 기존 뷰 layerId를 사용한다. 저장 뷰의 sheet-owned origin/scale과 layer를 유지하며 Review/Apply·한 Undo가 연결된다.
- 일반 투영: Boolean/돌출 및 기존 primitive adapter에 없는 형상은 OCCT `HLRBRep_Algo`의 assembly HLR로 투영한다. 여러 부품의 가림을 함께 계산하고 source별 가시/숨은 구간을 구분한다. sharp edge와 outline silhouette를 출력하며 tangent/iso 선을 자동 추가하지 않는다. 선·원·원호는 analytic 출력. ellipse/spline이면 원자적으로 거절하며 sampled mesh/hull로 대체하지 않는다. 동일 위치의 가시 선에 정확히 겹치는 숨은 선을 억제한다. 임의 부분 겹침의 추가 정규화·곡선 세부 seam 정책은 후속이다.
- 숨은선: `projectionVisibility`에 따라 실제 캔버스/SVG/PDF/DXF에서 점선과 얇은 stroke를 사용한다. 원본 모델/STEP/측정은 영향받지 않는다. UI의 Include hidden lines and occlusion between parts 옵션으로 단순 primitive 뷰에도 HLR을 요청할 수 있다. 기존 단순 primitive 뷰는 그 silhouette 계약을 유지한다.
- 대형 복구 저장: 실제 7도면 문서(약 5.66MB JSON)가 localStorage quota를 넘는 실패를 재현했다. 128KiB 이상 recovery checkpoint는 gzip-base64로 저장하고 작은/기존 plain 및 이미지 분리 checkpoint를 계속 읽는다. gzip 해제의 크기를 64MiB로 제한하고 header 크기를 검사하며 손상 시 이전 검증된 backup으로 복구한다. portable WebCAD 파일은 원본 JSON 그대로다. 저장 실패 시 성공으로 표시하지 않는다. 압축의 직접 의존성은 로컬 설치본 fflate 0.8.3이다.
- 저장: HLR 다중 edge/source/visibility 출력의 `method: brep-hlr`·partId 대응을 schema v33으로 저장한다. 이전 schema로 낮춘 파일은 거절한다. 기존 v24~v32 문서는 계속 읽는다. 출력 topology/visibility 변화 때 추측 연결하지 않고 명시적 Review로 rebind한다.

## 실제 중정 프로젝트 측정

`apps/web`에서 `npx tsx scripts/courtyardP01.ts`를 실행한다. 원래 56부품/5도면 문서를 읽고 동일 5도면 배치와 새 입면을 검사한다. 최종 수치는 [프로젝트 report](../../output/projects/courtyard-commons/p01-fixed/report.json)가 소유한다.

| 경로 | 이전 | 수정 후 단일 실행 |
| --- | --- | --- |
| 프로그램 주석 수정 | 약 3초 | 46ms / section task 0 |
| 5도면 최초 Review | 별도 값 없음 | 6,558ms / source-plane task 164 |
| 5도면 warm Review | 별도 값 없음 | 551ms / section task 0 |
| 5도면 warm Apply | 118,023ms | 550ms / section task 0 |
| 남측 입면 / 동측 입면 | primitive adapter 거절 | 1,736ms / 1,662ms |
| 입면 포함 7도면 배치 | 이전 미지원 | 7,398ms / kernel task 0 |

같은 5도면 Apply 비교의 수정 후 값은 원본 section 결과가 준비된 상태다. 최초 계산 6.6초를 따로 기록한다. Node 실행이며 브라우저·사용자 GPU의 응답 시간으로 일반화하지 않는다. 브라우저 창 폭 편집 시간은 별도 native-report에서 기록한다. 새 도면을 1,337개 추가한 7도면 배치도 0.55초라고 주장하지 않는다.

## 산출물 및 남은 범위

[수정 프로젝트](../../output/projects/courtyard-commons/p01-fixed/courtyard-commons.webcad.json): 56부품·평면 3/단면 2/입면 2·A2 1:100 5페이지. 원래 검증 문서와 구분해 저장한다. PDF는 실제 앱 다운로드, SVG/DXF는 생산 export 함수를 사용한다.

G6-D6-P1과 G6-D4-R1의 이번 재현 문제를 보충했다. G6-D3-B1/B2의 **첫 analytic line/circle/arc HLR 범위**를 추가했다. 건축 제출 수준의 배경 투영·절단선/해치·창/계단 표현은 G6-D4-H1, ellipse/spline은 후속이다. 경사 채광부는 미지원 타원 검사용 형상이며 이 입면에서도 제외한다. 출력 주석 앵커를 공간별로 배치하는 설계 작성 개선은 별도다.

A2 5페이지 PDF는 96dpi에서 총 17,814,075 pixels로 기존 16,000,000 한도를 넘는다. 이 명시적 preflight를 검증하고 72dpi로 5페이지를 출력했다. 용량 제한을 무작정 늘리거나 출력 성공을 위해 경고를 숨기지 않았다. PDF의 입면 가시/숨은 선과 기존 3평면/2단면을 독립 렌더링으로 확인했다.

최종 native 7도면 편집: 초기 장면 준비 11,681ms, 입력→완료 12,566ms, 실제 update-primitive 명령 11,132ms. 변경 없는 부품 교선을 다시 계산하던 같은 fixture 실행(약 33초)에서 개선했다. 해당 편집은 section task 3개, HLR task 2개이며 여전히 실시간 반응 속도는 아니다. kernel classifying/Boolean/measurement 비용의 추가 축소는 후속 성능 작업으로 남긴다. 해당 시간은 자동화/Vite/SwiftShader 환경이며 Node batch 시간과 구분한다.

## 최종 검수

전체 Node **1,158 tests / 54 suites / fail·skip 0**, 타입·architecture **517 modules**·production build 통과. 대상 native **6 workflows / 167 checks**: 중정 20, 모델 단면 32, 시트 세트 24, 직접 편집 43, 프레임 시트 24, 모델 투영 24. 전체 browser 페이지 재실행은 아니다. [정량 검수](../verification/COURTYARD-P0-P1-FIXES-2026-10-12.json).
