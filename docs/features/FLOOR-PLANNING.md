# 평면도와 건축 콘텐츠

[기능 가이드](README.md) · [후속 설계](../product/FLOOR-PLAN-COPILOT-CANVAS-2026-10-14.md)

DXF 준비→면→벽/개구부→콘텐츠·바닥/천장을 같은 프로젝트에서 연결한다. **File → Floor plan tasks…**, **Copilot → Clean / Make face…**, Ctrl+K의 평면도 작업 검색은 같은 로컬 작업 패널을 연다. 임의 자연어 자동 설계를 의미하지 않는다.

## 도면 준비와 면 만들기

1. DXF에서 레이어 역할(Wall/Opening/Reference/Exclude), 입력 단위와 XY 기준점을 확인한다. 알려진 길이의 두 끝점을 골라 단위를 검산한 뒤 **Review preparation → Import**한다. 단위 미지정은 명시적으로 확인해야 한다.
2. 기존 문서 정리는 **Review PURGE**에서 후보를 확인하고 적용한다. 숨김/잠금·스케치·시트·중첩 블록의 참조가 남은 자원은 미사용으로 취급하지 않는다.
3. Model에서 외곽과 홀 경계를 함께 선택해 **Diagnose / review Make face**를 실행한다. Inspect issue로 틈·중복·T 접합·자기교차·비평면 등의 위치를 확인한다.
4. 필요한 경우 **Propose gap bridges**로 유일하게 대응하는 열린 끝점만 연결한다. 기본 0.1mm, 허용 0–10mm다. 원본 선/호를 바꾸지 않고 수리선을 추가한다.
5. 닫힌 영역/홀 preview를 적용한 뒤 **Extrude selected face…** 또는 아래 벽 작업으로 이어간다.

면은 line/arc/circle 기반 analytic 영역이며 원본 변경을 추종한다. 첫 범위는 최대 2,000 drawing/edge·표시점 200,000이다. 중복 자동 삭제·교차/T 접합 자동 분할·일괄 수리·Z flatten·임의 UCS/spline 면·독립 surface는 지원하지 않는다. 참조 도면이 잠겼으면 별도 편집 가능한 레이어에 결과를 만든다.

## 벽과 문·창 개구부

**Walls & openings**에서 직선 XY 중심선(한 batch 최대 32개) 또는 준비된 footprint/face를 선택하고 높이·두께·기준 레벨을 입력한다. Review는 실제 solid ghost·체적·영향 도면을 표시한다. **Use last applied wall height**는 같은 문서/세션의 마지막 확정 높이를 사용한다.

벽을 선택하고 문/창, 좌우 측면, 원본 시작점에서 **개구부 중앙까지 거리**, 폭·높이·창턱을 지정한다. 문 창턱은 0이며 창 상단은 창턱+높이다. 개구부는 현재 두께를 관통하고 호스트 이동/치수 수정을 추종한다. 삭제하면 벽 재료가 복원된다. 한 host 최대 100개이며 벽 밖·겹침/접촉·상단 초과는 거부한다.

벽은 독립 butt end 또는 준비된 footprint를 사용한다. 자동 코너 융합·곡선 host 개구부·커서 면 pick은 후속이다. 개구부는 직선 중심선 벽/단일 직사각형 띠 footprint의 직사각형 관통 범위다. 복잡한 footprint 벽을 만들 수 있다는 것이 그 벽의 개구부 지원을 뜻하지 않는다.

**Include affected drawing rebind in Review**로 영향 평단면/정투영의 명시적 재연결을 함께 검토할 수 있다. 소실된 주석 대응은 임의 복구하지 않는다. 이후 시트 작업은 [도면과 출력](DRAWINGS-OUTPUT.md)을 따른다.

## 창호·가구 콘텐츠

**Content, floors & finishes…**에서 다음 순서로 작업한다. 트리 선택을 가리는 경우 패널을 닫고 대상을 선택한 뒤 다시 연다.

1. 완성된 단일 solid, 유한 XY drawing, 회전 없는 좌측 정렬 text 또는 내장 image를 선택하고 **Review capture content → Apply**로 정의를 등록한다. 원본은 회전 0/unit scale이어야 하며 translation은 정규화한다.
2. **Explicit space**는 위치·크기·Z 회전·padding/minimum을, **Wall opening**은 벽의 기존 개구부를 슬롯으로 사용한다. Contain은 균등 맞춤, Fill은 축별 맞춤, Natural size는 원래 크기를 유지한다. 지원하지 않는 비균등 곡선 변형은 거부한다.
3. **Instance replacement**는 한 instance만 대체한다. **Reset overrides**는 현재 슬롯을 유지하고 공유 정의로 복귀한다. **Detach content**는 현재 결과를 독립 snapshot으로 남긴다.
4. **Edit shared definition**은 명시적으로 공유 snapshot을 바꾼다. 원본 객체의 모든 편집을 자동 추종하는 정의가 아니다. 참조 중인 정의는 삭제할 수 없다.

라이브러리는 최대 500개 정의, 인스턴스당 단일 space/opening 슬롯이다. opening 콘텐츠는 지원되는 위쪽 직선 벽 host를 사용한다. 2D 슬롯의 Z size/padding/minimum은 0이다. 다중 solid assembly·중첩 정의·외부 library remap·정밀 typography fitting은 후속이다. 콘텐츠가 연결된 개구부는 먼저 콘텐츠를 detach/delete해야 삭제할 수 있다.

## 바닥·천장·마감과 이격

외곽/홀 경계를 선택하고 **Floor / ceiling**에서 레벨·두께를 지정한다. 바닥은 상면 레벨 아래로, 천장은 하면 레벨 위로 돌출한다. 중정 홀과 원본 연결을 유지한다. **3D finish**는 Concrete/Timber/White plaster/Glass의 단색 재질이며 텍스처가 아니다. 기본 **Architecture fitout** 레이어는 작업 묶음이며 범용 Flex 계층이 아니다.

이격 표시는 가까운 최대 12개 객체의 **world AABB gap/contact/overlap**와 보수적인 문 공간 경고다. 정확한 BRep 거리·충돌·문짝 sweep 또는 법규 판정이 아니다. 경사/임의 UCS 슬래브·자동 방/가구 배치·호버 최단거리는 후속이다.

## 구현·검증 근거

[도면 준비](../implementation/WF-A1-FLOOR-PLAN-PREPARATION-2026-10-14.md) → [정리·진단·면](../implementation/WF-C0-A2-B1-2026-10-16.md) → [벽·개구부](../implementation/WF-B2-B3-2026-10-16.md) → [콘텐츠·마감](../implementation/CMP-S1-WF-D1-2026-10-16.md), [최신 대상 검증](../verification/CMP-S1-WF-D1-2026-10-16.json).

각 기능의 첫 지원 범위는 구현됐지만 **전체 주거 과제 발행 검증(WF-Q1)은 미완료**다. 다음 완료 조건은 [실행 큐](../../NEXT-STEPS.md#wf-q1-완료-조건)를 따른다. 네이티브 DWG/SKP 지원은 [교환 경계](DRAWINGS-OUTPUT.md#형식별-지원과-손실)를 따른다.
