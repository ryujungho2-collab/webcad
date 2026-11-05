# Design study gateway v1

2026-10-22. 일반 단일 명령 gateway와 같은 endpoint 및 전송 검증을 사용하되 `task: "design-explore"`로 구분한다. 기본 내부 엔진은 이 계약이나 서버를 사용하지 않는다. 2026-10-23부터 선택적 Ollama adapter를 포함한다. 외부 provider·인증 서버는 별도다. 브라우저에 API key를 넣지 않는다. 사용법은 [Copilot](../features/COPILOT.md).

## 입력과 권한

기존 `copilotRequest`의 문서 ID/revision, mm 단위, 선택, work plane, 지원 명령과 29개 도구 schema에 다음을 추가한다.

```ts
design: {
  brief: { goal, requirements, assumptions, questions, qualities, anchors },
  anchors: [{ objectId, role, name, layerId }],
  decisions: /* 최근 사용자 판단 최대 8개 */,
  marks: [{ viewId, box: [x, y, width, height], note }],
  visuals: [{ id, label, bounds, dataUrl }]
}
```

`box`는 첫 CAD 뷰의 0–1 정규화 좌표다. `bounds`는 해당 투영 평면의 `[xmin,ymin,xmax,ymax]`이며 SVG/PNG 위쪽은 ymax다. 그림에 영역을 합성하지 않고 별도 전달하므로 `viewId`와 동일한 PNG가 반드시 필요하다. 최대 8영역·3장·512px PNG. PNG 전송은 화면의 체크박스로 활성화한다. 현재 CAD의 실제 tessellation/곡선 표본만 그리며 원본 raster/참고 이미지 bytes는 보내지 않는다.

기존 선택만 편집 입력이 될 수 있다. 앵커의 `reference`는 보존 잠금이 없고, `preserve/core/opening/structure`는 명명한 객체와 출력 feature의 원본 파라미터가 바뀌는 제안을 차단한다. core/opening/structure라는 역할을 주는 것이 IFC 의미나 법규 적합성 인증은 아니다. 조회한 객체는 편집 선택으로 자동 승격되지 않는다.

## 선택적 조회

정확한 치수·면·모서리가 필요하면 최종 대안 전에 조회만 요청한다.

```json
{"version":1,"toolCalls":[{"id":"read-1","name":"cad.measure","arguments":{"objectIds":["selected-body"]}}]}
```

결과는 다음 POST의 `toolResults`에 누적된다. 최대 4왕복, 왕복당 8호출, 누적 64KiB, 호출 ID 중복 금지. top-level modeling 호출, 읽기/쓰기 혼합, 대안과 조회가 섞인 응답은 거절한다. 요청→조회→최종 대안 계획 전체는 30초 제한이다. 실제 detached CAD preview는 그다음 클라이언트에서 수행한다.

## 최종 응답

아래는 계약 예시이며 건축 설계/모델 성능 데모가 아니다.

```json
{
  "version": 1,
  "brief": {
    "goal": "중정의 크기를 비교",
    "requirements": "사용자가 확인한 조건",
    "assumptions": "두 원의 크기는 미확정 제안",
    "questions": "어느 크기로 더 검토할까요?",
    "qualities": ["Light / 빛과 여백"],
    "anchors": []
  },
  "alternatives": [
    {
      "id": "court-a", "label": "작은 중정", "rationale": "외곽 면적을 더 유지하는 비교",
      "toolCalls": [{"id":"a1","name":"curve.circle","arguments":{"id":"court_a","plane":"XY","center":[0,0,0],"radius":2000}}]
    },
    {
      "id": "court-b", "label": "큰 중정", "rationale": "보이드 비중을 높이는 비교",
      "toolCalls": [{"id":"b1","name":"curve.circle","arguments":{"id":"court_b","plane":"XY","center":[0,0,0],"radius":3000}}]
    }
  ]
}
```

2–3개 대안은 고유 ID·짧은 제목·근거와 `toolCalls` 또는 기존 `{version,command,summary}` 형식의 `proposal` 중 하나를 갖는다. 대안별 도구 호출은 최대 20개다. 임의 Python, bpy, KCL, HTML을 실행하지 않는다. 공개 schema가 허용하는 원본 CAD 명령만 계획한다.

반환한 brief는 미확정 해석으로 따로 보여준다. 사용자가 **Accept interpretation; regenerate**를 누르기 전 기존 요구를 덮지 않는다. 보존 앵커는 해석 수락으로 바꾸지 않는다. 서버의 근거/요약은 **Gateway proposal notes**로 표시하며, 실제 실행 결과·변경 객체·측정 검증은 로컬 커널에서 산출한다. 자연어 미적 주장의 진실성을 자동 보증하지 않는다.

응답은 기존 전송 규칙(HTTPS 또는 localhost, credentials 생략, redirect 금지, application/json, 64KiB 응답, abort/body 해제)을 사용한다. 전체 요청은 512KB를 넘지 않는다. 오래된 문서·선택·작업면·요구·파라미터·표시 문맥은 폐기한다. 생성은 모두 detached 상태이고, 선택된 안 하나만 재검증 후 단일 Undo로 게시한다.

## 선택 모델 adapter와 의도 확인 (2026-10-23)

`task: "design-intent"`는 brief와 최대 3개 `{id,prompt,options}` 질문, summary, 실제 run metadata만 반환한다. CAD를 만들지 않는다. 사용자 답변과 명시적 확정 뒤 design-explore를 요청한다. `design.revision`은 검토한 candidate label·feedback·native command·회수한 fitted source를 전달하며 `sourceCurves`는 선택 spline의 source 좌표/transform을 포함한다. `constraints`는 신규 fitted closure와 3–60개 통과점 상한을 전달한다. 신규 곡선 제한과 선택 수정 권한은 별개다.

내장 `/api/copilot/plan`은 Vite dev/preview에서만 설치되는 선택적 loopback Ollama adapter다. `/api/copilot/status`에서 설치 모델/vision 지원을 확인한다. `CAD_OLLAMA_URL`은 loopback HTTP origin만, `CAD_OLLAMA_MODEL`은 설치 모델명을 지정한다. 초기화는 첫 API 요청 때까지 지연해 내부 모드가 외부 설정 오류에 영향받지 않는다. 모델 schema/도구 목록은 서버가 소유한다. 선택된 fitted source에는 reshape/단일 통과점 adjust, 지원 솔리드에는 공개 parameter key만 제시한다. 실명령 실행 권한은 브라우저의 기존 검증/선택/Apply 경로에 남는다.

동일한 대안은 한 번만 교정을 요청한다. 두 신규 fitted 곡선이 중복될 때에는 모델이 제안한 최대 3개 통과점 delta를 별도 후보에 정확히 적용한다. 다른 점·닫힘·tension을 유지하며 사용자 CAD에는 게시하지 않는다. 여전히 같은 실제 형상이면 client에서 거절한다. run의 provider/model/ms/inputTokens/outputTokens/repairs는 실제 추론 결과에서 나온다. 모델 없는 내부 절차에는 모델 배지를 붙이지 않는다.
