# Hybrid CAD Phase 4 최종 안정화 검증

최종 로그 검토일: 2026-10-27 (Asia/Seoul). 측정·실행 기록은 2026-10-26 기준. **전체 제품 브라우저 감사는 완료했으나, 미해결 실패 때문에 Phase 4 완전 안정화 승인은 보류한다.** 구현은 [아키텍처 문서](../architecture/HYBRID-GEOMETRY-PHASE-4.md), 원자료는 output/verification/sculpt-phase-4/에 있다.

## 실제 수정 및 검증 범위

- Sculpt 시작 시 현재 제어 메시·placement·문서 ID와 렌더 객체의 일치를 확인한다. 진행 중에는 DocumentVersion의 ID/revision/generation 전체를 비교한다. Pointer capture 실패, 같은 revision의 문서 교체도 원본을 유지하며 취소한다.
- MCP preview는 평가 **전** 문서 버전/원본 지문을 잡고 평가 **후** 다시 검사한다. 평가 도중 변경된 소스에 대한 receipt는 발행하지 않는다. Bake/Remesh의 ID를 생략해도 새 객체 ID를 명령 계획과 결과 선택에 동일하게 사용한다.
- Vertex/face 제한 외에 20,000 render triangle 제한을 추가하여 큰 N-gon 조합의 BVH 구축을 시작 전에 거부한다. Sculpt 상한 5,000 vertices/10,000 faces는 유지한다.
- Intersection BVH와 좁은 단계 비용을 계측한다. 공유 간선의 비공면/반대쪽 공면 삼각형은 내부 교차가 없음을 이용해 불필요한 clipping을 생략하며 같은 쪽 공면 겹침은 계속 거부한다. 시간·후보 예산 초과를 성공으로 바꾸지 않는다.
- Geometry Nodes가 renderable 정리에서 누락되어 재생성되던 조건을 보완했다. 원본 그래프 변경 시 detached Bake의 stale 표시와 Undo 복구를 브라우저에서 확인했다.
- Remesh 보고에 선택적인 부피·Euler 특성·경계 edge 수를 추가했다. 부피는 닫힌 메시의 절댓값 대수적 삼각형 부피이며 exact solid certificate가 아니다. v58 선택 필드로 저장하므로 파괴적 마이그레이션은 없다.

## 테스트 결과

| 검사 | 결과 | 증거 |
|---|---|---|
| 전체 단위·통합 1차 | 1,717 tests / 54 suites 통과, 실패·skip·cancel 0, 429.6초 | stabilization-all-tests.log |
| MCP 평가 중 변경 방어 포함 최종 집중 회귀 | 32 통과, 실패·skip 0 | stabilization-final-focused.log |
| 중복 전체 단위·통합 재실행 | 동시 실행 비용 때문에 중단; 완료 결과로 집계하지 않음. 기존 1,717 통과 및 후속 집중 32 통과 기록 유지 | interrupted-concurrency-2-tests.log |
| 전체 workspace build | 성공, Vite chunk size 경고 있음 | final-build.log |
| 아키텍처 검사 | 861 모듈 경계·문서 링크 검사 통과 | final-architecture.log |
| Sculpt 실제 Edge | 37 checks 통과 | stabilization-sculpt-browser.log, stabilization-browser-report.json |
| 기존 Triangle Mesh | 13 checks 통과 | stabilization-meshEditing.log |
| 기존 Polygon Mesh | 27 checks 통과 | final-polygonEditing.log |
| Geometry Nodes | 27 checks 통과 | final-geometryNodes.log |
| MCP Bridge 제품 E2E | 마지막 실행 Request timed out; 실패 유지 | final-mcpBridge.log |
| Ellipse DXF 저장·재로드 | 구 v27 기대값을 DXF style 포함 v48 계약으로 수정 후 24 checks 통과 | final-ellipse.log |
| 전체 제품 브라우저 감사 | 172/172 고유 페이지 완료, 미실행 0. 원본 116 통과/56 실패 → 개별 재실행 반영 119 통과/53 미해결 | full-browser-audit.json, final-browser-audit.json |

브라우저 등록은 190개 항목이며 중복 18개를 제외하면 172개 고유 페이지다. 중단 전 완료 로그를 보존해 남은 페이지를 재개했고, 수정한 Hybrid 경로는 별도 재실행했다. 하나의 중단 없는 최종 소스 전체 실행과는 구분한다. 테스트를 삭제하거나 skip해서 통과 수를 늘리지 않았다.

37개 Sculpt 검사는 실제 CDP 입력으로 Grab/Draw/Smooth 변형, Undo/Redo, Escape 취소, generation 변경 취소, 두 Remesh Preview/Apply와 원본 보존, Perspective 및 위치·회전·비균일 scale이 있는 Bake hit, 원본 graph 변경 stale 표시 및 Undo, MCP와 native engine 좌표 동등성, 실제 Worker 취소/stale, BRep 공존, v58 저장 및 브라우저 reload를 확인한다. Inflate/Crease/Flatten은 엔진 테스트에서 확인하며 각 브러시의 실제 mouse E2E는 미실행이다.

### 표면 선택 실패 원인

초기 fixture는 단일 selectedObjectId만 제공하여 Fit Selection이 쓰는 selectedObjectIds가 비어 있었다. 변환된 Bake를 임의의 canvas 중앙 좌표로 누르기도 했다. Mesh/Polygon은 Worker 렌더 완료 전 Fit/클릭이 가능했다. 선택 목록 전달, viewport-sync의 현재 revision 완료 대기, 명시적 Fit, 실제 캡처한 카메라로 대상 중심 투영 및 elementFromPoint canvas 확인으로 고쳤다. 제품도 렌더된 소스와 현재 문서의 일치를 검사한다.

Polygon의 후속 실행은 22개 assertion 통과 후 기존 페이지 전체 60초 한도로 종료되었다. 페이지 harness만 180초로 늘려 27개 모두 통과했다. Worker 5초/교차 1.5초 예산은 그대로다.

전체 제품의 UI 선택자/가림/disabled/assertion/통신 실패는 최종 개별 집계에 보존했다. clean pre-Phase-4 baseline을 별도로 실행하지 않았으므로 변경하지 않은 경로의 실패도 모두 기존 결함이라고 단정하지 않는다.

## 미해결 실패 분류와 이번 세션의 종료 판단

이번 세션에서는 제품 코드·테스트를 추가 수정하거나 재실행하지 않았다. 기존 로그를 대조하고 집계 스크립트가 오류 후 출력된 다른 문장의 timeout 문자열을 원인으로 잘못 잡지 않도록 **첫 실패 메시지** 기준으로 보완했다. 보고서 생성만 실행했으며 제품 테스트 실행이 아니다.

| 분류 | 수 | 해당 페이지 |
|---|---:|---|
| 테스트 코드 문제 | 2 | `draftingWorkflow`, `sketchCanvas` |
| 기존 UI 변경·선택자 불일치 | 2 | `pointWorkflow`, `deliveryWorkflow` |
| 미확인 | 16 | `directEditExperience`, `patternsWorkflow`, `contourWorkflow`, `basicEditWorkflow`, `curveWorkflow`, `contourTrimWorkflow`, `scenesWorkflow`, `copilotQuery`, `sessionContinuity`, `modelDrawing`, `projectTabs`, `courtyardH1`, `residentialExtended`, `internalChamfer`, `wheelNavigation`, `b4ArcWorkflow` |
| 환경·통신 오류 | 1 | `copilotContext` |
| 타임아웃 | 32 | `mcpBridge`, `gardenHouse`, `houseFacade`, `houseLayout`, `pavilionHandoff`, `courtyardPavilion`, `basinHandoff`, `cadToolsAdvanced`, `largeCafe`, `largeCafe3d`, `flowCourt`, `sketchStretch`, `modelSheetLayout`, `modelSheetSet`, `externalCivilStyle`, `externalCivil`, `projectBundle`, `projectHome`, `accessibilityInput`, `projectTabNavigation`, `projectComparison`, `projectRecovery`, `projectManager`, `drawingFrames`, `curveHatch`, `sectionPresentation`, `conicProjection`, `residentialTask`, `architectureWall`, `floorTasks`, `dxfPlacement`, `b5WorkPlanes` |

신규 Phase 4 기능 회귀로 **확정된 미해결 항목은 없다**. 이것은 회귀가 전혀 없다는 보장이 아니다. 미확인 16건 및 타임아웃·통신 실패의 근본 원인을 단정하지 않으며, clean baseline이 없어서 기존 문제라고 일괄 분류하지 않는다. UI 가림·disabled·assertion·ResizeObserver 오류는 인과관계를 확인하지 못해 미확인으로 남겼다.

MCP Bridge는 감사 중 통과 기록도 있지만 마지막 개별 재실행의 `cad.propose` wall/section Review 요청이 시간 초과했다. 최근 실패를 이전 통과로 덮지 않는다. Sculpt/MCP 엔진 집중 테스트의 통과와 제품 전체 MCP Bridge E2E의 실패를 구분한다.

**종료 판단: 기능 MVP 구현과 집중 회귀는 상당 부분 완료, 전체 안정화 완료는 아님. Phase 5 제품화·안정성 전제 확장은 보류한다.** 이번 범위는 종료 조건 판단이므로 제품 전체의 기존 문제 해결이나 비용이 큰 suite 재실행으로 확대하지 않는다. 필요 시 후속 작업에서 범위·비용 승인 후 관련 결함 수정 및 한 번의 최종 전체 suite를 수행한다. 기존 1,717 전체 검사와 집중 32 검사는 서로 중복되므로 합산하지 않는다. 통과 로그는 해당 시점의 증거이며 최종 소스 전체를 중단 없이 한 번에 검증했다는 뜻이 아니다.

## 4,225 / 9,409 정점 비용

Ryzen 7 9800X3D, 논리 16 CPU, RAM 약 66.1 GB, Windows 10.0.26200, Node v24.19.0. Node는 5회 반복했고 일부 workspace build와 겹쳤다. 브라우저는 전체 제품 감사와 겹쳤다. 통제된 독점 장비 benchmark나 성능 보증이 아니다. 원자료: validation-profile.json, stabilization-browser-report.json.

| Node 동기 단계, ms 범위 | 4,225V / 8,192F | 9,409V / 18,432F |
|---|---:|---:|
| JSON 직렬화 | 1.3–1.5 | 3.2–5.0 |
| structuredClone | 9.0–12.5 | 26.0–34.1 |
| surface hit BVH 구축 | 38.5–56.8 | 137.7–154.3 |
| 교차 검사 triangulation/AABB 준비 | 20.2–37.8 | 50.8–71.6 |
| 교차 검사 BVH 구축 | 6.0–14.7 | 22.8–32.5 |
| 후보 탐색 | 26.2–43.4 | 86.8–103.8 |
| 삼각형 pair 판정 및 loop 비용 | 219.4–326.4 | 632.5–708.7 |
| 전체 교차 검사 wall time | 277.3–404.5 | 812.3–903.1 |
| 프로세스 CPU 누적 시간 | 297–672 | 813–984 |

단계별 값은 performance.now 기반 경과 시간이다. process.cpuUsage는 GC 등의 프로세스 thread CPU 누적을 포함할 수 있으므로 wall time과 같지 않다. 동일 입력은 5회 모두 valid였고 후보 수는 각각 67,926 / 153,990으로 동일했다. 15초 진단 경로도 같은 판정·후보 수였다. **9,409V 검사 probe는 제품 Sculpt 지원이 아니며 실제 Sculpt는 5,000V 제한으로 거부한다.** 4,225V의 전체 Node Sculpt는 약 485–615ms였다.

| 실제 Edge 측정 | 4,225V | 9,409V |
|---|---:|---:|
| 순수 Worker echo 왕복 3회 | 22.7–33.2ms | 49.0–58.6ms |
| 요청 JSON 직렬화 | 1.1ms | 2.6ms |
| 최종 Sculpt Worker 왕복 | 1,053–1,725ms | 명시적 예산 거부 |
| rAF 최대 간격 | 32.9ms | 52.1ms |
| request JSON UTF-16 추정 크기 | 1,204,982 bytes | 3,013,254 bytes |
| main heap 전후 차이 | +17,018,632 bytes | +39,714,095 bytes |

Echo는 전체 객체가 양방향으로 복제되는 별도 Worker probe이며 실제 평가 응답의 단방향 전송 시간과 같지 않다. Main heap 차이는 benchmark/render/serialization 할당을 포함하는 snapshot이고 peak 또는 Worker 메모리가 아니다. rAF가 진행됐다는 검사 통과는 60fps 보증이 아니다.

256px 별도 WebGL mesh probe에서 4,225V는 위치 update 0.1–0.2ms, 전체 normals/bounds 1.2–1.8ms, render submit 0.1–0.2ms였다. 9,409V는 각각 0.1–0.5ms, 2.0–3.6ms, 0.1–0.2ms였다. 이는 전체 제품 렌더 프레임 시간이나 GPU timer query가 아니다. gl.finish wait 0–0.1ms는 timer 해상도/스케줄링 영향을 받으므로 GPU 작업이 공짜라는 뜻이 아니다. 실제 작은 Sculpt preview의 CPU buffer/normal/bounds 갱신은 0–1.9ms였다.

### 반복 실행 차이와 증분 검토

이전 4,225/9,409V 실행의 실패는 self-intersection 시간 예산 초과 또는 Worker deadline이었다. 동일 기하를 유효/무효로 번갈아 판정한 증거와는 다르다. JIT/GC/동시 실행 및 OS 스케줄링은 경과 시간을 바꾸지만 각 원인의 기여율은 분리 측정하지 않았다. 이번 반복에서는 기하 판정과 후보 수가 일치했다. 다른 부하/장비에서 같은 완료 시간을 보장하지 않는다.

변경 정점은 89/185개, 인접 변경 면은 216/422개로 전체의 일부다. 증분 검증의 잠재 효과는 있으나 **현재 제품은 전체 검사**다. 원본 전체 인증에 묶인 immutable BVH, 변경 AABB refit, changed↔all 검사, tolerance/topology/cold-cache 무효화가 먼저 필요하다. 초기 load/import/Bake/Remesh, topology/triangulation 변경, 원본 인증 없음, Worker/cache 소실 등에서는 전체 검증이 필요하다. 구체 조건은 아키텍처 문서에 있다.

## Remesh 정확성

원본 40mm box와 기울어진 box(x′=x+0.3z, y′=y+0.17x), 열린 정육각형을 사용했다. 거리 단위는 객체 local mm, 부피는 local mm³이며 object placement/scale이 반영된 world 오차가 아니다. 양방향 vertex/triangle centroid를 방향별 최대 512개 샘플링한다. 샘플 최대 거리는 Hausdorff 계열 근사값이며 연속 표면의 상한이 아니다.

기울어진 box의 Surface 1회 분할·relaxation 0은 최대 편차 약 9.1e−15mm, 상대 부피 차 약 2.3e−16이었다. Surface 3회·relaxation 0.15는 최대 0.6382mm / RMS 0.0929mm, 부피 차 0.4543%였다. 원본 표면에 정점을 투영해도 새 연결 삼각형이 crease를 가로질러 편차와 체적 손실이 생긴다.

| 기울어진 box Voxel 해상도 | cell mm | sampled max mm | sampled RMS mm | 상대 부피 차 |
|---|---:|---:|---:|---:|
| 4 | 13.000 | 9.3398 | 3.5586 | 6.4172% |
| 8 | 6.500 | 4.0229 | 1.6964 | 0.4098% |
| 12 | 4.333 | 2.6181 | 1.1684 | 2.2284% |
| 16 | 3.250 | 1.9094 | 0.9141 | 2.4330% |
| 24 | 2.167 | 1.3250 | 0.6570 | 1.9423% |

모든 위 결과는 Euler 2, boundary 0을 유지했다. **해상도 증가가 부피 오차의 단조 감소를 보장하지 않는다.** 정렬된 cube의 매우 작은/0 오차는 grid alignment의 특수 사례이므로 일반화하지 않는다.

열린 manifold 육각형은 Surface에서 Euler 1을 유지하고 boundary 정점을 고정했다. Voxel은 4/8/12/16/24 모두 closed-manifold 요구로 거부했다. Non-manifold와 잘못된 winding/퇴화/교차 결과는 거부하며 원본은 유지한다. Euler와 boundary 수만으로 연결 성분·작은 구멍·nested shell의 모든 변화를 증명하지 않는다. 얇은 구조, 복잡한 cavity, sphere/scan 데이터셋 전체 검증은 미실행이다.

## Bake·저장·참조 정책

v55/v56/v57 기존 정책을 유지한다. Polygon Sculpt identity provenance는 v57, derivation이 있는 Bake/Remesh는 v58이다. 새 숫자 보고 필드는 optional이며 기존 v58도 로드된다. Remesh 결과는 별도 객체이고 source V/E/F는 결과 provenance에서 deleted/[]이다. 실제 원본 객체의 기존 치수/참조는 원본에 남는다. 가까운 새 정점에 임의 ID mapping을 만들지 않는다.

Bake는 원본 graph/Modifier를 유지하고 독립 control mesh를 만든다. source fingerprint는 원본 graph/외부 input/placement를 포함한다. source 변경·삭제 시 stale이며 자동 rebake·stroke 재투영은 하지 않는다. 영구적인 node→sculpt vertex correspondence를 제공하는 구현은 아니다.

## 미실행·미측정 및 Phase 5 조건

- 전체 제품 browser 실패 해소 및 clean baseline 확보 전 **Phase 4 완전 안정화/Phase 5 제품화 진입은 보류**한다.
- 모든 브러시의 native mouse E2E, 모든 브라우저/장치/드라이버 조합, 큰 메시의 장시간 반복 Stroke/100 Undo 메모리 스트레스는 미실행이다.
- Worker/GPU peak heap, 실제 GPU timer query, 대형 메시의 전체 제품 frame time과 독점 환경 latency 분포는 미측정이다.
- 지속 Worker BVH refit/인증 cache, Transferable buffer, 증분 교차·normal 갱신, 200-event provenance 압축/체크포인트는 미구현이다.
- isotropic collapse/flip, feature-preserving remesh, SDF/Marching Cubes, certified Hausdorff bound 및 exact solid volume는 미구현이다.
- 진입 조건은 실패 분류별 수정·재검증, bounded geometry 성능의 재현 가능한 baseline, source 인증을 유지하는 증분 경로의 differential test, 정확도/참조 손실 계약을 유지하는 후속 기능이다.
