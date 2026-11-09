/** Capability boundary, not a general architectural intent classifier. */
export function architecturalScopeIssue(input:string):string|undefined{
 if(/외곽만|윤곽만|outline only|스케치만|치수만|통과점만|fit.point only/i.test(input))return;
 const architecture=/졸업작품|졸업설계|건축|건물|전시관|도서관|학교|공공시설|architecture|building|library|school/i.test(input);
 const parts=[/대지|배치도|site/i,/\d\s*층|층간|floor|storey|story/i,/강의실|작업실|프로그램|실별|room|program/i,/단면|(?<!진)입면|section|elevation/i,/동선|피난|보존|접근성|circulation|egress|retain/i].filter(r=>r.test(input));
 if(architecture&&parts.length>=2)return "건축 과제 범위 미지원: 대지·다층 프로그램·동선·단면을 함께 설계하는 내부 플래너가 아직 없습니다. 사각형이나 외곽 하나로 요구를 축약하지 않았습니다. 설계자가 배치와 관계를 정한 뒤 CAD 도구로 나누어 작성하거나, '외곽만'처럼 이번 작업의 범위를 명시하세요. Native CAD 검증은 건축적 완성도·법규·미적 평가를 보증하지 않습니다.";
}
