# X2-A 타원 원본 기반 — 2026-10-11

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

Standalone ellipse/elliptic arc 작성·수치 편집·정밀 핸들·스냅·측정·저장·SVG/DXF를 구현했다. 실제 모델 타원 단면 추출은 X6-D2-E1로 분리한다. 검수 결과는 [마감 기록](../verification/X2-A-CLOSEOUT-2026-10-11.json)을 따른다.

## 사용

Draw → **Ellipse / Arc**에서 중심 X,Y,Z, semi-major/minor 반축 길이와 회전을 입력한다. 길이 단위와 deg/rad 입력을 지원한다. start/sweep은 타원 parameter 각이며 중심에서 본 극각과 다르다. 양/음 sweep으로 방향을 정하고 ±360°는 full ellipse다. Review의 ghost와 길이/면적을 확인하고 Apply한다. 입력 변경·문서 변경은 기존 Review를 무효화하고 Cancel은 문서/History를 변경하지 않는다.

선택한 타원에서 같은 버튼을 누르면 exact world axis vectors로 원본을 편집한다. Direct selection의 중심·axis U/V·열린 호 시작/끝 핸들은 정밀 좌표 입력을 제공한다. 축 핸들은 기존 평면과 다른 축의 길이를 유지하며 직교 축을 만든다. conjugate 축을 유지해야 하는 경우 수치 벡터 편집을 사용한다. 평면 밖 핸들·축 붕괴·영 sweep·한 바퀴 초과 구간은 거부한다. 생성과 편집은 각각 하나의 Undo이며 curve ID와 계속 존재하는 control ID를 유지한다.

## 원본·변환·측정

문서의 exact 원본은 `C + U cos(t) + V sin(t)`이다. center/axisU/axisV는 WCS 3D 벡터, startParam/sweep은 radians다. 두 독립 축이 평면과 방향을 정의한다. 비균등 TRS와 mirror는 축 벡터를 변환해 conjugate axes까지 유지한다. 표시 점열을 원본으로 저장하지 않는다. ellipse feature 또는 block member가 있을 때만 파일 v27을 요구하고 기존 문서는 최소 버전을 유지한다. v1–v27 읽기와 v26 이하로의 타원 강등 거부를 검수했다.

bounds는 유한 구간의 exact coordinate extrema와 끝점을 사용한다. 둘레/호 길이는 analytic derivative의 adaptive integration(절대 오차 목표 1e-7 mm), full 면적은 π|U×V|이다. 열린 타원호 면적은 제공하지 않는다. nearest는 유한 analytic domain 위의 수치 최소화이며 양끝 인접 basin도 검사한다. 스냅은 중심·구간 내 축점/사분점·열린 끝점·nearest를 제공한다. sampled chord를 교점으로 사용하지 않는다.

화면/PNG/기존 PDF 경로는 선형 보간 오차 상한 .02 mm로 표시하며 exact extrema를 포함한다. 최대 16,384 segment 예산을 초과하면 명시적으로 거부한다. 이 오차는 모델 좌표 기준이며 종이 mm tolerance/font 정책 확대는 G6-D5-E1이다.

## 출력과 교환

SVG는 projected conjugate axes를 principal axes로 분해해 full `<ellipse>` 또는 finite `A` path를 쓴다. 9자리 이상 좌표와 방향/큰 호 flag를 유지하고 artboard clipPath로 자른다. 평면 투영이 선으로 붕괴하는 경우에는 기존 collinear point 출력 경로를 사용한다. 스타일·lineweight·dash·fill은 기존 vector 계약을 사용한다. PDF는 기존 출력 경로이며 exact analytic PDF curve 확대를 주장하지 않는다.

DXF는 ELLIPSE center/major axis의 WCS, ratio, extrusion normal, finite radians parameter를 읽고 쓴다. 단위 변환, tilted frame, conjugate/nonuniform/reflected axes, CW 구간의 normal/parameter 방향 변환을 지원한다. center/major axis에 OCS 변환을 중복 적용하지 않는다. [Autodesk ELLIPSE DXF 계약](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-107CB04F-AD4D-4D2F-8EC9-AC90888063AB.htm)을 따른다. 잘못된 ratio/축/평면/구간은 건너뛰기 경고 또는 command 거부로 처리한다.

## 지원 경계

- Standalone drawing 원본이 첫 범위다. sketch ellipse solver/constraints·돌출·범용 Trim/Offset/Fillet/Chamfer·타원 교점/접선/수직 스냅·clipboard pilot 대상 확대는 포함하지 않는다.
- 비균등 transform으로 기존 원을 자동 ellipse 변환하는 정책은 추가하지 않았다. ellipse 원본의 비균등 TRS는 지원한다.
- X6-D2-E1의 실제 OCCT 타원 단면, G6-D3-B1/B2 일반 BRep/숨은선, spline과 일반 section 계약은 후속이다.
- block member exact schema와 DXF 경로가 새 원본을 수용한다. component UI와 모든 기존 B 편집 대상을 타원으로 확대했다는 의미는 아니다.

## 구현 위치

`cad-document/Ellipse.ts`와 v27 serialization, create-drawing/update-ellipse validation/dispatch, `precision/ellipseGeometry.ts`·`ellipseEditing.ts`·world geometry/topology/snap/measure, `viewport/EllipseTool.tsx`와 ribbon/Direct selection, SVG/exportModel/artboard clip, DXF parser/import/writer가 원본을 연결한다.

검수에는 독립 알려진 타원 둘레·원/사분호·πab 면적, 유한 CW bounds, display chord 오차, affine parameter identity, 끝점 근처 nearest, exact DXF 왕복과 tilted inch WCS, 실제 UI/Undo/재열기·SVG/PDF 다운로드를 포함한다.
