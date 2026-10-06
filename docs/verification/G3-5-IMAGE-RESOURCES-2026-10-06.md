# G3-5 이미지 자원 측정·수정·마감 인계

2026-10-06. 최초에는 focused 검증 후 범위를 분할해 인계했다. 이후 G3-5A 전체 자동 회귀와 I1 원본 교체 검수를 완료했다. 실제 실무자와 native GPU/heap/VRAM 평가는 미실시다. 다음 독립 범위는 [G4-A 기존 Scene 검수](../WORK-SLICES-2026-10-06.md)다.

## 문제와 변경

이전 `createImageSceneObject`는 같은 RasterAsset의 배치마다 새 TextureLoader를 생성했고, `applyCrop`는 UV만 바꾸는 경우에도 `texture.needsUpdate = true`로 픽셀 재업로드를 요청했다.

`imageTextureResources.ts`는 살아 있는 배치의 Texture Source와 decoded image를 공유한다. 배치별 Texture의 repeat/offset과 material uniform은 독립적이다. 마지막 배치 dispose에서 source entry, image callback/src 및 base texture를 해제한다. 유휴/영속 캐시나 타일, import 한도 상향, 새 외부 dependency는 도입하지 않았다. 로딩이 끝나기 전에 모두 해제되어도 늦은 callback이 source를 되살리지 않는다.

`imageRenderer.ts`의 crop/opacity/color preview는 source pixels를 재업로드하지 않는다. 기존 shader 검사도 texture version 증가를 기대하는 대신 texture/source identity, UV/opacity/uniform 갱신과 version 불변을 확인하도록 보강했다.

## 같은 fixture 전후 측정

`imageResources.browser.ts`에서 동일한 red/blue PNG를 두 배치로 만들고 crop/opacity를 9회 변경했다. WebGL render + `gl.finish`, Edge headless/SwiftShader 조건이다. p95는 9개 표본의 상위 값으로 안정적인 실사용 백분위 추정이 아니다. cold 시간은 각 크기당 단일 관측이다.

| 정사각 이미지 | Cold 전→후 ms | Edit p50 전→후 ms | Edit p95 전→후 ms |
| --- | --- | --- | --- |
| 128×128 | 42.6 → 23.7 | 0.4 → 0.2 | 1.2 → 0.8 |
| 2048×2048 | 174.7 → 42.7 | 32.0 → 0.1 | 872.4 → 0.3 |
| 4000×4000 | 155.7 → 92.7 | 1245.5 → 0.1 | 1775.1 → 0.1 |

각 크기에서 렌더러 texture 수는 2→1, 9회 편집의 upload-version 증가 합계는 18→0이다. 4000 fixture의 RGBA 추정은 128,000,000→64,000,000 bytes이며 mipmap/실제 heap/driver VRAM을 포함하지 않는다. 이 큰 차이는 소프트웨어 렌더러의 불필요한 업로드 제거 관측이며 실제 GPU 사용자 작업이 같은 비율로 빨라졌다는 뜻이 아니다.

원본 증거는 [수정 전 JSON](../../output/benchmarks/g3-resources-before.json), [수정 후 JSON](../../output/benchmarks/g3-resources-after.json)이다. 비교 원본을 덮어쓰지 않는다.

## 실행한 검사

- `test:browser -- --page=imageResources --label=before`: 이전 구현 13 checks.
- `test:browser -- --page=imageResources --label=after`: 변경 후 28 checks. 독립 crop/opacity, 실제 픽셀, 원본 불변, 부분/마지막 해제, 로딩 중 해제, 재개방, PNG Worker cancel 포함.
- `tsc -b`: G4/G5 진행 중 변경을 포함한 작업 트리에서 통과.
- `check:architecture`: 286 modules의 geometry/command/import 경계와 문서 링크 통과.
- 장면 Node 4개와 gateway Node 3개, 실제 Scene browser 16개와 mock gateway browser 8개 통과. 이는 G3 전체 회귀를 대신하지 않는다.
- 전체 Node 최초 재실행: 594 중 593 통과, 기존 shader test의 texture version 증가 기대 1개 실패. 자원 재사용 의도를 검사하도록 보강 후 **594 tests / 54 suites 모두 통과, skipped 0**. [전체 Node 로그](../../output/handoff-node-2026-10-06.log).

## G3-5A / I1 자동 회귀 마감

최신 작업 트리의 타입, 전체 Node **599 tests / 54 suites / skipped 0**, 전체 browser **33 workflows / 686 checks**, architecture/import·문서 링크 **294 modules**, `pnpm build` workspace 전체가 통과했다. [Node 로그](../../output/integrated-final-node-2026-10-06.log), [browser 로그](../../output/integrated-final-browser-2026-10-06.log), [architecture 로그](../../output/integrated-final-architecture-2026-10-06.log), [build 로그](../../output/integrated-final-build-2026-10-06.log)를 보존한다. G3-4b3의 587 Node / 28 browser workflows / 602 checks / 274 modules는 이전 검증 기준선이다. 새 Scene이 있는 문서는 v12로 저장된다.

전체 run에 imageWorkflow **38**, PNG **25**, PDF **21**, imageResources **34**, 새 source replacement **16**, TIFF **10**, 기존 관계 재연결 **17** checks가 포함된다. 실제 crop/mask/color·save/reload/recovery·Undo/Redo, 원본 교체/Cancel pixels와 자원 해제, PNG/PDF decoded pixels·크기·page count를 확인했다. I1은 [별도 검수](CREATIVE-IMAGE-HANDOFF-2026-10-06.md)에 기록한다.

최초 전체 run은 PDF native file fetch의 `Failed to fetch`로 중단됐다. 단독 PDF 21개와 최종 전체 run은 테스트 완화 없이 통과했지만 최초 원인은 확정하지 않았다. [실패 로그](../../output/integrated-browser-2026-10-06.log)를 보존하며 재발 여부를 추적한다. production main **1,004.21 kB**, viewport **607.51 kB**의 >500 kB 경고와 OpenCascade WASM 용량은 남아 있다.

[최종 resource JSON](../../output/benchmarks/g3-resources-integrated-final.json)은 동일 fixture·9회 warm edits로 4000×4000 cold 82.0ms, edit p50 0.1ms/p95 0.2ms, texture 1, upload-version 증가 0, RGBA 추정 64,000,000 bytes를 기록한다. 원래 before/after를 덮어쓰지 않았고 p95의 9개 표본/SwiftShader 한계를 유지한다. 현재 benchmark는 isolated resource 과제이므로 실제 App의 zoom/pan/대형 export 비용 전체를 측정한 것으로 취급하지 않는다.

## 남은 외부 평가

외부 실무자 과제는 같은 문서로 `이미지 가져오기 → 복제 → 숫자/canvas crop → 마스크·색상 → 보드별 PNG/PDF → Undo/Redo → 다시 열기`를 수행한다. 완료 시간, 재시도, 막힌 지점, 되돌리기 성공 여부를 기록하고 자동 회귀와 별도로 비교한다. 이 사용자 평가는 아직 실시하지 않았다.

수정 위치: [source 수명](../../apps/web/src/viewport/imageTextureResources.ts), [renderer](../../apps/web/src/viewport/imageRenderer.ts), [자원 browser](../../apps/web/tests/imageResources.browser.ts), [shader/문서 tests](../../apps/web/tests/imageWorkflow.test.ts), [runner](../../apps/web/scripts/browserChecks.mjs).
