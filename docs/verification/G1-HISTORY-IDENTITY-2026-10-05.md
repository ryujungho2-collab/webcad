# G1 후속 검수 — 긴 이력과 선택 복원

검수일: 2026-10-05. [G1 첫 세션 개선](G1-SESSION-CONTINUITY-2026-10-05.md)의 후속이다. 첫 묶음의 단축키·도구 정리·포커스 계약을 유지하면서 100개 이력 상한·분기·하위 요소·파일 재열기 경계를 확인했다. 외부 실무자 평가는 수행하지 않았다.

## Before → 원인 → 변경

실제 App에서 rectangle 선택 → 네이티브 Ctrl+D 105회 → Ctrl+Z를 실행했다. 문서는 104회 복제 상태로 복원됐지만 선택은 과거 깊이 99에 기록된 객체로 돌아갔다. 수정 전 실패는 `tmp/g1-history-before-browser.log`에 보존한다.

`App.selectionMemory`의 숫자 키가 `HistoryStack.getPastLabels().length`였다. History가 100개에 도달하면 새 작업마다 같은 키를 덮어쓰고, Undo로 이동한 깊이는 오래된 선택 기록을 가리켰다. 분기에서도 같은 깊이를 서로 다른 상태가 재사용했다.

`packages/cad-history/src/HistoryStack.ts`에 **문서 상태별 메모리 토큰**을 추가했다. 성공한 push는 새 토큰을 만들고 Undo/Redo는 해당 snapshot의 토큰을 복원한다. clear는 같은 문서 ID를 다시 열어도 새 토큰을 만든다. 값 snapshot·label·100개 상한·clone/ownership 계약은 유지한다.

App은 토큰 객체를 키로 하는 WeakMap에 선택을 보관한다. Undo와 Redo 양쪽에서 떠나는 상태의 최신 선택을 기억하고, 목적 상태의 선택을 복원하며 현재 문서의 유효한 객체·topology로 필터링한다. React effect는 렌더 시 토큰을 캡처하고 복원 값은 History 이동 직후 계산한다. 삭제된 분기를 UI 캐시가 강하게 붙잡지 않는다. GC 시점이나 실제 heap 감소를 측정한 것은 아니다.

토큰은 저장되는 geometry/topology ID나 document revision과 다르다. JSON에 포함하지 않으며 serialization v1–v7 계약을 변경하지 않았다. 같은 상태로 Undo해도 revision은 증가하므로 오래된 preview의 Apply 거부는 계속 유지된다.

## 실제 사용자 workflow

정식 browser runner에 `historySelection`을 등록했다. 23개 검사는 다음을 확인한다.

1. 105회 복제 후 두 번 Undo/Redo: 즉전 문서·결과 선택 복원, 100개 상한 유지.
2. Undo 두 번 → 다른 원본 선택 → 새 복제: 기존 future 제거, 같은 깊이의 새 결과 선택 복원.
3. 과거 상태에서 선택을 바꾼 뒤 Redo → Undo: 그 상태에서 마지막으로 선택한 대상 복원.
4. Ctrl+클릭 다중 선택 → batch Duplicate → 한 Undo/Redo: 두 객체와 primary 선택을 함께 복원.
5. Direct → Tab → 꼭짓점 grip → Enter → Cancel → Explode: 원본 사각형을 네 선분으로 교체. Undo는 원본 topology와 꼭짓점 참조를 복원하고 Redo는 결과 선분 선택과 참조 정리를 복원.
6. Hide → Undo/Redo: 보이는 원본의 선택을 복원하며 숨겨진 객체를 다시 선택하지 않음.
7. 같은 ID의 파일 open → 새 복제 → Undo/Redo: 문서 내용은 유지하고 이전 세션의 선택·이력은 재사용하지 않음. 결과 후 canvas focus 확인.

setup 외 편집·선택·history는 CDP의 실제 pointer/key 입력이다. 버튼은 scroll 후 실제 hit-test를 통과해야 한다. 파일은 OS 대화상자 조작 대신 File/DataTransfer fixture를 App의 실제 input change 경로로 전달했다. 문서 비교는 Undo/Redo가 증가시키는 revision을 제외한 전체 데이터 비교이며 좌표 일부만 비교하지 않는다.

Node의 `historyState.test.ts` 7개는 100회 Undo/Redo 전체 순회, 같은 깊이·같은 값의 새 분기, clear, clone/ownership, preview/discard·거부/no-op·stale Apply의 문서와 양쪽 stack/토큰 불변, batch 한 이력·중복 Apply, 같은 ID 파일 열기와 잘못된 파일의 원자성을 검증한다. 기존 unchanged rename은 거부 결과를 반환하는 계약을 유지하며 이력을 추가하지 않는다.

## 검증 증거

- 수정 전: `tmp/g1-history-before-browser.log` — cap 뒤 첫 Undo에서 선택 불일치.
- 집중 검사: `tmp/g1-history-browser.log` — 23개 통과; `tmp/g1-history-node.log` — 7개 통과.
- 소스 타입: `tmp/g1-history-types.log`; 새 Node/browser 테스트 별도 strict 타입: `tmp/g1-history-test-types.log`.
- 전체 회귀: `tmp/g1-history-final-node.log`, `tmp/g1-history-final-browser.log`.
- production build: `tmp/g1-history-final-build.log`; 구조·문서 링크: `tmp/g1-history-final-architecture.log`.

최종 전체 Node **553개/52 suites**(skipped 0), browser **24과제/501검사**, architecture **250모듈**이 통과했다. 소스 및 새 테스트 strict 타입·전체 production build도 통과했다. main 903.18kB / Viewport 593.25kB minified로 >500kB 경고는 남는다. [PROJECT-STATE](../../PROJECT-STATE.md)의 최신 검수 표와 일치하며 첫 G1의 546 Node / 23 browser 과제 / 478검사와 구별한다. production tsconfig는 src만 포함하므로 전체 기존 테스트의 타입 검사까지 완료했다고 주장하지 않는다.

```sh
pnpm --filter @agent-webcad/web exec tsx --test tests/historyState.test.ts
pnpm --filter @agent-webcad/web test:browser -- --page=historySelection
pnpm --filter @agent-webcad/web exec tsc -b
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web test:browser -- --artifacts
pnpm --filter @agent-webcad/web check:architecture
pnpm build
```

## 남은 한계와 G2 인계

- 이번 결과는 이력·선택 정확성 검수다. 계산 지연 전후 benchmark·heap/GC·실무자 시간/재시도는 새로 측정하지 않았다. 첫 G1의 배경 1,000개 지연은 그 당시 관측이며 이번 최적화 성과로 사용하지 않는다.
- native sub-selection 검증은 drawing 꼭짓점과 Explode에 한정한다. 모든 BRep face/edge remap, 모든 관계 조합, OS 파일 대화상자를 검증한 것은 아니다.
- 전면적인 session owner·정밀 입력 통일·original/result navigation·구조화된 오류 수리, 좁은 화면·접근성 전반은 남는다. G1 전체 제품 목표 완료와 구분한다.
- 자동 검수 뒤 다음 구현은 **G2 첫 묶음: 아트보드 프레임·배경·활성 보드·Fit·개별 SVG**다. 외부 사용자 평가는 별도 후속으로 유지하되 G2를 무기한 막는 선행 조건으로 두지 않는다. G2의 벡터 path/style·Component는 이 첫 묶음 이후 별도 범위다.
