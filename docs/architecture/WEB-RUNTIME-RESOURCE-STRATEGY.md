# 웹 런타임 자원 전략

갱신일: 2026-10-05

이 문서는 WebCAD가 데스크톱 CAD와 다른 자원 사용 방식을 갖도록 하는 실행·렌더링·캐시 계약을 기록한다. 현재 구현과 목표를 구분한다. 현재 `CadViewport`는 Three.js `WebGLRenderer`를 사용하고, OpenCascade와 측정·메시 작업은 Worker를 통해 수행한다. WebGPU와 영속 파생 캐시는 아직 구현 완료로 간주하지 않는다.

[최종 기획](../IMPLEMENTATION-READINESS-2026-10-05.md)의 모든 단계에서 성능을 측정한다. 아래 WebGPU 순서는 backend 도입 내부의 순서이며 아트보드·벡터·이미지·레이아웃 구현의 선행 조건이 아니다. 측정으로 renderer 병목이 확인되기 전에는 backend 교체보다 실제 병목과 자원 수명을 먼저 개선한다.

## 목표

문서 원본과 편집 가능 관계는 CPU 문서 모델에 두고, 무거운 계산과 화면 파생물을 필요한 순간에 만들고 버린다.

```text
CadDocument / dependency graph (원본)
        ↓ revision + geometry hash + tolerance + display mode
Worker: solve / BRep / tessellation / path preparation
        ↓ transferable buffers
Render resource cache: GPU buffers, textures, transient overlays
        ↓ capability 선택
WebGPU backend  ───────────────┐
WebGL fallback                 ├→ Canvas / picking / review overlay
CPU 또는 저해상도 fallback ────┘
```

WebGPU는 지원 브라우저에서 우선 선택할 수 있지만 필수 조건으로 만들지 않는다. 브라우저의 GPU·VRAM·메모리 한도와 커널 계산 비용은 여전히 존재하므로, 목표는 “8GB GPU가 필요 없다”는 보장이 아니라 낮은 자원에서도 문서를 열고 편집하며 큰 문서에서는 품질·재계산 범위를 단계적으로 낮추는 것이다.

## 현재 코드에서 바꿀 위치

| 목적 | 현재 위치 | 변경 시 함께 확인할 것 |
| --- | --- | --- |
| 렌더 백엔드 선택 | `apps/web/src/viewport/CadViewport.tsx`의 `THREE.WebGLRenderer` 생성 | WebGPU capability 검사, WebGL fallback, resize·pixel ratio·context loss, 브라우저 회귀 |
| 그리기 리소스 재사용 | `apps/web/src/viewport/drawingRenderer.ts`, `draftingRenderer.ts`, `lineStyle.ts` | revision과 style/tolerance가 바뀔 때만 버퍼·재질을 갱신하고 stale GPU 리소스를 해제 |
| 기하·메시 계산 | `apps/web/src/cad/kernelGeometryService.ts`, `kernelWorkerClient.ts`, `kernelRuntime.ts` | transferable buffer, 취소, worker 재시작, 캐시 실패 제거, OpenCascade 메모리 수명 |
| 세션 파생 경로 | `apps/web/src/state/documentPlans.ts` 및 `getCadPlanDrawingPaths` 호출부 | plan 폐기 시 index/path 캐시도 폐기, 외부 반환값 복제, 문서 revision 불일치 거부 |
| 브라우저 문서 복구 | `apps/web/src/state/documentFile.ts` | 원본 JSON과 파생 메시를 분리. 큰 바이너리를 localStorage에 넣지 않고 용량·만료 정책을 둠 |
| 성능 측정 | `apps/web/scripts/benchmarkInteraction.ts`, `docs/verification/` | cold/warm cache, first paint, hover/preview/apply p95, worker transfer, GPU memory와 eviction을 같은 fixture로 측정 |

## 캐시 계층과 무효화

1. 원본 JSON, 명령, History는 캐시가 아니다. 저장·Undo/Redo의 기준이며 항상 재구성 가능해야 한다.
2. Worker의 BRep·tessellation·측정 결과는 `document revision + object/feature identity + geometry hash + tolerance + operation`으로 키를 만든다. 취소·실패·오래된 revision의 항목은 즉시 제거한다.
3. 세션 메모리 캐시는 LRU와 항목 수·바이트 예산을 갖는다. GPU 리소스는 문서 교체, backend 변경, context loss, eviction 때 명시적으로 dispose한다.
4. 재방문용 영속 캐시는 선택 사항이다. Cache API는 정적 WASM/셰이더 같은 응답에만 사용하고, 구조화된 파생 기하는 IndexedDB 또는 전용 저장소에 버전·크기·만료 정보를 함께 저장한다. 캐시가 없어도 같은 문서를 다시 계산해 결과가 같아야 한다.
5. GPU 캐시 키에는 backend와 device capability를 포함한다. WebGPU 버퍼를 WebGL 리소스로 재사용하거나, 다른 tolerance의 결과를 조용히 재사용하지 않는다.

캐시 적중률을 높이는 것보다 정확한 무효화가 우선이다. partial Apply, stale preview, 잠긴 객체 실패에서 원본과 History가 바뀌지 않는 기존 원자성 계약을 유지한다.

## WebGPU 도입 순서

1. `RenderBackend`에 geometry upload, line/fill, texture, picking overlay, dispose 계약을 만든다. 문서·명령·solver는 이 타입을 참조하지 않는다.
2. 현재 WebGL 경로를 첫 backend adapter로 감싸고 시각 회귀를 고정한다.
3. WebGPU adapter는 capability 검사 후 선택하며, 초기에는 drawing path와 큰 mesh buffer처럼 병목이 측정된 경로만 옮긴다. 지원하지 않는 기능은 같은 review overlay와 WebGL fallback으로 처리한다.
4. context/device 손실, 탭 백그라운드, GPU 메모리 압박에서 CPU 파생물은 보존하고 GPU 파생물만 폐기·재생성한다.
5. 브라우저별 기능·성능 결과를 기록한 뒤 기본 backend를 바꾼다. 기능 플래그나 URL 옵션으로 WebGL을 재현할 수 있어야 한다.

## 측정 기준

같은 문서 fixture와 같은 브라우저에서 다음을 cold cache와 warm cache로 각각 기록한다.

- 초기 문서 열기와 첫 화면 표시
- hover/pick, direct drag, preview, Apply의 p50/p95와 long task
- Worker 계산, transferable 전송, GPU upload 시간
- JS heap, ArrayBuffer, GPU resource 추정량과 eviction 횟수
- 캐시 hit/miss, stale discard, context/device loss 복구
- WebGPU·WebGL·CPU fallback의 정확성 차이와 출력 파일 차이

기존 interaction benchmark의 `getCadPlanDrawingPaths` 수치는 Node 경로 최적화 결과이며, WebGPU 성능이나 browser input-to-paint를 뜻하지 않는다. 실제 측정 전에는 WebGPU 도입이나 하드웨어 요구 완화를 완료로 표시하지 않는다.

2026-10-16 CMP-S1/WF-D1: 평가가 끝난 componentContent와 solidFinish metadata는 primitive mesh/정확 measurement key에서 제외하며 실제 기하와 중첩 source/operand 및 transform은 유지한다. 반환값 복제와 task ownership은 보존한다. material-only source 비교는 연관 view의 불필요한 재생성을 건너뛴다. 신규 3D slot ghost는 원래 solid 종류별 기존 builder를 사용한다. 자세한 범위와 Worker 제출 검증은 [콘텐츠/마감 구현](../implementation/CMP-S1-WF-D1-2026-10-16.md)을 따른다.
