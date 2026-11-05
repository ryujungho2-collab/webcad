# 재사용 부품·표현 라이브러리

왼쪽 **Component and style library**을 연다. Category와 Filter library로 문·창·가구·도곽·선·해치 또는 프로젝트 부품을 찾는다. 선택하면 출처, 단위/기준점과 실제 형상 미리보기가 나타난다.

1. 부품은 Position(예: `2cm,30mm`), Scale, Angle °를 입력한다. 좌표는 mm이며 기준점은 component base (0,0)이다. 다른 평면 부품은 해당 작업 평면에서 배치한다.
2. Review가 Ready가 되면 **Insert**한다. 정의 가져오기와 배치는 한 번의 Undo로 취소된다. 기존 프로젝트 부품은 원래 정의를 재사용한다.
3. 다른 WebCAD 파일의 부품은 **Open components from WebCAD**에서 고른다. 파일의 component block을 검색·선택한 뒤 독립 정의로 가져온다. 파일명·의존 정의와 active layer 매핑을 확인한다.
4. 선 프리셋은 도면을, 해치는 폐합 경계를 선택한 뒤 **Apply preset**한다. 해치 간격은 model mm다. Cancel은 적용 전 Review를 버린다.

기본 자료는 직접 작성한 2D 예시다. A3 도곽은 재사용 도형이며 자동 시트가 아니다. 삽입 결과는 기존 WebCAD 저장/재열기에 포함된다. 외부 이미지나 원본 형상 참조가 필요한 member는 이유를 표시하고 가져오기를 막는다. 기존 Components에서는 부품 정의를 만들거나 수정할 수 있다. [지원 범위·출처·검증](../implementation/G2-W2-REUSABLE-LIBRARY-2026-10-18.md).
