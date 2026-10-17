# 디렉토리 구조와 의존 규칙

2026-10-05. 폴더 변경의 기준은 **함께 변경되는 책임을 모으고, 공용 계산을 화면·라이브 상태에서 분리하는 것**이다. 기존 패키지 경계는 유지하며, 첫 기능 묶음으로 도면 편집을 정리했다. 문제별 수정 위치·영향·테스트·문서 역할은 [CHANGE-GUIDE](CHANGE-GUIDE.md)를 따른다.

```text
agent-webcad/
├─ README.md / PROJECT-STATE.md / NEXT-STEPS.md
├─ apps/web/
│  ├─ src/
│  │  ├─ features/drawing-editing/
│  │  │  ├─ contracts.ts          # Canvas와 도구가 공유하는 타입
│  │  │  ├─ registerCommands.ts   # 명령 등록의 단일 진입점
│  │  │  ├─ geometry/            # 데이터 입력 → 정확한 계산 결과
│  │  │  ├─ commands/            # 전달받은 문서의 정책 검증·변경
│  │  │  └─ ui/                  # 입력·미리보기·적용·결과 인계
│  │  ├─ precision/              # 작업면·좌표·위상·스냅·공통 계산
│  │  ├─ state/                  # 세션·트랜잭션·문서 계획·이력
│  │  ├─ viewport/               # 렌더러·카메라·캔버스 호스트(WebGL 현재, WebGPU adapter 목표)
│  │  ├─ cad/                    # 커널 서비스·Worker 통신
│  │  └─ ...                     # 기존 UI·교환·출력 기능
│  ├─ tests/
│  │  ├─ drawing-editing/        # 이동한 도면 편집 Node 회귀 검사
│  │  ├─ helpers/                # 문서 fixture·브라우저 검사 도우미
│  │  └─ *.browser.html/tsx      # 현재 브라우저 검사 진입점
│  └─ scripts/                   # 브라우저·측정·아키텍처 검사
├─ packages/
│  ├─ cad-document/              # 저장 모델·구속·파생 정의·직렬화
│  ├─ cad-commands/              # 공개 명령·검증·결과 계약
│  ├─ cad-geometry/              # registry/ID·TopologyMap 골격; 실제 solver는 웹 precision
│  ├─ cad-kernel/                # 솔리드 연산·메쉬·커널 런타임
│  └─ cad-history/               # 이력 계약
├─ docs/README.md               # 목적별 진입점과 분류 안내
├─ docs/features/               # 현재 기능 설명의 대표 문서·범위 소유권
├─ docs/{product,architecture,implementation,verification,reviews}/
│                               # 폴더별 README 전체 색인
├─ docs/history/                # 분리한 상태·실행 큐·문서 안내 이력
├─ docs/fixtures/               # 문서용 재현 입력
├─ output/                      # 이미지·PDF 등 검토 결과물
├─ artifacts/                   # 기존 측정 데이터
└─ tmp/                         # 무시되는 임시 로그·작업 파일
```

## 허용되는 의존 방향

- `geometry`와 `precision`은 패키지의 데이터 계약, `three`의 계산 기능과 공용 계산만 참조한다. `state`, React, 도구 UI, 라이브 문서를 참조하지 않는다. 변환 fallback 함수는 `precision/objectTransform.ts`로 이동했다.
- `commands`는 명령과 문서를 인수로 받는다. 기하 계산과 정책 검증을 수행하고 전달된 트랜잭션 문서만 바꾼다. 라이브 문서 singleton, Preview/Apply, 이력을 가져오지 않는다.
- `ui`는 공용 Preview/Apply를 통해 변경한다. JSX 안에서 별도 기하 알고리즘을 만들지 않는다. `viewport`는 카메라·투영·프레이밍과 세션을 도구에 제공한다.
- `contracts.ts`는 타입만 담는다. App, Ribbon, AppShell은 도구 구현에서 타입을 가져오지 않는다.
- 명령·UI·기하를 한 런타임 barrel에서 재수출하지 않는다. 명령만 필요한 호출자가 React나 렌더러를 가져오게 하지 않는다. 등록은 `registerCommands.ts`, 세션은 `contracts.ts`, 계산은 개별 `geometry` 모듈을 사용한다.
- 치수 생성·표시 수정 명령은 `state/registerDimensionCommandHandlers.ts`로 분리했다. 도면 편집 등록이 치수 명령까지 소유하지 않는다.

`pnpm --filter @agent-webcad/web check:architecture`가 소스와 테스트의 상대 import, 공용 계산의 의존 방향·런타임 순환, 명령 어댑터의 경계, 타입 계약과 로컬 문서 링크를 검사한다. 같은 검사와 규칙의 부정 사례가 Node 테스트에 포함된다. 이 검사는 전체 애플리케이션의 순환 참조, WebGPU 지원 여부, 메모리 예산이나 번들 크기를 평가하는 도구는 아니다. 런타임 자원 변경은 [웹 런타임 자원 전략](WEB-RUNTIME-RESOURCE-STRATEGY.md)의 별도 측정으로 검증한다.

현재 Query/Plans/명령 handler/스케치 solver는 여전히 `apps/web/src`에 있다. 독립 headless 엔진과 `integrations/*` 확장은 목표 구조이며 이미 분리된 패키지가 아니다. `cad-kernel`은 OpenCascade에 의존한다. 외부 의존 최소화는 선택적 제작 패키지가 저장·명령 계약으로 퍼지지 않도록 하는 원칙이며, 커널까지 외부 의존이 전혀 없다는 뜻은 아니다.

## 추가할 때의 기준

닫힌 윤곽 수정은 이 기능의 `geometry`, `commands`, `ui`, `tests/drawing-editing`을 함께 확장했다. 교점/구간/브리지는 기하, 참조 선택·재연결 정책은 명령 어댑터, 안정된 치수 모서리 해석은 공용 `precision/dimensionSource.ts`에 둔다. 스케치·작도·패턴·치수는 각자의 소유 관계와 세션이 충분히 분리됐을 때 같은 구조로 추출한다. 이름만 바꾸는 전체 폴더 이동은 진행하지 않는다.

App의 도구 시작·결과 인계와 CadViewport의 입력·카메라·렌더링 책임은 아직 크다. 다음 추출은 **한 세션 호스트와 입력 수명 주기**부터 하며, 종료/취소/문서 교체/도구 전환 브라우저 과제를 먼저 둔다. `commandBus`의 트랜잭션·재생성은 공용 진입점에 남기고 도메인별 등록을 점진적으로 분리한다.

노드·AI는 같은 공개 명령과 문서 계획을 사용한다. mesh·BIM 확장도 기존 문서/커널 계약을 재사용하며, 화면 도구 내부에 새 문서 원본을 만들지 않는다.

## 화면 표현 원칙

초기 화면 작업 문서에서 계속 적용할 원칙을 여기에 통합했다. 색상·타이포그래피·밀도·패널 크기는 `src/ui`의 공용 토큰과 스타일로 관리하며 캔버스가 작업의 중심이어야 한다. 단위·축·선택·잠금·활성 도구와 키보드 포커스를 분명하게 표시한다.

NumericField 등 공용 입력은 원본 값을 표시 반올림으로 덮어쓰지 않는다. 제공하는 버튼은 실제 명령/사용 가능 조건과 연결한다. 색상·아이콘·레이아웃 개선과 기하/커널/문서 계약 변경을 구분해 검수한다. 초기 수동 화면 검사의 raw git status와 과거 build 출력은 최신 회귀 근거로 유지하지 않는다.
