# Copilot

[기능 가이드](README.md) · [자동화 후속 목표](../product/UNIFIED-CREATIVE-SUITE-ROADMAP.md)

Copilot은 선택/대상을 읽고 제한된 계획을 검토·적용하는 경로다. 로컬 조회, 버튼형 평면도 작업, gateway 계획은 지원 범위와 실행 조건이 다르다.

## 대상을 읽고 기존 도구로 이동하기

선택을 읽거나 **Read target / Find read target**에서 이름·참조로 대상을 찾는다. 숨김/잠금 객체를 읽어도 편집 selection이나 잠금을 바꾸지 않는다. 결과는 단위/측정 출처, 원본·영향 객체, 구속과 제한을 표시한다.

**Inspect source / Inspect affected object**, Model tree/Properties, Open Layers/Edit Sketch 등으로 기존 편집 흐름에 인계한다. 문서·선택·읽기 대상 변경이나 Cancel은 이전 reader를 폐기해 늦은 결과가 새 결과를 덮지 못하게 한다.

조회는 최대 50개 대상·64KiB 결과·30초 deadline, source/affected 목록 20개 등의 제한을 표시한다. 전체 graph·원본 raster bytes를 그대로 반환하지 않는다. Query 결과를 실제 LLM에 보내 설명받는 endpoint는 이 지원 범위에 포함되지 않는다.

## 로컬 평면도 작업

**Clean / Make face…**는 File/Ctrl+K와 같은 guided 작업 패널을 연다. 도면 준비·PURGE·면·벽·콘텐츠 작업의 입력과 절차는 [평면도와 건축 콘텐츠](FLOOR-PLANNING.md) 한 곳에서 관리한다. 이 경로가 임의 자연어 전체 설계를 자동 수행한다는 뜻은 아니다.

## 계획 검토와 gateway 편집

기존 gateway 계약은 제한된 drawing/primitive 생성과 선택한 2D 도형 하나의 Move를 허용한다. Preview에서 대상·영향을 검토한 뒤 Apply한다. 선택/작업면/문서·입력이 바뀌면 재계획하고, 취소하거나 이미 적용한 계획을 다시 게시하지 않는다.

Move는 독립 root finite line/polyline/rectangle/circle/arc 하나, 현재 XY/XZ/YZ 작업면, 지원 transform 범위다. 입력 translation은 mm의 **world 절대 배치 값**이며 delta나 control point 좌표가 아니다. 작업면 법선 축의 현재 translation을 유지해야 한다.

다중 대상·스케치/작도/패턴 소유 도형·파생 도형·3D·image/component·작업면 밖 이동, rotate/scale/delete·여러 Move/생성 혼합 batch는 이 Move allowlist에 없다. 잠긴 downstream 치수 등 관계 충돌은 전체 변경을 거부한다. Query의 별도 읽기 대상은 편집 권한이 아니다.

실제 provider·서버·인증 연결은 해당 구현/검증에서 완료하지 않았다. mock gateway·로컬 검증 통과를 실제 외부 모델 서비스 사용 가능으로 해석하지 않는다.

## 구현·검증 근거

- [로컬 Query](../implementation/G5-B1-COPILOT-QUERY-2026-10-09.md), [선택 2D Move](../implementation/G5-B2-COPILOT-MOVE-2026-10-09.md).
- [요청 context](../implementation/G5-A2-COPILOT-CONTEXT-2026-10-08.md), [Apply/잠금/경합](../implementation/G5-A3-COPILOT-APPLY-2026-10-08.md), [gateway 응답 검증](../implementation/G5-A1-GATEWAY-RECHECK-2026-10-09.md).
- [공통 로컬 작업 패널](../implementation/WF-C0-A2-B1-2026-10-16.md). 카드별 검증 환경·실패·한계는 원래 기록에 보존한다.
