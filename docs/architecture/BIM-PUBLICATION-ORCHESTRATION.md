# BIM 목록·검토·출판 오케스트레이션

갱신일: 2026-10-05

Revit 모델에서 방과 요소를 추출하고, 사람이 검토할 목록을 만들고, 소책자나 발표 자료로 출판하는 흐름을 WebCAD의 BIM IR와 Publication Graph로 설계한다. Notion과 InDesign은 선택적 외부 adapter이며 문서 원본이 아니다.

[최종 기획 G6](../IMPLEMENTATION-READINESS-2026-10-05.md)의 선택 확장으로, 기본 CAD·벡터·이미지·레이아웃 엔진 이후에 검토한다. 사용자 제공 Revit→Notion→InDesign 사례는 목표 workflow 참고이며 해당 서버·버전·connector의 동작을 이 repository에서 검증한 기록이 아니다. 현재 Publication Graph와 adapter는 미구현이다.

## 권장 흐름

```text
RVT / IFC / WebCAD BIM
        ↓ read-only source adapter
BIM IR + sourceId + modelRevision
        ↓ normalized projection
Publication Graph
  Room · Element · ViewAsset · Inclusion · PageAssignment
        ├─ Notion adapter: 검토·목록·체크박스·댓글
        ├─ WebCAD Artboard: 편집·배치·Axo/plan/3D view
        └─ InDesign adapter: 고품질 소책자·인쇄 export
```

Claude 같은 Copilot은 이 흐름의 오케스트레이터가 된다. 자연어를 곧바로 외부 앱 mutation으로 실행하지 않고 `Discover → Stage → Review → Approve → Publish → Reconcile` typed plan으로 변환한다.

## 단계별 계약

1. **Discover**: 열려 있는 RVT/IFC/WebCAD 문서에서 방, 층, 요소, family/type, 위치, source ID와 사용 가능한 view를 읽는다. 기본은 read-only다.
2. **Stage**: `Room`, `Element`, `ViewAsset`을 Publication Graph에 만든다. 사진·평면도·axo/3D view는 파일 경로가 아니라 asset hash, source revision, preview URL/Blob reference를 가진다.
3. **Review**: Notion에는 방 데이터베이스와 요소 카드 같은 사람이 읽는 projection을 만든다. `bookletInclude`, 상태, 손실·미해결 참조, 마지막 source revision을 함께 표시한다.
4. **Approve**: 레이아웃 후보, 페이지 수, 포함 요소, 출력 크기와 모델 view 추가 여부를 사용자에게 보여준다. 모델에 view를 추가하거나 source를 저장하는 작업은 별도 권한과 확인을 요구한다.
5. **Publish**: WebCAD Artboard/PDF 또는 InDesign adapter로 표지·평면도·방별 페이지·요소 라이브러리를 만든다. 페이지에 들어간 요소만 `publishedIn` 관계를 추가한다.
6. **Reconcile**: source revision이 바뀌면 전체를 무조건 다시 만들지 않고 `sourceId + hash`로 변경된 방·요소·ViewAsset·페이지 assignment만 stale 처리한다. 충돌이나 삭제는 자동 덮어쓰지 않고 review로 돌린다.

## Notion과 InDesign의 역할

Notion은 Revit 모델을 대신하는 데이터베이스가 아니라 팀 검토용 read model이다. 방별 목록, 요소 카드, 이미지, 포함 여부, 검토 상태를 쉽게 공유하는 데 사용한다. Notion이 없어도 WebCAD의 Publication Graph와 Artboard 편집은 동작해야 한다.

InDesign은 최종 인쇄·편집 품질이 필요한 경우의 출력 adapter다. 페이지 구성과 스타일을 외부 문서에 복사해 원본을 분리하지 않고, stable `pageId`, `roomId`, `elementId`, `assetHash`를 metadata로 전달한다. InDesign에서 수정된 레이아웃 정보는 제한적으로 되돌릴 수 있으며, BIM geometry나 관계를 역으로 변경하는 경로로 취급하지 않는다.

## 데이터 최소 계약

```text
PublicationGraph {
  source: { kind, uri, modelRevision }
  rooms: [{ roomId, sourceId, name, level, bounds, viewAssetIds }]
  elements: [{ elementId, sourceId, type, roomId, viewAssetIds, bookletInclude }]
  assets: [{ assetId, hash, sourceId, viewPreset, mime, dimensions }]
  pages: [{ pageId, roomId?, assetIds, layout, status }]
  sync: { lastImportedRevision, staleIds, lossItems, conflicts }
}
```

`sourceId`는 원본 추적용이고 `elementId`는 WebCAD 내부 identity다. 이미지가 바뀌어도 geometry identity가 바뀌지 않으며, 변환 손실·누락 family·unsupported view는 `lossItems`로 남긴다.

## 첫 검증 과제

`IFC/RVT read-only → fixture의 방 inventory → 요소 카드와 이미지 → Axo ViewPreset → 선택적 Notion projection → 검토한 페이지 수의 WebCAD Artboard/PDF → 변경된 방만 재동기화`

방·요소·페이지 수는 fixture와 사용자가 검토한 레이아웃에서 정한다. 사례의 11개 방이나 6/14페이지를 고정 요구로 사용하지 않는다. InDesign은 같은 Publication Graph를 소비하는 두 번째 exporter로 검증한다. Notion과 InDesign을 필수로 묶지 않는다.

WebCAD 내부의 Stage/Apply는 분리된 제안과 한 transaction으로 처리한다. 외부 앱 전체를 하나의 원자적 transaction으로 보장하지 않는다. 승인 전·asset 누락·stale 모델은 게시를 막고, 외부 게시 후 실패는 작업별 idempotency key·receipt·재시도·보상/수동 복구로 처리한다. 성공한 외부 변경을 숨기거나 전부 rollback됐다고 보고하지 않는다. 원본 Revit 모델은 별도 승인된 view 추가·저장 명령 외에는 변경하지 않는다.

## AI 권한과 안전한 실행

- 읽기·분석·목록 생성은 기본 허용 범위로 둔다.
- Revit에 view를 추가하거나 저장, 외부 서비스로 파일 업로드, InDesign 문서 생성은 별도의 명시적 승인 scope가 필요하다.
- Copilot 응답에는 대상, 생성·변경·삭제 항목, 외부 전송 asset, 영향받는 페이지, 복구 방법을 포함한다.
- 결과가 늦게 도착하면 `modelRevision`과 `assetHash`를 다시 확인하고, 오래된 결과를 적용하지 않는다.

이 구조를 사용하면 “Revit → Notion → InDesign”이라는 사용자 경험을 제공하면서도, WebCAD는 Notion·InDesign·Claude의 문서 모델에 종속되지 않는다.
