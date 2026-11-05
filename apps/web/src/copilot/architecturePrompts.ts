import type {ArchitectureWall,CadDocument} from "@agent-webcad/cad-document";
import type {WorkPlaneId} from "../precision/workPlane";
import {validateCadToolCalls,type CadToolCall} from "./cadToolContract";
import type {CopilotPlanResult} from "./copilotPlan";
import {planArchitectureTools} from "./architectureTools";
import {wallMovePlan,type WallMoveAxis} from "./wallMovePlan";

type Context={document:CadDocument;selectionIds:string[];layerId:string;workPlane:WorkPlaneId};
/** Bounded local grammar for the native tools, with no model and no silent room-layout interpretation. */
export function planArchitecturePrompt(input:string,context:Context):CopilotPlanResult|undefined{
 const text=input.trim(),n="([+-]?\\d+(?:\\.\\d+)?)",len=`${n}\\s*(mm|cm|m)?`,unit=(v:string,u?:string)=>Number(v)*(u==="m"?1000:u==="cm"?10:1),id=`arch-${crypto.randomUUID().slice(0,8)}`;
 const wall=new RegExp(`^벽\\s*시작\\s*${n}\\s*,\\s*${n}\\s*끝\\s*${n}\\s*,\\s*${n}\\s*두께\\s*${len}\\s*높이\\s*${len}(?:\\s*레벨\\s*${len})?$`).exec(text);
 const opening=new RegExp(`^선택한\\s*벽\\s*(문|창)\\s*추가\\s*중심\\s*${len}\\s*폭\\s*${len}\\s*높이\\s*${len}(?:\\s*창턱\\s*${len})?$`).exec(text);
 const resize=new RegExp(`^선택한\\s*벽\\s*(문|창)\\s*폭\\s*${len}$`).exec(text);
 const dimension=new RegExp(`^선택한\\s*벽\\s*(높이|두께)\\s*${len}$`).exec(text);
 const slab=new RegExp(`^선택한\\s*윤곽\\s*(바닥|천장)\\s*레벨\\s*${len}\\s*두께\\s*${len}$`).exec(text);
 const plan=new RegExp(`^선택한\\s*부재\\s*평면\\s*높이\\s*${len}$`).exec(text);
 const section=new RegExp(`^선택한\\s*부재\\s*단면\\s*(XY|XZ|YZ)\\s*위치\\s*${len}$`,"i").exec(text);
 const refresh=/^선택한\s*부재\s*도면\s*(갱신|재연결)$/.test(text);
 const move=/^선택한\s*벽\s*(X|Y|Z|길이|직각|왼쪽|오른쪽)(?:\s*방향)?(?:으로|로)?\s*([+-]?\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*이동(?:해줘)?$/i.exec(text);
 if(move){try{if(context.selectionIds.length!==1)throw Error("이동할 벽 하나를 선택하세요.");const axis:WallMoveAxis=/^[xyz]$/i.test(move[1])?move[1].toUpperCase() as WallMoveAxis:move[1]==="길이"?"along":"normal";return {ok:true,plan:wallMovePlan(context.document,context.selectionIds[0],axis,unit(move[2],move[3]?.toLowerCase())*(move[1]==="오른쪽"?-1:1))};}catch(e){return {ok:false,reason:e instanceof Error?e.message:String(e)};}}
 if(!wall&&!opening&&!resize&&!dimension&&!slab&&!plan&&!section&&!refresh){
  if(/^벽\s*시작|^선택한\s*벽|^선택한\s*부재\s*(평면|단면|도면)|^선택한\s*윤곽\s*(바닥|천장)/.test(text))return {ok:false,reason:"지원 문법을 명확히 입력하세요: 벽 시작 0,0 끝 6000,0 두께 200 높이 3000; 선택한 벽 문 추가 중심 1500 폭 900 높이 2100; 선택한 벽 문 폭 1200; 선택한 부재 평면 높이 1200. 좌표는 XY mm, 길이는 mm/cm/m입니다."};
  return;
 }
 try{
  const calls:CadToolCall[]=[],add=(name:CadToolCall["name"],args:Record<string,unknown>)=>calls.push({id:`step${calls.length}`,name,arguments:args});
  const selectedWall=()=>{if(context.selectionIds.length!==1)throw Error("벽 하나를 선택하세요.");const objectId=context.selectionIds[0],f=Object.values(context.document.features).find(f=>f.output===objectId),definition=f?.params.architecturalWall as ArchitectureWall|undefined;if(!definition)throw Error("일반 박스가 아니라 native 벽을 선택하세요.");return {objectId,definition};};
  if(wall)add("wall.create",{id,start:[Number(wall[1]),Number(wall[2])],end:[Number(wall[3]),Number(wall[4])],thickness:unit(wall[5],wall[6]),height:unit(wall[7],wall[8]),baseLevel:wall[9]?unit(wall[9],wall[10]):0,openings:[]});
  if(opening){const {objectId}=selectedWall(),kind=opening[1]==="문"?"door":"window";if(kind==="window"&&!opening[8])throw Error("창은 창턱 높이를 명시하세요. 예: 선택한 벽 창 추가 중심 3000 폭 1800 높이 1200 창턱 900");if(kind==="door"&&opening[8]&&unit(opening[8],opening[9])!==0)throw Error("문 창턱은 0이어야 합니다.");add("wall.opening",{objectId,opening:{id,kind,side:"left",along:unit(opening[2],opening[3]),width:unit(opening[4],opening[5]),height:unit(opening[6],opening[7]),sill:opening[8]?unit(opening[8],opening[9]):0},refreshDrawings:true});}
  if(resize){const {objectId,definition}=selectedWall(),kind=resize[1]==="문"?"door":"window",matches=definition.openings.filter(o=>o.kind===kind);if(matches.length!==1)throw Error("해당 종류의 개구부가 정확히 하나여야 합니다. 여러 개면 cad.architecture로 ID를 확인하고 wall.opening 도구로 명시하세요.");add("wall.opening",{objectId,opening:{...matches[0],width:unit(resize[2],resize[3])},refreshDrawings:true});}
  if(dimension){const {objectId,definition}=selectedWall();add("wall.update",{objectId,height:dimension[1]==="높이"?unit(dimension[2],dimension[3]):definition.height,thickness:dimension[1]==="두께"?unit(dimension[2],dimension[3]):definition.thickness,baseLevel:definition.baseLevel,refreshDrawings:true});}
  if(slab)add("slab.create",{id,profileObjectIds:context.selectionIds,kind:slab[1]==="바닥"?"floor":"ceiling",level:unit(slab[2],slab[3]),thickness:unit(slab[4],slab[5])});
  if(plan||section){if(!context.selectionIds.length)throw Error("자를 실제 솔리드 부재를 먼저 선택하세요.");add("drawing.section",{id,name:plan?"Copilot / actual plan":"Copilot / actual section",objectIds:context.selectionIds,basis:plan?"XY":section![1].toUpperCase(),height:plan?unit(plan[1],plan[2]):unit(section![2],section![3]),origin:plan?[0,-6000]:[8000,-6000],scale:1});}
  if(refresh)add("drawing.refresh",{objectIds:context.selectionIds});
  const result=planArchitectureTools(validateCadToolCalls(calls),context);if(!result)throw Error("No architectural plan.");return {ok:true,plan:result};
 }catch(e){return {ok:false,reason:e instanceof Error?e.message:String(e)};}
}
