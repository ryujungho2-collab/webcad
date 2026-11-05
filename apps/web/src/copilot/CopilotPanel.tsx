import {ArchitectureReadPanel} from "./ArchitectureReadPanel";
import {CoordinationReviewPanel} from './CoordinationReviewPanel';
import {McpConnectionPanel} from "./McpConnectionPanel";
import type {CadMcpBridgeControls} from "./useCadMcpBridge";
import type { CopilotPlan } from "./copilotPlan";
import { PropertySection } from "../ui/PropertySection";
import type { CopilotConnection } from "./copilotConnection";
import type { CopilotPlanningContext } from "./copilotContext";
import { CommandReview } from "../ui/CommandReview";
import type { CommandInteraction } from "../state/commandInteraction";
import { CopilotQueryPanel, type CopilotQueryPanelProps } from "./CopilotQueryPanel";
import type { CopilotSolidContract } from "./copilotSolid";
import { CAD_TOOLS, type CadToolCall } from "./cadToolContract";
import {SharedCadToolForm} from "./SharedCadToolForm";
import {SharedToolTargets} from "./SharedToolTargets";
import {CopilotConnectionSettings} from "./CopilotConnectionSettings";
import {useEffect,useRef} from "react";
import {CopilotQuestions} from "./CopilotQuestions";
import type {PlanningClarification} from "./copilotPlanning";

export type CopilotPanelProps = {
  clarification?:PlanningClarification|null;
  mcpBridge?:CadMcpBridgeControls;
  onDesignStudy?:()=>void;
  solid?: CopilotSolidContract;
  query: CopilotQueryPanelProps;
  draft: string;
  connection: CopilotConnection;
  requestContext: CopilotPlanningContext | null;
  plan: CopilotPlan | null;
  error: string;
  previewFailed: number;
  previewVisible: boolean;
  applying: boolean;
  planning?:boolean;
  canApply: boolean;
  applyDisabledReason?: string;
  interaction?: CommandInteraction;
  onSubmit: (input: string, connection?: CopilotConnection, toolCalls?:CadToolCall[]) => void;
  onDraftChange: (value: string) => void;
  onConnectionChange: (value: CopilotConnection) => void;
  onTogglePreview: () => void;
  onApply: () => void;
  onClear: () => void;
  onInspectResult: () => void;
  onSelectTargets: (ids:string[])=>void;
  onPrepareFloorPlan?: () => void;
  onFloorTasks?:()=>void;
};

const EXAMPLES = ["가로 100mm, 세로 60mm, 두께 5mm 판에 지름 8mm 구멍 네 개를 각 모서리에서 10mm 안쪽에 만들어줘", "가로를 120mm로 늘려줘. 구멍은 모서리에서 10mm 간격을 유지해줘","80x50 사각형 스케치 20mm 돌출", "윗면 중심에 지름 6mm 관통 구멍", "수직 모서리 반지름 2mm 필렛", "수직 모서리 1mm 모따기", "윗면 제거 두께 2mm 셸", "안쪽 바닥 중심에 지름 8mm 관통 구멍", "앞면 중심에 지름 10mm 깊이 2mm 구멍", "선택한 윤곽 Y축 360도 회전", "스윕", "직선 로프트", "합집합", "폭을 100mm로 바꿔줘"];

/**
 * Copilot panel: prompt -> plan summary -> ghost preview -> apply.
 * Submit evaluates a detached proposal with the real kernel. Typing never
 * issues geometry work. Apply publishes the validated proposal once and
 * rejects a stale baseline. Ghosts remain temporary viewport objects.
 * Draft and connection settings live above the activity panel so navigation
 * does not discard an unfinished request or its editable input.
 */
export function CopilotPanel(props: CopilotPanelProps) {
  const reviewRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(props.plan)reviewRef.current?.scrollIntoView({block:"nearest"});},[props.plan]);
  function submit() {
    if (!props.draft.trim() || props.applying) return;
    props.onSubmit(props.draft,props.connection);
  }

  return (
    <div className="properties-content" data-testid="copilot-panel">
      <div className="inspector-header"><span>Copilot</span><small>{props.connection.mode==="rules"?"internal":"optional model"}</small></div>
      {props.mcpBridge&&<McpConnectionPanel bridge={props.mcpBridge}/>}
      <PropertySection title="Shared tools" meta="Form · natural language · MCP" defaultOpen={false}>
        {props.onSelectTargets&&<SharedToolTargets ids={props.query.selectionIds??[]} disabled={props.applying||!!props.planning} onSelect={props.onSelectTargets}/>}
        <SharedCadToolForm selectionIds={props.query.selectionIds??[]} solid={props.solid} disabled={props.applying||!!props.planning} onChange={props.onClear} onSwapTargets={()=>props.onSelectTargets([...(props.query.selectionIds??[])].reverse())} onReview={calls=>props.onSubmit(`Tool form · ${calls[0].name}`,props.connection,calls)}/>
      </PropertySection>
      {props.onDesignStudy&&<PropertySection title="Design study" meta="Intent · alternatives · feedback"><p className="property-hint">State confirmed requirements and assumptions, mark a CAD view, compare actual alternatives and preserve important objects. Apply only the selected result as one Undo.</p><button disabled={props.applying} onClick={props.onDesignStudy}>Open design study…</button></PropertySection>}
      {props.connection.mode==="rules"&&<PropertySection title="Native architecture" meta="벽 · 개구부 · 실제 단면" defaultOpen={false}><div className="copilot-query architecture-commands"><p className="property-hint">실제 벽/바닥 원본과 BRep 평단면을 사용합니다. 개구부 중심은 벽 시작점부터의 거리입니다. 수정은 연결 도면과 함께 검토하며 한 Undo로 적용합니다.</p>{["벽 시작 0,0 끝 6000,0 두께 200 높이 3000","선택한 벽 문 추가 중심 1500 폭 900 높이 2100","선택한 벽 창 추가 중심 4200 폭 1800 높이 1200 창턱 900","선택한 벽 문 폭 1200","선택한 벽 높이 3300","선택한 윤곽 바닥 레벨 0 두께 200","선택한 부재 평면 높이 1200","선택한 부재 단면 XZ 위치 0","선택한 부재 도면 갱신"].map(example=><button key={example} disabled={props.applying||props.planning} onClick={()=>{props.onClear();props.onDraftChange(example);}}>{example}</button>)}<p className="property-hint">버튼은 입력만 준비합니다. 치수·대상을 확인하고 Plan → Review → Apply하세요. 독립 butt 벽과 직선 host 개구부 범위이며 자동 코너 접합·방 배치·피난 적합성 판정은 아닙니다.</p></div></PropertySection>}
      {props.onPrepareFloorPlan&&<PropertySection title="Floor plan workflow" meta="Guided import">
        <p className="property-hint">Prepare a DXF reference: choose wall/opening layers, verify units and base point, then review and import as one Undo. This file stays local.</p>
        <button type="button" aria-label="Prepare floor plan DXF" disabled={props.applying} onClick={props.onPrepareFloorPlan}>Prepare floor plan…</button>
        {props.onFloorTasks&&<button type="button" disabled={props.applying} onClick={props.onFloorTasks}>Clean / Make face…</button>}
      </PropertySection>}
      <CopilotQueryPanel {...props.query}/>
      <ArchitectureReadPanel selectionIds={props.query.selectionIds}/>
      <CoordinationReviewPanel selectionIds={props.query.selectionIds} onSelect={props.onSelectTargets}/>
      <PropertySection title="CAD tools" meta="Query · model · review" defaultOpen={false}>
        <p className="property-hint">Inspect objects, measurements and planar faces, then build a proposal with the same modeling tools. Existing inputs must be selected; newly created results can feed the next step. A whole proposal applies as one Undo.</p>
        {props.connection.mode==="rules"&&<details><summary>Structured CAD proposal / 도구 제안 입력</summary><p className="property-hint">설계자가 정한 좌표·치수를 도구로 작성합니다. 자동 공간 설계가 아닙니다. 최대 20개 도구·64 KiB이며 Review 후 한 Undo로 적용합니다.</p><textarea aria-label="Structured CAD tool proposal" rows={7} value={props.draft} disabled={props.applying||props.planning} onChange={e=>{props.onClear();props.onDraftChange(e.target.value);}} placeholder={'{"version":1,"toolCalls":[...]}'} style={{width:"100%",boxSizing:"border-box"}}/><button disabled={!props.draft.trim()||props.applying||props.planning} onClick={submit}>Review structured tools</button></details>}
        <ul>{Object.values(CAD_TOOLS).map(tool=><li key={tool.label}>{tool.label}</li>)}</ul>
        <p className="property-hint">For Boolean cut, select the target first and the tool second. Hole centers use the chosen face's local axes. The local top-face shortcut uses that face's center.</p>
      </PropertySection>
      {props.solid?.targetId&&<PropertySection title="Selected solid dimensions" meta="mm">
        <p className="property-hint">{props.solid.name}. Choose a dimension to draft a follow-up request; edit the value and Plan.</p>
        <div aria-label="Editable solid dimensions">{props.solid.parameters.map(parameter=>{
          const label=parameter.key.replace(/^plate_[a-f0-9]{32}_/, "");
          return <button key={parameter.key} type="button" disabled={props.applying} onClick={()=>{props.onClear();props.onDraftChange(`${label} ${parameter.value}mm`);}}>{label} · {parameter.value} mm</button>;
        })}</div>
      </PropertySection>}
      <PropertySection title="Connection" meta="Optional gateway">
        <CopilotConnectionSettings value={props.connection} disabled={props.applying} onChange={value=>{props.onClear();props.onConnectionChange(value);}}/>
      </PropertySection>
      <PropertySection title="Prompt" meta="NL → commands">
        <p className="property-hint">의도 → 치수·대상 확인 → 질문/명시된 기본값 → CAD 연산 → 실제 미리보기 → Apply</p>
        <div aria-label="CAD recipe examples">{["핀 지름 6mm 길이 30mm", "통풍 덮개 가로 100mm 세로 70mm 두께 3mm 중심 여백 12mm 구멍 지름 6mm 행 3 열 5", "통풍 덮개"].map(example=><button key={example} type="button" disabled={props.applying||props.planning} onClick={()=>{props.onClear();props.onDraftChange(example);}}>{example}</button>)}</div>
        <div className="numeric-control">
          <input
            aria-label="Copilot prompt"
            type="text"
            placeholder="100x50x30 박스 3개…"
            value={props.draft}
            onChange={(event) => {props.onClear();props.onDraftChange(event.target.value);}}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
            }}
          />
        </div>
        <div className="sketch-actions">
          <button type="button" onClick={submit} disabled={!props.draft.trim() || props.applying}>Plan</button>
          {(props.plan||props.planning) && <button type="button" onClick={props.onClear}>{props.planning?"Cancel request":props.applying?"Cancel apply":"Clear"}</button>}
        </div>
        <div className="property-hint">Examples: {EXAMPLES.map((example, index) => (
          <span key={example}>{index > 0 && " · "}<button
            type="button"
            className="copilot-example"
            title={`Try “${example}”`}
            onClick={() => { props.onDraftChange(example); props.onSubmit(example,props.connection); }}
          >{example}</button></span>
        ))}</div>
        {props.connection.mode==="rules"&&<p className="property-hint">The four-hole plate uses a constrained XY sketch and named dimensions. After Apply, its solid stays selected: change width, depth, thickness, margin or hole diameter in a follow-up request. All lengths default to mm. This is a limited local language grammar, not a connected language model. Additional features require a separate supported tool.</p>}
      </PropertySection>

      {props.error && <div className="inspector-notice inspector-error" role="alert">{props.error}</div>}
      {props.clarification&&<CopilotQuestions key={JSON.stringify(props.clarification)} clarification={props.clarification} prompt={props.draft} disabled={props.applying||!!props.planning} onCancel={props.onClear} onContinue={input=>{props.onClear();props.onDraftChange(input);props.onSubmit(input,props.connection);}}/>}
      {props.requestContext && <div className="property-hint" aria-label="Copilot request context">
        <strong>Planned context:</strong> {props.requestContext.version.documentId} · {props.requestContext.workPlane} · {props.requestContext.layerName} · {props.requestContext.selectionIds.length} selected
        {props.requestContext.selectionNames.length>0 && <span> ({props.requestContext.selectionNames.slice(0,3).join(", ")}{props.requestContext.selectionNames.length>3?", …":""})</span>}
      </div>}
      {props.planning&&!props.plan&&<p role="status">Requesting a command proposal… You can cancel or edit the prompt.</p>}
      {props.interaction&&<CommandReview state={props.interaction}/>}
      {!!props.interaction?.completedIds?.length && <div className="property-hint" aria-label="Copilot result">
        Completed on {props.interaction.completedIds.length} object{props.interaction.completedIds.length===1?"":"s"}. The results are selected for the next edit.
        <button type="button" onClick={props.onInspectResult}>Inspect result</button>
      </div>}

      {props.plan && (
        <div ref={reviewRef} aria-label="Shared proposal review"><PropertySection title="Plan" keepOpen meta={props.plan.command.type==="move-object"?"Move · 1 target":`${props.plan.ghosts.length} object${props.plan.ghosts.length === 1 ? "" : "s"}`}>
          {props.plan.command.type==="move-object"&&<p className="property-hint">Canvas: amber = source, teal = reviewed result. Translation is an absolute world placement in mm; shape coordinates are preserved. Review affected relationships below.</p>}
          <ul className="copilot-summary">
            {props.plan.summary.map((line) => <li key={line}>{line}</li>)}
          </ul>
          {!!props.plan.toolSteps?.length&&<details aria-label="CAD tool steps"><summary>{props.plan.toolSteps.length} query/model steps</summary><ol>{props.plan.toolSteps.map((step,index)=><li key={index}>{step}</li>)}</ol></details>}
          {props.previewFailed > 0 && (
            <p className="property-hint" role="status">
              {props.previewFailed} of {props.plan.ghosts.length} ghost{props.plan.ghosts.length === 1 ? "" : "s"} failed to preview. Apply is blocked. Correct the request and Plan again.
            </p>
          )}
          <div className="sketch-actions">
            <button
              type="button"
              aria-pressed={props.previewVisible}
              title={props.previewVisible ? "Hide ghost preview" : "Show ghost preview"}
              onClick={props.onTogglePreview}
            >{props.previewVisible ? "Hide preview" : "Show preview"}</button>
            <button
              type="button"
              title={props.applyDisabledReason ?? "Apply plan as one undoable batch"}
              disabled={!props.canApply}
              onClick={props.onApply}
            >{props.planning?"Validating…":props.applying ? "Applying…" : "Apply"}</button>
          </div>
          {props.applyDisabledReason && <p className="property-hint">{props.applyDisabledReason}</p>}
          <p className="property-hint">Apply commits one undoable batch. Cancel stops it before publication; Undo restores a completed result.</p>
        </PropertySection></div>
      )}
    </div>
  );
}
