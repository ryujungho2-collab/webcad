# 주거 외부 도면 수정·복원 검증 01

2026-10-19. 같은 외부 주거 DXF를 새로 가져와 기준 상태를 저장하고 수정·복원·파일 왕복을 검증했다. 제품 코드를 바꿀 필요가 있는 결함은 이번 시나리오에서 발견하지 않았다. 이 결과는 전체 CAD 기능의 무결함 판정이 아니다.

## 수행한 과제

| 대상 | 의도적 수정 | 직접 복원 |
| --- | --- | --- |
| 1.WALL의 실제 선 객체 | X 위치 +300mm | 원래 절대 위치 |
| 2.DOORS의 실제 블록 배치 | X 축척 1 → 1.25 | 축척 1 |
| 3.WINDOWS의 실제 선 | 끝점 Y +150mm | 원래 끝점 좌표 |
| 실제 BEDROOM 문자 | BEDROOM CHECKED | BEDROOM |
| 7.HATCHING 레이어 | 색상 #123456 | 원래 레이어 스타일 |

명령 경로는 다섯 변경을 한 transaction으로 적용했고, 실제 UI 경로는 벽 위치·문 블록 축척·방 이름을 각각 수정했다. UI에서 모델 검색, 속성 수치 입력, Drafting 검토/Apply, Undo/Redo 버튼을 물리 입력으로 사용했다. UI 기준 파일은 같은 실제 DXF를 명령 경로로 새로 가져온 baseline이며, UI 검증이 DWG 직접 가져오기를 수행한 것은 아니다.

## 판정

- 분리된 Review는 live 문서·Undo 기록을 바꾸지 않았다.
- 일괄 수정 후 한 번 Undo가 전체 문서를 가져오기 직후로 정확히 복원했다. Redo는 수정 상태를 정확히 재현했다.
- Undo나 스냅샷 교체 없이 역방향 명령으로 복원해 모든 객체·topology ID·블록·스타일·source receipt가 기준과 같았다. 비교에서 revision만 제외했다.
- UI에서도 세 번 Undo/Redo와 원래 값 직접 입력 복원이 전체 문서 비교를 통과했다. 직접 복원은 세 개의 새 편집 이력으로 남았다.
- 기준과 복원 SVG는 바이트 단위로 같고, 전체 DXF도 기준에서 출력한 DXF와 바이트 단위로 같았다.
- 저장·재열기 후에도 같은 상태를 유지했다.
- DXF 재가져오기에서 문자 98개의 내용·색상·위치·크기, 채움 85개의 색상별 면적이 유지됐다. 문자 좌표 허용 오차 1e-6mm, 채움 면적 0.05mm²로 검사했다.
- 전체 표시 경로를 선분으로 정규화한 36,631개 다중집합이 좌표·선색·굵기·dash·채움 기준으로 일치했다. 좌표는 0.0001mm로 양자화했다. 원/호는 표시용 표본 선분이므로 BRep 동등성 증명은 아니다.

명령 audit 8개, 실제 UI 9개 통과. 별도 전체 경로 선분 검사 통과. TypeScript와 architecture 714 modules 통과. 제품 코드는 바꾸지 않았으므로 전체 Node/빌드를 불필요하게 반복하지 않았다. 이전 3차의 전체 Node 1,503·브라우저 150 검증은 그 시점의 결과다.

## 해석과 다음 검증

원본은 가져온 CAD 선·블록이며 의미 기반 건축 벽/문 객체로 인식된 것이 아니다. 문 기호 축척은 벽 개구부나 주변 치수를 자동으로 변경하지 않는다. 개체를 수동으로 찾아 편집하는 단계에는 동일 이름 Line/block이 많아 탐색 부담이 있다. 향후 다양한 도면에서 선택·찾기 경험과 문/벽의 연동 여부를 별도 과제로 평가한다.

기존 gradient 11개·곡선 해치 4개 제외, 정적 치수/해치의 연관성 소실, 외부 DWG 변환의 경계는 그대로다. 여기서 복원이란 지원 범위로 가져온 기준 상태로의 복원이며 외부 DWG의 미지원 요소를 되살렸다는 뜻이 아니다. 원본 출처·권리·변환 정보는 [2차 기록](EXT-CIVIL-02-2026-10-19.md)을 따른다.

다음 도면은 단위가 다른 평면도, 블록/외부 참조가 많은 도면, 곡선/해치 중심 도면, 큰 실무 도면으로 넓힌다. 각 파일에서 가져오기 손실과 편집·복원 중 발생한 차이를 분리해 기록한다. 이번 완료 대상은 주거 도면 1건이며 다른 도면의 검증을 완료했다고 주장하지 않는다.

## 산출물·재현

- [기준/수정/복원 비교](../../output/external/civil-projects/restoration-01/comparison.png) — 선 굵기를 1:150 종이 표현으로 보정한 미리보기, 저장 기하를 바꾸지 않는다.
- [복원 문서](../../output/external/civil-projects/restoration-01/restored.webcad.json)
- [명령 검증](../../output/external/civil-projects/restoration-01/report.json)
- [실제 UI 검증](../../output/external/civil-projects/restoration-01/native-report.json)
- [전체 경로 왕복](../../output/external/civil-projects/restoration-01/geometry-roundtrip-report.json)
- [검증 기록](../verification/EXT-CIVIL-RESTORE-01-2026-10-19.json)

```powershell
pnpm --filter @agent-webcad/web exec tsx scripts/verifyResidentialRestoration.ts
pnpm --filter @agent-webcad/web exec tsx scripts/verifyResidentialRestorationGeometry.ts
$env:CAD_TEST_BROWSER='C:/Program Files/Google/Chrome/Application/chrome.exe'
pnpm --filter @agent-webcad/web test:browser --page=residentialRestoration
pnpm --filter @agent-webcad/web exec tsc -b
pnpm --filter @agent-webcad/web check:architecture
```
