# 코파일럿 의도 구체화·대안·수정 GitHub 조사

2026-10-22. 사용자 요청에 따라 GitHub의 공개 저장소, 저자 프로젝트 페이지와 일부 핵심 코드를 읽었다. 설치·실행·성능 재현이나 코드를 제품에 도입한 단계는 아니다. 조사 질문은 ‘사용자의 완성된 명령 실행’을 넘어 설계 의도를 함께 구체화하는 데 어떤 구조를 참고할 수 있는가이다.

## 우선 살펴볼 세 프로젝트

### 1. DesignWeaver — 의도 구체화 UI

- [GitHub](https://github.com/slimykat/DesignWeaver), [저자 설명](https://dylantao.github.io/projects/designweaver/).
- 텍스트와 생성 이미지에서 디자인 속성을 드러내고, 선택 가능한 속성과 옵션으로 탐색을 돕는 제품 디자인 연구 구현이다. CAD 치수의 dimension과 달리 이 프로젝트의 design dimension은 재질·형태 같은 디자인 속성 축을 뜻한다.
- 확인한 코드: [DimenRecomPanel.jsx](https://github.com/slimykat/DesignWeaver/blob/main/src/components/DimenRecomPanel.jsx), [openai.js](https://github.com/slimykat/DesignWeaver/blob/main/src/api/openai.js). 속성 추천, 사용자 선택·추가, 기존/새 태그와 가중치를 비교해 프롬프트를 갱신하는 경로가 있다.
- 적용 판단: 막연한 요구를 편집 가능한 의도 항목으로 보여주는 방식이 가장 직접적으로 관련된다. 사용자 확정 조건과 AI의 추정 조건은 우리 쪽에서 별도 상태로 설계해야 한다.
- 범위: 의자 중심의 이미지 생성 연구 UI다. 건축 도면·파라메트릭 CAD·건축 미학 검증이 아니다. Apache-2.0 표기를 확인했다. 브라우저 API 키 사용과 연구 참가자/Firebase 흐름은 제품에 그대로 가져올 구조가 아니다.

### 2. CADDesigner — 요구 구체화와 CAD 실행 연결

- [GitHub](https://github.com/562590763/CADDesigner-Code).
- 텍스트·스케치 요구를 구체화하고 모델링 코드를 실행하며 시각 피드백으로 수정하는 개념 CAD 연구 구현이다.
- 확인한 코드: [requirements_tools.py](https://github.com/562590763/CADDesigner-Code/blob/main/tools/requirements_tools.py), [model_view_tools.py](https://github.com/562590763/CADDesigner-Code/blob/main/tools/model_view_tools.py).
- 요구 구체화 도구는 API 근거, 요구사항, 매개변수 표, 작업 과정, 주의점을 갖춘 텍스트를 만든다. 참고 이미지도 전달한다. 출력 섹션을 보장하는 것과 내용의 정확성을 검증하는 것은 구분해야 한다.
- 적용 판단: 우리의 의도 기록 → 실행 가능한 CAD 계획 → 실제 뷰로 확인하는 연결에 가깝다. AI가 보충한 치수·가정을 사용자 요구로 조용히 확정하지 않도록 해야 한다.
- 범위: CAD 생성·수정 구조의 참고 사례이며 건축의 미적 품질 근거는 아니다. GPL-2.0 표기를 확인했으므로 코드 직접 도입은 해당 조건을 검토하는 별도 작업이다.

### 3. SketchAgent — 말과 스케치를 오가는 상호작용

- [GitHub](https://github.com/yael-vinker/SketchAgent), [저자 데모](https://yael-vinker.github.io/sketch-agent/).
- 언어를 순차적인 스트로크로 바꾸고 사용자와 함께 그리거나 채팅으로 스케치를 수정하는 연구 구현이다.
- 확인한 코드: [chat_and_edit.py](https://github.com/yael-vinker/SketchAgent/blob/main/chat_and_edit.py). 현재 스케치와 편집 입력을 유지하고 요소를 추가하는 HTTP 경로가 존재한다. README의 일반적인 대화 편집 설명을 임의의 CAD 부분 수정 보장으로 확대 해석하지 않는다.
- 적용 판단: 말로 설명하기 어려운 방향을 작은 스케치와 부분 수정으로 확인하는 상호작용에 참고한다.
- 범위: 스케치 스트로크와 이미지이며 정확한 CAD 객체·구속·치수는 아니다. MIT 표기를 확인했다.

## 보조 참고

| 프로젝트 | 확인한 내용 | 우리 과제에서의 위치 |
|---|---|---|
| [microsoft/CADFusion](https://github.com/microsoft/CADFusion) | CAD 순차 학습과 시각 학습을 결합하는 공식 ICML 2025 구현. README와 학습·평가 구성을 확인. | 시각 피드백 학습 참고. 즉시 붙이는 대화/의도 관리 UI나 범용 미적 심사기가 아니다. MIT 표기. |
| [jabarkle/CADSmith](https://github.com/jabarkle/CADSmith) | 계획·생성·실행·검증·수정 루프와 커널 정보/렌더 뷰의 결합. [validator.py](https://github.com/jabarkle/CADSmith/blob/main/autofab/validator.py)를 읽었다. | 수치 검사와 시각 검토를 분리해 전달하는 구조 참고. 해당 코드에서는 Judge 호출 실패가 통과 처리될 수 있고, 커널 수치 일부는 정보용이다. README의 성능 주장을 우리 검증 결과로 취급하지 않는다. |
| [ma-labo/PromptCharm](https://github.com/ma-labo/PromptCharm) | 이미지 생성을 멀티모달 입력으로 반복 수정하는 CHI 2024 공식 구현. README와 프런트/백엔드 구성을 확인. | 이미지·언어를 함께 쓰는 의도 조정 UI의 보조 참고. 정확한 CAD 변경과는 별도다. MIT 표기. |
| [tangency-labs/solidcraft](https://github.com/tangency-labs/solidcraft) | 기존에 사용자가 제시한 Rust 파라메트릭 CAD/MCP 프로젝트. 현재 README를 다시 확인. | CAD 구현/도구 자동화 쪽의 기존 참고 자료로 유지한다. 이번 의도 구체화 조사의 우선 사례는 위 세 개다. |

## 이 제품에 적용할 설계 판단

추천 조합은 **DesignWeaver의 의도 속성 UI + CADDesigner의 요구 구체화 경로 + SketchAgent의 시각적 대화 방식**이다. 이는 조사자의 적용 제안이며 해당 프로젝트의 성능으로 입증된 결합은 아니다. CADFusion은 후속 학습 연구, CADSmith는 실행 후 검토 구조의 참고로 둔다.

먼저 시도할 흐름:

1. 자연어·현재 선택·참고 이미지를 받는다.
2. 확정 요구 / AI 해석 / 미정 항목을 짧은 의도 기록으로 보여준다.
3. 미정 항목 중 결과에 영향이 큰 것에 대해 작은 시각적 대안을 만든다.
4. 선택·거절 이유와 유지할 객체를 기록한다.
5. 현재 CAD의 Review/Apply/Undo를 통해 선택한 안만 실제 도면에 반영한다.
6. 실제 변경 결과와 의도 기록을 비교한다. 미적 의견과 확인 가능한 치수/간섭 검사는 별도로 표시한다.

‘대안 3개’는 같은 결과의 장식 차이여서는 안 된다. 보이드, 공간의 위계, 진입 과정 등 해석이 다른 대안을 대상으로 한다. 미적 평가가 실패해도 사용자 확정 조건과 직접 편집한 객체는 보존해야 한다. 이 조사는 새 추론 모델 학습이나 자동 건축 설계를 구현하기로 확정한 실행 명세가 아니다.

## 추가 조사: 실제 CAD·Blender 작업에 가까운 사례

사용자의 후속 요청으로 CAD·Blender 프로젝트까지 범위를 넓혔다. 아래는 공개 저장소와 공식 문서의 확인 결과이며 설치·실행 재현은 하지 않았다.

| 프로젝트 | 확인한 기능과 범위 | 적용 판단 |
|---|---|---|
| [BlenderAlchemy](https://github.com/ianhuang0630/BlenderAlchemyOfficial) | ECCV 2024 공식 구현. 텍스트/참고 이미지를 목표로 수정 후보를 실행·렌더링하고 시각적으로 비교한다. [refinement_process.py](https://github.com/ianhuang0630/BlenderAlchemyOfficial/blob/main/refinement_process.py)의 `tree_branch`, `get_top_candidate`를 읽었다. 재질·조명·shape key·geometry nodes·배치의 작업 구분과 후보 쌍 비교가 있다. | 이번 논의의 ‘목표 → 대안 → 시각적 비교 → 수정’에 특히 직접적이다. 후보 탐색의 참고이며 건축 미학의 정답 판정기가 아니다. |
| [Zoo Design Studio](https://github.com/KittyCAD/modeling-app) | GUI와 KCL을 함께 사용하는 CAD 앱. [Zoodle](https://zoo.dev/docs/zoo-design-studio/features/ml-ai/zoodle)은 현재 뷰에 그린 표시와 텍스트를 AI에 전달한다. [Revertible AI Changes](https://zoo.dev/docs/zoo-design-studio/features/ml-ai/revertible-ai-changes)는 여러 파일을 바꾸는 AI 요청도 하나의 히스토리 단계로 관리한다고 설명한다. | 말만으로 설명하기 어려운 의도를 선택/표시로 전달하고 수동 편집과 AI 편집을 함께 되돌리는 제품 UX 참고. 앱 코드 공개와 서버형 지오메트리·AI 서비스의 공개 범위를 구분해야 한다. |
| [CADAM](https://github.com/Adam-CAD/CADAM) | 자연어·참고 이미지에서 파라메트릭 OpenSCAD를 생성하고 추출한 치수를 슬라이더로 조정한다. README의 WASM·Three.js 구조와 출력 형식을 확인했다. | 자연어 해석 결과를 직접 조정 가능한 파라미터로 보여주는 방식 참고. 우리 OpenCascade BRep와 같은 표현이라고 가정하지 않는다. |
| [FreeCAD MCP](https://github.com/neka-nat/freecad-mcp) | FreeCAD 애드온과 MCP 서버를 연결해 모델 생성/편집, 문서 조회, Python 실행 등을 제공한다. [README](https://github.com/neka-nat/freecad-mcp/blob/main/README.md)와 도구 문서의 연결을 확인했다. | 정확한 CAD 작업을 에이전트 도구로 노출하는 참고. MCP 연결 자체가 의도 해석이나 미적 비평 엔진은 아니다. |
| [MCP for Blender](https://github.com/ahujasid/mcp-for-blender) | Blender Python 실행, scene 정보 조회, viewport/camera/여러 방향의 시각 확인, 에셋 검색·가져오기 도구를 설명한다. 커뮤니티 통합이며 Blender Foundation 공식 프로젝트는 아니다. | 에이전트의 실행·관찰 통로. 렌더 피드백을 받는 기반으로 참고하고 의도/평가 정책은 별도 설계한다. |
| [LL3M](https://github.com/threedle/ll3m) | 논문/README는 Blender 코드 기반 생성·편집, API 검색, 코드/시각 자기비평과 사용자 후속 수정을 설명한다. 공개 파일은 클라이언트·Blender 애드온을 포함한다. | 절차적 코드를 편집 가능한 자산으로 유지하는 연구 방향 참고. 현재 README에 서버 중단 공지가 있어 곧바로 실행 가능한 독립 공개 에이전트로 추천하지 않는다. |
| [BlenderLLM](https://github.com/FreedomIntelligence/BlenderLLM) | Blender `bpy` 스크립트를 생성하도록 학습한 모델·데이터셋·벤치마크를 제공한다. 공개 README에서 모델과 스크립트 실행 경로를 확인했다. | 특화 모델 학습과 평가 데이터의 참고. 대화형 의도 관리나 건축 CAD의 정확도 보장을 제공하는 것으로 해석하지 않는다. |

## AI 외에 건축의 모델링 기반으로 볼 프로젝트

- [Sverchok](https://github.com/nortikin/sverchok): Blender의 노드 기반 파라메트릭 도구. 곡선·곡면·솔리드, 단면·돌출, SVG/DXF 출력과 BREP/NURBS/IFC 교환을 설명한다. 일부 기능은 추가 라이브러리에 의존한다. DDP 계열 형태를 수정 가능한 매개변수·노드 관계로 표현하는 모델링 기반 참고이며, AI 의도 해석 도구는 아니다.
- [Bonsai / IfcOpenShell](https://github.com/IfcOpenShell/IfcOpenShell), [공식 개발 설명](https://github.com/IfcOpenShell/IfcOpenShell/blob/v0.9.0/src/bonsai/docs/guides/development/hello_world.rst): Blender에서 IFC를 직접 저작하는 BIM 환경과 IFC 라이브러리. 형태에 벽·층·개구부 등 건축 의미를 연결하는 참고이며, 자동 미적 판단을 수행하는 도구는 아니다.

추가 조사 후 우선순위는 **Zoo의 시각적 의도 전달·수정 UX, BlenderAlchemy의 후보 비교 루프, Sverchok의 파라메트릭 형상 표현**이다. 기존 DesignWeaver/CADDesigner 조사와 보완 관계다. 특정 저장소를 통째로 이식하기로 결정한 것은 아니다.
