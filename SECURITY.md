# 보안 정책 (SECURITY)

갱신: 2026-11-01. 대상: Agent WebCAD 저장소(`origin`: `ryujungho2-collab/webcad`) 의 `main`. 점검·배포 절차는 [QA·보안·배포 체크리스트](docs/QA-SECURITY-DEPLOY-CHECKLIST.md)가 소유한다. 이 문서는 정책과 위협 목록만 둔다.

## 1. 취약점 신고 경로

1. **우선:** GitHub 저장소의 *Security* 탭 → *Report a vulnerability*(비공개 취약점 신고). 기능 설명은 [GitHub 문서](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)를 따른다. 저장소 설정에서 이 기능을 켜 두었는지는 **아직 확인하지 않았다**(체크리스트 §D 항목).
2. 이 기능이 꺼져 있으면 공개 Issue에 재현 절차·악성 파일을 올리지 말고, 저장소 소유자에게 비공개로 연락해 달라고 요청하는 제목만 Issue로 남긴다. 연락 이메일은 소유자가 정해 이 절에 추가한다(미정).
3. 신고에 넣을 것: 영향 받는 파일/기능, 재현 절차, 최소 재현 입력(DXF·gateway 응답 등), 브라우저·버전, 예상 영향.
4. 응답 목표(내부 기준, 약속 아님): 접수 확인 3영업일, 영향 판단 7일, 수정 일정 통보 14일.

## 2. 지원 범위

| 구분 | 범위 |
| --- | --- |
| 지원 버전 | `main` 브랜치의 최신 커밋만. 릴리스 태그·장기 지원 브랜치는 없다. |
| 범위 안 | `apps/web`(브라우저 앱, Worker 포함), `packages/*`(문서·명령·히스토리·kernel), DXF/JSON/이미지/GLB 가져오기, Copilot gateway 연결, 로컬 저장·복구 |
| 범위 밖 | 사용자가 직접 운영하는 Copilot gateway 서버와 그 모델/API 키, 사용자 브라우저·OS 취약점, `node_modules` 안의 서드파티 코드 자체(상위 프로젝트에 신고), 서비스 거부(대용량 문서로 느려짐)만 있는 보고는 한도 우회가 있을 때만 취급 |
| 데이터 모델 | 서버가 없는 로컬 우선 앱이다. 계정·서버 저장소·결제 정보가 없다. 문서는 이 브라우저의 저장소와 사용자가 내려받은 파일에만 있다. |

## 3. 의존성 감사 주기

- 패키지 관리자는 `pnpm`(`pnpm-lock.yaml`). 감사 명령은 `pnpm audit --prod`(런타임 의존성)와 `pnpm audit`(전체)이다. 근거: [pnpm audit](https://pnpm.io/cli/audit), 동일한 npm 보안 권고 데이터를 쓰는 [npm audit](https://docs.npmjs.com/cli/v10/commands/npm-audit).- **주기:** (1) 배포·마일스톤 마감 전마다, (2) 그 외 **월 1회**, (3) 런타임 의존성(`react`, `react-dom`, `three`, `fflate`, `utif`, `vite` 번들에 포함되는 것)에 high/critical 권고가 공개되면 **즉시**. 근거: [OWASP Vulnerable Dependency Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerable_Dependency_Management_Cheat_Sheet.html), [OWASP Top 10:2021 A06 Vulnerable and Outdated Components](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/).
- 처리 기준: critical/high는 수정·우회 또는 위험 수용 사유를 기록하기 전에 배포하지 않는다. moderate/low는 다음 월간 점검에서 처리한다. 결과(날짜·명령·건수)는 [검증 기록](docs/verification/README.md)에 남긴다.
- `pnpm-workspace.yaml`의 `allowBuilds`에서 `esbuild: false`다. 새 의존성을 추가할 때 설치 스크립트(postinstall) 허용 여부를 따로 검토한다.
- 이 문서를 쓰는 시점에 `pnpm audit`는 **실행하지 못했다**(실행 승인이 없었음). 현재 취약점 건수는 미확인이다.

## 4. 외부 입력 위협 목록

신뢰하지 않는 입력의 경계는 두 곳이다. 아래는 코드를 읽고 작성한 것이며, 각 방어가 실제로 동작하는지는 해당 테스트로 따로 확인해야 한다.

### 4.1 `apps/web/src/copilot/copilotConnection.ts` — Copilot gateway 연결

입력: 사용자가 설정한 gateway URL, gateway가 돌려주는 JSON(계획·tool call·clarification·`run` 메타데이터). gateway와 모델 출력은 **신뢰하지 않는 입력**으로 취급한다.

| ID | 위협 | 현재 코드의 방어 | 남은 위험·확인 항목 |
| --- | --- | --- | --- |
| C1 | URL에 자격 증명·쿼리·프래그먼트를 넣어 비밀이 노출되거나 저장됨 | `validateCopilotEndpoint`가 username/password/hash/search를 거부한다. 키는 CAD 문서에 저장하지 않는다. | 사용자가 gateway 인증을 어떻게 하는지는 앱 밖이다. |
| C2 | 평문 HTTP·다운그레이드 | HTTPS만 허용, HTTP는 `localhost`·`127.0.0.1`·`[::1]`만 허용. `credentials:"omit"`, `redirect:"error"`로 쿠키 전송과 리다이렉트 추종을 막는다. | 브라우저 CORS는 gateway가 소유한다. 사설망 IP(예: 192.168.x.x)는 HTTPS면 허용된다 — 의도인지 소유자 확인 필요. |
| C3 | 거대·느린 응답으로 메모리·UI 정지 | 응답 64 KiB 제한(`MAX_BYTES`, content-length와 스트림 크기 양쪽), 기본 30초(최대 180초) 타임아웃, AbortSignal, 오류 본문 4 KiB 제한. | 한도는 코드 상수이므로 변경 시 이 표를 갱신한다. |
| C4 | 잘못된 형식·비 UTF-8·비 JSON 응답 | `content-type`이 `application/json`인지 확인, `TextDecoder` fatal 모드, `JSON.parse` 실패는 사용자 메시지로 변환한다. | — |
| C5 | gateway가 임의 명령·참조 필드를 끼워 넣어 문서를 변조 | `validateCopilotResponse`가 허용 필드 목록(`supportedFields`), 명령 종류(create-drawing·create-primitive·move-object 등), 명령 최대 20개, 유한 숫자, 요약 문구 길이를 검사하고 `validateCommand`를 통과해야 한다. 서버가 보낸 ghost/HTML/script 필드는 무시하고 미리보기는 검증된 명령에서만 만든다. 문서에는 Review→Apply 후에만 반영된다. | 자동 Apply 경로가 추가되면 이 방어가 무너진다. 추가 시 신규 위협으로 재검토. |
| C6 | 프롬프트 주입으로 모델이 의도 밖 도구를 호출 | tool call은 `validateCadToolCalls`로 검증, 읽기/수정 혼합 금지, 읽기 라운드 4회·라운드당 8호출·전체 64 KiB 제한, 호출 ID 중복 금지, 반복 거부 제안 중단. | 모델이 읽은 문서 이름·텍스트가 다시 프롬프트에 들어간다(간접 주입). 수정은 항상 사용자 Review를 거치는지 UI 점검으로 확인한다. |
| C7 | 문서 내용이 gateway로 유출 | 요청에는 선택 객체 최대 50개, 이름 200자 제한 등 필요한 컨텍스트만 보낸다. 프롬프트는 4000자 제한. | 문서 내용은 사용자가 지정한 gateway로 전송된다. 사용자가 신뢰하는 gateway만 연결하도록 UI 안내가 필요하다(QA 체크리스트 §B). |
| C8 | `localStorage`의 변조된 설정 | `copilotSettings.ts`(인접 파일)가 읽을 때 모드·길이·모델명 정규식·endpoint를 다시 검증한다. | — |

근거: [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)(프롬프트 주입, 출력의 부적절한 처리, 무제한 소비), [OWASP Top 10:2021 A10 SSRF](https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/)·[A08 Software and Data Integrity Failures](https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/), [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html).

### 4.2 `apps/web/src/interop/dxfParser.ts` — DXF 가져오기

입력: 사용자가 고른 `.dxf` 텍스트 전체. 출처가 불명한 CAD 파일은 **신뢰하지 않는 파일**이다.

| ID | 위협 | 현재 코드의 방어 | 남은 위험·확인 항목 |
| --- | --- | --- | --- |
| D1 | 대용량 파일로 메모리·UI 정지 | 파서 자체에는 크기 제한이 없다. 호출자 `App.tsx`의 `handleImportDxfFile`이 **20 MiB 초과를 거부**하고, 읽는 동안 문서가 바뀌면 중단한다. | 파서를 다른 경로에서 직접 호출하면 한도가 없다. 현재 호출처는 `App.tsx`·`dxfImport.ts`(후자는 `planDxfImport`, 크기 확인 없음). 엔티티 수 상한도 파서에는 없다. |
| D2 | 형식 오류 입력(홀수 줄, 숫자 아닌 코드, NaN/빈 좌표) | `pairs`는 정수 아닌 그룹 코드를 건너뛰고, 엔티티별로 유한 숫자·양의 반지름·꼭짓점 수·bulge 일치를 검사해 경고와 함께 건너뛴다. 예외는 `planDxfImport`에서 "Could not parse" 결과로 변환한다. | 퍼저로 확인하지 않았다. 처리 시간이 입력에 대해 선형인지 측정 기록이 없다. |
| D3 | 지원하지 않는 의미(두께·OCS·배열·속성·메시)를 조용히 잘못 가져옴 | 해당 엔티티는 **경고와 함께 건너뛴다**(`Unsupported DXF entity …; skipped.`). 변환 손실은 `curveConversions`와 검토 대화상자에 표시된다. | 경고 문구가 검토 UI에 실제로 보이는지 QA §C에서 확인. |
| D4 | 블록 이름·INSERT 악용(이름 충돌, 자기 참조, 깊은 중첩) | 블록은 이름 키로 저장되며 같은 이름은 마지막 정의가 덮어쓴다. INSERT 배열·0 배율은 거부한다. | 순환 참조·중첩 깊이 제한은 파서가 아니라 후속 `prepareDxf`/`planParsedDxfImport`에서 다뤄야 한다 — 이 점검은 **하지 않았다**. `blocks`는 일반 객체(`{}`)이므로 `__proto__` 같은 블록 이름 처리도 미확인(`Object.create(null)`/`Map` 사용 권장). |
| D5 | 텍스트에 포함된 스크립트·HTML | TEXT/MTEXT는 평문으로 평탄화한다. `\U+XXXX`는 문자로만 변환한다. | 이 텍스트를 DOM에 `innerHTML`로 넣는 경로가 있으면 XSS가 된다. React 기본 이스케이프를 우회하지 않는지(`dangerouslySetInnerHTML` 검색) 체크리스트 §B에서 확인. |
| D6 | 단위 오해로 1000배 크기 오류 | `$INSUNITS`를 읽고 모르는 값은 경고 후 mm로 가정한다. | 가정 사실이 검토 화면에 표시되는지 확인. |
| D7 | 레이어·블록 이름 길이/문자 | 이름은 그대로 읽는다(길이 제한 없음). | 문서 모델이 이름 길이를 제한하는지는 미확인. |

근거: [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)(허용 목록 검증·길이/범위 제한), [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)(파일 크기 제한·내용 검증), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)의 입력 검증·파일 처리 요구 항목.

## 5. 이 정책이 보장하지 않는 것

- 이 문서의 방어 설명은 코드 읽기 기준이며 침투 테스트·퍼징 결과가 아니다.
- OWASP 문서는 일반 지침이다. 본 프로젝트 인증이나 준수 확인을 뜻하지 않는다.
- 위 링크는 작성 시점에 주소만 기재했고, 본문 변경 여부는 열람해 확인하지 못했다. 링크가 깨지면 해당 OWASP·npm·pnpm 사이트에서 제목으로 검색한다.
