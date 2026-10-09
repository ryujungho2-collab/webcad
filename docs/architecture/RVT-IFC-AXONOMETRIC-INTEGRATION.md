# RVT·IFC·Axonometric 연동 계획

갱신일: 2026-10-05

이 문서는 `axo`를 axonometric/isometric 3D 뷰로 해석한 연동 계획이다. RVT를 WebCAD 문서의 원본 포맷으로 직접 결합하지 않고, BIM 의미는 중립 모델과 adapter를 통해 연결한다.

실행 시점은 [최종 기획 G6](../IMPLEMENTATION-READINESS-2026-10-05.md)의 선택 확장이다. 기본 CAD·벡터·이미지·레이아웃 엔진을 우선한다. 아래 Axo 우선은 이 연동 묶음 안의 순서이며, 아트보드보다 먼저 RVT나 WebGPU를 구현하라는 뜻이 아니다. Axo는 현재 WebGL·CAD 객체만으로 독립적으로 검증할 수 있어야 한다.

## 결정

2026-10-09 실행 우선순위 변경: [1차 건축·기계 CAD 목표](../product/ARCHITECTURE-MECHANICAL-MILESTONE.md)에 따라 외부 연동 없는 모델 뷰 계약을 G6-A1, UI를 G6-A2로 먼저 진행한다. 아래 Axo first slice는 전체 도달 범위이며 section/crop/출력까지 첫 요청에 구현하지 않는다. RVT/IFC는 별도 후속으로 유지한다.

1. **Axo 뷰는 먼저 구현한다.** Axonometric은 파일 포맷이 아니라 3D 카메라·투영·section/crop·Fit·출력 설정이다. 현재 CAD 솔리드와 향후 BIM 객체 모두에 바로 적용할 수 있다.
2. **RVT는 직접 parser를 만들지 않는다.** RVT는 Revit의 문서·API 생태계에 묶인 포맷이므로 웹 문서 모델에 원본으로 넣으면 버전·라이선스·변환·참조 손실 위험이 커진다.
3. **IFC를 첫 BIM 교환 경계로 둔다.** Autodesk Revit API에는 IFC export가 있고, IFC는 RVT를 사용하지 않는 IFC 인증 애플리케이션과 교환하기 위한 경로로 제공된다. [Revit IFC export API](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/7efa4eb3-8d94-b8e7-f608-3dbae751331d.htm), [Autodesk IFC 안내](https://help.autodesk.com/cloudhelp/2023/ENU/Revit-DocumentPresent/files/GUID-6EB68CEC-6C17-4B16-A509-30537F666C1F.htm)
4. **RVT 직접 연결은 선택적 변환 서비스로 남긴다.** 사용자가 명시적으로 RVT를 제공하고 Revit/APS 또는 별도 변환기를 사용할 수 있을 때 `RVT → IFC/중립 IR → WebCAD`를 실행한다. 변환기를 설치하지 않아도 WebCAD의 CAD 편집과 IFC 작업은 동작해야 한다.

열린 Revit 문서를 Revit API/MCP로 조회·변경하는 live adapter와 `.rvt` 파일을 중립 데이터로 변환하는 adapter는 별개의 실행 환경·권한·버전 계약이다. 한쪽 지원으로 다른 쪽의 파일 가져오기·왕복 편집을 완료했다고 표시하지 않는다.

## 모델 경계

```text
RVT (선택적 Revit/APS 변환)
        ↓
IFC / BIM interchange adapter
        ↓ sourceId + semantic metadata + geometry reference
WebCAD BIM IR
        ↓
CadDocument / dependency graph / axonometric ViewPreset
        ↓
WebGL/WebGPU viewport · PDF/SVG/PNG · Manim/scene export
```

RVT/IFC의 source ID와 WebCAD 객체 ID를 매핑하고, 변환되지 않은 속성·호스트·패밀리·링크·뷰는 손실 목록으로 기록한다. IFC를 읽었다고 모든 Revit family 동작이나 parametric history를 보존했다고 표시하지 않는다.

## Axonometric `ViewPreset`

공통 3D 뷰 계약은 다음 값을 가진다.

- projection: `orthographic` 또는 `perspective`
- azimuth/elevation과 up axis
- target/eye 또는 view direction
- section box, crop, visible layers/categories
- fit 대상과 출력 scale/resolution
- hidden-line, shaded, wireframe, material 표현

Revit API도 3D view를 perspective와 isometric으로 구분하고 isometric view를 생성하는 API를 제공한다. [View3D.IsPerspective](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/b9d49b93-a2f5-cf17-0b69-8c66be8a9a46.htm), [View3D.CreateIsometric](https://help.autodesk.com/cloudhelp/2026/ENU/Revit-API-MainReference/files/html/a913253d-2a92-b345-2b9a-882c1b152511.htm)

이 preset은 Revit 전용 이름이나 카메라 객체를 저장하지 않고 WebCAD의 좌표계·단위·객체 ID를 저장한다. 같은 preset을 캔버스, 보드별 출력, PDF/SVG, Manim 장면의 카메라에 재사용한다.

## 첫 구현 범위

### Axo first slice

`3D solid → Isometric ViewPreset → Fit → section box → layer/category visibility → PNG/PDF preview`

완료 조건:

- orthographic axo와 perspective를 명확히 구분한다.
- 모델 선택·section·Fit·Undo/Redo·save/reload에서 ViewPreset identity를 유지한다.
- 동일한 preset이 WebGL 현재 renderer와 향후 WebGPU backend에서 같은 투영을 만든다.
- section/crop은 원본 geometry나 dependency graph를 수정하지 않는다.

### BIM/RVT slice

`IFC import → Wall/Floor/Door semantic object + geometry reference → axo view → property inspect → IFC export`

처음에는 벽·바닥·문·층·재료·기본 속성·source ID만 다룬다. unsupported family, hosted relationship, linked model, phase, view template는 명시적으로 보류하거나 손실 항목으로 표시한다.

RVT는 두 번째 경로로 `RVT export → IFC → import` round trip을 검증한다. RVT 자체의 직접 save나 Revit parametric family 편집은 이 slice의 완료 조건이 아니다.

## 검증·성능·보안 경계

- geometry 위치·단위·층고·방향과 semantic type의 IFC 왕복 비교
- source ID↔WebCAD ID 매핑과 변경된 객체만 재가져오기
- unsupported property/relationship의 손실 보고
- axo camera preset의 deterministic serialization과 renderer parity
- 대형 IFC의 parse·semantic mapping·tessellation·first paint·hover/pick p95
- RVT/IFC 파일을 외부 변환 서비스로 보낼 때 사용자 명시 동의, 파일 크기·시간 제한, 실패 시 원본 불변

현재 repository에는 RVT/IFC import adapter와 axonometric ViewPreset이 구현되어 있지 않다. 이 문서는 선택 연동의 모델·검수 범위를 소유하고 전체 실행 순서는 NEXT-STEPS가 소유한다. RVT 지원 완료를 의미하지 않는다.
