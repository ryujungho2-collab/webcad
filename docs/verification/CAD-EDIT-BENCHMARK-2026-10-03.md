# 반복 CAD 수정과 큰 문서의 피드백 지연

> **현재 기능 설명:** [정밀 작도와 편집](../features/DRAWING-EDITING.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

> 단계 기록: 아래 구현·검수 수치는 해당 시점의 근거다. 최신 지원 범위는 [CAD-BASICS](../product/CAD-BASICS.md), 최근 전체 검수는 [PROJECT-STATE](../../PROJECT-STATE.md), 다음 실행 순서는 [NEXT-STEPS](../../NEXT-STEPS.md)를 따른다.

2026-10-03. 캔버스 의도 확인·핸들 편집을 반복 작업으로 평가하고 가장 큰
검증 미리보기 병목을 개선했다. 기존 사용자의 파일이나 변경 내역은 유지했다.
자동 과제를 수행한 결과이며 실무자의 작업 시간·오조작률을 측정한 결과는 아니다.

## 과제와 측정 방법

- 기계: 100 × 60 × 8 mm 구멍 판의 코너 핸들에서 폭을 105, 110, …, 130 mm로
  여섯 번 수정한다. `plateWidth`, 연동 구멍 피치, 유지할 높이/지름, 솔리드를
  실제 Preview/Apply로 갱신한다. 네 구멍의 반지름은 4 mm다.
- 2D: 6,000 × 4,000 mm 닫힌 폴리라인의 코너 X를 6,100, …, 6,600 mm로
  여섯 번 수정한다. 다른 꼭짓점·지속 참조와 한 Undo를 유지한다.
- 각 과제를 참조 형상 0/250/1,000개에서 실행했다. 기계 문서는 참조선을 같은
  스케치에 포함한다. 참조선은 부품/도면 범위 안에 배치해 visible 객체로 포함한다.
  과제 원본은 production 명령으로 생성한다. 참조 형상은 합성 로드 fixture이며
  production 직렬화/역직렬화 검증과 스케치 해석을 통과시킨다.
- 실제 App, React, Worker, isolated headless Edge, 1,440 × 1,000 창, SwiftShader,
  Vite 개발 서버와 로컬 자산을 사용했다. 시작/파일 로드와 최초 Worker 초기화는
  측정에서 제외한다. 취소한 미리보기 한 번으로 경로를 준비한 후 실제 키보드
  입력을 사용한다. 변경값마다 새로운 형상은 계속 OCCT로 검증한다.
- 작업 시간: 핸들 Enter→정밀 입력→검증→Apply→동일 핸들 복귀 후 두 RAF까지.
  입력 어댑터와 문서/히스토리 guard 비용을 포함한다. 별도 Undo/Redo 검수는 제외한다.
- 요청/검증 지연: native `input` 이벤트→변경된 요청 SVG의 다음 RAF / Ready 이후
  두 RAF다. 화면 갱신 기회를 측정하며 실제 디스플레이의 픽셀 표시 시간을 재지는 않는다.
- User Timing으로 의도 계산, 제안 준비, 변경 비교/측정, 프레임의 화면 투영,
  viewport 동기화를 나눴다. Long Task와 RAF 간격도 수집했다. 프레임 계측은
  이 과제 동안만 켜므로 일반 작업 세션에 프레임 기록이 계속 쌓이지 않는다.
- 각 셀 n=6. 중앙값은 가운데 두 값의 평균, p95는 nearest rank이므로 여섯
  표본에서는 최대값이다. 초기 `before` run은 탐색용이며 공식 비교는 수정 전
  `baseline`과 최종 코드의 `final`이다. 첫 개선 run `after`도 보존한다.

## 동일 과제의 결과

단위 ms, 중앙값. 형상 수는 과제에 더한 참조선 수다. 기계 1,000 케이스는
총 1,006 객체, 2D는 1,001 객체다.

| 과제 | 참조 형상 | 반복 수정 전→후 | 검증 피드백 전→후 | 요청 표시 전→후 |
| --- | ---: | ---: | ---: | ---: |
| 기계 | 0 | 318.5 → 217.1 | 183.3 → 96.8 | 27.0 → 36.0 |
| 기계 | 250 | 448.8 → 339.3 | 263.4 → 161.8 | 54.4 → 48.6 |
| 기계 | 1,000 | 1,022.8 → 747.9 | 521.4 → 344.9 | 140.5 → 130.4 |
| 2D | 0 | 101.5 → 115.5 | 22.7 → 25.6 | 14.6 → 16.7 |
| 2D | 250 | 149.8 → 137.8 | 38.7 → 36.3 | 21.9 → 20.3 |
| 2D | 1,000 | 400.0 → 362.2 | 143.4 → 85.1 | 81.9 → 66.4 |

각 run의 여섯 케이스에서 36/36 수정 성공, 예상치 못한 재시도 0회다.
잘못된 `20deg` 입력은 케이스마다 1회 의도적으로 시험해 차단/취소를 확인했으며
재시도로 합산하지 않는다. 실무자의 대상 찾기나 잘못된 입력 빈도를 뜻하지 않는다.

가장 큰 기계 1,000 케이스의 검증 지연은 약 34%, 반복 수정은 약 27% 감소했다.
검증 지연 p95는 569.8→370.3 ms다. 초기 개선 run에서도 검증 중앙값 348.1 ms,
반복 수정 794.9 ms로 감소했으나 반복별 차이가 있다. 작은 2D 문서의 작업 시간은
두 개선 run에서 증가했다. 모든 크기의 모든 지연이 개선됐다고 판단하지 않는다.

## 병목과 구현

가장 느린 것은 기계 1,000 문서의 검증 피드백(521.4 ms)이었다. 제안 준비
203.4 ms, 비교/측정 176.0 ms였고, 동일 솔리드가 명령 검증과 Before/After
검토에서 반복 측정됐다. 아래 phase 중앙값은 각 수정의 최대 phase entry를
모은 것이므로 전체 지연과 단순 합산하지 않는다. 프레임 작업도 Worker 응답의
UI 반영을 방해할 수 있으며 Worker 소요 시간과 메인 스레드 CPU 시간을 동일시하지 않는다.

- 정확 측정은 **전체 형상 파라미터·중첩 원본·변환이 같은 operand**에서만 재사용한다.
  64개로 제한한 promise cache는 동시 요청을 공유하고 실패/취소된 요청을 제거한다.
  입력과 반환값을 복제해 캐시를 외부에서 수정할 수 없게 한다. HMR 시 비운다.
  변경된 형상은 실제 OCCT로 측정한다. tolerance, validity 검사, stale/version 검사,
  실제 solver/Worker Preview와 한 Undo 경계를 유지했다.
- 제안의 객체별 feature 탐색은 두 snapshot의 output Map을 한 번 만들어 조회한다.
  스케치 변경 비교도 geometry/constraint Map을 사용한다.
- 핸들 review는 고정된 snapshot의 경로·변경·관계 형상을 effect에서 한 번 계산한다.
  RAF에서는 카메라에 따른 투영만 갱신한다. geometry 자체를 받아 경로를 만들므로
  전체 스케치를 순회할 때 각 ID를 다시 검색하지 않는다.

기계 1,000의 비교/측정은 **176.0→7.7 ms**, 변경 비교만의 CPU는 27.9→6.1 ms,
프레임 투영/피드백 phase는 **23.8→7.4 ms**였다. 최종 각 수정에서 실제 inspect
Worker 요청은 1회다. Query나 검토가 받은 bounds/volume을 수정해도 이후 검증은
바뀌지 않는다. 중첩 원본, 폭, 배치가 달라지면 다시 측정하고 거부된 작업은 재시도한다.

## 아직 해결되지 않은 경험

- 기계 1,000에서 최초 요청 표시 130.4 ms, 적용 후 피드백 236.5 ms가 남는다.
  제안 준비 177.0 ms도 여전히 가장 큰 phase다. 문서 clone/정책 검증/스케치
  projection과 상태 변경에 따른 React 작업을 다음으로 분리 계측한다.
- 일반 2D 1,000의 적용 후 지연은 150.9→165.3 ms로 개선되지 않았다.
  RAF 간격 p95도 기계 100.1→141.6 ms, 2D 116.6→124.9 ms다. 가장 긴 2D
  Long Task는 126→158 ms다. 작업 시간이 줄었어도 프레임 끊김을 해결했다고
  볼 수 없다. 다른 개선 run의 변동과 software GPU 영향을 포함해 기록한다.
- 다음 우선순위는 Preview 최초 응답과 Apply 주변의 메인 스레드 long task를
  CPU profile로 귀속시키고, 불필요한 문서/React 재계산부터 줄이는 일이다.
  모든 검증·변경 감지를 생략하거나 경고 한도를 높이는 식으로 처리하지 않는다.
- 그 다음 실제 GPU/production build와 대표 파일로 확인하고, 실무자가 대상
  찾기→드래그→치수 확인→정정→Apply를 수행하는 관찰 과제를 진행한다. 작업
  완료 시간, 대상 재선택·잘못된 입력·취소·재시도, 관계 유지 여부를 이해한
  비율을 따로 기록해야 기존 CAD 경험과 비교할 수 있다.

## 빌드 경고와 검수

Vite 7.3.6의 기본 경고는 minified JavaScript chunk가 500 kB보다 크다는 뜻이다.
빌드 실패나 공차 오류가 아니다. 최종 shell은 약 765 kB(gzip 230 kB), viewport는
약 519 kB(gzip 137 kB)다. OCCT WASM은 별도로 약 50.3 MB(gzip 14.0 MB)다.
초기 전송/해석과 cold Worker 준비는 후속 로딩 과제다. 이번 warm 편집 측정에서는
청크 크기와 편집 지연의 인과를 검증하지 않았으며 경고 한도는 변경하지 않았다.

- Node 380개 / 49 suite 통과. 새 검수는 동시 측정 공유, detached bounds/volume,
  변경된 원본/배치, 중첩 boolean 원본, 거부된 작업의 재시도를 확인한다.
- 별도 benchmark 6개 케이스 / 99개 UI·Worker 검수 통과. 모든 Preview의 무변경,
  정확한 Apply와 지속 핸들 복귀, 한 Undo/Redo, 여섯 Undo/Redo의 전체 문서 일치,
  독립적인 판 체적 공식, 잘못된 단위 차단/취소를 확인한다.
- 전체 브라우저 12개 페이지 / 243개 UI·Worker 검수, 최종 타입 검사·production
  빌드와 `git diff --check` 통과. 기존 실제 포인터 드래그, 방향/궤도 구속,
  충돌 해제, stale/cancel, 정밀 입력, 겹친 대상 선택도 함께 회귀 검수했다.
- 전체 브라우저 회귀와 최종 빌드 로그는 `tmp/edit-performance-full-browser.log`,
  `tmp/edit-performance-full-node.log`, `tmp/edit-performance-final-build.log`에 있다.

재현 명령(저장소 루트):

```powershell
pnpm --filter @agent-webcad/web benchmark:edit --label=sample
pnpm --filter @agent-webcad/web exec node scripts/compareEditBenchmarks.mjs --before=baseline --after=sample
```

원시 trial/RAF/Long Task는 [output/benchmarks](../../output/benchmarks)에 보존했다.
최종 정규화 비교는
[comparison-baseline-final.json](../../output/benchmarks/comparison-baseline-final.json)이다.
