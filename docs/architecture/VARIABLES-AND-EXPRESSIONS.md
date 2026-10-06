# 단위 있는 변수·수식과 피처 바인딩

> 단계 기록: 아래 구현·검수 수치는 해당 시점의 근거다. 최신 지원 범위는 [CAD-BASICS](../product/CAD-BASICS.md), 최근 전체 검수는 [PROJECT-STATE](../../PROJECT-STATE.md), 다음 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다.

2026-10-03. PRODUCT-ROADMAP의 다음 묶음을 구현했다. 길이·각도·스칼라
변수와 수식이 스케치 구동 제약 및 솔리드 매개변수에 연결되고, 기존
Query/Preview/Apply·실제 커널·한 Undo·자동 저장 경로를 함께 사용한다.
문자/색상 변수, live Pattern과 편집 가능한 컴포넌트 전체의 완료는 아니다.

## 사용하는 방법

1. 왼쪽 **Variables** 또는 명령 검색의 **Document variables and expressions**.
2. 이름, Length/Angle/Scalar, 수식을 입력해 Add variable.
3. 피처를 선택하거나 스케치에 구동 치수를 추가하고 Variables의 Target을
   선택한다. `plateWidth` 같은 수식을 넣고 Preview binding → Apply.
4. 변수 식을 수정하고 Preview. 계산된 변수·실제 체적·영향 객체를 확인한
   뒤 Apply parameter change. Discard는 원본과 History를 변경하지 않는다.

예시:

| 변수 | 종류 | 식 |
|---|---|---|
| plateWidth | Length | `120mm` |
| edgeMargin | Length | `10mm` |
| holePitch | Length | `(plateWidth - 2*edgeMargin)/3` |
| holeDiameter | Length | `8mm` |
| thickness | Length | `8mm` |
| turn | Angle | `180deg` |
| ratio | Scalar | `1.5` |

길이는 mm, 각도는 rad로 계산하고 저장한다. degree 기반 피처에 연결하면
경계에서 degree로 변환한다. 단위 없는 숫자는 Scalar이며 길이로 자동
변환하지 않는다. `10mm + 30deg`, 길이 변수에 `120` 같은 식은 거절한다.
곱셈·나눗셈의 중간 면적/비율은 차원을 보존해 최종 대상 단위와 비교한다.

문법은 숫자/과학 표기, 변수명, 괄호, 단항 ±, `+ - * /`이다.
mm/cm/m/in/ft와 rad/deg, 상수 pi, min/max/abs/clamp 및 각도 입력의
sin/cos/tan을 지원한다. 임의 JavaScript·속성 접근·대입은 사용하지 않는다.
이름은 ASCII 영문/숫자/밑줄이며 숫자로 시작할 수 없다. 단위·함수명은
예약 이름이다. 한 식 512자/128토큰/32중첩, 변수 256개/의존 깊이 64,
바인딩 2,048개로 실행량을 제한한다.

## 편집과 문서 규칙

- 수치 원본만 바인딩한다. primitive 크기, 돌출 거리, 회전 각도,
  fillet/chamfer 거리, standalone 원/호 반지름과 스케치 Distance/
  Radius/Diameter/Angle/Fixed-point의 X/Y다. 스케치 drawing projection은
  중복 원본으로 바인딩하지 않는다.
- 모든 바인딩 값을 함께 계산하고 피처 조건을 검사한 뒤 각 스케치를
  한 번씩 푼다. 이후 의존 피처·주석을 재생성하고 실제 BRep를 검증한다.
  솔리드 매개변수 자체의 변경도 bounds와 후속 Boolean을 갱신한다.
- 순환·없는 변수·잘못된 단위·overflow·불가능한 제약·영역 교차·잠긴
  종속 레이어·커널 실패는 전체 편집과 과거/미래 History를 보존한다.
- 수식이 제어하는 값을 일반 수치 편집으로 덮어쓰면 명확한 이유로
  거절한다. Inspector의 Driven parameters에서 식을 확인하고 Variables로
  이동한다. 바인딩 제거는 현재 해석된 값을 유지한다.
- 대상/제약 삭제는 그 대상의 바인딩도 한 Undo로 제거한다. 사용 중인
  변수 삭제는 관계가 깨지므로 거절한다. 일반 독립 복제는 수치 snapshot을
  복제하며 원본 바인딩을 자동 상속하지 않는다. 복제한 돌출에는 자신의
  바인딩을 추가할 수 있고 snapshot 의존 방식은 유지된다.
- Query는 계산된 변수·의존 이름·단위, 바인딩과 사용 가능한 수치 대상을
  반환한다. Preview는 식 자체의 변경과 바인딩 변경도 공개해 같은 값으로
  계산되는 식 교체를 확인할 수 있다. 공개 결과는 저장된 제안과 분리된다.
- 변수/바인딩 문서는 파일 version 2를 사용해 이를 보존할 수 없는 구버전
  앱이 거절하도록 한다. 기존 version 1 문서는 계속 읽는다. 저장/열기,
  Undo/Redo, New와 자동 복구에서 관계를 함께 복원/초기화한다. 로드 시
  저장된 수치와 식의 계산 결과가 길이/각도 공차를 벗어나면 거절한다.
  큰 길이에 단순 상대 오차만 적용해 실제 mm 오류를 감추지 않는다.

## 실제 검수

최종 Node 343개, 실제 UI·Worker 99개, 전체 build와 공백 검사 통과.
기존 79개의 화면 회귀에 변수 흐름 20개를 추가했다. 브라우저는 독립
프로필/테스트 origin을 사용하며 실제 페이지 reload 후 관계를 검사한다.
검수 중 production 출력과 파일 형식의 호환 경계를 함께 확인했다.

- 기계 기준: 100×60×8 판과 4개 지름 8 관통 구멍. 폭을 120mm로
  바꾸면 여유 10mm를 보존하며 피치가 100/3mm, 마지막 중심 X가 110mm로
  갱신된다. 실제 BRep 체적을 해석 기준 및 풀린 원본 기하와 각각 비교한다.
  요청 치수의 솔버 오차는 mm에서 체적으로 전파해 판정하며 렌더 오차로
  정밀 측정의 문턱을 대신하지 않는다.
- 깊이 -12mm와 후속 Boolean의 재생성, 회전의 rad→deg 변환과 반원 회전
  체적, 두 torus 반지름의 동시 스케일, 독립 돌출 복제의 별도 식을 확인한다.
- 오류와 취소: 미리보기/폐기 무변경, 한 Undo/Redo의 전체 문서 복원,
  단위·순환·삭제·교차·잠금 실패의 원자성과 redo 보존. 식만 변경된
  미리보기 데이터의 외부 수정도 저장된 제안을 바꾸지 않는다.
- 실제 UI: 변수 추가/제거·중복 이름 보호, 식 편집·피치/체적 검토·적용,
  구멍 이동·Undo/Redo, 단위/순환 오류·사용 변수 삭제 거절, 바인딩 편집,
  stale 미리보기 차단, Ctrl+S와 재시작 후 전체 원본/Worker 결과 복원.

```powershell
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web test:browser
pnpm --filter @agent-webcad/web test:browser -- --page=variablesWorkflow
pnpm build
git -c core.safecrlf=false diff --check
```

브라우저의 판 fixture 생성은 실제 명령으로 준비하고, 변수 편집·미리보기·
적용·오류·Undo·저장은 UI를 조작한다. 실무자의 작업 시간/학습 비용이나
큰 문서 성능 향상을 측정했다는 뜻은 아니다. 기존 build chunk 경고는 남는다.

## 다음 순서와 한계

이후 사용자 우선순위에 따라 캔버스에서 수정 의도와 영향을 검토하는
CAD 경험을 먼저 개선했다. 치수 검토는 [CANVAS-EDIT-INTENT.md](../implementation/CANVAS-EDIT-INTENT.md),
구동 변수·식과 연결한 드래그/핸들 검토는
[DIRECT-EDIT-EXPERIENCE.md](../implementation/DIRECT-EDIT-EXPERIENCE.md)에 있다.
제품 확장 후보는 원본·횟수·간격을 저장하는 **live Mirror/Linear/Radial Pattern**이다.
원본 수정 전파, 생성 객체의 안정적인 ID, 변수 바인딩, 종속 참조,
미리보기·한 Undo·저장/재열기를 확인한다. 이후 편집 가능한 정의/인스턴스,
덮어쓰기·초기화와 실제 AI 연결로 확장한다.

현재는 전체 변수/바인딩을 다시 계산한다. 큰 그래프의 증분 갱신·solver
Worker, 변수 rename과 식 참조의 자동 수정, 문자/색상/정수 수량 변수,
수식 자동 완성, 범위 override·variants·layout 및 임의 피처 속성은
후속 작업이다. 객체 이동/임의 점 좌표는 자동 바인딩하지 않는다.
정밀 참조 복구와 외부 API/LLM도 별도다. 향후 mesh는 같은 관계/계획
경로를 사용하되 편집 원본과 근사 측정 출처를 따로 보존한다.
