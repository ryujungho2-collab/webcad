# MEAS-H1 정확한 호버 거리·측정 지점

2026-10-18 유한 도면 기하 첫 지원 범위 구현. [현재 사용법과 제한](../features/MEASUREMENTS.md).

## 기하 계산

`hoverDistanceGeometry.ts`는 렌더 샘플/AABB와 분리된 원본 기하 어댑터와 거리 계산기다. 점/선분의 유한 최근접 매개변수를 직접 계산한다. 평행·퇴화·교차·3D skew를 포함하며 교차곱으로 평행에 가까운 방향의 분모 소실을 줄인다. 원/호/타원은 전체 affine 변환된 중심/축과 유한 부호 있는 parameter domain을 유지한다. bulge는 원래 profile arc와 stable segment ID를 사용한다. 스플라인은 기존 homogeneous Bezier span 분해를 재사용하며 양의 가중치 control hull로 경계를 구한다.

곡선 조각은 실제 평가 함수와 chord 편차 상한을 가진다. 타원은 max|r''|·dt²/8, rational Bezier는 control hull의 유한 chord 거리로 편차를 제한한다. chord 쌍 거리에서 편차를 뺀 값은 하한, 실제 곡선 위 지점 쌍은 상한을 제공한다. 최소 하한 heap에서 조각을 분할해 전역 최소 구간을 좁힌다. world 좌표 수치 여유를 포함하며 arbitrary precision/interval arithmetic을 구현한 것은 아니다. 선형/허용 오차 내/예산 미수렴 근사를 분리한다.

3D/XY/XZ/YZ/X/Y/Z 각각의 metric에서 새로 최소화한다. witness는 항상 실제 3D 기하 위에 남고 투영/축 숫자가 3D 연결선 길이와 다를 수 있음을 UI에 명시한다. world mm이며 종이 축척이나 생성 모델 뷰의 저장 좌표를 원본 솔리드 치수로 역산하지 않는다.

## 서비스와 UI

`HoverDistanceService`는 문서/ID/revision/generation·객체 컬렉션·정책별 최대 64개 결과 cache를 가진다. 복제한 결과를 보관해 caller 수정이 cache를 오염시키지 않는다. 취소와 stale를 확인한 뒤에만 cache/결과를 발행한다. 레이어 검색은 문서와 뷰포트 visibility/격리, 잠금 포함 정책을 반영한다. 실제 최근접 supported 객체를 선택하고 unsupported 후보는 이유와 함께 노출한다. 레이어 후보/곡선 쌍/총 평가 예산을 제한하며 128회 평가마다 이벤트 루프에 제어를 반환한다.

CadViewport의 idle object preselection에서 hovered ID를 읽기 전용 React 상태로 전달한다. 활성 도구·선택/문서 변경·비활성 프로젝트·포커스 상실은 이전 호버를 지운다. `HoverDistance.tsx`는 debounce/AbortController, 객체/레이어 scope와 metric, source 선택, locked opt-in을 제공한다. 실제 두 지점·연결선·거리 label은 camera projection을 따라 갱신한다. 패널로 이동해 상세를 읽을 수 있고 바깥 이동/Esc는 취소한다. IME composition의 Esc를 측정 종료로 소비하지 않는다.

새 문서 필드/명령/파일 버전/외부 패키지를 추가하지 않는다. 문서·History·선택과 native geometry submission은 불변이다. 기존 AABB 기반 건축 콘텐츠 배치 경고와 두 점 거리 도구는 그대로 구분한다. BRep/메시/이미지/주석/블록/무한 기하 거리나 채워진 영역의 포함 판정은 완료 범위에 포함하지 않는다.

## 검증

- 전체 Node 1,421개/54 suites 통과. 이후 곡선 쌍/유리 spline/stale search/동일 revision 문서 교체 회귀를 추가한 최종 집중 18개 통과. 중복 합산하지 않는다.
- 신규 native browser 19개: 실제 mouse hover, 실제 endpoint witness 화면 정합, 무변경/선택 보존/History 불변, 상세 조작, metric/축 overlap, curve bound, 레이어 최근접, Ctrl-wheel zoom, Esc, 960px, native 제출 0, 편집/Undo stale, locked opt-in, viewport leave.
- 기존 선택 문맥 toolbar browser 23개 통과. 검토·편집 UI와 호버 패널이 함께 동작한다.
- 실제 960px 스크린샷에서 source endpoint A와 target interior B의 표시, 점선, 40 mm 값과 패널 배치를 시각적으로 확인했다. 이 측정은 저장/출력 기능이 아니므로 PDF를 재발행하지 않았다.
- 최종 build와 architecture 677 모듈 검증 통과. 마지막 평가 예산 보호도 집중 18개와 native browser 19개로 재확인했다. [manifest](../verification/MEAS-H1-2026-10-18.json)에 기록했다.

1440px (local-only, not in repository: `output/verification/hover-distance/hover-1440.png`) · 960px (local-only, not in repository: `output/verification/hover-distance/hover-960.png`) · 거리 metadata (local-only, not in repository: `output/verification/hover-distance/distance.json`) · 원본 파일 (local-only, not in repository: `output/verification/hover-distance/source.webcad.json`) · native report (local-only, not in repository: `output/verification/hover-distance/native-report.json`).
