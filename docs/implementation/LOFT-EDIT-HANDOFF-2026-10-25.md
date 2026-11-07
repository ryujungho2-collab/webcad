# 로프트 연결 방식 왕복 편집과 사람·자연어·MCP 인계

2026-10-25. 기존 live 로프트의 단면 사이 직선 연결(ruled)과 부드러운 보간(smooth)을 같은 객체에서 왕복 편집한다. 원본 단면 순서·객체 ID·배치·마감을 유지한다. [제품 목적](../product/NATURAL-LANGUAGE-CAD-PURPOSE-2026-10-19.md)에 쉬운 직접 조작과 자연어/MCP 인계를 모든 편집의 개발 기준으로 추가했다.

## 조작

- 로프트 하나 선택 → 속성의 **Sweep / Loft → 부드러운 곡면으로 / 직선 연결로** → 실제 변경 미리보기 → Apply.
- 코파일럿: `선택한 로프트를 부드러운 곡면으로 바꿔줘`, `선택한 곡면을 직선 연결로 바꿔줘`.
- Shared CAD tool의 **Change loft connection**에서 기존 선택과 연결 방식을 검토한다.
- MCP `solid.loft.update`에 현재 `cad.context`의 `_context`, `objectId`, `ruled`를 전달한다. 화면 Apply에서 게시한다.

모든 경로는 `solid.loft.update → update-loft → native validation → detached preview → Apply`를 공유한다. 종속 형상은 기존 재생성 트랜잭션에서 처리한다. 잠김·오선택·소유 관계·스냅샷 로프트·무변경 제안은 차단하고 오래된 미리보기는 게시하지 않는다. 도구 추가 후 canonical 40개 / MCP 43개(bridge 3개 포함), 사람 공통 폼 14종이다.

## 검증

- `loftEdit.test.ts` 4개: 서로 다른 반지름의 원 단면 3개를 사용한다. ruled 체적은 두 원뿔대의 독립 계산식과 대조하고 smooth의 유효성과 실제 체적 차이를 확인한다. 배치·마감·ID·순서 보존, 정확한 왕복, Undo/Redo, 직렬화/재열기, 원본 수정 후 live 재생성, 잠김·stale 차단과 공식 MCP SDK→실제 runtime을 검사한다.
- 기존 로프트/스윕·도구·MCP 회귀를 포함한 대상 Node 검사 34개 통과.
- 실제 Chrome UI/Worker 13개: 속성 버튼 → 자연어로 역변환 → stdio MCP로 재변환 → 사람 공통 폼 → 속성 재편집 → 저장/재열기. 모델 응답 mock 없이 로컬 명시 문법과 실제 SDK MCP stdio를 사용했다. 자유 문장 모델 성능 검증은 아니다.
- TypeScript/Vite 빌드 및 architecture 검사 통과. 기존 큰 chunk 경고는 유지된다.

결과: 브라우저 보고서 (local-only, not in repository: `output/verification/loft-edit/browser-report.json`), 화면 (local-only, not in repository: `output/verification/loft-edit/loft.png`), 편집 가능한 문서 (local-only, not in repository: `output/verification/loft-edit/loft.webcad.json`).

## 지원 경계

원본이 유지된 live 로프트의 연결 방식 편집이다. 임의 box/mesh/면을 자유곡면으로 바꾸는 기능이나 곡선 벽 변환은 포함하지 않는다. 단면이 두 개이면 두 방식의 형상이 같을 수 있다. smooth는 특정 G1/G2/C2 연속성 등급을 보증하는 옵션이 아니다. 임의 면의 직접 변형·제어점 cage 편집은 후속 기능으로 판단한다.
