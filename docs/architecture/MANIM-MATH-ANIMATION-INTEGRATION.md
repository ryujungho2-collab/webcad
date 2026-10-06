# Manim 수학 애니메이션 연동 계획

갱신일: 2026-10-05

Manim Community를 CAD 문서의 작도·구속·변경 의도를 설명하는 선택적 렌더링 adapter로 검토한다. [공식 저장소](https://github.com/ManimCommunity/manim)와 [공식 문서](https://docs.manim.community/en/stable/) 기준으로 Manim은 Python 장면을 Cairo/OpenGL로 렌더링하며 MP4·WebM·GIF·PNG 출력과 SVG mobject를 제공한다. 이 특성은 수학 작도 영상과 고품질 export에는 적합하지만, WebCAD의 문서 원본·실시간 선택·구속 solver·WebGPU viewport를 대체하지는 않는다.

## 채택 결정

채택 시 Manim은 `integrations/manim-adapter`에 격리한다. 웹 앱의 기본 설치와 CAD 편집 경로에는 Python·FFmpeg·Manim을 넣지 않는다. 별도 Python 로컬 프로세스·render service·컨테이너에서 실행하며 브라우저 Web Worker에서 Python을 직접 실행하는 구조가 아니다. adapter 없이도 CAD 문서·Preview·Apply·Undo/Redo·현재 WebGL 화면은 동작해야 한다. 향후 WebGPU도 선택 사항이다.

```text
CadDocument / dependency graph
        ↓ 읽기 전용 추출
ConstructionTimeline / AnimationScene (WebCAD 계약)
        ├─ WebCAD live preview: browser timeline overlay (구현 예정)
        └─ Manim adapter: typed scene IR → Python scene → MP4/WebM/GIF/PNG
```

Manim script를 자연어·사용자 입력으로 직접 조합하지 않는다. 문서에서 추출한 검증된 typed scene IR만 adapter가 렌더링하며, 허용된 object/animation 종류·시간·색상·카메라·해상도만 전달한다.

SVG mobject 입력과 전체 장면의 SVG export는 구분한다. 정밀 SVG 출력은 WebCAD vector exporter가 담당하고 Manim 영상·프레임 결과와 별도로 검증한다. 위 Timeline·Scene IR·adapter는 아직 구현되지 않았다.

## WebCAD에서 얻는 경험

- `Point A/B → Segment AB → Midpoint → Perpendicular bisector → Intersection`의 작도 순서를 재생하고 각 객체의 출처를 설명한다.
- 구속 추가·치수 변경·solver 결과를 before/after와 함께 재생해 “왜 이 점이 움직이는가”를 보여준다.
- Trim/Join 뒤 보존·재매핑·삭제된 참조를 색과 시간축으로 표현한다.
- Pattern recipe와 instance 생성, Projection/Extrusion 재생성을 단계별로 보여준다.
- 작업 결과를 교육 자료, 설계 리뷰, 와이어프레임 설명, 발표용 MP4/WebM/GIF로 export한다.

Manim 결과는 문서 객체가 아니라 `AnimationAsset`이다. 원본 geometry와 관계는 WebCAD JSON에 남고, 영상은 문서 revision·scene hash·resolution·fps·renderer를 가리키는 파생 결과로 저장한다.

## 책임 경계

| 책임 | WebCAD가 소유 | Manim adapter가 소유 |
| --- | --- | --- |
| 기하·관계 | geometry, topology, constraint, dependency, unit, identity | 읽기 전용 scene 입력 |
| 시간축 | 명령/작도/재생성 이벤트와 의미 있는 keyframe | Manim `Scene`·`Animation`으로의 변환 |
| 편집 | 선택·스냅·drag·numeric input·solver·Undo/Redo | 없음 |
| 표시 | 캔버스 live preview와 impact overlay | 고품질 설명 장면과 최종 파일 |
| 실패 | missing/ambiguous/stale/locked 입력 거부 | 지원하지 않는 scene IR을 명시적 오류로 반환 |
| 캐시 | revision·scene hash·출력 설정 기반 asset reuse | partial movie/render cache와 cleanup |

## 첫 vertical slice

[최종 기획 G6](../IMPLEMENTATION-READINESS-2026-10-05.md)의 선택 확장이다. CAD·벡터·이미지·레이아웃과 G4의 Scene/Timeline 계약이 안정된 이후 검토하며, 기본 엔진이나 영상 타임라인의 선행 의존성으로 넣지 않는다.

`독립 점 A/B → 선분 → 중점 → 수직이등분선 → 원과의 교점 → 치수 변경 → 재생성`

완료 조건은 다음과 같다.

1. 같은 문서에서 geometry identity와 construction dependency를 읽어 deterministic scene IR을 만든다.
2. 브라우저 Scene/Timeline preview를 구현·검증한다. 현재 WebGL 경로를 재사용하고 WebGPU를 필수로 요구하지 않는다.
3. 선택된 scene IR을 Manim adapter가 렌더링해 WebM 또는 MP4와 마지막 PNG를 만든다.
4. 저장→재로드 후 같은 revision/scene hash가 같은 객체 순서·시간축·결과를 만든다.
5. 원본 문서·History는 렌더링 실패, 취소, stale revision에서도 바뀌지 않는다.

그 다음 Trim/Join impact, Pattern, Projection/Extrusion 장면을 추가한다. 사용자 정의 Python 장면, 임의 코드 실행, 실시간 캔버스의 Manim 의존은 이 범위에 포함하지 않는다.

## 성능·캐시·운영

Manim은 브라우저의 매 pointer 이동에 사용하지 않는다. 입력 중에는 WebCAD의 기존 preview를 쓰고, 사용자가 “설명 영상 생성” 또는 export를 요청했을 때만 비동기 작업으로 실행한다. 작업에는 취소와 진행률을 제공하고 결과가 늦게 도착하면 문서 revision을 다시 확인한다.

캐시 키는 `document revision + scene hash + renderer + resolution + fps + format`으로 만든다. partial render와 결과 asset은 용량 예산·만료·문서 삭제 시 정리하며, 캐시가 없어도 scene IR에서 다시 생성할 수 있어야 한다. browser Cache API는 정적 adapter/WASM 응답에만 사용하고, 큰 결과 파일은 별도 asset 저장 경계를 사용한다.

측정할 값은 scene 추출, script 생성, Manim render, 인코딩, 결과 전송, 취소 복구 시간과 결과 파일 크기다. 실제 browser viewport p95와 Manim export 시간은 서로 다른 지표로 기록한다.

## 검증과 의존성

- scene IR snapshot: 객체 순서·identity·단위·관계·시간축의 결정성
- construction/Trim/Pattern/Extrusion별 adapter contract test
- render 실패·취소·stale revision·지원하지 않는 geometry의 zero mutation
- save/reload·Undo/Redo 후 scene hash와 결과 identity
- 브라우저에서는 preview와 “export 요청→진행→결과 인계”만 검증하고, 렌더러 내부를 UI 테스트로 대체하지 않음

Manim Community 저장소는 MIT 및 커뮤니티 MIT 라이선스로 이중 라이선스되어 있다고 명시한다. 실제 배포 시에는 선택한 버전의 LICENSE·FFmpeg·Python 의존성·컨테이너 SBOM을 별도로 기록한다. 현재 repository에는 Manim이 설치되거나 통합되어 있지 않다.
