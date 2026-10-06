import { useState } from "react";
import type { CopilotPlan } from "./copilotPlan";
import { PropertySection } from "../ui/PropertySection";
import type { CopilotConnection } from "./copilotConnection";
import { CommandReview } from "../ui/CommandReview";
import type { CommandInteraction } from "../state/commandInteraction";

export type CopilotPanelProps = {
  plan: CopilotPlan | null;
  error: string;
  previewFailed: number;
  previewVisible: boolean;
  applying: boolean;
  planning?:boolean;
  canApply: boolean;
  applyDisabledReason?: string;
  interaction?: CommandInteraction;
  onSubmit: (input: string, connection?: CopilotConnection) => void;
  onTogglePreview: () => void;
  onApply: () => void;
  onClear: () => void;
};

const EXAMPLES = ["100x50x30 박스 3개", "100x50 사각형 돌출 20", "반지름 5 높이 20 원기둥", "XZ 평면에 지름 20 원 돌출 15"];

/**
 * Copilot panel: prompt -> plan summary -> ghost preview -> apply.
 * Submit evaluates a detached proposal with the real kernel. Typing never
 * issues geometry work. Apply publishes the validated proposal once and
 * rejects a stale baseline. Ghosts remain temporary viewport objects.
 * The status-bar Cancel button stays the single explicit abort path.
 */
export function CopilotPanel(props: CopilotPanelProps) {
  const [draft, setDraft] = useState("");
  const [connection,setConnection]=useState<CopilotConnection>({mode:"rules",endpoint:"/api/copilot/plan"});

  function submit() {
    if (!draft.trim() || props.applying) return;
    props.onSubmit(draft,connection);
  }

  return (
    <div className="properties-content" data-testid="copilot-panel">
      <div className="inspector-header"><span>Copilot</span><small>{connection.mode==="rules"?"rule-based":"gateway"}</small></div>
      <PropertySection title="Connection" meta="Optional gateway">
        <label>Planner<select aria-label="Copilot planner" value={connection.mode} onChange={e=>{props.onClear();setConnection({...connection,mode:e.target.value as CopilotConnection["mode"]});}}><option value="rules">Local rules</option><option value="gateway">LLM gateway</option></select></label>
        {connection.mode==="gateway"&&<><label>Gateway URL<input aria-label="Copilot gateway URL" value={connection.endpoint} onChange={e=>{props.onClear();setConnection({...connection,endpoint:e.target.value});}}/></label><p className="property-hint">Plan sends your prompt, document identity and up to 50 selected object names/types/references to this gateway. Image bytes and API keys are not included. Configure your provider on the server. Current gateway capabilities: finite 2D drawings and solid primitives, up to 20 commands.</p></>}
      </PropertySection>
      <PropertySection title="Prompt" meta="NL → commands">
        <div className="numeric-control">
          <input
            aria-label="Copilot prompt"
            type="text"
            placeholder="100x50x30 박스 3개…"
            value={draft}
            onChange={(event) => {props.onClear();setDraft(event.target.value);}}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
            }}
          />
        </div>
        <div className="sketch-actions">
          <button type="button" onClick={submit} disabled={!draft.trim() || props.applying}>Plan</button>
          {(props.plan||props.planning) && <button type="button" onClick={props.onClear}>{props.planning?"Cancel request":"Clear"}</button>}
        </div>
        <div className="property-hint">Examples: {EXAMPLES.map((example, index) => (
          <span key={example}>{index > 0 && " · "}<button
            type="button"
            className="copilot-example"
            title={`Try “${example}”`}
            onClick={() => { setDraft(example); props.onSubmit(example,connection); }}
          >{example}</button></span>
        ))}</div>
      </PropertySection>

      {props.error && <div className="inspector-notice inspector-error" role="alert">{props.error}</div>}
      {props.planning&&!props.plan&&<p role="status">Requesting a command proposal… You can cancel or edit the prompt.</p>}
      {props.interaction&&<CommandReview state={props.interaction}/>}

      {props.plan && (
        <PropertySection title="Plan" meta={`${props.plan.ghosts.length} object${props.plan.ghosts.length === 1 ? "" : "s"}`}>
          <ul className="copilot-summary">
            {props.plan.summary.map((line) => <li key={line}>{line}</li>)}
          </ul>
          {props.previewFailed > 0 && (
            <p className="property-hint" role="status">
              {props.previewFailed} of {props.plan.ghosts.length} ghost{props.plan.ghosts.length === 1 ? "" : "s"} failed to preview — Apply will report the kernel reason.
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
          <p className="property-hint">Apply commits one undoable batch. Undo restores everything.</p>
        </PropertySection>
      )}
    </div>
  );
}
