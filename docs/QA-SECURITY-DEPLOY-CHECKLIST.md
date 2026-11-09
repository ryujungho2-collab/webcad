# QA·보안·배포 체크리스트

갱신: 2026-11-01. [문서 안내](README.md) · [보안 정책](../SECURITY.md) · [기능 가이드](features/README.md)

배포나 마일스톤 마감 전에 위에서 아래로 한 번 확인한다. 항목마다 **날짜·확인한 사람·결과**를 [검증 기록](verification/README.md)에 남긴다. 확인하지 않은 항목은 "미확인"으로 적고 통과로 쓰지 않는다. 이 문서는 점검 항목만 소유하며 기능 설명은 복사하지 않고 [기능 가이드](features/README.md)로 연결한다.

## A. 자동 검증 (명령)

작업 폴더 루트에서 실행한다. 명령은 `apps/web/package.json`의 scripts 기준이다.

- [ ] `pnpm build` — 전체 패키지 타입 검사·빌드 통과
- [ ] `pnpm --filter @agent-webcad/web test` — node 테스트 통과
- [ ] `pnpm --filter @agent-webcad/web check:architecture` — 의존 방향과 **문서 상대 링크**(루트 `*.md`, `docs/**/*.md`) 통과
- [ ] `pnpm --filter @agent-webcad/web test:browser` — 실제 브라우저 상호작용 검사 통과
- [ ] 위 로그를 커밋 대상이 아닌 `output-*.log` 대신 검증 기록에 요약으로 남겼다 (`*.log`는 `.gitignore` 대상)

## B. 보안 점검

위협 ID는 [SECURITY.md §4](../SECURITY.md)를 가리킨다.

- [ ] `pnpm audit --prod` 실행, high/critical 0건이거나 위험 수용 사유를 기록했다 (SECURITY.md §3)
- [ ] `pnpm audit` 전체(개발 의존성) 결과를 기록했다 (배포 산출물에 포함되지 않으면 기록만)
- [ ] 새 런타임 의존성이 추가되었다면 라이선스([licenses](licenses/))와 설치 스크립트 여부를 확인했다
- [ ] `apps/web/src`에서 `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` 사용처를 검색해 신뢰하지 않는 입력(DXF 텍스트·gateway 요약·파일명)이 닿지 않음을 확인했다 (D5)
- [ ] Copilot: 자격 증명·쿼리가 든 URL, 평문 `http://example.com` 주소가 연결 설정에서 거부되는지 직접 입력해 확인했다 (C1·C2)
- [ ] Copilot: 64 KiB 초과 응답, 비 JSON 응답, 알 수 없는 필드가 든 명령을 돌려주는 가짜 gateway로 거부 메시지를 확인했다 (C3·C4·C5)
- [ ] Copilot: 모델 제안은 Review를 거치기 전에 문서를 바꾸지 않는다 — Plan 후 Undo 목록·revision이 그대로인지 확인했다 (C5·C6)
- [ ] Copilot 설정 화면이 문서 내용이 사용자 지정 gateway로 전송된다는 점을 사용자에게 알리는지 확인했다 (C7)
- [ ] DXF: 20 MiB 초과 파일이 거부되는지, 깨진 DXF(홀수 줄, 숫자 아닌 좌표, 빈 파일)에서 앱이 멈추지 않고 메시지가 나오는지 확인했다 (D1·D2)
- [ ] DXF: 지원하지 않는 엔티티(예: 3DSOLID, 두께가 있는 선)를 넣으면 검토 화면에 건너뜀 경고가 보이는지 확인했다 (D3)
- [ ] DXF: 블록 순환 참조와 `__proto__`라는 이름의 블록/레이어를 가진 파일로 처리 시간이 유한하고 앱이 정상인지 확인했다 (D4)
- [ ] 저장소에 `.env`, 키, 토큰이 올라가지 않았다 (`.gitignore`의 `.env*` 확인 + 변경 목록 점검)

## C. 화면 인터랙션 합격 기준

화면 담당(시사)가 정한 기준을 이 절에 합쳐야 한다. 아래는 현재 기능 가이드([상태와 키보드](features/INPUT-ACCESSIBILITY.md), [프로젝트와 저장](features/PROJECTS.md))에서 뽑은 **초안**이며, 시사의 기준이 이 문서에 전달되지 않아 확정본이 아니다. 시사의 항목으로 교체·추가하고 이 문단을 지운다.

합격이면 체크하고 실패하면 재현 절차를 적는다. 입력은 실제 pointer·키보드로 한다 (DOM 값 직접 주입은 증거가 아니다).

**키보드·포커스**
- [ ] Ctrl+K로 명령 검색이 열리고, 위/아래·Enter로 실행되며, Esc로 닫으면 호출 지점으로 포커스가 돌아온다
- [ ] 메뉴·팝오버는 Esc로 닫히고 CAD 선택이 해제되지 않는다
- [ ] 모든 버튼·입력에서 포커스 테두리가 보이고, modal 안에서 Tab이 밖으로 새지 않으며, 닫을 때 다른 컨트롤이 받은 포커스를 빼앗지 않는다
- [ ] 한글 IME 조합 중(및 keyCode 229) 전역 단축키(Ctrl+Z 등)·명령 실행이 가로채지 않는다

**상태·피드백**
- [ ] 저장 상태(로컬 저장/다운로드)가 색상과 문구로 함께 구분된다. 실패하면 **Retry local save**가 보인다
- [ ] 기하 작업 진행은 실제 단계 이름으로 표시되고, **Cancel tasks** 후 새 명령을 실행할 수 있다. 취소는 완료된 편집을 되돌리지 않는다
- [ ] 오류 메시지는 원인과 다음 행동(예: "Plan again", "Choose the file again")을 말한다

**되돌리기·미리보기**
- [ ] Review/Preview 중에는 문서 revision·History가 늘지 않고, Apply 후에만 한 번의 Undo 단위로 들어간다
- [ ] 입력·대상·문서가 바뀌면 이전 Review가 무효가 되어 다시 만들어야 한다
- [ ] 잠긴 레이어/객체는 적용 전에 이유가 보인다

**화면 크기**
- [ ] 960px 폭과 640×667 CSS px 150% 상당 화면에서 하단 상태줄·팝오버가 화면 안에 들어오고 정밀 설정이 가로 스크롤된다
- [ ] 콘솔(브라우저 개발자 도구)에 오류·경고가 새로 생기지 않았다

범위 밖(현재 검증하지 않음): 스크린리더 실제 음성, 모든 OS/브라우저, 접근성 표준 인증 ([상태와 키보드](features/INPUT-ACCESSIBILITY.md) 지원 경계와 동일).

## D. 배포 점검

이 저장소에는 `.github/` 가 없고 CI 설정은 별도 담당이다. 이 절은 수동 확인만 다룬다.

- [ ] 배포 대상 커밋이 `main`이고 위 A·B·C 결과를 검증 기록에 남겼다
- [ ] 로컬 실행 경로 확인: `Start-AgentWebCAD.vbs` 또는 `pnpm --filter @agent-webcad/web dev --host 127.0.0.1`이 `http://127.0.0.1:5173/`에서 열린다
- [ ] 정적 배포를 한다면 `pnpm --filter @agent-webcad/web build` 산출물(`apps/web/dist`)을 `preview`로 열어 Worker·WASM 로딩과 새로고침 후 복구를 확인했다
- [ ] 정적 호스팅이면 응답 헤더에 `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`를 설정했다 (`connect-src`에 사용자가 쓰는 gateway 주소 필요 여부 검토) — 근거: [OWASP Top 10:2021 A05 Security Misconfiguration](https://owasp.org/Top10/A05_2021-Security_Misconfiguration/)
- [ ] 저장소의 *Security → Private vulnerability reporting*이 켜져 있다 (SECURITY.md §1)
- [ ] 알려진 한계·미확인 항목을 릴리스 노트에 적었다

## E. docs/features 가이드 정합성 확인

기능 가이드는 [현재 사용법·지원 범위의 기준](features/README.md)이다. 코드가 바뀌면 같은 변경에서 해당 가이드를 고쳤는지 확인한다.

- [ ] `docs/features/README.md` 표의 모든 대표 문서가 실제 파일로 열린다 (`check:architecture`가 상대 링크를 검사하지만 **표에 없는 가이드**는 잡지 못한다 — `docs/features/*.md` 목록과 표를 눈으로 대조한다. 현재 `CANVASES.md`·`REUSABLE-LIBRARY.md`는 표 밖 글머리 링크로만 연결되어 있다)
- [ ] 이번 변경이 건드린 기능마다 해당 가이드의 버튼 이름·단축키·한도(예: DXF 20 MiB, gateway 64 KiB, 명령 20개)가 코드와 같다. 코드 상수와 가이드 숫자를 `grep`으로 대조한다
- [ ] 가이드의 화면 라벨(예: **Save locally**, **Cancel tasks**, **Retry local save**, **Download WebCAD file**)이 `apps/web/src`의 실제 `aria-label`/버튼 문구와 일치한다
- [ ] 지원/미지원 경계가 바뀌었다면 "지원 경계" 절을 갱신했고, 과거 한계는 날짜와 함께 구현·검증 기록에 남겼다
- [ ] 가이드끼리 절차를 복사하지 않고 링크로 연결했다 (규칙: [features/README](features/README.md#설명을-한곳에-유지하는-방법))
- [ ] 계획·상태 문서([NEXT-STEPS](../NEXT-STEPS.md), [PROJECT-STATE](../PROJECT-STATE.md))에 사용법을 다시 쓰지 않았다
- [ ] 새 문서를 만들었다면 해당 폴더 README 색인과 [문서 안내](README.md)에 등록했다
- [ ] `pnpm --filter @agent-webcad/web check:architecture`로 문서 링크가 끊기지 않았다

## F. 결과 기록 양식

```
날짜:
커밋/작업 상태:
수행자:
A. 자동 검증:   통과 / 실패(로그) / 미확인
B. 보안 점검:   (미확인 항목 나열)
C. 화면 합격:   (실패 재현 절차)
D. 배포 점검:
E. 문서 정합성:
알려진 한계:
```
