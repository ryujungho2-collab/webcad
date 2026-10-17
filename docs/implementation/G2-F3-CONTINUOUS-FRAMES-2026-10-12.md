# G2-F3 연속 도면 이어 붙이기 — 2026-10-12

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

같은 평면·축척의 원본 도면 프레임 2–16개를 하나의 연속 프레임으로 구성한다. 원본 프레임, 모델 좌표·치수·객체 ID는 유지하고 결과 프레임에 source 참조, 정렬, seam 정책을 저장한다. 첫 범위는 분할 평면도·긴 입면도 등 독립 2D 도면 또는 **같은 모델 뷰 하나**를 참조하는 프레임이다.

## 사용

1. 2D 화면에서 **Stitch frames**를 누른다. Anchor와 Add source에서 원본 프레임을 선택하고 **Add stitch source**로 추가한다.
2. **Common model coordinates**는 원본의 모델 좌표를 그대로 사용한다. **Two ordered reference points**는 각 source의 두 점과 anchor 좌표의 대응 점을 입력한다. 좌표는 프레임 배치/종이 축척을 적용하기 전의 정규화 모델 mm다.
3. 필요한 경우 세 번째 **orientation witness**를 입력한다. 두 점만으로는 도면의 반전 여부를 판별할 수 없으므로, 두 점에서는 항상 proper rotation을 구하고 세 번째 점으로 방향과 잔차를 검증한다. 축척 조절·반사는 지원하지 않는다.
4. 겹치는 도면은 anchor/source별 **Keep X/Y ≤/≥ seam**으로 표시 범위를 나눈다. seam 값은 정렬 후 anchor 모델 좌표다. **First source for exact duplicates** 또는 **Keep all source graphics**를 선택한다.
5. **Review stitch**에서 실제 도면 ghost, 이동·회전, 최대 기준점 잔차(mm), 프레임 쌍별 겹침 면적(mm²)·빈틈(mm), 정확히 같은 선/주석 개수를 확인한다. **Apply stitch**는 한 Undo로 결과 프레임을 만든다. 입력 변경은 Review를 무효화하며 Cancel은 원본을 보존한다.
6. **Saved continuous frames**에서 수정·Fit·SVG/DXF 출력 또는 **Review detach continuous frame**을 진행한다. 작업 구역과 **Frame sheets**에서도 결과 프레임을 선택할 수 있다. PDF는 기존 Export Artboards PDF의 프레임 또는 Frame sheets scope를 사용한다.

## 원본·저장·해제

연속 프레임은 `artboard.frame.stitch`에 원본 crop/member/축척/size snapshot과 정렬·seam을 저장하는 일반 프레임이다. 저장 버전은 **v32**이며 이전 기능만 있는 문서는 기존 최소 버전을 사용한다. 잘못된 참조, 중복/순환/중첩 source, 불일치 member/scale 및 퇴화·거리 불일치·반사 witness는 재열기에서 거부한다.

원본 객체 수정은 참조를 통해 화면·출력에 반영된다. 원본 프레임의 작업 화면 위치 변경은 연속 결과에 영향을 주지 않는다. 원본 crop/축척/member/size를 바꾸면 **Review source**로 진단하고 명시적 Review/Apply로 다시 계산한다. 모델 객체 소멸도 미해결 참조로 표시한다. 잠긴 결과의 편집/해제는 거부한다. 원본 프레임은 참조 중 삭제할 수 없다.

Detach는 결과 presentation만 삭제하고 작업 구역 소속을 정리한다. 원본과 모델은 남는다. 출력 시트가 참조 중인 결과는 먼저 해당 시트 세트를 삭제해야 한다. 일반 프레임 editor로 결과 crop/member/축척을 직접 덮어쓰지 않고 Stitch Review를 사용한다.

## 화면·출력 계약

원본 F1 출력 → source model 좌표 정규화 → rigid 정렬 → convex seam crop → 결과 paper 좌표를 화면·SVG·PDF/PNG·시트가 공유한다. 시트의 추가 축소는 원본 모델 축척과 별도로 적용하며 원본 프레임을 수정하지 않는다. 예를 들어 120 모델 mm는 1:2 결과에서 60 종이 mm이고 시트 divisor 2에서 30 종이 mm다.

SVG/PDF/PNG는 원본별 polygon clip을 유지한다. Exact ellipse는 SVG에서 analytic ellipse/path로 남고 기존 circle/arc는 기존 sampled 출력 계약을 따른다. DXF는 종이 좌표 mm의 평탄화 polyline/TEXT이며 곡선을 sampling하고 polygon seam과 바깥 프레임에 자른다. SVG와 같은 style/fill/연관 참조를 DXF에 보존하지 않는다. 잘리거나 회전/basis가 있는 문자는 손실을 숨기지 않고 DXF 출력을 거부하며 SVG/PDF 또는 seam 변경을 안내한다.

## 첫 범위의 경계

- 동일 작업면·동일 원본 축척. 독립 2D 도면 또는 동일 model view ID. 다른 정투영 뷰/역할은 F2 연결로 배치한다.
- 원본 프레임만 source로 허용하며 연속 프레임 중첩·자동 seam 탐색·자동 기준점 인식은 지원하지 않는다.
- 정확한 중복 제거는 좌표 tolerance 안의 동일 polyline/ellipse/문자를 대상으로 첫 source를 유지한다. 임의 부분 겹침 곡선의 합집합이나 라벨 충돌 해결은 수행하지 않는다. 부분 겹침은 사용자가 complementary seam crop을 지정한다.
- 겹침·빈틈은 프레임의 crop polygon 기준이며 실제 형상의 접속/Boolean/Join을 의미하지 않는다.
- 수치 입력 기반 정합이다. 기준점 canvas pick/snap, spline·일반 HLR 확대는 후속이다. 기존 F1처럼 vector 도면/주석만 허용한다.

[검수·출력 증거](../verification/G2-F3-CLOSEOUT-2026-10-12.json), [프레임 계획](../product/CAD-FRAMES-SECTIONS-PLAN-2026-10-11.md).
