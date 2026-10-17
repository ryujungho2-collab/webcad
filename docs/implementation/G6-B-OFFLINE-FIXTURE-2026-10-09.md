# G6-B 첫 오프라인 JSON fixture adapter

> **현재 기능 설명:** [도면과 출력](../features/DRAWINGS-OUTPUT.md). 이 문서는 날짜별 구현·설계 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-09. G6-B1 계약, B2 변환, B3 Preview/Apply와 문서 보존, B4 export/왕복을 구현했다. [분류·지원 경계](../product/G6-B-OFFLINE-ADAPTER-PLAN.md)를 따른다.

## 사용자 작업

File 메뉴 → **Import exchange fixture…**에서 JSON을 고른다. Ctrl+K에서도 같은 명령을 찾을 수 있다. Preview에 원본 단위 → mm, 지원 도형 수, 제외·손실 목록, 유한 형상 그림을 표시한다. Source manifest and ID mapping을 펼쳐 원본 문서/객체 ID·새 ID 대응·asset 크기/해시를 확인한다. 손실이 있으면 **Continue with the supported subset**를 체크해야 Apply할 수 있다. 파싱·version·참조·수치 오류는 수락할 수 없으며 도면을 바꾸지 않는다. Cancel은 detached plan을 버린다.

**Export exchange fixture…**는 선택된 객체가 있으면 그 부분집합을, 없으면 문서의 root 객체를 검토한다. 숨겨진 객체·지원 밖 형상은 명시적으로 제외한다. 관계·스타일·카메라·편집 이력은 WebCAD JSON에 남는다는 안내를 수락한 뒤 `.fixture.json`을 내려받는다. [직접 가져올 수 있는 inch/회전 축 예제](../fixtures/offline-survey.fixture.json)를 제공한다.

## 계약과 지원

`schema: webcad.exchange.fixture`, `version: 1`, `adapter: webcad-fixture`의 한 adapter를 지원한다. `documentId`, `coordinates`, `entities`, `assets`, `losses`를 검증한다. 단위는 mm/cm/m/inch이며 원점과 오른손 정규 직교 축 3개는 원본 단위다. 점의 월드 좌표는 **mm scale × (origin + axes × source point)**다. 출력은 identity basis/world mm로 정규화한다. 원본 좌표계는 import receipt에 보존한다.

기하는 독립 직선(3D 점 2개), 직사각형(연속된 모서리 점 4개)이다. 좌표 변환 뒤 XY/XZ/YZ 중 한 평면에 있는 정확한 도형만 지원한다. 원점의 elevation과 평면 안의 회전을 보존한다. 경사 평면은 loss로 제외하고, 전단 후 직사각형이 아닌 형상도 export에서 제외한다. 원·호·일반 다중선·sketch graph·solid·BRep·BIM semantic graph는 이 adapter의 지원 밖이다. 미지원 요소는 `kind: unsupported`와 이유를 써서 보고하며 알 수 없는 기하 payload는 fatal이다.

원본 identity는 **adapter/documentId/objectId** tuple이다. 입력 source ID와 새 WebCAD ID의 mapping, 원본 identity provenance, coordinates, asset manifest와 loss report를 `exchangeImports`에 기록한다. 매 import는 UUID 기반 새 객체 ID·receipt ID를 만들며 additive하게 적용한다. export/reimport의 geometry ID는 새로 생기지만 원본 provenance tuple은 유지된다. 동기화·merge·기존 객체 자동 덮어쓰기는 후속이다.

asset은 ID/mediaType/byteLength/SHA-256 메타데이터만 검증·보존한다. `assetIds`는 실제 manifest에 존재해야 한다. bytes가 없으므로 참조하는 도형을 제외하고 수락을 요청한다. 독립 도형에는 영향이 없다. URL/path/실행 필드와 임의 확장 필드는 거부하고 다운로드나 파일 탐색을 실행하지 않는다. export는 같은 asset 메타데이터를 중복 제거하며 같은 ID의 서로 다른 manifest는 새 ID와 conflict loss로 명시한다. 선택 export에는 관련 receipt만 포함한다.

크기는 UTF-8 2 MiB, 도형 1,000개, manifest asset 256개, loss 4,096개, 문서 receipt 256개로 제한한다. ID는 200자 이내·중복/위험한 record key를 거부한다. 유한 원본 및 변환 월드 좌표의 절댓값은 1e12 이내다. 원본·변환 후 퇴화 기하는 fatal이다. receipt는 과거 기록이므로 삭제한 객체의 mapping을 유지하며 export에서 해당 삭제를 보고한다.

## 트랜잭션과 파일

기존 `create-drawing`과 `record-exchange-import`를 한 batch에 담고 공통 Preview/Apply로 게시한다. geometry와 receipt가 한 Undo/Redo다. 부분 실패·잠금·stale 문서는 일체 게시하지 않는다. 기존 도형과 저장 뷰는 유지한다. metadata는 입력 객체를 clone하여 저장하며 reviewed plan은 외부 alias의 이후 변경에 영향받지 않는다.

`exchangeImports`가 있는 portable WebCAD 파일은 **v16**이다. 기존 v1–v15는 이 필드를 추가하지 않고 읽으며 하위 version에 receipt를 넣으면 거부한다. History/batch rollback/File New/Open/Publish/recovery의 optional field 복원·삭제를 연결했다. 모델 뷰 v15 최소 version과 기존 형상 serialization은 유지한다. asset bytes 복원이나 원본 외부 파일 포맷 복원을 주장하지 않는다.

## 검수와 후속

신규 Node 11개는 strict 계약·독립 좌표 oracle·모든 단위/XZ basis·asset 참조·반복 import ID·stale/lock/부분 실패·한 Undo/Redo·v16/이전 version·File/recovery·편집 후 왕복·전단/표시 제외·입력 alias·선택 manifest를 검증한다. 신규 native Edge/CDP fixture 20 checks는 실제 App/React/Worker의 파일 선택·Preview·수락·취소·Apply·Undo/Redo·오류·다운로드·재import·portable 재열기·저장 뷰 보존을 검증한다. 좌표/ID 기대값과 실제 다운로드를 확인하며 일반 CAD 명령으로 편집을 준비한다.

최종 **775 Node / 54 suites / fail·skip 0**, 대상 native browser **4 workflows / 86 checks**(fixture 20·DXF 18·modelViews 24·sessionContinuity 24), 타입·architecture/import·문서 링크 **367 modules**·workspace production build가 통과했다. 최종 결과와 로그는 [마감 증거](../verification/G6-B-CLOSEOUT-2026-10-09.json)에 기록한다. 전체 browser suite를 실행한 것은 아니며 실제 IFC/RVT/Revit/외부 provider는 G6-C에서 포맷·환경별 검수가 필요하다. embedded assets, 더 넓은 기하, merge/reimport 동기화는 후속이다.
