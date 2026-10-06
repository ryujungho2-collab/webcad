# 코드·구조·검증 근거 리뷰

2026-10-04. 범위는 웹 애플리케이션의 도면 편집, 공용 좌표 계산, 명령 등록, 관련 Node/브라우저 테스트와 프로젝트 문서다. 기존 미커밋 작업을 유지하며 검토했다. 전체 CAD 기능이나 실무 사용성의 완성 판정은 아니다.

## 발견과 처리

| 우선도 | 근거와 영향 | 처리 |
| --- | --- | --- |
| P2 | 순수한 `getObjectTransform`이 `state`에 있어 world geometry·bounds·sketch·pattern·drafting·drawing 계산이 애플리케이션 상태 폴더를 참조했다. 계산을 Worker나 다른 호출자에 재사용할 때 경계가 불분명했다. | [precision/objectTransform](../../apps/web/src/precision/objectTransform.ts)으로 이동하고 모든 소비자를 갱신했다. 공용 계산의 상태·UI 의존을 자동 검사한다. |
| P2 | 한 도면 편집 기능의 계산, 세 종류 명령 등록과 세 도구가 `precision`, `state`, `viewport`에 흩어져 있었다. 도면 명령 등록에는 치수 생성·표시 수정까지 섞여 있었다. | [drawing-editing](../../apps/web/src/features/drawing-editing/registerCommands.ts)에 기능을 모으고 등록 진입점을 하나로 만들었다. [치수 명령](../../apps/web/src/state/registerDimensionCommandHandlers.ts)은 별도로 등록한다. 동일한 트랜잭션 문서와 공개 명령을 사용한다. |
| P2 | App·Ribbon·AppShell의 도면 세션 타입이 UI 컴포넌트 파일에 있었고, `ContourTool → BasicEditTool → ContourToolProps`의 역방향 타입 참조가 있었다. 타입이 지워지므로 이것을 런타임 순환 버그로 판정하지는 않았다. | [contracts](../../apps/web/src/features/drawing-editing/contracts.ts)에서 타입만 공유하도록 분리했다. 도구에서 세션 타입을 재수출하는 호환 wrapper를 만들지 않았다. |
| P1 | 곡선 브라우저 검사의 Pattern 인계가 편집기 열기에서 끝나 실제 적용·source 연결·단계별 Undo를 입증하지 못했다. Trim 검사에서는 Modify 탭에 없는 `Selection` 버튼을 요구해 마지막 흐름이 실패했다. | [브라우저 과제](../../apps/web/tests/curveWorkflow.browser.tsx)는 live 인스턴스 두 개와 정확한 source, 각각의 Undo, 캔버스에서 호 가지 선택→미리보기→Trim 적용을 검증한다. 실패를 무시하거나 클릭을 문서 API 호출로 대체하지 않았다. |
| P2 | `BasicEditTool`은 새 제안이 계산된 뒤 아직 캔버스에 투영되지 않아도 Apply/Enter를 허용했고, 화면이 같아도 매 프레임 paths·area·handles 상태를 갱신했다. | [기본 편집 UI](../../apps/web/src/features/drawing-editing/ui/BasicEditTool.tsx)는 현재 plan의 결과가 표시된 뒤 적용한다. 화면·plan이 달라질 때만 상태를 갱신한다. 기존 브라우저의 모든 ready 단계가 활성 Apply와 실제 녹색 결과 표시를 함께 요구한다. |
| P2 | 루트에 제품 방향·구현·검수 Markdown 24개가 섞여 있었고, 이동만 하면 관련 문서 링크와 import가 끊길 수 있었다. | 22개 문서를 목적별로 이동하고 상대 링크를 갱신했다. 루트의 상태·다음 작업 진입점은 유지하고 [README](../../README.md)와 [문서 목록](../README.md)을 추가했다. |
| P2 | 현재 로컬 pnpm이 루트 `package.json`의 `pnpm.onlyBuiltDependencies`를 무시한다는 경고를 냈다. 실제 `pnpm-workspace.yaml`의 `allowBuilds`와 별개로 설정이 중복돼 있었다. | 무시되는 루트 설정을 제거했다. 기존 workspace 설치 스크립트 정책은 유지한다. |

이동 전후의 기하 알고리즘과 명령 payload는 유지했다. 타입 계약·등록 조합·치수 소유 범위와 브라우저 검증의 의미를 명시적으로 개선했다. 오래된 경로에 재수출 파일을 남겨 의존 방향을 숨기지 않는다.

## 남아 있는 구조 과제

| 우선도 | 근거 | 다음 변경과 검증 기준 |
| --- | --- | --- |
| P2 | 정리 후에도 `App.tsx` 1,540줄, `CadViewport.tsx` 3,605줄, `state/commandBus.ts` 1,190줄이다. App의 도구 시작/결과 인계와 Viewport의 입력·카메라·렌더링 수명 주기가 큰 파일에 결합돼 있다. 줄 수 자체보다 다른 세션을 건드리는 변경 위험이 문제다. | 세션 호스트·입력 수명 주기를 먼저 추출한다. 취소/도구 전환/문서 교체 시 이전 listener와 plan이 남지 않는 브라우저 검사를 선행한다. 트랜잭션·재생성은 공용 진입점에 유지한다. |
| P2 | `tsconfig.json`의 include는 `src`다. `tsx`로 실행되는 테스트·검사 스크립트는 현재 production 타입 검사 범위에 포함되지 않는다. 실행 통과가 테스트 코드의 타입 정확도를 입증하지는 않는다. | 테스트 전용 타입 검사 설정과 fixture 타입을 점진적으로 정리한다. 이번의 import 검사는 누락된 경로를 검사하며 TypeScript 검사 전체를 대체하지 않는다. |
| P2 | 기존 production 번들에서 큰 chunk 경고가 있었다. 폴더 이동과 타입 분리만으로 초기 다운로드나 Worker/Viewport 로딩 시간이 줄었다고 주장할 근거는 없다. | 초기 진입·커널 시작·큰 문서 첫 피드백을 구분해 측정하고 가장 큰 전송/실행 경로부터 분리한다. |

닫힌/중간 구간 Trim, arc-corner Fillet, 참조 재연결 등의 기능 공백은 [Curve workflow 지원 경계](../implementation/CURVE-WORKFLOW-2026-10-04.md)와 [다음 작업](../../NEXT-STEPS.md)에 별도로 기록한다.

## 검증 근거

- 디렉토리 이동 직후 production 타입 검사 통과, 도면 편집·치수 Node 회귀 **87개 / 6 suites** 통과.
- [아키텍처 검사](../../apps/web/scripts/checkArchitecture.ts)는 앱·테스트 224개 모듈을 읽는다. 상대 import 누락, 계산→상태/UI 의존, 계산 런타임 순환, 명령 어댑터의 라이브 상태 의존, runtime 타입 계약, 문서 링크 누락을 검사한다.
- [규칙 테스트](../../apps/web/tests/architecture.test.ts)에는 잘못된 의존·런타임 순환·타입 계약을 실제로 거부하는 부정 사례와 전체 트리 검사가 있다. 문서 목록을 만드는 도중 누락된 리뷰 링크도 검사에서 검출했다.
- 최종 전체 **Node 502개 / 49 suites**, **브라우저 19과제 / 390개 UI·Worker 검사**, 아키텍처 검사와 production 빌드가 통과했다. 실제 live Pattern 인스턴스 생성·두 단계 Undo, 캔버스 호 선택→Trim과 기본 편집의 표시 후 적용도 통과했다. 루트 [PROJECT-STATE](../../PROJECT-STATE.md)에 로그 경로를 남겼다.
- 빌드의 >500 kB chunk 경고는 남아 있다. 이번 최종 빌드에서 main은 851.37 kB, CadViewport는 581.64 kB(minified)였다. 경고 한도를 올리거나 이 수치를 다운로드 시간으로 해석하지 않았다.

실제 입력과 해석 기하의 보존, Preview의 문서 불변, 한 번의 Apply/Undo, 연관 갱신의 실패 원자성은 기존과 확장한 테스트로 검사한다. 자동 테스트의 통과를 실무자의 조작 속도·학습 비용에 대한 평가로 확대하지 않는다.

## 후속 Markdown 정리 (2026-10-04)

PROJECT-STATE는 현재 구현·최근 검수, NEXT-STEPS는 앞으로 실행할 작업, PRODUCT-ROADMAP은 이후 확장과 통과 기준으로 중복 이력을 줄였다. 확장 구속의 미구현 표기와 곡선 Offset·직선 코너의 오래된 후속 목록, coupled driver batch의 재생성 설명을 현재 코드에 맞췄다.

초기 `DESIGN-PASS.md`의 표현 원칙은 디렉토리 안내에 통합하고 raw git/build 출력 문서를 삭제했다. 고유한 기하·측정·검수 기록은 단계 기록으로 보존했다. 최근 코드의 전체 검수 결과와 이번 문서 검증을 구분해 기록했다. 삭제/수정 후 문서 링크·아키텍처 검사와 기존 아키텍처 회귀 4개가 통과했다. 로그는 `tmp/docs-cleanup-architecture.log`, `tmp/docs-cleanup-tests.log`다.
