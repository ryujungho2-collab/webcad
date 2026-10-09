# 공개 코드 재사용과 통합 제작 기능 구현

2026-10-06. Photopea에서 재사용 가능한 것과 WebCAD에서 구현할 것을 기존 G0–G6 및 CAD B/X 계획에 연결한다. 라이브러리의 공개 기능, 실제 채택 상태, 제품 기능 완료를 구분한다. 이 문서가 재사용 판단과 연결 순서를 소유하고, 현재 구현·검수는 PROJECT-STATE가 소유한다.

## 가져올 수 있는 코드

| 구성요소 | 확인한 근거 | 실제 활용과 현재 상태 | WebCAD가 별도로 해야 할 일 |
| --- | --- | --- | --- |
| Photopea [UTIF.js](https://github.com/photopea/UTIF.js) | MIT, TIFF decode/encode | `utif@3.1.0` 채택. 제한된 단일 페이지 8-bit TIFF → PNG Worker import 구현 | 한도·취소·오류·원자성·asset identity·편집 UI·저장 |
| Photopea [UPNG.js](https://github.com/photopea/UPNG.js) | MIT, PNG/APNG encode/decode | 후보. 현재 정지 PNG는 browser Canvas/Worker 경로가 있으므로 추가하지 않음 | G4 timeline의 frame/timing과 APNG 내보내기. 지원 이점이 확인된 때만 설치 |
| Photopea [Typr.js](https://github.com/photopea/Typr.js) | MIT, TTF/OTF/TTC/WOFF parsing 및 glyph path | 후보. text-to-path/폰트 import 단계에서 평가 | 텍스트 객체·font asset·편집 UI·줄바꿈·shaping·출력. 기본 shaping과 복잡한 문자 shaping의 지원을 구분 |
| 별도 프로젝트 [ag-psd](https://github.com/Agamnentzar/ag-psd) | MIT, PSD 읽기/쓰기. 공식 README에 색상·텍스트·필터·합성 제한이 명시됨 | 후보, 미설치. Photopea에서 가져온 코드라고 부르지 않음 | layer graph를 canonical model로 변환, 손실 보고, 제한된 composite/레이어 import, CPU/메모리 상한. parser가 레이어 편집기를 완성하지 않음 |
| [Paper.js](https://github.com/paperjs/paper.js) / [SVG-Edit](https://github.com/SVG-Edit/svgedit) | MIT 벡터 path/편집 기술 | 기존 후보 유지. 둘을 동시에 도입하지 않음 | 정확한 CAD 객체와 자유곡선의 경계·노드 UI·참조·단위·Undo. CAD analytic curve를 근사 path로 바꾸지 않음 |
| [PptxGenJS](https://github.com/gitbrent/PptxGenJS) | MIT, OOXML/PPTX 생성 | G4 출력 후보, 미설치 | Scene/slide/layout·animation 의미와 PPTX 변환 손실·사용자 검토 |

의존성은 필요한 기능의 adapter/Worker 안에서 고정 버전으로 도입한다. 문서·명령·solver에 외부 객체 타입을 노출하지 않는다. package가 없어도 저장된 PNG와 기존 CAD 편집·저장·Undo는 동작해야 한다. MIT 고지와 전이 의존성도 함께 기록한다. ag-psd의 LICENSE는 저장소 이미지/brush 파일을 명시적으로 제외하므로 코드 라이선스를 샘플 asset의 재배포 권한으로 해석하지 않는다. font parser의 코드 라이선스와 사용자가 가져오는 폰트의 라이선스도 구분한다.

## 그대로 가져올 수 없는 것과 구현 책임

[Photopea의 공식 저장소](https://github.com/photopea/photopea)는 편집기 전체 소스를 공개하는 저장소가 아니다. 아래 제품 기능은 공개 repo를 복사해서 해결한 상태로 표시하지 않는다. 필요할 때 별도 공개 알고리즘을 평가할 수 있지만 제품 모델과 UI는 WebCAD가 소유한다.

| 제품 경험 | 구현할 내부 책임 | 기존 경로와 연결 |
| --- | --- | --- |
| 레이어·선택·History가 이어지는 이미지 편집 | RasterAsset 원본, ImageNode placement, pixel/mask edit 결과, object/layer identity | 기존 Layer/Selection/Command/Review/History/serialization |
| 원본 교체·외부 편집 결과 인계 | 선택 placement만 새 asset 연결, 공유 원본 보존, 이전 원본 참조 해제, preview·Cancel·stale·한 Undo | 이번 `replace-image-source`; 이후 PSD/외부/AI 결과도 동일 명령 소비 |
| 브러시·지우개·선택/마스크 | stroke·selection region·mask 자산, brush cursor, tile별 작업, preview/commit·색공간 | G3 후속 I2. SVG mask와 pixel mask를 같은 의미로 오인하지 않음 |
| 필터·retouch·blend | effect parameters와 계산 Worker, 기존 source를 보존하는 결과, 순서·비용·손실 표시 | G3 후속 I3. 현재 brightness/contrast/saturation과 동일 interaction grammar |
| 이미지 clipboard | permission·실패 복구, bitmap → 같은 decoder/asset → insertion/replacement | I4. 기존 CAD X6 clipboard와 공통 실행/대상 흐름을 공유하되 저장 의미를 구분 |
| PSD 레이어 import/export | parser adapter + canonical layer/image/text/style mapping, unsupported effect report | I5. 먼저 composite 왕복; 편집 가능한 레이어 전체 완료를 약속하지 않음 |
| 일러스트·아이콘 | Bezier/node edit·compound path·gradient·text-to-path·style | CAD X2/Ellipse–Bezier–Spline과 G2 vector 후속. solver용 analytic geometry와 자유 path의 경계 명시 |
| 피그마·와이어프레임·슬라이드 | Frame/Scene/Component override/state/link/layout/timeline | G4-A 검수, 원본 선택·유한 vector component, state/time preview·target state·SVG 출력 구현. override/variant·직접 layout handle·PPTX/GIF는 후속. geometry 원본 ID 공유 |
| CAD 정밀성 | geometry·solver·snap·topology remap·단위·DXF·dimension·3D | [CAD 구현 카드](CAD-BASICS-IMPLEMENTATION-PLAN.md)의 B0–B5/X1–X7 유지 |
| Copilot/LLM | Query·typed command·target/impact/permission·preview·Apply·오류 복구 | 이미 시작된 G5 gateway 검수. LLM이 직접 문서를 mutate하지 않음 |

Photopea hosted iframe/API는 별도 선택 adapter 후보다. 소스 재사용과 다르고 서비스 정책·외부 세션 비용이 있다. 이번 작업에는 hosted editor 연동·계약·구매를 포함하지 않는다.

## 기존 계획과 실행 순서

| 순서 | 실행 묶음 | 완료 판단 |
| --- | --- | --- |
| 1 | G3-5A 기존 자원 최적화 마감 | 전체 Node/browser/build/architecture, 새 이름의 resource benchmark, 미실시 외부 평가 기록 |
| 2 · I1 | native 이미지 원본 교체와 TIFF 공통 decoder | 파일 선택 → source/캔버스 preview → 기존 숫자 편집 → 단일 Apply/Cancel → 원본 공유/Undo/Redo/save/export 확인 |
| 3 | G4 첫 범위/CAD B3-A1/A2·B·C1–C3와 G5-A/B1 검수 완료 | [장면·DXF·지름](../implementation/G4-CAD-BASICS-2026-10-06.md), [각도 C2/C3](../implementation/B3-C2-C3-ANGULAR-DIMENSION-2026-10-08.md), [gateway A1–A3](../implementation/G5-A3-COPILOT-APPLY-2026-10-08.md), [B1 local Query·실제 workflow](../implementation/G5-B1-COPILOT-QUERY-2026-10-09.md). 다음 B2 편집 한 종류는 별도 요청, 실제 provider 미연결 표시 유지 |
| 4 · I2 | 한 이미지의 선택 영역/마스크 편집 | 먼저 rectangle/polygon selection + non-destructive mask. 대형 brush/tile engine은 별도 묶음 |
| 5 · I3/I4 | 필터 한 종류·clipboard를 각각 구현 | 기존 decoder/source replacement/Review/History 소비. pixel/export·실제 browser 검증 |
| 6 · I5 | 제한된 PSD composite import, 이어서 레이어 mapping | parser의 unsupported metadata/effect와 3 MiB 정책을 먼저 정함. silent flatten 금지 |
| 7 | vector path/text, Component override, Scene output/APNG/PPTX | G2/G4와 CAD X2 카드 선행 조건을 따름. codec를 timeline이나 편집 엔진 대신 저장하지 않음 |
| 8 | G5 편집 command 확대, G6 외부 adapter | 수동 작업과 같은 Query/Preview/Apply·source handoff. 실제 연결이 없으면 fixture 검증으로 표시 |

위 표는 전체 제품 기능이 한 요청에 끝난다는 뜻이 아니다. G3-5A/I1 이후 G4 첫 검수/인계/출력과 CAD DXF/지름을 연결해 마감했다. 다음 실행 묶음은 NEXT-STEPS를 따른다. CAD B/X 전체 카드와 G4–G6 전체를 완료로 올리지 않는다.

## I1의 구현 계약

- `importRasterFile`: import와 replacement가 같은 bytes/MIME/해상도/content hash/TIFF 변환 경로를 사용.
- `replace-image-source`: object/geometry/feature/transform·crop·mask·opacity·color·Scene source identity를 보존하고 선택한 placement의 assetId만 교체.
- 공유 원본의 다른 placement는 보존. 마지막 참조를 잃은 이전 asset은 현재 문서에서 해제하되 Undo snapshot은 복구 가능한 bytes를 가짐.
- quota는 교체 후의 retained assets로 계산. locked/hidden/missing/conflicting/over-budget source는 atomic rejection.
- canvas source preview는 resource lease를 교체하고 Cancel에서 원본으로 복원. 원본 document·History에 preview asset을 삽입하지 않음.
- source 교체와 crop/color/size 편집은 같은 reviewed batch로 한 번 적용. Apply는 authoritative `commandInteraction.canApply`를 사용.
- 파일 decode 도중 문서 교체/수정, selection 변경/unmount, Cancel 또는 새 파일 요청은 이전 결과를 적용하지 않음.
- PNG/SVG/PDF와 Scene은 기존 object/source query를 통해 갱신. 새 serialization version이나 외부 scene graph를 추가하지 않음.

자동 검사와 실제 사용자 평가를 구분한다. 전체 brush/retouch/PSD layer/animation support는 이 계약만 구현했다고 완료로 표시하지 않는다.
