# SimReady GLB integration MVP — 2026-10-31

WebCAD에 SimReady GLB를 **외부 시각 참조**로 삽입하는 경로를 구현했다. 실제 지정 에셋 한 개를 다운로드·디코딩하고 기존 CadViewport에서 표시했다. 정밀 BRep, Editable Mesh 변환, 물리 시뮬레이션 및 Assembly Apply는 구현하지 않았다.

## 사용 방법과 결과 파일

1. WebCAD의 **Library → External GLB references → Import SimReady arm**을 누른다. 로컬 `.glb`도 열 수 있다.
2. **3D → Fit all**로 화면에 맞춘다. 캔버스에서 객체 선택, 파트 계층에서 개별 노드 강조가 가능하다.
3. Placement의 XYZ 위치(mm)·회전(degrees)을 기존 명령으로 변경한다. Undo/Redo와 일반 프로젝트 저장을 그대로 사용한다.
4. Metadata와 Assembly mapping preview를 펼쳐 값의 존재/유효성, 원본 데이터, 후보 또는 거부 사유를 확인한다.

- [실제 CadViewport 스크린샷](../../output/verification/simready/viewport.png)
- [파트 선택·메타데이터 스크린샷](../../output/verification/simready/part-inspector.png)
- [재열기 가능한 WebCAD 문서](../../output/verification/simready/reference.webcad.json)
- [검증 보고서와 관측 원시 수치](../../output/verification/simready/browser-report.json)
- [출처·버전·라이선스·해시](../../output/verification/simready/source-provenance.json)
- [분리된 Assembly Preview](../../output/verification/simready/mapping-preview.json)

스크린샷은 테스트 전용 배치 안에서 **제품의 실제 CadViewport와 ExternalScenePanel**을 실행한 것이다. 별도의 Three.js 데모 뷰어를 만든 것이 아니다. 제품 LibraryPanel에도 같은 컴포넌트가 연결되어 있다. 전체 워크벤치 브라우저 감사는 실행하지 않았다.

## 조사와 재사용

| 기존 코드 | 확인 및 재사용 방식 |
|---|---|
| `apps/web/scripts/cafeModelViewer.ts`, `gardenHouseViewer.ts` | GLTFLoader의 기존 사용 확인. 편집기 GLB Import는 없어서 동일 Three.js 패키지의 GLTFLoader를 편집기용 모듈에서 사용한다. 새 렌더러를 만들지 않았다. |
| `viewport/CadViewport.tsx` | 기존 scene, meshesRef, 카메라, fit, raycast, 선택 색상, 객체 Transform, 프로젝트 비활성화/삭제 cleanup에 연결했다. |
| `library/LibraryPanel.tsx` | 기존 라이브러리 안에 GLB 참조 import/inspection 섹션을 추가했다. |
| `cad-document/Scene.ts` | 기존 Scene은 artboard/슬라이드, 문서 객체 참조, 상태·전환·트랙용이다. GLB 내부 트리와 의미가 달라 변경하지 않았다. |
| `CadDocument`, `CadObject`, `FeatureContract`, `GeometryRegistry` | 문서의 원본 바이트 레지스트리와 기존 객체/feature placement를 사용한다. 표현은 `external-reference`이며 exact measurement는 false다. 별도 CAD Scene Graph를 만들지 않았다. |
| `state/commandBus`, `dispatchCadCommand`, `history` | 기존 CommandBus에 `insert-external-scene` handler 하나를 등록했다. 기존 move/rotate/delete/Undo/Redo를 재사용한다. |
| `serialization`, `documentFile`, `durableRecovery`, `projectBundle` | v64 원본 GLB 임베딩, 참조 검증, 재열기와 기존 durable 저장. Bundle의 기존 16 MiB 제한은 유지한다. |
| `copilot/cadToolSession`, `cadToolContract` | 기존 read-only `cad.inspect`에 bounded summary를 추가했다. 같은 도구를 쓰는 Copilot/MCP에서 이용 가능하며 새 MCP 도구는 없다. |
| `Assembly.ts`, `assemblyCommands.ts` | 기존 Fixed/Revolute, parent-local origin/axis, parent-relative rest 및 단일 부모 강체 트리 의미와 비교한다. 기존 Assembly에 자동으로 삽입하지 않는다. |

## 원본과 라이선스

- 파일: `glb/arm_articulated_support_a01.glb` — 2,674,208 bytes (2.55 MiB)
- 데이터셋 버전: `e52172290393dde80e8d383861db94b8d0e92ec3`
- [고정 원본 URL](https://huggingface.co/datasets/codepawl/simready-glb/resolve/e52172290393dde80e8d383861db94b8d0e92ec3/glb/arm_articulated_support_a01.glb)
- 원저작자 **NVIDIA**, 변환/최적화 **codepawl**. 데이터셋 카드의 표기: **CC BY 4.0**.
- [NVIDIA 원본 데이터셋](https://huggingface.co/datasets/nvidia/simready-assets), [라이선스](https://creativecommons.org/licenses/by/4.0/), [고정 데이터셋 설명](https://huggingface.co/datasets/codepawl/simready-glb/blob/e52172290393dde80e8d383861db94b8d0e92ec3/README.md)
- SHA-256: `ea517115d26fa35270eea13d7a612813d19612aac80230bd3bc1a34331ada356`

원본 파일은 마지막 검사에서도 같은 해시다. 전체 데이터셋은 받지 않았다. 문서에 원본 바이트를 보관하므로 저장 후 원격 URL이 없어도 참조 형상을 다시 표시할 수 있다. 네트워크 시간 측정과 취소 검증에서 같은 단일 파일의 요청을 반복했다.

## 로딩·수명 관리

- 기존 Three.js **GLTFLoader + MeshoptDecoder**. `EXT_meshopt_compression`, `EXT_texture_webp`, `KHR_mesh_quantization`, `KHR_texture_transform`을 확인한다. optional `KHR_physics_rigid_bodies`는 메타데이터로 검사한다.
- 파일/문서 GLB 원본 8 MiB, JSON 1 MiB, 노드 2,048, decoded geometry 예산 64 MiB, 이미지 64개·각 변 4,096 이하·합계 32 megapixels. 소스 크기뿐 아니라 실제 WebP 헤더 크기를 검사한다.
- GLB header/chunk 길이, buffer range, accessor allocation, 계층 cycle/다중 부모, 외부 buffer/image URL과 미지원 required extension을 사전에 거부한다.
- 60초 요청 deadline, 20초 parse deadline, 다운로드 진행·취소, SHA-256 검사, 실제 예외 메시지를 제공한다. 재열기 중 실패도 뷰포트에 표시한다.
- cancellation/error 이후 뒤늦게 resolve되는 dependency까지 정리하고, 이전 로딩이 현재 상태를 덮지 않도록 세대를 구분한다.
- Geometry/Material/Texture를 공유 관계에 따라 중복 없이 해제하고 ImageBitmap.close를 호출한다. renderer.renderLists와 renderer 자체의 기존 cleanup도 유지한다.
- WebCAD 기본 길이 mm, Z-up에 맞춰 바깥 placement 아래에 `Rx(+90°) × S(1000)`을 추가한다. **31개 원본 노드의 local matrix 보존**과 `(0,1,0)m → (0,0,1000)mm`를 브라우저에서 검사했다.
- 관측 bounds: 약 1388.9 × 1198.3 × 2621.4 mm. 실제 물리 크기에 대한 독립 실측 검증은 아니다.

현재 범위는 self-contained static GLB + embedded WebP다. PNG/JPEG, skins, morph targets, animation, 외부 파일 의존성은 MVP에서 거부한다. parse deadline은 비동기 결과를 취소하고 늦게 생기는 자원을 회수하지만, main-thread 동기 작업을 강제 중단하는 Worker deadline은 아니다.

## 파트·Joint·물리 정보

| 항목 | 실제 파일 결과 |
|---|---:|
| 전체 노드 | 31 (변환 그룹과 joint frame 노드 포함) |
| mesh 노드 / glTF mesh 정의 | 8 / 8 |
| 렌더 Mesh/primitive | 35 |
| 삼각형 | 442,887 |
| glTF 재질 / WebP 이미지 | 12 / 32 |
| rigid body motion | 8 |
| 유효한 수치 mass / inertiaDiagonal | 8 / 8 |
| physics material 정의 | 2 |
| Joint 인스턴스 | 7: Revolute 5, Prismatic 2 |
| physics extension joint 정의 | 5 (인스턴스와 별도 집계) |

원본 physicsMaterials는 friction/restitution `0.4/0.4/0.4`, `0.3/0.3/0.1`이다. 질량 kg, 밀도 kg/m³, 관성 kg·m² 및 중심 m는 원본 단위를 명시해 조회하며 실제 물리적 정확성의 증거로 사용하지 않는다. 각 속성을 absent/valid/invalid로 구분하고 raw extras/extension은 원본에 유지한다. `valid`는 지원하는 스키마와 수치 검사를 통과했다는 의미다.

Assembly 후보는 `arm_01`, `arm_02`, `handle_01`, `handle_02`, `column_01`의 Revolute 5개다. `plate_01`, `plate_02`의 Prismatic 2개는 거부 사유와 원본 정보를 유지한다. Fixed는 합성 fixture로 검증했으며 실제 에셋에는 없다.

Preview는 원본 모델 rest frame의 축·pivot을 CAD 좌표로 옮긴 뒤 parent-local origin/axis와 `inverse(parent) × child` rest를 계산한다. extension의 양쪽 frame origin(0.1 mm 이내), 방향, 축, limits 및 unit scale/shear를 cross-check한다. cycle, 다중 부모, 잘못되거나 모호한 참조는 후보 변환을 거부한다. 원본을 변경하지 않으며 candidate ID는 가상의 node ID다. **실제 독립 WebCAD BRep/mesh 파트가 없으므로 Assembly Apply는 지원하지 않는다.**

## 성능과 메모리 관측

한 번의 최종 대표 실행 값이며 평균/백분위 벤치마크가 아니다. Windows Edge 156 headless, 기존 runner의 **SwiftShader software WebGL**, 1440×1000 요청 창에서 관측했다. 하드웨어 GPU VRAM 측정치가 아니다.

| 지표 | 관측값 |
|---|---:|
| Import 클릭 → 검증된 첫 표시 | 3.682 s (네트워크, 사전 decode, 명령 적용, viewport decode, UI 검사 대기 포함) |
| viewport 원본 검사 + parse | 159.7 ms |
| viewport 로딩 시작 → 첫 draw | 214.0 ms |
| geometry backing buffer bytes | 7.13 MiB |
| texture RGBA + mip 추정 | 170.67 MiB |
| JS heap import 전 / 표시 후 | 25.70 / 51.93 MiB |
| JS heap lifecycle 시나리오 완료 후 | 175.85 MiB |
| 실제 renderer geometry / texture 수 | 35 / 32 |
| 독립 실제 WebGL lifecycle 해제 후 | **0 / 0** |

texture bytes는 32개 1024² 이미지의 RGBA+mip 추정치다. JS heap에는 ImageBitmap/GPU 메모리가 포함되지 않으며, 종료 heap은 Undo history, Bundle/파일 스냅샷과 추가 lifecycle 로딩을 포함한다. GC를 강제하지 않았으므로 단일 에셋의 상주량이나 JS 누수 부재를 뜻하지 않는다. Geometry 35개, 현재 렌더 Material 35개, Texture 객체 44개의 dispose 이벤트와 decoded bitmap close를 확인했다. 서로 다른 Texture 객체가 같은 이미지의 GPU allocation을 공유하므로 renderer의 32와 구분한다.

## 검증과 AI 접근

- `pnpm --filter @agent-webcad/web exec tsx --test tests/simready.test.ts tests/projectBundle.test.ts tests/historyState.test.ts`: **21 tests 통과**.
- `pnpm --filter @agent-webcad/web exec node scripts/browserChecks.mjs --page=simready`: **27 checks 통과**.
- `pnpm --filter @agent-webcad/web run build`: 통과. Vite 500 kB 초과 chunk 경고는 남아 있다.
- 전체 Unit Suite 및 전체 브라우저 감사는 실행하지 않았다.
- 브라우저는 원격 import, 실제 Cancel, native canvas picking, 파트 강조, 위치/회전, Undo/Redo/Delete, 원본 해시, durable 저장/재로드, 문서 reopen, Bundle 왕복, 좌표 변환, 모든 원본 Transform, 실제 WebGL upload/dispose, 로딩 오류와 in-flight cancel을 검증한다.
- in-flight 취소 테스트는 실제 ImageBitmap 완료 반환을 잠시 보류해 CPU/cache 속도와 무관하게 취소 경합을 재현한다. 성능 관측은 이 보류 이전에 수집한다.
- `cad.inspect`의 실제 단일 객체 응답은 1,639 characters였다. 이름/출처/노드·Joint 수와 타입/물리 속성 available 상태/변환 제한만 노출한다. 원본 base64와 전체 노드 JSON을 보내지 않으며 기존 64 KiB 응답 제한을 유지한다. 외부 LLM 또는 MCP client와의 네트워크 왕복은 이 검증에서 호출하지 않았다.

## 다음 최소 단계

1. 텍스처 해상도/decoded memory 예산을 선택할 수 있게 하고, import 사전 decode와 뷰포트 재decode 사이의 임시 자원 인계를 검토한다. 지금은 오류 없는 파일만 문서에 넣기 위해 두 번 디코딩한다.
2. 단일 reference node의 read-only 상세 조회가 AI에 필요할 때 기존 inspect에 node selector/pagination을 확장한다. 전체 GLB/계층 전송은 계속 제외한다.
3. 더 큰 에셋을 지원하기 전에 bounded parsing과 Meshopt 작업을 Worker로 옮겨 hard cancel과 deadline을 검증한다. Assembly Apply를 추진하려면 먼저 독립 part 표현과 source-to-part identity 정책을 정해야 한다.
