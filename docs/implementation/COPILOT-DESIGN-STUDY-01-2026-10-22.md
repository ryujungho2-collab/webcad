# COPILOT-DESIGN-STUDY-01 — 의도·대안·판단을 CAD 편집으로 연결

2026-10-22. 사용자는 의도 보조와 미적 평가/대안 수정을 조사한 뒤 “다 적용해서 개선해봐”라고 요청했다. 조사한 프로젝트의 상호작용 원칙을 현재 코파일럿에 맞게 구현했다. 각 저장소의 코드를 통째로 도입하거나 Blender/FreeCAD를 설치한 작업은 아니다.

## 결과

**Copilot → Open design study…**에서 확정 요구, 미확정 가정, 질문, 디자인 속성을 편집한다. 사용자가 고른 객체에 보존·코어·개구부·구조 역할을 부여하고, 실제 CAD 뷰에 영역과 메모를 표시한다. 실제 원본 형상으로 만든 2–3개 대안을 현재 상태와 같은 축척으로 비교하며 선택/거절 이유를 기록한다. 선택한 한 안만 기존 Review/Apply/Undo 경로로 게시한다.

- 로컬: 빈 선택의 통과점 spline 생성, 독립 닫힌 fitted spline의 source 유지 수정, 닫힌 직선 polyline의 별도 spline 연구, 지원 솔리드의 실제 길이 파라미터 3개 대안. 비대칭·종횡비·외곽의 오목한 부분을 조절하며 공간 배치를 자동 추론하지 않는다.
- 3D: native BRep tessellation에서 등각/평면/정면을 작성한다. 전체 후보가 투영과 축척을 공유한다. 이 뷰는 실시간 tessellation 검토이고 광선 추적 렌더·정확 hidden-line 도면은 아니다.
- gateway: 기존 endpoint에 `design-explore` 계약, 구조화된 brief/최근 판단, 선택적으로 실제 CAD PNG와 영역 표시를 보낸다. 기존 CAD 도구의 제한된 조회 왕복 및 대안별 모델링 명령을 사용한다. 해석은 별도 미확정 상태이며 명시적 수락 후 재생성한다.
- 보존: target 객체와 출력 feature를 native preview 뒤와 Apply 직전에 비교한다. 변경 도중 취소·문서 변경·오래된 응답은 원본 CAD를 바꾸지 않는다. 인간 판단은 도면 Undo와 별도 이력이다.
- 지속성: 문서 ID별 로컬 intent/판단 저장과 JSON sidecar import/export. 최근 30개 및 UTF-8 128KB 범위에서 기록한다. 실행 가능한 preview 명령을 sidecar에 저장하지 않으며 native CAD schema는 바꾸지 않는다.

## 조사에서 적용한 부분

| 참고 | 이번 적용 | 이번에 하지 않은 부분 |
| --- | --- | --- |
| DesignWeaver / CADDesigner | 편집 가능한 속성, 확정 요구와 해석 분리, 구조화된 gateway | 원본 연구 시스템/모델 이식 |
| Zoo / SketchAgent / PromptCharm | CAD 부분 표시+언어, 후속 판단 기록, 단일 Undo | 자유 손 스케치 모델·외부 이미지 생성 |
| BlenderAlchemy | 실제 후보 실행→다중 뷰 비교→인간 선택/비판→재요청 | 자동 VLM 쌍 비교/탐색·미적 점수 |
| CADAM / Sverchok / LL3M | 치수 조절, 수정 가능한 파라메트릭 곡선·원본 명령 유지 | OpenSCAD/geometry nodes/KCL/bpy 런타임 |
| FreeCAD MCP / Blender MCP / Solidcraft | 현재 23개 typed CAD 도구 재사용, 조회와 실행 권한 분리 | 외부 앱/MCP 서버 설치와 라이브 브리지 |
| CADSmith | native 커널 검사와 모델 주장/미적 판단 분리 | 모델 비평기를 커널 검사 대신 사용 |
| CADFusion / BlenderLLM | 재현 가능한 실제 CAD/UI 검증 사례와 인간 피드백 보존 | 학습·파인튜닝·모델 성능 재현 |
| Bonsai / IfcOpenShell | 코어/개구부/구조라는 사용자 의도 앵커 | IFC 읽기/쓰기·BIM 규칙 검증 |

위 연결은 적용자의 설계 판단이며 원 프로젝트의 검증 결과를 이 제품의 성능으로 전용하지 않는다. 직접 소스 복사·신규 외부 의존성 추가는 없다. 출처와 프로젝트별 제한은 [조사 기록](../product/COPILOT-INTENT-GITHUB-RESEARCH-2026-10-22.md)에 둔다.

## 검증과 범위

[검증 manifest](../verification/COPILOT-DESIGN-STUDY-01-2026-10-22.json)와 `output/verification/design-study/browser-report.json`을 따른다. 신규 단위 검사는 실제 native 생성·형상 차이·BRep 체적·변환 배치·보존 앵커·sidecar·조회 왕복·취소를 확인한다. 실제 React/Worker/CDP 입력으로 신규 흐름 26개 검사, 기존 gateway 13개와 연속 대화 15개를 확인했다. 테스트에서 controlled gateway를 사용했으며 실제 외부 provider의 의도 해석 능력/건축 미적 품질을 검증한 것은 아니다.

전체 Node 테스트, build/typecheck, 구조·문서 링크 검사를 별도로 수행했다. 기존 bundle 크기 경고가 남는다. 브라우저 회귀를 동시에 실행했을 때 4공 판의 첫 커널 로딩이 기존 18초 대기를 넘었으나 단독 재실행은 15개 통과했다. 성능 개선 근거로 삼지 않는다.

2D 전시관 R1은 여전히 미적 채택 보류다. 이번 기능 구현을 R1 미적 승인이나 새 전시관 완성으로 취급하지 않는다. 다음 모델/provider 연결과 실제 사용자 brief를 통한 대안 품질 평가가 필요하다.

## 구현 위치

- `apps/web/src/copilot/DesignStudyDialog.tsx`: UI·선택·피드백·취소·Apply.
- `designStudy.ts`: 의도 계약·저장 검증·로컬 파라미터 대안·보존 검사.
- `designStudyScene.ts`: 실제 CAD scene와 공유 투영/축척.
- `designStudyGateway.ts`: bounded 조회/대안 계약.
- `App.tsx`, `ExplorerPanel.tsx`, `CopilotPanel.tsx`: 진입점과 native viewport ghosts.

gateway 응답 계약은 [DESIGN-STUDY-GATEWAY](../architecture/DESIGN-STUDY-GATEWAY.md), 제품 사용법은 [Copilot](../features/COPILOT.md)에 둔다.
