import {interferencePairKey,type CadDocument,type PairIntent} from "@agent-webcad/cad-document";
import type {MotionReport,MotionRow} from "./assemblyMotion";
export type TriageCategory="motion-dependent-penetration"|"invariant-penetration"|"contact"|"no-penetration"|"unverified";
export const TRIAGE_ORDER:TriageCategory[]=["motion-dependent-penetration","invariant-penetration","contact","no-penetration","unverified"];
export function triageCategory(row:MotionRow):TriageCategory{if(row.baseStatus==="penetration")return row.relativeMotion==="invariant"?"invariant-penetration":row.relativeMotion==="motion-dependent"?"motion-dependent-penetration":"unverified";return row.baseStatus==="contact"?"contact":row.baseStatus==="no-penetration"?"no-penetration":"unverified";}
export function explainInterference(row:MotionRow,names:[string,string],intent?:PairIntent){const pair=names.join(" / ");let text:string;
 if(row.baseStatus==="penetration")text=pair+" 사이 "+(row.commonVolume===undefined?"측정 체적 미상":row.commonVolume.toFixed(3)+" mm³")+" 관통이 검출되었습니다. "+(row.relativeMotion==="invariant"?"선택한 구동 Joint 동안 두 부품의 상대 강체 변환은 구조적으로 불변입니다.":row.relativeMotion==="motion-dependent"?"두 부품의 상대 배치는 구동 Joint 각도에 의존합니다.":"상대운동 관계의 검증 증거가 없습니다.");
 else if(row.baseStatus==="contact")text=pair+": 측정된 양의 관통 체적 없이 공차 내 접촉이 확인되었습니다.";
 else if(row.baseStatus==="no-penetration")text=pair+": 검사한 이 샘플에서 관통이 미검출되었습니다. 미검사 각도 구간은 보증하지 않습니다.";
 else text=pair+": "+(row.baseStatus==="unsupported"?"미지원 형상":"검증 미완료 또는 실패")+"입니다. 충돌 없음으로 해석하지 마세요. "+(row.reason??"");
 if(intent?.intent==="intentional-overlap")text+=" 사용자가 의도적 겹침으로 주석했습니다. 원래 기하 판정과 Common 체적은 유지됩니다.";
 else if(intent?.intent==="intended-contact")text+=" 사용자 의도는 접촉입니다."+(row.baseStatus==="penetration"?" 실제 관통과 의도가 다르므로 검토가 필요합니다.":"");
 else if(intent?.intent==="forbidden-interference")text+=" 사용자 의도는 간섭 금지입니다."+(row.baseStatus==="penetration"?" 검출된 관통은 이 의도에 위배됩니다.":"");
 else text+=" 의도된 결합인지 확인이 필요합니다.";
 if(row.exception)text+=" 별도의 B2 명시적 예외 정책이 적용됐으며 원시 결과는 유지됩니다.";
 return text;
}
export function triageMotionReport(report:MotionReport,d:CadDocument){return report.rows.map((row,index)=>{const annotation=d.interferenceIntents?.[interferencePairKey(row.pair)],category=triageCategory(row);return {index,row,category,annotation,explanation:explainInterference(row,row.pair.map(id=>d.objects[id]?.name??id) as [string,string],annotation)};}).sort((a,b)=>TRIAGE_ORDER.indexOf(a.category)-TRIAGE_ORDER.indexOf(b.category)||a.row.angle-b.row.angle||a.index-b.index);}
