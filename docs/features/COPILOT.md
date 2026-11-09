# Copilot

로프트 재편집: 로프트 하나를 선택하고 `선택한 로프트를 부드러운 곡면으로 바꿔줘` 또는 `선택한 곡면을 직선 연결로 바꿔줘`를 입력한다. 속성 버튼·Shared tools의 Change loft connection·MCP `solid.loft.update`가 같은 원본 모델과 Review/Apply를 사용한다. [왕복 편집 검증과 한계](../implementation/LOFT-EDIT-HANDOFF-2026-10-25.md).

원·닫힌 스플라인 등 여러 윤곽을 선택하면 공통 돌출 폼에서 외곽·구멍·순면적을 확인할 수 있다. MCP도 `cad.context.profile`로 같은 결과를 읽는다. 복잡한 검증은 `cad.propose`에 `waitForReview:false`를 주고 접수 번호로 상태를 조회한다. `validating`은 검증 중이며 Apply는 `pending-review` 이후 CAD 화면에서만 한다. [세면 볼 과제](../implementation/BASIN-HANDOFF-2026-10-24.md).

일반 Prompt에서도 **질문 → 답변 → 미리보기 → Apply**를 사용할 수 있다. `통풍 덮개`만 입력하면 필수 치수를 묻고, `핀 지름 6mm 길이 30mm`는 원통 핀을 검토한다. 4홀 플레이트·핀·원형 통풍구 덮개 템플릿은 치수/간격을 검사하고 실제 체적을 계산식과 비교한다. 모델 gateway도 질문 또는 템플릿을 반환할 수 있다. [지원 문법·기본값·한계](../implementation/COPILOT-STAGED-RECIPES-01-2026-10-24.md).

맞춤 곡선 과제: Shared tools에서 Create a fitted spline → 원본 곡선 선택 → Adjust one fitted point로 점과 이동량을 확인한다. `곡선 4번 점 X -200mm 이동`도 같은 도구를 사용한다. 사람의 점 번호는 1부터, MCP pointIndex는 0부터 시작한다. 이동은 source XYZ이며 배치 변환을 함께 표시한다. live 3D는 재생성되지만 바뀐 단면 대응은 Explicitly rebind related drawings로 검토한다. [실제 과제·지원 한계](../implementation/KIOSK-HANDOFF-2026-10-24.md).

**CAD MCP**에서 현재 프로젝트를 MCP 지원 호스트에 연결할 수 있다. **Enable CAD MCP → MCP client configuration**을 호스트에 등록하고 조회·제안을 실행한다. 변경은 기존 Review/Apply로 처리한다. 모델 선택과 도구 연결은 별개다. [설정·호출 예시·지원 범위](../architecture/CAD-MCP.md).

최종 목표는 자연어로 편집 가능한 2D 도면과 3D 모델을 새로 만들고 후속 대화로 수정하는 CAD다. 외부 도면 이해·수정·복원은 이를 위한 학습·검증 수단이다. 목적과 판단 기준은 [자연어 CAD·코파일럿 제품 목적](../product/NATURAL-LANGUAGE-CAD-PURPOSE-2026-10-19.md)에 둔다. 아래는 현재 구현 범위이며 목표 기능이 모두 구현됐다는 뜻이 아니다. 목적을 고정된 다음 구현 순서로 해석하지 않는다.


[기능 가이드](README.md) · [자동화 후속 목표](../product/UNIFIED-CREATIVE-SUITE-ROADMAP.md)

Copilot은 선택/대상을 읽고 제한된 계획을 검토·적용하는 경로다. 로컬 조회, 버튼형 평면도 작업, gateway 계획은 지원 범위와 실행 조건이 다르다.

## 의도를 구체화하고 대안을 비교하기

**Open design study…**를 열어 목표, 확정 요구, 미확정 가정, 열린 질문을 따로 적는다. 디자인 속성은 사용자가 고르며 키워드 추천은 자동 확정되지 않는다. 선택한 객체를 `preserve/core/opening/structure` 앵커로 지정하면 그 객체와 출력 feature의 파라미터를 바꾸는 대안을 차단한다. `reference`는 문맥을 더하며 보존 잠금은 없다.

**Generate design alternatives**는 적용 전 실제 CAD 후보를 만든다. 현재 상태와 대안의 축척을 맞춰 비교하고 **Review**에서 변경을 확인한다. **Keep direction / Reject direction**에는 사용자의 이유를 적는다. **Apply selected alternative**만 원본을 바꾸며 한 Undo로 복원한다. 도면 변경/문맥 변경/취소 뒤 이전 후보는 적용할 수 없다. 인간 판단 기록은 도면 Undo와 별도로 남는다.

기본값은 **Agent WebCAD 내부 엔진**이다. 모델/API 서버 없이 **Clarify design intent**로 `24m × 18m` 같은 지원 치수를 제안하고 외곽 방향·변화 폭 질문에 답한 뒤 명시적으로 확정한다. 질문에 답하기 전에는 치수도 바뀌지 않는다. 제한된 규칙이며 일반 문장 이해나 미적 판단 모델은 아니다.

내부 대안은 새 닫힌 fitted spline, 독립 fitted spline 수정, 닫힌 직선 polyline의 별도 spline 연구, 지원 솔리드의 길이 파라미터를 사용한다. **Review → Preference / criticism → Refine selected alternative**로 다음 대안을 만든다. 내부 수정 작업에서 오목/바깥/가로/세로/Tangent/통과점 이동을 고르고 거리와 이동값을 입력할 수 있다. 작업 선택은 검토 중인 대안을 지우지 않는다. 지원 키워드가 모호하면 작업을 직접 고르도록 안내한다. 2D 표시 영역은 명시적 작업과 조합해 그 안의 통과점만 수정하며, 회전/스케일 곡선의 영역 매핑과 3D 영역 해석은 지원하지 않는다. Tangent는 전체 곡선 설정이므로 영역 표시를 먼저 지운다.

**Copilot connection / 모델 연결**에서 세 가지를 선택한다. 기본 내부 엔진, 선택적 **로컬 모델 / Ollama**, 선택적 **외부 모델 gateway**다. Ollama는 이 컴퓨터에 설치된 모델만 검색하며 다운로드하지 않는다. `Use local copilot`을 누르거나 로컬 모델을 선택할 때만 상태 요청을 보낸다. 외부 gateway는 [응답 계약](../architecture/DESIGN-STUDY-GATEWAY.md)을 구현한 별도 endpoint가 필요하다. 클라우드 업체별 API adapter와 인증은 포함하지 않는다. 브라우저에 API key를 저장하지 않는다.

선택 모델은 의도 질문, 대안 제안, 후속 피드백 해석을 담당한다. 모델을 사용해도 모든 형상은 내부 CAD 도구에서 검증하고 사용자가 Apply한다. 모델 응답의 미확정 해석은 명시적 수락 전 요구를 덮지 않는다. **Send CAD views**는 선택 모델에 최대 세 장의 CAD PNG와 영역을 전송한다. 텍스트 전용 모델은 이미지 요청을 거절한다. 원본 raster/참고 이미지 bytes는 보내지 않는다. 취소·오류·연결 해제 시 원본 CAD는 그대로다. [내부 엔진과 선택 모델 구현/실행 안내](../implementation/COPILOT-INTERNAL-OPTIONAL-01-2026-10-23.md).

의도와 최근 판단은 문서 ID별 브라우저 저장소에 보존한다. **저장 / Export intent study**에서 JSON sidecar를 내보내고 같은 문서 ID에 가져온다. 최대 30개 기록·UTF-8 128KB이고 오래된 판단부터 제외한다. CAD 형상은 기존 native 파일에 별도로 저장한다. 다른 문서의 sidecar를 가져와도 CAD나 brief를 덮지 않는다. 실행 가능한 후보 명령은 sidecar에 담지 않는다.

현재 뷰 범위는 최대 32객체·8000 triangles·16000 curve vertices다. 초과하면 범위를 줄이도록 안내한다. 곡선 표본과 BRep tessellation 검토이며 광선 추적 렌더나 법규·미적 적합성 인증은 아니다. [구현과 조사 적용 범위](../implementation/COPILOT-DESIGN-STUDY-01-2026-10-22.md).

## 대상을 읽고 기존 도구로 이동하기

선택을 읽거나 **Read target / Find read target**에서 이름·참조로 대상을 찾는다. 숨김/잠금 객체를 읽어도 편집 selection이나 잠금을 바꾸지 않는다. 결과는 단위/측정 출처, 원본·영향 객체, 구속과 제한을 표시한다.

**Inspect source / Inspect affected object**, Model tree/Properties, Open Layers/Edit Sketch 등으로 기존 편집 흐름에 인계한다. 문서·선택·읽기 대상 변경이나 Cancel은 이전 reader를 폐기해 늦은 결과가 새 결과를 덮지 못하게 한다.

이 Read selection 패널은 최대 50개 대상·64KiB 결과·30초 deadline, source/affected 목록 20개 등의 제한을 표시한다. 전체 graph·원본 raster bytes를 그대로 반환하지 않으며 이 버튼 자체는 gateway에 전송하지 않는다. 별도로 아래 공통 도구 계획에서는 gateway가 제한된 조회를 요청하고 결과를 받아 계획을 이어갈 수 있다.

## 구조화된 제안과 건축 과제의 지원 경계

내부 모드의 CAD tools → **Structured CAD proposal / 도구 제안 입력**에 `{version:1,toolCalls:[...]}`를 입력하면 같은 Plan/Review/Apply를 사용한다. 설계자가 정한 좌표를 실행하는 경로이며 공간을 자동 설계한 결과로 표시하지 않는다. 한 제안은 20개 도구·64 KiB 이내다. 알려진 도구 schema만 허용하고 원시 command·script는 받지 않는다. `draft.text`는 일반 CAD 텍스트, `draft.linearDimension`은 두 plane 좌표의 정적 측정 치수다. 형상을 수정하면 그 정적 치수는 다시 검토한다.

대지·다층 프로그램·동선·단면 등을 함께 요청하는 복합 건축 과제는 현재 내부 플래너의 범위를 벗어난다. 제한된 범위 검사에 해당하면 단일 사각형/곡선으로 성공을 대신하지 않고 미지원을 표시한다. 명시적으로 외곽만 탐색하거나 설계자가 과제를 도구 제안으로 나눌 수 있다. [졸업설계 과제의 실제 검증과 미달 항목](../implementation/COPILOT-GRADUATION-TASK-01-2026-10-23.md).

## 로컬 평면도 작업

### Native 벽·문·창·바닥·연관 도면

기본 내부 모드의 **Native architecture**에서 명령 예시를 입력란에 준비하고 **Plan → Review → Apply**한다. 외부 모델 없이 실제 native CAD 부재를 사용한다. 버튼 자체는 도면을 변경하지 않는다.

- `벽 시작 0,0 끝 6000,0 두께 200 높이 3000`: XY 중심선과 연결된 벽 생성. 좌표 mm, 길이 치수는 mm/cm/m 허용. 끝단은 butt이며 모서리 자동 접합은 하지 않는다.
- 벽 하나 선택 후 `선택한 벽 문 추가 중심 1500 폭 900 높이 2100`: 실제 호스트 관통 개구부. 중심은 원본 중심선 시작부터 거리이며 기본 side는 left다.
- `선택한 벽 창 추가 중심 4200 폭 1800 높이 1200 창턱 900`: 창턱을 명시한다.
- `선택한 벽 문 폭 1200`, `선택한 벽 높이 3300`: 기존 host/개구부 ID를 유지하고 관련 도면 재연결을 같은 Undo에 포함한다. 같은 종류의 개구부가 여러 개면 임의 선택하지 않는다. `cad.architecture`로 ID를 확인해 구조화된 `wall.opening`으로 지정한다.
- 닫힌 XY 윤곽 선택 후 `선택한 윤곽 바닥 레벨 0 두께 200`: 원본 외곽과 홀에 연결된 바닥. 바닥은 레벨 아래, 천장은 위로 두께가 생긴다.
- 부재 선택 후 `선택한 부재 평면 높이 1200`, `선택한 부재 단면 XZ 위치 0`: 실제 BRep 절단을 생성한다. XY는 world Z, XZ는 world Y 좌표다.
- `선택한 부재 도면 갱신`: 선택 부재의 기존 연관 도면을 명시적으로 재연결한다.

기존 편집 대상은 표시·잠금 해제·독립 원본을 선택해야 한다. 잘못된 문 크기/중복/잠긴 관련 출력은 전체 변경을 거절한다. 작은 공간 native 파일과 직접 수정 순서 (local-only, not in repository: `output/projects/native-architecture-lesson/README.md`).

**Wall path clearance**에서 `x,y; x,y` 형식 XY 경로와 몸체 반경/높이/보행 레벨을 입력하고 **Check wall path**한다. 기본 범위는 표시된 native 벽 전체이며 최대 64개다. 범위를 줄일 때는 현재 선택을 명시한다. 문 폭·문서·경로·선택이 바뀌면 이전 결과를 폐기한다. 직선·수직·단위 축척 벽과 호스트 문의 실제 정의에 대한 제한된 평면 거리 검사로, 가구·문짝 회전·바닥/계단·범위 밖 객체와 피난/접근성 적합성을 검사하지 않는다. 기울거나 축척된 벽과 임의 외곽 벽은 미지원을 표시한다.

**Clean / Make face…**는 File/Ctrl+K와 같은 guided 작업 패널을 연다. 도면 준비·PURGE·면·벽·콘텐츠 작업의 입력과 절차는 [평면도와 건축 콘텐츠](FLOOR-PLANNING.md) 한 곳에서 관리한다. 이 경로가 임의 자연어 전체 설계를 자동 수행한다는 뜻은 아니다.

## 계획 검토와 gateway 편집

gateway 계약은 제한된 drawing/primitive 생성, 선택한 2D 도형 하나의 Move, 선택한 솔리드의 지원 치수 하나 변경을 허용한다. Preview에서 대상·영향을 검토한 뒤 Apply한다. 선택/작업면/문서·입력이 바뀌면 재계획하고, 취소하거나 이미 적용한 계획을 다시 게시하지 않는다.

Move는 독립 root finite line/polyline/rectangle/circle/arc 하나, 현재 XY/XZ/YZ 작업면, 지원 transform 범위다. 입력 translation은 mm의 **world 절대 배치 값**이며 delta나 control point 좌표가 아니다. 작업면 법선 축의 현재 translation을 유지해야 한다.

다중 대상·스케치/작도/패턴 소유 도형·파생 도형·3D·image/component·작업면 밖 이동, rotate/scale/delete·여러 Move/생성 혼합 batch는 이 Move allowlist에 없다. 잠긴 downstream 치수 등 관계 충돌은 전체 변경을 거부한다. Query의 별도 읽기 대상은 편집 권한이 아니다.

실제 provider·서버·인증 연결은 해당 구현/검증에서 완료하지 않았다. mock gateway·로컬 검증 통과를 실제 외부 모델 서비스 사용 가능으로 해석하지 않는다.

## 공통 도구로 스케치·3D 작업 이어가기

**CAD tools**에서 지원 조회/모델링 도구를 확인한다. Local rules의 예시는 다음과 같다. 각 단계에서 Plan→검토→Apply하며, 결과가 다음 작업의 선택 대상으로 유지된다.

- `80x50 사각형 스케치`: 현재 XY/XZ/YZ 평면에 고정 원점·폭/높이 치수 구속을 가진 스케치를 생성.
- `선택한 윤곽 20mm 돌출`: 선택한 지원 닫힌 윤곽에서 연관 솔리드 생성.
- `80x50 사각형 스케치 20mm 돌출`: 두 작업을 한 검토/Undo로 수행.
- `윗면 중심에 지름 6mm 관통 구멍`, `윗면 중심에 지름 6mm 깊이 5mm 구멍`: 선택된 기존 body의 가장 높은 유일한 +Z 평면을 조회해 그 면의 중심에 구멍 생성.
- 두 솔리드를 선택한 뒤 `합집합`, `차집합`, `교집합`: 차집합은 첫 선택 target에서 두 번째 tool을 뺌. 요약에서 두 ID를 확인.
- 닫힌 윤곽 하나를 선택한 뒤 `선택한 윤곽 Y축 360도 회전`: 작업면 로컬 y축을 중심으로 회전. XZ 평면이면 world Z축이며 축은 world 원점을 통과.
- 닫힌 윤곽, open 경로 순으로 선택한 뒤 `스윕`. 원호 경로는 기존 표본을 잇는 근사다. 단면을 연결할 순서로 선택한 뒤 `로프트` 또는 `직선 로프트`.
- 솔리드 하나를 선택한 뒤 `수직 모서리 반지름 2mm 필렛`, `수직 모서리 1mm 모따기`: world Z 방향의 모든 직선 모서리에 적용.
- 솔리드 하나를 선택한 뒤 `윗면 제거 두께 2mm 셸`: 가장 높은 유일한 +Z 평면을 제거하고 안으로 두께를 남김.

gateway에는 같은 29개 도구의 입력 schema가 전달된다. 객체 검색/상세·정확 측정·면·모서리·지원 치수 조회를 최대 4회 왕복하고, 스케치·곡선·primitive·돌출·면 Hole·Boolean·회전·스윕·로프트·필렛·모따기·셸 제안을 최대 20개 도구 호출로 구성할 수 있다. 높이가 다른 world XYZ 원과 planar polyline을 만들어 로프트/스윕 원본도 구성한다. 앞선 단계에서 만든 ID를 다음 단계에 연결하며 전체 제안은 한 Undo다. 단일 치수 변경 도구도 동일한 선택 계약을 사용한다.

기존 모델링 입력은 현재 선택한 표시/잠금/참조 조건을 만족하는 원본이어야 한다. 조회만 한 객체는 편집 입력이 아니다. 새 형상은 실제 커널로 계산한 preview와 수치를 검토하고 적용한다. 읽기/쓰기 혼합 호출·한도 초과·오래된 문맥·취소 뒤 늦은 응답·미해결 참조를 현재 형상으로 사용하려는 요청은 거절한다. 전체 계획 deadline은 30초, 누적 조회 결과는 64KiB다.

구멍 중심의 수치는 선택 면의 로컬 좌표다. 로컬 “윗면 중심”은 그 면 frame의 원점을 사용하며, 구멍이 실제 면 밖으로 나가면 거절한다. 새 body는 먼저 Apply한 후 다음 요청에서 면/모서리를 조회하여 구멍·마감을 추가한다. 불가능한 마감 치수·자기 교차·누락되거나 중복된 참조는 거절한다. 회전/스윕/로프트는 구멍 없는 닫힌 단일 단면을 사용한다. 면 참조가 재생성 후 사라지면 명시적 repair가 필요하다. 구속 스케치는 원점 평면의 사각형/원이며 별도 면 스케치 편집은 기존 수동 도구를 사용한다. 개발 필드·응답 형식은 [공통 도구 계약](../architecture/CAD-TOOL-INTERFACE.md)을 따른다.

## 열린 케이스·바닥과 앞벽 가공

`100x70 사각형 스케치` → `선택한 윤곽 30mm 돌출` → `수직 모서리 반지름 4mm 필렛` → `윗면 제거 두께 2mm 셸` → `안쪽 바닥 중심에 지름 8mm 관통 구멍` → `앞면 중심에 지름 10mm 깊이 2mm 구멍`을 각 Plan/Apply로 연결할 수 있다. 첫 스케치 뒤 3D로 전환한다.

안쪽 바닥은 위쪽 림보다 낮은 유일한 +Z 평면, 앞면은 world −Y를 향하는 가장 바깥 평면이다. 카메라 기준이 아니며 모호한 면은 거절한다. 중심은 면 로컬 원점이므로 Review의 면 방향·구멍 위치와 깊이를 확인한다. 양의 절삭 깊이는 선택 면의 바깥 법선 반대로 재료 안쪽을 향한다. [완성 화면·지원 경계·수치 검증](../implementation/COPILOT-ENCLOSURE-01-2026-10-19.md).

## 2D에서 3D로 이어지는 작업

빈 문서의 **2D → Copilot → Local rules**에서 `80x50 사각형 스케치`를 Plan/Apply한다. **3D로 전환**하고 결과 선택을 유지한 채 `선택한 윤곽 20mm 돌출`을 Plan/Apply한다. 이어 `윗면 중심에 지름 6mm 관통 구멍`, `수직 모서리 반지름 2mm 필렛`을 각각 검토·적용하면 같은 원본 관계로 이어진다. 각 단계 한 Undo, 저장/재열기와 STEP 출력을 확인했다. 지원된 규칙 문법의 과제이며 임의 2D 도면의 자동 3D 해석을 뜻하지 않는다. [실제 화면·수치·검증 범위](../implementation/COPILOT-2D3D-01-2026-10-19.md).

## 전체 문장으로 생성하고 후속 대화로 수정

**3D → Copilot → Local rules**에서 다음 문장을 Plan/Apply한다.

> 가로 100mm, 세로 60mm, 두께 5mm 판에 지름 8mm 구멍 네 개를 각 모서리에서 10mm 안쪽에 만들어줘

생성 결과가 선택된 상태에서 다음 문장을 Plan/Apply하면 같은 원본의 폭을 변경하며 네 구멍 중심의 간격을 유지한다.

> 가로를 120mm로 늘려줘. 구멍은 모서리에서 10mm 간격을 유지해줘

가로/세로/두께에 개별 mm/cm/m를 사용할 수 있다. 유지하는 간격은 선택 판의 현재 값과 같아야 한다. 다른 간격·중복 치수·미지원 추가 조건·증가/감소 방향과 수치가 충돌하는 요청은 거절한다. **현재는 제한된 자연어 규칙 문법이며 실제 LLM 연결이나 임의 설계 자동화가 아니다.** [지원 범위·실제 검증](../implementation/COPILOT-CONVERSATION-01-2026-10-19.md).

## 파라메트릭 3D 생성과 후속 치수 변경

**Local rules**에서 `80x50x4mm 판 모서리 간격 10mm 지름 6mm 구멍 4개`를 입력하고 Plan→Apply한다. XY의 왼쪽 아래를 원점으로 하는 판과 네 원형 관통 구멍을 만든다. 구속된 스케치·변수·바인딩·돌출을 일반 문서 객체로 저장하며 전체 생성은 한 Undo다. 구멍 중심은 인접한 두 모서리에서 지정한 간격을 유지한다.

적용 후 최종 솔리드 하나가 선택된다. **Selected solid dimensions**에서 지원 치수와 현재 값을 보고 클릭하여 후속 요청을 작성한다. `폭을 100mm로 바꿔줘`, `두께를 6mm로 바꿔줘`, `구멍 지름을 8mm로 바꿔줘`처럼 요청하면 같은 피처와 관계를 수정한다. `depth`, `margin`, `holeDiameter`도 사용할 수 있다. 단위 생략은 mm, 명시 단위는 mm/cm/m이며 판 생성의 공통 단위는 세 치수 모두에 적용된다.

생성 recipe는 직사각형 판, 원형 관통 구멍 4개, 동일 모서리 간격을 지원한다. 각 길이는 0.01–10000mm이고 구멍은 경계나 서로 접하지 않아야 한다. 필렛·비대칭 간격·다른 구멍 개수 등 추가 조건은 이 recipe에서 거절한다. 로컬 규칙의 지원 표현이며 임의 설계 의도 이해 전체를 지원한다는 뜻은 아니다.

일반 primitive의 길이 치수와 extrude의 거리도 선택 후 수정할 수 있다. 파생 솔리드에서는 선택 원본의 의존 범위 안에서만 사용되는, 숫자 길이 상수로 정의된 변수도 지원한다. 다른 원본에 공유된 변수·표현식으로 계산되는 변수·각도는 이 편집 범위에서 제외한다. 바인딩된 값을 덮어쓰는 대신 지원되는 driver를 수정한다. 잠금·소멸한 참조·유효하지 않은 기하는 기존 원자적 계획/실행 경로에서 거절한다.

gateway 요청의 `solid`에 선택 대상과 지원 `parameters`를 제공한다. 각 항목의 `command`에서 **하나의 숫자만** 바꾼 단일 `update-primitive`, `update-extrude`, `set-variable` 명령을 반환할 수 있다. 변수 편집은 `<숫자>mm` 형식의 길이 상수다. 여러 치수 동시 변경·추가 필드·선택 밖 대상·혼합 batch는 거절하며 변경 요약과 실제 솔리드 preview는 로컬에서 계산한다. 판 생성 recipe는 현재 Local rules에서 제공한다.

실제 평가된 솔리드를 캔버스에 미리 보여주고 체적·영향을 검토한 후 적용한다. Clear·stale 거절, Undo/Redo, 원본 저장/재열기, STEP 출력은 기존 공통 경로다. STEP는 교환 형상이고 피처/변수 관계의 재편집은 WebCAD 원본을 사용한다.

## 구현·검증 근거

- [회전·스윕·로프트와 마감 도구 확대](../implementation/CAD-TOOLS-02-2026-10-19.md) — 공통 23개 도구, 실제 Worker의 6종 연산, Undo·재열기·STEP 독립 재검사.

- [공통 도구·3D 확대](../implementation/CAD-TOOLS-01-2026-10-19.md) — 조회 왕복, 일반 스케치·돌출·면 Hole·Boolean과 실제 UI 연속 과제.

- [3D 생성·후속 치수 변경](../implementation/COPILOT-SOLID-01-2026-10-19.md) — 4공 판, 선택 솔리드 driver, 실제 Worker/UI·재열기·STEP 검사.

- [로컬 Query](../implementation/G5-B1-COPILOT-QUERY-2026-10-09.md), [선택 2D Move](../implementation/G5-B2-COPILOT-MOVE-2026-10-09.md).
- [요청 context](../implementation/G5-A2-COPILOT-CONTEXT-2026-10-08.md), [Apply/잠금/경합](../implementation/G5-A3-COPILOT-APPLY-2026-10-08.md), [gateway 응답 검증](../implementation/G5-A1-GATEWAY-RECHECK-2026-10-09.md).
- [공통 로컬 작업 패널](../implementation/WF-C0-A2-B1-2026-10-16.md). 카드별 검증 환경·실패·한계는 원래 기록에 보존한다.


### 층·마감과 과제 실행

공통 도구/MCP는 `scene.layer`, `scene.objects`로 레이어·부재 이름·표시·3D 마감을 기존 Review에 포함한다. 새 XY polyline 외곽/홀과 `slab.create`를 함께 제안할 수 있다. 기존 부재 수정은 계속 현재 선택과 잠금 조건을 따른다. 평면/단면 생성은 선택한 실제 BRep 최대 64개를 사용한다.

틈마당집 과제 (local-only, not in repository: `output/projects/lightwell-house/README.md`)는 지하 1층+지상 2층을 실제 MCP로 작성하고, 내부 코파일럿의 `선택한 벽 문 폭 1400`으로 같은 집의 현관을 수정해 체적·경로·Undo를 확인한 예다. 원본 파일은 File/Open 또는 프로젝트 홈 Open project로 새 프로젝트로 열 수 있다. 층은 모델 트리의 층 레이어로 구분하고, Default에는 숨긴 원본과 별도 배치한 실제 절단·정적 주석이 있다. 실명과 가구 기호는 편집 가능한 정적 CAD 요소이며 실/층 관계 엔진이 아니다.


벽 끝 접합은 기본 맞대기 외에 명시한 `startMiter/endMiter` 각도(±80°, 도)를 지원한다. 90° 모서리는 두 벽을 대응하는 45° 절단으로 검토한다. Walls & openings 패널에도 두 각도 입력이 있다. 인접 벽을 자동 탐색·유지하는 접합 그래프는 아니다. `wall.update`의 선택적 `start/end`는 변환 없는 독립 원본 중심선의 끝점을 바꾸며 호스트·개구부 ID와 마감을 유지한다. 마이터를 사용한 파일은 v49다. 제한된 벽 통과 조회도 사선 끝 경계를 포함한다. 기존 도면에 새 외벽을 포함하려면 `drawing.section`의 `replaceExisting:true`로 해당 view의 원본 집합을 검토해 갱신한다.


`scene.objects`의 각 `objects[]` 항목에는 선택적인 `delta:[x,y,z]`(world mm)를 줄 수 있다. 부재와 정적 도면 기호를 각각 명시해 같은 이동 검토로 작성한다. 소유된 단면선/투영선/스케치 일부는 이동하지 못하며 기존 native 소유·잠금·영향·Undo 경계를 따른다. `cad.measure`는 BRep 외에 직선·직선 polyline·rectangle의 정확한 변환 후 bounds도 제공한다. 이를 실/가구 관계를 자동 이해하는 엔진과 구분한다.

## Shared tools: 사람 → 자연어 → MCP → 사람

Copilot 상단 **Shared tools**를 펼치면 primitive 생성, 선택 부재 치수, 선택 윤곽 돌출, 두 부재 Boolean을 입력 폼으로 검토할 수 있다. mm가 기본이며 `8 cm`, `6mm` 같은 단위 입력도 허용한다. Boolean은 대상 → 도구 순서로 선택하고 폼의 순서를 확인한다. **Review shared tool**은 기존 미리보기와 Apply를 사용한다. 도구 폼은 선택한 외부/로컬 모델을 호출하지 않으며 연결 설정과 자연어 초안은 유지한다. MCP로 만든 결과도 Model tree에서 선택해 같은 폼으로 이어서 가공할 수 있다. 입력을 바꾸면 미적용 제안이 취소되며 같은 Undo 이력을 사용한다.

`cad.faces`는 face key와 평면 프레임에 world `meshBounds`를 더해 같은 평면의 여러 면을 구분하도록 돕는다. 범위는 테셀레이션 정점 기준이며 정확한 면 포함 판정이 아니다. 실제 구멍 가공이 원과 면의 포함 관계를 최종 검사한다. [검증 과제와 범위](../implementation/SHARED-TOOL-HANDOFF-2026-10-24.md).

### 코파일럿 안에서 편집 대상 바꾸기

**Shared tools → Choose tool targets**에서 보이고 잠금 해제된 부품을 이름 또는 ID로 검색한다. **Use target**은 선택을 교체하고 **Add target**은 순서대로 추가한다. 두 대상은 **Swap target and tool**로 Boolean 대상/도구 순서를 바꾼다. 검색은 선택이나 미적용 검토를 바꾸지 않는다. 실제 대상/순서를 바꾸거나 선택을 지우면 미적용 제안과 이전 MCP 문맥이 취소된다. 같은 대상을 재확인하는 것은 기존 검토를 유지한다. 원격 MCP에 선택이나 Apply 권한을 추가한 기능이 아니다. 치수 폼은 부품을 바꾸면 그 부품의 현재 값을 불러온다. [외함/덮개 과제 근거](../implementation/ENCLOSURE-HANDOFF-2026-10-24.md).

### 원 단면과 순서 로프트

Shared tools에서 **Create a planar circle**, **Loft ordered sections**를 사용할 수 있다. 원의 중심은 world XYZ이며 높이가 다른 단면을 만들 수 있다. 로프트는 닫힌 단면 2–10개를 선택하고 목록의 **Up / Down**으로 순서를 정렬한다. ruled는 단면 사이 직선 연결이고 smooth는 보간 연결이다. 이 과제에서는 ruled를 검증한다. 단면 내부 구멍은 로프트 입력으로 지원하지 않아 내부 통로는 별도 내부 로프트를 빼서 작성했다.

대상 검색의 **Target kind**로 전체/3D 부품/2D 윤곽을 구분한다. 같은 이름의 연관 도면이 많아도 실제 부품을 찾을 수 있다. 검색과 분류는 선택을 바꾸지 않지만, 목록의 순서 변경은 실제 선택을 바꾸므로 이전 MCP context와 미적용 제안을 무효화한다. [편심 덕트 검증](../implementation/DUCT-HANDOFF-2026-10-24.md).

### 회전·스윕·폴리라인과 정확한 대상 ID

Shared tools에서 **Revolve a closed profile / Sweep along a path / Create a planar profile or path**를 사용할 수 있다. 회전축은 **단면 평면의 x/y를 지나는 세계 원점 축**이다. XY의 y는 세계 Y, XZ의 y는 세계 Z이며 폼에서 방향을 확인한다. 폴리라인은 한 줄에 X,Y,Z를 쓰거나 세미콜론으로 구분하고 평면과 닫힘 여부를 명시한다.

스윕은 첫 대상이 닫힌 단면, 두 번째가 열린 경로다. **Swap section and path**는 실제 선택을 교환해 자연어와 MCP에도 반영한다. 뒤집힌 입력 오류는 공통 planner가 수정 방법을 알려준다. 경로의 원호는 기존 폴리라인 근사 방식이다.

대상 검색은 정확한 ID를 우선하고, 다음에 정확한 이름과 부분 일치를 표시한다. 새 검색에는 이전 드롭다운 후보 선택이 남지 않는다. **Use target / Add target** 전까지는 실제 편집 선택을 바꾸지 않는다. [손잡이 과제 근거](../implementation/HANDLE-HANDOFF-2026-10-24.md).


공통 도구에서 열린 맞춤 곡선을 정확한 spline 스윕 경로로 사용할 수 있다. `Reshape a selected fitted spline` 폼과 `곡선 접선 강도 1.0`은 기존 `curve.reshape`를 사용한다. 통과점을 유지하며 연결된 3D를 같은 Review/Apply/Undo로 수정한다. [S자 조명 과제와 범위](../implementation/LAMP-HANDOFF-2026-10-24.md).


기존 `curve.fitted` / `curve.reshape`는 선택적 `continuity:"C1"|"C2"`를 지원한다. C2에서는 strength 1로 연결된 접선을 계산하며 점 수정이 같은 모드를 유지한다. `cad.curve`와 사람 폼은 동일한 source XYZ의 도함수/곡률 차이와 stationary join 수를 읽는다. [라운지체어 과제와 저장 정책](../implementation/CHAIR-HANDOFF-2026-10-24.md).


공간 곡선은 `curve.fitted` / `curve.reshape`의 `space:"spatial"`로 명시하며 참조 plane과 full XYZ를 구분한다. `curve.adjust`는 같은 공간 정책과 C2를 유지한다. `solid.sweep.alignToPath`는 시작 접선에 단면을 정렬하며 기본 방향은 기존값을 유지한다. 사람 폼과 `cad.context.sweep`는 동일한 세계 시작점·접선·정확한 길이를 읽는다. 실제 volume/XYZ BRep bounds도 같은 native Review와 MCP 영수증에 담는다. [파빌리온 인계](../implementation/PAVILION-HANDOFF-2026-10-25.md).
