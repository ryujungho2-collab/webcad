# G3-1 이미지 workflow 검수

> **현재 기능 설명:** [이미지와 장면](../features/IMAGES-SCENES.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

실행일: 2026-10-05. 범위는 이미지 source import·placement·크기/crop review·artboard SVG·저장/복구 왕복이다. 최신 전체 기준은 [PROJECT-STATE](../../PROJECT-STATE.md), 기능·제한은 [G3-1 구현](../implementation/G3-IMAGE-ASSET-2026-10-05.md)을 따른다.

## 결과

| 검사 | 결과 |
| --- | --- |
| `pnpm --filter @agent-webcad/web exec tsc -b` | 통과 |
| `pnpm --filter @agent-webcad/web test` | 571 tests, 53 suites 통과; 실패/skip 0 |
| `pnpm --filter @agent-webcad/web check:architecture` | 263 modules 및 문서 링크 통과 |
| `pnpm --filter @agent-webcad/web test:browser` | 26 workflows, 532 UI/Worker checks 통과 |
| `pnpm build` | 전체 workspace production build 통과 |

이미지 전용 Node 4개 검사는 immutable source와 복수 placement 공유, crop preview 비변경/Apply 한 번/Undo/Redo/v8 save-reload, 잠금·손상 참조 거부와 마지막 참조 정리, recovery bytes current/backup 비중복, SVG crop/board clip을 확인한다. 실제 browser `imageWorkflow` 14개 검사는 File 메뉴를 사용해 브라우저로 만든 PNG를 가져오고, 잘못된 숫자로 오래된 review 적용이 막히는지, 크기/crop preview 및 Cancel, Undo/Redo, artboard SVG 생성, 실제 페이지 reload 뒤 source/board/history 상태를 확인한다. runner는 픽셀 fixture를 자체 생성하므로 외부 이미지 파일이 필요하지 않다.

전체 browser suite 실행 환경에서는 pnpm workspace junction 접근을 제한된 프로세스가 읽지 못해, 기존 설치된 dependencies를 승인된 실행으로 사용했다. 먼저 `pnpm install --offline`은 lockfile/package를 변경하지 않고 이미 최신이라고 확인했다. 브라우저 테스트와 build는 모두 기존 의존성으로 정상 완료했다.

## Browser fixture 성능 표본

`imageWorkflow`가 생성한 PNG 128×128 한 장에 대해 전체 suite의 관측값:

| 단계 | 관측 |
| --- | ---: |
| PNG source bytes | 1,396 B |
| source pixels | 16,384 px |
| RGBA decoded-size estimate | 65,536 B |
| file import feedback | 4.7 ms |
| bitmap decode | 0.5 ms |
| crop input → preview-ready UI | 123.3 ms |
| Apply click → committed UI | 174.3 ms |
| artboard SVG generation | 0.8 ms |
| SVG output | 2,536 B |

각 숫자는 동일한 작은 fixture에서 한 번 기록한 browser 관측값이다. Preview/Apply 시간에는 테스트의 DOM polling/settling 및 입력 transport가 포함된 UI feedback timing이 있고, import/decode/SVG 값도 한 표본이다. p50/p95, 대형 raster·대형 문서 속도, 실제 JS heap/VRAM retained memory, user task time이나 G2 기준선과의 전후 비교로 해석하지 않는다. Decoded-size는 RGBA 폭×높이로 계산한 추정치일 뿐 메모리 프로파일 측정치가 아니다.

## Production build 관측

Vite 7.3.6 production build가 통과했다. minified main chunk는 948.96 kB, viewport chunk는 598.50 kB이며 500 kB 경고가 계속 발생했다. OpenCascade WASM은 50,305.13 kB raw / 13,955.45 kB gzip이다. 이 작업은 bundle split이나 WASM 용량을 개선하지 않았다.

## 사용자 UX 및 남은 한계

브라우저 검사는 유효 파일 선택 → 캔버스 배치/선택 → 정확한 입력 → crop preview → Apply/Cancel → SVG 결과 → reload/Undo/Redo를 실행했다. 외부 실무자 task time, 재시도, 사용 편의성이나 작업 효율은 측정하지 않았다.

입력 크기 제한은 초기 웹 문서 안전 예산이며 사진 워크플로에 충분하다는 증거가 아니다. 현재 crop은 수치 입력이며 캔버스 핸들 crop, 복제·정렬, mask/adjustment, PNG/PDF raster output은 미구현이다. Recovery는 asset source를 checkpoint 본문에 중복하지 않지만 브라우저별 localStorage 총량과 기존 데이터에 따른 저장 실패 가능성은 남는다. File save는 source를 self-contained로 포함한다. 다음 작업은 작은 image placement 복제·변환·정렬 흐름을 공통 CAD selection/History에 연결하고, 크기 제한/캐시 확장은 대형 fixture를 실제로 측정한 뒤 결정하는 것이다.
