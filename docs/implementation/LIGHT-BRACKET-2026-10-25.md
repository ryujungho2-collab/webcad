# 소형 부품으로 사람·Copilot·MCP 연결 재검증

파빌리온 다음 과제로 60 × 40 × 45 mm, 두께 3 mm의 센서 L 브래킷을 만들었다. 한 개의 최종 솔리드와 Ø4.5 구멍 네 개, 8 × 6 mm 케이블 홈을 가진 작은 Boolean 모델이다.

기존 sharedToolHandoff 과제의 공개 도구 연결을 작은 별도 부품으로 재사용했다. 사람 폼 생성·치수 수정 → 같은 원본의 내부 자연어 수정 → 실제 SDK stdio MCP 합집합·face-bound hole → 사람 폼 Boolean 마무리 → 실제 BRep 단면 → 저장·브라우저 재열기를 확인한다. 미적 평가나 자율 설계 점수는 다루지 않는다.

재열기에서는 Model tree가 이미 열려 있었는데 테스트가 같은 토글을 다시 눌러 숨긴 뒤 검색란을 입력하려는 문제가 있었다. 실제 aria-pressed 상태를 읽어 필요한 경우에만 여는 순서로 수정했다. 검증 창도 다른 CAD 과제와 같은 1440 × 1000으로 지정했다. 제품 명령이나 MCP 권한을 우회하지 않는다.

STEP을 새 OCCT reader로 읽어 솔리드 수·유효성·체적을 확인한다. 체적의 독립 기준은 두 직육면체의 합집합에서 네 원기둥과 직육면체 홈을 뺀 14425.148246 mm³다. 연관 BRep 절단의 원 네 개에 대해서는 반지름과 실제 위치를 별도로 검사하고 원본에서 SVG·DXF를 출력한다.

산출물과 재현 결과 (local-only, not in repository: `output/projects/light-sensor-bracket/README.md`). 최종 수치와 해시는 산출물 verification.json에 기록한다. 완성 Boolean의 모든 치수를 재설계하는 기능이나 판금·공차·하중 검증은 이번 시험 범위에 포함하지 않는다.
