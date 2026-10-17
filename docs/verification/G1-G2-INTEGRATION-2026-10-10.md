# G1·G2 통합 보강 검수

> **현재 기능 설명:** [프로젝트와 저장](../features/PROJECTS.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

검수일: 2026-10-10. CAD B2-D/E 이후의 History·도구 세션과 아트보드·컴포넌트 연결을 재검토했다.

## 수정한 경계

- G1: History 상태 토큰별로 객체 선택에 더해 활성 아트보드를 기억한다. 여러 보드 중 활성 보드를 삭제한 뒤 Undo하면 해당 보드와 활성 선택이 함께 돌아오고, Redo하면 남은 보드로 복원된다. 2D에서 복원 보드가 바뀌면 작업면도 그 보드에 맞춘다.
- G1: 블록 해체 세션을 App 키보드 effect 의존성에 포함해 캔버스 작도 단축키가 열린 검토를 덮어쓰지 않게 했다. 체크박스·라디오·슬라이더 등 비문자 input에 포커스가 있을 때 Ctrl/Cmd+Z는 문서 History로 보낸다. 문자·숫자·select와 modal의 자체 키보드 범위는 유지한다.
- G2: 새 컴포넌트 정의의 멤버 snapshot에 원본 객체 ID를 별도로 보존한다. 정의 수준 `set-block-override`가 해당 멤버를 찾아 뷰포트와 artboard SVG 양쪽에 vector style을 적용한다. 정의 멤버를 교체할 때 사라진 멤버의 override는 제거한다. 기존 ID 없는 파일은 계속 읽으며 ID를 재구성하는 `update-block` 뒤 새 계약을 쓸 수 있다. 문서 포맷 버전은 바꾸지 않았다.

## 검증

- 전체 Node: **825 tests / 54 suites**, fail·skip 0. `apps/web/tests/**/*.test.ts`와 root 테스트를 포함한다. 기존 debug override fixture의 누락된 `fillGradient`를 보완하고 실제 렌더 결과를 검사한다.
- native Edge/CDP: `artboardsWorkflow` **31**, `explodeBlock` **18**, `componentsWorkflow` **13**, `sessionContinuity` **24** checks 통과. 다중 보드 삭제→Undo/Redo 활성 선택, 블록 검토 중 캔버스 단축키, 체크박스 포커스 Undo, 기존 컴포넌트·History 흐름을 포함한다.
- TypeScript `tsc -b`, architecture/import·문서 링크 **385 modules**, production Vite build 통과. main 1,147.14 kB / gzip 346.86 kB, viewport 655.65 kB / gzip 178.06 kB. 기존 큰 chunk 경고는 남는다.

## 남은 범위

이번 override는 **정의 멤버의 vector style**이다. 배치 인스턴스별 override/variant와 기존 ID 없는 정의를 자동 추론하는 마이그레이션은 포함하지 않는다. Gradient는 모델 검증은 있지만 뷰포트가 첫 stop 색으로 표시하고 SVG는 fill을 출력하지 않으므로 G2 표현/출력 후속으로 남긴다. 아트보드 SVG의 기울어진 평면 변환, 전체 도구의 공통 session owner, 대형 문서 성능 및 실무자 재시도 평가는 별도 검증이 필요하다. 이번 검수는 전체 browser suite가 아니라 위 네 과제의 표적 회귀다.
