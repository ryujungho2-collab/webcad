# SimReady B1 — GLB Resource & Memory Optimization (2026-10-31)

검증된 Import 결과를 CadViewport로 인계해 **중복 GLB decode를 제거**했다. 동일 에셋의 두 placement는 Geometry/Texture/ImageBitmap을 공유하며 Transform과 선택용 Material은 분리한다. 선택 가능한 표시 품질의 실제 해상도·메모리 감소도 확인했다. 리사이즈 CPU 비용과 원본 디코딩 peak는 남아 있어 모든 로딩 구간이 빨라졌다고 평가하지 않는다.

## 사용 및 산출물

Library → External GLB references → Display quality에서 Original(기본), Balanced, Low Memory를 선택한다. 옵션은 현재 뷰포트의 표시 설정이며 문서나 원본에 저장하지 않는다. 페이지를 새로 로드하면 Original이다. 같은 실행 중 문서를 바꾸면 표시 선호는 유지된다.

- 두 placement 실제 CadViewport (local-only, not in repository: `output/verification/simready-b1/hardware/two-placements.png`)
- Balanced 실제 CadViewport (local-only, not in repository: `output/verification/simready-b1/hardware/balanced-viewport.png`)
- 두 placement v64 문서 (local-only, not in repository: `output/verification/simready-b1/hardware/two.webcad.json`)
- SwiftShader 원시 보고서 (local-only, not in repository: `output/verification/simready-b1/swiftshader/browser-report.json`)
- RTX 5080 원시 보고서 (local-only, not in repository: `output/verification/simready-b1/hardware/browser-report.json`)
- 비교 데이터 (local-only, not in repository: `output/verification/simready-b1/comparison.json`)
- Original (local-only, not in repository: `output/verification/simready-b1/hardware/quality-Original.png`) / Balanced (local-only, not in repository: `output/verification/simready-b1/hardware/quality-Balanced.png`) / Low Memory (local-only, not in repository: `output/verification/simready-b1/hardware/quality-Low-Memory.png`) 동일 카메라 700×700 비교

## 조사한 기존 생명주기와 변경 코드

| 영역 | 조사 및 변경 |
|---|---|
| `interop/glbReference.ts` | 기존 prepareGlbAsset → loadGlbReference → 즉시 dispose → CadViewport 재parse 경로를 추적했다. 원본 GLTFLoader/MeshoptDecoder와 검증·timeout·취소 코드를 유지하고, temporary handoff와 뷰포트 범위의 참조 수 관리만 연결했다. |
| `library/ExternalScenePanel.tsx` | 게시 전에 placement ID를 정하고 handoff를 등록한다. 게시 실패/문서 변경 시 해제한다. 기존 read-only 검사 및 위치/회전 명령을 재사용하고 표시 품질 selector를 추가했다. |
| `viewport/CadViewport.tsx` | 기존 meshesRef/scene, raycast, 선택 색상, cleanup을 재사용한다. 동일 에셋을 공유하고 문서·품질 변경 시 기존 외부 렌더 자원을 먼저 반납한다. 비활성 프로젝트의 GLB는 기존 일반 CAD의 30초 유예와 별개로 즉시 반납한다. |
| `cad-document/ExternalSceneAsset.ts` | 원래 WebP 헤더 검증에서 이미 계산한 width/height를 반환하도록 했다. byte/JSON/node/decoded geometry/pixel budgets와 기타 validator 조건은 그대로다. |
| `history`, `documentFile`, `Project Bundle` | 기존 structuredClone snapshot과 v64 원본 base64 저장·검증을 그대로 사용한다. Three.js 객체는 문서/History/Bundle에 넣지 않는다. |
| `tests/simreadyB1.browser.*`, `scripts/browserChecks.mjs` | 기존 27 시나리오를 포함하는 집중 검사, 두 placement, handoff 실패·프로젝트 교체·실제 unmount 및 세 품질 비교를 추가했다. 해당 페이지에 한해 hardware 옵션으로 실행할 수 있다. |

새 Asset System, CAD Scene Graph, Physics Engine 또는 Assembly Solver는 추가하지 않았다. GLB의 바이트/물리 메타데이터/Assembly Preview 의미는 기존 v64 구조를 따른다.

## 인계와 자원 소유권

1. 다운로드한 원본을 기존 parseGlb와 SHA-256으로 검증하고 실제 GLTFLoader + MeshoptDecoder로 파싱한다.
2. 성공한 렌더 결과를 단일 temporary handoff에 보관한다. 유효한 document/placement context를 확인하며, 미사용 결과는 최대 10초 후 해제한다. 새 handoff는 이전 미사용 결과를 해제한다.
3. 기존 dispatchCadCommand가 게시하면 viewport가 같은 byte 내용/해시/크기/품질을 확인하고 인계받는다. 정상 Import의 실제 상태는 `reuse: handoff`이며 사전 decode 결과를 재사용한다.
4. 같은 뷰포트의 추가 placement는 이미 검증한 동일 원본에 대해서만 Geometry와 Texture를 공유한다. 노드 local transform은 보존하며 바깥 placement와 각 Mesh Material은 분리한다.
5. 한 placement 삭제는 해당 placement의 private Material만 반납한다. 마지막 placement가 사라지면 공유 Geometry/Texture/ImageBitmap을 해제하고 렌더 캐시에서 제거한다. dispose를 반복해도 다른 placement의 자원을 해제하지 않는다.
6. 문서 변경, 게시 거부, Undo, quality 변경, 프로젝트 비활성화, viewport unmount 및 이전 세대의 늦은 decode는 기존 취소와 소유권 검사에 따라 반납한다. Undo history가 렌더 자원을 소유하지 않는다.

캐시 히트에서도 원본 base64 전체 문자열/byteLength/contentHash를 비교한다. 값이 다른 자료를 기존 검증 결과로 통과시키지 않는다. 기본 standalone loader 호출은 서로 공유하지 않고 자기 수명을 갖는다. 원본의 마지막 검사 SHA-256은 `ea517115d26fa35270eea13d7a612813d19612aac80230bd3bc1a34331ada356`이며 MVP와 동일하다.

## 성능 비교

제공된 MVP baseline: first draw 214.0 ms, import-to-frame 3.682 s, texture estimate 170.67 MiB, geometry 7.13 MiB. 아래는 대표 최종 실행 한 번씩의 관측값이며 평균/백분위 성능 보장은 아니다.

| 항목 | MVP baseline | B1 SwiftShader | B1 RTX 5080 |
|---|---:|---:|---:|
| viewport loader 시작 → 첫 draw | 214.0 ms | 59.7 ms | 112.7 ms |
| Import 시작 → 실제 첫 draw | 3.682 s* | 2.762 s | 2.777 s |
| 기존 UI 검사 방식 import-to-frame | 3.682 s | 3.982 s | 3.429 s |
| 다운로드 | 미분리 | 1654.2 ms | 1625.0 ms |
| Import header/hash/base64 검증 | 미분리 | 64.3 ms | 46.4 ms |
| 실제 preflight GLTF load (검증 포함) | 미분리 | 219.3 ms | 180.0 ms |
| Original texture upload CPU submission | 미분리 | 43.1 ms | 80.3 ms |
| Geometry backing buffer | 7.13 MiB | 7.13 MiB | 7.13 MiB |
| 정상 Import decode 회수 | 2 | 1 (handoff) | 1 (handoff) |

\* MVP의 import-to-frame은 테스트의 UI 대기까지 포함한 값이다. B1은 실제 첫 draw timestamp와 기존 검사 방식 둘 다 기록했다. 서로 같은 정의인 세 번째 행으로 baseline과 비교해야 한다. 최종 SwiftShader의 같은 방식 import-to-frame은 3.682 → 3.982 s로 오히려 늘었다. 전체 로딩 시간 단축은 확인하지 못했다. 네트워크 지연과 publication 검증 비용도 있어 end-to-end 변화 전체를 decode 최적화 효과로 귀속하지 않는다. first draw는 GPU 완료 시간이 아닌 CPU draw callback이다.

세 품질의 실제 로딩·할당:

| 장치 | 표시 품질 | 실제 bitmap 해상도 | 검사+parse wall ms | resize wall ms | upload submission ms | texture estimate MiB |
|---|---|---|---:|---:|---:|---:|
| SwiftShader | Original | 1024x1024 | 201.7 | 0.0 | 47.6 | 170.67 |
| SwiftShader | Balanced | 512x512 | 315.5 | 119.2 | 17.4 | 42.67 |
| SwiftShader | Low Memory | 256x256 | 228.7 | 46.8 | 4.2 | 10.67 |
| RTX 5080 / D3D11 | Original | 1024x1024 | 157.2 | 0.0 | 57.8 | 170.67 |
| RTX 5080 / D3D11 | Balanced | 512x512 | 231.6 | 82.1 | 23.4 | 42.67 |
| RTX 5080 / D3D11 | Low Memory | 256x256 | 209.8 | 35.4 | 5.6 | 10.67 |

Meshopt는 기존 async decoder를 감싸 각 decode promise의 경과 합(`meshoptMs`)을 수집했고, Texture는 GLTF의 기존 ImageBitmapLoader 작업 경과 합(`textureDecodeTaskMs`, blob URL read 포함)을 기록했다. 병렬 실행의 대기 시간이 중첩되므로 이 합을 parse wall에서 빼거나 CPU 사용 시간으로 해석하지 않는다. 상세값은 원시 보고서에 있다. upload는 renderer.initTexture 호출의 CPU wall이다. 별도 품질 검사에서 render 후 gl.finish wall도 기록했으며 GPU timer query나 VRAM 실측값으로 부르지 않는다. standalone 품질의 loadMs에는 새 WebGL context 생성도 포함되어 제품 first draw와 구분한다.

장치는 WebGL debug renderer 문자열로 확인했다. SwiftShader는 Vulkan software renderer, 실제 GPU는 **NVIDIA GeForce RTX 5080 / ANGLE D3D11**이다. 두 환경의 속도를 섞지 않는다.

## Texture policy와 화면 품질

- Original: 최대 원본 크기 유지. 해당 에셋 32×1024², bitmap RGBA 약 128 MiB, mip 포함 estimate 170.67 MiB.
- Balanced: 최대 변 512, 종횡비 유지·확대하지 않음. 32×512², bitmap 약 32 MiB, mip 포함 42.67 MiB (**75% 감소**).
- Low Memory: 최대 변 256. 32×256², bitmap 약 8 MiB, mip 포함 10.67 MiB (**93.75% 감소**).
- 기존 WebP를 먼저 디코딩한 다음 createImageBitmap으로 resize하고 원래 bitmap을 닫는다. 원본 파일을 바꾸지 않는다. 따라서 **최초 원본 디코딩 비용과 peak가 제거되지는 않는다**. resize는 추가 CPU 비용이다.
- 동일 700×700 카메라의 PNG와 정량 이미지 비교 (local-only, not in repository: `output/verification/simready-b1/hardware/image-quality.json`)를 제공한다. 배경 제외 foreground MAE/RMS도 포함한다. 전체 형상과 파트 배치는 보존되며 이 에셋의 overview에서 차이는 작다. 텍스트·얇은 무늬의 확대 품질을 일반적으로 보장하지 않는다.

KTX2/Basis는 설치된 Three.js 0.180.0에 GLTFLoader.setKTX2Loader / KHR_texture_basisu와 KTX2Loader, Basis transcoder가 있는 것을 조사했다. [공식 KTX2Loader 문서](https://threejs.org/docs/pages/KTX2Loader.html)는 GPU 지원 형식으로 transcode하기 전 detectSupport(renderer)를 요구한다. 현재 에셋은 WebP이므로 연결만으로 GPU 압축이 되지 않는다. 새 변환·배포 파이프라인을 만들지 않았고 기존 preflight의 미지원 required extension 거부도 유지했다.

## 다중 배치·저장·메모리

두 placement는 서로 다른 ±1200 mm 위치를 사용한다. 실제 뷰포트 표시, 독립 Material 강조, Geometry 공유, 한 개 삭제 후 잔존 표시, 전체 삭제 후 회수, Undo/Redo, durable reload를 검증했다. 문서의 원본 asset record는 하나이며 한 개 문서 3,568,175 characters → 두 개 3,569,041 characters로 placement 정보만 **866 characters** 증가했다. base64 3,565,612 chars / 원본 2,674,208 bytes다.

renderer counters는 두 placement에서 **Geometry 35 / Texture 32**를 유지했다. 한 개 삭제 후 Texture 32, 마지막 삭제 후 **Geometry 0 / Texture 0**. 실제 viewport unmount에서도 `livePlacements=0`, `decodedResources=0`, `pendingHandoffs=0`이다. 소유권 카운터는 CPU 렌더 객체이며 GPU 카운터와 별개다.

JS heap 관측 (MiB):

| 장치 | 두 번째 배치+두 move 전/후 | 10개의 structuredClone 문서 snapshot 전/후 | snapshot 구간 변화 |
|---|---:|---:|---:|
| SwiftShader | 154.50 → 164.43 | 168.30 → 170.95 | 2.65 |
| RTX 5080 | 142.37 → 200.30 | 204.55 → 214.80 | 10.25 |

snapshot 실험은 복사본을 유지한 상태에서 이벤트 루프를 양쪽 150 ms 진행시켜 관측했다. 이후 복사본 참조를 제거하지만 GC를 강제하지 않는다. JS heap은 브라우저 GC와 표본 갱신에 따라 감소하거나 변화가 포착되지 않을 수 있다. 이 수치는 snapshot의 직렬화 크기 또는 원본 byte 크기를 실제 heap 증가로 환산한 값이 아니다. 개별 V8 문자열의 내부 공유 여부나 history 전체 상주량을 보장하지 않는다. ImageBitmap·드라이버/GPU 할당은 이 JS heap에 포함되지 않는다. B1은 History의 복사 정책을 변경하지 않았다.

## 검증 및 남은 제한

- 기존 집중 단위 검사 `simready.test.ts + projectBundle.test.ts + historyState.test.ts`: **21 tests 통과**.
- 기존 `--page=simready`: **27 시나리오 통과**.
- `--page=simreadyB1`: **57 checks**, SwiftShader 및 `--hardware-gpu` 각각 통과.
- 제품 build 통과. Vite 대형 chunk 경고는 남아 있다. 전체 suite 및 전체 브라우저 감사는 실행하지 않았다.
- 기존 원본 해시, 손상 GLB 거부, transform/단위, Joint preview, read-only cad.inspect, 저장/Bundle, 실제 취소와 late decode cleanup을 유지했다.
- B1은 transient publication 거부, 프로젝트 교체, 두 placement 공유와 독립 강조, 각 quality의 실제 WebGL 회수 및 실제 CadViewport unmount를 추가 검증했다.
- 첫 parse의 완전한 hard cancellation은 여전히 main-thread 동기 작업을 중단하지 못한다. cache에 남은 asset byte는 활성 placement 수명까지만 유지한다. history가 원본 바이트를 보관하는 기존 비용은 별도다.

## 다음 AI Agent 단계

기존 cad.inspect의 bounded source/파트·Joint·물리 summary를 재사용할 수 있다. 원본 bytes나 수천 개 노드를 LLM으로 보내는 경로는 추가하지 않았다. 다음 최소 단계는 기존 inspect에 선택 품질·실제 해상도·shared owner count와 추정 메모리의 짧은 read-only 설명을 제공하는 것이다. AI가 표시 품질을 제안한다면 사용자 표시 설정과 문서/CAD 변경을 구분해야 한다. BRep 변환·Assembly Apply나 물리 solver 연결은 B1 범위에 포함하지 않는다.
