# G0 실행 환경·아트보드 검증

> **현재 기능 설명:** [이미지와 장면](../features/IMAGES-SCENES.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

검증일: 2026-10-05. 범위: 기존 실행 환경 확인, 시작된 아트보드 수정 검증과 필요한 패널·회귀 보강. G1/G2 구현은 시작하지 않았다.

## Before와 원인

- 기본 sandbox에서 `tsc` 실행 파일을 찾지 못하고 `tsx` CLI 읽기에 EPERM이 발생했다. 정상 실행 권한에서는 기존 설치의 타입·Node·architecture 명령이 실행됐다. 의존 패키지 재설치나 lockfile 수정이 필요한 소스 문제로 판단하지 않았다.
- 실제 실행 환경은 Windows·Node 24.19.0(`C:/Program Files/nodejs/node.exe`)·pnpm 11.26.0(`C:/Users/thefi/AppData/Roaming/npm/pnpm.ps1`)이며 repository의 packageManager와 일치한다. 기본 sandbox의 fallback pnpm 11.19.0과 구별한다.
- 최초 기준선은 Node 538개/50 suites, architecture 246모듈 통과였다. 기존 10-04의 535개·21 browser page 수와 별개다.
- 시작된 마지막 삭제 게시 처리는 유효했으나 impact의 modified가 생성/삭제까지 포함했다. detached deletion 이후 History·파일·복구 경로를 더 검증해야 했다.
- 패널이 Number로 빈 origin을 0으로 읽고 즉시 명령을 적용했다. unit/범위 안내와 reviewed draft 일치 검사가 부족했다.
- UI 검사만으로는 필드 간격·버튼 가림이 드러나지 않았다. 캡처 검토와 실제 hit-test로 발견하고 수정했다.

## 변경과 workflow

`Artboards 발견 → New → 선택된 board → mm/cm/음수 origin 입력 → detached Review → 변경 전후 값·impact 확인 → 잘못된 입력/locked 안내 → 복구 → Apply → Cancel/Undo/Redo → 마지막 삭제 → Save → reload`

Apply는 공통 commandInteraction의 authoritative `canApply`와 review의 정확한 draft key를 사용한다. 원본을 수정하지 않는 preview를 준비하고, 같은 평가 결과를 한 번만 게시한다. 편집 중 Apply 이전에는 revision·past/future 이력이 그대로다. 생성/삭제·Hide/Lock은 즉시 명령이며 별도의 review 세션으로 포장한 것으로 보고하지 않는다.

본문을 내부 스크롤로 분리하고 실행 버튼을 하단에 유지했다. sticky footer만 추가한 초안은 검토 summary를 가려 native hit-test에 실패했다. 최종 body/footer 분리에서 summary와 Apply/Cancel/Delete가 모두 실제 pointer로 작동한다.

## Node 증거

`tests/artboards.test.ts`의 10개 검사가 다음을 확인한다.

- CRUD·잠금·없는 board·duplicate·동일 값 no-op. 실패는 serialized document와 revision, past/future label 모두 유지한다.
- detached update/create/delete preview와 public preview 데이터 변경의 격리, discard·abort, 단 한 번 Apply.
- lock·Undo·New 이후 stale plan 거부, 마지막 삭제의 optional collection 제거, 정확한 Undo/Redo.
- batch 중간 삭제/생성/잠금 후 실패의 완전 rollback과 성공 batch의 한 Undo.
- v7 저장/재로드, 마지막 삭제의 v1 복귀, recovery load·실제 File open·New에서 옛 optional field 제거.
- invalid 수치 payload와 v6에 artboard를 얹은 파일 거부.

## Browser 증거

`artboardsWorkflow`를 실제 `browserChecks.mjs` 목록에 등록했다. 격리된 Edge/SwiftShader와 Vite에서 native pointer·keyboard로 25개 검사를 통과했다. DOM `.click()`이나 command 호출로 패널 입력 검증을 대체하지 않는다. 실제 save UI는 recovery checkpoint를 기록하고 페이지 reload로 다시 열린 문서를 검증한다. 파일 선택 대화상자 자체의 native 자동화는 이 browser 과제에 포함하지 않는다.

화면: [아트보드 Review](../../output/images/cad-artboards-review.png). 테스트 결과 overlay는 test page의 표시이며 제품 UI가 아니다.

## 실행 결과

| 검사 | 확인한 결과 | 로그 |
| --- | --- | --- |
| 전체 Node | 545개 / 50 suites 통과, skipped 0 | `tmp/g0-final-node.log` |
| 소스 타입 | `pnpm --filter @agent-webcad/web exec tsc -b` 통과 | `tmp/g0-final-types.log` |
| G0 테스트 타입 | artboards Node/browser 및 commandInteraction 테스트 별도 strict 검사 통과 | `tmp/g0-test-types.log` |
| 아트보드 실제 browser | 25개 통과 | `tmp/g0-artboards-browser.log` |
| 전체 browser | 최종 패널 배치 포함 22과제 / 454검사 통과. Pattern 22개·관계 UX 17개 포함 | `tmp/g0-final-browser.log` |
| architecture/import/doc links | 앱/테스트 247모듈·문서 링크 통과 | `tmp/g0-final-architecture.log` |
| 전체 production build | `pnpm build` 통과, 공유 패키지 포함 | `tmp/g0-final-build.log` |

G0 테스트 별도 타입 명령은 기존 설치의 Node 선언을 재사용한다. 전체 테스트 파일을 typecheck한 결과로 확대 해석하지 않는다.

```sh
pnpm --filter @agent-webcad/web exec tsc --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --esModuleInterop --lib ES2022,DOM,DOM.Iterable --types node --typeRoots node_modules/@types,../../packages/cad-kernel/node_modules/@types node_modules/vite/client.d.ts tests/artboards.test.ts tests/artboardsWorkflow.browser.tsx tests/commandInteraction.test.ts
```

PowerShell에서는 쉼표를 포함한 `--lib`·`--typeRoots` 값을 따옴표로 묶는다. production tsconfig가 src만 포함하는 기존 공백은 그대로 명시한다.

## 성능·남은 제한

이번 G0에서 큰 문서 성능 최적화 전후 benchmark는 실행하지 않았다. preview debounce는 120ms이며 이는 입력 합치기 설정이다. 실제 input-to-paint p95 개선이나 실무자의 시간/재시도 개선을 측정한 수치가 아니다. 이전 관계 benchmark 수치는 [별도 기록](INTERACTION-PERFORMANCE-2026-10-04.md)에 보존한다.

production은 main 902.43kB, Viewport 593.09kB minified다. 기존 >500kB 경고를 유지했다. 아트보드 뷰포트 경계/배경·Fit·보드별 crop/export, 모든 session/precision/hover의 통합, 전 문서 복제/diff/history 비용과 전문가 usability study는 남아 있다. JSON/cache 원본과 화면 프레임·export 완료를 혼동하지 않는다.
