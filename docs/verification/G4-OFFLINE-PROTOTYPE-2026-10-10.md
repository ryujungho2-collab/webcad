# G4 오프라인 프로토타입 재개선

> **현재 기능 설명:** [이미지와 장면](../features/IMAGES-SCENES.md). 이 문서는 날짜별 검증·측정 기록이며, 아래 사용법·제한·수치는 당시 범위다. 후속 지원은 대표 가이드를 따른다.

2026-10-10. 기존 Scene 평가·SVG 출력 위에 **Export prototype HTML**을 추가했다. 저장된 장면 하나를 시작점으로 모든 저장 장면의 원본 artwork를 상태별로 평가해 한 HTML 파일에 넣는다. 파일은 별도 서버나 앱 없이 브라우저에서 열어 장면 이동·Back, target state 링크, 재생/일시정지·타임라인 탐색·자동 다음 장면을 사용할 수 있다. Scene의 배치, source image/vector style, 배경과 아트보드 crop은 기존 평가·SVG writer를 따른다.

파일 생성 전에 전체 Scene graph와 모든 장면·상태의 유한 artwork를 검증한다. 지원되지 않는 source나 끊어진 링크는 부분 파일을 만들지 않고 오류를 보여 준다. 원본 CAD 객체·Scene·History는 변경하지 않는다. JSON을 HTML script에 넣을 때 `<`와 `&`를 escape하고, 장면 이름·메모는 `textContent`로 그린다. 투명도 0인 애니메이션 프레임은 앱 내부 player와 HTML 모두에서 클릭 영역을 숨긴다.

검증: `scenes.test.ts` **8/8**, 전체 Node **826/826 (54 suites)**, 실제 브라우저 `scenesWorkflow` **30 checks**, TypeScript, architecture/import·문서 링크 **386 modules**, production Vite build 통과. 브라우저는 다운로드한 HTML을 별도 iframe에서 실행해 시작 프레임, 투명 링크, 최종 pose, 링크 이동, target state, Back을 확인했다. nested component의 정의 멤버 vector override가 Scene SVG와 HTML에 이어지는 것도 검증했다. 기존 Scene 적용/Undo/Redo·정지 SVG·Properties 인계도 같은 workflow에서 재검증했다.

지원 경계: HTML은 export 시점의 자급식 snapshot이므로 이후 CAD 수정은 재출력해야 반영된다. 이미지 source는 data URL로 포함되어 파일 크기가 커질 수 있다. 직접 layout canvas handle, 정의 격리 편집·instance override/variant, PPTX·GIF/APNG·영상 출력은 별도 작업이다. 이 검증은 전체 브라우저 suite나 대형 Scene 성능 측정은 아니다.
