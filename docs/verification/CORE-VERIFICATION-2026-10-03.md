# 정밀 측정·공용 계획·문서 복구의 첫 코어 검수

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

> 단계 기록: 아래 구현·검수 수치는 해당 시점의 근거다. 최신 지원 범위는 [CAD-BASICS](../product/CAD-BASICS.md), 최근 전체 검수는 [PROJECT-STATE](../../PROJECT-STATE.md), 다음 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다.

2026-10-03. PRODUCT-ROADMAP의 첫 구현 묶음을 구현했다. 기존 기계·건축·
스케치 작업 트리를 유지했으며 커밋·배포는 하지 않았다. 이 기록은 전체
로드맵이나 정밀도 단계 전체의 완료를 의미하지 않는다.

## 구현된 결과

- 정밀도 계약: 내부 길이 mm, 스케치 각도 rad, 객체 회전 deg. 길이
  `1e-6`mm와 각도 `1e-8`rad의 잔차 정책을 분리하고 큰 좌표의 roundoff를
  반영한다. 솔버는 연결 성분의 로컬 원점에서 계산한다. 큰 좌표의 면적
  상쇄와 단위 변환 overflow, 명시적 rad 입력도 보완했다.
- 실제 BRep 조회: Worker `inspect`가 유효성·체적·표면적·세계 경계를
  반환한다. 렌더 삼각형을 사용하지 않고 적응 적분의 상대 허용 오차를
  `1e-10`으로 요청한다. 이것은 적분 정책이며 모든 CAD 연산의 오차를
  그 수치로 보장한다는 뜻이 아니다. Inspector도 이 경로를 사용한다.
- 화면과 커널의 변환 일치: 세계 배치를 T·R(XYZ)·S로 통일했다.
  기존 커널의 이동 후 순차 회전과 누락된 스케일을 수정했다. 강체/
  균일 스케일에는 analytic 형상을 보존하는 Trsf를, 비균일에는 GTrsf를
  사용한다. 같은 규칙을 Boolean의 피연산자와 STEP 출력에 적용한다.
- 공용 Query/Preview/Apply: 분리된 문서에서 기존 실행기·솔버·커널을
  실행해 변경 ID와 before/after 측정을 반환한다. Apply는 검증된 제안과
  ID를 그대로 한 Undo로 반영한다. 세션 버전·문서 ID·기준 snapshot이
  다르면 거절하고, 같은 계획의 재시도는 중복 객체를 생성하지 않는다.
- 기존 rule Copilot: Plan이 실제 형상을 검증하고 체적을 표시하며,
  Apply는 공용 계획을 적용한다. 문서 변경 후에는 다시 Plan하도록
  안내한다. LLM이나 자연어로 선택 피처를 수정하는 기능은 아직 없다.
- 저장 신뢰성: 변경 후 자동 checkpoint와 이전 유효 기록 1개,
  손상된 working copy의 복구, 용량 초과 안내와 재시도를 추가했다.
  실제 쓰기 실패 시 Modified 표시를 지우지 않는다. 파일의 기본 구조,
  주요 피처 매개변수와 transform을 검사하며 legacy scalar scale은
  3축 값으로 변환한다. 자동 복구와 사용자 파일 저장 상태는 구분한다.
- 향후 mesh 경계: analytic curve/BRep/annotation/editable polygon mesh와
  측정 출처를 구분한다. 현재 렌더 mesh는 캐시이며 편집 원본이 아니다.
  메시 자산·정점/엣지/면 ID·변환·근사 오차와 큰 배열의 delta 저장은
  PRODUCT-ROADMAP에 후속 설계로 남겼다. 메시 편집 도구는 아직 없다.

## 검수와 테스트 의도

Node 331개, 실제 UI·Worker 79개 통과. 전체 build와 공백 검사도 완료했다.
UI 집계는 기존 도면 15, 스케치 캔버스 11, 기준점/구속 15,
구멍 영역 8, 건축 납품 15, 정밀 측정/계획/저장 복구 15개다.
기존 316/64 기록은 WORKFLOW-VERIFICATION의 당시 결과로 유지한다.

새 검사는 성공 여부나 렌더 결과끼리의 비교에 그치지 않는다.

| 검사 | 독립 기준과 확인한 의도 |
|---|---|
| 구·박스 측정 | 해석 체적·면적과 BRep 결과를 비교하고 렌더 tessellation과 분리한다. |
| XYZ 회전·스케일 | Three의 독립 행렬로 변환한 박스 8개 꼭짓점의 경계와 커널 경계를 비교한다. |
| 비균일 곡면 | 구를 늘린 회전 타원체의 체적·면적 기준값, BRep 유효성. 기본 적분의 약 0.04% 체적 오차를 드러내 적응 적분으로 수정했다. |
| 작은 형상·큰 좌표 | 작은 박스의 체적/면적, 1e9 좌표의 면적·제약 해, 별도 각도 오차와 명시적 단위. |
| 계획 원자성 | Preview에서 문서·revision·History 보존, 공개 데이터의 외부 수정 차단, 평가 ID 그대로 적용, 중복 적용 방지, 완전한 Undo/Redo. |
| 오래된 계획·실패 | 사용자 편집과 Undo 이후의 적용 거절, 실패한 batch·잘못된 값·취소·폐기에서 문서와 과거/미래 History 보존. |
| 저장 실패·호환성 | 쓰기 오류에도 이전 checkpoint 보존, 손상된 컬렉션/값/transform 거절, legacy scale 변환과 재열기 후 topology 유지. |
| 실제 화면·재시작 | Copilot Plan→검증→Apply→Inspector→Undo/Redo→자동 저장. Quota 실패·성공 재시도 표시, 실제 페이지 reload 후 손상 캐시 복구·전체 원본·Worker 유효성. |

재현 명령:

```powershell
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web test:browser
pnpm --filter @agent-webcad/web test:browser -- --page=trustWorkflow
pnpm build
git -c core.safecrlf=false diff --check
```

브라우저 검사는 별도 임시 프로필과 localhost를 사용한다. 복구 테스트는
테스트 origin의 캐시를 손상시키고 실제 페이지를 재시작한 뒤 검사한다.
사용자의 브라우저 프로필/문서는 사용하지 않는다. 기존 PDF/DXF 납품
UI 회귀도 통과했으며 이번 묶음에서 외부 CAD 왕복이나 실무 시간 측정을
새로 수행한 것은 아니다. 기존 chunk 크기 경고는 빌드에 남아 있다.

## 남은 범위와 다음 순서

1. 단위 있는 변수/수식과 피처 바인딩: 안전한 식 파서·타입·순환 의존성,
   종속 재생성, Inspector, 저장/열기와 한 Undo를 실제 판 수정 과제로 연결.
2. live Mirror/Linear·Radial Pattern, 이어서 편집 가능한 정의/인스턴스.
3. 검증된 명령을 실제 AI에 연결하고 목표 조건을 기하·관계로 확인.

`CadFeature.params` 전체의 판별 가능한 타입과 깊은 파일 스키마는 아직
완성되지 않았다. Query의 전체 제약/명령 목록, 일반 계획의 새 viewport
ghost, 외부 실행 로그/예산, 재시작 후 idempotency도 후속 과제다.
현재 계획 캐시는 최근 16개이며 세션 내에서만 재적용을 막는다.
AbortSignal은 검사 경계에서 중단하며 이미 실행 중인 커널의 중단까지
보장하지 않는다. BRep 재구성과 전체 문서 복제 비용도 별도 측정이 필요하다.

비균일 스케일한 2D 원/호는 ellipse 원본 도입 전 정밀 조회를 명시적으로
거절한다. 엣지 참조 복구·기하 epsilon 통합·희소/Worker 솔버, 실무자
사용성 기준선, 여러 탭의 저장 충돌·대형 자산 저장·지속 History도 남았다.
localStorage 기록은 1개 backup이며 외부 파일 보관이나 다중 버전 저장을
대신하지 않는다. 임의 손상 데이터의 모든 조합을 검수했다는 의미는 아니다.

적응 적분의 API 선택은 설치된 커널 선언과 실제 해석 기준값으로 검증했다.
상대 허용 오차의 의미는 공식
[OCCT BRepGProp 문서](https://www.occt3d.com/dev/doc/refman/html/class_b_rep_g_prop.html)를 참고했다.
