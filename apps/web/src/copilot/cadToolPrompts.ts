import {inspectFittedCurve} from "./fittedCurveTools";
import {planArchitecturePrompt} from "./architecturePrompts";
import {planRecipePrompt} from "./copilotPlanning";
import {architecturalScopeIssue} from "./architecturalScope";
import {planSolidPrompt} from "./copilotSolid";
import {splitPlatePreservation} from "./platePrompt";
import type { CadDocument, CadWorkPlaneFrame } from "@agent-webcad/cad-document";
import type { WorkPlaneId } from "../precision/workPlane";
import { createCadToolSession } from "./cadToolSession";
import type { CadToolCall } from "./cadToolContract";
import type { CopilotPlanResult } from "./copilotPlan";

/** Local shortcuts exercise the same registered tools that a gateway discovers and calls. */
export async function planCadToolPrompt(input: string, context: { document: CadDocument; selectionIds: string[]; layerId: string; workPlane: WorkPlaneId }, options: { signal?: AbortSignal; isCurrent?: () => boolean } = {}): Promise<CopilotPlanResult | undefined> {
  const loftEdit=/^선택한\s*(?:로프트|곡면)(?:을|를)?\s*(부드러운\s*곡면|직선\s*연결)(?:으로|로)?\s*(?:바꿔줘|변경|변환)$/i.exec(input.trim());
  if(loftEdit){try{if(context.selectionIds.length!==1)throw Error("변경할 로프트 하나를 선택하세요.");return {ok:true,plan:await createCadToolSession(context,options).plan([{id:"loft-edit",name:"solid.loft.update",arguments:{objectId:context.selectionIds[0],ruled:loftEdit[1].startsWith("직선")}}],options.signal)};}catch(e){options.signal?.throwIfAborted();return {ok:false,reason:e instanceof Error?e.message:String(e)};}}
  options.signal?.throwIfAborted();
  if(options.isCurrent&&!options.isCurrent())throw Error("The CAD planning context changed.");
  const recipe=planRecipePrompt(input);if(recipe)return {ok:true,plan:recipe};
  if(input.trim().startsWith("{")){
    try{const value=JSON.parse(input);if(value.version!==1||!Array.isArray(value.toolCalls)||Object.keys(value).some(k=>!["version","toolCalls"].includes(k)))throw Error("Use {version:1,toolCalls:[advertised CAD tool calls]}. Scripts and raw commands are not supported.");const plan=await createCadToolSession(context,options).plan(value.toolCalls,options.signal);return {ok:true,plan:{...plan,summary:["Designer-supplied structured tool proposal. No model inferred its geometry.",...plan.summary]}};}catch(e){options.signal?.throwIfAborted();return {ok:false,reason:e instanceof Error?e.message:String(e)};}
  }
  const architecture=planArchitecturePrompt(input,context);if(architecture)return architecture;
  const scopeIssue=architecturalScopeIssue(input);if(scopeIssue)return {ok:false,reason:scopeIssue};
  const normalized=input.trim().toLowerCase();
  if(splitPlatePreservation(normalized)||/(?:판|plate)/.test(normalized)&&/(?:구멍|holes?)/.test(normalized)){const solid=planSolidPrompt(input,context.document,context.selectionIds);if(solid)return solid;}
  const text = input.trim().toLowerCase(), id = `model-${crypto.randomUUID().slice(0, 8)}`;
  const calls: CadToolCall[] = [], call = (name: CadToolCall["name"], args: Record<string, unknown>) => calls.push({ id: `step${calls.length}`, name, arguments: args });
  const mm = (value: string, unit?: string) => Number(value) * (unit === "cm" ? 10 : unit === "m" ? 1000 : 1);
  try {
    const rectangle = text.match(/^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:사각형|rectangle)\s*(?:스케치|sketch)(?:\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:돌출|extrude))?$/);
    const extrude = text.match(/^(?:선택한\s*)?(?:윤곽|프로파일|profile|selection)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:돌출|extrude)(?:해줘)?$/);
    const boolean = /^(?:boolean\s*)?(합집합|차집합|교집합|union|cut|intersect)$/.exec(text);
    const hole = text.match(/^(?:윗면|안쪽\s*바닥|앞면)\s*중심에?\s*지름\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:(관통)|깊이\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?)\s*구멍(?:을?\s*(?:만들어줘|추가해줘))?$/);
    const revolve = text.match(/^(?:선택한\s*)?(?:윤곽|프로파일|profile)\s*([xy])\s*축\s*(\d+(?:\.\d+)?)\s*(?:도|°)\s*(?:회전|revolve)$/);
    const sweep = /^(?:선택한\s*)?(?:윤곽과\s*경로\s*)?(?:스윕|sweep)(?:\s*접선\s*정렬)?$/.test(text);
    const loft = text.match(/^(?:선택한\s*)?(?:윤곽\s*)?(직선\s*)?(?:로프트|loft)$/);
    const fillet = text.match(/^수직\s*모서리\s*반지름\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:필렛|fillet)$/);
    const chamfer = text.match(/^수직\s*모서리\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:모따기|chamfer)$/);
    const shell = text.match(/^윗면\s*제거\s*두께\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*(?:셸|쉘|shell)$/);
    const curveContinuity=text.match(/^(?:선택한\s*)?곡선\s*(c[12])\s*연속(?:으로)?\s*변경$/);
    const curveTension=text.match(/^(?:선택한\s*)?곡선\s*접선\s*강도\s*(\d+(?:\.\d+)?)$/);
    const curvePoint=text.match(/^(?:선택한\s*)?(?:맞춤\s*)?곡선\s*(\d+)\s*번\s*점\s*([xyz])\s*([+-]?\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*이동$/);
    if (!rectangle && !extrude && !boolean && !hole && !revolve && !sweep && !loft && !fillet && !chamfer && !shell && !curvePoint && !curveTension && !curveContinuity) {
      if(/곡선.*접선.*강도/.test(text))throw Error("Use 곡선 접선 강도 0.8 with a strength from 0.1 to 1.5.");
      if(/곡선.*점.*이동/.test(text))throw Error("Use an explicit fitted point request: 곡선 4번 점 X -200mm 이동. Point numbers start at 1; deltas use source XYZ, not world axes after placement.");
      if (/(?:스윕|로프트|필렛|모따기|셸|쉘|revolve|sweep|loft|fillet|chamfer|shell)|(?:윤곽|프로파일).*회전/.test(text)) throw new Error("Use an explicit supported modeling request: 선택한 윤곽 Y축 360도 회전; 스윕 (profile, then path); 로프트 (ordered sections); 수직 모서리 반지름 2mm 필렛; 수직 모서리 1mm 모따기; 윗면 제거 두께 2mm 셸.");
      const holeDimension=/^(?:구멍\s*지름|hole\s*diameter|holediameter)(?:을|를)?\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)?\s*(?:로|으로)?\s*(?:바꿔줘|변경해줘|설정해줘|바꿔주세요|변경|설정)?[.!]?$/.test(text);
      if(/(?:스케치|sketch)/.test(text)||/(?:윤곽|프로파일|profile).*(?:돌출|extrude)/.test(text))throw new Error("Use explicit positive sketch/extrusion dimensions, for example 80x50 사각형 스케치 20mm 돌출 or 선택한 윤곽 20mm 돌출. Remove additional conditions and Plan again.");
      if(/(?:구멍|hole)/.test(text)&&!/(?:판|plate)/.test(text)&&!holeDimension)throw new Error("Specify a supported face hole with an explicit diameter and through/blind depth, for example 윗면 중심에 지름 6mm 관통 구멍.");
      return undefined;
    }
    const session = createCadToolSession(context, options);
    if(curveContinuity){if(context.selectionIds.length!==1)throw Error("Select exactly one fitted spline.");const curve=inspectFittedCurve(context.document,context.selectionIds[0]);call("curve.reshape",{objectId:curve.objectId,points:curve.points,tension:1,continuity:curveContinuity[1].toUpperCase()});}
    if(curveTension){if(context.selectionIds.length!==1)throw Error("Select exactly one fitted spline.");const curve=inspectFittedCurve(context.document,context.selectionIds[0]);call("curve.reshape",{objectId:curve.objectId,points:curve.points,tension:Number(curveTension[1])});}
    if(curvePoint){if(context.selectionIds.length!==1)throw Error("Select exactly one fitted spline before adjusting its point.");const delta=[0,0,0];delta["xyz".indexOf(curvePoint[2])]=mm(curvePoint[3],curvePoint[4]);call("curve.adjust",{objectId:context.selectionIds[0],pointIndex:Number(curvePoint[1])-1,delta});}
    if (revolve) call("solid.revolve", {id,profileObjectIds:context.selectionIds,axis:revolve[1],angle:Number(revolve[2])});
    if (sweep) {
      if(context.selectionIds.length!==2) throw new Error("Select the closed profile first, then the open sweep path.");
      call("solid.sweep",{id,profileObjectIds:[context.selectionIds[0]],pathObjectId:context.selectionIds[1],.../접선\s*정렬$/.test(text)?{alignToPath:true}:{}});
    }
    if (loft) call("solid.loft",{id,profileObjectIds:context.selectionIds,ruled:!!loft[1]});
    if (fillet || chamfer) {
      if(context.selectionIds.length!==1) throw new Error("Select one solid before editing edges.");
      const result=await session.read({id:"vertical-edges",name:"cad.edges",arguments:{objectId:context.selectionIds[0]}},options.signal);
      if(!result.ok) throw new Error(result.error);
      const data=result.result as {edges:{key:string;points:number[][]}[];truncated:boolean};
      if(data.truncated) throw new Error("Too many edges for the local shortcut. Query explicit edges instead.");
      const edges=data.edges.filter(edge=>edge.points.length>1 && edge.points.every(p=>Math.hypot(p[0]-edge.points[0][0],p[1]-edge.points[0][1])<1e-6) && Math.abs(edge.points.at(-1)![2]-edge.points[0][2])>1e-6);
      if(!edges.length) throw new Error("No straight world-Z edges were found. Query explicit edges instead.");
      if(fillet) call("solid.fillet",{id,targetId:context.selectionIds[0],edgeKeys:edges.map(e=>e.key),radius:mm(fillet[1],fillet[2])});
      else call("solid.chamfer",{id,targetId:context.selectionIds[0],edgeKeys:edges.map(e=>e.key),distance:mm(chamfer![1],chamfer![2])});
    }
    if (rectangle) {
      call("sketch.create", { id: `${id}-sketch`, plane: context.workPlane });
      call("sketch.rectangle", { id: `${id}-profile`, sketchId: `${id}-sketch`, origin: [0, 0], width: mm(rectangle[1], rectangle[3]), height: mm(rectangle[2], rectangle[3]) });
      if (rectangle[4]) call("solid.extrude", { id, profileObjectIds: [`${id}-profile`], distance: mm(rectangle[4], rectangle[5]) });
    }
    if (extrude) call("solid.extrude", { id, profileObjectIds: context.selectionIds, distance: mm(extrude[1], extrude[2]) });
    if (boolean) {
      if (context.selectionIds.length !== 2) throw new Error("Select two solids in target, tool order. Cut subtracts the second from the first.");
      const operation = ({ 합집합: "union", 차집합: "cut", 교집합: "intersect" } as Record<string, string>)[boolean[1]] ?? boolean[1];
      call("solid.boolean", { id, operation, targetId: context.selectionIds[0], toolId: context.selectionIds[1] });
    }
    if (hole || shell) {
      if (context.selectionIds.length !== 1) throw new Error("Select one solid before choosing its planar face.");
      const result = await session.read({ id: "top-face", name: "cad.faces", arguments: { objectId: context.selectionIds[0] } }, options.signal);
      if (!result.ok) throw new Error(result.error);
      const data = result.result as { faces: { key: string; frame?: CadWorkPlaneFrame }[]; truncated: boolean };
      if (data.truncated) throw new Error("This solid has more faces than the local shortcut can inspect. Use an explicit face query.");
      const floor=!!hole&&/^안쪽\s*바닥/.test(text),front=!!hole&&text.startsWith("앞면"),axis=front?1:2;
      const candidates=data.faces.filter(face=>face.frame&&(front?face.frame.normal[1]<-1+1e-6:face.frame.normal[2]>1-1e-6)).sort((a,b)=>(floor||front?1:-1)*(a.frame!.origin[axis]-b.frame!.origin[axis]));
      if(!candidates.length||candidates[1]&&Math.abs(candidates[0].frame!.origin[axis]-candidates[1].frame!.origin[axis])<.001)throw Error("The requested planar face is missing or ambiguous. Choose an explicit face instead.");
      if(floor&&!candidates.some(face=>face.frame!.origin[2]>candidates[0].frame!.origin[2]+.001))throw Error("No distinct inner floor was found below an upper rim. Select an open enclosure or choose an explicit face.");
      if(hole)call("solid.hole",{id,targetId:context.selectionIds[0],faceKey:candidates[0].key,center:[0,0],diameter:mm(hole[1],hole[2]),through:!!hole[3],...hole[3]?{}:{depth:mm(hole[4],hole[5])}});
      else call("solid.shell",{id,targetId:context.selectionIds[0],faceKeys:[candidates[0].key],thickness:mm(shell![1],shell![2])});
    }
    const plan=await session.plan(calls,options.signal);
    if(hole&&/^안쪽\s*바닥/.test(text))plan.summary.unshift("Inner floor: lowest upward (+Z) planar face below an upper rim; center uses its local frame origin.");
    if(hole&&text.startsWith("앞면"))plan.summary.unshift("Front: outermost planar face facing world −Y; center uses its local frame origin. Positive depth cuts into the material.");
    return {ok:true,plan};
  } catch (error) { options.signal?.throwIfAborted(); return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
}
