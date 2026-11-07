# 주거 과제 통합 검증과 저장 치수의 도면 연결

2026-10-18. 기존 WF-Q1 파일에서 측정→가구 수정→도면 발행→Undo/Redo→재열기를 검증했다. 실제로 발견한 출력 연결 누락을 수정했다.

## 발견한 문제와 결과

기존 A3 시트는 모델에서 떨어진 종이 원점 (10000,10000)과 1:100 축척을 사용한다. 저장 측정은 모델 좌표로만 표시되고, 모델 시트 출력은 생성된 도면 객체만 소유한다. 따라서 실제 벽·소파를 측정해도 기존 A3에 치수가 포함되지 않았다. 단순 좌표 이동만으로는 소유 범위와 종이 문자 크기를 함께 해결할 수 없었다.

저장 측정에 선택적인 `drawingId`를 추가하고 **출력 도면** 선택을 제공했다. 같은 기준 평면이고 A/B 원본 부품을 모두 포함한 resolved 단면 도면을 명시적으로 연결한다. 도면 원점·축척으로 치수 전체를 종이 XY에 매핑하고, 출력 소유권은 해당 도면의 가시 생성 객체에 연결한다. XZ/YZ 단면도 결과 도형이 놓인 종이 XY로 출력한다. 문자 높이는 종이 mm, 오프셋과 정리 간격·키보드 이동은 모델 mm다. 드래그는 반대로 원점·축척을 적용해 기존 모델 오프셋을 저장한다.

스냅과 간격 정리는 동일 `drawingId` 안에서만 수행한다. 연결이 없으면 기존 모델 좌표 동작을 유지한다. 누락·기준 평면 불일치·부품 범위 불일치·무효 도면은 이전 치수를 숨기고 복구를 요구하며 출력도 오류로 막는다. 문구만 독립 이동하는 기능은 이번 과제에서 필요하지 않아 추가하지 않았다.

도면 연결을 사용한 파일만 version 47이다. 연결 없는 저장 측정은 version 46, 기존 파일은 기존 버전을 유지한다. v46으로 버전만 낮춘 연결 파일은 거부한다. native 측정 정의와 거리는 바뀌지 않는다.

## 검증과 산출물

원본은 저장소의 자체 작성 WF-Q1 6000×4000mm 주거 과제다. 외부 실측·고객 설계 검증을 뜻하지 않는다. 원본 SHA-256은 기존 독립 보고서와 동일한 `aad2e8cbbd04113a46f3fe683a0d9229a06a1a425eefcf915edd843aed88bb17`이다. 결과는 별도 폴더에 저장했다.

- 동쪽 벽 안쪽 면 x=5900과 소파 끝 모서리 x=2505의 native 거리는 **3395mm**다. 가구 공간 슬롯을 +100mm 이동한 후 **3295mm**로 갱신된다.
- 실제 브라우저에서 기존 파일과 native 참조를 준비한 뒤, UI로 도면 선택·갱신, Undo/Redo, 2D 시트 맞춤, 치수 드래그·미리보기·한 번 Undo를 검증했다. 가구 슬롯 변경과 파일 재열기는 기존 응용 명령/파일 API를 사용했다. 모든 단계를 UI로 작성한 검사로 확대해서 해석하지 않는다.
- 기존 A3 SVG와 실제 Worker 래스터 PDF 경로로 수정 전/후 두 발행본을 생성했다. PDF MediaBox는 1190.551×841.89pt, 420×297mm다. Poppler로 두 PDF를 독립 렌더링하고 치수·글자·시트 경계를 검수했다.
- Node 신규 4개, 전체 1480개/54 suites 통과. 새 브라우저 13개, 기존 저장 14개·직접 배치 17개·스냅/정리 15개 회귀를 확인했다. 지정 측정 25개도 단독 재실행에서 통과했다. architecture 698모듈·최종 production build와 whitespace 검사를 통과했다. 기존 큰 chunk 경고는 남아 있다. 상세 결과는 [검증 manifest](../verification/MEAS-RESIDENTIAL-2026-10-18.json)에 기록한다.

수정 후 A3 PDF (local-only, not in repository: `output/verification/residential-measurements/issue-02.pdf`) · WebCAD 원본 (local-only, not in repository: `output/verification/residential-measurements/source.webcad.json`) · 브라우저 보고서 (local-only, not in repository: `output/verification/residential-measurements/native-report.json`)

!재열기 후 시트 (local-only, not in repository: `output/verification/residential-measurements/reopened.png`)

## 범위

현재 연결 대상은 기준 평면이 같은 모델 단면 도면이다. 임의 카메라 투영/HLR, 투영 도면의 3D 치수 해석, 면에 붙이는 PMI, DXF 저장 치수 출력은 포함하지 않는다. 3D 거리를 평면에 표시할 때 숫자는 실제 선택 모드의 거리이고 선은 그 측정점을 평면에 투영한 것이다. 출력은 기존 래스터 PDF이며 벡터 결과는 SVG다. 기존 4자리 수치 표시는 정밀도 보증을 뜻하지 않는다.

재실행:

```powershell
pnpm --filter @agent-webcad/web exec tsx --test tests/residentialMeasurements.test.ts
pnpm --filter @agent-webcad/web test:browser --page=residentialMeasurements --artifacts
```
