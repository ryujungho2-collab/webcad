import type {FitSpace} from "../precision/fittedCurveSpace";
import {architecturalScopeIssue} from "./architecturalScope";
import type {CadDocument,CadSpline} from "@agent-webcad/cad-document";
import {validSpline} from "@agent-webcad/cad-document";
import type {WorkPlaneId,Vec3} from "../precision/workPlane";
import {WORK_PLANES,worldToPlane} from "../precision/workPlane";
import {fitSpline,fittedSplineDefinition} from "../precision/fitSpline";
import {localDesignCandidates,intentSuggestions,type DesignStudy,type DesignCandidate,type DesignSettings,type DesignMark} from "./designStudy";
import type {DesignIntent,DesignRevision} from "./designIntent";
import {copilotSolidContract,solidParameterPlan} from "./copilotSolid";
import {inspectFittedCurve,reshapeFittedCurve} from "./fittedCurveTools";
import type {DesignView} from "./designStudyScene";

export type InternalEdit={kind:"auto"|"inset"|"outset"|"widen"|"taller"|"smooth"|"point";amount:number;pointIndex:number;dx:number;dy:number};
export const defaultInternalEdit=():InternalEdit=>({kind:"auto",amount:1000,pointIndex:0,dx:1000,dy:0});
/** Explicit grammar and procedures; no model, server, image inference or hidden network call. */
export function internalIntent(study:DesignStudy,settings:DesignSettings,selectionIds:string[],document:CadDocument):DesignIntent&{settings:DesignSettings}{
 const proposed={...settings},text=study.brief.goal,number="(\\d+(?:\\.\\d+)?)",pair=new RegExp(`${number}\\s*(mm|cm|m)?\\s*[x×*]\\s*${number}\\s*(mm|cm|m)?`,"i").exec(text);
 const unit=(n:string,u:string|undefined)=>Number(n)*(u?.toLowerCase()==="m"?1000:u?.toLowerCase()==="cm"?10:1);
 if(!selectionIds.length&&pair){proposed.width=unit(pair[1],pair[2]??pair[4]);proposed.depth=unit(pair[3],pair[4]??pair[2]);if(![proposed.width,proposed.depth].every(n=>n>=10&&n<=100000))throw Error("Internal outline dimensions must be 10–100000 mm. Correct the dimensions before confirming.");}
 const qualities=study.brief.qualities.length?[...study.brief.qualities]:intentSuggestions(text),solid=copilotSolidContract(document,selectionIds);
 return {brief:{...study.brief,qualities,assumptions:[study.brief.assumptions,!selectionIds.length?`신규 외곽 기준 ${proposed.width} × ${proposed.depth} mm, tangent ${proposed.tension}. 확인 전 제안값입니다.`:solid.targetId?"선택 솔리드의 공개된 길이 치수만 비교하며 원본 관계는 CAD로 검증합니다.":"선택한 지원 곡선의 평면·닫힘·배치를 유지하며 외곽을 비교합니다."].filter(Boolean).join("\n").slice(0,4000)},questions:[{id:"direction",prompt:"먼저 비교할 외곽의 변화는 무엇인가요?",options:["연속적인 흐름","비대칭 강조","오목한 진입면"]},{id:"variation",prompt:"대안 사이의 변화 폭은 어느 정도로 할까요?",options:["절제된 차이 / 8%","중간 차이 / 15%","강한 차이 / 25%"]}],summary:["Agent WebCAD 내부 규칙이 지원 치수·속성 키워드·현재 선택을 정리했습니다. 외부 모델 호출은 없습니다.","확정 요구는 그대로 유지합니다. 의도 해석과 제안 수치는 답변 후 직접 확정합니다.","아름다움·일조·법규 적합성을 자동 판정하지 않습니다. 도구가 지원하지 않는 자유로운 설명은 질문/메모로 남습니다.",...architecturalScopeIssue(`${study.brief.goal} ${study.brief.requirements}`)?[architecturalScopeIssue(`${study.brief.goal} ${study.brief.requirements}`)!]:[]],settings:proposed};
}
export function internalAnswerSettings(settings:DesignSettings,answers:Record<string,string>):DesignSettings{
 const response=answers.variation??"",variation=response.includes("8%")?.08:response.includes("25%")?.25:response.includes("15%")?.15:settings.variation;return {...settings,variation};
}
export function internalCandidates(document:CadDocument,selectionIds:string[],plane:WorkPlaneId,layerId:string,study:DesignStudy,settings:DesignSettings){
 const issue=architecturalScopeIssue(`${study.brief.goal} ${study.brief.requirements}`);if(issue)throw Error(issue);
 const rows=localDesignCandidates(document,selectionIds,plane,layerId,settings),text=study.brief.requirements;
 const preferred=text.includes("먼저 비교할 외곽의 변화는 무엇인가요? → 오목한 진입면")?"threshold":text.includes("먼저 비교할 외곽의 변화는 무엇인가요? → 비대칭 강조")?"hierarchy":"flow";
 return rows.sort((a,b)=>Number(b.id===preferred)-Number(a.id===preferred)).map(r=>({...r,rationale:`${r.rationale} Internal procedure; explicit variation ${Math.round(settings.variation*100)}%. ${r.id===preferred?"사용자가 고른 비교 방향부터 표시합니다.":"비교를 위한 다른 기하 방향입니다."}`}));
}
function actionFor(edit:InternalEdit,feedback:string):InternalEdit["kind"]{
 if(edit.kind!=="auto")return edit.kind;
 if(/오목|안쪽|진입.*깊|inset|indent/i.test(feedback))return "inset";
 if(/볼록|바깥|outset/i.test(feedback))return "outset";
 if(/넓|가로.*늘|폭.*늘|widen/i.test(feedback))return "widen";
 if(/세로.*늘|높게|taller/i.test(feedback))return "taller";
 if(/부드럽|완만|smooth/i.test(feedback))return "smooth";
 throw Error("내부 엔진이 이 수정 설명을 작업으로 확정할 수 없습니다. Internal refinement action에서 오목하게·가로 확대·곡률·통과점 이동 등을 고르면 모델 없이 계속할 수 있습니다.");
}
export function internalRefinement(args:{document:CadDocument;selectionIds:string[];plane:WorkPlaneId;layerId:string;settings:DesignSettings;edit:InternalEdit;revision?:DesignRevision;marks:DesignMark[];view?:DesignView}):DesignCandidate[]{
 const {document,selectionIds,plane,layerId,settings,edit,revision,marks,view}=args,feedback=revision?.feedback??"",solid=copilotSolidContract(document,selectionIds);
 if(solid.targetId){if(marks.length)throw Error("3D 영역은 치수 변경으로 직접 대응할 수 없습니다. 영역 표시를 지우고 Native dimension을 선택하세요.");const parameter=solid.parameters.find(p=>p.key===settings.parameter)??solid.parameters[0],baseCommand=revision?.command as any,base=baseCommand?.type==="update-primitive"?Number(baseCommand.params?.[parameter.key]):baseCommand?.type==="update-extrude"?Number(baseCommand.distance):parameter.value;
  return [-1,1].map((sign,i)=>{const value=Number(((Number.isFinite(base)?base:parameter.value)+sign*edit.amount).toFixed(5));return {id:`internal-dimension-${i}`,label:`${parameter.key} ${value} mm`,origin:"local",rationale:"선택한 내부 치수 조절을 실행했습니다. 미적 의견은 판단 기록으로 유지합니다.",plan:solidParameterPlan(solid,parameter.key,value)};});}
 const command=revision?.command as any,fromCommand=command?.type==="update-spline"?command.spline:command?.type==="create-drawing"?command.params:undefined;
 let fit:(NonNullable<ReturnType<typeof fittedSplineDefinition>>&{space?:FitSpace})|undefined=fromCommand&&validSpline(fromCommand)?fittedSplineDefinition(fromCommand):undefined,target=command?.type==="update-spline"?command.objectId:undefined;
 if(fit)fit.space=fromCommand?.fitSpace==="spatial"?"spatial":"planar";
 if(!fit&&selectionIds.length===1){const source=inspectFittedCurve(document,selectionIds[0]);if(source.plane!==plane)throw Error("Use the source curve work plane for internal refinement.");fit={points:source.points,closed:source.closed,tension:source.tension,continuity:source.continuity,space:source.space};target=selectionIds[0];}
 if(target&&inspectFittedCurve(document,target).plane!==plane)throw Error("Use the source curve work plane for internal refinement.");
 if(!fit)throw Error("기존 fitted spline을 선택하거나 대안 하나를 Review한 뒤 수정하세요.");
 if(!Number.isFinite(edit.amount)||edit.amount<=0||edit.amount>10000)throw Error("Internal edit amount must be 0–10000 mm, excluding zero.");
 const kind=actionFor(edit,feedback);if(fit.continuity==="C2"&&kind==="smooth")throw Error("C2 computes linked tangents; edit points or switch explicitly to C1 before changing tangent strength.");const frame=WORK_PLANES[plane],axisX=frame.xAxis.findIndex(v=>v!==0),axisY=frame.yAxis.findIndex(v=>v!==0),points=fit.points as Vec3[],cx=points.reduce((s,p)=>s+p[axisX],0)/points.length,cy=points.reduce((s,p)=>s+p[axisY],0)/points.length;
 let indices=points.map((_,i)=>i);
 if(marks.length){if(kind==="smooth")throw Error("Tangent is a whole-curve setting. Clear the region marks before changing it.");if(!view||view.id!==plane||marks.some(m=>m.viewId!==plane))throw Error("내부 영역 편집은 현재 2D 작업면에서만 지원합니다.");const source=target?inspectFittedCurve(document,target):undefined;if(source&&(source.transform.rotation.some(v=>Math.abs(v)>1e-8)||source.transform.scale.some(v=>Math.abs(v-1)>1e-8)))throw Error("표시 영역을 쓰는 내부 편집은 이동만 적용된 곡선을 지원합니다. 회전/스케일 곡선은 통과점 번호로 수정하세요.");
  indices=indices.filter(i=>{const translated=points[i].map((n,j)=>n+(source?.transform.translation[j]??0)) as Vec3,[x,y]=worldToPlane(translated,frame),nx=(x-view.bounds[0])/(view.bounds[2]-view.bounds[0]),ny=(view.bounds[3]-y)/(view.bounds[3]-view.bounds[1]);return marks.some(m=>nx>=m.box[0]&&nx<=m.box[0]+m.box[2]&&ny>=m.box[1]&&ny<=m.box[1]+m.box[3]);});if(!indices.length)throw Error("표시 영역 안에 편집 가능한 통과점이 없습니다. 범위를 넓히거나 통과점 번호를 사용하세요.");
 }else if(kind==="inset"||kind==="outset")indices=[points.reduce((best,p,i)=>p[axisX]>points[best][axisX]?i:best,0)];
 if(kind==="point"){if(!Number.isInteger(edit.pointIndex)||edit.pointIndex<0||edit.pointIndex>=points.length||![edit.dx,edit.dy].every(Number.isFinite)||Math.abs(edit.dx)>10000||Math.abs(edit.dy)>10000||edit.dx===0&&edit.dy===0)throw Error("통과점 번호(0부터)와 0이 아닌 유한 이동값을 확인하세요.");if(marks.length&&!indices.includes(edit.pointIndex))throw Error("The chosen fit point is outside the marked region.");indices=[edit.pointIndex];}
 const factors=kind==="point"?[1]:[.8,1,1.2],ids=new Set(indices);
 return factors.map((factor,i)=>{let tension=fit!.tension;const next=points.map((point,index)=>{const p=[...point] as Vec3;if(!ids.has(index))return p;const dx=p[axisX]-cx,dy=p[axisY]-cy,length=Math.hypot(dx,dy),amount=edit.amount*factor;
  if(kind==="point"){p[axisX]+=edit.dx;p[axisY]+=edit.dy;}
  if(kind==="inset"||kind==="outset"){if(length<1e-6)throw Error("중심의 통과점은 방향을 정할 수 없습니다. 통과점 이동을 사용하세요.");const sign=kind==="inset"?-1:1;p[axisX]+=sign*dx/length*amount;p[axisY]+=sign*dy/length*amount;}
  if(kind==="widen")p[axisX]+=Math.sign(dx)*amount/2;
  if(kind==="taller")p[axisY]+=Math.sign(dy)*amount/2;
  return p;
 });if(kind==="smooth")tension=Math.max(.1,Math.min(1.5,fit!.tension+[.05,.1,.15][i]));
 const spline:CadSpline={...fitSpline(next,fit!.closed,tension,fit!.continuity),...fit!.space==="spatial"?{fitSpace:"spatial" as const}:{}},id=`internal-refine-${crypto.randomUUID()}`,plan=target?reshapeFittedCurve(document,selectionIds,target,next,tension):{command:{type:"create-drawing" as const,id,layerId,drawing:"spline" as const,params:{...spline,workPlane:plane}},summary:[`Internal ${kind}: ${indices.length} fit points, ${kind==="point"?`${edit.dx}, ${edit.dy} mm`:kind==="smooth"?`tangent ${tension}`:`${(edit.amount*factor).toFixed(1)} mm`}. Other points and source closure remain unchanged.`],ghosts:[],resultObjectIds:[id]};
 return {id:`internal-${kind}-${i}`,label:`${kind} / ${kind==="point"?`${edit.dx}, ${edit.dy} mm`:kind==="smooth"?`tangent ${tension.toFixed(2)}`:`${(edit.amount*factor).toFixed(1)} mm`}`,origin:"local",rationale:`Agent WebCAD 내부 연산: ${kind}. ${marks.length?"표시 영역의 통과점만 수정합니다.":kind==="inset"||kind==="outset"?"오른쪽 끝 통과점 하나를 중심 방향으로 조절합니다.":"선택한 수치 작업을 실행합니다."} 일반적인 미적 문장은 판단 메모로 유지합니다.`,plan};
 });
}
