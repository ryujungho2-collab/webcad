# B3-C2/C3 — 두 참조 각도 치수

2026-10-08. 기준선 `ddedef2`. 사용자가 C2a → C2b → C3를 순서대로 요청했다. C1의 순수 측정을 같은 문서·명령·History에 연결한다.

## C2a: 완료

`AngularDimensionDefinition`은 first/second의 objectId·segmentId, 명시적인 두 ray 방향과 CW/CCW, 표시 반지름·선택적 문자를 저장한다. 두 참조는 같은 객체의 서로 다른 직선 모서리여도 된다. create/update 명령은 실제 world/profile segment를 조회하여 파생 snapshot을 만든다. 폴리라인을 endpoint chord로 대체하거나 원호를 직선화하지 않는다.

detached command 실행과 모든 원본 재생성 뒤 두 참조를 다시 계산한다. 스냅샷·inputs·geometry를 같은 transaction에 게시하고 History 한 단계로 복원한다. 각도는 rad, 기존 길이는 mm라는 명시적 render 단위를 가진다. 반지름·영역·문자만 바꾸는 편집은 원본을 움직이지 않는다.

원본 삭제·참조 소실·평행/일치·다른 평면·곡선으로 변경하면 원본 수정 전체를 거부한다. 잠긴 치수에 영향을 주는 원본 수정도 거부한다. 일반 transform으로 치수만 원본에서 떨어뜨리는 작업은 반지름/영역 편집으로 안내한다. 기존 단일 원본 치수의 source 삭제 동결 정책은 유지한다.

새 통합 4개와 C1 10개 집중 테스트가 통과했다. 원본/History 불변인 preview·실패, 한 Apply, 두 참조 refresh, Undo/Redo, reflex, 잠금, 같은 polyline의 두 모서리를 검사한다. TypeScript 및 architecture 306 modules 검증 통과. C2a 시점에는 공개 UI·파일 v14·Trim/Join 두 참조 remap이 아직 없으며 C2b/C3에서 이어간다.

C2a 전체 Node 632개/54 suites 통과. 커밋 `6e59428`.

## C2b: 완료

Contour route에 optional `referenceSlot: first | second`를 추가했다. 기존 단일 참조의 key/selector는 유지하고 각도 치수의 두 슬롯만 구분한다. 같은 polyline의 두 edge도 각각 result·edge를 지정해야 한다. Whole endpoint span은 각도 치수의 선택지에서 제외한다. Join으로 edge parameter 방향이 뒤집히면 해당 ray 부호를 반전해 기존 세계 방향과 각도 영역을 보존한다. 다른 방향의 edge를 임의로 선택하지 않고 operation을 거부한다.

두 슬롯을 모두 갱신한 뒤 source graph에서 치수를 재계산한다. nested pattern의 기존 child identity와 source route를 따르고, sketch solve/projection 뒤에도 annotation이 같은 transaction에서 갱신된다. v14는 각도 치수가 있을 때만 사용한다. v13 지름 및 이전 파일의 최소 버전은 유지한다. 파일 구조 검증은 두 source/edge·inputs·branch·placement를 확인하며 실제 열기/복구는 snapshot과 world geometry의 일치 여부도 게시 전에 확인한다.

통합 테스트 누적 8개: C2a 4개에 Join 방향 반전→같은 source 두 슬롯 Trim→save/recompute/Undo/Redo, malformed/downlevel/stale file의 원본 불변 실패, sketch driving angle→projection→annotation, nested pattern root Trim→child reference 유지가 추가됐다. 전체 Node 636개/54 suites 및 타입 검증 통과. 공개 도구 진입·미리보기/Apply·실제 browser·출력은 C3에서 이어간다.

## C3: 공개 도구·정밀 편집·출력 구현

리본·명령 검색·우클릭에서 **Angular Dimension**으로 진입한다. 첫째/둘째 source를 실제 캔버스 edge picking 또는 목록에서 고르고, 각 ray의 방향과 CW/CCW 가지를 명시한다. 반지름은 단위가 있는 `PrecisionField` 또는 캔버스 핸들로 편집한다. 두 입력은 같은 draft와 `resolveAngularDimension`을 갱신한다. 겹친 edge, 곡선, 평행·공선, 잠금, 참조 소실은 이유와 복구 입력을 보여준다.

표시 기하는 원본 문서를 바꾸지 않는 detached `previewCadCommand`로 검토한다. `commandInteraction`의 reviewed key와 `canApply`만 Apply에 사용하므로 입력 또는 문서가 달라지면 이전 계획을 적용하지 못한다. 파란/주황 원본 edge, 녹색 호·화살표·텍스트와 결과 검토를 캔버스/패널에 표시한다. 성공 시 새 주석을 선택하고 원본 검사 및 스케치 편집 인계를 제공한다. Properties에서 주석을 선택하면 같은 reviewed tool로 반지름·가지·문자를 편집한다. 일반 오브젝트 transform이나 직접 텍스트 blur로 연관 정의를 우회하지 않는다.

DXF와 CAD PDF는 기존 치수 renderer의 선분과 TEXT를 사용한다. 활성 작업면 SVG는 보이는 치수의 선분과 글자를 함께 출력한다. 저장은 source/edge/branch/radius를 가진 v14 JSON이며 reload 후 C2의 refresh·원자성 정책을 유지한다. 출력의 호는 샘플 선분이며 native DXF associative DIMENSION/ARC나 SVG arc path로 둔갑시키지 않는다. 아트보드 PNG/PDF/SVG의 치수 포함과 치수 공통 style, 구동 각도, 곡선 접선각은 별도 카드다.

새 `angularWorkflow` 실제 브라우저 **24 checks**는 도구 진입, 잘못된 두 edge 수정, 캔버스 edge·반지름 핸들, 가지 전환, 단위 입력, stale Apply 차단, Cancel, 한 Undo/Redo, Inspector 편집, v14 저장/재열기, DXF/SVG/PDF 출력과 원본 변경 후 갱신을 포함한다. 전체 Node **636개/54 suites**, browser **36 workflows/758 checks**, 타입, architecture/import **308 modules**, production build가 통과했다. C2b 뒤 첫 전체 browser에서 기존 Trim 영향 요약이 `100.00 mm → 40.00 mm`로 단위를 명시하는데 예전 테스트가 단위 없는 문자열을 기대하여 실패했다. 검사의 수치·단위 의미를 유지하도록 기대값을 수정했고 해당 단독 21개와 전체 회귀가 통과했다. [검증 요약](../verification/B3-C3-CLOSEOUT-2026-10-08.json)과 [현재 상태](../../PROJECT-STATE.md)를 따른다.
