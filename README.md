# Agent WebCAD

정밀한 기하·구속·저장 관계를 바탕으로 그리기, 직접 편집, 파라메트릭 설계를 연결하는 웹 CAD이다. 필요한 기능을 편하게 이어서 작업을 끝내는 경험을 목표로 한다. 현재 사용법과 지원 범위는 [기능별 가이드](docs/features/README.md)에 기록한다.

확장 목표는 CAD·벡터·이미지·레이아웃이 문서·선택·명령·이력을 공유하는 통합 제작 엔진이다. **[NEXT-STEPS 통합 안내](NEXT-STEPS.md)**에서 기능별 가이드·계획·진행 상태·검증 근거와 다음 작업을 함께 찾는다.

## 시작

```sh
pnpm install
pnpm --filter @agent-webcad/web dev
```

패키지 관리 도구 버전은 루트 `package.json`의 `packageManager`를 따른다. 의존 패키지의 설치 스크립트 허용 설정은 `pnpm-workspace.yaml`에 있다.

## 확인

```sh
pnpm --filter @agent-webcad/web exec tsc -b
pnpm --filter @agent-webcad/web test
pnpm --filter @agent-webcad/web check:architecture
pnpm --filter @agent-webcad/web test:browser -- --artifacts
pnpm build
```

Node 테스트는 기하·명령·문서 관계와 실패 원자성을 검사한다. 브라우저 검사는 React, Worker와 네이티브 입력을 사용하며 로컬 Chromium 계열 브라우저가 필요하다. `CAD_TEST_BROWSER`로 실행 파일을 지정할 수 있다. 브라우저 테스트는 Node 테스트와 별도로 실행해야 한다.

## 구조와 문서

- [현재 상태](PROJECT-STATE.md)와 [다음 작업](NEXT-STEPS.md): 재시작할 때 먼저 읽는 최신 기록.
- [초기 기획·공통 검증 계약](docs/IMPLEMENTATION-READINESS-2026-10-05.md): G0–G6 설계·인계 이력. 현재 실행 순서는 NEXT-STEPS를 따른다.
- [계획서 정합성 정리](docs/reviews/PLAN-CONSISTENCY-2026-10-17.md): 완료 범위·대기 카드·다음 WF-Q1과 문서별 근거.
- [수정 위치·영향·문서 역할](docs/architecture/CHANGE-GUIDE.md): 무엇을 고치면 어떤 동작이 바뀌고, 어떤 테스트와 문서를 함께 확인하는지 찾는 지도.
- [디렉토리와 의존 규칙](docs/architecture/DIRECTORY-STRUCTURE.md): 기능 추가 위치와 공용 경계.
- [문서 안내](docs/README.md): 목적별 진입점과 분류별 전체 색인.
- [기능별 가이드](docs/features/README.md): 현재 사용법·지원 범위의 기준.
- [구현 기록](docs/implementation/README.md), [검증·측정](docs/verification/README.md), [리뷰·감사](docs/reviews/README.md): 날짜별 설계·실행 근거.
- [실행·문서 이력](docs/history/README.md): 루트에서 분리한 상세 기록과 초기 인계.

`apps/web`는 화면과 애플리케이션, `packages`는 공유 문서·명령·기하·커널·이력 계약을 담는다. `output`은 검토 가능한 결과물, `artifacts`는 기존 측정 기록, `tmp`는 임시 로그와 로컬 작업 파일이다.
