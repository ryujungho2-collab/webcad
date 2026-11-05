# Hybrid CAD 후속 구현 로드맵

기준: 2026-10-25. Phase 1 당시의 전체 후속 계획이며, 제한된 Polygon 편집과 Catmull–Clark 기반은 [Phase 2 구현 문서](HYBRID-GEOMETRY-PHASE-2.md)에 따라 구현되었다. 아래 표의 일반화된 범위(다중 edge bevel, region inset, unequal loop bridge 등)는 여전히 후속 계획이다. 학습 모델은 어느 기하 단계의 실행 의존성도 아니다.

> Phase 3의 실제 Geometry Nodes/Worker/누적 이력과 남은 한계는 [구현 문서](HYBRID-GEOMETRY-PHASE-3.md)를 참조한다. 아래 일반화·대규모 기능은 장기 로드맵이다.

> 제한된 여섯 Brush, Surface refinement, voxel boundary, 명시적 Bake는 [Phase 4 실제 구현](HYBRID-GEOMETRY-PHASE-4.md)을 참조한다. 아래 범용 Sculpt/Remesh 계획 전체가 완료된 것은 아니다.

## 공통 선행 작업

- Phase 1 triangle source를 보존하면서 polygon cage v2를 추가한다. face loop, corner attributes, boundary/crease 규칙을 모델링한다. v1 파일을 파괴적으로 쓰지 않고 메모리 어댑터 또는 명시적 새 버전 저장으로 다룬다.
- manifold half-edge adjacency를 파생 캐시로 구축한다. 엣지 분할·병합 때 one-to-many/many-to-one/missing reference mapping을 연산 결과 계약으로 강제한다.
- validator를 representation별로 분리한다. surface/topology validity와 watertight solid/self-intersection 검증 결과를 별도 필드로 둔다.
- GUI 조작 중에는 scratch geometry만 계산하고 드래그 종료 시 한 명령으로 commit한다. 현재 selection command마다 사용하는 문서 스냅샷과 대형 mesh copy 비용은 개선 대상이다.
- mesh spatial index, 변경 영역 normals/bounds update, Worker 이동, transferable buffer의 소유권을 결정한 뒤 성능 예산을 고정한다.

## 기능별 계획

| 기능 | 선행 조건·실행 계획 | 난도 | 재사용 후보 | 성능 위험 | 검증 및 완료 기준 |
|---|---|---|---|---|---|
| Bevel | half-edge, vertex fan, 선택 edge chain; offset intersection과 miter 규칙, segment 수를 modifier로 저장 | 높음 | 자체 제한된 planar bevel부터, 안정화 후 외부 polygon 연산 검토 | 짧은 edge·높은 valence에서 기하 폭증/자가교차 | cube analytic 폭, concave corner, clamp/거부, manifold·선택 mapping·Undo |
| Inset | planar polygon loop와 hole 지원; 영역별 inset, 경계 offset 교차 정리 | 높음 | 기존 2D offset의 입력·수치 정책 재사용 가능, mesh 위상 편집은 새 구현 | 작은 면에서 collapse, hole merge, 비평면 입력 | 면적·거리 oracle, collapse rejection, 원본 topology 보존 |
| Bridge | 두 boundary loop 선택, 방향·시작점·vertex 수의 대응을 리뷰 | 중상 | 자체 loop matcher + 기존 Preview/Apply | twist, 다른 vertex 수의 resampling, thin triangles | boundary 수 감소, winding, correspondence, 불일치 명시 거부 |
| Loop Cut | quad cage v2, edge-ring traversal, pole/triangle에서 정지 규칙 | 중상 | 자체 half-edge traversal | ring 순환·선택 폭증 | 닫힌 ring/열린 ring/pole, face area 보존, ID map |
| Catmull–Clark | cage v2 → face/edge/vertex subdivision → crease/boundary scheme → non-destructive level | 높음 | [OpenSubdiv](https://github.com/PixarAnimationStudios/OpenSubdiv) WASM 후보 | 단계마다 face 수 약 4배, CPU/GPU 캐시, tessellation seam | 독립 reference 좌표, extraordinary vertex, boundary/crease, level cap, source cage 불변 |
| Proportional Editing | vertex neighborhood 또는 geodesic distance, radius/falloff, pinned selection | 중간 | mesh adjacency/BVH, 필요시 libigl distance routines | 대형 연결 성분 traversal, 매 pointer event 전체 재평가 | radius 밖 고정, 중복 vertex 한 번 이동, falloff endpoints, 취소·Undo |
| NURBS / Freeform Surface | control net, degree/knot/weight, trimmed boundary, face reference contract | 매우 높음 | 기존 OpenCascade 곡선·loft/sweep와 surface bindings 감사 후 확장 | rational evaluation, trimming robustness, tessellation continuity | known surface point/normal, knot insertion invariance, C0/C1/G1, trimmed edge consistency |
| Geometry Nodes | 위 문서의 typed DAG evaluator, outer feature graph adapter, field domains | 매우 높음 | 기존 dependency graph/transaction/cancel infrastructure. 실행기는 새 구현 | 반복 geometry expansion, cache invalidation, instance realization | deterministic replay, cycle/type errors, dirty-node count, time/memory budget, rollback |
| Sculpt Brush | spatial index, brush stroke sampling, affected vertex updates, normals; stroke 하나=명령 하나 | 높음 | [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh)의 spatial query/예제 | 매 프레임 full copy, index rebuild, 긴 stroke undo 메모리 | falloff·pressure oracle, mirrored stroke, framerate/latency, cancel/replay parity |
| Voxel Remeshing | explicit voxel size→SDF→surface extraction; topology loss report | 매우 높음 | [OpenVDB](https://www.openvdb.org/) sparse volume 후보, WASM 또는 별도 service 실험 | 해상도에 따른 O(n³) memory, 얇은 구조 소실 | voxel size별 Hausdorff·체적 오차, thin-wall loss, budget abort |
| Surface Remeshing | edge split/collapse/flip/relax, boundary/feature locks, topology mapping | 높음 | libigl/CGAL 후보 | quality convergence, projection BVH, selfintersection | target edge length 분포, boundary drift, manifold와 feature preservation |
| Mesh-to-BRep Reconstruction | segmentation→primitive/NURBS fit→intersection/trim→sew→solid check. faceted conversion과 구분 | 매우 높음/연구 포함 | 기존 OpenCascade fit/sew/validation, 후보 분석 library | patch 수 폭증, CAD tolerance 충족 실패, 원본 intent 비식별 | fit residual·Hausdorff·sewing gap·kernel validity·independent cross sections. 실패·부분결과 명시 |

## 순서와 검증 게이트

1. **Phase 1b: mesh 기반 강화** — typed representation adapter를 viewport/selection/query에 통일, polygon v2/half-edge, 대량 선택 UI, topology-reference 소비자, 자기교차 검사. 현재의 static registry를 실제 adapter 계약으로 발전시킨다.
2. **Phase 2: 비파괴 자유형상** — modifier source/result 분리 → Catmull–Clark → proportional editing → 제한된 bevel/inset/bridge/loop cut. 각 단계가 source preservation, save/load, stale Apply, batch rollback을 먼저 통과해야 다음 단계로 이동한다.
3. **Phase 3: procedural graph** — typed scalar/vector/geometry node와 외부 feature 참조 → field 도메인 → instances. 캐시 적중·부분 재평가·취소를 측정한 뒤 geometry generation 규모 확대.
4. **Phase 4: sculpt/remesh** — spatial index와 stroke transaction부터, 이후 voxel/surface remesh. 원본 cage와 remesh 결과 사이 참조 손실을 명시하는 UI가 선행한다.
5. **Phase 5: interoperability** — BRep→editable mesh를 먼저 구현하고, faceted mesh→BRep shell과 자유곡면 reconstruction을 별도 출시한다. NURBS 편집은 기존 precise surface capability를 감사한 후 병행 가능하다.

라이브러리 후보는 아직 설치·통합하지 않았다. OpenSubdiv의 현재 `dev` LICENSE는 단순 Apache-2.0 표기가 아니라 **Tomorrow Open Source Technology License 1.0**이며 Apache의 상표 조항과 다름을 명시한다([원문](https://raw.githubusercontent.com/PixarAnimationStudios/OpenSubdiv/dev/LICENSE.txt)). 버전을 고정하고 해당 버전 조건을 검토해야 한다. three-mesh-bvh는 MIT([저장소](https://github.com/gkjohnson/three-mesh-bvh)). CGAL은 package별 GPL/LGPL 및 상업 라이선스 체계이므로 사용할 모듈을 먼저 특정해야 한다([공식 라이선스](https://doc.cgal.org/latest/Manual/license.html)). libigl은 [공식 안내](https://libigl.github.io/#license) 및 파일별 라이선스/외부 copyleft dependencies를 검토하고, OpenVDB는 [공식 라이선스](https://www.openvdb.org/license/)와 브라우저 빌드 비용을 확인한다. Blender 구현 자체를 제품에 복사하는 계획은 포함하지 않는다.

## Phase 1 검증 기록

- 메시 단위/통합 9개 + 공식 MCP SDK 메시 end-to-end 1개: 통과.
- 관련 기존 기능과 함께 실행한 81개 단위/통합 회귀: 통과.
- 별도 MCP broker 2개, 공식 MCP server/stdio 5개: 통과. 로컬 연결은 샌드박스의 EACCES 제한 때문에 승인된 외부 실행으로 검증했다.
- `meshEditing` 실제 Chromium UI/Worker 시나리오 13개: 통과. 생성 Preview/Apply, 실제 화면 Face 선택과 Shift toggle의 객체 선택 유지, Extrude, Vertex Move, Edge Scale, Undo/Redo, BRep 공존, 브라우저 재시작 및 파일 재로드 포함.
- Web production build와 architecture checker: 통과. 기존 번들 크기 경고는 남아 있다.
- 전체 `node --import tsx --test --test-concurrency=4 tests/*.test.ts`: **1,437개 통과, 0 실패, 0 skip**, 약 128초. 실행 당시 전체 `.test.ts` 범위이며 모든 기존 브라우저 페이지를 실행한 것은 아니다.

## 엔진 유지 판단

정밀 BRep 엔진과 문서·명령·history·Worker 경로를 교체할 이유는 Phase 1에서 발견하지 못했다. 기존 OpenCascade는 precise CAD를 계속 담당하고, 별도 mesh/SubD evaluator를 같은 문서와 트랜잭션 아래 추가할 수 있다. 다만 학습·추론 계층만 추가해서 mesh topology editing, nodes evaluation, remeshing이 생기는 것은 아니다. 이들 결정론적 기하 기능과 표현 간 검증·참조 계층을 먼저 구현해야 한다.
