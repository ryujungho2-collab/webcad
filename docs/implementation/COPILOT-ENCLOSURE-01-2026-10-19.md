# COPILOT-ENCLOSURE-01 둥근 케이스 연속 제작

2026-10-19. 이전 단순 블록보다 복잡한 2D→3D 과제로, R4 코너·2mm 벽/바닥·바닥 Ø8 관통 구멍·앞벽 Ø10 포트를 가진 100×70×30mm 열린 케이스를 제작했다. 실제 코파일럿의 Local rules와 동일 엔진 명령·조회·검토·적용을 사용한다. 임의 자연어 이해 또는 실제 모델 provider 연결을 완료했다는 의미는 아니다.

## 실제 요청 순서

빈 문서의 **2D → Copilot → Local rules**에서 시작한다. 각 요청을 Plan/Apply하고, 첫 스케치 뒤에는 3D로 전환한다. 최종 결과 선택이 다음 요청에 인계된다.

1. `100x70 사각형 스케치`
2. `선택한 윤곽 30mm 돌출`
3. `수직 모서리 반지름 4mm 필렛`
4. `윗면 제거 두께 2mm 셸`
5. `안쪽 바닥 중심에 지름 8mm 관통 구멍`
6. `앞면 중심에 지름 10mm 깊이 2mm 구멍`

앞벽 포트는 전체 관통 대신 깊이 2mm로 잘라 반대쪽 벽을 보존했다. 열린 내부·둥근 외곽·균일한 벽/바닥·서로 다른 방향의 면 구멍이 연결된 모델이다. 각 요청 한 Undo이며 원본 스케치·돌출·마감·셸·구멍의 입력 관계가 유지된다.

## 발견·수정한 문제

실제 안쪽 바닥 구멍에서 이전 절삭 방향 추정이 실패했다. `cutParamsFromProfile`은 mesh 정점 평균 위치를 향해 양의 깊이를 정했는데, 속이 빈 형상의 평균 위치는 빈 공간에 있을 수 있다. 케이스 바닥 위쪽으로 절삭해 재료가 제거되지 않아 구멍을 거절했다.

면 부착 작업면의 법선은 BRep 삼각형의 바깥쪽 방향이다. 양의 깊이는 그 반대 방향으로 재료 안쪽을 절삭하도록 수정했다. 이 경로는 face profile cut과 Hole이 공유한다. 음의 깊이는 반대 방향이며 실제 재료가 제거되지 않으면 기존 검증으로 거절한다. 회전된 면·옆면·관통·역방향 거절을 포함한 기존 검사도 확인했다.

`cadToolPrompts`에 안쪽 바닥/앞면 중심 구멍을 추가했다. 안쪽 바닥은 위쪽 림보다 낮은 유일한 +Z 평면, 앞면은 월드 −Y 방향을 향하는 가장 바깥쪽 평면을 사용한다. 동률·누락·조회 한도 초과는 거절하며 면 원점/월드 방향 가정을 Review에 표시한다. 구멍 원이 실제 면 밖이나 기존 빈 공간에 걸치면 거절한다. 단순 블록에는 구분되는 안쪽 바닥이 없으므로 윗면으로 대신 뚫지 않는다.

## 결과 검사

외곽 둥근 사각형 면적을 `A(w,d,r)=w*d-(4-pi)*r²`로 두면 다음 독립 체적 기준을 얻는다.

| 단계 | 해석 체적 mm³ |
| --- | --- |
| 돌출 | `100*70*30 = 210000` |
| R4 외곽 | `A(100,70,4)*30 = 209587.964473723` |
| 두께 2 셸 | `A(100,70,4)*30 - A(96,66,2)*28 = 32276.106096521` |
| 바닥 Ø8 | 이전 값 `- pi*4²*2 = 32175.575131606` |
| 앞벽 Ø10 깊이2 | 이전 값 `- pi*5²*2 = 32018.495498927` |

각 실제 BRep 단계의 valid/체적을 검사했다. 바닥 구멍의 면 원점은 (50,35,2), 앞벽 포트의 면 원점은 (50,0,15)mm이며 면 방향도 +Z/−Y로 확인했다. 체적 허용 오차는 0.02mm³다.

실제 브라우저에서 22개 검사를 통과했다. 6회 Preview 무변경·Apply, 독립 체적, 요청한 면 선택 설명, 단계별 이력, 마지막 포트 Undo/Redo, 너무 큰 바닥 구멍 거절, 원본 저장·실제 페이지 reload와 재계산·STEP 출력을 포함한다. Node 신규 2개는 같은 연속 작업·관계/체적/Undo/재열기·경계 밖 구멍 거절과, 블록을 내부 바닥으로 잘못 해석하지 않는 조건을 검사한다. JSON 재열기에서는 -0과 0이 동일하게 직렬화되는 의미를 따른다.

최종 브라우저가 만든 STEP를 별도 Node에서 재수입해 valid, bbox `[0,0,0]..[100,70,30]`, 해석 체적을 확인했다. 길이 오차 0.001mm, 체적 0.02mm³다. 동일 OCCT 커널 파일 왕복이며 기대식은 독립 해석식이다. 전체 Node 1,535/1,535, 브라우저 신규 22·Face Cut 3·Hole 3·이전 2D→3D 18(총 46), build/TypeScript 및 architecture 733 modules 통과. 기존 Vite 큰 main chunk 경고는 남아 있다. 전체 회귀와 빌드 최종 결과는 [manifest](../verification/COPILOT-ENCLOSURE-01-2026-10-19.json)에 둔다.

## 범위와 제한

명시적인 지원 문법을 조합한 열린 케이스 과제다. 일반 건축 평면의 자동 3D 변환, 임의의 cavity 인식, 복수 바닥·분할된 앞면·카메라 기준 앞/뒤·경사진 바닥 자동 선택을 보장하지 않는다. 위쪽/안쪽 바닥 선택은 월드 Z 기준이며 회전된 형상의 의미를 추측하지 않는다. 앞면은 카메라 방향이 아니라 world −Y다. 복잡하거나 모호한 면은 공통 도구에서 명시적인 face key를 사용해야 한다.

상부 링 면의 frame 원점은 빈 공간일 수 있으므로 그곳에 구멍을 만드는 요청은 거절될 수 있다. 새 바닥 구멍 경로는 실제 낮은 바닥 면을 조회한 뒤 사용한다. 추가 구멍의 “중심”도 face-local 원점이며, 비대칭 형상의 면적 중심 또는 사용자가 의도한 중심을 일반적으로 추론하는 기능은 아니다.

## 산출물·재현

- [2D 시작 화면](../../output/verification/copilot-enclosure/sketch-2d.png)
- [완성 케이스 화면](../../output/verification/copilot-enclosure/enclosure-3d.png)
- [편집 원본](../../output/verification/copilot-enclosure/model.webcad.json)
- [STEP](../../output/verification/copilot-enclosure/model.step)
- [실제 UI 결과](../../output/verification/copilot-enclosure/native-report.json)
- [STEP 재검사](../../output/verification/copilot-enclosure/step-roundtrip-report.json)

```powershell
pnpm --filter @agent-webcad/web exec tsx --test tests/copilotEnclosure.test.ts tests/b5FaceCut.test.ts tests/b5FaceHole.test.ts
$env:CAD_TEST_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm --filter @agent-webcad/web test:browser --page=copilotEnclosure --artifacts
pnpm --filter @agent-webcad/web exec tsx scripts/verifyCopilotEnclosure.ts
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web build
pnpm --filter @agent-webcad/web check:architecture
```
