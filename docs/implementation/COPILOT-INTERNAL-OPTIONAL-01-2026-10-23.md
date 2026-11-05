# 내부 코파일럿과 선택 모델

2026-10-23. 사용자는 외부/로컬 모델을 선택 연결로 두고 나머지는 Agent WebCAD 내부에서 처리하도록 요청했다.

## 구현한 흐름

기본 내부 엔진으로 의도와 지원 치수를 정리하고, 외곽 방향/변화 폭의 답변을 명시적으로 확정한다. 그 결과로 실제 native 곡선 대안을 만들고 비교한다. 피드백과 명시적 편집 작업으로 다시 수정한 뒤 한 안만 Apply/Undo한다. 엔진은 fetch나 모델 런타임을 사용하지 않는다. 기존 규칙형 자연어 CAD, 도구 조회, 치수 편집도 유지했다.

2D 내부 수정은 중심 기준 오목/바깥, 가로/세로 확대, 전체 Tangent, 통과점 번호와 plane dx/dy를 지원한다. 영역과 명시적 작업을 조합하면 표시 영역 안의 점만 수정한다. source ID/평면/닫힘/배치를 유지하며 바뀌지 않은 통과점은 그대로 둔다. 기존 커널의 placement 재계산에는 부동소수 오차가 있으므로 변환 비교는 1e-9 mm 허용오차를 사용했다. Undo는 revision을 제외한 원본 문서와 정확히 일치한다. 지원 솔리드는 공개 길이 파라미터를 수치 변경한다. 코어 등 보존 앵커는 native preview 뒤와 Apply 직전에 검사한다.

선택 메뉴는 내부 / Ollama / 외부 gateway 세 가지다. 선택한 endpoint와 모델명만 브라우저에 저장하고 비밀키는 저장하지 않는다. Ollama adapter는 설치 모델만 사용하며 다운로드·cloud-routed model·임의 실행 스크립트를 허용하지 않는다. 외부 gateway는 계약을 구현한 서버를 사용자가 지정한다. 업체별 cloud adapter는 이번 범위가 아니다.

`curve.fitted`, `cad.curve`, `curve.reshape`, `curve.adjust`를 추가해 typed 도구를 27개로 확장했다. 모델은 geometry 배열 전체를 다시 작성하는 대신 단일 통과점 delta를 제안할 수 있다. 모델 제안도 내부 도구의 선택/원본/잠금/평면 검증과 Review/Apply를 통과해야 한다. 추론 1회 실행·취소·최대 1회 교정, 응답 크기/시간 제한, same-origin loopback 접근 검사를 적용했다.

## 실행

내부 모드는 `pnpm --filter @agent-webcad/web dev --host 127.0.0.1 --port 5188` 뒤 Copilot → Open design study…에서 바로 사용한다. 모델 설치나 API server는 필요하지 않다. 배포한 정적 앱에서도 내부 경로는 동작한다. 선택 Ollama API route는 Vite dev/preview plugin이므로 정적 호스팅에 자동 제공되지 않는다.

Ollama를 사용하려면 설치된 Ollama를 실행하고 Connection → 로컬 모델 / Ollama 또는 Use local copilot을 선택한다. 기본 주소는 `http://127.0.0.1:11434`, 선택 설정은 `CAD_OLLAMA_URL`/`CAD_OLLAMA_MODEL`이다. 주소 설정이 잘못되어도 내부 CAD 기동을 막지 않는다. 내장 요청 제한은 165초, 브라우저 제한은 180초다. 다른 gateway의 기존 30초 제한은 유지한다.

실제 모델 검증은 선택적으로 `pnpm --filter @agent-webcad/web test:copilot-live`를 실행한다. `CAD_LIVE_APP_URL`과 `CAD_LIVE_MODEL`로 검증 대상을 바꿀 수 있다. 일반 unit/browser 검증은 Ollama 없이 실행하며 모델 UI는 명시적 fixture를 사용한다. API 구현 근거: [Ollama Chat](https://docs.ollama.com/api/chat), [Structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [Thinking](https://docs.ollama.com/capabilities/thinking).

## 검증과 한계

전체 Node 1580개 통과. 내부 엔진 6개와 gateway 10개 unit 검증을 포함한다. 실제 browser/Worker 29개는 모델 없는 전체 흐름(모델/status 요청 0회), 명시적 선택 모델 fixture의 질문/대안/수정, Apply/Undo/Redo/실제 reload, 연결 변경과 취소를 검증한다. 기존 Design study 26개, 일반 gateway 13개, 내부 자연어 연속 편집 15개 browser 검사도 통과했다. 연속 편집의 병렬 실행에서는 cold kernel 로딩 중 기존 18초 UI 대기 제한에 도달했고, 독립 재실행은 15개 모두 통과했다. 제품 제한을 완화하지 않았다. 실제 Ollama `qwen3-coder-32k:latest`로 질문→두 곡선→정확한 후속 통과점 수정→native Apply/Undo/Redo의 11개 검사를 별도 수행했다. [검증 manifest](../verification/COPILOT-INTERNAL-OPTIONAL-01-2026-10-23.json).

일반 문장·이미지를 자체 모델처럼 이해하거나 아름다움을 판정하는 엔진은 구현하지 않았다. 지원 키워드/수치/명시적 작업으로 사용자의 의도를 구체화한다. 법규·실면적·건축 공간 구성 승인과 자동 미적 평가도 별도다. 기존 R1 전시관은 미적으로 미채택 상태를 유지한다. 실제 모델의 JSON/schema 통과와 기능 검증은 미적 성공을 뜻하지 않는다. 텍스트 모델은 CAD 도구를 사용할 수 있지만 이미지를 볼 수 없음을 화면에 표시한다.
