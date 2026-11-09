# Spider-Man — Native BRep Study

실제 Hybrid Web CAD 프로젝트: document-7798cb17-56a2-4f92-a159-2d7af647d39a. 앱 내 프로젝트 이름은 Spider-Man — Native BRep Study.

공식 아트북 전후면 콘셉트의 비율을 참고해, 1800mm 기준선과 관절 높이를 먼저 정의했다. 수치는 이미지에서 추정한 설계값이며 공식 인체 실측값이 아니다. DESIGN.md와 00-proportion-study.json 참조.

브라우저 CAD의 Structured CAD proposal → Review → Apply로 원본 닫힌 C2 단면, smooth BRep loft, 렌즈 loft, 문양 extrusion/sweep, 슈트 패널과 마스크 거미줄을 작성했다. 제품 코드 변경 및 외부 메시 가져오기 없음. 실행 제안은 순번 JSON으로 보존했다.

19개 설계 기준선/라벨과 숨긴 원본 단면, 독립 BRep 형상, 정적 치수를 포함해 총 205개 객체. Save document 후 브라우저 새로고침에서 Saved revision 458, 205 objects를 확인하고 다시 편집기를 열어 형상을 확인했다.

몸체 Boolean union 제안 12-unify-body.json은 선택 변경으로 검토 취소되어 적용하지 않았다. 실제 적용된 재료 수정은 12-finish-body.json이다. 연결부는 독립·일부 중첩 BRep 상태이며 단일 유기적 연속 표면으로 주장하지 않는다. 손가락, 정교한 근육·슈트 직물은 단순화 상태다.

13-datum-soles-dimensions.json은 geometry 호출을 먼저, scene 호출을 나중으로 재정렬한 파일이 실제 적용본이다. 치수는 기준점 사이의 정적 CAD 치수이며 형상 변경 뒤 자동 연동되는 인체 구속이 아니다.

실제 CAD 화면: native-cad-final.png, native-front-dimensions.png, native-right.png. 초기 기준선 화면 design-guides.png. Download file은 앱에서 시작 표시했으나 IAB 다운로드 이벤트와 실제 디스크 파일을 확인하지 못했다. 따라서 완전한 .webcad 다운로드 파일은 이번 산출물에 포함하지 않는다. 현재 모델은 앱의 로컬 프로젝트 저장으로 복원된다.

## Hero pose revision — 2026-11-08

프로젝트 이름을 Spider-Man — Hero Pose / Native CAD로 변경했다. 기존 BRep의 실제 Inspector Rotation/Position/Scale로 정적 자세를 조정했다. 변환 입력 기록: hero-pose-transforms.json. 팔을 편 방향의 검지·새끼손가락을 펴고 중지·약지를 접은 손가락 5개를 native sweep으로 추가했다. 손목 장치는 경사진 closed spline loft를 거절하여, 지원되는 평면 단면 + alignToPath sweep으로 수정 후 적용했다. 엔진 수정 없음.

공식 아트북 참고 이미지의 실루엣과 비교해 목 노출 길이를 줄였다. 마스크는 원본 262mm 높이에서 Z scale0.96으로 약251.52mm, 머리 최고점은1749.52mm이다. 원본 기준 치수 두 개와 설계 라벨은 자세 변경 후 숨겼다. 일러스트에서 추정한 비율을 이용한 CAD 스타일화이며 원본 게임의 인체 메시나 정교한 근육·직물 조형과 동일하지 않다.

왼팔/오른팔, 양쪽 다리와 오른쪽 종아리를 서로 다른 회전으로 배치하고 발과 밑창을 재배치했다. 회전 Joint/리깅을 새로 만든 작업이 아니다. 몸체 전체 Boolean은 기존 미적용 상태를 유지한다.

14-web-shooting-fingers.json, 15-hero-presentation.json, 16-web-shooter-cuffs.json, 17-hero-surface-finish.json은 CAD Review/Apply로 실제 게시했다. 원본 단면을 포함해231개 객체. 저장 후 브라우저 새로고침에서 프로젝트 이름·231objects·Saved revision161을 확인하고, 저장한 Hero pose — front 뷰를 Recall하여 포즈와 손목 장치·거미줄 복원을 확인했다. 재로드 후에도 원본 단면과 독립 BRep가 남는다.

실제 CAD 결과 화면: hero-pose-reloaded.png. 원본 비교용 스크린샷 native-cad-final.png도 유지한다. 다운로드 파일의 완결 검증은 수행하지 않았으며 앱 내 로컬 프로젝트로 저장했다.
