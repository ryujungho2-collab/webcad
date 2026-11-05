# COPILOT-SOLID-01 — 생성에서 후속 수정까지

2026-10-19. 현재 사용법과 지원 경계는 [Copilot](../features/COPILOT.md)이 소유한다. [외부 CAD 비교](../product/CAD-REFERENCE-ADOPTION-2026-10-19.md)의 공통 명령·편집 가능한 원본·결과 검사 관점을 첫 3D 과제에 적용했다. 외부 소스를 복사하거나 새 패키지를 설치하지 않았다.

## 변경

- `mountingPlate.ts`는 명시 치수의 4공 판을 기존 sketch/constraint/variable/binding/extrude 명령 batch로 계획한다. 왼쪽/오른쪽과 아래/위 구멍 중심을 각각 margin 또는 width/depth−margin으로 구동한다. 독립적인 recipe 문서/커널을 추가하지 않는다.
- `copilotSolid.ts`는 선택한 BRep 원본과 입력 스케치의 지원 치수/길이 driver를 조회한다. 변수 사용을 전이적으로 추적해 선택 원본 밖의 바인딩에 공유된 driver는 제외한다. 지원 파라미터 한 개를 변경하는 기존 command로 계획하며 판의 구멍 배치 조건도 다시 검사한다.
- 로컬 prompt가 문서와 selection context를 받는다. gateway도 같은 선택 기반 치수 계약을 제공하며 실제 명령을 로컬에서 다시 검증한다. 응답의 임의 설명이나 ghost로 편집 결과를 표시하지 않는다.
- `getCadPlanSolidGhosts`는 detached proposal의 실제로 계산된 visible BRep만 복제해 반환한다. App은 생성 recipe/치수 편집의 preview와 완료 대상 인계를 여기에 연결한다. 최종 솔리드 하나를 선택해 후속 편집을 이어간다.
- Copilot에 선택 솔리드의 현재 치수와 요청 작성 버튼을 추가했다. Explorer를 통한 props 전달도 연결했다.

원본에 새 직렬화 버전은 필요하지 않다. 변수는 생성마다 고유 namespace를 사용하고 피처/스케치/구속 ID와 바인딩은 기존 직렬화가 보존한다. 생성과 후속 수정 각각 한 Undo이며, 수정은 기존 객체/피처를 보존한다. source layer와 downstream 잠금, stale revision, 취소/검토/게시 경계는 공통 경로를 사용한다.

## 검증 과제와 판정

80×50×4mm 판, 모서리 간격 10mm, Ø6mm 관통 구멍 네 개를 생성했다. 폭을 100mm로 바꿀 때 중심은 (10,10), (90,10), (10,40), (90,40)mm로 바뀌어야 한다. 체적 기준은 `W*D*T - 4*pi*3^2*T`이다. 이어 gateway fixture로 두께 6mm를 변경했다.

Node의 신규 6개 검사는 detached preview·체적·중심/반지름·관계·한 Undo/Redo·직렬화 재열기, 단위 변환, 추가 조건 거절, 구멍 겹침/경계, 선택/잠금/공유 변수/stale 거절, gateway 허용 범위와 기존 linked extrusion 편집을 검사한다. STEP 출력 bytes를 OCCT reader로 다시 읽고 valid·bbox·해석 체적을 비교했다. 이는 별도 커널 검증이 아니라 같은 커널의 파일 왕복이며 기대식은 독립 해석식이다. 길이는 0.001mm, 체적은 0.003mm³ 허용오차를 사용했다.

실제 React/Worker와 브라우저 입력으로 18개 검사를 통과했다. 요청 입력·Plan·Clear·Apply·치수 요청 작성·후속 수정·Undo/Redo·잘못된 입력·mock gateway·STEP 내보내기·페이지 reload 후 캐시 원본과 정확 체적 재계산을 확인했다. 브라우저에서 생성한 최종 원본·STEP·화면과 raw report를 보존했다.

- [최종 WebCAD 원본](../../output/verification/copilot-solid/plate.webcad.json)
- [STEP 형상](../../output/verification/copilot-solid/plate.step)
- [실제 브라우저 화면](../../output/verification/copilot-solid/viewport.png)
- [브라우저 보고서](../../output/verification/copilot-solid/native-report.json)

첫 브라우저 검사에서 치수 props 전달 누락을 찾아 수정했다. 테스트 보고 패널과 기본 active tree 토글이 검사 입력을 가리던 문제는 테스트 배치/탐색 절차를 수정했다. 최종 1440×1000 화면에서 모델과 편집 가능한 치수를 직접 확인했다.

## 검증 명령

```sh
pnpm --filter @agent-webcad/web exec tsx --test tests/copilotSolid.test.ts
pnpm --filter @agent-webcad/web test:browser -- --page=copilotSolid --artifacts
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web build
pnpm --filter @agent-webcad/web check:architecture
```

전체 회귀·빌드의 최종 수치는 [검증 manifest](../verification/COPILOT-SOLID-01-2026-10-19.json)에 기록한다. gateway는 fixture로 계약을 검증했다. 실제 모델 provider·서버·인증 연결과 임의 자연어 설계 성공률은 이번 완료 범위에 포함되지 않는다. 케이스·필렛·의미 기반 면 선택과 3D 도면 발행 과제는 후속이다.

전체 Node 1508개와 추가 linked extrusion 검사를 포함한 targeted 6개가 통과했다. 기존 Copilot gateway/apply/move/context 브라우저 회귀는 13/26/25/15개 통과했다. Move 검사는 여러 검사 병행 시 23개 확인 후 제한 시간에 도달했고, 단독 재실행에서 전체 25개를 통과했다. Build/typecheck와 구조/문서 링크 검사를 통과했다. Vite의 큰 main chunk 경고는 남아 있다.
