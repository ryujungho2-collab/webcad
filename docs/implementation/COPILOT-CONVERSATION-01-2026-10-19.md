# COPILOT-CONVERSATION-01 자연어 생성·후속 대화 연결

2026-10-19. 기존 [4공 판 기반](COPILOT-SOLID-01-2026-10-19.md)과 공통 CAD 도구를 재사용해 제안했던 전체 한국어 생성 문장과 관계 유지 조건이 있는 후속 대화를 연결했다. 실제 모델 provider를 새로 연결하거나 모델을 학습한 작업은 아니다. 현재 경로는 UI에 명시한 제한된 Local rules 문법이다.

## 사용 흐름

빈 문서에서 **3D → Copilot → Local rules**를 선택한다. 다음 문장을 입력하고 **Plan → 실제 솔리드/측정 검토 → Apply**한다.

> 가로 100mm, 세로 60mm, 두께 5mm 판에 지름 8mm 구멍 네 개를 각 모서리에서 10mm 안쪽에 만들어줘

최종 솔리드가 선택된 상태로 다음 요청을 입력하고 Plan/Apply한다.

> 가로를 120mm로 늘려줘. 구멍은 모서리에서 10mm 간격을 유지해줘

추가로 다른 치수도 같은 관계를 유지하며 편집한다.

> 세로를 80mm로 바꿔줘. 구멍은 모서리에서 10mm 간격을 유지해줘

구멍의 **중심**이 인접한 두 가장자리에서 10mm 떨어진다는 의미를 검토 요약에 표시한다. 화면에 출력된 mesh만 바꾸지 않고 같은 스케치·변수·바인딩·돌출 원본을 재생성한다. 생성과 후속 수정 각각 한 Undo다. 저장·재열기 후에는 솔리드를 선택해 이어서 편집할 수 있다. STEP는 교환 형상이며 관계 편집 원본은 WebCAD JSON이다.

## 변경과 경계

- `platePrompt.ts`가 가로/세로/두께의 명시 치수, mm/cm/m 개별 단위와 “네 개/4개”를 해석한다. 기존 width×depth×thickness 공통 단위 문법도 유지한다. 누락·중복·추가 조건을 조용히 버리지 않는다.
- 유지 문장을 분리한 뒤 선택한 판의 실제 margin driver와 일치하는지 검사한다. 다른 간격을 유지하라는 모순은 적용을 거절한다. width/depth/thickness 변경에 기존 관계를 유지하며, margin 자체 변경과 섞지 않는다.
- “늘려줘/줄여줘”와 목표 수치의 방향이 반대면 거절한다. 나머지 미지원 문구는 기존 지원 안내/오류 경로를 따른다. 숫자나 형상을 고정해 보여주는 데모가 아니지만 임의 자연어 이해를 구현한 것은 아니다.
- App의 로컬 도구 경로가 판 생성/유지 조건 요청을 해당 파라메트릭 planner에 전달한다. 일반적인 단일 치수 편집은 기존 fallback 계약을 유지한다.
- 코파일럿 예시 버튼에 두 전체 문장을 추가하고, Local rules가 외부 모델이 아닌 제한 문법이라는 안내를 명시했다.

직사각형 판·같은 간격의 원형 관통 구멍 4개가 생성 지원 범위다. 임의 구멍 개수·비대칭 간격·같은 생성 문장의 필렛 등 추가 조건은 지원하지 않는다. 별도 도구로 기능을 추가하는 기존 경로는 유지한다. 조회 대상과 편집 selection은 구분하며 선택 소실·잠금·공유 driver·stale·취소는 기존 검토/게시 계약을 따른다. 실제 gateway 제공자·인증·범용 대화 메모리를 연결한 작업은 아니다.

## 검증

신규 Node 3개는 명시 치수/서로 다른 단위, 누락·중복·음수·추가 조건 거절, 실제 App 로컬 경로의 생성→후속 수정→관계·해석 체적·동일 ID·Undo/Redo·직렬화 재열기와 모순 조건 무변경을 검사한다. 기존 solid·도구 검사를 함께 실행했다.

실제 React/Worker와 브라우저 입력으로 15개 검사를 통과했다. 빈 문서, 전체 문장 입력, detached Plan, Clear, Apply, 연속 폭/세로 변경, 유지 조건 충돌, Undo/Redo, STEP, 실제 페이지 reload와 체적 재계산을 검사했다. 서로 다른 두 치수를 입력해 결과가 변경되는 것도 확인했다.

최종 120×80×5mm, Ø8mm 구멍 4개의 독립 체적 기준은 `(120*80 - 4*pi*4²)*5 = 46994.6903508513mm³`다. 최종 브라우저가 출력한 STEP를 OCCT reader로 다시 읽어 valid, bounds `[0,0,0]..[120,80,5]`, 체적 오차 0.003mm³ 이내를 확인했다. 길이 허용 오차는 0.001mm다. 같은 커널의 파일 왕복이며 독립 커널 교차 검증은 아니다.

전체 Node 1,532/1,532, 신규 브라우저 15개와 기존 solid 18·도구 19·Apply 26(합계 78개), build/TypeScript 및 architecture 729 modules를 통과했다. Vite의 기존 큰 main chunk 경고는 남아 있다. 전체 회귀·빌드 최종 수치는 [검증 manifest](../verification/COPILOT-CONVERSATION-01-2026-10-19.json)를 따른다. 최초 전체 Node 검사에서 기존 단일 치수 요청의 도구 fallback 계약과의 충돌을 발견해, 추가 라우팅을 판 생성/유지 조건 문장으로 좁혔다. 최초 실패 로그도 보존했다.

## 증거와 재현

- [실제 화면](../../output/verification/copilot-conversation/viewport.png)
- [편집 가능한 최종 원본](../../output/verification/copilot-conversation/plate.webcad.json)
- [최종 STEP](../../output/verification/copilot-conversation/plate.step)
- [브라우저 보고서](../../output/verification/copilot-conversation/native-report.json)
- [STEP 왕복](../../output/verification/copilot-conversation/step-roundtrip-report.json)

```powershell
pnpm --filter @agent-webcad/web exec tsx --test tests/copilotConversation.test.ts tests/copilotSolid.test.ts tests/cadTools.test.ts
$env:CAD_TEST_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm --filter @agent-webcad/web test:browser --page=copilotConversation --artifacts
pnpm --filter @agent-webcad/web exec tsx scripts/verifyCopilotConversation.ts
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web build
pnpm --filter @agent-webcad/web check:architecture
```
