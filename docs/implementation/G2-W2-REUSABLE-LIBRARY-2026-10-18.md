# G2-W2 재사용 부품·표현 라이브러리

2026-10-18 · 첫 지원 범위 완료. [사용 가이드](../features/REUSABLE-LIBRARY.md) · [검증 manifest](../verification/G2-W2-2026-10-18.json).

왼쪽 **Component and style library**에서 작은 2D 기본 라이브러리와 현재 프로젝트/다른 WebCAD 파일의 component block을 검색·미리보기·Review 후 적용한다. 기존 Components의 정의 편집, 3D 슬롯 콘텐츠, DXF 가져오기 기능은 기존 경로를 유지한다. 새 schema나 외부 의존성을 추가하지 않는다.

## 제공 항목과 출처

`library/libraryCatalog.ts`의 문 900(정확 arc 포함), 창 1200, 테이블 1200×600, A3 도곽은 이번 작업에서 직접 작성한 2D 예시다. 외부 도면·이미지·폰트·브랜드 자료를 사용하지 않았고, 출처는 Agent WebCAD original / Original project sample로 표시한다. 도곽은 block geometry이며 연관 model sheet나 자동 표제란 생성 명령이 아니다. 0.18/0.5mm 선 프리셋과 선택 폐합 경계용 45°·5 model-mm 해치도 제공한다.

현재 프로젝트 block은 기존 정의를 참조해 배치한다. 다른 파일은 `.webcad.json`을 검증해서 block 목록을 보여주고, 선택한 정의와 중첩 block만 가져온다. 원본 문서 자체나 다른 모델·시트는 가져오지 않는다. 파일명과 원래 정의 이름을 새 block 이름에 남긴다. 파일 자료의 라이선스를 임의로 부여하지 않고 source file / license unspecified로 표시한다.

## 배치와 트랜잭션

좌표는 WebCAD의 mm를 유지하며 위치 입력은 `2cm,30mm`와 같은 기존 point parser를 사용한다. block base (0,0), 작업 평면, 배율·각도를 명시한다. 다른 작업 평면의 block은 해당 평면으로 전환하도록 안내한다. 양수 배율과 유한 각도를 확인한다.

`libraryPlan`은 기존 batch/define-block/insert-block/transform/style/hatch 명령만 조합한다. detached proposal에서 실제 drafting geometry를 얻어 SVG 미리보기를 그리며, 원본 곡선과 block definition을 sampling 결과로 대체하지 않는다. Review의 입력 key와 document version이 맞을 때만 Apply한다. 정의·임시 멤버·삽입을 한 batch로 처리하고 임시 source object는 제거하므로 결과는 한 Undo로 복원된다. 실패·stale·잠금은 부분 정의를 남기지 않는다. Cancel과 패널 해제는 보관한 plan을 버린다.

파일 정의는 새로운 definition/member ID로 remap하며 같은 이름/ID의 반복 삽입도 기존 정의를 덮지 않는다. 중첩 block 참조·member transform·vector override를 재연결하고, source layer는 사용자가 선택한 active layer로 매핑한다. 출처와 의존 정의 이름은 Review에 표시한다. 현재 프로젝트 block은 복사 없이 기존 정의를 사용한다.

## 지원 경계

- 첫 범위는 2D drawing/drafting block과 기본 선/해치 프리셋이다. 3D 슬롯 부품은 기존 콘텐츠 기능에서 사용한다.
- 파일은 20MiB 이하, 복사 대상은 총 500 members/100 definitions 이내다. 순환·누락 의존성은 삽입 전에 거절한다.
- 외부 image asset·sketch·hatch/face의 원본 형상·live source 참조가 필요한 member는 조용히 누락하지 않고 명시적으로 거절한다. 이 첫 범위는 raster asset을 remap/import했다고 주장하지 않는다. 해당 자료는 기존 문서/DXF/image 경로에서 가져온 뒤 지원되는 drawing component로 정리한다.
- source layer의 스타일을 새 layer로 복제하는 기능, 외부 파일을 계속 동기화하는 기능, 개인 라이브러리 DB/클라우드, 임의 폰트·LTYPE 카탈로그는 후속이다. 명시적 member vector override는 보존한다.
- 파일 선택과 카탈로그 검색은 현재 패널 상태다. 삽입한 정의·스타일·참조는 기존 portable document 저장과 Undo에 포함된다.

## 검증

신규 Node 6개에서 모든 기본 block proposal, 미리보기 불변성·한 Undo/Redo·portable reopen, stale/잠금, 중첩 ID remap과 transform/override, 누락·순환·외부 asset 거절, 현재 정의 재사용을 확인했다. 실제 Edge/SwiftShader UI·Worker 17개에서 기본 카탈로그/한글 검색, mm/cm 위치·배율·각도, detached 실제 미리보기, Cancel, 선/해치 적용, 파일 선택·독립 가져오기·출처 보존, 1440/960px를 검증했다. 전체 Node·기존 component/project tree/keyboard 회귀와 build/architecture 결과는 manifest에 남긴다.

[1440px 화면](../../output/verification/library/library-1440.png) · [960px 화면](../../output/verification/library/library-960.png).
