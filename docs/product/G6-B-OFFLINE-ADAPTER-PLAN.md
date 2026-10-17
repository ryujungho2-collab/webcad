# G6-B 오프라인 adapter 구현 분류

2026-10-09. **B1–B4를 첫 JSON fixture 범위에서 구현·검수했다.** [구현과 검수](../implementation/G6-B-OFFLINE-FIXTURE-2026-10-09.md)를 따른다. 아래는 실행 계약을 보존한 분류다. G6-B는 source ID/unit/loss/asset manifest를 가진 오프라인 fixture 교환 경계다. 실제 IFC/RVT/외부 서비스 연결은 G6-C 이후다.

## 첫 지원 범위

첫 adapter는 WebCAD에서 정의한 versioned JSON fixture 한 종류로 제한한다. 독립 직선·사각형을 첫 기하 payload로 삼고 source 문서/객체 ID, 원본 단위와 좌표계, 변환 결과, 손실 목록 및 asset manifest를 다룬다. 실제 IFC/RVT 파일, BRep 교환·BIM semantic graph·외부 asset 다운로드는 별도 범위다.

source identity는 adapter ID + source document ID + source object ID의 조합으로 정의한다. 수신 객체는 새 WebCAD ID로 매핑하고 기존 객체를 임의로 덮어쓰지 않는다. 처음에는 additive import만 지원하고 재가져오기/동기화/merge 정책은 후속이다. WebCAD 내부 mm 좌표와 원본 단위를 구분하며 geometry와 camera/work plane을 혼동하지 않는다.

## 실행 카드

| 전체 ID | 상태 | 구현 결과 | 선행·검수 |
| --- | --- | --- | --- |
| G6-B1 | 완료 | 공통 envelope/manifest 계약·validator: adapter/schema version, source identity, units/basis, 지원 기하 payload, loss와 asset 메타데이터. 건수·크기·유한 수치·ID 중복·금지 필드 경계 정의 | 외부 환경 불필요. 유효/손상 fixture·알 수 없는 version·중복 source·미지원 형상 구분 검사 |
| G6-B2 | 완료 | 첫 JSON fixture decoder/normalizer와 detached import plan: mm/좌표 변환, 새 객체 ID 매핑, provenance/loss/asset 보고서. 기존 CAD 명령을 생성하고 문서에 게시하지 않음 | B1. 독립 기대 좌표·단위·축 방향·ID 매핑·입력 불변·지원 실패 검사 |
| G6-B3 | 완료 | 파일 선택 → Preview/손실 안내 → 명시적 수락 → atomic Apply UI. source map/provenance의 문서 보존 계약·필요한 migration, History·파일/recovery 연결 | B2. 잠금·Cancel·stale·부분 실패·한 Undo/Redo·재열기·기존 모델/저장 뷰 보존을 실제 browser에서 검사 |
| G6-B4 | 완료 | 첫 adapter export와 import→편집→export→재import fixture 왕복 마감. 지원 객체/부분집합·손실을 출력 전에 검토 | B3. identity/provenance·단위·world geometry·asset 참조·손실 보고서의 왕복 검증. 원본 외부 포맷 복원 주장 금지 |

순서는 **B1 → B2 → B3 → B4**다. 서로 다른 adapter를 병렬로 개방하지 않는다. B1/B2 데이터 계약을 정한 뒤 B3에서 실제 필요한 persisted metadata와 version 변경을 결정한다. fixture decode 성공만으로 문서 Apply나 실제 adapter 연결을 완료로 표시하지 않는다.

## 손실·asset 경계

- 파싱/구조/참조/수치 오류는 fatal이다. 사용자가 수락해도 적용하지 않는다.
- 표현할 수 없는 요소는 명시적 loss/exclusion으로 보고한다. 지원 부분만 가져오는 정책이 정해진 경우에만 사용자가 검토 후 수락할 수 있다. 임의 근사·묵시적 제외를 하지 않는다.
- 첫 asset manifest는 ID·종류·크기·해시/참조 등 메타데이터와 지원 상태를 검증한다. asset 참조를 검증했다는 사실과 실제 bytes를 복원했다는 사실을 구분한다. 필수 asset을 복원하지 못하면 관련 객체를 정상 적용한 것으로 표시하지 않는다.
- 외부 URL/file path를 받아 자동 다운로드하거나 컴퓨터의 임의 파일을 읽지 않는다. embedded asset을 추가할 때 기존 RasterAsset 제한·검증을 재사용하고 별도 지원 검수를 한다.

## 재사용과 후속

문서 모델·serialization, CadCommand/validator, detached Preview/Apply·History, 기존 DXF import review와 파일 선택 UX를 조사해 재사용한다. G6-A1/A2 저장 뷰는 가져오기 대상 geometry와 분리해 보존한다.

G6-C 이후 실제 Revit/IFC·Manim·Notion/InDesign은 환경과 adapter별로 분리한다. 해당 포맷의 버전·서버·인증·실제 입출력 검수가 준비되어야 완료로 판단한다. 1차 CAD의 수치 편집 pilot과 G6-B는 별도 카드이므로 이 문서를 근거로 자동 시작하지 않는다.
